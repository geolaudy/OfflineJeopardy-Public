// The correct answer on the host controller (R4-5): a distinct dark-red banner labelled ANSWER,
// smaller than the clue text so the host reads the clue, not the answer. `center` centres the
// answer (live clue view, R5-14); `aside` adds a control on the right (e.g. the answer picture).
import type { ReactNode } from 'react';
import { cx } from '../../components/ui';

export function AnswerBanner({ answer, label = 'Answer', children, className, center, aside }: { answer?: ReactNode; label?: string; children?: ReactNode; className?: string; center?: boolean; aside?: ReactNode }) {
  return (
    <div className={cx('flex items-stretch overflow-hidden rounded-xl bg-red-900 text-white shadow-sm', className)} data-testid="answer-banner">
      <span className="flex shrink-0 items-center bg-red-950 px-3 text-xs font-black tracking-[0.18em] uppercase" aria-hidden>
        {label}
      </span>
      <div className={cx('min-w-0 flex-1 px-3 py-2', center && 'flex flex-col items-center justify-center text-center')}>
        <span className="sr-only">{label}: </span>
        {answer != null && (
          <div className={cx('leading-snug font-bold break-words', center ? 'text-xl' : 'text-lg')} data-testid="host-answer">
            {answer}
          </div>
        )}
        {children}
      </div>
      {aside && <div className="flex shrink-0 items-center gap-2 px-2">{aside}</div>}
    </div>
  );
}
