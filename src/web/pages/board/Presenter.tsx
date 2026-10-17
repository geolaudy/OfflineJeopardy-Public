// TV presentation layer outside gameplay (R2-5, R2-7, R2-9, R2-10): the full public lobby, or a
// presented page with the compact lobby panel beside it, plus the navigation rail and wordmark.
//
// Full ↔ compact transition: the join QR (QR tile + "Scan to join") is ONE element that stays
// mounted; it sits in the top-right corner of the right-hand panel in both layouts (R6-8/R6-11),
// only its size changes and motion's layout animation FLIPs it with a transform. Everything inside
// is sized in container units (cqw), so the card is an exact scaled copy of itself at both sizes
// and the scale transform never distorts it. The address and room code are panel text. Player
// avatars share layout ids between the full roster and the compact strip; all other text
// cross-fades.
// Reduced motion: no movement, the card dips its opacity and everything else cross-fades.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useAnimate } from 'motion/react';
import type { GameView } from '../../../shared/views';
import type { PresentationState, PublicLobby } from '../../../shared/presentation';
import { QrImage, cx } from '../../components/ui';
import { useBoard } from './common';
import { buildLobbyModel } from './lobbyModel';
import { LobbyFull } from './LobbyFull';
import { CompactLobby } from './CompactLobby';
import { NavRail, Wordmark } from './NavRail';
import { PresentedPage, pageKey } from './PresentPages';
import { EASE_MORPH_ARR, EASE_OUT_ARR, T } from './timing';
import './presenter.css';

export function Presenter({
  g,
  lobby,
  presentation,
  joinUrl,
}: {
  g: GameView | null;
  lobby: PublicLobby | null;
  presentation: PresentationState | null;
  joinUrl: string | null;
}) {
  const page = presentation?.page ?? 'lobby';
  const compact = page !== 'lobby';
  const model = useMemo(() => buildLobbyModel(g, lobby, presentation?.roster), [g, lobby, presentation?.roster]);
  const roomCode = g?.rules.requireRoomCode && g.roomCode ? g.roomCode : null;
  // No game yet: no join code; the lobby says the host is getting ready (no board categories, R5-2.1).
  const preparing = !g;

  // After the first switch, a variant that mounts is morphing in from the other one.
  const [startCompact] = useState(compact);
  const switched = useRef(false);
  if (compact !== startCompact) switched.current = true;

  return (
    <div className={cx('tvp', compact ? 'is-compact' : 'is-full', roomCode && 'has-code', preparing && 'no-join')} data-testid="tv-presenter">
      <NavRail page={page} />
      <Wordmark />
      <div className="tvp-stage">
        <LayoutGroup>
          <AnimatePresence>
            {compact && presentation && (
              <motion.div
                key="pages"
                className="tvp-pages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: T.page, delay: T.morphFadeOut } }}
                exit={{ opacity: 0, transition: { duration: T.morphFadeOut } }}
              >
                <AnimatePresence initial={false}>
                  <PresentedPage key={pageKey(presentation)} p={presentation} />
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence initial={false}>
            {compact ? (
              <CompactLobby key="compact" m={model} url={joinUrl} roomCode={roomCode} />
            ) : (
              <LobbyFull key="full" m={model} morphIn={switched.current} url={joinUrl} roomCode={roomCode} />
            )}
          </AnimatePresence>
          {!preparing && <JoinCard compact={compact} />}
        </LayoutGroup>
      </div>
    </div>
  );
}

/** Join QR: the code on a white tile (its quiet zone) and "Scan to join". Never remounted between
 *  layouts; it sits on the right-hand panel's background, not in a card of its own. */
const JoinCard = memo(function JoinCard({ compact }: { compact: boolean }) {
  const { reduced } = useBoard();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const last = useRef(compact);
  useEffect(() => {
    if (last.current === compact) return;
    last.current = compact;
    if (reduced && scope.current) void animate(scope.current, { opacity: [0, 1] }, { duration: T.fade, ease: EASE_OUT_ARR });
  }, [compact, reduced, animate, scope]);
  return (
    <motion.div
      ref={scope}
      layout
      className="tvp-qr"
      transition={{ layout: { duration: T.morph, ease: EASE_MORPH_ARR } }}
      data-testid="tv-join-card"
    >
      <div className="tvp-qr-in">
        <QrImage target="join" className="tvp-qr-img" />
        <p className="tvp-qr-cta">Scan to join</p>
      </div>
    </motion.div>
  );
});
