// Pre-game setup on the host controller: players, teams, per-team buzzer modes, controllers.
import { useEffect, useState } from 'react';
import type { GameView } from '../../../shared/views';
import { act } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt, useProfiles, useTeams } from '../../lib/hooks';
import { ActionButton, Avatar, Button, Card, ColorPicker, Field, Modal, QrImage, inputCls, toast, cx } from '../../components/ui';
import { AvatarPicker, ProfileCreateForm } from '../../components/ProfileForm';
import ControllersPanel, { AssignListener } from '../../components/ControllersPanel';
import BuzzCheckPanel from '../../components/BuzzCheckPanel';
import { competitorAvatar, competitorName, profileName } from '../../lib/view';
import { TEAM_AVATARS, avatarEmoji, PLAYER_COLORS } from '../../lib/avatars';
import { BOT_LEVELS, BOT_NAMES, TEAM_COLORS, type BotLevel } from '../../../shared/game';
import { Play, RefreshCw, FlaskConical, Bot, X, Hand, BellRing, SlidersHorizontal, User, Users, Scale, Shuffle } from 'lucide-react';
import { BALANCED_TEAM_NAMES, balanceTeams } from '../../../shared/teamBalance';
import RulesEditor from './RulesEditor';

const run = async (a: Parameters<typeof act>[0]) => {
  const r = await act(a);
  if (!r.ok) toast(r.error ?? 'Failed', 'error');
  return r.ok;
};

