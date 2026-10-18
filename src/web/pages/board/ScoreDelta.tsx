// One system for every score change on the TV (R6-5, replacing the R5-7 side label): the score box
// briefly shows the change itself — "+$600" in green or "−$600" in red, centred, in the money font —
// and then the new total. Regular clues, Daily Double! and Final Jeopardy! all use it.
//
// - The authoritative score is the prop; this only decides what the box shows for a moment.
// - A change arriving while another is still shown restarts the swap with the newest change, so
//   animations never overlap and the total that follows is always the current one.
// - A TV that loads mid-game (or the same value arriving again) shows the total, no animation.
// - Manual adjustments and undo (`quiet`, R7-11) simply show the new total.
import { useEffect, useState, type CSSProperties } from 'react';
import { cx } from '../../components/ui';
import { deltaText, money, useBoard, useScoreChange } from './common';
import { T } from './timing';

export function ScoreSwap({ score, from, className, animate = true, quiet = false }: { score: number; from?: number; className?: string; animate?: boolean; quiet?: boolean }) {
  const { prefix } = useBoard();
  const change = useScoreChange(score, from, quiet);
  const [doneN, setDoneN] = useState(0);
  const n = change?.n ?? 0;
  useEffect(() => {
    if (!n) return;
    const id = setTimeout(() => setDoneN(n), T.scoreDelta * 1000);
    return () => clearTimeout(id);
  }, [n]);
  const showing = animate && change && !change.quiet && change.delta !== 0 && doneN < change.n ? change : null;
  return (
    <span className={cx('bt-swap', className)} style={{ '--bt-swap-in': `${T.scoreSwapIn}s` } as CSSProperties}>
      {showing ? (
        <span key={`d${showing.n}`} className={cx('bt-swap-v bt-delta', showing.delta > 0 ? 'is-up' : 'is-down')} data-testid="score-delta" data-dir={showing.delta > 0 ? 'up' : 'down'}>
          {deltaText(prefix, showing.delta)}
        </span>
      ) : (
        // Keyed by the change count: the new total fades in after a change, never on load.
        <span key={`s${n}`} className={cx('bt-swap-v', n > 0 && animate && !change?.quiet && 'is-settle', score < 0 && 'is-neg')} data-testid="score-value">
          {money(prefix, score)}
        </span>
      )}
    </span>
  );
}
