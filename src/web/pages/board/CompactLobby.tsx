// Compact lobby panel (R2-9): shown beside any presented page so joining stays possible. The join
// QR card above it is the same element as on the full lobby (owned by Presenter).
import { useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cx } from '../../components/ui';
import { modeLabel, type LobbyModel } from './lobbyModel';
import { Fade, SharedAvatar } from './presentKit';
import { useBoard, vhPx } from './common';
import { EASE_OUT_ARR, T } from './timing';

export const COMPACT_AVATARS = 6;

export function CompactLobby({ m }: { m: LobbyModel }) {
  const ctx = useBoard();
  const known = useRef<Set<string> | null>(null);
  if (!known.current) known.current = new Set(m.people.map((p) => p.key));
  const shown = m.people.slice(0, m.people.length > COMPACT_AVATARS ? COMPACT_AVATARS - 1 : COMPACT_AVATARS);
  const more = m.people.length - shown.length;
  return (
    <div className="tvp-compact" data-testid="tv-lobby-compact">
      <Fade className="tvp-compact-bg" />
      <div className="tvp-compact-inner">
        {m.preparing ? (
          <Fade className="tvp-compact-count">
            <span className="tvp-compact-label">{m.title}</span>
            <span className="tvp-compact-status">
              <i className={cx('tvp-dot', m.hostConnected && 'is-ready')} aria-hidden />
              Getting ready
            </span>
          </Fade>
        ) : (
          <Fade className="tvp-compact-count">
            <span className="tvp-compact-num">{m.count}</span>
            <span className="tvp-compact-of">
              {m.max > 0 ? `of ${m.max} players` : m.count === 1 ? 'player joined' : 'players joined'}
            </span>
          </Fade>
        )}

        {/* R5-3.4: teams in a team game — name, colour, players (of the limit) and buzzer readiness. */}
        {!m.preparing && m.teams && (
          <Fade className="tvp-cteams" testId="tv-compact-teams">
            {m.teams.slice(0, 6).map((t) => {
              const ready = t.shared ? t.shared.ready : t.members.length > 0 && t.members.every((p) => p.ready);
              return (
                <div key={t.key} className="tvp-cteam" style={{ '--pc': t.color } as CSSProperties} data-testid="tv-compact-team">
                  <span className="tvp-cteam-dot" aria-hidden />
                  <span className="tvp-cteam-name">{t.name}</span>
                  <span className="tvp-cteam-n">
                    {t.members.length}
                    {m.maxPerTeam ? `/${m.maxPerTeam}` : ''}
                  </span>
                  <i className={cx('tvp-dot', ready && 'is-ready')} aria-label={ready ? 'Buzzers ready' : 'Buzzers not ready'} />
                </div>
              );
            })}
            {m.teams.length > 6 && <div className="tvp-cteam-more">+{m.teams.length - 6} more teams</div>}
            {m.waitingPeople.length > 0 && <div className="tvp-cteam-more">{m.waitingPeople.length} not on a team</div>}
          </Fade>
        )}
        {!m.preparing && !m.teams && (
          <div className="tvp-strip">
            <AnimatePresence propagate>
              {shown.map((p) => (
                <SharedAvatar key={p.key} p={p} size={vhPx(ctx, 3.9)} animateIn={!known.current!.has(p.key)} />
              ))}
              {more > 0 && (
                <motion.span
                  key="more"
                  className="tvp-strip-more"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { duration: T.morphFadeIn, delay: T.morph * 0.4, ease: EASE_OUT_ARR } }}
                  exit={{ opacity: 0, transition: { duration: T.morphFadeOut } }}
                >
                  +{more}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        )}

        {!m.preparing && (
          <Fade className="tvp-facts" delay={0.05}>
            <div>
              <span className="tvp-facts-k">Board</span>
              <span className="tvp-facts-v truncate">{m.boardTitle ?? m.title}</span>
            </div>
            <div>
              <span className="tvp-facts-k">Mode</span>
              <span className="tvp-facts-v">
                {modeLabel(m.mode)}
                {m.practice ? ' · Practice' : ''}
              </span>
            </div>
            {m.buzzers > 0 && (
              <div>
                <span className="tvp-facts-k">Buzzers</span>
                <span className="tvp-facts-v tvp-facts-ready">
                  <i className={cx('tvp-dot', m.ready === m.buzzers && 'is-ready')} aria-hidden />
                  {m.ready} of {m.buzzers} ready
                </span>
              </div>
            )}
          </Fade>
        )}
      </div>
    </div>
  );
}
