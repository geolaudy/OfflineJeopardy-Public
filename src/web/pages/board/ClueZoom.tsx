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
  // A zooming clue shows its content from the first frame (R7-13); fades start hidden.
  const [expanded, setExpanded] = useState(() => zoomIn && !reduced);
  // R8-2: the stage that zoomed in with the tile is already on screen, so it never runs the
  // stage fade-in. (Removing a "zooming" class when the zoom ended used to start that fade then:
  // the clue text blinked out and faded back in — the flicker.) A later stage (Daily Double!
  // wager → question) still fades in.
  const stageKey = clue.isDailyWager && clue.stage === 'wager' ? 'wager' : 'question';
  const [stillStage] = useState(() => (zoomIn && !reduced ? stageKey : null));
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
      // R7-13: the clue text is already on the tile and grows with it (the panel is laid out at
      // full size and only scaled, so the text never re-flows during the zoom).
      setExpanded(true);
      const from = tileTransform(panel, clue.clueId) ?? centreTransform(panel);
      a = panel.animate([{ transform: from }, { transform: 'none' }], { duration: T.zoom * 1000, easing: EASE_OUT });
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
        {stageKey === 'wager' ? <DailyWagerCard key="wager" g={g} still={stillStage === 'wager'} /> : <QuestionCard key="question" g={g} still={stillStage === 'question'} />}
        <UnlockIndicator open={g.buzzer.status === 'open' && !closing} />
        <BuzzWinner g={g} />
        <TimerBar timer={g.timer} />
      </div>
    </div>
  );
}

function DailyWagerCard({ g, still }: { g: GameView; still?: boolean }) {
  const clue = g.clue!;
  const controller = findCompetitor(g, g.controlCompetitorId);
  return (
    <div className={cx('bt-stage flex min-h-0 flex-1 flex-col items-center justify-center gap-[3.5vh] px-[6vw] pb-[8vh] text-center', still && 'is-still')} data-testid="tv-stage">
      <p className="bt-dw-title">DAILY DOUBLE!</p>
      <p className="bt-dw-cat">{clue.categoryName}</p>
      {controller && (
        <p className="bt-dw-who">
          <span className="bt-name">{competitorName(controller, g)}</span> is wagering…
        </p>
      )}
    </div>
  );
}

/**
 * Banner on the top edge naming who buzzed in first. Team games (R5-5.10): the team name large on
 * the team colour with "Buzzed by {nickname}" small underneath — just the team name when a shared
 * buzzer cannot tell who pressed it. Solo games: the player's name.
 */
function BuzzWinner({ g }: { g: GameView }) {
  const ctx = useBoard();
  const sub = g.clue?.submission ?? null;
  // A buzz winner, or (Daily Wager) whoever submitted an answer.
  const w = g.buzzer.winner ?? (sub ? { competitorId: sub.competitorId, profileId: null, at: sub.at } : null);
  const c = findCompetitor(g, w?.competitorId);
  const player = w?.profileId ? g.profiles[w.profileId] : null;
  const answer = sub && sub.competitorId === w?.competitorId ? sub.answer : null;
  const team = c?.kind === 'team';
  return (
    <AnimatePresence>
      {w && c && (
        <motion.div
          key={`${w.competitorId}:${w.at}`}
          className={cx('bt-winner', team && 'is-team')}
          style={{ '--pc': team ? competitorColor(c, g) : (player?.color ?? competitorColor(c, g)) } as CSSProperties}
          initial={{ y: '-100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: T.fade, ease: EASE_OUT_ARR }}
          data-testid="buzz-winner"
          data-kind={team ? 'team' : 'player'}
        >
          <Avatar profile={team ? competitorAvatar(c, g) : (player ?? competitorAvatar(c, g))} size={vhPx(ctx, team ? 7.2 : 4.8)} />
          <div className="min-w-0 text-left">
            <div className="bt-winner-name" data-testid="buzz-winner-name">
              {team || !player ? competitorName(c, g) : profileName(player)}
            </div>
            {team && player && (
              <div className="bt-winner-sub" data-testid="buzz-winner-sub">
                <span className="bt-winner-sub-label">Buzzed by</span> <span className="bt-winner-sub-who">{profileName(player)}</span>
              </div>
            )}
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
