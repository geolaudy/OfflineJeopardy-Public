// Full-screen public lobby (R2-5, R6-7…R6-11): the board as the title, the players in one content
// panel, and ONE right-hand panel with the join QR + instructions and the game rules. The join QR
// itself lives in Presenter (it stays mounted and morphs between this screen and the compact
// panel); this panel leaves room for it in its top-right corner.
import { useRef, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Crown, Flame, Medal, Wifi, ScanLine, UserRound } from 'lucide-react';
import { Avatar, cx } from '../../components/ui';
import { avatarEmoji } from '../../lib/avatars';
import { boardMeta, boardName, countLabel, modeLabel, summaryText, type LobbyModel, type LobbyPerson, type LobbyTeam } from './lobbyModel';
import { DeviceTag, Fade, JoinAddress, SharedAvatar, StackedName, fitCards, useBoxSize, useFitScale } from './presentKit';
import { COMPACT_AVATARS } from './CompactLobby';
import { useBoard, vhPx } from './common';
import { EASE_OUT_ARR, T } from './timing';
import { LobbyGlow } from '../../lib/lobbyGlow';
import { useLive } from '../../lib/socket';

const MAX_PEOPLE = 30;

/** Keys present when this screen first rendered: those avatars morph in from the compact panel,
 *  anything added later is a new arrival and animates in on its own. */
function useKnownKeys(keys: string[]) {
  const ref = useRef<Set<string> | null>(null);
  if (!ref.current) ref.current = new Set(keys);
  return ref.current;
}

