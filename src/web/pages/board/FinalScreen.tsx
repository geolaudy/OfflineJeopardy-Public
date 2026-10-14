// Final Jeopardy! presentation in the same visual language as the clue panel.
// Reveal (R4-2): one contestant at a time, lowest → highest score before the Final:
// contestant → wager → answer → host's judgment (score updates) → next.
import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { GameView } from '../../../shared/views';
import { finalEntryReveal } from '../../../shared/game';
import { Avatar, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, findCompetitor } from '../../lib/view';
import { FitText, useBoard } from './common';
import { TimerBar } from './TimerBar';
import { EASE_OUT_ARR, T } from './timing';

export function FinalScreen({ g }: { g: GameView }) {
  const f = g.final!;
  const early = f.stage === 'category' || f.stage === 'wagers';
  const revealing = f.stage === 'reveal' || f.stage === 'done';
  return (
    <motion.div className="bt-final" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.fade }}>
      <p className="bt-kicker shrink-0">Final Jeopardy!</p>
      <FitText
        text={f.category}
        max={early ? 13 : revealing ? 3.6 : 5}
        min={early ? 4 : 2.2}
        className="bt-intro-cat"
        boxClassName={early ? 'min-h-0 flex-1' : revealing ? 'h-[6vh] shrink-0' : 'h-[9vh] shrink-0'}
      />
      {(f.stage === 'wagers' || f.stage === 'clue') && <SubmissionChips g={g} kind={f.stage === 'wagers' ? 'wager' : 'answer'} />}
      {f.stage === 'clue' && f.question && (
        <motion.div className="flex min-h-0 w-full flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.reveal }}>
          <FitText text={f.question} max={7} min={2.2} className="bt-question" boxClassName="min-h-0 flex-1" />
        </motion.div>
      )}
      {f.stage === 'reveal' && <Spotlight g={g} />}
      {f.stage === 'done' && <Summary g={g} />}
      <TimerBar timer={g.timer} />
    </motion.div>
  );
}

/** Who has locked in a wager / written an answer (never what). */
function SubmissionChips({ g, kind }: { g: GameView; kind: 'wager' | 'answer' }) {
  const f = g.final!;
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-[1.2vw]" data-testid="tv-final-status">
      {f.entries.map((e) => {
        const done = kind === 'wager' ? e.hasWager : e.hasAnswer;
        return (
          <span key={e.competitorId} className={cx('bt-chip', done && 'is-done')}>
            {competitorName(findCompetitor(g, e.competitorId), g)} {done ? '✓' : '…'}
          </span>
        );
      })}
    </div>
  );
}

/** The contestant being revealed: name, picture, score before the Final → wager → answer → result. */
function Spotlight({ g }: { g: GameView }) {
  const f = g.final!;
  const ctx = useBoard();
  const id = f.order[f.cursor];
  const e = f.entries.find((x) => x.competitorId === id);
  const c = findCompetitor(g, id);
  if (!e || !c) return <div className="flex-1" />;
  const shown = finalEntryReveal(f, id);
  const pre = f.preScores[id] ?? 0;
  const color = competitorColor(c, g);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[2.4vh]" data-testid="tv-final-spotlight">
      <AnimatePresence mode="wait">
        <motion.div
          key={id}
          className="bt-final-spot"
          style={{ '--pc': color } as CSSProperties}
          initial={{ opacity: 0, x: '6vw' }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: '-6vw' }}
          transition={{ duration: T.page, ease: EASE_OUT_ARR }}
        >
          <div className="bt-final-who">
            <span className="bt-final-ring">
              <Avatar profile={competitorAvatar(c, g)} size={Math.round(ctx.vh * 0.16)} />
            </span>
            <div className="min-w-0 text-left">
              <div className="bt-display truncate text-[5.4vh] leading-none uppercase" data-testid="tv-final-name">
                {competitorName(c, g)}
              </div>
              <div className="mt-[1vh] text-[2.6vh] opacity-90">
                Before Final Jeopardy!: <b className="tabular-nums">{fmtScore(pre)}</b>
              </div>
            </div>
          </div>
          <div className="bt-final-answer-card" data-revealed={shown === 'answer' ? 'true' : 'false'}>
            <AnimatePresence mode="wait" initial={false}>
              {shown === 'answer' ? (
                <motion.div
                  key="answer"
                  initial={{ rotateX: -90, opacity: 0 }}
                  animate={{ rotateX: 0, opacity: 1 }}
                  transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}
                  className="bt-question bt-final-answer-text"
                  data-testid="tv-final-answer"
                >
                  {e.answer?.trim() ? e.answer : 'No answer'}
                </motion.div>
              ) : (
                <motion.div key="hidden" exit={{ rotateX: 90, opacity: 0 }} transition={{ duration: T.reveal / 2 }} className="bt-final-answer-hidden" aria-hidden>
                  ?
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="bt-final-wager">
            <AnimatePresence initial={false}>
              {shown !== 'none' && (
                <motion.div key="wager" initial={{ opacity: 0, y: '2vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.fade }} data-testid="tv-final-wager">
                  Wager <b className="tabular-nums">{fmtScore(e.wager ?? 0)}</b>
                </motion.div>
              )}
            </AnimatePresence>
            {e.judged && (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: T.fade }}
                className={cx('bt-final-verdict', e.correct ? 'is-right' : 'is-wrong')}
                data-testid="tv-final-verdict"
              >
                {e.correct ? '✓' : '✗'} <span className="tabular-nums">{fmtScore(pre + (e.correct ? 1 : -1) * (e.wager ?? 0))}</span>
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
      <RevealProgress g={g} />
    </div>
  );
}

/** Reveal order along the bottom: done (with result), current, still to come. */
function RevealProgress({ g }: { g: GameView }) {
  const f = g.final!;
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-[1vw]" data-testid="tv-final-order">
      {f.order.map((id, i) => {
        const e = f.entries.find((x) => x.competitorId === id);
        const c = findCompetitor(g, id);
        return (
          <span key={id} className={cx('bt-chip', i === f.cursor && f.stage === 'reveal' && 'is-done', i > f.cursor && 'opacity-60')}>
            {competitorName(c, g)}
            {e?.judged ? (e.correct ? ' ✓' : ' ✗') : ''}
          </span>
        );
      })}
    </div>
  );
}

/** After the last judgment: the correct response and everyone's result. */
function Summary({ g }: { g: GameView }) {
  const f = g.final!;
  return (
    <>
      {f.answer && (
        <motion.p className="bt-answer shrink-0" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}>
          {f.answer}
        </motion.p>
      )}
      <div className="grid w-full max-w-[88vw] shrink-0 gap-[1.4vh]" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, f.order.length))}, minmax(0, 1fr))` }}>
        {f.order.map((id) => {
          const e = f.entries.find((x) => x.competitorId === id)!;
          const c = findCompetitor(g, id);
          return (
            <div key={id} className={cx('bt-final-card', e.judged && (e.correct ? 'is-right' : 'is-wrong'))} style={{ '--pc': competitorColor(c, g) } as CSSProperties}>
              <div className="bt-display truncate text-[2.6vh] uppercase">{competitorName(c, g)}</div>
              <div className="bt-question mt-[0.6vh] truncate text-[3vh]">{e.answer || '(no answer)'}</div>
              <div className="mt-[0.4vh] text-[2vh] opacity-90">Wager {fmtScore(e.wager ?? 0)}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}
