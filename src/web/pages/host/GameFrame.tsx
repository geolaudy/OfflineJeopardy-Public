// R13-1 / R13-2: the one frame of the host's live screen — the same component, the same layout and
// the same TV preview in the embedded view and in full screen (only the space it gets differs).
// Top to bottom, across its whole width:
//  1. the header row (fixed height): the menu (full screen), what the stage puts there (the red
//     correct-response strip, who is choosing, the category introduction), Options and the
//     Fullscreen / minimise button — always at the right end, in both views,
//  2. the TV's blue presentation at exactly the TV's proportions (its screen without the score
//     strip), as wide as the screen allows and scaled uniformly; any extra height becomes blue
//     above and below it — nothing is stretched or cropped,
//  3. the control band (fixed height, grows upward over the picture when its controls need more),
//  4. the score cards, which take the height that is left (within limits) so no space is wasted.
// The frame and the TV preview stay mounted for the whole game; the board, introduction, clue and
// Final stages render into its slots (FrameParts, through portals). The preview is therefore one
// TV page that plays the TV's own animations (board fill-in, clue zoom) and never restarts when
// the stage or the view changes (R13-13).
import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { HOST_BAND, themeRoot } from '../board/common';
import { cx } from '../../components/ui';
import { useBoardLook, useSize, type PreviewTile } from './TvMirror';
import { EASE_IN_OUT, EASE_OUT, T } from '../board/timing';
import { TimerLine } from '../board/TimerBar';
import type { TimerState } from '../../../shared/game';

/** Width ÷ height of the TV's presentation area (its 16:9 screen minus the score strip). */
export const STAGE_ASPECT = 16 / 9 / (1 - HOST_BAND);
/** Heights (px) of the header row and the control band; short screens (phones in landscape) get
 *  the compact sizes. */
export const HEAD_H = 64;
/** R14-25 / R15-11: room for the large main actions (4.1rem). Header + band + the score section's
 *  minimum (with the iPad's home-indicator area under it) keep a full-screen iPad Pro 11 picture
 *  edge to edge: 64 + 76 + 95 + 20 ≤ 834 − 1194 ÷ STAGE_ASPECT. */
export const BAND_H = 76;
export const HEAD_H_COMPACT = 50;
export const BAND_H_COMPACT = 62;
/** Score cards (R14-2): the height of one of the (at most) two rows (px, min … max) — the section is
 *  always two rows high, whatever the number of players, and one row of up to six cards uses all of
 *  it — the gap between cards, the width a card should have to sit centred between two Undo-wide
 *  columns (host-tv.css .host-scores-grid: 8.5rem), the widest card, the Undo column, the row's own
 *  padding (host-tv.css .host-scores-row: 4 px above and below) and the section's top border, and
 *  the width under which a card leaves out the picture. */
const CARD = { min: 40, max: 76, minCompact: 34, maxCompact: 40, gap: 6, pad: 8, border: 1, w: 150, wCompact: 118, wMax: 300, undo: 136, chrome: 36, noPic: 128 };
/** Cards in one row (R14-2: 12 players = two rows of six). */
export const CARDS_PER_ROW = 6;

export type FrameKind = 'board' | 'intro' | 'clue' | 'final';
/** Test ids per stage (the frame is the same element in every stage). */
const IDS: Record<FrameKind, { box: string; test?: string; preview: string }> = {
  board: { box: 'host-board-box', preview: 'board-preview' },
  intro: { box: 'intro-preview-box', test: 'intro-controls', preview: 'intro-preview' },
  clue: { box: 'clue-preview-box', test: 'clue-panel', preview: 'clue-preview' },
  final: { box: 'final-preview-box', test: 'final-control', preview: 'final-preview' },
};

/** R11-3: the host controller's full-screen state (provided by the live screen). */
export const HostFullscreenCtx = createContext<{ on: boolean; toggle: () => void; compact?: boolean }>({ on: false, toggle: () => {} });

/**
 * How the score cards are laid out (R14-2): up to six in one row, seven to twelve in two rows; the
 * section's height range does not depend on the number of players (two rows' worth), so more
 * players make the cards narrower and lower, never the section taller. The cards stay centred under
 * the game (an Undo-wide column at both ends) while they keep a comfortable width; otherwise the
 * left column is given to the cards too (`wide`).
 */
