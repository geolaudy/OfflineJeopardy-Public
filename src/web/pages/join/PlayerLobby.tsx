// The player's lobby on the phone (R5-17): no buzzer before the game — who is here, the teams
// (pick / leave / switch, rename and recolour your own), the board and rules, your buzzer, and a
// nickname for this lobby. Tapping another player opens their public statistics.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BellRing, Gamepad2, Keyboard, LogOut, Pencil, Smartphone, Users } from 'lucide-react';
import { pressStamp, send, useLive } from '../../lib/socket';
import { meApi } from '../../lib/api';
import { unlockAudio } from '../../lib/sound';
import { Avatar, Button, Modal, cx, inputCls, toast } from '../../components/ui';
import { PersonName } from '../../components/PersonName';
import { competitorAvatar } from '../../lib/view';
import { avatarEmoji } from '../../lib/avatars';
import { TEAM_COLORS } from '../../../shared/game';
import { lobbyRules } from '../../../shared/rulesSummary';
import type { GameView } from '../../../shared/views';
import type { Me } from './JoinPage';
import { LobbyGlow, useLobbyGlow } from '../../lib/lobbyGlow';

/** Sends a lobby message and reports the server's answer (errors arrive as 'oj-error'). */
function useLobbyError() {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onErr = (e: Event) => setError((e as CustomEvent<string>).detail);
    window.addEventListener('oj-error', onErr);
    return () => window.removeEventListener('oj-error', onErr);
  }, []);
  return [error, setError] as const;
}

/** Which buzzer this player uses (device type only). */
export function myBuzzer(g: GameView, profileId: string): { label: string; icon: typeof Smartphone } {
  const mine = g.bindings.find((b) => b.target.kind === 'profile' && b.target.profileId === profileId);
  const team = g.competitors.find((c) => c.kind === 'team' && c.memberIds.includes(profileId));
  const shared = team?.buzzerMode === 'shared' ? g.bindings.find((b) => b.target.kind === 'competitor' && b.target.competitorId === team.id) : undefined;
  const b = shared ?? mine;
  if (team?.buzzerMode === 'shared' && !shared) return { label: 'Team buzzer (not set yet)', icon: Users };
  if (!b || b.kind === 'phone') return { label: team?.buzzerMode === 'shared' ? 'Team buzzer' : 'This phone', icon: Smartphone };
  const icon = b.kind === 'keyboard' ? Keyboard : Gamepad2;
  return { label: `${shared ? 'Team buzzer: ' : ''}${b.label || (b.kind === 'joycon' ? 'Joy-Con' : 'Controller')}`, icon };
}

