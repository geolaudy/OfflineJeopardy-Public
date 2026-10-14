// Full-screen clue panel with a FLIP zoom out of (and back into) its board tile.
//
// The panel is laid out at its final full-size position; on open we measure the source tile once
// (layout effect, before paint) and animate transform from the tile's rect to identity. Only
// transform/opacity are animated (Web Animations API), so there are no React re-renders during the
// animation. The animation is purely presentational: any new state simply re-renders.
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameView } from '../../../shared/views';
import { Avatar, cx } from '../../components/ui';
import { competitorAvatar, competitorColor, competitorName, findCompetitor, profileName } from '../../lib/view';
import { FitText, useBoard, vhPx } from './common';
import { TimerBar } from './TimerBar';
import { QuestionCard } from './ClueMedia';
import { EASE_IN_OUT, EASE_OUT, EASE_OUT_ARR, T } from './timing';
import { UnlockIndicator } from './fx';

/** Transform that maps the full-size panel onto the tile for `clueId` (null if not on screen). */
function tileTransform(panel: HTMLElement, clueId: string): string | null {
  const stage = panel.parentElement;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  if (!stage || !w || !h) return null;
  let tile: HTMLElement | null = null;
  stage.querySelectorAll<HTMLElement>('[data-clue-id]').forEach((el) => {
    if (el.dataset.clueId === clueId) tile = el;
  });
  if (!tile) return null;
  const r = (tile as HTMLElement).getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const s = stage.getBoundingClientRect();
  const dx = r.left - s.left - panel.offsetLeft;
  const dy = r.top - s.top - panel.offsetTop;
  return `translate(${dx}px, ${dy}px) scale(${r.width / w}, ${r.height / h})`;
}

function centreTransform(panel: HTMLElement) {
  return `translate(${panel.offsetWidth * 0.4}px, ${panel.offsetHeight * 0.4}px) scale(0.2)`;
}

export function CluePanel({ g, closing, zoomIn, onClosed }: { g: GameView; closing: boolean; zoomIn: boolean; onClosed: () => void }) {
  const { reduced } = useBoard();
  const clue = g.clue!;
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const openAnim = useRef<Animation | null>(null);
  const [expanded, setExpanded] = useState(false);
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  // Open: tile → full screen (or a cross-fade when motion is reduced / no tile geometry exists).
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || typeof panel.animate !== 'function') {
      setExpanded(true);
      return;
    }
    let a: Animation;
    if (reduced || !zoomIn) {
      setExpanded(true);
      a = panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: T.fade * 1000, easing: 'linear' });
    } else {
      const from = tileTransform(panel, clue.clueId) ?? centreTransform(panel);
      a = panel.animate([{ transform: from }, { transform: 'none' }], { duration: T.zoom * 1000, easing: EASE_OUT });
      a.onfinish = () => setExpanded(true);
    }
    openAnim.current = a;
    return () => a.cancel();
    // Runs once per clue (the component is keyed by clue id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close: content fades, the panel shrinks back into its tile and fades away.
  useLayoutEffect(() => {
    if (!closing) return;
    const panel = panelRef.current;
    if (!panel || typeof panel.animate !== 'function') {
      onClosedRef.current();
      return;
    }
    const current = getComputedStyle(panel).transform;
    const from = current && current !== 'none' ? current : 'none';
    openAnim.current?.cancel();
    let a: Animation;
    let c: Animation | null = null;
    if (reduced) {
      a = panel.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fade * 1000, fill: 'forwards' });
    } else {
      const to = tileTransform(panel, clue.clueId) ?? centreTransform(panel);
      c = contentRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: T.fadeOut * 1000, fill: 'forwards' }) ?? null;
      a = panel.animate(
        [
          { transform: from, opacity: 1 },
          { transform: to, opacity: 1, offset: 0.8 },
          { transform: to, opacity: 0 },
        ],
        { duration: T.unzoom * 1000, delay: T.fadeOut * 600, easing: EASE_IN_OUT, fill: 'both' },
      );
    }
    a.onfinish = () => onClosedRef.current();
    return () => {
      a.cancel();
      c?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  return (
    <div ref={panelRef} className="bt-panel" style={{ '--bt-fade': `${T.fade}s` } as CSSProperties} aria-live="polite" data-testid="tv-clue-panel">
      <div ref={contentRef} className={cx('bt-content', expanded && 'is-in')}>
        {clue.isDailyWager && clue.stage === 'wager' ? <DailyWagerCard key="wager" g={g} /> : <QuestionCard key="question" g={g} />}
        <UnlockIndicator open={g.buzzer.status === 'open' && !closing} />
        <BuzzWinner g={g} />
        <TimerBar timer={g.timer} />
      </div>
    </div>
  );
}

function DailyWagerCard({ g }: { g: GameView }) {
  const clue = g.clue!;
  const controller = findCompetitor(g, g.controlCompetitorId);
  return (
    <div className="bt-stage flex min-h-0 flex-1 flex-col items-center justify-center gap-[3.5vh] px-[6vw] pb-[8vh] text-center">
      <p className="bt-dw-title">DAILY DOUBLE!</p>
      <p className="bt-dw-cat">{clue.categoryName}</p>
      {controller && <p className="bt-dw-who">{competitorName(controller, g)} is wagering…</p>}
    </div>
  );
}

/** Compact banner on the top edge naming who buzzed in first. */
function BuzzWinner({ g }: { g: GameView }) {
  const ctx = useBoard();
  const sub = g.clue?.submission ?? null;
  // A buzz winner, or (Daily Wager) whoever submitted an answer.
  const w = g.buzzer.winner ?? (sub ? { competitorId: sub.competitorId, profileId: null, at: sub.at } : null);
  const c = findCompetitor(g, w?.competitorId);
  const player = w?.profileId ? g.profiles[w.profileId] : null;
  const answer = sub && sub.competitorId === w?.competitorId ? sub.answer : null;
  return (
    <AnimatePresence>
      {w && c && (
        <motion.div
          key={`${w.competitorId}:${w.at}`}
          className="bt-winner"
          style={{ '--pc': c.kind === 'team' ? c.color : (player?.color ?? competitorColor(c, g)) } as CSSProperties}
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: T.fade, ease: EASE_OUT_ARR }}
          data-testid="buzz-winner"
        >
          <Avatar profile={player ?? competitorAvatar(c, g)} size={vhPx(ctx, 4.8)} />
          <div className="min-w-0 text-left">
            <div className="bt-winner-name">{c.kind === 'team' || !player ? competitorName(c, g) : profileName(player)}</div>
            {c.kind === 'team' && player && <div className="bt-winner-sub">{profileName(player)}</div>}
            {answer && (
              <motion.div className="bt-winner-answer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: T.fade }} data-testid="tv-bot-answer">
                “{answer}”
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
