// Host Home before a game exists (R2-4): choose board, mode, rules and player limit, see a summary,
// then Open lobby — which creates the game in its lobby phase and shows the lobby on the TV.
// Starting play is a separate step (in the lobby setup).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Play, SlidersHorizontal, Star, Trash2, User, Users } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { ActionButton, Button, Card, Empty, Field, PageTitleBar, inputCls, cx } from '../../components/ui';
import { RULE_PRESETS, rulesFromPreset, type GameRules } from '../../../shared/game';
import { summarizeRules } from '../../../shared/rulesSummary';
import RulesEditor from './RulesEditor';
import { usePresent } from './AppShell';
import { ShowSettingsOnTv } from './ShowSettingsOnTv';

interface BoardSummary {
  id: string;
  title: string;
  description: string;
  archived: boolean;
  favorite: boolean;
  clueCount: number;
  completeCount: number;
  rounds: { name: string; kind: string; categories: string[] }[];
}
interface SavedGame {
  id: string;
  title: string;
  mode: string;
  status: string;
  updatedAt: number;
}

export default function GamePicker() {
  const games = useFetch(() => hostApi<{ games: SavedGame[] }>('GET', '/api/games'), []);
  const boards = useFetch(() => hostApi<BoardSummary[]>('GET', '/api/boards'), []);
  const tournaments = useFetch(() => hostApi<{ id: string; name: string; mode: 'solo' | 'team'; status: string; games: number }[]>('GET', '/api/tournaments'), []);
  const [tournamentId, setTournamentId] = useState('');
  const { show } = usePresent();
  const [boardId, setBoardId] = useState<string | null>(null);
  const [mode, setMode] = useState<'solo' | 'team'>('solo');
  const [preset, setPreset] = useState('classic');
  const [rules, setRules] = useState<GameRules>(() => rulesFromPreset('classic'));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [practice, setPractice] = useState(false);
  const list = (boards.data ?? []).filter((b) => !b.archived).sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const selected = list.find((b) => b.id === (boardId ?? list[0]?.id));
  const openTournaments = (tournaments.data ?? []).filter((t) => t.status === 'active' && t.mode === mode);
  const tournament = !practice ? openTournaments.find((t) => t.id === tournamentId) : undefined;
  const summary = useMemo(
    () => [...(tournament ? [{ label: 'Tournament', value: `${tournament.name} (game ${tournament.games + 1})` }] : []), ...summarizeRules(rules, { mode, boardTitle: selected?.title, practice: mode === 'solo' && practice })],
    [rules, mode, selected?.title, practice, tournament],
  );

  // The TV's Settings page shows these choices (public rules only) until the game exists (R3-4).
  const draftKey = JSON.stringify({ mode, boardId: selected?.id ?? null, rules, practice: mode === 'solo' && practice, tournamentId: tournament?.id ?? null });
  useEffect(() => {
    const t = setTimeout(() => void hostApi('POST', '/api/lobby/draft', { draft: JSON.parse(draftKey) }).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [draftKey]);

  // Choosing a board brings the TV back to the pre-lobby preview, which highlights that board among
  // the choices and shows its categories (R4-11; while presenting).
  useEffect(() => {
    if (boardId) show({ page: 'lobby' });
  }, [boardId, show]);

  const pickPreset = (p: string) => {
    setPreset(p);
    setRules((r) => ({ ...rulesFromPreset(p), maxPlayers: r.maxPlayers }));
  };

  const openLobby = async () => {
    // The lobby session (pairing, TV lobby) exists before the game; creating it again is harmless.
    await attempt(() => hostApi('POST', '/api/lobby', {}));
    const r = await attempt(() => hostApi('POST', '/api/games', { boardId: selected!.id, mode, rules, title: title.trim() || undefined, practice: mode === 'solo' && practice, tournamentId: tournament?.id ?? null }));
    if (r) show({ page: 'lobby' });
  };

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitleBar title="Set up a game" subtitle="Choose a board and the rules, then open the lobby so players can join." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="space-y-4">
          <Card className="space-y-4">
            <Field label="Board" group>
              <div className="max-h-72 space-y-2 overflow-auto">
                {list.map((b) => (
                  <div key={b.id} className={cx('flex items-stretch gap-1 rounded-xl border-2', selected?.id === b.id ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                    <button onClick={() => setBoardId(b.id)} className="min-w-0 flex-1 p-3 text-left" aria-pressed={selected?.id === b.id}>
                      <div className="flex items-center gap-1.5 font-semibold">
                        {b.favorite ? <Star size={16} className="shrink-0 fill-amber-400 text-amber-500" aria-label="Favorite" /> : null}
                        <span className="truncate">{b.title}</span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {b.rounds.filter((r) => r.kind === 'standard').length} rounds · {b.clueCount} clues
                        {b.completeCount < b.clueCount ? ` · ${b.clueCount - b.completeCount} unfinished` : ''}
                      </div>
                    </button>
                    <Link to={`/board/preview/${b.id}`} className="flex w-12 items-center justify-center rounded-r-xl text-slate-500 hover:bg-slate-100" aria-label={`Preview ${b.title}`} title="Preview the board">
                      <Eye size={20} aria-hidden />
                    </Link>
                  </div>
                ))}
                {!list.length && <p className="text-slate-500">No boards yet — create one in Boards.</p>}
              </div>
            </Field>
            <Field label="Game title (optional)">
              <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selected?.title ?? ''} maxLength={120} />
            </Field>
            <Field label="Play as" group>
              <div className="grid grid-cols-2 gap-2">
                {(['solo', 'team'] as const).map((m) => (
                  <Button key={m} variant={mode === m ? 'primary' : 'secondary'} size="lg" onClick={() => setMode(m)} aria-pressed={mode === m}>
                    {m === 'solo' ? <User size={20} aria-hidden /> : <Users size={20} aria-hidden />}
                    {m === 'solo' ? 'Individuals' : 'Teams'}
                  </Button>
                ))}
              </div>
            </Field>
            {(openTournaments.length > 0 || (tournaments.data?.length ?? 0) > 0) && !(mode === 'solo' && practice) && (
              <Field label="Tournament" hint={tournament ? 'The result counts towards the tournament standings.' : undefined}>
                {openTournaments.length ? (
                  <select className={inputCls} value={tournament?.id ?? ''} onChange={(e) => setTournamentId(e.target.value)} aria-label="Tournament" data-testid="tournament-select">
                    <option value="">Not part of a tournament</option>
                    {openTournaments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — game {t.games + 1}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-slate-500">
                    No open tournament for {mode === 'team' ? 'teams' : 'individuals'}.{' '}
                    <Link to="/host/tournaments" className="font-semibold text-blue-700 underline">
                      Start one
                    </Link>
                  </p>
                )}
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Field label="Rules" hint={RULE_PRESETS[preset]?.description}>
                <select className={inputCls} value={preset} onChange={(e) => pickPreset(e.target.value)} aria-label="Rules preset">
                  {Object.entries(RULE_PRESETS).map(([k, p]) => (
                    <option key={k} value={k}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Player limit" hint="0 = no limit">
                <input className={cx(inputCls, 'w-28')} inputMode="numeric" value={rules.maxPlayers} onChange={(e) => setRules({ ...rules, maxPlayers: Math.min(200, Number(e.target.value.replace(/\D/g, '') || 0)) })} aria-label="Player limit" />
              </Field>
            </div>
            <Button variant="secondary" onClick={() => setRulesOpen(true)} data-testid="customize-rules">
              <SlidersHorizontal size={18} aria-hidden /> Customize rules, timers and buzzers…
            </Button>
            {mode === 'solo' && (
              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-violet-50 px-3 py-2">
                <input type="checkbox" className="h-6 w-6 accent-violet-700" checked={practice} onChange={(e) => setPractice(e.target.checked)} data-testid="practice-toggle" />
                <span>
                  <span className="block font-semibold">Practice game</span>
                  <span className="block text-xs text-slate-600">Not counted in statistics. Buzzers open by themselves; add computer opponents to play alone.</span>
                </span>
              </label>
            )}
          </Card>
        </section>

        <section className="space-y-4">
          <Card className="space-y-3" data-testid="setup-summary">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 text-lg font-bold">Summary</h2>
              <ShowSettingsOnTv />
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
              {summary.map((l) => (
                <div key={l.label} className="contents">
                  <dt className="text-slate-500">{l.label}</dt>
                  <dd className="font-semibold">{l.value}</dd>
                </div>
              ))}
            </dl>
            <ActionButton size="xl" className="w-full" disabled={!selected} onAction={openLobby} data-testid="open-lobby">
              <Play size={22} aria-hidden /> Open lobby
            </ActionButton>
            <p className="text-xs text-slate-500">Opening the lobby shows the join screen on the TV. The game starts only when you press Start game.</p>
          </Card>

          <Card className="space-y-2">
            <h2 className="text-lg font-bold">Resume a game</h2>
            {games.data?.games.length ? (
              games.data.games.map((g) => (
                <div key={g.id} className="flex items-center gap-2 rounded-xl bg-slate-50 p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{g.title}</div>
                    <div className="text-xs text-slate-500">
                      {g.status === 'setup' ? 'Setting up' : 'In progress'} · {g.mode === 'team' ? 'Teams' : 'Individuals'} · {new Date(g.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <ActionButton size="sm" onAction={() => attempt(async () => (await hostApi('POST', '/api/lobby', {}), hostApi('POST', `/api/games/${g.id}/load`)))}>
                    Resume
                  </ActionButton>
                  <ActionButton
                    size="sm"
                    variant="ghost"
                    aria-label={`Discard ${g.title}`}
                    onAction={async () => {
                      if (!confirm(`Discard "${g.title}"? It will no longer appear here.`)) return;
                      await attempt(() => hostApi('DELETE', `/api/games/${g.id}`));
                      void games.reload();
                    }}
                  >
                    <Trash2 size={18} aria-hidden />
                  </ActionButton>
                </div>
              ))
            ) : (
              <Empty title="No unfinished games" />
            )}
          </Card>
        </section>
      </div>
      <RulesEditor open={rulesOpen} onClose={() => setRulesOpen(false)} rules={rules} onSave={(r) => (setRules(r), setPreset(r.preset), true)} />
    </div>
  );
}
