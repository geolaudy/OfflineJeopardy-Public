// R7-21 / R10-6 / R11-3: one frame for every live state on the host controller (board, category
// introduction, clue, Final), in three stacked parts that span its whole width:
//  1. the top strip (fixed height): the red correct-response band, or what is happening,
//  2. the TV's blue presentation at exactly the TV's proportions (its screen without the score
//     strip), scaled uniformly and centred — extra room becomes blue at the sides (or, full screen,
//     above and below); nothing is stretched or cropped,
//  3. the control band (fixed height) where the TV has its score strip: the timer line, the next
//     step, and the Fullscreen / Exit button.
// The same layout serves the embedded and the full-screen view — only the space it gets differs —
// so the preview never moves or changes size while the game goes on. R12-3 / R12-5: full screen,
// the frame fills the screen edge to edge between the blue top bar (menu, Options, minimise —
// Live.tsx) and the score cards; its band is a little taller and has no Fullscreen button. Controls that need more room
// than the band grow downward into free space below (embedded portrait), else upward over the blue
// area — never sideways.
import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { HOST_BAND, themeRoot } from '../board/common';
import { cx } from '../../components/ui';
import { useBoardLook, useSize } from './TvMirror';
import { TimerLine } from '../board/TimerBar';
import type { TimerState } from '../../../shared/game';

/** Width ÷ height of the TV's presentation area (its 16:9 screen minus the score strip). */
export const STAGE_ASPECT = 16 / 9 / (1 - HOST_BAND);
/** Heights (px) of the top strip and the control band (full screen: a taller band, R12-5). */
export const STRIP_H = 88;
export const BAND_H = 80;
export const BAND_H_FS = 92;
/** R12-3: full screen on a short screen (a phone in landscape): a thinner strip and band, and no
 *  top bar — the menu, Options and minimise sit at the ends of the band. */
export const STRIP_H_COMPACT = 60;
export const BAND_H_COMPACT = 64;
/** Room (px) under the frame from which the controls grow downward instead of upward. */
const ROOM_BELOW = 96;

/** R11-3: the host controller's full-screen state (provided by the live screen). */
export const HostFullscreenCtx = createContext<{ on: boolean; toggle: () => void; compact?: boolean; corners?: { left: ReactNode; right: ReactNode } }>({ on: false, toggle: () => {} });

/** The frame's geometry for an available area — shared by the embedded and full-screen views. */
export function frameLayout(aw: number, ah: number, fill: boolean, band = BAND_H, strip = STRIP_H) {
  const midMax = Math.max(0, ah - strip - band);
  let sw = aw;
  let sh = aw / STAGE_ASPECT;
  if (sh > midMax) {
    sh = midMax;
    sw = sh * STAGE_ASPECT;
  }
  sw = Math.floor(sw);
  sh = Math.floor(sh);
  const midH = fill ? midMax : sh;
  return { sw, sh, midH, band, strip, height: strip + midH + band, stageLeft: Math.floor((aw - sw) / 2), stageTop: strip + Math.floor((midH - sh) / 2) };
}

