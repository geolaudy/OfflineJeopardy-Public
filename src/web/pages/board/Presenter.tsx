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
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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

  // R8-6.4: when one menu page replaces another, the compact panel and its QR leave and arrive
  // with the page (the same quick slide/fade), instead of standing still. Not on the full ↔
  // compact morph. `translate` (not `transform`) so it never fights the QR's layout animation.
  const stageRef = useRef<HTMLDivElement>(null);
  const shownPage = compact && presentation ? pageKey(presentation) : null;
  const lastPage = useRef(shownPage);
  const { reduced } = useBoard();
  useEffect(() => {
    const prev = lastPage.current;
    lastPage.current = shownPage;
    if (!prev || !shownPage || prev === shownPage) return;
    const els = stageRef.current?.querySelectorAll<HTMLElement>('[data-testid="tv-lobby-compact"], [data-testid="tv-join-card"]') ?? [];
    const frames: Keyframe[] = reduced
      ? [{ opacity: 1 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }]
      : [
          { opacity: 1, translate: '0 0' },
          { opacity: 0, translate: '-1.5vw 0', offset: 0.35 },
          { opacity: 0, translate: '2.5vw 0', offset: 0.45 },
          { opacity: 1, translate: '0 0' },
        ];
    els.forEach((el) => el.animate(frames, { duration: T.page * 1.25 * 1000, easing: 'ease-out' }));
  }, [shownPage, reduced]);

  return (
    <div className={cx('tvp', compact ? 'is-compact' : 'is-full', roomCode && 'has-code', preparing && 'no-join')} data-testid="tv-presenter">
      <NavRail page={page} />
      <Wordmark />
      <div className="tvp-stage" ref={stageRef}>
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
              <CompactLobby key="compact" m={model} roomCode={roomCode} />
            ) : (
              <LobbyFull key="full" m={model} morphIn={switched.current} roomCode={roomCode} />
            )}
          </AnimatePresence>
          {!preparing && <JoinCard compact={compact} url={joinUrl} />}
        </LayoutGroup>
      </div>
    </div>
  );
}

/** R13-9: "or open <address>" under the code, the address's type made smaller until it is no wider
 *  than the code (measured, so any font and address length fit). R14-26: "or open" is a line of its
 *  own, centred above the address — both centred on the code. */
function JoinUrl({ url }: { url: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const p = ref.current;
    if (!p) return;
    const fit = () => {
      const addr = p.querySelector<HTMLElement>('.tvp-qr-addr');
      if (!addr) return;
      addr.style.fontSize = '';
      if (addr.offsetWidth > p.clientWidth) addr.style.fontSize = `${(parseFloat(getComputedStyle(addr).fontSize) * p.clientWidth * 0.98) / addr.offsetWidth}px`;
    };
    fit();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(p);
    return () => ro.disconnect();
  }, [url]);
  return (
    <p ref={ref} className="tvp-qr-url" data-testid="tv-join-url">
      <span className="tvp-qr-or">or open</span>
      <span className="tvp-qr-addr">{url}</span>
    </p>
  );
}

/** Join QR: the code on a white tile (its quiet zone) and "Scan to join". Never remounted between
 *  layouts; it sits on the right-hand panel's background, not in a card of its own. */
const JoinCard = memo(function JoinCard({ compact, url }: { compact: boolean; url: string | null }) {
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
        {/* R13-9: or type the address — centred under the code, as wide as the code at most. */}
        {url && <JoinUrl url={url} />}
      </div>
    </motion.div>
  );
});
