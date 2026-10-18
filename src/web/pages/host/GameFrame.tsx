// R7-21 / R10-6 / R11-3: one frame for every live state on the host controller (board, category
// introduction, clue, Final), in three stacked parts that span its whole width:
//  1. the top strip (fixed height): the red correct-response band, or what is happening,
//  2. the TV's blue presentation at exactly the TV's proportions (its screen without the score
//     strip), scaled uniformly and centred — extra room becomes blue at the sides (or, full screen,
//     above and below); nothing is stretched or cropped,
//  3. the control band (fixed height) where the TV has its score strip: the timer line, the next
//     step, and the Fullscreen / Exit button.
// The same layout serves the embedded and the full-screen view — only the space it gets differs —
// so the preview never moves or changes size while the game goes on. Controls that need more room
// than the band grow downward into free space below (embedded portrait), else upward over the blue
// area — never sideways.
import { createContext, useContext, useRef, type CSSProperties, type ReactNode } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { HOST_BAND, themeRoot } from '../board/common';
import { useBoardLook, useSize } from './TvMirror';
import { TimerLine } from '../board/TimerBar';
import type { TimerState } from '../../../shared/game';

/** Width ÷ height of the TV's presentation area (its 16:9 screen minus the score strip). */
export const STAGE_ASPECT = 16 / 9 / (1 - HOST_BAND);
/** Heights (px) of the top strip and the control band. */
export const STRIP_H = 88;
export const BAND_H = 80;
/** Room (px) under the frame from which the controls grow downward instead of upward. */
const ROOM_BELOW = 96;

/** R11-3: the host controller's full-screen state (provided by the live screen). */
export const HostFullscreenCtx = createContext<{ on: boolean; toggle: () => void }>({ on: false, toggle: () => {} });

/** The frame's geometry for an available area — shared by the embedded and full-screen views. */
export function frameLayout(aw: number, ah: number, fill: boolean) {
  const midMax = Math.max(0, ah - STRIP_H - BAND_H);
  let sw = aw;
  let sh = aw / STAGE_ASPECT;
  if (sh > midMax) {
    sh = midMax;
    sw = sh * STAGE_ASPECT;
  }
  sw = Math.floor(sw);
  sh = Math.floor(sh);
  const midH = fill ? midMax : sh;
  return { sw, sh, midH, height: STRIP_H + midH + BAND_H, stageLeft: Math.floor((aw - sw) / 2), stageTop: STRIP_H + Math.floor((midH - sh) / 2) };
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
  const L = frameLayout(aw, ah, fs.on);
  const down = !fs.on && ah - L.height >= ROOM_BELOW;
  return (
    <div ref={ref} className="@container relative h-full min-h-[320px] w-full" data-testid={testId}>
      {L.sw > 0 && L.sh > 0 && (
        <div
          className="board-theme host-frame-theme game-preview absolute inset-x-0 top-0"
          data-theme={root.dataTheme}
          style={{ ...vars, height: L.height, '--band': `${BAND_H}px`, '--strip': `${STRIP_H}px` } as CSSProperties}
          data-testid={boxTestId}
          data-fullscreen={fs.on ? 'true' : 'false'}
        >
          <div className="host-strip host-dark absolute inset-x-0 top-0 flex flex-col" style={{ height: STRIP_H }} data-testid="game-strip">
            {top}
          </div>
          {/* The blue presentation area: the TV's own background, the TV content centred in it. */}
          <div className="board-theme absolute inset-x-0" data-theme={root.dataTheme} style={{ ...root.style, top: STRIP_H, height: L.midH }} aria-hidden />
          {/* A soft edge, so the TV picture reads as a screen set into the blue around it. */}
          <div className="absolute overflow-hidden shadow-[0_0_24px_rgba(0,0,0,0.45)]" style={{ left: L.stageLeft, top: L.stageTop, width: L.sw, height: L.sh }} data-testid="game-stage">
            {preview({ w: L.sw, h: L.sh })}
          </div>
          {overlay}
          <div
            className="host-band host-dark absolute inset-x-0 z-20 flex items-center gap-2"
            style={down ? { top: L.height - BAND_H, minHeight: BAND_H } : { bottom: 0, minHeight: BAND_H }}
            data-testid="game-bar"
            data-grow={down ? 'down' : 'up'}
          >
            <TimerLine timer={timer ?? null} />
            {/* R11-3.7: the controls are centred vertically in the band. */}
            <div className="min-w-0 flex-1">{bar}</div>
            <FullscreenButton />
          </div>
        </div>
      )}
    </div>
  );
}

/** R11-3.1: Fullscreen Preview / Exit Fullscreen, always at the right end of the control band. */
function FullscreenButton() {
  const fs = useContext(HostFullscreenCtx);
  const label = fs.on ? 'Exit Fullscreen' : 'Fullscreen Preview';
  return (
    <button
      type="button"
      onClick={fs.toggle}
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-white/30 active:bg-white/20"
      aria-label={label}
      title={label}
      aria-pressed={fs.on}
      data-testid="fullscreen-toggle"
    >
      {fs.on ? <Minimize2 size={24} aria-hidden /> : <Maximize2 size={24} aria-hidden />}
    </button>
  );
}
