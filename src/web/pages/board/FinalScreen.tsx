// Final Wager presentation in the same visual language as the clue panel.
import { motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { GameView } from '../../../shared/views';
import { cx, fmtScore } from '../../components/ui';
import { competitorColor, competitorName, findCompetitor } from '../../lib/view';
import { FitText } from './common';
import { TimerBar } from './TimerBar';
import { EASE_OUT_ARR, T } from './timing';

export function FinalScreen({ g }: { g: GameView }) {
  const f = g.final!;
  const early = f.stage === 'category' || f.stage === 'wagers';
  const showQuestion = !early && !!f.question;
  const showCards = f.stage === 'reveal' || f.stage === 'done';
  return (
    <motion.div className="bt-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.fade }}>
      <p className="bt-kicker shrink-0">Final Wager</p>
      <FitText
        text={f.category}
        max={early ? 13 : 5}
        min={early ? 4 : 2.4}
        className="bt-intro-cat"
        boxClassName={early ? 'min-h-0 flex-1' : 'h-[9vh] shrink-0'}
      />
      {f.stage === 'wagers' && (
        <div className="flex shrink-0 flex-wrap justify-center gap-[1.2vw] pb-[2vh]">
          {f.entries.map((e) => (
            <span key={e.competitorId} className={cx('bt-chip', e.hasWager && 'is-done')}>
              {competitorName(findCompetitor(g, e.competitorId), g)} {e.hasWager ? '✓' : '…'}
            </span>
          ))}
        </div>
      )}
      {showQuestion && (
        <motion.div
          className="flex min-h-0 w-full flex-1 flex-col"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: T.reveal }}
        >
          <FitText text={f.question!} max={showCards ? 4.6 : 7} min={2.2} className="bt-question" boxClassName="min-h-0 flex-1" />
        </motion.div>
      )}
      {f.stage === 'clue' && (
        <div className="flex shrink-0 flex-wrap justify-center gap-[1.2vw]">
          {f.entries.map((e) => (
            <span key={e.competitorId} className={cx('bt-chip', e.hasAnswer && 'is-done')}>
              {competitorName(findCompetitor(g, e.competitorId), g)} {e.hasAnswer ? '✓' : '…'}
            </span>
          ))}
        </div>
      )}
      {showCards && (
        <div className="grid w-full max-w-[88vw] shrink-0 gap-[1.4vh]" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, f.entries.length))}, minmax(0, 1fr))` }}>
          {f.entries.map((e) => {
            const c = findCompetitor(g, e.competitorId);
            return (
              <div
                key={e.competitorId}
                className={cx('bt-final-card', e.judged && (e.correct ? 'is-right' : 'is-wrong'))}
                style={{ '--pc': competitorColor(c, g) } as CSSProperties}
              >
                <div className="bt-display truncate text-[2.6vh] uppercase">{competitorName(c, g)}</div>
                <div className="bt-question mt-[0.6vh] truncate text-[3vh]">{e.judged ? e.answer || '(no answer)' : '???'}</div>
                <div className="mt-[0.4vh] text-[2vh] opacity-90">{e.judged ? `Wager ${fmtScore(e.wager ?? 0)}` : ' '}</div>
              </div>
            );
          })}
        </div>
      )}
      {f.stage === 'done' && f.answer && (
        <motion.p
          className="bt-answer shrink-0"
          initial={{ opacity: 0, y: '3vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}
        >
          {f.answer}
        </motion.p>
      )}
      <TimerBar timer={g.timer} />
    </motion.div>
  );
}