export function GameFrame({
  top,
  preview,
  overlay,
  bar,
  boxTestId,
  testId,
  timer,
}: {
  /** The top strip: the correct-response band, or a status line. */
  top?: ReactNode;
  /** The TV presentation, sized \`w\` × \`h\` (the TV's proportions). */
  preview: (size: { w: number; h: number }) => ReactNode;
  overlay?: ReactNode;
  /** The host's controls, in the band at the bottom. */
  bar: ReactNode;
  /** Test id of the frame (the same box in every state). */
  boxTestId: string;
  testId?: string;
  /** R11-4: the game timer, shown as a thin line along the top of the control band. */
  timer?: TimerState | null;
}) {
  const fs = useContext(HostFullscreenCtx);
  const ref = useRef<HTMLDivElement>(null);
  const { w: aw, h: ah } = useSize(ref);
  // The TV's theme variables (fonts, colours) for the frame — never a custom background picture.
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const vars = Object.fromEntries(Object.entries(root.style ?? {}).filter(([k]) => k.startsWith('--')));
  const compact = fs.on && !!fs.compact;
  const L = frameLayout(aw, ah, fs.on, compact ? BAND_H_COMPACT : fs.on ? BAND_H_FS : BAND_H, compact ? STRIP_H_COMPACT : STRIP_H);
  const down = !fs.on && ah - L.height >= ROOM_BELOW;
  // Compact full screen: the menu / Options / minimise buttons sit in the blue beside the TV picture
  // when there is room for them there (a wide, short screen), else at the ends of the band.
  const sideCorners = compact && L.stageLeft >= 64;
  return (
    <div ref={ref} className={cx('@container relative h-full w-full', !fs.on && 'min-h-[320px]')} data-testid={testId}>
      {L.sw > 0 && L.sh > 0 && (
        <div
          className="board-theme host-frame-theme game-preview absolute inset-x-0 top-0"
          data-theme={root.dataTheme}
          style={{ ...vars, height: L.height, '--band': `${L.band}px`, '--strip': `${L.strip}px` } as CSSProperties}
          data-band={L.band}
          data-compact={compact ? 'true' : undefined}
          data-testid={boxTestId}
          data-fullscreen={fs.on ? 'true' : 'false'}
        >
          <div className="host-strip host-dark absolute inset-x-0 top-0 flex flex-col" style={{ height: L.strip }} data-testid="game-strip">
            {top}
          </div>
          {/* The blue presentation area: the TV's own background, the TV content centred in it. */}
          <div className="board-theme absolute inset-x-0" data-theme={root.dataTheme} style={{ ...root.style, top: L.strip, height: L.midH }} aria-hidden />
          {/* A soft edge, so the TV picture reads as a screen set into the blue around it. */}
          <div className="absolute overflow-hidden shadow-[0_0_24px_rgba(0,0,0,0.45)]" style={{ left: L.stageLeft, top: L.stageTop, width: L.sw, height: L.sh }} data-testid="game-stage">
            {preview({ w: L.sw, h: L.sh })}
          </div>
          {overlay}
          {sideCorners && fs.corners && (
            <>
              <div className="absolute z-30" style={{ top: L.strip + 8, left: 'max(8px, env(safe-area-inset-left))' }} data-testid="fs-corner-left">
                {fs.corners.left}
              </div>
              <div className="absolute z-30 flex flex-col items-end gap-2" style={{ top: L.strip + 8, right: 'max(8px, env(safe-area-inset-right))' }} data-testid="fs-corner-right">
                {fs.corners.right}
              </div>
            </>
          )}
          <div
            className="host-band host-dark absolute inset-x-0 z-20 flex items-center gap-2"
            style={down ? { top: L.height - L.band, minHeight: L.band } : { bottom: 0, minHeight: L.band }}
            data-testid="game-bar"
            data-grow={down ? 'down' : 'up'}
          >
            <TimerLine timer={timer ?? null} />
            {/* R11-3.7: the controls are centred vertically in the band. */}
            {compact && !sideCorners && fs.corners?.left}
            <div className="min-w-0 flex-1">{bar}</div>
            {compact && !sideCorners && fs.corners?.right}
            {/* Full screen: minimise is at the top right of the screen (R12-5). */}
            {!fs.on && <FullscreenButton />}
          </div>
        </div>
      )}
    </div>
  );
}

/** R11-3.1 / R12-5: Fullscreen Preview (right end of the embedded band) / Exit Fullscreen (top right
 *  of the full screen, Live.tsx) — one button, so the mode is always clear and always reversible. */
export function FullscreenButton({ className }: { className?: string }) {
  const fs = useContext(HostFullscreenCtx);
  const label = fs.on ? 'Exit Fullscreen' : 'Fullscreen Preview';
  return (
    <button
      type="button"
      onClick={fs.toggle}
      className={cx('host-icon-btn h-14 w-14 shrink-0', className)}
      aria-label={label}
      title={label}
      aria-pressed={fs.on}
      data-testid="fullscreen-toggle"
    >
      {fs.on ? <Minimize2 size={24} aria-hidden /> : <Maximize2 size={24} aria-hidden />}
    </button>
  );
}
