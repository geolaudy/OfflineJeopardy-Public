// Leaderboard: solo games, team games and individual contributions in team games are separate
// views with explicit ranking criteria — incompatible statistics are never mixed into one ranking.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { hostApi, meApi } from '../../lib/api';
import { useFetch } from '../../lib/hooks';
import { Avatar, cx, fmtScore, pct } from '../../components/ui';

export interface LeaderRow {
  id: string;
  name: string;
  nickname: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  solo: { games: number; wins: number; winRate: number | null; averageScore: number | null; highestScore: number | null; correct: number; incorrect: number; accuracy: number | null };
  team: { games: number; wins: number; winRate: number | null };
  contribution: { games: number; correct: number; incorrect: number; accuracy: number | null; earned: number; net: number };
}

type View = 'solo' | 'team' | 'contribution';

interface Criterion {
  key: string;
  label: string;
  value: (r: LeaderRow) => number | null;
  show: (r: LeaderRow) => string;
  /** Rate-based criteria need a minimum sample to be ranked fairly. */
  min?: { label: string; ok: (r: LeaderRow) => boolean };
}

const MIN_GAMES = 3;
const MIN_ANSWERS = 10;

const CRITERIA: Record<View, Criterion[]> = {
  solo: [
    { key: 'wins', label: 'Wins', value: (r) => r.solo.wins, show: (r) => `${r.solo.wins}` },
    { key: 'winRate', label: 'Win %', value: (r) => r.solo.winRate, show: (r) => pct(r.solo.winRate), min: { label: `at least ${MIN_GAMES} solo games`, ok: (r) => r.solo.games >= MIN_GAMES } },
    { key: 'avg', label: 'Average score', value: (r) => r.solo.averageScore, show: (r) => (r.solo.averageScore == null ? '—' : fmtScore(r.solo.averageScore)), min: { label: `at least ${MIN_GAMES} solo games`, ok: (r) => r.solo.games >= MIN_GAMES } },
    { key: 'high', label: 'Highest score', value: (r) => r.solo.highestScore, show: (r) => (r.solo.highestScore == null ? '—' : fmtScore(r.solo.highestScore)) },
    { key: 'correct', label: 'Correct answers', value: (r) => r.solo.correct, show: (r) => `${r.solo.correct}` },
    { key: 'accuracy', label: 'Accuracy', value: (r) => r.solo.accuracy, show: (r) => pct(r.solo.accuracy), min: { label: `at least ${MIN_ANSWERS} answers`, ok: (r) => r.solo.correct + r.solo.incorrect >= MIN_ANSWERS } },
    { key: 'games', label: 'Games played', value: (r) => r.solo.games, show: (r) => `${r.solo.games}` },
  ],
  team: [
    { key: 'wins', label: 'Team wins', value: (r) => r.team.wins, show: (r) => `${r.team.wins}` },
    { key: 'winRate', label: 'Team win %', value: (r) => r.team.winRate, show: (r) => pct(r.team.winRate), min: { label: `at least ${MIN_GAMES} team games`, ok: (r) => r.team.games >= MIN_GAMES } },
    { key: 'games', label: 'Team games played', value: (r) => r.team.games, show: (r) => `${r.team.games}` },
  ],
  contribution: [
    { key: 'net', label: 'Net contribution', value: (r) => r.contribution.net, show: (r) => fmtScore(r.contribution.net) },
    { key: 'earned', label: 'Points earned', value: (r) => r.contribution.earned, show: (r) => fmtScore(r.contribution.earned) },
    { key: 'correct', label: 'Correct answers', value: (r) => r.contribution.correct, show: (r) => `${r.contribution.correct}` },
    { key: 'accuracy', label: 'Accuracy', value: (r) => r.contribution.accuracy, show: (r) => pct(r.contribution.accuracy), min: { label: `at least ${MIN_ANSWERS} answers`, ok: (r) => r.contribution.correct + r.contribution.incorrect >= MIN_ANSWERS } },
  ],
};

const VIEWS: { key: View; label: string; hint: string }[] = [
  { key: 'solo', label: 'Solo', hint: 'Games where everyone played for themselves.' },
  { key: 'team', label: 'Team games', hint: 'Results of the teams each player was on. Team points belong to the team.' },
  { key: 'contribution', label: 'Contributions', hint: 'Answers a player personally gave during team games. Shared-buzzer answers with no named player are not counted.' },
];

function RowLink({ to, className, children }: { to: string | null; className: string; children: React.ReactNode }) {
  return to ? (
    <Link to={to} className={className} data-testid="leaderboard-row">
      {children}
    </Link>
  ) : (
    <div className={className} data-testid="leaderboard-row">
      {children}
    </div>
  );
}

