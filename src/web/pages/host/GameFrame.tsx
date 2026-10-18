// R7-21 / R10-6: one frame for every live state on the iPad (board, category introduction, clue,
// Final): the TV preview as large as the space allows, always 16:9 — the TV's whole screen. Where
// the TV has its score strip (HOST_BAND of the height) the host's controls sit instead, inside the
// preview's width; the private answer band and host-only extras overlay the preview. Nothing
// outside the preview takes its room, so it keeps the same size and position whatever happens.
// When the controls need more room than the band they grow downward into free space below the
// preview (portrait), else upward over the clue area — never sideways.
import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../../components/ui';
import { HOST_BAND, themeRoot } from '../board/common';
import { FitBox, useBoardLook } from './TvMirror';

/** Room (px) under the preview from which the controls grow downward instead of upward. */
const ROOM_BELOW = 96;

export function GameFrame({
  preview,
  overlay,
  bar,
  boxTestId,
  testId,
}: {
  /** The TV preview, sized `w` × `h`; `stage` = the height above the control band. */
  preview: (size: { w: number; h: number; stage: number }) => ReactNode;
  overlay?: ReactNode;
  /** The host's controls, in the band at the bottom of the preview. */
  bar: ReactNode;
  /** Test id of the 16:9 preview box (the same box in every state). */
  boxTestId: string;
  testId?: string;
}) {
  // The TV's theme variables (fonts, colours) for the band — never a custom background picture.
  const look = useBoardLook();
  const root = themeRoot(look.theme, look.custom);
  const vars = Object.fromEntries(Object.entries(root.style ?? {}).filter(([k]) => k.startsWith('--')));
  return (
    <div className="@container flex h-full min-h-[320px] flex-col" data-testid={testId}>
      <FitBox align="start" boxClassName="game-preview" testId={boxTestId}>
        {({ w, h, ah }) => {
          const band = Math.round(h * HOST_BAND);
          const down = ah - h >= ROOM_BELOW;
          return (
            <div className="board-theme host-frame-theme absolute inset-0" data-theme={root.dataTheme} style={{ ...vars, '--band': `${band}px` } as CSSProperties}>
              {preview({ w, h, stage: h - band })}
              {/* The band's own ground (the TV's score strip colour), under the controls. */}
              <div className="host-band-ground absolute inset-x-0 bottom-0" style={{ height: band }} aria-hidden />
              {overlay}
              <div
                className={cx('host-band absolute inset-x-0 z-20 flex', down ? 'items-start' : 'items-end')}
                style={down ? { top: h - band, minHeight: band } : { bottom: 0, minHeight: band }}
                data-testid="game-bar"
                data-grow={down ? 'down' : 'up'}
              >
                <div className="w-full min-w-0">{bar}</div>
              </div>
            </div>
          );
        }}
      </FitBox>
    </div>
  );
}