export function scoreGrid(aw: number, n: number, compact: boolean, safeBottom = 0) {
  const rows = n > CARDS_PER_ROW ? 2 : 1;
  const inRow = Math.max(1, Math.ceil(n / rows));
  const wantW = compact ? CARD.wCompact : CARD.w;
  const across = (room: number) => Math.floor((room - (inRow - 1) * CARD.gap) / inRow);
  const sym = aw >= 640 ? across(aw - 2 * CARD.undo - CARD.chrome) : 0; // host-tv.css: one Undo column below 40rem
  const wide = sym < Math.min(wantW, across(aw - CARD.undo - CARD.chrome));
  const fit = Math.max(60, wide ? across(aw - CARD.undo - CARD.chrome) : sym);
  const cardW = Math.min(CARD.wMax, fit);
  const lo = compact ? CARD.minCompact : CARD.min;
  const hi = compact ? CARD.maxCompact : CARD.max;
  // R15-11: the section's height holds the cards, the row's padding, its top border and the
  // screen's bottom safe area (the iPad's home indicator, the section's bottom padding) — the safe
  // area used to come out of the cards' height, which clipped every card at the top and bottom on a
  // real iPad (emulators have no safe areas), whatever the number of players.
  const chrome = CARD.pad + CARD.border + safeBottom;
  const span = (h: number) => 2 * h + CARD.gap + chrome;
  return { rows, wide, cardW, minW: cardW, pic: cardW >= CARD.noPic, min: span(lo), max: span(hi), cardH: (h: number) => Math.floor((h - chrome - (rows - 1) * CARD.gap) / rows) };
}

/** The frame's geometry below the header for an available area (shared by both views). */
export function frameLayout(aw: number, ah: number, band: number, scores: { min: number; max: number }) {
  const midMax = Math.max(0, ah - band - scores.min);
  let sw = aw;
  let sh = aw / STAGE_ASPECT;
  if (sh > midMax) {
    sh = midMax;
    sw = sh * STAGE_ASPECT;
  }
  sw = Math.floor(sw);
  sh = Math.floor(sh);
  const scoresH = Math.floor(Math.max(scores.min, Math.min(scores.max, ah - band - sh)));
  const midH = Math.max(sh, ah - band - scoresH);
  return { sw, sh, midH, band, scoresH, stageLeft: Math.floor((aw - sw) / 2), stageTop: Math.floor((midH - sh) / 2) };
}

/**
 * R14-8 / R14-24: how far the header's buttons reach in from each edge (`--head-l` / `--head-r`, px,
 * safe areas included), written straight onto the header. The red correct-response strip spans the
 * whole header and keeps its middle column centred on the header (not between the menu and the much
 * wider Options + Fullscreen group), with the category and the value the same distance from their
 * buttons.
 */
