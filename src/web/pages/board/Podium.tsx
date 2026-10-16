// End-of-game results on the TV as a podium (R5-10): 1st place in the centre and tallest, 2nd on
// the left, 3rd on the right; tied contestants share a step; places 4+ listed underneath. The steps
// rise 3rd → 2nd → 1st, then names and scores fade in (reduced motion: fades only). The victory
// fanfare is played by BoardPage's sound cues, not here.
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { GameView } from '../../../shared/views';
import { Avatar, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, findCompetitor, profileName } from '../../lib/view';
import { FitText, useBoard, vhPx } from './common';
import { ordinal, placeLabel, podiumLayout } from './podiumModel';
import { EASE_OUT_ARR, T } from './timing';

/** Step heights (vh) by place. */
const STEP_H: Record<number, number> = { 1: 27, 2: 19.5, 3: 14 };
const START = 0.25;

export function PodiumResults({ g, logo }: { g: GameView; logo?: ReactNode }) {
  const ctx = useBoard();
  const results = useMemo(() => g.results ?? [], [g.results]);
  const layout = useMemo(() => podiumLayout(results), [results]);
  const winners = results.filter((r) => r.isWinner).map((r) => findCompetitor(g, r.competitorId));
  const n = Math.max(1, layout.columns.length);
  // Column width (vw): roomy for 1–3 contestants, narrower when ties put more on the podium.
  const colW = Math.min(20, 84 / n);
  const scale = layout.rest.length ? 0.8 : 1;
  const vwPx = (typeof window !== 'undefined' ? window.innerWidth : (ctx.vh * 16) / 9) / 100;
  const riseDone = START + T.podiumRise + (layout.steps - 1) * T.podiumStagger;
  const whoDelay = (riseOrder: number) => riseDone + riseOrder * 0.12;
  const headlineDelay = whoDelay(layout.steps) + 0.05;
  const headline = !results.length ? 'Game over' : winners.length > 1 ? "It's a tie!" : `${competitorName(winners[0], g)} wins!`;

  return (
    <div className="bt-results" data-testid="tv-results">
      {logo}
      <p className="bt-kicker">{g.title}</p>
      <motion.h1
        initial={ctx.reduced ? { opacity: 0 } : { scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: T.zoom, delay: headlineDelay, ease: EASE_OUT_ARR }}
        className="bt-headline bt-results-headline"
        data-testid="winner"
      >
        {headline}
      </motion.h1>
      <div className="bt-pod" data-testid="tv-podium" style={{ '--pod-w': `${colW}vw` } as CSSProperties}>
        {layout.columns.map((r) => {
          const c = findCompetitor(g, r.competitorId);
          const first = r.placement === 1;
          const label = placeLabel(r.placement, r.tied);
          const size = Math.round(Math.min(vhPx(ctx, (first ? 13 : 10) * scale), colW * vwPx * 0.62));
          const members = c?.kind === 'team' ? c.memberIds.map((m) => profileName(g.profiles[m])).join(' · ') : '';
          return (
            <div
              key={r.competitorId}
              className={cx('bt-pod-col', r.groupStart && 'is-group-start')}
              style={{ '--pc': competitorColor(c, g), '--pod-h': `${(STEP_H[r.placement] ?? 12) * scale}vh` } as CSSProperties}
              data-testid="tv-podium-entry"
              data-place={r.placement}
              data-place-label={label}
              data-competitor={r.competitorId}
              aria-label={`${label}: ${competitorName(c, g)}, ${fmtScore(r.score)}`}
            >
              <motion.div
                className="bt-pod-who"
                initial={ctx.reduced ? { opacity: 0 } : { opacity: 0, y: '2vh' }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: T.podiumReveal, delay: whoDelay(r.riseOrder), ease: EASE_OUT_ARR }}
              >
                <span className="bt-pod-ring">
                  <Avatar profile={competitorAvatar(c, g)} size={size} />
                </span>
                <FitText
                  text={competitorName(c, g)}
                  max={(first ? 5.2 : 4.2) * scale}
                  min={2}
                  className="bt-name bt-pod-name"
                  boxClassName={first ? 'h-[6.2vh]' : 'h-[5vh]'}
                  testId="tv-podium-name"
                />
                {members && <div className="bt-pod-members">{members}</div>}
                <div className={cx('bt-money bt-pod-score', r.score < 0 && 'is-neg')} data-testid="tv-podium-score">
                  {fmtScore(r.score)}
                </div>
              </motion.div>
              <div className="bt-pod-well">
                <motion.div
                  className="bt-pod-step"
                  initial={ctx.reduced ? { opacity: 0 } : { y: '100%' }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: ctx.reduced ? T.fade : T.podiumRise, delay: START + r.riseOrder * T.podiumStagger, ease: EASE_OUT_ARR }}
                >
                  <span className="bt-pod-place" aria-hidden>
                    <span className="bt-pod-num">{r.placement}</span>
                    <span className="bt-pod-ord">{ordinal(r.placement).slice(String(r.placement).length)}</span>
                  </span>
                  {r.tied && <span className="bt-label bt-pod-tie">Tie</span>}
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
      {layout.rest.length > 0 && (
        <motion.div
          className="bt-pod-rest"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: T.podiumReveal, delay: headlineDelay }}
          data-testid="tv-results-rest"
        >
          {layout.rest.map((r) => {
            const c = findCompetitor(g, r.competitorId);
            return (
              <div
                key={r.competitorId}
                className="bt-pod-rest-item"
                style={{ '--pc': competitorColor(c, g) } as CSSProperties}
                data-testid="tv-results-rest-entry"
                data-place={r.placement}
              >
                <span className="bt-label">{placeLabel(r.placement, r.tied)}</span>
                <Avatar profile={competitorAvatar(c, g)} size={vhPx(ctx, 3.4)} />
                <span className="bt-name">{competitorName(c, g)}</span>
                <span className={cx('bt-money', r.score < 0 && 'text-[#ff7a6b]')}>{fmtScore(r.score)}</span>
              </div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
