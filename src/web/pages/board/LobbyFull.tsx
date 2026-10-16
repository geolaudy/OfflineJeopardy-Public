// Full-screen public lobby (R2-5): title, board, mode, players (avatars, colours, teams), subtle
// controller readiness and how to join. The join QR card itself lives in Presenter (it stays
// mounted and morphs between this screen and the compact panel).
import { useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Crown, Flame, Medal, Wifi, ScanLine, UserRound } from 'lucide-react';
import { Avatar, cx } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { countLabel, modeLabel, summaryText, type LobbyModel, type LobbyPerson, type LobbyTeam } from './lobbyModel';
import { DeviceTag, Fade, SharedAvatar, fitCards, useBoxSize } from './presentKit';
import { COMPACT_AVATARS } from './CompactLobby';
import { useBoard, vhPx } from './common';
import { EASE_OUT_ARR, T } from './timing';

const MAX_PEOPLE = 30;

/** Keys present when this screen first rendered: those avatars morph in from the compact panel,
 *  anything added later is a new arrival and animates in on its own. */
function useKnownKeys(keys: string[]) {
  const ref = useRef<Set<string> | null>(null);
  if (!ref.current) ref.current = new Set(keys);
  return ref.current;
}

export function LobbyFull({ m, morphIn }: { m: LobbyModel; morphIn: boolean }) {
  const ctx = useBoard();
  const known = useKnownKeys([...m.people.map((p) => p.key), ...(m.teams ?? []).map((t) => t.key)]);
  const rosterRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(rosterRef);
  return (
    <div className="tvp-full" data-testid="tv-lobby-full">
      <div className="tvp-full-main">
        <Fade className="tvp-head">
          <p className="tvp-kicker">{m.kicker}</p>
          <h1 className="tvp-title tvp-title-xl">{m.title}</h1>
          {m.preparing ? (
            <p className="tvp-status" role="status">
              <i className={cx('tvp-dot', m.hostConnected && 'is-ready')} aria-hidden />
              {m.hostConnected ? 'The host is setting up the game…' : 'Waiting for the host to connect…'}
            </p>
          ) : (
            <div className="tvp-chips">
              {m.boardTitle && <span className="tvp-chip">{m.boardTitle}</span>}
              <span className="tvp-chip">{modeLabel(m.mode)}</span>
              <span className="tvp-chip" data-testid="tv-lobby-count">
                {countLabel(m)}
              </span>
              {m.practice && <span className="tvp-chip is-accent">Practice game</span>}
            </div>
          )}
        </Fade>

        <div className="tvp-roster" ref={rosterRef}>
          {m.preparing ? (
            <Fade className="tvp-empty">
              <p className="tvp-empty-title">Players can get ready now</p>
              <p>Scan the code to create or pick your profile. You can join as soon as the host opens the game.</p>
            </Fade>
          ) : m.teams ? (
            box.w > 0 && <Teams teams={m.teams} known={known} morphIn={morphIn} box={box} maxPerTeam={m.maxPerTeam} />
          ) : m.people.length ? (
            box.w > 0 && <People people={m.people} known={known} morphIn={morphIn} box={box} />
          ) : (
            <Fade className="tvp-empty">
              <p className="tvp-empty-title">No players yet</p>
              <p>Scan the code with your phone to join.</p>
            </Fade>
          )}
        </div>

        {(m.markers.crown || m.markers.leader) && (
          <Fade className="tvp-legend" testId="tv-lobby-legend">
            {m.markers.crown && (
              <span>
                <Crown className="tvp-mark is-crown" aria-hidden /> Won the last game
              </span>
            )}
            {m.markers.leader && (
              <span>
                <Medal className="tvp-mark is-leader" aria-hidden /> Most wins here
              </span>
            )}
          </Fade>
        )}

        {m.mode === 'team' && m.waitingPeople.length > 0 && (
          <Fade className="tvp-waiting" testId="tv-unassigned">
            <span className="tvp-waiting-label">Not on a team yet</span>
            <span className="tvp-waiting-people">
              {m.waitingPeople.map((p, i) => (
                <span key={`${p.name}:${i}`} className="tvp-waiting-person">
                  <Avatar profile={{ name: p.name, color: p.color, avatar: p.avatar, pictureUrl: p.pictureUrl }} size={vhPx(ctx, 3.4)} />
                  {p.name}
                  {p.realName && <span className="tvp-real">({p.realName})</span>}
                </span>
              ))}
            </span>
          </Fade>
        )}
      </div>

      <Fade className="tvp-howto" delay={0.1}>
        <p className="tvp-howto-title">How to join</p>
        <ol>
          <li>
            <Wifi aria-hidden /> Same Wi-Fi as this computer.
          </li>
          <li>
            <ScanLine aria-hidden /> Scan the code.
          </li>
          <li>
            <UserRound aria-hidden /> Pick your profile{m.preparing ? '' : ' and join'}.
          </li>
        </ol>
      </Fade>

      {!m.preparing && (
        <div className="tvp-side" data-testid="tv-lobby-side">
          {m.board && (
            <Fade className="tvp-side-card" testId="tv-lobby-board">
              <p className="tvp-side-kicker">Board</p>
              <p className="tvp-side-board">{m.board.title}</p>
              <p className="tvp-side-meta">
                {m.board.rounds} {m.board.rounds === 1 ? 'round' : 'rounds'} · {m.board.clues} clues{m.board.final ? ' · Final Jeopardy!' : ''}
              </p>
            </Fade>
          )}
          <Fade className="tvp-side-card tvp-side-rules" testId="tv-lobby-rules">
            <p className="tvp-side-kicker">Rules</p>
            <dl>
              {m.rules.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </Fade>
        </div>
      )}
    </div>
  );
}

function People({ people, known, morphIn, box }: { people: LobbyPerson[]; known: Set<string>; morphIn: boolean; box: { w: number; h: number } }) {
  const ctx = useBoard();
  const shown = people.slice(0, people.length > MAX_PEOPLE ? MAX_PEOPLE - 1 : MAX_PEOPLE);
  const more = people.length - shown.length;
  // Size the cards from the space available, so 1 or 30 players fill it at any aspect ratio.
  const gap = ctx.vh * 0.014;
  const fit = fitCards(shown.length + (more ? 1 : 0), box, { gap, maxH: ctx.vh * 0.15, minRatio: 2.5, maxCols: 5 });
  const cardH = Math.max(ctx.vh * 0.05, fit.cardH);
  const name = Math.min(cardH * 0.3, fit.cardW * 0.085);
  return (
    <div className="tvp-people" style={{ gridTemplateColumns: `repeat(${fit.cols}, minmax(0, 1fr))`, gridAutoRows: `${cardH}px`, '--name': `${name}px` } as CSSProperties}>
      <AnimatePresence propagate>
        {shown.map((p, i) => (
          <PersonCard key={p.key} p={p} av={cardH * 0.62} isNew={!known.has(p.key)} animateAvatar={morphIn && i >= COMPACT_AVATARS - 1 && known.has(p.key)} />
        ))}
      </AnimatePresence>
      {more > 0 && <Fade className="tvp-person tvp-more">+{more} more</Fade>}
    </div>
  );
}

function PersonCard({ p, av, isNew, animateAvatar }: { p: LobbyPerson; av: number; isNew: boolean; animateAvatar: boolean }) {
  return (
    <motion.div
      layout="position"
      className="tvp-person"
      style={{ '--pc': p.color } as CSSProperties}
      initial={isNew ? { opacity: 0, scale: 0.85 } : false}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: T.fade, ease: EASE_OUT_ARR }}
      data-testid="tv-lobby-player"
    >
      <Fade className="tvp-person-bg" />
      <span className="tvp-av-wrap">
        <SharedAvatar p={p} size={av} animateIn={animateAvatar} />
        <Marks p={p} />
      </span>
      <Fade className="tvp-person-text">
        <span className="tvp-person-name">
          <span className="tvp-person-name-text">{p.name}</span>
          {p.realName && <span className="tvp-real">({p.realName})</span>}
        </span>
        {p.level ? (
          <span className="tvp-person-stats">
            <span className="tvp-bot-badge" data-testid="tv-bot-level">
              {p.level}
            </span>
          </span>
        ) : (
          <Summary p={p} />
        )}
        <DeviceTag device={p.device} ready={p.ready} />
      </Fade>
    </motion.div>
  );
}

