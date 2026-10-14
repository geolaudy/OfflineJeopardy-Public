// Leaderboard: solo games, team games and individual contributions in team games are separate
// views with explicit ranking criteria — incompatible statistics are never mixed into one ranking.
// Ranking rules live in src/shared/leaderboard.ts (the TV presentation uses the same rules).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { hostApi, meApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { Avatar, cx } from '../../components/ui';
import { CRITERIA, TEAM_CRITERIA, TEAMS_VIEW_LABEL, VIEW_LABELS, formatValue, rankRows, rankTeamRows, secondaryLine, teamSecondaryLine, type LeaderRow, type LeaderView, type TeamLeaderRow } from '../../../shared/leaderboard';
import { avatarEmoji } from '../../lib/avatars';

export type { LeaderRow };
/** Player views plus saved teams (team results). */
export type BoardView = LeaderView | 'teams';
const ALL_VIEWS: Record<BoardView, { label: string; hint: string }> = { ...VIEW_LABELS, teams: TEAMS_VIEW_LABEL };

function RowLink({ to, onClick, className, children }: { to: string | null; onClick?: () => void; className: string; children: ReactNode }) {
  if (to)
    return (
      <Link to={to} className={className} data-testid="leaderboard-row">
        {children}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cx(className, 'w-full text-left')} data-testid="leaderboard-row">
        {children}
      </button>
    );
  return (
    <div className={className} data-testid="leaderboard-row">
      {children}
    </div>
  );
}

