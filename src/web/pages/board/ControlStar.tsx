// R7-6: the board-control star — a sharp five-pointed star in the dollar-value gold, about as tall
// as the name, with the name's hard shadow. Always rendered (hidden when off) so its slot is
// reserved and nothing next to it moves.
import { cx } from '../../components/ui';

/** Points of a regular five-pointed star in a 24×24 box (outer radius 12, inner radius ≈ 4.6). */
const POINTS = (() => {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 4.59 : 12;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12.6 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
})();

export function ControlStar({ on, className }: { on: boolean; className?: string }) {
  return (
    <span className={cx('bt-star-slot', className)} data-testid={on ? 'control-star' : undefined} aria-hidden>
      <svg viewBox="0 0 24 24" className={cx('bt-star', on && 'is-on')}>
        <polygon points={POINTS} />
      </svg>
    </span>
  );
}
