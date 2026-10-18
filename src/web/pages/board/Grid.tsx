// The board grid: category headers + clue tiles. Every tile carries data-clue-id so the clue
// panel can measure it for the zoom (FLIP) animation.
import { useMemo, type CSSProperties } from 'react';
import type { GameView } from '../../../shared/views';
import { cx } from '../../components/ui';
import { CATEGORY_TEXT_SHARE, FitText, tileMoney, useBoard } from './common';
import { T } from './timing';
import { checkerDelays, useFx } from './fx';
import { SPEED_FACTOR } from '../../../shared/tvFx';

export function Grid({ g, activeId, activeOpen, fillIn }: { g: GameView; activeId: string | null; activeOpen: boolean; fillIn: boolean }) {
  const { prefix, scale } = useBoard();
  const fx = useFx();
  const round = g.rounds[g.roundIndex];
  const cols = round?.categories.length ?? 0;
  const rows = round ? Math.max(0, ...round.categories.map((c) => c.clues.length)) : 0;
  // Stable fill-in order for this mount: a checker pattern with the board intro on, else random.
  const checker = fx.boardIntro;
  const factor = SPEED_FACTOR[fx.introSpeed];
  const delays = useMemo(() => {
    if (checker) return checkerDelays(cols, rows, T.fillSpread * 1.3 * factor);
    const n = cols * rows;
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const step = n > 1 ? T.fillSpread / (n - 1) : 0;
    const d: number[] = [];
    order.forEach((cell, rank) => (d[cell] = rank * step));
    return d;
  }, [cols, rows, checker, factor]);
  if (!round) return null;

  const fillStyle = (r: number, c: number): CSSProperties | undefined =>
    fillIn ? ({ animationDelay: `${delays[r * cols + c].toFixed(3)}s`, '--bt-fill-dur': `${T.fillTile}s` } as CSSProperties) : undefined;

  return (
    <div className="bt-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `var(--bt-cat-row, 1.3fr) repeat(${rows}, minmax(0, 1fr))` }}>
      {round.categories.map((c) => (
        <div key={c.id} className="bt-cell bt-cat" data-testid="board-category">
          <FitText text={c.name} max={4.4 * scale.category} maxBox={CATEGORY_TEXT_SHARE * scale.category} min={1.5 * scale.category} className="bt-cat-text" />
        </div>
      ))}
      {Array.from({ length: rows }).map((_, r) =>
        round.categories.map((c, ci) => {
          const q = c.clues[r];
          if (!q) return <div key={`${c.id}-${r}`} className="bt-cell bt-used" aria-hidden />;
          const active = q.id === activeId;
          // The open clue's tile keeps its value (zoom source) but is not an available tile.
          const showValue = active ? activeOpen : !q.used;
          return (
            <div
              key={q.id}
              data-clue-id={q.id}
              className={cx('bt-cell', showValue ? 'bt-tile' : 'bt-used', fillIn && 'bt-fill')}
              style={fillStyle(r, ci)}
              data-testid={!q.used && !active ? 'board-tile' : undefined}
            >
              {showValue && <span className="bt-value">{tileMoney(prefix, q.value)}</span>}
            </div>
          );
        }),
      )}
    </div>
  );
}
