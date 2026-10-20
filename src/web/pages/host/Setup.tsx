// Lobby management on the host controller (R5-4): the former setup screen's settings (board, Play
// As + limits, rules) next to players / teams (R5-5: Unassigned group, drag-and-drop, capacity)
// and buzzers. The game starts from here.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import type { GameView } from '../../../shared/views';
import { act } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt, useFetch, useProfiles, useTeams } from '../../lib/hooks';
import type { AiStatus } from '../../../shared/ai';
import { ActionButton, Avatar, Button, Card, ColorPicker, Field, Modal, QrImage, inputCls, toast, cx } from '../../components/ui';
import { AvatarPicker, ProfileCreateForm } from '../../components/ProfileForm';
import { PersonName } from '../../components/PersonName';
import ControllersPanel, { AssignListener, ControllerChips } from '../../components/ControllersPanel';
import BuzzCheckPanel from '../../components/BuzzCheckPanel';
import { competitorAvatar, competitorName, profileName } from '../../lib/view';
import { TEAM_AVATARS, avatarEmoji, PLAYER_COLORS } from '../../lib/avatars';
import { BOT_LEVELS, BOT_NAMES, MAX_ENTRIES, MAX_TEAMS, RULE_PRESETS, TEAM_COLORS, rulesFromPreset, type BotLevel } from '../../../shared/game';
import { lobbyRules } from '../../../shared/rulesSummary';
import { ArrowDown, ArrowUp, Eye, GripVertical, LayoutGrid, Play, RefreshCw, FlaskConical, Bot, X, Hand, BellRing, SlidersHorizontal, Star, User, Users, Scale, Shuffle } from 'lucide-react';
import { BALANCED_TEAM_NAMES, balanceTeams } from '../../../shared/teamBalance';
import RulesEditor from './RulesEditor';
import { usePresent } from './AppShell';
import { ShowSettingsOnTv } from './ShowSettingsOnTv';
import { LobbyGlow } from '../../lib/lobbyGlow';
import { WifiShare } from './WifiShare';
import { LobbyPlayerSheet } from './LobbyPlayerSheet';

const run = async (a: Parameters<typeof act>[0]) => {
  const r = await act(a);
  if (!r.ok) toast(r.error ?? 'Failed', 'error');
  return r.ok;
};

export default function Setup({ g }: { g: GameView }) {
  const [tab, setTab] = useState<'players' | 'buzzers'>('players');
  const teams = g.competitors.filter((c) => c.kind === 'team');
  const max = g.rules.maxPerTeam;
  const over = g.mode === 'team' && max > 0 ? teams.filter((c) => c.memberIds.length > max) : [];
  const playing = g.mode === 'team' ? teams.filter((c) => c.memberIds.length > 0) : g.competitors;
  const ready = playing.length > 0 && playing.some((c) => !c.bot) && over.length === 0;
  const unassigned = g.unassigned.filter((u) => !u.pending);
  const start = async () => {
    // R5-5.7: players still in Unassigned do not play — say who, and let the host decide.
    if (g.mode === 'team' && unassigned.length) {
      const names = unassigned.map((u) => profileName(g.profiles[u.profileId])).join(', ');
      if (!confirm(`${unassigned.length === 1 ? '1 player is' : `${unassigned.length} players are`} not on a team: ${names}.\n\nThey will not play unless you put them on a team. They stay in the lobby for the next game.\n\nStart anyway?`)) return;
    }
    await run({ type: 'startGame' });
  };
  return (
    // R13-10: on a wide screen (iPad landscape) the lobby fits the screen — the settings column on the
    // left, players / teams (or the buzzers) on the right; each column scrolls on its own only when
    // something unusual (very many players, an opened section) needs more room than the screen has.
    <div className="mx-auto max-w-7xl p-3 lg:h-full" data-testid="lobby-manage">
      <div className="grid gap-3 lg:h-full lg:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)]">
        <div className="scroll-area lg:min-h-0 lg:overflow-y-auto">
          <LobbySettings g={g} />
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-white p-1 shadow-sm" role="tablist">
              {(['players', 'buzzers'] as const).map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('min-h-11 rounded-lg px-5 font-semibold', tab === t ? 'bg-blue-700 text-white' : 'text-slate-700')}>
                  {t === 'players' ? (g.mode === 'team' ? 'Teams' : 'Players') : 'Buzzers'}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <ActionButton size="lg" variant="success" disabled={!ready} onAction={start} data-testid="start-game">
              <Play size={20} aria-hidden /> Start game
            </ActionButton>
          </div>
          {over.length > 0 && (
            <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800 ring-1 ring-red-300" role="alert" data-testid="over-capacity">
              {over.map((t) => `${t.name} has ${t.memberIds.length - max} too many`).join(' · ')} — move players before starting (up to {max} per team).
            </p>
          )}
          <div className="scroll-area space-y-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto" data-testid="lobby-tab-body">
            {tab === 'players' ? (
              <>
                {g.mode === 'team' ? <TeamSetup g={g} /> : <SoloSetup g={g} />}
                {/* R13-10 / R13-11: the connected controllers at a glance; details on the Buzzers tab. */}
                <ControllerChips g={g} onOpen={() => setTab('buzzers')} />
              </>
            ) : (
              <>
                <BuzzCheckPanel />
                <ControllersPanel g={g} />
              </>
            )}
          </div>
        </div>
      </div>
      <AssignListener g={g} />
    </div>
  );
}

/** −/+ number control with a large touch target. */
function Stepper({ label, value, min, max, onChange, zeroLabel, testId }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void; zeroLabel?: string; testId: string }) {
  return (
    <div className="flex items-center gap-2" data-testid={testId}>
      <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">{label}</span>
      <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold disabled:opacity-40" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Fewer: ${label}`} data-testid={`${testId}-down`}>
        −
      </button>
      <span className="min-w-14 text-center text-lg font-black tabular-nums" data-testid={`${testId}-value`}>
        {value === 0 && zeroLabel ? zeroLabel : value}
      </span>
      <button className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl font-bold disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`More: ${label}`} data-testid={`${testId}-up`}>
        +
      </button>
    </div>
  );
}