const played = (v: View, r: LeaderRow) => (v === 'solo' ? r.solo.games : v === 'team' ? r.team.games : r.contribution.games);

function secondary(v: View, r: LeaderRow) {
  if (v === 'solo') return `${r.solo.games} games · ${r.solo.wins} wins · ${pct(r.solo.accuracy)} accuracy`;
  if (v === 'team') return `${r.team.games} team games · ${r.team.wins} wins`;
  return `${r.contribution.correct}✓ ${r.contribution.incorrect}✗ · earned ${fmtScore(r.contribution.earned)}`;
}

/** Used by the phone portal (signed-in player) and the desktop dashboard (host, no player links). */
export default function Leaderboard({ me, asHost }: { me?: { id: string } | null; asHost?: boolean }) {
  const lb = useFetch(() => (asHost ? hostApi : meApi)<LeaderRow[]>('GET', '/api/stats/leaderboard'), [asHost]);
  const [view, setView] = useState<View>('solo');
  const [critKey, setCritKey] = useState('wins');
  const criteria = CRITERIA[view];
  const crit = criteria.find((c) => c.key === critKey) ?? criteria[0];

  const { ranked, unranked, notPlayed } = useMemo(() => {
    const rows = lb.data ?? [];
    const playing = rows.filter((r) => played(view, r) > 0);
    const eligible = playing.filter((r) => !crit.min || crit.min.ok(r));
    const sorted = [...eligible].sort((a, b) => (crit.value(b) ?? -Infinity) - (crit.value(a) ?? -Infinity) || a.name.localeCompare(b.name));
    // Standard competition ranking: ties share a rank.
    const withRank = sorted.map((r, i) => ({ r, rank: i + 1 }));
    for (let i = 1; i < withRank.length; i++) if (crit.value(withRank[i].r) === crit.value(withRank[i - 1].r)) withRank[i].rank = withRank[i - 1].rank;
    return { ranked: withRank, unranked: playing.filter((r) => crit.min && !crit.min.ok(r)), notPlayed: rows.length - playing.length };
  }, [lb.data, view, crit]);

  if (lb.error) return <p className="rounded-2xl bg-white p-4 text-slate-600 shadow-sm">{lb.error}</p>;
  if (!lb.data) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1" role="tablist" aria-label="Leaderboard type">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            role="tab"
            aria-selected={view === v.key}
            onClick={() => {
              setView(v.key);
              setCritKey(CRITERIA[v.key][0].key);
            }}
            className={cx('min-h-11 rounded-lg px-1 text-sm font-semibold', view === v.key ? 'bg-white text-slate-900 shadow' : 'text-slate-600')}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{VIEWS.find((v) => v.key === view)!.hint}</p>
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
      {crit.min && <p className="text-xs text-slate-500">Only players with {crit.min.label} are ranked by {crit.label.toLowerCase()}.</p>}

      {ranked.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-slate-600 shadow-sm">No completed {view === 'solo' ? 'solo' : 'team'} games yet.</p>
      ) : (
        <ol className="space-y-2" data-testid="leaderboard">
          {ranked.map(({ r, rank }) => (
            <li key={r.id}>
              <RowLink
                to={asHost ? null : `/join/players/${r.id}`}
                className={cx('flex min-h-16 items-center gap-3 rounded-2xl bg-white px-3 py-2 shadow-sm active:bg-slate-50', r.id === me?.id && 'ring-2 ring-blue-600')}
              >
                <span className={cx('w-8 text-center text-lg font-black tabular-nums', rank === 1 ? 'text-amber-500' : 'text-slate-400')}>{rank}</span>
                <Avatar profile={r} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">
                    {r.nickname?.trim() || r.name}
                    {r.id === me?.id && <span className="ml-1 text-xs font-semibold text-blue-700">(you)</span>}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{secondary(view, r)}</span>
                </span>
                <span className="text-right">
                  <span className="block text-xl font-black tabular-nums">{crit.show(r)}</span>
                  <span className="block text-[11px] text-slate-500">{crit.label}</span>
                </span>
              </RowLink>
            </li>
          ))}
        </ol>
      )}
      {unranked.length > 0 && (
        <p className="text-sm text-slate-500">
          Not enough games yet: {unranked.map((r) => r.nickname?.trim() || r.name).join(', ')}
        </p>
      )}
      {notPlayed > 0 && <p className="text-xs text-slate-400">{notPlayed} player{notPlayed === 1 ? '' : 's'} with public statistics haven't played this kind of game yet.</p>}
    </div>
  );
}
