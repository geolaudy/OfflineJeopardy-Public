// "+$400" / "−$400" beside a score that just changed (R5-7). One system for every score change on
// the TV: regular clues, Daily Double! and Final Jeopardy!. The parent positions it (relative);
// it fades in, holds and fades away, then unmounts.
import { useEffect, useState, type CSSProperties } from 'react';
import { cx } from '../../components/ui';
import { deltaText, useBoard } from './common';
import { T } from './timing';

export function ScoreDelta({ change, className }: { change: { delta: number; n: number } | null; className?: string }) {
  const { prefix } = useBoard();
  const [doneN, setDoneN] = useState(0);
  const n = change?.n ?? 0;
  useEffect(() => {
    if (!n) return;
    const id = setTimeout(() => setDoneN(n), T.scoreDelta * 1000);
    return () => clearTimeout(id);
  }, [n]);
  if (!change || change.delta === 0 || doneN >= change.n) return null;
  const up = change.delta > 0;
  return (
    <span
      key={change.n}
      className={cx('bt-delta', up ? 'is-up' : 'is-down', className)}
      style={{ '--bt-delta': `${T.scoreDelta}s` } as CSSProperties}
      data-testid="score-delta"
      data-dir={up ? 'up' : 'down'}
      aria-hidden
    >
      {/* The sign gets its own, larger glyph so "+" / "−" read clearly at TV distance. */}
      <span className="bt-delta-sign">{deltaText(prefix, change.delta).charAt(0)}</span>
      {deltaText(prefix, change.delta).slice(1)}
    </span>
  );
}
