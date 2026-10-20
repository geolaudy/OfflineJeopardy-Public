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
import { createContext, useContext, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2 } from 'lucide-react';
import { HOST_BAND, themeRoot } from '../board/common';
import { cx } from '../../components/ui';
import { useBoardLook, useSize } from './TvMirror';
import { TimerLine } from '../board/TimerBar';
import type { TimerState } from '../../../shared/game';

/** Width ÷ height of the TV's presentation area (its 16:9 screen minus the score strip). */
export const STAGE_ASPECT = 16 / 9 / (1 - HOST_BAND);
/** Heights (px) of the header row and the control band; short screens (phones in landscape) get
 *  the compact sizes. */
export const HEAD_H = 68;
export const BAND_H = 72;
export const HEAD_H_COMPACT = 50;
export const BAND_H_COMPACT = 56;
/** Score cards: height of one row (px, min … max), the gap between cards, the width a card needs
 *  at least / at most, the Undo column (host-tv.css .host-scores-grid: 8.5rem, kept at both ends so
 *  the cards stay centred) and the row's own padding and gaps. */
const CARD = { min: 60, max: 100, minCompact: 46, maxCompact: 58, gap: 8, pad: 12, w: 150, wCompact: 118, wMax: 260, undo: 136, chrome: 36 };

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

/** How the score cards are laid out: rows, card size, and the row's height range. */
export function scoreGrid(aw: number, n: number, compact: boolean) {
  const narrow = aw < 640; // host-tv.css: Undo only at the right end below 40rem
  const room = Math.max(0, aw - (narrow ? 1 : 2) * CARD.undo - CARD.chrome);
  const wantW = compact ? CARD.wCompact : CARD.w;
  const perRow = Math.max(1, Math.floor((room + CARD.gap) / (wantW + CARD.gap)));
  // At most three rows: beyond that the cards get narrower instead (names truncate sooner).
  const rows = Math.max(1, Math.min(3, Math.ceil(n / perRow)));
  const inRow = Math.max(1, Math.ceil(n / rows));
  const fit = Math.floor((room - (inRow - 1) * CARD.gap) / inRow);
  const minW = Math.max(80, Math.min(wantW, fit));
  const cardW = Math.max(minW, Math.min(CARD.wMax, fit));
  const lo = compact ? CARD.minCompact : CARD.min;
  const hi = compact ? CARD.maxCompact : CARD.max;
  const span = (h: number) => rows * h + (rows - 1) * CARD.gap + CARD.pad;
  return { rows, cardW, minW, min: span(lo), max: span(hi), cardH: (h: number) => Math.floor((h - CARD.pad - (rows - 1) * CARD.gap) / rows) };
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
  children,
}: {
  kind: FrameKind;
  /** The current stage: it fills the frame's slots through FrameParts. */
  children?: ReactNode;
  /** The TV presentation, sized `w` × `h` (the TV's proportions) — mounted once for the game. */
  preview: (size: { w: number; h: number }, testId: string) => ReactNode;
  /** The score cards, given the card size the frame worked out. */
  scores: (m: { cardW: number; cardH: number; cardMin: number; rows: number }) => ReactNode;
  scoreCount: number;
  /** Header ends: the menu (full screen) and Options + Fullscreen / minimise. */
  start?: ReactNode;
  end?: ReactNode;
  /** R11-4: the game timer, shown as a thin line along the top of the control band. */
  timer?: TimerState | null;
}) {
  const fs = useContext(HostFullscreenCtx);
  const compact = !!fs.compact;
  const ids = IDS[kind];
  // The whole frame and the header are measured; what is left under the header is laid out here.
  const ref = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);
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
  const grid = scoreGrid(aw, scoreCount, compact);
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
            {start}
            <div ref={setHead} className="host-head-main" />
            <div className="host-head-end">{end}</div>
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
              {/* The blue presentation area: the TV's own background, the TV picture centred in it. */}
              <div className="board-theme absolute inset-x-0 top-0" data-theme={root.dataTheme} style={{ ...root.style, height: L.midH }} aria-hidden />
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
            {scores({ cardW: grid.cardW, cardH: grid.cardH(L.scoresH), cardMin: grid.minW, rows: grid.rows })}
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
