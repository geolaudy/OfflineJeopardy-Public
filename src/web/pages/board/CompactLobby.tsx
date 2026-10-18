// Compact lobby panel (R2-9, R6-8, R8-6): ONE panel in the top-right corner beside any presented
// page so joining stays possible — the join QR (the same element as on the full lobby, owned by
// Presenter, filling this panel's right-hand side), the player count, who is here, the board,
// buzzer readiness and a required room code. Presented pages leave this corner free.
import { useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { cx } from '../../components/ui';
import { boardName, type LobbyModel } from './lobbyModel';
import { Fade, SharedAvatar } from './presentKit';
import { useBoard, vhPx } from './common';
import { EASE_OUT_ARR, T } from './timing';

export const COMPACT_AVATARS = 6;
const COMPACT_TEAMS = 4;

export function CompactLobby({ m, roomCode }: { m: LobbyModel; roomCode: string | null }) {
  const ctx = useBoard();
  const known = useRef<Set<string> | null>(null);
  if (!known.current) known.current = new Set(m.people.map((p) => p.key));
  const shown = m.people.slice(0, m.people.length > COMPACT_AVATARS ? COMPACT_AVATARS - 1 : COMPACT_AVATARS);
  const more = m.people.length - shown.length;
  const teams = m.teams ?? [];
  const teamsShown = teams.slice(0, teams.length > COMPACT_TEAMS ? COMPACT_TEAMS - 1 : COMPACT_TEAMS);
  // Up to three teams get a full-width row each (names stay readable); more share two columns.
  const teamCols = teams.length > 3 ? 2 : 1;
  return (
    <div className="tvp-compact" data-testid="tv-lobby-compact">
      <Fade className="tvp-panel-bg" />
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
              {m.practice ? ' · Practice' : ''}
              {m.mode === 'team' && m.waitingPeople.length > 0 ? ` · ${m.waitingPeople.length} without a team` : ''}
            </span>
            {/* A required room code sits at the end of the count row (R7-2: the panel stays short). */}
            {roomCode && (
              <span className="tvp-compact-code" data-testid="tv-room-code">
                <span className="tvp-facts-k">Room code</span>
                <span className="tvp-addr-room">{roomCode}</span>
              </span>
            )}
          </Fade>
        )}

        {/* R5-3.4: teams in a team game — name, colour, players (of the limit) and buzzer readiness. */}
        {!m.preparing && m.teams && (
          <Fade className={cx('tvp-cteams', teamCols === 2 && 'is-two')} testId="tv-compact-teams">
            {teamsShown.map((t) => {
              const ready = t.shared ? t.shared.ready : t.members.length > 0 && t.members.every((p) => p.ready);
              return (
                <div key={t.key} className="tvp-cteam" style={{ '--pc': t.color } as CSSProperties} data-testid="tv-compact-team">
                  <span className="tvp-cteam-name">{t.name}</span>
                  <span className="tvp-cteam-n">
                    {t.members.length}
                    {m.maxPerTeam ? `/${m.maxPerTeam}` : ''}
                  </span>
                  <i className={cx('tvp-dot', ready && 'is-ready')} aria-label={ready ? 'Buzzers ready' : 'Buzzers not ready'} />
                </div>
              );
            })}
            {teams.length > teamsShown.length && <div className="tvp-cteam tvp-cteam-more">+{teams.length - teamsShown.length} more</div>}
          </Fade>
        )}
        {!m.preparing && !m.teams && (
          <div className="tvp-strip">
            <AnimatePresence propagate>
              {shown.map((p) => (
                <SharedAvatar key={p.key} p={p} size={vhPx(ctx, 3.3)} animateIn={!known.current!.has(p.key)} />
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
            {m.people.length === 0 && <span className="tvp-strip-none">No players yet</span>}
          </div>
        )}

        {!m.preparing && (
          <Fade className="tvp-facts" delay={0.05}>
            <div>
              <span className="tvp-facts-k">Board</span>
              <span className="tvp-facts-v">{boardName(m)}</span>
            </div>
            {/* Team games: each team row already shows its buzzer readiness. */}
            {m.buzzers > 0 && !m.teams && (
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
        {/* R8-6.1: no address line here (the QR has it, the full lobby shows it); a required room
            code is in the count row. */}
      </div>
    </div>
  );
}