function useHeadEnds(head: RefObject<HTMLElement | null>, start: RefObject<HTMLElement | null>, end: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const h = head.current;
    if (!h) return;
    const read = () => {
      const b = h.getBoundingClientRect();
      const s = start.current?.getBoundingClientRect();
      const e = end.current?.getBoundingClientRect();
      h.style.setProperty('--head-l', `${Math.round(s && s.width ? s.right - b.left : 0)}px`);
      h.style.setProperty('--head-r', `${Math.round(e && e.width ? b.right - e.left : 0)}px`);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    for (const el of [h, start.current, end.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [head, start, end]);
}

/**
 * R15-11: the screen's bottom safe area (px) — what the score section keeps clear under the cards
 * (env(safe-area-inset-bottom) through --safe-bottom, styles.css; a test can set the variable).
 */
function useSafeBottom() {
  const [v, setV] = useState(0);
  useLayoutEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:var(--safe-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const read = () => setV(probe.offsetHeight);
    read();
    window.addEventListener('resize', read);
    window.visualViewport?.addEventListener('resize', read);
    const t = setInterval(read, 2000); // a rotation or a test changing the variable
    return () => {
      clearInterval(t);
      window.removeEventListener('resize', read);
      window.visualViewport?.removeEventListener('resize', read);
      probe.remove();
    };
  }, []);
  return v;
}

/**
 * R14-6 / R15-14 … R15-16: the presentation area around the TV picture continues the stage. A base
 * layer in the board's own background (the classic theme's black grid, another theme's background)
 * and over it the clue panel's surface (its colour and grain, the grain lined up with the picture's)
 * during a clue or the Final. The panel layer moves with the TV: when a clue zooms out of its tile
 * the layer opens from that tile's place to the whole area in the zoom's time and curve, so the
 * surroundings fill in with the zoom instead of changing colour before it; on the way back it closes
 * into the tile with the TV's shrink. The Final fades in (as on the TV).
 */
function StageFill({ kind, root, height, stage, tiles, clueId, reduced }: { kind: FrameKind; root: ReturnType<typeof themeRoot>; height: number; stage: { left: number; top: number; scale: number }; tiles: PreviewTile[]; clueId: string | null; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const known = useRef<PreviewTile[]>(tiles);
  if (tiles.some((t) => t.kind !== 'final')) known.current = tiles;
  const panelKind = (k: FrameKind) => k === 'clue' || k === 'final';
  const [on, setOn] = useState(panelKind(kind));
  const prev = useRef({ kind, clueId });
  const geo = useRef(stage);
  geo.current = stage;
  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { kind, clueId };
    const want = panelKind(kind);
    const el = ref.current;
    if (want === panelKind(was.kind)) return setOn(want);
    setOn(true);
    if (!el || typeof el.animate !== 'function' || reduced) return setOn(want);
    // The tile the clue zooms out of (opening) or back into (closing), in this layer's pixels.
    const id = want ? clueId : was.clueId;
    const t = id ? known.current.find((x) => x.id === id) : undefined;
    const g = geo.current;
    const W = el.offsetWidth;
    const H = el.offsetHeight;
    const tile = t && W > 0 && H > 0 ? (() => {
      const x = g.left + t.x * g.scale;
      const y = g.top + t.y * g.scale;
      return `inset(${y}px ${W - x - t.w * g.scale}px ${H - y - t.h * g.scale}px ${x}px)`;
    })() : null;
    const full = 'inset(0px 0px 0px 0px)';
    let a: Animation;
    if (want) {
      a = kind === 'clue' && tile ? el.animate([{ clipPath: tile }, { clipPath: full }], { duration: T.zoom * 1000, easing: EASE_OUT }) : el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.fade * 1000, easing: 'linear' });
    } else {
      a = was.kind === 'clue' && tile && kind === 'board'
        ? el.animate(
            [
              { clipPath: full, opacity: 1 },
              { clipPath: tile, opacity: 1, offset: 0.8 },
              { clipPath: tile, opacity: 0 },
            ],
            { duration: T.unzoom * 1000, delay: T.fadeOut * 600, easing: EASE_IN_OUT, fill: 'both' },
          )
        : el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * 1000, fill: 'both' });
      a.onfinish = () => setOn(false);
    }
    return () => a.cancel();
  }, [kind, clueId, reduced]);
  return (
    <div className="board-theme host-stage-bg absolute inset-x-0 top-0" data-theme={root.dataTheme} style={{ ...root.style, height }} aria-hidden data-testid="host-stage-bg">
      <div
        ref={ref}
        className="host-stage-panel absolute inset-0"
        // The panel's grain at the preview's scale, starting where the picture starts (R15-16).
        style={{ opacity: on ? undefined : 0, '--grain': `${Math.max(32, Math.round(256 * stage.scale))}px`, '--grain-at': `${Math.round(stage.left)}px ${Math.round(stage.top)}px` } as CSSProperties}
        data-on={on ? 'true' : 'false'}
        data-testid="host-stage-panel"
      />
    </div>
  );
}

/** The header's two grounds (host-tv.css --host-navy-1 / --host-red-1). */
const HEAD_NAVY = '#181e52';
const HEAD_RED = '#b01f1f';

/**
 * R14-10: in full screen the area above the header — the iPad's status bar in the Home Screen app,
 * Safari's top bar where it tints from `theme-color` — takes the header's colour: the page's root
 * background and the theme colour follow the header (navy, or red with the correct-response strip)
 * while full screen is on, and are put back when it ends. Embedded, nothing changes (no extra strip
 * above the controller). The system draws the status bar itself; where iPadOS ignores both, the
 * header still starts below it (--safe-top).
 */
