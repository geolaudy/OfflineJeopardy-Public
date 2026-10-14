// Category introduction at the start of a round. The host (or server auto-advance) drives
// `g.intro.step`; the TV only renders the current step: -1 = round title card, 0..n-1 = category.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cueDuration, playCue } from '../../lib/sound';
import { serverNow } from '../../lib/socket';
import type { GameView } from '../../../shared/views';
import { cx } from '../../components/ui';
import { FitText, useBoard } from './common';
import { EASE_OUT_ARR, T } from './timing';
import { BoardReveal, revealTimeline, useFx } from './fx';

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
  useEffect(() => {
    if (fresh) playCue('boardIntro');
  }, [fresh]);
  const fill = fx.boardIntro && fresh && !reduced;
  return (
    <motion.div className="bt-intro" exit={{ opacity: 0 }} transition={{ duration: T.fade }} data-testid="intro">
      <AnimatePresence initial={true}>
        <motion.div
          key={`${intro.roundIndex}:${step}`}
          className="absolute inset-0"
          initial={reduced ? { opacity: 0 } : step < 0 ? (fill ? { opacity: 1 } : { opacity: 0, scale: 0.9 }) : { x: '100%' }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { x: '-100%' }}
          transition={{ duration: T.slide, ease: EASE_OUT_ARR }}
        >
          {cat ? (
            <div className="bt-intro-card">
              <p className="bt-intro-kicker">
                Category {step + 1} of {n}
              </p>
              <FitText text={cat.name} max={15} min={5} className="bt-intro-cat" boxClassName="min-h-0 max-h-[52vh] flex-1" />
            </div>
          ) : fill ? (
            // Classic board intro (R2-23): the blank screens light up in a checker pattern, then the
            // board dims and the round title appears over it.
            <>
              <motion.div className="absolute inset-0" animate={{ opacity: 0.22 }} transition={{ delay: total, duration: T.fade * 1.5 }}>
                <BoardReveal g={g} total={total} />
              </motion.div>
              <motion.div className="bt-intro-card" initial={{ opacity: 0, scale: reduced ? 1 : 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: total * 0.9, duration: T.fade * 1.4, ease: EASE_OUT_ARR }}>
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