export default function Setup({ g }: { g: GameView }) {
  const [tab, setTab] = useState<'players' | 'buzzers'>('players');
  const ready = g.competitors.length > 0 && g.competitors.every((c) => !!c.bot || c.memberIds.length > 0) && g.competitors.some((c) => !c.bot);
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <LobbyControls g={g} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-white p-1 shadow-sm" role="tablist">
          {(['players', 'buzzers'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx('min-h-11 rounded-lg px-5 font-semibold', tab === t ? 'bg-blue-700 text-white' : 'text-slate-700')}>
              {t === 'players' ? (g.mode === 'team' ? '1. Teams' : '1. Players') : '2. Buzzers'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <ActionButton size="lg" variant="success" disabled={!ready} onAction={() => run({ type: 'startGame' })} data-testid="start-game">
          <Play size={20} aria-hidden /> Start game
        </ActionButton>
      </div>
      {tab === 'players' ? (
        g.mode === 'team' ? (
          <TeamSetup g={g} />
        ) : (
          <SoloSetup g={g} />
        )
      ) : (
        <>
          <BuzzCheckPanel />
          <ControllersPanel g={g} />
        </>
      )}
      <AssignListener g={g} />
    </div>
  );
}

function JoinHint({ g }: { g: GameView }) {
  const r = g.rules;
  return (
    <Card className="flex flex-wrap items-center gap-4">
      <QrImage target="join" className="h-24 w-24 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm text-slate-600">
          Players can join by scanning the QR code on the TV with their phone, signing in to their profile and tapping <b>Join game</b>. You can also add them here.
        </p>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-blue-700" checked={r.requireRoomCode} onChange={(e) => run({ type: 'updateRules', rules: { ...r, requireRoomCode: e.target.checked } })} data-testid="require-room-code" />
          <span className="text-sm">
            <b>Require the room code</b> to join (only people who can see the TV can join)
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
            const created = await attempt(() => hostApi<{ id: string }>('POST', '/api/admin/profiles', p));
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
  return (
    <div className="space-y-4">
      <JoinHint g={g} />
      <PendingList g={g} />
      {g.practice && (
        <p className="rounded-xl bg-violet-50 p-3 text-sm text-violet-900" data-testid="practice-note">
          <FlaskConical size={16} className="mr-1 inline align-[-3px]" aria-hidden /><b>Practice game</b> — it is saved in history but does not count in statistics or the leaderboard. The buzzers open automatically after each question.
        </p>
      )}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="flex-1 text-lg font-bold">Players ({g.competitors.length})</h3>
          <Button variant="secondary" onClick={() => setAddingBot(true)} data-testid="add-bot">
            <Bot size={18} aria-hidden /> Computer opponent
          </Button>
          <Button onClick={() => setAdding(true)}>+ Add player</Button>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {g.competitors.map((c) => {
            const name = competitorName(c, g);
            return (
              <li key={c.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2" data-testid={c.bot ? 'setup-bot' : 'setup-player'}>
                <Avatar profile={competitorAvatar(c, g)} size={40} />
                <span className="min-w-0 flex-1 truncate font-semibold">{name}</span>
                {c.bot ? (
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
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
                ) : (
                  <span className={cx('text-xs', g.online?.includes(c.profileId!) ? 'text-green-700' : 'text-slate-400')}>{g.online?.includes(c.profileId!) ? '● phone' : '○'}</span>
                )}
                <Button size="sm" variant="ghost" onClick={() => run({ type: 'removeCompetitor', competitorId: c.id })} aria-label={`Remove ${name}`}>
                  <X size={18} aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
        {!g.competitors.length && <p className="text-slate-500">No players yet.</p>}
      </Card>
      <AddPlayerModal open={adding} onClose={() => setAdding(false)} exclude={g.competitors.flatMap((c) => c.memberIds)} onPick={(id) => run({ type: 'addPlayer', profileId: id })} />
      <AddBotModal open={addingBot} onClose={() => setAddingBot(false)} g={g} />
    </div>
  );
}

function AddBotModal({ open, onClose, g }: { open: boolean; onClose: () => void; g: GameView }) {
  const taken = new Set(g.competitors.filter((c) => c.bot).map((c) => c.name.toLowerCase()));
  const suggestion = BOT_NAMES.find((n) => !taken.has(n.toLowerCase())) ?? `Computer ${taken.size + 1}`;
  const [name, setName] = useState(suggestion);
  const [level, setLevel] = useState<BotLevel>('medium');
  useEffect(() => {
    if (open) setName(suggestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Add a computer opponent">
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Computer opponents buzz in, answer, wager and play the Final by themselves — great for practice or a small group. They never buzz early, and their results are not saved to any player profile.</p>
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
        <ActionButton
          size="lg"
          className="w-full"
          disabled={!name.trim()}
          onAction={async () => {
            if (await run({ type: 'addBot', name: name.trim(), level })) onClose();
          }}
          data-testid="confirm-add-bot"
        >
          Add {name.trim() || 'opponent'}
        </ActionButton>
      </div>
    </Modal>
  );
}

function TeamSetup({ g }: { g: GameView }) {
  const saved = useTeams();
  const [editing, setEditing] = useState<null | { competitorId?: string }>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const inGame = g.competitors.flatMap((c) => c.memberIds);
  const unassigned = g.unassigned.filter((u) => !u.pending);
  const availableSaved = (saved.data ?? []).filter((t) => !g.competitors.some((c) => c.teamId === t.id));

  return (
    <div className="space-y-4">
      <JoinHint g={g} />
      <PendingList g={g} />
      <BalanceTeams g={g} people={unassigned.map((u) => u.profileId)} />
      {unassigned.length > 0 && (
        <Card>
          <h3 className="mb-2 font-bold">Players without a team</h3>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((u) => (
              <div key={u.profileId} className="flex items-center gap-2 rounded-full bg-slate-100 py-1 pr-1 pl-1">
                <Avatar profile={g.profiles[u.profileId]} size={28} />
                <span className="font-semibold">{profileName(g.profiles[u.profileId])}</span>
                <select
                  className="rounded-full border border-slate-300 bg-white px-2 py-1 text-sm"
                  value=""
                  onChange={(e) => e.target.value && run({ type: 'assignMember', profileId: u.profileId, competitorId: e.target.value })}
                  aria-label={`Choose team for ${profileName(g.profiles[u.profileId])}`}
                >
                  <option value="">Choose team…</option>
                  {g.competitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {g.competitors.map((c) => (
          <Card key={c.id} className="space-y-3" >
            <div className="flex items-center gap-3" data-testid="team-card">
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-2xl" style={{ background: c.color }}>
                {avatarEmoji(c.avatar)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-bold">{c.name}</div>
                <div className="text-xs text-slate-500">{c.memberIds.length} players</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing({ competitorId: c.id })}>
                Edit
              </Button>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold text-slate-600">Buzzer mode</div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`${c.name} buzzer mode`}>
                {(['individual', 'shared'] as const).map((m) => (
                  <button
                    key={m}
                    role="radio"
                    aria-checked={c.buzzerMode === m}
                    onClick={() => run({ type: 'updateCompetitor', competitorId: c.id, buzzerMode: m })}
                    className={cx('min-h-12 rounded-xl border-2 px-2 text-sm font-semibold', c.buzzerMode === m ? 'border-blue-700 bg-blue-50 text-blue-900' : 'border-slate-200')}
                  >
                    {m === 'individual' ? <Hand size={18} aria-hidden /> : <BellRing size={18} aria-hidden />}
                {m === 'individual' ? 'Each player buzzes' : 'One shared buzzer'}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-1">
              {c.memberIds.map((m) => (
                <li key={m} className="flex items-center gap-2 rounded-lg bg-slate-50 p-1.5">
                  <Avatar profile={g.profiles[m]} size={28} />
                  <span className="flex-1 font-semibold">{profileName(g.profiles[m])}</span>
                  <select
                    className="rounded-lg border border-slate-300 bg-white px-1 py-1 text-sm"
                    value={c.id}
                    onChange={(e) => run({ type: 'assignMember', profileId: m, competitorId: e.target.value || null })}
                    aria-label={`Move ${profileName(g.profiles[m])}`}
                  >
                    {g.competitors.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.id === c.id ? 'On this team' : `Move to ${o.name}`}
                      </option>
                    ))}
                    <option value="">Remove from team</option>
                  </select>
                </li>
              ))}
            </ul>
            <Button size="sm" variant="secondary" onClick={() => setAddingTo(c.id)}>
              + Add player
            </Button>
          </Card>
        ))}
        <Card className="flex flex-col justify-center gap-2 border-dashed">
          <Button size="lg" onClick={() => setEditing({})}>
            + New team
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
                    onAction={() =>
                      run({ type: 'addTeam', teamId: t.id, name: t.name, color: t.color, avatar: t.avatar, buzzerMode: t.buzzerMode, memberIds: t.memberIds.filter((m) => !inGame.includes(m)) })
                    }
                  >
                    {avatarEmoji(t.avatar)} {t.name}
                  </ActionButton>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>
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

interface BoardOption {
  id: string;
  title: string;
  archived: boolean;
  favorite: boolean;
}

/** Lobby controls (R2-6): what is being played, with changes allowed until the game starts. */
function LobbyControls({ g }: { g: GameView }) {
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  useEffect(() => {
    hostApi<BoardOption[]>('GET', '/api/boards')
      .then((b) => setBoards(b.filter((x) => !x.archived || x.id === g.boardId).sort((a, c) => Number(c.favorite) - Number(a.favorite))))
      .catch(() => {});
  }, [g.boardId]);
  const people = new Set([...g.competitors.filter((c) => !c.bot).flatMap((c) => c.memberIds), ...g.unassigned.map((u) => u.profileId)]).size;
  const teamBuzzers = g.bindings.filter((b) => b.target.kind === 'competitor').length;

  const changeBoard = async (boardId: string) => {
    if (!boardId || boardId === g.boardId) return;
    if (await attempt(() => hostApi('POST', '/api/games/current/board', { boardId }))) toast('Board changed', 'success');
  };
  const changeMode = async (mode: 'solo' | 'team') => {
    if (mode === g.mode) return;
    const lines =
      mode === 'team'
        ? ['Everyone stays in the game but needs to be put on a team.', g.competitors.some((c) => c.bot) ? 'Computer opponents leave (they only play individual games).' : '', 'Buzzers assigned to a player stay with that player.']
        : ['Teams are split up; every member plays for themselves.', teamBuzzers ? `${teamBuzzers} shared team buzzer${teamBuzzers === 1 ? '' : 's'} will need to be assigned again.` : '', 'Buzzers assigned to a player stay with that player.'];
    if (!confirm(`Switch to ${mode === 'team' ? 'teams' : 'individuals'}?\n\n${lines.filter(Boolean).join('\n')}`)) return;
    await run({ type: 'setMode', mode });
  };

  return (
    <Card className="grid gap-3 sm:grid-cols-[1.5fr_1fr_auto] sm:items-end" data-testid="lobby-controls">
      <Field label="Board">
        <select className={inputCls} value={g.boardId ?? ''} onChange={(e) => void changeBoard(e.target.value)} aria-label="Board">
          {!g.boardId && <option value="">(board no longer in the library)</option>}
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Play as" group>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
          {(['solo', 'team'] as const).map((m) => (
            <button
              key={m}
              onClick={() => void changeMode(m)}
              disabled={m === 'team' && g.practice}
              aria-pressed={g.mode === m}
              className={cx('flex min-h-11 items-center justify-center gap-1.5 rounded-lg font-semibold disabled:opacity-40', g.mode === m ? 'bg-white text-blue-800 shadow-sm' : 'text-slate-600')}
              data-testid={`mode-${m}`}
            >
              {m === 'solo' ? <User size={18} aria-hidden /> : <Users size={18} aria-hidden />}
              {m === 'solo' ? 'Individuals' : 'Teams'}
            </button>
          ))}
        </div>
      </Field>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-600" data-testid="lobby-count">
          {people}
          {g.rules.maxPlayers ? ` / ${g.rules.maxPlayers}` : ''} {people === 1 && !g.rules.maxPlayers ? 'player' : 'players'}
        </span>
        <Button variant="secondary" onClick={() => setRulesOpen(true)}>
          <SlidersHorizontal size={18} aria-hidden /> Rules
        </Button>
      </div>
      <RulesEditor open={rulesOpen} onClose={() => setRulesOpen(false)} g={g} run={async (a) => ({ ok: await run(a) })} />
    </Card>
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
