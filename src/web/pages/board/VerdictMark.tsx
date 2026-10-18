// Sharp vector check / cross for judged answers (R7-12), in the score-change colours.
import { cx } from '../../components/ui';

export function VerdictMark({ correct, className }: { correct: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cx('bt-verdict', correct ? 'is-up' : 'is-down', className)}
      role="img"
      aria-label={correct ? 'Correct' : 'Incorrect'}
      data-testid="verdict-mark"
      data-correct={correct ? 'true' : 'false'}
    >
      {correct ? <path d="M3.5 12.5 9.5 18.5 20.5 5.5" /> : <path d="M5 5 19 19M19 5 5 19" />}
    </svg>
  );
}