function useStatusBarColour(on: boolean, head: RefObject<HTMLElement | null>) {
  const saved = useRef<{ bg: string; theme: string | null } | null>(null);
  useLayoutEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!on) {
      if (saved.current) {
        document.documentElement.style.background = saved.current.bg;
        document.documentElement.style.removeProperty('--status-bg');
        if (meta && saved.current.theme != null) meta.content = saved.current.theme;
        saved.current = null;
      }
      return;
    }
    saved.current ??= { bg: document.documentElement.style.background, theme: meta?.content ?? null };
    const colour = head.current?.querySelector('.host-answer-band') ? HEAD_RED : HEAD_NAVY;
    document.documentElement.style.background = colour;
    document.documentElement.style.setProperty('--status-bg', colour);
    if (meta && meta.content !== colour) meta.content = colour;
  });
  useLayoutEffect(
    () => () => {
      const s = saved.current;
      if (!s) return;
      document.documentElement.style.background = s.bg;
      document.documentElement.style.removeProperty('--status-bg');
      const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
      if (meta && s.theme != null) meta.content = s.theme;
    },
    [],
  );
}

interface Slots {
  head: HTMLElement | null;
  bar: HTMLElement | null;
  stage: HTMLElement | null;
  overlay: HTMLElement | null;
  /** The TV picture's size (px). */
  size: { w: number; h: number };
}
const SlotCtx = createContext<Slots | null>(null);

