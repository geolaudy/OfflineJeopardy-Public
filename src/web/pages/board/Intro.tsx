// Category introduction at the start of a round. The host (or server auto-advance) drives
// `g.intro.step`; the TV only renders the current step: -1 = round title card, 0..n-1 = category.
// Each change is ONE swipe whose direction comes from the previous and the new step (R5-12):
// forward = enter from the right, exit to the left; back = enter from the left, exit to the right.
// A TV that (re)connects mid-introduction shows the current step without a swipe.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cueDuration, playCue } from '../../lib/sound';
import { serverNow } from '../../lib/socket';
import type { GameView } from '../../../shared/views';
import { cx } from '../../components/ui';
import { CategoryTitle, FitText, useBoard } from './common';
import { EASE_OUT_ARR, T } from './timing';
import { BoardReveal, revealPlan, revealTimeline, useFx } from './fx';

export function Intro({ g }: { g: GameView }) {
  const { reduced } = useBoard();
  const fx = useFx();
  const intro = g.intro!;
  const round = g.rounds[intro.roundIndex];
  if (!round) return null;
  const n = round.categories.length;
  const step = Math.min(intro.step, n - 1);
  const cat = step >= 0 ? round.categories[step] : null;
  // Fresh = the round title was just started (not a TV reconnecting mid-intro): only then do the
  // board fill and its sound play — together, from one timeline (R4-19).
  const [fresh] = useState(() => step < 0 && (intro.at == null || serverNow() - intro.at < 2500));
  const [total] = useState(() => revealTimeline(fx, cueDuration('boardIntro')));
  // R8-4: one plan for the tiles, the category row and the title (the board dims and the title
  // comes in as the category row finishes lighting).
  const [plan] = useState(() => revealPlan(fx, total, n, Math.max(0, ...round.categories.map((c) => c.clues.length))));
  const titleAt = plan.title;
  useEffect(() => {
    if (fresh) playCue('boardIntro');
  }, [fresh]);
  const fill = fx.boardIntro && fresh && !reduced;
  const dir = useSwipeDirection(`${intro.roundIndex}:${step}`, step);
  // The first step this screen shows: the title card (scale/fill as before) or, after a reconnect
  // mid-introduction, the current category without a swipe.
  const first = useRef(true);
  const isFirst = first.current;
  useEffect(() => {
    first.current = false;
  }, []);
  // R6-15: whole `transform` strings (not motion's x/scale) so the swipe runs as a compositor
  // animation (WAAPI) and keeps its pace even while the main thread is busy; with will-change the
  // card is rasterised once instead of repainted on every frame (see docs/PERFORMANCE.md).
  const enter = reduced ? { opacity: 0 } : isFirst ? (step < 0 ? (fill ? { opacity: 1 } : { opacity: 0, transform: tf(0, 0.9) }) : { opacity: 0 }) : { transform: tf(dir > 0 ? 100 : -100) };
  return (
    // data-surface: the introduction on the clue panel's surface in the host's preview (board.css,
    // R17-17) — R18-5: the round title too, not only the categories.
    <motion.div className="bt-intro" exit={{ opacity: 0 }} transition={{ duration: T.fade }} data-testid="intro" data-step={step} data-dir={dir > 0 ? 'forward' : 'back'} data-surface="panel">
      <AnimatePresence initial={true} custom={dir}>
        <motion.div
          key={`${intro.roundIndex}:${step}`}
          className="absolute inset-0"
          style={{ willChange: 'transform' }}
          custom={dir}
          variants={{ exit: (d: number) => (reduced ? { opacity: 0 } : { transform: tf(d > 0 ? -100 : 100) }) }}
          initial={enter}
          animate={{ transform: tf(0), opacity: 1 }}
          exit="exit"
          transition={{ duration: T.slide, ease: EASE_OUT_ARR }}
        >
          {cat ? (
            <div className="bt-intro-card">
              <p className="bt-intro-kicker">
                Category {step + 1} of {n}
              </p>
              <CategoryTitle name={cat.name} subheading={cat.subheading} max={15} min={5} subEm={0.3} subMin={2.8} boxClassName="min-h-0 max-h-[52vh] flex-1" subTestId="intro-subheading" />
            </div>
          ) : fill ? (
            // Classic board intro (R2-23): the blank screens light up in a checker pattern, then the
            // board dims and the round title appears over it.
            <>
              <motion.div className="absolute inset-0" style={{ willChange: 'opacity' }} animate={{ opacity: 0.22 }} transition={{ delay: titleAt, duration: T.fade * 1.5 }}>
                <BoardReveal g={g} total={total} plan={plan} />
              </motion.div>
              <motion.div
                className="bt-intro-card"
                style={{ willChange: 'transform, opacity' }}
                initial={{ opacity: 0, transform: `scale(${reduced ? 1 : 0.94})` }}
                animate={{ opacity: 1, transform: 'scale(1)' }}
                transition={{ delay: titleAt, duration: T.fade * 1.4, ease: EASE_OUT_ARR }}
              >
                <FitText text={round.name} max={16} min={6} className="bt-round-title" boxClassName="max-h-[40vh] flex-1 min-h-0" />
                <div className="bt-rule" aria-hidden />
                <p className="bt-intro-kicker">{n} categories</p>
              </motion.div>
            </>
          ) : (
            <div className="bt-intro-card">
              <FitText text={round.name} max={16} min={6} className="bt-round-title" boxClassName="max-h-[40vh] flex-1 min-h-0" />
              <div className="bt-rule" aria-hidden />
              <p className="bt-intro-kicker">{n} categories</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="bt-dots" role="img" aria-label={step < 0 ? `${round.name}` : `Category ${step + 1} of ${n}`}>
        {round.categories.map((c, i) => (
          <span key={c.id} className={cx('bt-dot', i <= step && 'is-on')} />
        ))}
      </div>
    </motion.div>
  );
}

/** One transform shape for every swipe keyframe (so WAAPI interpolates it directly). */
const tf = (xPct: number, scale = 1) => `translateX(${xPct}%) scale(${scale})`;

/** +1 when the step moved forward, -1 when it moved back; kept for the step it was computed for,
 *  so the exiting card leaves in the same direction the new one arrives from. */
function useSwipeDirection(key: string, step: number) {
  const [track, setTrack] = useState({ key, step, dir: 1 });
  if (track.key !== key) {
    const dir = step >= track.step ? 1 : -1;
    setTrack({ key, step, dir });
    return dir;
  }
  return track.dir;
}