export function PlayerLobby({ me, join }: { me: Me; join: React.ReactNode }) {
  const g = useLive((s) => s.game)!;
  const ctx = useLive((s) => s.me);
  const navigate = useNavigate();
  const [error, setError] = useLobbyError();
  const inGame = !!ctx?.competitorId || g.unassigned.some((u) => u.profileId === me.id && !u.pending);
  const pending = !!ctx?.pending || g.unassigned.some((u) => u.profileId === me.id && u.pending);
  const myTeam = g.competitors.find((c) => c.kind === 'team' && c.memberIds.includes(me.id));
  const teams = g.competitors.filter((c) => c.kind === 'team');
  const max = g.rules.maxPerTeam;
  const profile = g.profiles[me.id] ?? { ...me, nickname: '' };
  const buzzer = myBuzzer(g, me.id);
  const BuzzIcon = buzzer.icon;
  const open = (id: string) => id !== me.id && navigate(`/join/players/${id}`);
  const pick = (competitorId: string | null) => {
    setError(null);
    send({ t: 'pickTeam', competitorId });
  };
  const rounds = g.rounds.filter((r) => r.kind === 'standard').length;

  return (
    <div className="space-y-4" data-testid="player-lobby">
      <section className="relative flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm" data-testid="my-lobby-card">
        <LobbyGlow id={me.id} />
        <Avatar profile={{ ...profile, color: ctx?.color?.current ?? profile.color }} size={52} />
        <div className="min-w-0 flex-1">
          <PersonName p={profile} className="text-lg font-bold" realClassName="text-sm" />
          {inGame && (
            <p className="flex items-center gap-1 text-sm text-slate-600" data-testid="my-buzzer">
              <BuzzIcon size={15} aria-hidden /> {buzzer.label}
            </p>
          )}
        </div>
        {inGame && (me.guest ? <GuestNameButton name={profile.name} /> : <NicknameButton current={profile.nickname ?? ''} />)}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Lobby</p>
        <p className="text-xl font-black" data-testid="lobby-title">{g.title}</p>
        <p className="text-sm text-slate-600">
          {g.mode === 'team' ? 'Teams' : 'Individuals'} · {rounds} {rounds === 1 ? 'round' : 'rounds'}
          {g.rounds.some((r) => r.kind === 'final') ? ' · Final Jeopardy!' : ''}
          {g.practice ? ' · Practice' : ''}
        </p>
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-blue-700">Rules</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            {lobbyRules(g.rules, { mode: g.mode, teams: teams.length }).map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-slate-500">{l.label}</dt>
                <dd className="font-semibold">{l.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </section>

      {pending ? (
        <p className="rounded-2xl bg-amber-100 p-4 text-center font-semibold text-amber-900">Waiting for the host to let you in…</p>
      ) : !inGame ? (
        join
      ) : (
        <div className="space-y-2">
          <p className="rounded-2xl bg-green-50 p-3 text-center font-semibold text-green-800 ring-1 ring-green-200" data-testid="lobby-joined">
            You’re in! The buzzer appears when the game starts.
          </p>
          <TestBuzzer me={me} />
        </div>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {error}
        </p>
      )}

      {g.mode === 'team' ? (
        <section className="space-y-3" data-testid="phone-teams">
          {inGame && !myTeam && <p className="text-center font-semibold text-slate-700">Pick a team:</p>}
          {teams.map((t) => {
            const mine = myTeam?.id === t.id;
            const full = max > 0 && t.memberIds.length >= max;
            return (
              <div key={t.id} className={cx('rounded-2xl bg-white p-3 shadow-sm ring-2', mine ? 'ring-blue-600' : 'ring-transparent')} style={{ borderLeft: `0.5rem solid ${t.color}` }} data-testid="phone-team">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg" style={{ background: t.color }} aria-hidden>
                    {avatarEmoji(t.avatar)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{t.name}</p>
                    <p className="text-xs text-slate-500">{max ? `${t.memberIds.length} / ${max} Players` : `${t.memberIds.length} ${t.memberIds.length === 1 ? 'Player' : 'Players'}`}</p>
                  </div>
                  {inGame &&
                    (mine ? (
                      <TeamIdentityButton name={t.name} color={t.color} taken={teams.filter((x) => x.id !== t.id).map((x) => x.color.toLowerCase())} />
                    ) : (
                      <Button size="sm" disabled={full} onClick={() => pick(t.id)} data-testid="phone-join-team">
                        {full ? 'Full' : myTeam ? 'Switch' : 'Join'}
                      </Button>
                    ))}
                </div>
                {t.memberIds.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {t.memberIds.map((m) => (
                      <li key={m}>
                        <button className="relative flex min-h-9 items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-3 pl-0.5 text-sm" onClick={() => open(m)} data-testid="phone-lobby-player">
                          <LobbyGlow id={m} />
                          <Avatar profile={g.profiles[m]} size={28} />
                          <PersonName p={g.profiles[m]} className="font-semibold" realClassName="text-xs" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {mine && (
                  <button className="mt-2 flex min-h-10 items-center gap-1 text-sm font-semibold text-slate-600" onClick={() => pick(null)} data-testid="phone-leave-team">
                    <LogOut size={15} aria-hidden /> Leave team
                  </button>
                )}
              </div>
            );
          })}
          <People g={g} ids={g.unassigned.filter((u) => !u.pending).map((u) => u.profileId)} title="Not on a team yet" onOpen={open} />
        </section>
      ) : (
        <People g={g} ids={g.competitors.flatMap((c) => c.memberIds)} bots={g.competitors.filter((c) => c.bot).map((c) => c.id)} title={`Players (${g.competitors.length})`} onOpen={open} />
      )}
    </div>
  );
}

function People({ g, ids, bots = [], title, onOpen }: { g: GameView; ids: string[]; bots?: string[]; title: string; onOpen: (id: string) => void }) {
  if (!ids.length && !bots.length) return null;
  return (
    <section className="rounded-2xl bg-white p-3 shadow-sm" data-testid="phone-lobby-people">
      <p className="mb-2 text-sm font-bold text-slate-600">{title}</p>
      <ul className="grid gap-1.5">
        {ids.map((id) => (
          <li key={id}>
            <button className="relative flex min-h-12 w-full items-center gap-2 rounded-xl px-1 text-left hover:bg-slate-50" onClick={() => onOpen(id)} data-testid="phone-lobby-player">
              <LobbyGlow id={id} />
              <Avatar profile={g.profiles[id]} size={36} />
              <PersonName p={g.profiles[id]} className="flex-1 font-semibold" realClassName="text-sm" />
              {g.online?.includes(id) && <span className="text-xs text-green-700">● online</span>}
            </button>
          </li>
        ))}
        {bots.map((id) => {
          const c = g.competitors.find((x) => x.id === id)!;
          return (
            <li key={id} className="flex min-h-12 items-center gap-2 px-1">
              <Avatar profile={competitorAvatar(c, g)} size={36} />
              <span className="font-semibold">{c.name}</span>
              <span className="text-xs text-slate-500">Computer</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * R12-12: try the buzzer before the game — the in-game buzzer, always "open". A press goes to the
 * server as a normal buzz; in the lobby the server only lights this player's lobby card on every
 * screen (no score, timer, lockout or statistic). The phone confirms at once, then again when the
 * server's glow comes back.
 */
function TestBuzzer({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [count, setCount] = useState(0);
  const lastSent = useRef(-Infinity);
  const glowing = useLobbyGlow(me.id) != null;
  useEffect(() => {
    if (!open) setCount(0);
  }, [open]);
  const press = (ev: { timeStamp: number }) => {
    const now = performance.now();
    if (now - lastSent.current < 300) return; // finger bounce, as in the game
    lastSent.current = now;
    unlockAudio();
    setPressed(true);
    setTimeout(() => setPressed(false), 180);
    navigator.vibrate?.(30);
    setCount((n) => n + 1);
    send({ t: 'buzz', ...pressStamp(ev.timeStamp) });
  };
  return (
    <>
      <Button size="lg" variant="secondary" className="w-full" onClick={() => setOpen(true)} data-testid="test-buzzer-open">
        <BellRing size={20} aria-hidden /> Test Buzzer
      </Button>
      {/* R15-8 / R15-9: on the page itself (a portal): inside the portal's scrolling main an iPhone
          drew it under the white page header — its back control hidden, the edge of a white button
          showing below the header. A back arrow like every page header's returns to the lobby
          (nothing is left: the player stays joined, with their nickname). */}
      {open &&
        createPortal(
        <div className="fade-in fixed inset-0 z-50 flex flex-col gap-3 bg-slate-950 p-4 pt-[max(1rem,var(--safe-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-white" role="dialog" aria-modal="true" aria-label="Test your buzzer" data-testid="test-buzzer">
          <div className="-mx-2 -mt-1 flex items-center gap-1">
            <button type="button" onClick={() => setOpen(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 active:bg-white/20" aria-label="Back to the lobby" data-testid="test-buzzer-done">
              <ArrowLeft size={24} aria-hidden />
            </button>
            <p className="min-w-0 flex-1 text-lg font-bold">Test your buzzer</p>
          </div>
          <p className="text-sm text-white/70">Press it like in the game. Your card in the lobby lights up yellow for everyone — nothing counts and the game does not start.</p>
          <button
            onPointerDown={press}
            onContextMenu={(e) => e.preventDefault()}
            className={cx(
              'relative flex min-h-[13rem] w-full flex-1 flex-col items-center justify-center gap-2 rounded-[2rem] bg-yellow-400 px-4 font-black text-yellow-950 shadow-[0_8px_0_#a16207] transition-[transform,filter] duration-75 select-none [-webkit-tap-highlight-color:transparent] [-webkit-touch-callout:none] [touch-action:none]',
              pressed && 'scale-[0.985] brightness-90',
            )}
            aria-label="Test buzzer"
            data-testid="test-buzzer-button"
          >
            <span className="text-[clamp(2.5rem,12vw,4.5rem)] leading-none tracking-wide">BUZZ!</span>
            <span className="text-base font-bold opacity-90 sm:text-lg">Test</span>
          </button>
          <p className="h-14 text-center text-lg font-semibold" role="status" data-testid="test-buzzer-status">
            {count === 0 ? 'Tap the buzzer' : glowing ? 'Your card is glowing on the TV!' : `Pressed ${count} ${count === 1 ? 'time' : 'times'}`}
          </p>
        </div>,
          document.body,
        )}
    </>
  );
}

/** R12-11: a guest's name is their only name, so renaming changes it everywhere at once. */
function GuestNameButton({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(name), [name, open]);
  const ok = value.trim().length > 0 && value.trim().length <= 30;
  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await meApi('PATCH', '/api/me', { name: value.trim() });
      setOpen(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="nickname-open">
        <Pencil size={14} aria-hidden /> Nickname
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your nickname">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Shown on the TV and the scoreboard.</p>
          <div className="flex flex-wrap gap-2" data-keep-visible>
            <div className="min-w-0 flex-[1_1_12rem]">
              <input className={inputCls} value={value} maxLength={30} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} enterKeyHint="done" aria-label="Nickname" data-testid="nickname-input" autoFocus />
            </div>
            <div className="flex flex-[1_1_10rem] gap-2">
              <Button size="lg" variant="secondary" className="flex-1" onClick={() => setOpen(false)} data-testid="nickname-cancel">
                Cancel
              </Button>
              <Button size="lg" className="flex-1" onClick={() => void save()} disabled={!ok} busy={busy} data-testid="nickname-save">
                Save
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** A nickname for this lobby only (R5-17.5): the profile name stays unchanged. */
function NicknameButton({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current, open]);
  const save = (v: string) => {
    send({ t: 'nickname', nickname: v.trim() });
    setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="nickname-open">
        <Pencil size={14} aria-hidden /> {current ? 'Nickname' : 'Add nickname'}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nickname for this game">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Shown on the TV and the scoreboard in this lobby. Your profile name stays the same.</p>
          {/* R10-4: the field and its buttons share one row when there is room (a phone in
              landscape has little height left above the keyboard), else the buttons wrap below. */}
          <div className="flex flex-wrap gap-2" data-keep-visible>
            <div className="min-w-0 flex-[1_1_12rem]">
              <input
                className={inputCls}
                value={value}
                maxLength={24}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (value.trim() || current) && save(value)}
                enterKeyHint="done"
                placeholder="e.g. QuizMaster"
                aria-label="Nickname"
                data-testid="nickname-input"
                autoFocus
              />
            </div>
            <div className="flex flex-[1_1_10rem] gap-2">
              <Button size="lg" variant="secondary" className="flex-1" onClick={() => setOpen(false)} data-testid="nickname-cancel">
                Cancel
              </Button>
              <Button size="lg" className="flex-1" onClick={() => save(value)} disabled={!value.trim() && !current} data-testid="nickname-save">
                Save
              </Button>
            </div>
          </div>
          {current && (
            <Button variant="ghost" onClick={() => save('')}>
              Remove nickname
            </Button>
          )}
        </div>
      </Modal>
    </>
  );
}

/** Any team member can rename / recolour the team (R5-5.9). Colours other teams use are crossed out. */
function TeamIdentityButton({ name, color, taken }: { name: string; color: string; taken: string[] }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [c, setC] = useState(color);
  useEffect(() => {
    setN(name);
    setC(color);
  }, [name, color, open]);
  const save = () => {
    send({ t: 'teamIdentity', ...(n.trim() && n.trim() !== name ? { name: n.trim() } : {}), ...(c.toLowerCase() !== color.toLowerCase() ? { color: c } : {}) });
    setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="team-identity-open">
        <Pencil size={14} aria-hidden /> Edit
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your team">
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-slate-700">Team name</span>
            <input className={inputCls} value={n} maxLength={30} onChange={(e) => setN(e.target.value)} aria-label="Team name" data-testid="team-name-input" />
          </label>
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-700">Team colour</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team colour">
              {TEAM_COLORS.map((x) => {
                const isTaken = taken.includes(x.toLowerCase());
                return (
                  <button
                    key={x}
                    role="radio"
                    aria-checked={c.toLowerCase() === x}
                    aria-label={`Colour ${x}${isTaken ? ' (taken)' : ''}`}
                    disabled={isTaken}
                    onClick={() => setC(x)}
                    className={cx('h-11 w-11 rounded-full border-4', c.toLowerCase() === x ? 'scale-110 border-slate-900' : 'border-white', isTaken && 'opacity-30')}
                    style={{ background: x }}
                  />
                );
              })}
            </div>
          </div>
          <Button size="lg" className="w-full" onClick={save} disabled={!n.trim()} data-testid="team-identity-save">
            Save for the whole team
          </Button>
        </div>
      </Modal>
    </>
  );
}
