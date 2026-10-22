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
import { useBoardLook, useSize } from './TvMirror';
import { T } from '../board/timing';
import { classicPanelSurface, type Bleed, type Box } from '../board/panelSurface';
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
 * and over it the clue panel's surface during a clue, the Final and the categories of the category
 * introduction (R17-17).
 *
 * R16-17: one surface with the picture — the classic panel's grain and its gradient (the radial
 * glows and the diagonal shade, board.css --bt-panel) are drawn in the picture's own coordinates
 * across the whole area, so they run on past the picture's edges instead of stopping there.
 * R17-17: one zoom with the picture. The TV's clue panel in the preview carries that same surface
 * past the picture's edges (its bleed, board.css `.is-host-preview .bt-panel::before`), and the
 * whole surface starts on the tile (ClueZoom tileTransform). Inside the picture the blue is
 * therefore the panel itself; around it, this layer shows the same surface clipped to where the
 * panel's transform puts the area's edges. This is not a second animation made to look alike: the
 * preview hands over its zoom animation (ClueZoom → TvMirror: 'oj-preview-zoom'), and the clip here
 * is built keyframe for keyframe from the TV animation's own keyframes, with its timing, on its
 * start time (the two pages' timelines differ only by their origins). Without a report (another
 * theme's fade, reduced motion) it fades, like the TV. The introduction and the Final fade too.
 */
type StageGeo = { left: number; top: number; scale: number };
export type PreviewZoom = { clueId: string; dir: 'open' | 'close'; panel: Box; animation: Animation };

/** Where the area's edges are (as a clip of the W × H area) while the TV panel carries `transform`
 *  (origin 0 0): the edges as points of the panel's surface, moved by that transform. `P` is the
 *  panel's box in the preview's pixels, `g` the preview's place in the area and its scale. */
function areaClip(transform: string | undefined, P: Box, g: StageGeo, W: number, H: number) {
  const m = !transform || transform === 'none' ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(transform);
  const x0 = -g.left / g.scale - P.x;
  const x1 = (W - g.left) / g.scale - P.x;
  const y0 = -g.top / g.scale - P.y;
  const y1 = (H - g.top) / g.scale - P.y;
  const hx = (x: number) => g.left + g.scale * (P.x + m.a * x + m.e);
  const hy = (y: number) => g.top + g.scale * (P.y + m.d * y + m.f);
  const px = (v: number) => `${Math.max(0, v).toFixed(2)}px`;
  return `inset(${px(hy(y0))} ${px(W - hx(x1))} ${px(H - hy(y1))} ${px(hx(x0))})`;
}

/** The surroundings' share of the TV panel's zoom: its keyframes as clips of the area (and its
 *  opacity), its timing, and its start time moved onto this page's timeline. */
function followZoom(el: HTMLElement, z: PreviewZoom, g: StageGeo): Animation | null {
  const tv = z.animation;
  const effect = tv.effect as KeyframeEffect | null;
  if (!effect || tv.playState === 'idle' || tv.playState === 'finished' || !(g.scale > 0)) return null;
  const W = el.offsetWidth;
  const H = el.offsetHeight;
  const frames = effect.getKeyframes().map((k) => {
    const f: Keyframe = { offset: k.computedOffset, easing: k.easing, clipPath: areaClip(k.transform as string | undefined, z.panel, g, W, H) };
    if (k.opacity != null) f.opacity = k.opacity;
    return f;
  });
  const { duration, delay, easing, fill } = effect.getTiming();
  const a = el.animate(frames, { duration, delay, easing, fill });
  const sync = () => {
    const tvNow = tv.timeline?.currentTime;
    const now = document.timeline.currentTime;
    if (tv.startTime == null || tvNow == null || now == null) return false;
    a.startTime = Number(tv.startTime) + (Number(now) - Number(tvNow));
    return true;
  };
  if (!sync()) {
    // The TV's animation starts with its next frame: hold at its current point until then.
    a.pause();
    a.currentTime = Number(tv.currentTime ?? 0);
    tv.ready.then(
      () => {
        if (a.playState !== 'idle') sync();
      },
      () => a.cancel(),
    );
  }
  return a;
}

/** The TV panel's box in the fill's pixels: the preview's stage (its screen without the score strip). */
const pictureBox = (g: StageGeo): Box => ({ x: g.left, y: g.top, w: 1280 * g.scale, h: 720 * (1 - HOST_BAND) * g.scale });

function StageFill({ panel, kind, root, width, height, stage, clueId, reduced }: { panel: boolean; kind: FrameKind; root: ReturnType<typeof themeRoot>; width: number; height: number; stage: StageGeo; clueId: string | null; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(panel);
  const prev = useRef({ panel, kind, clueId });
  const geo = useRef(stage);
  geo.current = stage;
  const lastZoom = useRef<(PreviewZoom & { at: number }) | null>(null);
  const waiting = useRef<{ dir: 'open' | 'close'; clueId: string; run: (z: PreviewZoom | null) => void } | null>(null);

  useLayoutEffect(() => {
    const onZoom = (e: Event) => {
      const z = (e as CustomEvent<PreviewZoom>).detail;
      lastZoom.current = { ...z, at: performance.now() };
      const w = waiting.current;
      if (w && w.dir === z.dir && w.clueId === z.clueId) w.run(z);
    };
    window.addEventListener('oj-preview-zoom', onZoom);
    return () => window.removeEventListener('oj-preview-zoom', onZoom);
  }, []);

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { panel, kind, clueId };
    const el = ref.current;
    if (panel === was.panel) return setOn(panel);
    if (!el || typeof el.animate !== 'function' || reduced) return setOn(panel);
    const id = panel ? clueId : was.clueId;
    const zooms = !!id && (panel ? kind === 'clue' : was.kind === 'clue' && kind === 'board');
    let a: Animation | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = (z: PreviewZoom | null) => {
      waiting.current = null;
      if (timer) clearTimeout(timer);
      a = z ? followZoom(el, z, geo.current) : null;
      if (panel) {
        el.style.opacity = '';
        setOn(true);
        a ??= el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.fade * 1000, easing: 'linear' });
      } else {
        a ??= el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * 1000, fill: 'both' });
        a.onfinish = () => setOn(false);
      }
    };
    if (!zooms) run(null);
    else {
      const dir = panel ? 'open' : 'close';
      const z = lastZoom.current;
      if (z && z.dir === dir && z.clueId === id && performance.now() - z.at < 400) run(z);
      else {
        // Until the preview's own zoom starts, an opening clue's surface is not shown yet and a
        // closing clue's stays.
        if (panel) el.style.opacity = '0';
        else setOn(true);
        waiting.current = { dir, clueId: id!, run };
        timer = setTimeout(() => run(null), 400);
      }
    }
    return () => {
      waiting.current = null;
      if (timer) clearTimeout(timer);
      a?.cancel();
    };
  }, [panel, kind, clueId, reduced]);
  const classic = root.dataTheme === 'classic';
  const grain = Math.max(32, Math.round(256 * stage.scale));
  return (
    <div className="board-theme host-stage-bg absolute inset-x-0 top-0" data-theme={root.dataTheme} style={{ ...root.style, height }} aria-hidden data-testid="host-stage-bg">
      <div
        ref={ref}
        className="host-stage-panel absolute inset-0"
        // R15-16 / R16-17: the classic panel's grain and gradient, lined up with the picture's.
        style={{ opacity: on ? undefined : 0, ...(classic && width > 0 ? { background: classicPanelSurface(pictureBox(stage), width, height, grain) } : {}) }}
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
        if (meta && saved.current.theme != null) meta.content = saved.current.theme;
        saved.current = null;
      }
      return;
    }
    saved.current ??= { bg: document.documentElement.style.background, theme: meta?.content ?? null };
    const colour = head.current?.querySelector('.host-answer-band') ? HEAD_RED : HEAD_NAVY;
    document.documentElement.style.background = colour;
    if (meta && meta.content !== colour) meta.content = colour;
  });
  useLayoutEffect(
    () => () => {
      const s = saved.current;
      if (!s) return;
      document.documentElement.style.background = s.bg;
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
  panel = kind === 'clue' || kind === 'final',
  clueId = null,
  children,
}: {
  kind: FrameKind;
  /** The current stage: it fills the frame's slots through FrameParts. */
  children?: ReactNode;
  /** The TV presentation, sized `w` × `h` (the TV's proportions) — mounted once for the game. */
  preview: (size: { w: number; h: number; bleed: Bleed }, testId: string) => ReactNode;
  /** The score cards, given the card size the frame worked out. */
  scores: (m: { cardW: number; cardH: number; cardMin: number; rows: number; wide: boolean; pic: boolean }) => ReactNode;
  scoreCount: number;
  /** Header ends: the menu (full screen) and Options + Fullscreen / minimise. */
  start?: ReactNode;
  end?: ReactNode;
  /** R11-4: the game timer, shown as a thin line along the top of the control band. */
  timer?: TimerState | null;
  /** The stage shows the clue panel's surface (a clue, the Final, R17-17 the introduction's
   *  categories): the area around the picture takes it too. */
  panel?: boolean;
  /** The open clue, so the surroundings follow its zoom. */
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
              <StageFill panel={panel} kind={kind} root={root} width={aw} height={L.midH} stage={{ left: L.stageLeft, top: L.stageTop, scale: L.sw / 1280 }} clueId={clueId} reduced={!!look.reducedMotion} />
              <div className="absolute overflow-hidden" style={{ left: L.stageLeft, top: L.stageTop, width: L.sw, height: L.sh }} data-testid="game-stage">
                {/* R17-17: how far the area runs on past the picture — the TV panel's surface continues into it. */}
                {preview({ w: L.sw, h: L.sh, bleed: { t: L.stageTop, r: aw - L.stageLeft - L.sw, b: L.midH - L.stageTop - L.sh, l: L.stageLeft } }, ids.preview)}
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
