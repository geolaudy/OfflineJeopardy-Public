// Final Jeopardy! presentation in the same visual language as the clue panel.
// Reveal (R4-2): one contestant at a time, lowest → highest score before the Final:
// contestant → wager → answer → host's judgment (score updates) → next.
// R5-6: the move from answer writing to the reveal, and from one contestant to the next, is the
// category-introduction swipe (with its sound), once per host action.
// R9-6: the clue's pictures and sounds show with the clue, laid out like an open clue's; the
// correct response's pictures and sounds only with the correct response after the reveals.
import { AnimatePresence, motion } from 'motion/react';
import type { CSSProperties } from 'react';
import type { FinalView, GameView } from '../../../shared/views';
import { finalEntryReveal } from '../../../shared/game';
import { Avatar, cx } from '../../components/ui';
import { playCue } from '../../lib/sound';
import { competitorAvatar, competitorColor, competitorName, findCompetitor } from '../../lib/view';
import { FitText, money, useBoard } from './common';
import { TimerBar } from './TimerBar';
import { VerdictMark } from './VerdictMark';
import { SwipeStage, useSwipe, useTestId } from './Swipe';
import { finalScreenKey, finalTransition } from './finalSwipe';
import { EASE_OUT_ARR, T } from './timing';
import { RichText } from '../../components/RichText';
import { MediaStage, type MediaClue } from './ClueMedia';

/** The Final clue as a media composition: the clue side, or the correct response alone. */
function finalMedia(f: FinalView, side: 'clue' | 'answer'): MediaClue {
  return side === 'clue'
    ? { clueId: f.clueId, question: f.question, answer: null, media: f.media, answerMedia: [], layout: f.layout }
    : { clueId: f.clueId, question: null, answer: f.answer, media: [], answerMedia: f.answerMedia, layout: f.layout };
}

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
  // R9-6.2: a picture or sound clue gets a smaller category line, so the picture can be larger.
  const mediaClue = (f.stage === 'clue' || f.stage === 'closed') && f.media.length > 0;
  return (
    <>
      <p className="bt-kicker shrink-0">Final Jeopardy!</p>
      <FitText
        text={f.category}
        max={early ? 13 : revealing || mediaClue ? 3.6 : 5}
        min={early ? 4 : 2.2}
        className="bt-intro-cat"
        boxClassName={early ? 'min-h-0 flex-1' : revealing || mediaClue ? 'h-[6vh] shrink-0' : 'h-[9vh] shrink-0'}
      />
      {f.categorySubheading && (
        <p className={cx('bt-intro-sub shrink-0', !early && 'is-small')} data-testid="final-subheading">
          {f.categorySubheading}
        </p>
      )}
      {f.stage === 'wagers' && <SubmissionChips g={g} kind="wager" />}
      {(f.stage === 'clue' || f.stage === 'closed') && (f.question?.trim() || f.media.length > 0) && (
        // R7-7: centred in the whole stage, not in the space left under the category; the header
        // band is mirrored at the bottom so long clues never run into it. With media (R9-6) the
        // picture gets the room down to the answer chips.
        <motion.div className={cx('bt-final-q', f.media.length > 0 && 'has-media')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.reveal }} data-testid="tv-final-clue">
          {f.media.length > 0 ? (
            <MediaStage g={g} mc={finalMedia(f, 'clue')} side="clue" />
          ) : (
            <FitText text={f.question ?? ''} max={7} min={2.2} className="bt-question" boxClassName="min-h-0 flex-1" />
          )}
        </motion.div>
      )}
      {(f.stage === 'clue' || f.stage === 'closed') && <SubmissionChips g={g} kind="answer" bottom />}
      {f.stage === 'reveal' && <Spotlight g={g} />}
      {f.stage === 'done' && <Summary g={g} />}
      <TimerBar timer={g.timer} />
    </>
  );
}

/** Who has locked in a wager / submitted an answer (never what): green border = in, gray = not
 *  (or being changed) (R5-6). */
function SubmissionChips({ g, kind, bottom }: { g: GameView; kind: 'wager' | 'answer'; bottom?: boolean }) {
  const f = g.final!;
  const tid = useTestId();
  return (
    <div className={cx('flex shrink-0 flex-wrap justify-center gap-[1.2vw]', bottom && 'mt-auto')} data-testid={tid('tv-final-status')}>
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

/** The contestant being revealed: name, picture, score before the Final → wager → answer. The
 *  judgment shows in the score box at the bottom (one score-change animation, R7-9) and as a mark
 *  on the contestant's chip below. */
function Spotlight({ g }: { g: GameView }) {
  const f = g.final!;
  const ctx = useBoard();
  const tid = useTestId();
  const id = f.order[f.cursor];
  const e = f.entries.find((x) => x.competitorId === id);
  const c = findCompetitor(g, id);
  const shown = finalEntryReveal(f, id);
  const pre = f.preScores[id] ?? 0;
  if (!e || !c) return <div className="flex-1" />;
  const color = competitorColor(c, g);
  return (
    <div
      className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[2.4vh]"
      data-testid={tid('tv-final-spotlight')}
      data-judged={e.judged ? (e.correct ? 'correct' : 'incorrect') : undefined}
    >
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
              <b className="tabular-nums">{money(ctx.prefix, pre)}</b>
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
                className="flex h-full w-full"
                data-testid={tid('tv-final-answer')}
              >
                {/* R8-5: the card keeps its size; a long answer shrinks to fit it. */}
                <FitText text={e.answer?.trim() ? e.answer : 'No answer'} max={8} min={2.6} className="bt-question bt-final-answer-text" boxClassName="h-full" />
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
                <span className="bt-final-label">Wager</span> <b className="tabular-nums">{money(ctx.prefix, e.wager ?? 0)}</b>
              </motion.div>
            )}
          </AnimatePresence>
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
          <span
            key={id}
            className={cx('bt-chip bt-name', i === f.cursor && f.stage === 'reveal' && 'is-done', i > f.cursor && 'opacity-60')}
            data-testid={tid('tv-final-chip')}
            data-verdict={e?.judged ? (e.correct ? 'correct' : 'incorrect') : undefined}
          >
            {competitorName(c, g)}
            {e?.judged && <VerdictMark correct={!!e.correct} />}
          </span>
        );
      })}
    </div>
  );
}

/** After the last judgment: the correct response and everyone's result. */
function Summary({ g }: { g: GameView }) {
  const f = g.final!;
  const { prefix } = useBoard();
  return (
    <>
      {f.answerMedia.length > 0 ? (
        // R9-6.3: a picture (or sound) correct response gets the room above the result cards.
        <motion.div className="flex min-h-0 w-full flex-1 flex-col items-center gap-[0.8vh]" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }} data-testid="tv-final-correct">
          <span className="bt-final-label shrink-0 text-[2.4vh]">Correct response</span>
          <MediaStage g={g} mc={finalMedia(f, 'answer')} side="answer" />
        </motion.div>
      ) : (
        f.answer && (
          <motion.div className="flex shrink-0 flex-col items-center gap-[0.8vh]" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }} data-testid="tv-final-correct">
            <span className="bt-final-label text-[2.4vh]">Correct response</span>
            <p className="bt-answer">
              <RichText text={f.answer} />
            </p>
          </motion.div>
        )
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
                <span className="bt-final-label">Wager</span> <span className="bt-money text-[2.4vh]">{money(prefix, e.wager ?? 0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