/** Crown (won the last game) and medal (most wins here) on the avatar. */
function Marks({ p }: { p: LobbyPerson }) {
  if (!p.crown && !p.leader) return null;
  return (
    <>
      {p.crown && <Crown className="tvp-mark is-crown tvp-mark-tl" aria-label="Won the last game" data-testid="tv-crown" />}
      {p.leader && (
        <span className="tvp-mark-br" aria-label="Most wins here" data-testid="tv-leader">
          <Medal className="tvp-mark is-leader" aria-hidden />
        </span>
      )}
    </>
  );
}

function Summary({ p }: { p: LobbyPerson }) {
  const text = p.bot ? null : summaryText(p.summary);
  if (!text) return null;
  return (
    <span className="tvp-person-stats" data-testid="tv-player-stats">
      {text}
      {!p.summary?.private && (p.summary?.streak ?? 0) >= 2 && (
        <span className="tvp-streak">
          <Flame aria-hidden /> {p.summary!.streak} in a row
        </span>
      )}
    </span>
  );
}

function Teams({ teams, known, morphIn, box, maxPerTeam }: { teams: LobbyTeam[]; known: Set<string>; morphIn: boolean; box: { w: number; h: number }; maxPerTeam: number }) {
  const ctx = useBoard();
  if (!teams.length)
    return (
      <Fade className="tvp-empty">
        <p className="tvp-empty-title">No teams yet</p>
        <p>Scan the code to join — the host puts everyone on a team.</p>
      </Fade>
    );
  const cols = Math.max(1, Math.min(teams.length <= 4 ? 2 : teams.length <= 6 ? 3 : 4, Math.floor(box.w / (ctx.vh * 0.3))));
  const most = Math.max(1, ...teams.map((t) => t.members.length));
  const rowsOfTeams = Math.ceil(teams.length / cols);
  // Member line height from the space each team card gets (card chrome is about 9vh).
  const perTeamVh = ((box.h / ctx.vh) * 100 - (rowsOfTeams - 1) * 1.6) / rowsOfTeams;
  const lineVh = Math.max(2.4, Math.min(5.4, (perTeamVh - 9) / (most * 1.2)));
  let index = 0;
  return (
    <div className="tvp-teams" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      <AnimatePresence propagate>
        {teams.map((t) => (
          <motion.section
            key={t.key}
            layout="position"
            className="tvp-team"
            style={{ '--pc': t.color } as CSSProperties}
            initial={known.has(t.key) ? false : { opacity: 0, y: '2vh' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: T.fade, ease: EASE_OUT_ARR }}
          >
            <Fade className="tvp-team-bg" />
            <Fade className="tvp-team-head">
              <span className="tvp-team-emoji" aria-hidden>
                {avatarEmoji(t.avatar)}
              </span>
              <span className="tvp-team-name">
                {t.crown && <Crown className="tvp-mark is-crown tvp-team-crown" aria-label="Won the last game" />}
                {t.name}
              </span>
              <span className="tvp-team-cap" data-testid="tv-team-capacity">
                {maxPerTeam ? `${t.members.length} / ${maxPerTeam}` : `${t.members.length} ${t.members.length === 1 ? 'player' : 'players'}`}
              </span>
              {t.record && t.record.games > 0 && (
                <span className="tvp-team-record">
                  {t.record.wins} {t.record.wins === 1 ? 'win' : 'wins'} · {t.record.games} {t.record.games === 1 ? 'game' : 'games'}
                </span>
              )}
              {t.shared && <DeviceTag device={t.shared.device === 'No team buzzer yet' ? 'Team buzzer not set' : `Team buzzer: ${t.shared.device}`} ready={t.shared.ready} />}
            </Fade>
            <ul className="tvp-team-members" style={{ '--line': `${lineVh}vh` } as CSSProperties}>
              {t.members.length === 0 && <li className="tvp-team-none">No players yet</li>}
              {t.members.map((p) => {
                const i = index++;
                return (
                  <li key={p.key}>
                    <span className="tvp-av-wrap">
                      <SharedAvatar p={p} size={vhPx(ctx, lineVh * 0.78)} animateIn={!known.has(p.key) || (morphIn && i >= COMPACT_AVATARS - 1)} />
                      <Marks p={p} />
                    </span>
                    <Fade className="tvp-team-member">
                      <span className="min-w-0 truncate">
                        {p.name}
                        {p.realName && <span className="tvp-real"> ({p.realName})</span>}
                        {p.summary && !p.summary.private && p.summary.games > 0 && (
                          <span className="tvp-member-stats">
                            {' '}
                            · {p.summary.wins} {p.summary.wins === 1 ? 'win' : 'wins'}
                          </span>
                        )}
                      </span>
                      {!t.shared && <DeviceTag device={p.device} ready={p.ready} />}
                    </Fade>
                  </li>
                );
              })}
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  );
}
