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
import { CategoryTitle, FitText, money, useBoard } from './common';
import { TimerBar } from './TimerBar';
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
  // The category reveal itself: the category alone, as large as the screen allows.
  const intro = f.stage === 'category';
  const wagers = f.stage === 'wagers';
  const revealing = f.stage === 'reveal' || f.stage === 'done';
  // R9-6.2: a picture or sound clue gets a smaller category line, so the picture can be larger.
  const mediaClue = (f.stage === 'clue' || f.stage === 'closed') && f.media.length > 0;
  const sub = !!f.categorySubheading?.trim();
  // R14-19: after the category reveal the category is 80 % of its former size and sits right under
  // "Final Jeopardy!" (it was centred in the space down to the bubbles while wagering).
  const max = intro ? 13 : wagers ? 10.4 : revealing || mediaClue ? 2.9 : 4;
  return (
    <>
      <p className="bt-kicker shrink-0">Final Jeopardy!</p>
      {/* R10-3: the subheading sits directly under the category, the two centred as one group
          (its box grows by the subheading's line, as the separate line did before). */}
      <CategoryTitle
        name={f.category}
        subheading={f.categorySubheading}
        max={max}
        min={intro ? 4 : wagers ? 3.2 : 1.8}
        subEm={intro || wagers ? 0.34 : 0.6}
        subMin={intro ? 2.6 : wagers ? 2.1 : 1.45}
        boxClassName={cx(
          intro ? 'min-h-0 flex-1' : 'shrink-0 -mt-[1.2vh]',
          wagers && (sub ? 'h-[26vh]' : 'h-[20vh]'),
          !intro && !wagers && (sub ? (revealing || mediaClue ? 'h-[7.5vh]' : 'h-[10vh]') : revealing || mediaClue ? 'h-[5vh]' : 'h-[7.5vh]'),
        )}
        subTestId="final-subheading"
      />
      {wagers && <SubmissionChips g={g} kind="wager" bottom />}
      {(f.stage === 'clue' || f.stage === 'closed') && (f.question?.trim() || f.media.length > 0) && (
        // R7-7: centred in the whole stage, not in the space left under the category; the header
        // band is mirrored at the bottom so long clues never run into it. With media (R9-6) the
        // picture gets the room down to the answer chips.
        <motion.div className={cx('bt-final-q', f.media.length > 0 && 'has-media', !!f.categorySubheading?.trim() && 'has-sub')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.reveal }} data-testid="tv-final-clue">
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
          <span key={e.competitorId} className={cx('bt-chip bt-name bt-submit-chip', done ? 'is-in' : 'is-out')} data-done={done ? 'true' : 'false'} data-final-chip={e.competitorId}>
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

/** Reveal order along the bottom. R14-20: the outline says where each contestant is — green
 *  correct, red incorrect (only once the host has judged), yellow being revealed, gray not yet. */
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
            className="bt-chip bt-name bt-reveal-chip"
            data-testid={tid('tv-final-chip')}
            data-verdict={e?.judged ? (e.correct ? 'correct' : 'incorrect') : undefined}
            data-state={e?.judged ? (e.correct ? 'correct' : 'incorrect') : i === f.cursor && f.stage === 'reveal' ? 'current' : 'waiting'}
          >
            {competitorName(c, g)}
            {e?.judged && <span className="sr-only">{e.correct ? ' (correct)' : ' (incorrect)'}</span>}
          </span>
        );
      })}
    </div>
  );
}

/** After the last judgment: the correct response and everyone's result. R14-21 / R14-22: no
 *  "Correct response" label and no colour strip on the cards; the names look like the score cards'
 *  (picture with the player's colour, the same name type). */
function Summary({ g }: { g: GameView }) {
  const f = g.final!;
  const ctx = useBoard();
  const { prefix } = ctx;
  return (
    <>
      {f.answerMedia.length > 0 ? (
        // R9-6.3: a picture (or sound) correct response gets the room above the result cards.
        <motion.div className="flex min-h-0 w-full flex-1 flex-col items-center gap-[0.8vh]" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }} data-testid="tv-final-correct">
          <MediaStage g={g} mc={finalMedia(f, 'answer')} side="answer" />
        </motion.div>
      ) : (
        f.answer && (
          <motion.div className="flex shrink-0 flex-col items-center gap-[0.8vh]" initial={{ opacity: 0, y: '3vh' }} animate={{ opacity: 1, y: 0 }} transition={{ duration: T.reveal, ease: EASE_OUT_ARR }} data-testid="tv-final-correct">
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
            <div key={id} className={cx('bt-final-card', e.judged && (e.correct ? 'is-right' : 'is-wrong'))} style={{ '--pc': competitorColor(c, g) } as CSSProperties} data-testid="tv-final-card">
              <div className="bt-podium-name bt-final-card-name">
                {c && (
                  <span className="bt-podium-ava is-ring">
                    <Avatar profile={competitorAvatar(c, g)} size={Math.round(ctx.vh * 0.032)} ring={false} />
                  </span>
                )}
                <span className="truncate">{competitorName(c, g)}</span>
              </div>
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