/** Used by the phone portal (signed-in player) and the host app (asHost; may present on the TV). */
export default function Leaderboard({
  me,
  asHost,
  onViewChange,
  onSelectPlayer,
  onSelectTeam,
  selectedId,
}: {
  me?: { id: string } | null;
  asHost?: boolean;
  /** Host: called whenever the shown view/metric changes (to mirror it on the TV). */
  onViewChange?: (view: BoardView, metric: string) => void;
  /** Host: open a player's public stats instead of following a link. */
  onSelectPlayer?: (profileId: string) => void;
  /** Host: a saved team was chosen (teams view). */
  onSelectTeam?: (teamId: string) => void;
  /** Host: the player/team currently shown on the TV. */
  selectedId?: string | null;
}) {
  const api = asHost ? hostApi : meApi;
  const lb = useFetch(() => api<LeaderRow[]>('GET', '/api/stats/leaderboard'), [asHost]);
  const [view, setView] = useState<BoardView>('solo');
  const [critKey, setCritKey] = useState('wins');
  const wantTeams = view === 'teams';
  const teamsLb = useFetch(() => (wantTeams ? api<TeamLeaderRow[]>('GET', '/api/stats/team-leaderboard') : Promise.resolve(null)), [asHost, wantTeams]);
  const players = useMemo(() => rankRows(lb.data ?? [], view === 'teams' ? 'solo' : view, critKey), [lb.data, view, critKey]);
  const teams = useMemo(() => rankTeamRows(teamsLb.data ?? [], critKey), [teamsLb.data, critKey]);
  const crit = view === 'teams' ? teams.crit : players.crit;
  useEffect(() => onViewChange?.(view, crit.key), [view, crit.key, onViewChange]);
  const criteria = view === 'teams' ? TEAM_CRITERIA : CRITERIA[view];

  if (lb.error) return <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">{lb.error}</p>;
  if (!lb.data) return <p className="text-slate-500">Loading…</p>;
  const { ranked, unranked, notPlayed } = players;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Leaderboard type">
        {(Object.keys(ALL_VIEWS) as BoardView[]).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={view === k}
            onClick={() => {
              setView(k);
              setCritKey((k === 'teams' ? TEAM_CRITERIA : CRITERIA[k])[0].key);
            }}
            className={cx('min-h-11 rounded-lg px-1 text-sm font-semibold', view === k ? 'bg-white text-slate-900 shadow' : 'text-slate-600')}
          >
            {ALL_VIEWS[k].label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{ALL_VIEWS[view].hint}</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        Ranked by
        <select className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base" value={crit.key} onChange={(e) => setCritKey(e.target.value)} aria-label="Ranked by">
          {criteria.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {crit.min && <p className="text-xs text-slate-500">Only {view === 'teams' ? 'teams' : 'players'} with {crit.min.label} are ranked by {crit.label.toLowerCase()}.</p>}

      {view === 'teams' ? (
        <TeamRows data={teamsLb.data} error={teamsLb.error} ranked={teams.ranked} unranked={teams.unranked} crit={teams.crit} onSelect={onSelectTeam} selectedId={selectedId} />
      ) : ranked.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">No completed {view === 'solo' ? 'solo' : 'team'} games yet.</p>
      ) : (
        <ol className="space-y-2" data-testid="leaderboard">
          {ranked.map(({ r, rank }) => (
            <li key={r.id}>
              <RowLink
                to={asHost ? null : `/join/players/${r.id}`}
                onClick={onSelectPlayer ? () => onSelectPlayer(r.id) : undefined}
                className={cx('flex min-h-16 items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm active:bg-slate-50', (r.id === me?.id || r.id === selectedId) && 'ring-2 ring-blue-600')}
              >
                <span className={cx('w-8 text-center text-lg font-black tabular-nums', rank === 1 ? 'text-amber-500' : 'text-slate-400')}>{rank}</span>
                <Avatar profile={r} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {r.nickname?.trim() || r.name}
                    {r.id === me?.id && <span className="ml-1 text-xs font-semibold text-blue-700">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{secondaryLine(view, r)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xl font-black tabular-nums">{formatValue(players.crit.value(r), players.crit.format)}</span>
                  <span className="block text-[11px] text-slate-500">{crit.label}</span>
                </span>
              </RowLink>
            </li>
          ))}
        </ol>
      )}
      {view !== 'teams' && unranked.length > 0 && (
        <p className="text-sm text-slate-500">
          Not enough games yet: {unranked.map((r) => r.nickname?.trim() || r.name).join(', ')}
        </p>
      )}
      {view !== 'teams' && notPlayed > 0 && <p className="text-xs text-slate-400">{notPlayed} player{notPlayed === 1 ? '' : 's'} with public statistics haven't played this kind of game yet.</p>}
    </div>
  );
}

function TeamRows({
  data,
  error,
  ranked,
  unranked,
  crit,
  onSelect,
  selectedId,
}: {
  data: TeamLeaderRow[] | null | undefined;
  error: string | null | undefined;
  ranked: { r: TeamLeaderRow; rank: number }[];
  unranked: TeamLeaderRow[];
  crit: (typeof TEAM_CRITERIA)[number];
  onSelect?: (id: string) => void;
  selectedId?: string | null;
}) {
  if (error) return <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">{error}</p>;
  if (!data) return <p className="text-slate-500">Loading…</p>;
  if (ranked.length === 0) return <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">No saved team has finished a game yet.</p>;
  return (
    <>
      <ol className="space-y-2" data-testid="team-leaderboard">
        {ranked.map(({ r, rank }) => (
          <li key={r.id}>
            <RowLink to={null} onClick={onSelect ? () => onSelect(r.id) : undefined} className={cx('flex min-h-16 items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm active:bg-slate-50', r.id === selectedId && 'ring-2 ring-blue-600')}>
              <span className={cx('w-8 text-center text-lg font-black tabular-nums', rank === 1 ? 'text-amber-500' : 'text-slate-400')}>{rank}</span>
              <span className="flex h-10 w-10 items-center justify-center rounded-full text-xl" style={{ background: r.color }} aria-hidden>
                {avatarEmoji(r.avatar)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">{r.name}</span>
                <span className="block truncate text-xs text-slate-500">{teamSecondaryLine(r)}</span>
              </span>
              <span className="text-right">
                <span className="block text-xl font-black tabular-nums">{formatValue(crit.value(r), crit.format)}</span>
                <span className="block text-[11px] text-slate-500">{crit.label}</span>
              </span>
            </RowLink>
          </li>
        ))}
      </ol>
      {unranked.length > 0 && <p className="text-sm text-slate-500">Not enough games yet: {unranked.map((r) => r.name).join(', ')}</p>}
    </>
  );
}