interface BoardOption {
  id: string;
  title: string;
  description?: string;
  archived: boolean;
  favorite: boolean;
  clueCount?: number;
  rounds?: { name: string; kind: string; categories: string[] }[];
}

/**
 * Everything that used to be the separate "Set up a game" screen (R5-4), inside the lobby:
 * board, Play As with its limits, a rules summary with Customize/Rules under it, and less common
 * options folded away. Changes apply live (the TV follows).
 */
function LobbySettings({ g }: { g: GameView }) {
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [title, setTitle] = useState(g.title);
  const tournaments = useFetch(() => hostApi<{ id: string; name: string; mode: 'solo' | 'team'; status: string; games: number }[]>('GET', '/api/tournaments'), []);
  const current = useFetch(() => hostApi<{ tournament: { id: string } | null }>('GET', `/api/games/${g.id}/tournament`), [g.id]);
  useEffect(() => setTitle(g.title), [g.title]);
  useEffect(() => {
    hostApi<BoardOption[]>('GET', '/api/boards')
      .then((b) => setBoards(b.filter((x) => !x.archived || x.id === g.boardId).sort((a, c) => Number(c.favorite) - Number(a.favorite))))
      .catch(() => {});
  }, [g.boardId]);
  const board = boards.find((b) => b.id === g.boardId);
  const teams = g.competitors.filter((c) => c.kind === 'team');
  const teamBuzzers = g.bindings.filter((b) => b.target.kind === 'competitor').length;
  const openTournaments = (tournaments.data ?? []).filter((t) => t.status === 'active' && t.mode === g.mode);
  const tid = current.data?.tournament?.id ?? '';

  const changeMode = async (mode: 'solo' | 'team') => {
    if (mode === g.mode) return;
    if (mode === 'solo' && g.competitors.some((c) => c.memberIds.length) && !confirm('Switch to individuals?\n\nEveryone plays for themselves. The teams are kept — switch back to Teams to get them back.' + (teamBuzzers ? `\n${teamBuzzers} shared team buzzer${teamBuzzers === 1 ? '' : 's'} will be kept with the team setup.` : ''))) return;
    if (mode === 'team' && g.competitors.some((c) => c.bot) && !confirm('Switch to teams? Computer opponents leave (they only play individual games).')) return;
    await run({ type: 'setMode', mode });
  };
  const setTeams = async (n: number) => {
    // The server removes the emptiest teams first; ask only when players would be moved.
    const sizes = teams.map((t) => t.memberIds.length).sort((a, b) => a - b);
    if (n < teams.length && sizes.slice(0, teams.length - n).some((x) => x > 0) && !confirm('Remove a team? Its players go back to Unassigned.')) return;
    await run({ type: 'setTeamCount', count: n });
  };
  const setRules = (patch: Partial<GameView['rules']>) => run({ type: 'updateRules', rules: { ...g.rules, ...patch } });
  const summary = lobbyRules(g.rules, { mode: g.mode, teams: teams.length });

  return (
    <div className="space-y-3" data-testid="lobby-controls">
      <Card className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-wide text-slate-500 uppercase">Board</p>
            <p className="truncate text-base leading-tight font-bold" data-testid="lobby-board">{board?.title ?? (g.boardId ? '…' : '(board no longer in the library)')}</p>
            {board?.rounds && (
              <p className="truncate text-xs text-slate-500">
                {board.rounds.filter((r) => r.kind === 'standard').length} rounds · {board.clueCount} clues{board.rounds.some((r) => r.kind === 'final') ? ' · Final Jeopardy!' : ''}
              </p>
            )}
          </div>
          <Button variant="secondary" onClick={() => setChoosing(true)} data-testid="change-board">
            <LayoutGrid size={18} aria-hidden /> Change
          </Button>
        </div>
        <div role="group" aria-label="Play as">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
            {(['solo', 'team'] as const).map((m) => (
              <button
                key={m}
                onClick={() => void changeMode(m)}
                disabled={m === 'team' && g.practice}
                aria-pressed={g.mode === m}
                className={cx('flex min-h-10 items-center justify-center gap-1.5 rounded-lg font-semibold disabled:opacity-40', g.mode === m ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')}
                data-testid={`mode-${m}`}
              >
                {m === 'solo' ? <User size={18} aria-hidden /> : <Users size={18} aria-hidden />}
                {m === 'solo' ? 'Individuals' : 'Teams'}
              </button>
            ))}
          </div>
        </div>
        {/* R5-4.2: the limits that belong to the chosen mode, right under Play As. */}
        {g.mode === 'solo' ? (
          <Stepper label="Maximum players" value={Math.min(g.rules.maxPlayers || MAX_ENTRIES, MAX_ENTRIES)} min={1} max={MAX_ENTRIES} onChange={(n) => void setRules({ maxPlayers: n >= MAX_ENTRIES ? 0 : n })} testId="max-players" />
        ) : (
          <div className="space-y-2">
            <Stepper label="Number of teams" value={teams.length} min={1} max={MAX_TEAMS} onChange={(n) => void setTeams(n)} testId="team-count" />
            <Stepper label="Max players per team" value={g.rules.maxPerTeam} min={0} max={50} zeroLabel="No limit" onChange={(n) => void setRules({ maxPerTeam: n })} testId="max-per-team" />
          </div>
        )}
      </Card>

      <Card className="space-y-2 p-3" data-testid="lobby-rules">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 text-lg font-bold">Rules</h3>
          <ShowSettingsOnTv />
        </div>
        <div className="flex gap-2">
        <select
          className={cx(inputCls, 'min-w-0 flex-1')}
          value={RULE_PRESETS[g.rules.preset] ? g.rules.preset : ''}
          onChange={(e) => e.target.value && void run({ type: 'updateRules', rules: { ...rulesFromPreset(e.target.value), maxPlayers: g.rules.maxPlayers, maxPerTeam: g.rules.maxPerTeam, requireRoomCode: g.rules.requireRoomCode } })}
          aria-label="Rules preset"
          title={RULE_PRESETS[g.rules.preset]?.description}
        >
          {!RULE_PRESETS[g.rules.preset] && <option value="">Custom</option>}
          {Object.entries(RULE_PRESETS).map(([k, p]) => (
            <option key={k} value={k}>
              {p.label}
            </option>
          ))}
        </select>
        <Button variant="secondary" className="shrink-0 px-3" onClick={() => setRulesOpen(true)} aria-label="Customize Rules, Timers & Buzzers…" title="Customize Rules, Timers & Buzzers" data-testid="customize-rules">
          <SlidersHorizontal size={18} aria-hidden /> Customize
        </Button>
        </div>
        {/* R13-10: the summary folds away, so the lobby fits the iPad screen. */}
        <details className="text-sm" data-testid="rules-summary">
          <summary className="min-h-9 cursor-pointer content-center font-semibold text-blue-700">See all rules</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {summary.map((l) => (
              <div key={l.label} className="contents">
                <dt className="text-slate-500">{l.label}</dt>
                <dd className="font-semibold">{l.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      <JoinHint g={g} />

      <details className="rounded-2xl border border-slate-200 bg-white px-3 py-1 shadow-sm" data-testid="lobby-more">
        <summary className="min-h-11 cursor-pointer content-center font-bold">More options</summary>
        <div className="mt-3 space-y-3">
          <Field label="Game title">
            <input className={inputCls} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => title.trim() && title.trim() !== g.title && void run({ type: 'updateGameInfo', title: title.trim() })} aria-label="Game title" />
          </Field>
          {g.mode === 'solo' && (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-violet-50 px-3 py-2">
              <input type="checkbox" className="h-6 w-6 accent-violet-700" checked={g.practice} onChange={(e) => void run({ type: 'updateGameInfo', practice: e.target.checked })} data-testid="practice-toggle" />
              <span>
                <span className="block font-semibold">Practice game</span>
                <span className="block text-xs text-slate-600">Not counted in statistics. Buzzers open by themselves; add computer opponents to play alone.</span>
              </span>
            </label>
          )}
          {!g.practice && (openTournaments.length > 0 || !!tid) && (
            <Field label="Tournament" hint={tid ? 'The result counts towards the tournament standings.' : undefined}>
              <select
                className={inputCls}
                value={tid}
                onChange={async (e) => {
                  if (await attempt(() => hostApi('POST', '/api/games/current/tournament', { tournamentId: e.target.value || null }))) void current.reload();
                }}
                aria-label="Tournament"
                data-testid="tournament-select"
              >
                <option value="">Not part of a tournament</option>
                {openTournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — game {t.games + 1}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>
      </details>
      <RulesEditor open={rulesOpen} onClose={() => setRulesOpen(false)} g={g} run={async (a) => ({ ok: await run(a) })} />
      {choosing && <BoardChooser g={g} boards={boards} onClose={() => setChoosing(false)} />}
    </div>
  );
}

/**
 * Choosing the board (R5-3.3): while this is open the TV shows the board choices (the lobby
 * shrinks beside them) and follows the board the host is looking at; picking one returns the TV
 * to the lobby with only the selected board.
 */
function BoardChooser({ g, boards, onClose }: { g: GameView; boards: BoardOption[]; onClose: () => void }) {
  const { show } = usePresent();
  const [sel, setSel] = useState(g.boardId ?? boards[0]?.id ?? null);
  useEffect(() => {
    show({ page: 'boards', ...(sel ? { boardId: sel } : {}) });
  }, [sel, show]);
  const close = () => {
    show({ page: 'lobby' });
    onClose();
  };
  const use = async () => {
    if (sel && sel !== g.boardId) {
      if (!(await attempt(() => hostApi('POST', '/api/games/current/board', { boardId: sel })))) return;
      toast('Board changed', 'success');
    }
    close();
  };
  return (
    <Modal open onClose={close} title="Choose the board" wide>
      <div className="space-y-3" data-testid="board-chooser">
        <p className="text-sm text-slate-600">The TV shows these boards while you choose.</p>
        <div className="grid max-h-[55dvh] gap-2 overflow-auto sm:grid-cols-2">
          {boards.filter((b) => !b.archived).map((b) => (
            <div key={b.id} className={cx('flex items-stretch rounded-xl border-2', sel === b.id ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
              <button onClick={() => setSel(b.id)} className="min-w-0 flex-1 p-3 text-left" aria-pressed={sel === b.id} data-testid="board-option">
                <span className="flex items-center gap-1.5 font-semibold">
                  {b.favorite ? <Star size={16} className="shrink-0 fill-amber-400 text-amber-500" aria-label="Favorite" /> : null}
                  <span className="truncate">{b.title}</span>
                </span>
                {b.rounds && <span className="block text-sm text-slate-500">{b.rounds.filter((r) => r.kind === 'standard').length} rounds · {b.clueCount} clues</span>}
              </button>
              <Link to={`/board/preview/${b.id}`} className="flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:bg-slate-100" aria-label={`Preview ${b.title}`} title="Preview the board">
                <Eye size={20} aria-hidden />
              </Link>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <ActionButton size="lg" disabled={!sel} onAction={use} data-testid="use-board">
            Use this board
          </ActionButton>
        </div>
      </div>
    </Modal>
  );
}

function JoinHint({ g }: { g: GameView }) {
  const r = g.rules;
  return (
    <Card className="space-y-2 p-3" data-testid="lobby-join">
      <div className="flex items-center gap-3">
        <QrImage target="join" className="h-20 w-20 shrink-0" />
        <p className="min-w-0 flex-1 text-sm text-slate-600">
          Players scan the TV's code and tap <b>Join game</b> — or add them here.
        </p>
      </div>
      <div className="space-y-2">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={r.requireRoomCode} onChange={(e) => run({ type: 'updateRules', rules: { ...r, requireRoomCode: e.target.checked } })} data-testid="require-room-code" />
          <span className="text-sm">
            <b>Require the room code</b> (only people at the TV can join)
          </span>
        </label>
        {r.requireRoomCode && g.roomCode && (
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-slate-900 px-3 py-1 font-mono text-2xl font-black tracking-[0.3em] text-white" data-testid="host-room-code">
              {g.roomCode}
            </span>
            <Button size="sm" variant="ghost" onClick={() => run({ type: 'newRoomCode' })}>
              <RefreshCw size={16} aria-hidden /> New code
            </Button>
          </div>
        )}
        <WifiShare />
      </div>
    </Card>
  );
}

function PendingList({ g }: { g: GameView }) {
  const pending = g.unassigned.filter((u) => u.pending);
  if (!pending.length) return null;
  return (
    <Card className="border-amber-300 bg-amber-50">
      <h3 className="mb-2 font-bold">Waiting for approval</h3>
      {pending.map((u) => (
        <div key={u.profileId} className="flex items-center gap-3 py-1">
          <Avatar profile={g.profiles[u.profileId]} size={32} />
          <span className="flex-1 font-semibold">{profileName(g.profiles[u.profileId])}</span>
          <Button size="sm" variant="success" onClick={() => run({ type: 'approvePlayer', profileId: u.profileId })}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => run({ type: 'removeParticipant', profileId: u.profileId })}>
            Decline
          </Button>
        </div>
      ))}
    </Card>
  );
}

function AddPlayerModal({ open, onClose, onPick, exclude }: { open: boolean; onClose: () => void; onPick: (profileId: string) => Promise<unknown>; exclude: string[] }) {
  const profiles = useProfiles();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = (profiles.data ?? []).filter((p) => !exclude.includes(p.id) && p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title={creating ? 'New player profile' : 'Add a player'} wide>
      {creating ? (
        <ProfileCreateForm
          busy={busy}
          onSubmit={async (p) => {
            setBusy(true);
            const { picture, ...fields } = p;
            const created = await attempt(() => hostApi<{ id: string }>('POST', '/api/admin/profiles', fields));
            if (created && picture) {
              const fd = new FormData();
              fd.append('file', picture, picture.name || 'photo.jpg');
              await attempt(() => hostApi('POST', `/api/admin/profiles/${created.id}/picture`, undefined, fd));
            }
            setBusy(false);
            if (created) {
              await onPick(created.id);
              setCreating(false);
              onClose();
            }
          }}
        />
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Search players" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
            <Button variant="secondary" onClick={() => setCreating(true)}>
              + New
            </Button>
          </div>
          <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
            {list.map((p) => (
              <button
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-slate-200 p-2 text-left hover:bg-slate-50"
                onClick={async () => {
                  await onPick(p.id);
                }}
              >
                <Avatar profile={p} size={36} />
                <span className="truncate font-semibold">{profileName(p)}</span>
              </button>
            ))}
            {!list.length && <p className="col-span-full text-slate-500">No more players. Create a new profile.</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function SoloSetup({ g }: { g: GameView }) {
  const [adding, setAdding] = useState(false);
  const [addingBot, setAddingBot] = useState(false);
  const [manage, setManage] = useState<string | null>(null);
  // R14-1: at most MAX_ENTRIES seats (players, computer opponents and people waiting to be let in).
  const seats = g.competitors.length + g.unassigned.length;
  const full = seats >= MAX_ENTRIES;
  return (
    <div className="space-y-4">
      <PendingList g={g} />
      {g.practice && (
        <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900" data-testid="practice-note">
          <FlaskConical size={16} className="mr-1 inline align-[-3px]" aria-hidden /><b>Practice game</b> — it is saved in history but does not count in statistics or the leaderboard. The buzzers open automatically after each question.
        </p>
      )}
      <Card className="p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-lg font-bold" data-testid="solo-count">
            Players ({g.competitors.length}
            <span className="font-normal text-slate-500"> / {MAX_ENTRIES}</span>)
          </h3>
          <Button variant="secondary" disabled={full} onClick={() => setAddingBot(true)} aria-label="Computer opponent" title={full ? `The game is full (${MAX_ENTRIES} players)` : 'Add a computer opponent'} data-testid="add-bot">
            <Bot size={18} aria-hidden /> Computer
          </Button>
          <Button disabled={full} onClick={() => setAdding(true)} title={full ? `The game is full (${MAX_ENTRIES} players)` : undefined}>
            + Add player
          </Button>
        </div>
        {full && (
          <p className="mb-2 rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900" data-testid="game-full">
            {seats > MAX_ENTRIES ? `At most ${MAX_ENTRIES} players can play — remove ${seats - MAX_ENTRIES} before starting.` : `The game is full: ${MAX_ENTRIES} players is the most. Remove someone to make room.`}
          </p>
        )}
        {/* R13-10: compact cards, as many per row as fit (15 players fit an iPad screen). */}
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-1.5">
          {g.competitors.map((c) => {
            const name = competitorName(c, g);
            return (
              <li key={c.id} className="relative flex min-h-12 items-center gap-2 rounded-xl bg-slate-50 py-1 pr-0.5 pl-2" data-testid={c.bot ? 'setup-bot' : 'setup-player'}>
                <LobbyGlow id={c.profileId} />
                {/* R14-29: a person's picture and name open their sheet (nickname, profile). */}
                {!c.bot && c.profileId ? (
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg text-left active:bg-slate-200" onClick={() => setManage(c.profileId!)} aria-label={`Manage ${name}`} data-testid="lobby-player-open">
                    {/* R13-10: a phone that is connected shows as a green dot on the picture. */}
                    <span className="relative shrink-0">
                      <Avatar profile={competitorAvatar(c, g)} size={34} />
                      {g.online?.includes(c.profileId) && <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full bg-green-600 ring-2 ring-slate-50" title="Phone connected" data-testid="phone-online" />}
                    </span>
                    <PersonName p={g.profiles[c.profileId]} className="min-w-0 flex-1 leading-tight font-semibold [&>span]:truncate" realClassName="text-xs" />
                  </button>
                ) : (
                  <span className="relative shrink-0">
                    <Avatar profile={competitorAvatar(c, g)} size={34} />
                  </span>
                )}
                <span className={cx('min-w-0', c.bot || !c.profileId ? 'flex-1' : 'hidden')}>
                  {(c.bot || !c.profileId) && <span className="block truncate font-semibold">{name}</span>}
                  {c.bot && (
                    // R14-4: the difficulty is chosen inside the badge. A separate select beside the
                    // name column took its width in a 10.5rem card, so the badge ran under the select.
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <label className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border border-slate-300 bg-white py-0.5 pr-1 pl-2 text-xs font-semibold text-slate-700" data-testid="bot-level-badge">
                        <Bot size={12} className="shrink-0" aria-hidden />
                        <select
                          className="min-h-7 min-w-0 cursor-pointer bg-transparent font-semibold"
                          value={c.bot}
                          onChange={(e) => run({ type: 'updateCompetitor', competitorId: c.id, botLevel: e.target.value as BotLevel })}
                          aria-label={`${name} difficulty`}
                        >
                          {Object.entries(BOT_LEVELS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-1 text-xs text-slate-600">
                        <input type="checkbox" className="h-4 w-4 accent-blue-700" checked={!!c.botAi} onChange={(e) => run({ type: 'updateCompetitor', competitorId: c.id, botAi: e.target.checked })} aria-label={`${name} uses AI answers`} />
                        AI answers
                      </label>
                    </span>
                  )}
                </span>
                <button type="button" className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200" onClick={() => run({ type: 'removeCompetitor', competitorId: c.id })} aria-label={`Remove ${name}`}>
                  <X size={18} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
        {!g.competitors.length && <p className="text-slate-500">No players yet.</p>}
      </Card>
      <AddPlayerModal open={adding} onClose={() => setAdding(false)} exclude={g.competitors.flatMap((c) => c.memberIds)} onPick={(id) => run({ type: 'addPlayer', profileId: id })} />
      <AddBotModal open={addingBot} onClose={() => setAddingBot(false)} g={g} />
      {manage && <LobbyPlayerSheet g={g} profileId={manage} onClose={() => setManage(null)} />}
    </div>
  );
}

function AddBotModal({ open, onClose, g }: { open: boolean; onClose: () => void; g: GameView }) {
  const taken = new Set(g.competitors.filter((c) => c.bot).map((c) => c.name.toLowerCase()));
  const suggestion = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Computer ${taken.size + 1}`;
  const [name, setName] = useState(suggestion);
  const [level, setLevel] = useState<BotLevel>('medium');
  const ai = useFetch(() => (open ? hostApi<AiStatus>('GET', '/api/ai') : Promise.resolve(null)), [open]);
  const [useAi, setUseAi] = useState(false);
  useEffect(() => setUseAi(!!ai.data?.ready), [ai.data?.ready]);
  useEffect(() => {
    if (open) setName(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a computer opponent">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Computer opponents buzz in, answer, wager and play Final Jeopardy! by themselves — great for practice or a small group. They never buzz early, and their results are not saved to any player profile.</p>
        <Field label="Name">
          <input className={inputCls} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} aria-label="Computer opponent name" />
        </Field>
        <Field label="Difficulty" group>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Difficulty">
            {(Object.entries(BOT_LEVELS) as [BotLevel, (typeof BOT_LEVELS)[BotLevel]][]).map(([k, v]) => (
              <button key={k} type="button" role="radio" aria-checked={level === k} onClick={() => setLevel(k)} className={cx('min-h-16 rounded-xl border-2 px-3 py-2 text-left', level === k ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                <span className="block font-semibold">{v.label}</span>
                <span className="block text-xs text-slate-500">{v.description}</span>
              </button>
            ))}
          </div>
        </Field>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} data-testid="bot-ai-toggle" />
          <span>
            <span className="block font-semibold">AI answers</span>
            <span className="block text-xs text-slate-500">{ai.data?.ready ? 'Uses the AI service set up in Settings (internet; may cost money). Falls back to offline answers.' : 'Set up an AI service in Settings to use this. Until then the bot answers offline.'}</span>
          </span>
        </label>
        <ActionButton
          size="lg"
          className="w-full"
          disabled={!name.trim()}
          onAction={async () => {
            if (await run({ type: 'addBot', name: name.trim(), level, ai: useAi })) onClose();
          }}
          data-testid="confirm-add-bot"
        >
          Add {name.trim() || 'opponent'}
        </ActionButton>
      </div>
    </Modal>
  );
}

type DropTarget = { competitorId: string | null; index?: number };

/**
 * Touch drag-and-drop of player cards (R5-5.4): press the grip and move; the card follows the
 * finger and drops into a team (at a position) or back into Unassigned. No mouse needed; tapping
 * a card instead opens a "Move to…" sheet (the accessible alternative).
 */
function useTeamDrag(onDrop: (profileId: string, t: DropTarget) => void) {
  const [drag, setDrag] = useState<{ profileId: string; label: string; x: number; y: number; over: string | null } | null>(null);
  const targetAt = (x: number, y: number): (DropTarget & { key: string }) | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const zone = el?.closest<HTMLElement>('[data-drop]');
    if (!zone) return null;
    const key = zone.dataset.drop!;
    const competitorId = key === 'unassigned' ? null : key;
    const chip = el?.closest<HTMLElement>('[data-member-index]');
    if (!chip || !competitorId) return { key, competitorId };
    const r = chip.getBoundingClientRect();
    const i = Number(chip.dataset.memberIndex);
    return { key, competitorId, index: y > r.top + r.height / 2 ? i + 1 : i };
  };
  // The live drag lives in a ref so fast moves/releases are never lost between renders.
  const live = useRef<typeof drag>(null);
  const update = (d: typeof drag) => {
    live.current = d;
    setDrag(d);
  };
  // Near the top or bottom edge the page scrolls, so a team below the fold can be reached.
  const scroller = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!drag) return;
    const t = setInterval(() => {
      const d = live.current;
      const el = scroller.current;
      if (!d || !el) return;
      const r = el.getBoundingClientRect();
      const edge = 80;
      const dy = d.y < r.top + edge ? -14 : d.y > r.bottom - edge ? 14 : 0;
      if (!dy) return;
      el.scrollTop += dy;
      update({ ...d, over: targetAt(d.x, d.y)?.key ?? null });
    }, 30);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);
  const start = (profileId: string, label: string) => (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    scroller.current = (e.currentTarget as HTMLElement).closest<HTMLElement>('.scroll-area');
    update({ profileId, label, x: e.clientX, y: e.clientY, over: null });
  };
  const move = (e: ReactPointerEvent) => {
    const d = live.current;
    if (!d) return;
    update({ ...d, x: e.clientX, y: e.clientY, over: targetAt(e.clientX, e.clientY)?.key ?? null });
  };
  const end = (e: ReactPointerEvent) => {
    const d = live.current;
    if (!d) return;
    const t = targetAt(e.clientX, e.clientY);
    update(null);
    if (t) onDrop(d.profileId, t);
  };
  const handle = (profileId: string, label: string) => ({ onPointerDown: start(profileId, label), onPointerMove: move, onPointerUp: end, onPointerCancel: () => update(null) });
  const ghost = drag ? (
    <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-700 px-4 py-2 font-semibold text-white shadow-xl" style={{ left: drag.x, top: drag.y }} aria-hidden>
      {drag.label}
    </div>
  ) : null;
  return { handle, ghost, over: drag?.over ?? null, dragging: drag?.profileId ?? null };
}

/** Team lobby (R5-5): Unassigned Players + team cards with capacity; drag-and-drop or tap to move. */
function TeamSetup({ g }: { g: GameView }) {
  const saved = useTeams();
  const [editing, setEditing] = useState<null | { competitorId?: string }>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const inGame = g.competitors.flatMap((c) => c.memberIds);
  const unassigned = g.unassigned.filter((u) => !u.pending);
  const teams = g.competitors.filter((c) => c.kind === 'team');
  const availableSaved = (saved.data ?? []).filter((t) => !g.competitors.some((c) => c.teamId === t.id));
  const max = g.rules.maxPerTeam;
  const drag = useTeamDrag((profileId, t) => {
    const from = teams.find((c) => c.memberIds.includes(profileId));
    let index = t.index;
    if (index !== undefined && from && from.id === t.competitorId && from.memberIds.indexOf(profileId) < index) index--;
    if (from?.id === t.competitorId && (index === undefined || index === from.memberIds.indexOf(profileId))) return;
    if (!from && !t.competitorId) return;
    void run({ type: 'assignMember', profileId, competitorId: t.competitorId, ...(index !== undefined ? { index } : {}) });
  });
  const label = (pid: string) => profileName(g.profiles[pid]);

  const chip = (pid: string, index?: number) => (
    <li
      key={pid}
      className={cx('relative flex min-h-12 items-center gap-1 rounded-xl bg-white py-1 pr-1 pl-1 shadow-sm ring-1 ring-slate-200', drag.dragging === pid && 'opacity-40')}
      data-member-index={index}
      data-testid="team-player"
    >
      <LobbyGlow id={pid} />
      <button
        className="flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 active:cursor-grabbing"
        aria-label={`Drag ${label(pid)}`}
        {...drag.handle(pid, label(pid))}
        data-testid="drag-handle"
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setMoving(pid)} aria-label={`Move ${label(pid)}`} data-testid="move-player">
        <Avatar profile={g.profiles[pid]} size={32} />
        {/* R7-3/R7-18: names stacked, the phone status on its own line, so names have the full width. */}
        <span className="min-w-0 flex-1">
          <PersonName p={g.profiles[pid]} className="font-semibold" realClassName="text-sm" />
          {g.online?.includes(pid) && <span className="block text-xs text-green-700">● phone</span>}
        </span>
      </button>
    </li>
  );

  return (
    <div className="space-y-4">
      <PendingList g={g} />
      <section
        className={cx('rounded-2xl border-2 border-dashed p-3 transition', drag.over === 'unassigned' ? 'border-blue-600 bg-blue-50' : 'border-slate-300 bg-slate-50')}
        data-drop="unassigned"
        data-testid="unassigned-group"
      >
        <div className="mb-2 flex items-center gap-2">
          <h3 className="flex-1 font-bold">Unassigned Players ({unassigned.length})</h3>
          {unassigned.length > 0 && <span className="text-xs text-slate-500">Players can also pick a team on their phones</span>}
        </div>
        {unassigned.length ? <ul className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-1.5">{unassigned.map((u) => chip(u.profileId))}</ul> : <p className="text-sm text-slate-500">Everyone is on a team.</p>}
      </section>
      <BalanceTeams g={g} people={unassigned.map((u) => u.profileId)} />
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((c) => {
          const n = c.memberIds.length;
          const tooMany = max > 0 && n > max;
          return (
            <section
              key={c.id}
              className={cx('space-y-2 rounded-2xl bg-white p-3 shadow-sm ring-2 transition', tooMany ? 'ring-red-500' : drag.over === c.id ? 'ring-blue-600' : 'ring-transparent')}
              data-drop={c.id}
              data-testid="team-card"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl" style={{ background: c.color }}>
                  {avatarEmoji(c.avatar)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{c.name}</div>
                  <div className={cx('text-sm font-semibold', tooMany ? 'text-red-700' : 'text-slate-500')} data-testid="team-capacity">
                    {max > 0 ? `${n} / ${max} Players` : `${n} ${n === 1 ? 'Player' : 'Players'}`}
                    {tooMany && ` — move ${n - max} out`}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing({ competitorId: c.id })}>
                  Edit
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label={`${c.name} buzzer mode`}>
                {(['individual', 'shared'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={c.buzzerMode === m}
                    onClick={() => run({ type: 'updateCompetitor', competitorId: c.id, buzzerMode: m })}
                    className={cx('flex min-h-10 items-center justify-center gap-1 rounded-lg px-1 text-xs font-semibold sm:text-sm', c.buzzerMode === m ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-600')}
                  >
                    {m === 'individual' ? <Hand size={16} aria-hidden /> : <BellRing size={16} aria-hidden />}
                    {m === 'individual' ? 'Each player buzzes' : 'One shared buzzer'}
                  </button>
                ))}
              </div>
              <ul className="min-h-14 space-y-1.5 rounded-xl bg-slate-50 p-1.5">
                {c.memberIds.map((m, i) => chip(m, i))}
                {n === 0 && <li className="flex min-h-11 items-center justify-center text-sm text-slate-400">Drag players here</li>}
              </ul>
              <Button size="sm" variant="ghost" onClick={() => setAddingTo(c.id)}>
                + Add player
              </Button>
            </section>
          );
        })}
        <Card className="flex flex-col justify-center gap-2 border-dashed">
          <Button size="lg" variant="secondary" disabled={teams.length >= MAX_TEAMS} onClick={() => run({ type: 'setTeamCount', count: teams.length + 1 })} data-testid="add-team-slot">
            + Add a team
          </Button>
          {availableSaved.length > 0 && (
            <div>
              <p className="mt-2 mb-1 text-sm font-semibold text-slate-600">Saved teams</p>
              <div className="flex flex-wrap gap-2">
                {availableSaved.map((t) => (
                  <ActionButton
                    key={t.id}
                    size="sm"
                    variant="secondary"
                    onAction={() => run({ type: 'addTeam', teamId: t.id, name: t.name, color: t.color, avatar: t.avatar, buzzerMode: t.buzzerMode, memberIds: t.memberIds.filter((m) => !inGame.includes(m)) })}
                  >
                    {avatarEmoji(t.avatar)} {t.name}
                  </ActionButton>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
      {drag.ghost}
      {moving && <MoveSheet g={g} profileId={moving} onClose={() => setMoving(null)} />}
      {editing && (
        <TeamEditor
          g={g}
          competitorId={editing.competitorId}
          onClose={() => {
            setEditing(null);
            void saved.reload();
          }}
        />
      )}
      <AddPlayerModal
        open={!!addingTo}
        onClose={() => setAddingTo(null)}
        exclude={inGame}
        onPick={async (id) => {
          if (!g.unassigned.some((u) => u.profileId === id)) await run({ type: 'addPlayer', profileId: id });
          await run({ type: 'assignMember', profileId: id, competitorId: addingTo });
        }}
      />
    </div>
  );
}

/** Tap alternative to dragging (R5-5.4): move a player to a team, to Unassigned, or up/down. */
function MoveSheet({ g, profileId, onClose }: { g: GameView; profileId: string; onClose: () => void }) {
  const team = g.competitors.find((c) => c.kind === 'team' && c.memberIds.includes(profileId));
  const max = g.rules.maxPerTeam;
  const i = team ? team.memberIds.indexOf(profileId) : -1;
  const go = async (a: Parameters<typeof run>[0]) => {
    if (await run(a)) onClose();
  };
  // R14-29: the same sheet as a solo player's (nickname, profile), with the team moves under it.
  return (
    <LobbyPlayerSheet g={g} profileId={profileId} onClose={onClose}>
      <div className="grid gap-2 border-t border-slate-200 pt-3" data-testid="move-sheet">
        <p className="text-sm font-semibold text-slate-700">Move to</p>
        {g.competitors
          .filter((c) => c.kind === 'team' && c.id !== team?.id)
          .map((c) => (
            <Button key={c.id} size="lg" variant="secondary" className="justify-start" onClick={() => go({ type: 'assignMember', profileId, competitorId: c.id })} data-testid="move-to-team">
              <span className="h-4 w-4 rounded-full" style={{ background: c.color }} aria-hidden /> {c.name}
              <span className="ml-auto text-sm font-normal text-slate-500">{max ? `${c.memberIds.length} / ${max}` : c.memberIds.length}</span>
            </Button>
          ))}
        {team && (
          <Button size="lg" variant="ghost" onClick={() => go({ type: 'assignMember', profileId, competitorId: null })} data-testid="move-to-unassigned">
            Back to Unassigned
          </Button>
        )}
        {team && team.memberIds.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="ghost" disabled={i <= 0} onClick={() => go({ type: 'assignMember', profileId, competitorId: team.id, index: i - 1 })}>
              <ArrowUp size={18} aria-hidden /> Move up
            </Button>
            <Button variant="ghost" disabled={i >= team.memberIds.length - 1} onClick={() => go({ type: 'assignMember', profileId, competitorId: team.id, index: i + 1 })}>
              <ArrowDown size={18} aria-hidden /> Move down
            </Button>
          </div>
        )}
      </div>
    </LobbyPlayerSheet>
  );
}

/** Create or edit a team. Teams are saved to the database (stable ids) for future games. */
function TeamEditor({ g, competitorId, onClose }: { g: GameView; competitorId?: string; onClose: () => void }) {
  const existing = g.competitors.find((c) => c.id === competitorId);
  const [name, setName] = useState(existing?.name ?? `Team ${g.competitors.length + 1}`);
  const [color, setColor] = useState(existing?.color ?? TEAM_COLORS[g.competitors.length % TEAM_COLORS.length]);
  const [avatar, setAvatar] = useState(existing?.avatar ?? 'shield');
  const [mode, setMode] = useState<'individual' | 'shared'>(existing?.buzzerMode ?? 'individual');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      if (existing) {
        await run({ type: 'updateCompetitor', competitorId: existing.id, name: name.trim(), color, avatar, buzzerMode: mode });
        if (existing.teamId)
          await attempt(() => hostApi('PUT', `/api/teams/${existing.teamId}`, { name: name.trim(), color, avatar, buzzerMode: mode, memberIds: existing.memberIds }));
      } else {
        const t = await attempt(() => hostApi<{ id: string }>('POST', '/api/teams', { name: name.trim(), color, avatar, buzzerMode: mode, memberIds: [] }));
        if (t) await run({ type: 'addTeam', teamId: t.id, name: name.trim(), color, avatar, buzzerMode: mode, memberIds: [] });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} title={existing ? 'Edit team' : 'New team'} wide>
      <div className="space-y-4">
        <Field label="Team name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Team logo" group>
          <AvatarPicker value={avatar} onChange={setAvatar} list={TEAM_AVATARS.slice(0, 20)} />
        </Field>
        <Field label="Team color" group>
          <ColorPicker value={color} onChange={setColor} colors={[...TEAM_COLORS, ...PLAYER_COLORS.slice(8)]} />
        </Field>
        <Field label="Buzzer mode" group hint="Each team chooses independently.">
          <div className="grid grid-cols-2 gap-2">
            {(['individual', 'shared'] as const).map((m) => (
              <Button key={m} variant={mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)}>
                {m === 'individual' ? 'Each player buzzes' : 'One shared buzzer'}
              </Button>
            ))}
          </div>
        </Field>
        <div className="flex justify-between gap-2">
          {existing ? (
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm(`Remove ${existing.name} from this game? Players go back to "without a team".`)) {
                  await run({ type: 'removeCompetitor', competitorId: existing.id });
                  onClose();
                }
              }}
            >
              Remove from game
            </Button>
          ) : (
            <span />
          )}
          <Button size="lg" onClick={save} busy={busy} disabled={!name.trim()}>
            Save team
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Automatic team balancing (T11): split the players without a team into evenly matched teams. */
function BalanceTeams({ g, people }: { g: GameView; people: string[] }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(2);
  const [seed, setSeed] = useState(1);
  const [ratings, setRatings] = useState<{ id: string; rating: number; games: number }[] | null>(null);
  const key = people.join(',');
  useEffect(() => {
    if (!open) return;
    setRatings(null);
    void attempt(() => hostApi<{ id: string; rating: number; games: number }[]>('GET', `/api/stats/ratings?ids=${encodeURIComponent(key)}`)).then((r) => r && setRatings(r));
  }, [open, key]);
  const maxTeams = Math.max(2, Math.min(8, Math.floor(people.length / 2))); // at least two per team
  const teams = ratings ? balanceTeams(ratings, Math.min(count, ratings.length), seed) : [];
  const used = new Set(g.competitors.map((c) => c.name));
  const names = BALANCED_TEAM_NAMES.filter((n) => !used.has(n));
  const create = async () => {
    for (const [i, t] of teams.entries()) {
      if (!t.length) continue;
      const ok = await run({ type: 'addTeam', name: names[i] ?? `Team ${g.competitors.length + i + 1}`, color: TEAM_COLORS[(g.competitors.length + i) % TEAM_COLORS.length], avatar: TEAM_AVATARS[(g.competitors.length + i) % 8].id, buzzerMode: 'individual', memberIds: t.map((p) => p.id) });
      if (!ok) return;
    }
    setOpen(false);
    toast(`${teams.filter((t) => t.length).length} balanced teams created`, 'success');
  };
  if (people.length < 2) return null;
  return (
    <Card className="space-y-3" data-testid="balance-teams">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_14rem]">
          <h3 className="font-bold">Make balanced teams</h3>
          <p className="text-sm text-slate-600">Splits the {people.length} players without a team into evenly matched teams, based on their past games. New players count as average.</p>
        </div>
        {!open && (
          <Button variant="secondary" onClick={() => setOpen(true)} data-testid="balance-open">
            <Scale size={18} aria-hidden /> Balance teams
          </Button>
        )}
      </div>
      {open && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-600">Teams</span>
            {Array.from({ length: maxTeams - 1 }, (_, i) => i + 2)
              .filter((n) => n <= people.length)
              .map((n) => (
                <button key={n} onClick={() => setCount(n)} aria-pressed={count === n} className={cx('h-11 w-11 rounded-xl font-bold', count === n ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700')} data-testid={`balance-count-${n}`}>
                  {n}
                </button>
              ))}
            <div className="flex-1" />
            <Button variant="ghost" onClick={() => setSeed((s) => s + 1)} disabled={!ratings} data-testid="balance-shuffle">
              <Shuffle size={18} aria-hidden /> Shuffle
            </Button>
          </div>
          {!ratings ? (
            <p className="text-sm text-slate-500">Looking at past games…</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="balance-preview">
              {teams.map((t, i) => {
                const avg = t.length ? t.reduce((s, p) => s + p.rating, 0) / t.length : 0;
                return (
                  <div key={i} className="rounded-xl border-2 p-3" style={{ borderColor: TEAM_COLORS[(g.competitors.length + i) % TEAM_COLORS.length] }}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-bold">{names[i] ?? `Team ${i + 1}`}</span>
                      <span className="text-xs text-slate-500">{t.length} players</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" title="Team strength" aria-label={`Team strength ${Math.round(avg)} of 100`}>
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.round(avg)}%` }} />
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {t.map((p) => (
                        <li key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pr-2 pl-0.5 text-sm">
                          <Avatar profile={g.profiles[p.id]} size={22} />
                          {profileName(g.profiles[p.id])}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <ActionButton disabled={!ratings} onAction={create} data-testid="balance-create">
              Create these teams
            </ActionButton>
          </div>
        </>
      )}
    </Card>
  );
}