export function LobbyFull({ m, morphIn, roomCode }: { m: LobbyModel; morphIn: boolean; roomCode: string | null }) {
  const ctx = useBoard();
  const wifi = useLive((s) => s.lobby?.wifi);
  const known = useKnownKeys([...m.people.map((p) => p.key), ...(m.teams ?? []).map((t) => t.key)]);
  const rosterRef = useRef<HTMLDivElement>(null);
  const box = useBoxSize(rosterRef);
  const board = boardName(m);
  const meta = boardMeta(m.board);
  // The rules shrink a little when they would not fit under the join section (long rule lists).
  const rulesRef = useRef<HTMLElement>(null);
  const rulesBox = useBoxSize(rulesRef);
  const rulesScale = useFitScale(rulesRef, `${JSON.stringify(m.rules)}|${rulesBox.w}x${rulesBox.h}|${roomCode ?? ''}`);
  return (
    <div className="tvp-full" data-testid="tv-lobby-full">
      <div className="tvp-full-main">
        {m.preparing ? (
          <Fade className="tvp-head">
            <p className="tvp-kicker">{m.kicker}</p>
            <h1 className="tvp-title tvp-title-xl">{m.title}</h1>
            <p className="tvp-status" role="status">
              <i className={cx('tvp-dot', m.hostConnected && 'is-ready')} aria-hidden />
              {m.hostConnected ? 'The host is setting up the game…' : 'Waiting for the host to connect…'}
            </p>
          </Fade>
        ) : (
          // R6-10: eyebrow "Board", the board's name, then its size; no separate board card.
          <Fade className="tvp-head" testId="tv-lobby-board">
            <p className="tvp-kicker">Board</p>
            <h1 className="tvp-title tvp-title-xl">{board}</h1>
            <div className="tvp-head-meta">
              {meta && <span className="tvp-meta">{meta}</span>}
              <span className="tvp-chips">
                {m.title !== board && <span className="tvp-chip">{m.title}</span>}
                <span className="tvp-chip">{modeLabel(m.mode)}</span>
                <span className="tvp-chip" data-testid="tv-lobby-count">
                  {countLabel(m)}
                </span>
                {m.practice && <span className="tvp-chip is-accent">Practice game</span>}
              </span>
            </div>
          </Fade>
        )}

        <div className="tvp-roster-panel">
          <Fade className="tvp-panel-bg" />
          <div className="tvp-roster" ref={rosterRef}>
            {m.preparing ? (
              <Fade className="tvp-empty">
                <p className="tvp-empty-title">Players can get ready now</p>
                <p>Create or pick your profile on your phone. You can join as soon as the host opens the game.</p>
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
                    <StackedName name={p.name} realName={p.realName} free />
                  </span>
                ))}
              </span>
            </Fade>
          )}
        </div>
      </div>

      {/* R6-11: one panel — Join the Game (QR in the corner, steps, address) over the Game Rules. */}
      <div className="tvp-side" data-testid="tv-lobby-side">
        <Fade className="tvp-panel-bg" />
        <Fade className="tvp-side-in">
          <section className="tvp-join" aria-label="Join the Game">
            <div className="tvp-join-text">
              <p className="tvp-side-kicker">Join the Game</p>
              <ol className="tvp-steps">
                <li>
                  <Wifi aria-hidden />
                  {/* R12-13 / R13-9: the network itself is spelled out under the steps when shared. */}
                  {wifi ? <>Join the Wi-Fi below.</> : <>Join this Wi-Fi.</>}
                </li>
                {m.preparing ? (
                  <li>
                    <ScanLine aria-hidden /> The code appears here when the host opens the game.
                  </li>
                ) : (
                  <>
                    <li>
                      <ScanLine aria-hidden /> Scan the code.
                    </li>
                    <li>
                      <UserRound aria-hidden /> Pick your profile and join.
                    </li>
                  </>
                )}
              </ol>
            </div>
            {!m.preparing && <div className="tvp-join-slot" aria-hidden />}
            {/* R13-9: the join address is under the code (Presenter's JoinCard); this row has the
                Wi-Fi (and the password, once the host reveals it) and the room code. */}
            {wifi && (
              <dl className="tvp-wifi tvp-join-addr" data-testid="tv-wifi">
                <dt>Network:</dt>
                <dd data-testid="tv-wifi-ssid">{wifi.ssid}</dd>
                {wifi.password && (
                  <>
                    <dt>Password:</dt>
                    <dd className="tvp-wifi-pw" data-testid="tv-wifi-password">
                      {wifi.password}
                    </dd>
                  </>
                )}
              </dl>
            )}
            <JoinAddress url={null} roomCode={roomCode} className="tvp-join-addr" />
          </section>
          {!m.preparing && m.rules.length > 0 && (
            <section ref={rulesRef} className="tvp-rules-sec" style={{ '--s': rulesScale } as CSSProperties} data-testid="tv-lobby-rules">
              <p className="tvp-side-kicker">Game Rules</p>
              <dl>
                {m.rules.map((r) => (
                  <div key={r.label}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </Fade>
      </div>
    </div>
  );
}

function People({ people, known, morphIn, box }: { people: LobbyPerson[]; known: Set<string>; morphIn: boolean; box: { w: number; h: number } }) {
  const ctx = useBoard();
  const shown = people.slice(0, people.length > MAX_PEOPLE ? MAX_PEOPLE - 1 : MAX_PEOPLE);
  const more = people.length - shown.length;
  // R6-7: cards about 60 % of their former size (at most 9 % of the screen height) so more fit;
  // sized from the space available, so 1 or 30 players fill it at any aspect ratio. Text keeps a
  // readable minimum instead of shrinking with the card.
  const gap = ctx.vh * 0.012;
  // A profile name under a nickname (R7-3) needs a taller card when there is room for it.
  const stacked = shown.some((p) => p.realName);
  const fit = fitCards(shown.length + (more ? 1 : 0), box, { gap, maxH: ctx.vh * (stacked ? 0.105 : 0.088), minRatio: 2.3, maxCols: 6, idealRatio: 3.4 });
  const cardH = Math.max(ctx.vh * 0.055, fit.cardH);
  // Few players: cards keep their proportions instead of stretching across the screen.
  const maxW = Math.max(cardH * 3.6, ctx.vh * 0.3);
  const cardW = Math.min(fit.cardW, maxW);
  const name = Math.max(ctx.vh * 0.019, Math.min(ctx.vh * 0.027, cardH * 0.3, cardW * 0.098));
  const col = fit.cardW > maxW ? `${Math.floor(maxW)}px` : 'minmax(0, 1fr)';
  return (
    <div className="tvp-people" style={{ gridTemplateColumns: `repeat(${fit.cols}, ${col})`, gridAutoRows: `${cardH}px`, gap: `${gap}px`, '--name': `${name}px` } as CSSProperties}>
      <AnimatePresence propagate>
        {shown.map((p, i) => (
          <PersonCard key={p.key} p={p} av={cardH * 0.62} size={`${Math.round(cardW)}x${Math.round(cardH)}`} isNew={!known.has(p.key)} animateAvatar={morphIn && i >= COMPACT_AVATARS - 1 && known.has(p.key)} />
        ))}
      </AnimatePresence>
      {more > 0 && <Fade className="tvp-person tvp-more">+{more} more</Fade>}
    </div>
  );
}

function PersonCard({ p, av, size, isNew, animateAvatar }: { p: LobbyPerson; av: number; size: string; isNew: boolean; animateAvatar: boolean }) {
  // R7-3: names are never cut off — they shrink and wrap, and the card's text shrinks as a whole
  // when a wrapped name would not fit the card's height.
  const textRef = useRef<HTMLDivElement>(null);
  // R14-27: the statistics and device lines shrink the text too when they are wider than the card
  // (the streak was cut off); the streak is part of the key.
  const fit = useFitScale(textRef, `${size}|${p.name}|${p.realName ?? ''}|${summaryText(p.summary) ?? ''}|${p.summary?.streak ?? ''}|${p.level ?? ''}|${p.device}|${p.ready}|${p.latencyMs ?? ''}`, 0.62, true);
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
      <LobbyGlow id={p.pid} />
      <span className="tvp-av-wrap">
        <SharedAvatar p={p} size={av} animateIn={animateAvatar} />
        <Marks p={p} />
      </span>
      <Fade className="tvp-person-text">
        <div ref={textRef} className="tvp-person-fit" style={{ '--s': fit } as CSSProperties}>
          <span className="tvp-person-name">
            <StackedName name={p.name} realName={p.realName} />
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
          <DeviceTag device={p.device} ready={p.ready} latencyMs={p.latencyMs} />
        </div>
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
  // Member line height from the space each team card gets (card chrome is about 9vh). A profile
  // name under a nickname (R7-3) makes a member row taller.
  const stacked = teams.some((t) => t.members.some((p) => p.realName));
  const perTeamVh = ((box.h / ctx.vh) * 100 - (rowsOfTeams - 1) * 1.6) / rowsOfTeams;
  const lineVh = Math.max(2.4, Math.min(4.6, (perTeamVh - 9) / (most * (stacked ? 1.65 : 1.2))));
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
              {t.shared &&
                (t.shared.device === 'No team buzzer yet' ? (
                  <DeviceTag device="Team buzzer not set" ready={false} />
                ) : (
                  <DeviceTag prefix="Team buzzer: " device={t.shared.device} ready={t.shared.ready} latencyMs={t.shared.latencyMs} />
                ))}
            </Fade>
            <ul className="tvp-team-members" style={{ '--line': `${lineVh}vh` } as CSSProperties}>
              {t.members.length === 0 && <li className="tvp-team-none">No players yet</li>}
              {t.members.map((p) => {
                const i = index++;
                const wins = p.summary && !p.summary.private && p.summary.games > 0 ? `${p.summary.wins} ${p.summary.wins === 1 ? 'win' : 'wins'}` : null;
                return (
                  <li key={p.key}>
                    <span className="tvp-av-wrap">
                      <SharedAvatar p={p} size={vhPx(ctx, lineVh * 0.78)} animateIn={!known.has(p.key) || (morphIn && i >= COMPACT_AVATARS - 1)} />
                      <Marks p={p} />
                    </span>
                    <Fade className="tvp-team-member">
                      <StackedName name={p.name} realName={p.realName} len={p.name.length + (wins ? wins.length + 3 : 0)}>
                        {wins && <span className="tvp-member-stats"> · {wins}</span>}
                      </StackedName>
                      {!t.shared && <DeviceTag device={p.device} ready={p.ready} latencyMs={p.latencyMs} />}
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