export function GameFrame({
  kind,
  preview,
  scores,
  scoreCount,
  start,
  end,
  timer,
  tiles = [],
  clueId = null,
  children,
}: {
  kind: FrameKind;
  /** The current stage: it fills the frame's slots through FrameParts. */
  children?: ReactNode;
  /** The TV presentation, sized `w` × `h` (the TV's proportions) — mounted once for the game. */
  preview: (size: { w: number; h: number }, testId: string) => ReactNode;
  /** The score cards, given the card size the frame worked out. */
  scores: (m: { cardW: number; cardH: number; cardMin: number; rows: number; wide: boolean; pic: boolean }) => ReactNode;
  scoreCount: number;
  /** Header ends: the menu (full screen) and Options + Fullscreen / minimise. */
  start?: ReactNode;
  end?: ReactNode;
  /** R11-4: the game timer, shown as a thin line along the top of the control band. */
  timer?: TimerState | null;
  /** R15-15: the preview's board tiles and the open clue, so the surroundings follow the clue zoom. */
  tiles?: PreviewTile[];
  clueId?: string | null;
}) {
  const fs = useContext(HostFullscreenCtx);
  const compact = !!fs.compact;
  const ids = IDS[kind];
  // The whole frame and the header are measured; what is left under the header is laid out here.
  const ref = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  useHeadEnds(headRef, startRef, endRef);
  useStatusBarColour(fs.on, headRef);
  const { w: aw, h: total } = useSize(ref);
  const { h: headH } = useSize(headRef);
  const ah = Math.max(0, total - headH);
  const [head, setHead] = useState<HTMLElement | null>(null);
  const [bar, setBar] = useState<HTMLElement | null>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [overlay, setOverlay] = useState<HTMLElement | null>(null);
  // The TV's theme variables (fonts, colours) for the frame — never a custom background picture.
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const vars = Object.fromEntries(Object.entries(root.style ?? {}).filter(([k]) => k.startsWith('--')));
  const safeBottom = useSafeBottom();
  const grid = scoreGrid(aw, scoreCount, compact, safeBottom);
  const L = frameLayout(aw, ah, compact ? BAND_H_COMPACT : BAND_H, grid);
  const slots: Slots = { head, bar, stage, overlay, size: { w: L.sw, h: L.sh } };
  return (
    <SlotCtx.Provider value={slots}>
      <div
        ref={ref}
        // Embedded on a very short screen the frame keeps a usable minimum (the page scrolls); never
        // more than a phone's landscape height, so full screen is never smaller than embedded.
        className={cx('board-theme host-frame-theme host-frame flex h-full w-full flex-col overflow-hidden', !fs.on && 'min-h-[320px]')}
        data-theme={root.dataTheme}
        style={{ ...vars, '--head': `${compact ? HEAD_H_COMPACT : HEAD_H}px` } as CSSProperties}
        data-kind={kind}
        data-compact={compact ? 'true' : undefined}
      >
        {/* The stage's test id covers the header, the picture and the band (not the score cards). */}
        <div className="flex flex-none flex-col" data-testid={ids.test}>
          <header ref={headRef} className="host-head host-dark" data-testid="game-strip">
            <div ref={startRef} className="host-head-start">
              {start}
            </div>
            <div ref={setHead} className="host-head-main" />
            <div ref={endRef} className="host-head-end">
              {end}
            </div>
          </header>
          {L.sw > 0 && L.sh > 0 && (
            <div
              className="game-preview relative"
              // --below: the band under the picture, for panels over the picture.
              style={{ height: L.midH + L.band, '--below': `${L.band}px`, '--band': `${L.band}px` } as CSSProperties}
              data-band={L.band}
              data-testid={ids.box}
              data-fullscreen={fs.on ? 'true' : 'false'}
            >
              {/* The presentation area around the TV picture (R14-6, R15-14): it continues the
                  stage's own background, so the picture has no visible edge (host-tv.css). */}
              <StageFill kind={kind} root={root} height={L.midH} stage={{ left: L.stageLeft, top: L.stageTop, scale: L.sw / 1280 }} tiles={tiles} clueId={clueId} reduced={!!look.reducedMotion} />
              <div className="absolute overflow-hidden" style={{ left: L.stageLeft, top: L.stageTop, width: L.sw, height: L.sh }} data-testid="game-stage">
                {preview({ w: L.sw, h: L.sh }, ids.preview)}
                <div ref={setStage} className="contents" />
              </div>
              <div ref={setOverlay} className="contents" />
              <div className="host-band host-dark absolute inset-x-0 bottom-0 z-20 flex items-center gap-2" style={{ minHeight: L.band }} data-testid="game-bar" data-grow="up">
                <TimerLine timer={timer ?? null} />
                {/* R11-3.7: the controls are centred vertically in the band. */}
                <div ref={setBar} className="min-w-0 flex-1" />
              </div>
            </div>
          )}
        </div>
        {L.sw > 0 && L.sh > 0 && (
          <div className="flex-none" style={{ height: L.scoresH }}>
            {scores({ cardW: grid.cardW, cardH: grid.cardH(L.scoresH), cardMin: grid.minW, rows: grid.rows, wide: grid.wide, pic: grid.pic })}
          </div>
        )}
        {children}
      </div>
    </SlotCtx.Provider>
  );
}

/** A stage's parts of the frame: the header content, the band's controls, panels over the picture
 *  (`overlay`, positioned in the frame) and things on the picture itself (`stage`, given its size). */
export function FrameParts({ head, bar, overlay, stage }: { head?: ReactNode; bar?: ReactNode; overlay?: ReactNode; stage?: (size: { w: number; h: number }) => ReactNode }) {
  const s = useContext(SlotCtx);
  if (!s) return null;
  return (
    <>
      {s.head && head != null && createPortal(head, s.head)}
      {s.bar && bar != null && createPortal(bar, s.bar)}
      {s.overlay && overlay != null && overlay !== false && createPortal(overlay, s.overlay)}
      {s.stage && stage && createPortal(stage(s.size), s.stage)}
    </>
  );
}

/** R11-3.1 / R13-2: Fullscreen Preview / Exit Fullscreen — one button at the right end of the
 *  header in both views, so it never moves; only its icon changes. */
export function FullscreenButton({ className }: { className?: string }) {
  const fs = useContext(HostFullscreenCtx);
  const label = fs.on ? 'Exit Fullscreen' : 'Fullscreen Preview';
  return (
    <button type="button" onClick={fs.toggle} className={cx('host-icon-btn', className)} aria-label={label} title={label} aria-pressed={fs.on} data-testid="fullscreen-toggle">
      {fs.on ? <Minimize2 size={26} strokeWidth={2.4} aria-hidden /> : <Maximize2 size={26} strokeWidth={2.4} aria-hidden />}
    </button>
  );
}
