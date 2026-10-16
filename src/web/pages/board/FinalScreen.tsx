// Final Jeopardy! presentation in the same visual language as the clue panel.
// Reveal (R4-2): one contestant at a time, lowest → highest score before the Final:
// contestant → wager → answer → host's judgment (score updates) → next.
// R5-6: the move from answer writing to the reveal, and from one contestant to the next, is the
// category-introduction swipe (with its sound), once per host action.
import { AnimatePresence, motion } from 'motion/react';
import { useState, type CSSProperties } from 'react';
import type { GameView } from '../../../shared/views';
import { finalEntryReveal } from '../../../shared/game';
import { Avatar, cx, fmtScore } from '../../components/ui';
import { playCue } from '../../lib/sound';
import { competitorAvatar, competitorColor, competitorName, findCompetitor } from '../../lib/view';
import { FitText, useBoard, useScoreChange } from './common';
import { TimerBar } from './TimerBar';
import { ScoreDelta } from './ScoreDelta';
import { SwipeStage, useSwipe, useTestId } from './Swipe';
import { finalScreenKey, finalTransition } from './finalSwipe';
import { EASE_OUT_ARR, T } from './timing';

const swipeSound = () => playCue('categoryIntro');

export function FinalScreen({ g }: { g: GameView }) {
  const f = g.final!;
  const swipe = useSwipe(finalScreenKey(f), finalTransition, swipeSound);
  return (
    <motion.div
      className="bt-final-stage"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: T.fade }}
      data-testid="tv-final"
      data-screen={swipe.key}
      data-swipe-seq={swipe.seq}
      data-swipe-kind={swipe.kind}
    >
      <SwipeStage swipe={swipe} className="bt-final">
        <FinalContent g={g} />
      </SwipeStage>
    </motion.div>
  );
}

/** One full Final screen (a swipe layer). A leaving layer keeps the state it last showed. */
function FinalContent({ g }: { g: GameView }) {
  const f = g.final!;
  const early = f.stage === 'category' || f.stage === 'wagers';
  const revealing = f.stage === 'reveal' || f.stage === 'done';
  return (
    <>
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
    </>
  );
}

/** Who has locked in a wager / submitted an answer (never what): green border = in, gray = not
 *  (or being changed) (R5-6). */
function SubmissionChips({ g, kind }: { g: GameView; kind: 'wager' | 'answer' }) {
  const f = g.final!;
  const tid = useTestId();
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-[1.2vw]" data-testid={tid('tv-final-status')}>
      {f.entries.map((e) => {
        const done = kind === 'wager' ? e.hasWager : e.submitted;
        return (
          <span key={e.competitorId} className={cx('bt-chip bt-name bt-submit-chip', done ? 'is-in' : 'is-out')} data-done={done ? 'true' : 'false'}>
            {competitorName(findCompetitor(g, e.competitorId), g)}
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
  const tid = useTestId();
  const id = f.order[f.cursor];
  const e = f.entries.find((x) => x.competitorId === id);
  const c = findCompetitor(g, id);
  const shown = finalEntryReveal(f, id);
  const pre = f.preScores[id] ?? 0;
  const result = e?.judged ? pre + (e.correct ? 1 : -1) * (e.wager ?? 0) : pre;
  // A judgment made while this screen is up shows "+$/−$wager" (R5-7); one this TV loaded with
  // does not animate.
  const change = useScoreChange(result);
  const [judgedAtLoad] = useState(() => !!e?.judged);
  if (!e || !c) return <div className="flex-1" />;
  const color = competitorColor(c, g);
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[2.4vh]" data-testid={tid('tv-final-spotlight')}>
      <div className="bt-final-spot" style={{ '--pc': color } as CSSProperties} data-competitor={id}>
        <div className="bt-final-who">
          <span className="bt-final-ring">
            <Avatar profile={competitorAvatar(c, g)} size={Math.round(ctx.vh * 0.16)} />
          </span>
          <div className="min-w-0 text-left">
            <div className="bt-name truncate text-[5.6vh] leading-none" data-testid={tid('tv-final-name')}>
              {competitorName(c, g)}
            </div>
            <div className="bt-final-pre">
              <span className="bt-final-label">Before Final Jeopardy!</span>
              <b className="tabular-nums">{fmtScore(pre)}</b>
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
                data-testid={tid('tv-final-answer')}
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
              <motion.div key="wager" initial={{ opacity: 0, y: '2vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.fade }} data-testid={tid('tv-final-wager')}>
                <span className="bt-final-label">Wager</span> <b className="tabular-nums">{fmtScore(e.wager ?? 0)}</b>
              </motion.div>
            )}
          </AnimatePresence>
          {e.judged && (
            <motion.div
              initial={judgedAtLoad ? false : { scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: T.fade }}
              className={cx('bt-final-verdict', e.correct ? 'is-right' : 'is-wrong')}
              data-testid={tid('tv-final-verdict')}
            >
              {e.correct ? '✓' : '✗'} <span className="tabular-nums">{fmtScore(result)}</span>
              <ScoreDelta change={change} />
            </motion.div>
          )}
        </div>
      </div>
      <RevealProgress g={g} />
    </div>
  );
}

/** Reveal order along the bottom: done (with result), current, still to come. */
function RevealProgress({ g }: { g: GameView }) {
  const f = g.final!;
  const tid = useTestId();
  return (
    <div className="flex shrink-0 flex-wrap justify-center gap-[1vw]" data-testid={tid('tv-final-order')}>
      {f.order.map((id, i) => {
        const e = f.entries.find((x) => x.competitorId === id);
        const c = findCompetitor(g, id);
        return (
          <span key={id} className={cx('bt-chip bt-name', i === f.cursor && f.stage === 'reveal' && 'is-done', i > f.cursor && 'opacity-60')}>
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
        <motion.div className="flex shrink-0 flex-col items-center gap-[0.8vh]" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }}>
          <span className="bt-final-label text-[2.4vh]">Correct response</span>
          <p className="bt-answer">{f.answer}</p>
        </motion.div>
      )}
      <div className="grid w-full max-w-[88vw] shrink-0 gap-[1.4vh]" style={{ gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, f.order.length))}, minmax(0, 1fr))` }}>
        {f.order.map((id) => {
          const e = f.entries.find((x) => x.competitorId === id)!;
          const c = findCompetitor(g, id);
          return (
            <div key={id} className={cx('bt-final-card', e.judged && (e.correct ? 'is-right' : 'is-wrong'))} style={{ '--pc': competitorColor(c, g) } as CSSProperties}>
              <div className="bt-name truncate text-[2.8vh]">{competitorName(c, g)}</div>
              <div className="bt-question mt-[0.6vh] truncate text-[3vh]">{e.answer || '(no answer)'}</div>
              <div className="mt-[0.4vh] text-[2vh]">
                <span className="bt-final-label">Wager</span> <span className="bt-money text-[2.4vh]">{fmtScore(e.wager ?? 0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
