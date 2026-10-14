import type { GameView } from '../../../shared/views';
import { act, present as sendPresent } from '../../lib/socket';
import { hostApi } from '../../lib/api';
import { attempt, useFetch } from '../../lib/hooks';
import { ActionButton, Avatar, cx, fmtScore } from '../../components/ui';
import { competitorAvatar, competitorName, findCompetitor, profileName } from '../../lib/view';
import { DoorOpen, Medal, Monitor, Plus, Trophy, Undo2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { usePresent } from './AppShell';
import type { StandingRow, Tournament } from '../../../shared/tournament';

export default function Results({ g }: { g: GameView }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <h2 className="text-3xl font-black">Final results</h2>
      <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
        <ActionButton size="xl" className="w-full" onAction={() => attempt(() => hostApi("POST", "/api/games/current/rematch"))} data-testid="return-to-lobby">
          <DoorOpen size={20} aria-hidden /> Return to Lobby
        </ActionButton>
        <p className="text-sm text-slate-600">Everyone stays in the same lobby: players, teams, computer players, Joy-Cons and phones, the join code, the board and the settings. Only the scores start again from zero.</p>
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <ActionButton
            variant="secondary"
            onAction={async () => (confirm('Start over with a new lobby? Players will need to join again.') ? attempt(() => hostApi('POST', '/api/games/close')) : undefined)}
            data-testid="create-new-lobby"
          >
            <Plus size={18} aria-hidden /> New Lobby
          </ActionButton>
          <ShowLeaderboards />
          <ActionButton variant="ghost" onAction={async () => (confirm('Re-open the game? The final result will be undone.') ? act({ type: 'undo' }) : undefined)}>
            <Undo2 size={18} aria-hidden /> Undo end of game
          </ActionButton>
        </div>
      </div>
      <div className="space-y-2">
        {(g.results ?? []).map((r) => {
          const c = findCompetitor(g, r.competitorId)!;
          return (
            <div key={r.competitorId} className={cx('flex items-center gap-3 rounded-2xl p-3', r.isWinner ? 'bg-yellow-300' : 'bg-white')}>
              <span className="w-10 text-2xl font-black">#{r.placement}</span>
              <Avatar profile={competitorAvatar(c, g)} size={44} />
              <div className="flex-1">
                <div className="text-lg font-bold">{competitorName(c, g)}</div>
                {c.kind === 'team' && (
                  <div className="text-sm text-slate-700">
                    {c.memberIds.map((m) => `${profileName(g.profiles[m])} (${fmtScore(g.contributions?.[m] ?? 0)})`).join(' · ')}
                  </div>
                )}
              </div>
              <span className="text-2xl font-black tabular-nums">{fmtScore(r.score)}</span>
            </div>
          );
        })}
      </div>
      <TournamentStandings g={g} />
      <p className="text-sm text-slate-600">Results, statistics and the full game history are saved. Players can see them in their profile.</p>
    </div>
  );
}

/** Updated rankings on the TV after a game (R4-9), then on to the host's Leaderboards page. */
function ShowLeaderboards() {
  const navigate = useNavigate();
  return (
    <ActionButton
      variant="secondary"
      onAction={() => {
        sendPresent({ page: 'leaderboard' }); // explicit: works in Private view too
        navigate('/host/leaderboard');
      }}
      data-testid="results-show-leaderboards"
    >
      <Medal size={18} aria-hidden /> Show Leaderboards on TV
    </ActionButton>
  );
}

/** After a tournament game: the updated standings, with a button to show them on the TV. */
function TournamentStandings({ g }: { g: GameView }) {
  const { enabled, show } = usePresent();
  const resultsKey = (g.results ?? []).map((r) => `${r.competitorId}:${r.score}`).join();
  const d = useFetch(async () => {
    const { tournament } = await hostApi<{ tournament: Tournament | null }>('GET', `/api/games/${g.id}/tournament`);
    return tournament ? hostApi<{ tournament: Tournament; standings: StandingRow[] }>('GET', `/api/tournaments/${tournament.id}`) : null;
  }, [g.id, resultsKey]);
  const t = d.data;
  if (!t) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4" data-testid="tournament-results">
      <div className="flex flex-wrap items-center gap-2">
        <Trophy size={20} className="text-amber-500" aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-lg font-bold">{t.tournament.name} — standings</h3>
        <ActionButton size="sm" variant="secondary" disabled={!enabled} onAction={() => show({ page: 'tournament', tournamentId: t.tournament.id })} data-testid="present-standings">
          <Monitor size={16} aria-hidden /> Show on TV
        </ActionButton>
      </div>
      <ol className="space-y-1">
        {t.standings.slice(0, 5).map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            <span className="w-6 font-black text-slate-500 tabular-nums">{r.rank}</span>
            <span className="h-3 w-3 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
            <span className="font-bold tabular-nums">{t.tournament.scoring === 'placement' ? `${r.points} pts` : fmtScore(r.points)}</span>
          </li>
        ))}
      </ol>
      <Link to={`/host/tournaments/${t.tournament.id}`} className="text-sm font-semibold text-blue-700 underline">
        Full standings
      </Link>
    </div>
  );
}
