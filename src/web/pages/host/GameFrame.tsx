// R7-21: one frame for every live state on the iPad (board, category introduction, clue): a
// header line, the 16:9 game preview and a reserved control bar. Header and bar have a fixed
// height (the bar is taller in portrait, where there is room), so the preview keeps the same size
// and position whatever happens; host-only extras sit in compact overlays inside the preview.
import type { ReactNode } from 'react';
import { FitBox } from './TvMirror';

export function GameFrame({
  head,
  preview,
  overlay,
  bar,
  boxTestId,
  testId,
}: {
  head: ReactNode;
  preview: (size: { w: number; h: number }) => ReactNode;
  overlay?: ReactNode;
  bar: ReactNode;
  /** Test id of the 16:9 preview box (the same box in every state). */
  boxTestId: string;
  testId?: string;
}) {
  return (
    <div className="@container flex h-full min-h-[420px] flex-col gap-2" data-testid={testId}>
      <div className="flex h-12 shrink-0 items-center gap-3 overflow-hidden" data-testid="game-head">
        {head}
      </div>
      <FitBox align="start" boxClassName="game-preview" testId={boxTestId}>
        {(size) => (
          <>
            {preview(size)}
            {overlay}
          </>
        )}
      </FitBox>
      {/* Not a scroller: menus such as the clue's More open upward out of it (its content is sized to fit). */}
      <div className="relative z-20 h-32 shrink-0 portrait:h-52" data-testid="game-bar">
        {bar}
      </div>
    </div>
  );
}
