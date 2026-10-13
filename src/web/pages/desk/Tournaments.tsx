// Tournaments (O8): a named series of games with running standings. Games join a tournament when
// they are set up (Home → Tournament). Standings come from finished games only.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Crown, Flag, Monitor, Pencil, Plus, RotateCcw, Trash2, Trophy, User, Users } from 'lucide-react';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { Button, Card, Empty, Field, Modal, PageTitleBar, cx, fmtScore, inputCls } from '../../components/ui';
import { SCORING_LABELS, type StandingRow, type Tournament, type TournamentScoring } from '../../../shared/tournament';
import { usePresent } from '../host/AppShell';

type Summary = Tournament & { games: number; leader: string | null };
interface Detail {
  tournament: Tournament;
  standings: StandingRow[];
  games: { id: string; title: string; status: string; endedAt: number | null; winner: string | null }[];
}

export default function Tournaments() {
  const { id } = useParams();
  return id ? <TournamentDetail id={id} /> : <TournamentList />;
}

function TournamentList() {
  const list = useFetch(() => hostApi<Summary[]>('GET', '/api/tournaments'), []);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <PageTitleBar
        title="Tournaments"
        subtitle="Play a series of games and keep running standings. Choose the tournament when you set up each game."
        actions={
          <Button onClick={() => setCreating(true)} data-testid="new-tournament">
            <Plus size={18} aria-hidden /> New tournament
          </Button>
        }
      />
      {!list.data ? (
        <p className="text-slate-500">{list.error ?? 'Loading…'}</p>
      ) : list.data.length === 0 ? (
        <Empty title="No tournaments yet">Create one, then pick it when you set up your next game.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.data.map((t) => (
            <li key={t.id}>
              <Link to={`/host/tournaments/${t.id}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50" data-testid="tournament-card">
                <div className="flex items-center gap-2">
                  <Trophy size={20} className={t.status === 'finished' ? 'text-slate-400' : 'text-amber-500'} aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-lg font-bold">{t.name}</span>
                  {t.status === 'finished' && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Finished</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {t.mode === 'team' ? 'Teams' : 'Individuals'} · {t.games} {t.games === 1 ? 'game' : 'games'}
                  {t.leader ? ` · ${t.status === 'finished' ? 'Winner' : 'Leading'}: ${t.leader}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <TournamentForm open={creating} onClose={() => setCreating(false)} onSaved={(t) => navigate(`/host/tournaments/${t.id}`)} />
    </div>
  );
}

function TournamentForm({ open, onClose, onSaved, existing }: { open: boolean; onClose: () => void; onSaved: (t: Tournament) => void; existing?: Tournament }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [mode, setMode] = useState<'solo' | 'team'>(existing?.mode ?? 'solo');
  const [scoring, setScoring] = useState<TournamentScoring>(existing?.scoring ?? 'placement');
  const save = async () => {
    const r = existing
      ? await attempt(() => hostApi<Tournament>('PATCH', `/api/tournaments/${existing.id}`, { name: name.trim(), scoring }))
      : await attempt(() => hostApi<Tournament>('POST', '/api/tournaments', { name: name.trim(), mode, scoring }));
    if (r) {
      onSaved(r);
      onClose();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit tournament' : 'New tournament'}>
      <div className="space-y-4">
        <Field label="Name">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Friday Cup" aria-label="Tournament name" />
        </Field>
        {!existing && (
          <Field label="Who plays" group>
            <div className="grid grid-cols-2 gap-2">
              {(['solo', 'team'] as const).map((m) => (
                <Button key={m} variant={mode === m ? 'primary' : 'secondary'} onClick={() => setMode(m)} aria-pressed={mode === m}>
                  {m === 'solo' ? <User size={18} aria-hidden /> : <Users size={18} aria-hidden />}
                  {m === 'solo' ? 'Individuals' : 'Teams'}
                </Button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Standings" group>
          <div className="grid gap-2">
            {(Object.keys(SCORING_LABELS) as TournamentScoring[]).map((k) => (
              <label key={k} className={cx('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2', scoring === k ? 'border-blue-700 bg-blue-50' : 'border-slate-200')}>
                <input type="radio" name="scoring" className="h-5 w-5 accent-blue-700" checked={scoring === k} onChange={() => setScoring(k)} />
                <span className="text-sm font-semibold">{SCORING_LABELS[k]}</span>
              </label>
            ))}
          </div>
        </Field>
        {mode === 'team' && !existing && <p className="text-xs text-slate-500">Use saved teams (Teams page) so a team is recognised across games.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!name.trim()} data-testid="save-tournament">
            {existing ? 'Save' : 'Create tournament'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TournamentDetail({ id }: { id: string }) {
  const d = useFetch(() => hostApi<Detail>('GET', `/api/tournaments/${id}`), [id]);
  const { enabled, show } = usePresent();
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  if (!d.data) return <div className="p-6 text-slate-500">{d.error ?? 'Loading…'}</div>;
  const { tournament: t, standings, games } = d.data;
  const finished = games.filter((g) => g.status === 'completed');
  const setStatus = async (status: 'active' | 'finished') => {
    if (await attempt(() => hostApi('PATCH', `/api/tournaments/${t.id}`, { status }))) void d.reload();
  };
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <Link to="/host/tournaments" className="inline-flex min-h-11 items-center gap-2 font-semibold text-blue-700">
        <ArrowLeft size={18} aria-hidden /> Tournaments
      </Link>
      <PageTitleBar
        title={t.name}
        subtitle={`${t.mode === 'team' ? 'Teams' : 'Individuals'} · ${SCORING_LABELS[t.scoring]}${t.status === 'finished' ? ' · finished' : ''}`}
        actions={
          <>
            <Button variant={enabled ? 'primary' : 'secondary'} onClick={() => show({ page: 'tournament', tournamentId: t.id })} disabled={!enabled} title={enabled ? 'Show the standings on the TV' : 'Turn on "Present on TV" (lobby open) to show this on the TV'} data-testid="present-tournament">
              <Monitor size={18} aria-hidden /> Show on TV
            </Button>
            <Button variant="ghost" onClick={() => setEditing(true)} aria-label="Edit tournament">
              <Pencil size={18} aria-hidden />
            </Button>
          </>
        }
      />
      {!enabled && <p className="-mt-2 text-sm text-slate-500">To show the standings on the TV, open a lobby and turn on “Present on TV”.</p>}
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Standings</h2>
        {standings.length === 0 ? (
          <p className="text-slate-500">No games finished yet. Pick this tournament on Home when you set up a game.</p>
        ) : (
          <table className="w-full text-left" data-testid="standings">
            <thead className="text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="w-10 py-1">#</th>
                <th className="py-1">{t.mode === 'team' ? 'Team' : 'Player'}</th>
                <th className="py-1 text-right">Games</th>
                <th className="py-1 text-right">Wins</th>
                <th className="py-1 text-right">{t.scoring === 'placement' ? 'Points' : 'Total'}</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="py-2 font-black text-slate-500 tabular-nums">{r.rank}</td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden />
                      {r.name}
                      {r.rank === 1 && <Crown size={16} className="text-amber-500" aria-label="Leader" />}
                    </span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{r.games}</td>
                  <td className="py-2 text-right tabular-nums">{r.wins}</td>
                  <td className="py-2 text-right font-bold tabular-nums">{t.scoring === 'placement' ? r.points : fmtScore(r.points)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Games ({finished.length} finished)</h2>
        {games.length === 0 ? (
          <p className="text-slate-500">No games yet.</p>
        ) : (
          <ol className="space-y-1">
            {games.map((g, i) => (
              <li key={g.id} className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
                <span className="w-6 font-bold text-slate-400 tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{g.title}</span>
                <span className="text-sm text-slate-600">{g.status === 'completed' ? (g.winner ? `Won by ${g.winner}` : 'Finished') : 'In progress'}</span>
              </li>
            ))}
          </ol>
        )}
      </Card>
      <div className="flex flex-wrap gap-2">
        {t.status === 'active' ? (
          <Button variant="secondary" onClick={() => confirm('Finish this tournament? The standings become final. You can reopen it later.') && void setStatus('finished')} data-testid="finish-tournament">
            <Flag size={18} aria-hidden /> Finish tournament
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void setStatus('active')}>
            <RotateCcw size={18} aria-hidden /> Reopen
          </Button>
        )}
        <Button
          variant="ghost"
          className="text-red-700"
          onClick={async () => {
            if (!confirm(`Delete "${t.name}"? The games stay in your history.`)) return;
            if (await attempt(() => hostApi('DELETE', `/api/tournaments/${t.id}`))) navigate('/host/tournaments');
          }}
        >
          <Trash2 size={18} aria-hidden /> Delete
        </Button>
      </div>
      {editing && <TournamentForm open onClose={() => setEditing(false)} onSaved={() => void d.reload()} existing={t} />}
    </div>
  );
}
