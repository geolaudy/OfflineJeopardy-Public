// Leaderboard ranking rules shared by the phone/host leaderboard and the TV presentation, so both
// always rank the same way. Solo games, team games and individual contributions are separate
// views — incompatible statistics are never mixed into one ranking.

export interface LeaderRow {
  id: string;
  name: string;
  nickname: string;
  color: string;
  avatar: string;
  pictureUrl: string | null;
  solo: { games: number; wins: number; winRate: number | null; averageScore: number | null; highestScore: number | null; correct: number; incorrect: number; accuracy: number | null; earned?: number };
  team: { games: number; wins: number; winRate: number | null };
  contribution: { games: number; correct: number; incorrect: number; accuracy: number | null; earned: number; net: number };
}

export type LeaderView = 'solo' | 'team' | 'contribution';
export type ValueFormat = 'count' | 'pct' | 'score';

export interface Criterion {
  key: string;
  label: string;
  format: ValueFormat;
  value: (r: LeaderRow) => number | null;
  /** Rate-based criteria need a minimum sample to be ranked fairly (how much is a setting, K17). */
  min?: MinSpec<LeaderRow>;
}

/** Minimum sample for rate-based rankings: games played, or answers given. Host setting (K17). */
export interface Thresholds {
  games: number;
  answers: number;
}
export const DEFAULT_THRESHOLDS: Thresholds = { games: 3, answers: 10 };
export const MIN_GAMES = DEFAULT_THRESHOLDS.games;
export const MIN_ANSWERS = DEFAULT_THRESHOLDS.answers;

/** What a minimum counts ("solo games", "answers"); the number comes from the thresholds. */
export interface MinSpec<R> {
  kind: keyof Thresholds;
  what: string;
  count: (r: R) => number;
}
/** A criterion with its minimum resolved for the current thresholds. */
export type Resolved<C> = Omit<C, 'min'> & { min?: { label: string; ok: (r: never) => boolean } };

function resolveMin<R>(m: MinSpec<R> | undefined, th: Thresholds) {
  if (!m) return undefined;
  const n = Math.max(1, th[m.kind]);
  return { label: `at least ${n} ${n === 1 ? m.what.replace(/s$/, '') : m.what}`, ok: (r: R) => m.count(r) >= n };
}

export const CRITERIA: Record<LeaderView, Criterion[]> = {
  solo: [
    { key: 'wins', label: 'Wins', format: 'count', value: (r) => r.solo.wins },
    { key: 'winRate', label: 'Win %', format: 'pct', value: (r) => r.solo.winRate, min: { kind: 'games', what: 'solo games', count: (r) => r.solo.games } },
    { key: 'avg', label: 'Average score', format: 'score', value: (r) => r.solo.averageScore, min: { kind: 'games', what: 'solo games', count: (r) => r.solo.games } },
    { key: 'high', label: 'Highest score', format: 'score', value: (r) => r.solo.highestScore },
    { key: 'earned', label: 'Points earned', format: 'score', value: (r) => r.solo.earned ?? null },
    { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.solo.correct },
    { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.solo.incorrect },
    { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.solo.accuracy, min: { kind: 'answers', what: 'answers', count: (r) => r.solo.correct + r.solo.incorrect } },
    { key: 'games', label: 'Games played', format: 'count', value: (r) => r.solo.games },
  ],
  team: [
    { key: 'wins', label: 'Team wins', format: 'count', value: (r) => r.team.wins },
    { key: 'winRate', label: 'Team win %', format: 'pct', value: (r) => r.team.winRate, min: { kind: 'games', what: 'team games', count: (r) => r.team.games } },
    { key: 'games', label: 'Team games played', format: 'count', value: (r) => r.team.games },
  ],
  contribution: [
    { key: 'net', label: 'Net contribution', format: 'score', value: (r) => r.contribution.net },
    { key: 'earned', label: 'Points earned', format: 'score', value: (r) => r.contribution.earned },
    { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.contribution.correct },
    { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.contribution.incorrect },
    { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.contribution.accuracy, min: { kind: 'answers', what: 'answers', count: (r) => r.contribution.correct + r.contribution.incorrect } },
  ],
};

export const VIEW_LABELS: Record<LeaderView, { label: string; hint: string }> = {
  solo: { label: 'Solo', hint: 'Games where everyone played for themselves.' },
  team: { label: 'Team games', hint: 'Results of the teams each player was on. Team points belong to the team.' },
  contribution: { label: 'Contributions', hint: 'Answers a player personally gave during team games. Shared-buzzer answers with no named player are not counted.' },
};

export const played = (v: LeaderView, r: LeaderRow) => (v === 'solo' ? r.solo.games : v === 'team' ? r.team.games : r.contribution.games);

export function formatValue(v: number | null, f: ValueFormat): string {
  if (v == null) return '—';
  if (f === 'pct') return `${Math.round(v * 1000) / 10}%`;
  if (f === 'score') return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString();
  return String(v);
}

export function secondaryLine(v: LeaderView, r: LeaderRow) {
  if (v === 'solo') return `${r.solo.games} games · ${r.solo.wins} wins · ${formatValue(r.solo.accuracy, 'pct')} accuracy`;
  if (v === 'team') return `${r.team.games} team games · ${r.team.wins} wins`;
  return `${r.contribution.correct}✓ ${r.contribution.incorrect}✗ · earned ${formatValue(r.contribution.earned, 'score')}`;
}

export function criterionFor(view: LeaderView, key: string | undefined) {
  const list = CRITERIA[view];
  return list.find((c) => c.key === key) ?? list[0];
}

/** Rank rows for a view + criterion. Ties share a rank; players below the minimum sample are unranked. */
export function rankRows(rows: LeaderRow[], view: LeaderView, key?: string, th: Thresholds = DEFAULT_THRESHOLDS) {
  const base = criterionFor(view, key);
  const min = resolveMin(base.min, th);
  const crit = { ...base, min };
  const playing = rows.filter((r) => played(view, r) > 0);
  const eligible = playing.filter((r) => !crit.min || crit.min.ok(r));
  const sorted = [...eligible].sort((a, b) => (crit.value(b) ?? -Infinity) - (crit.value(a) ?? -Infinity) || a.name.localeCompare(b.name));
  const ranked = sorted.map((r) => ({ r, rank: 1 }));
  for (let i = 0; i < ranked.length; i++) ranked[i].rank = i > 0 && crit.value(ranked[i].r) === crit.value(ranked[i - 1].r) ? ranked[i - 1].rank : i + 1;
  return { crit, ranked, unranked: playing.filter((r) => crit.min && !crit.min.ok(r)), notPlayed: rows.length - playing.length };
}

// ---------- Saved teams (team statistics, not players) ----------

export interface TeamLeaderRow {
  id: string;
  name: string;
  color: string;
  avatar: string;
  members: number;
  games: number;
  wins: number;
  winRate: number | null;
  averageScore: number | null;
  correct: number;
  incorrect: number;
  accuracy: number | null;
}

export interface TeamCriterion {
  key: string;
  label: string;
  format: ValueFormat;
  value: (r: TeamLeaderRow) => number | null;
  min?: MinSpec<TeamLeaderRow>;
}

export const TEAM_CRITERIA: TeamCriterion[] = [
  { key: 'wins', label: 'Wins', format: 'count', value: (r) => r.wins },
  { key: 'winRate', label: 'Win %', format: 'pct', value: (r) => r.winRate, min: { kind: 'games', what: 'games', count: (r) => r.games } },
  { key: 'avg', label: 'Average score', format: 'score', value: (r) => r.averageScore, min: { kind: 'games', what: 'games', count: (r) => r.games } },
  { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.correct },
  { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.incorrect },
  { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.accuracy, min: { kind: 'answers', what: 'answers', count: (r) => r.correct + r.incorrect } },
  { key: 'games', label: 'Games played', format: 'count', value: (r) => r.games },
];

export const TEAMS_VIEW_LABEL = { label: 'Teams', hint: 'Saved teams ranked by their own results. Team points belong to the team.' };

export const teamSecondaryLine = (r: TeamLeaderRow) =>
  `${r.members} ${r.members === 1 ? 'member' : 'members'} · ${r.games} ${r.games === 1 ? 'game' : 'games'} · ${r.wins} ${r.wins === 1 ? 'win' : 'wins'}`;

/** Same tie and minimum-sample rules as rankRows, for saved teams. */
export function rankTeamRows(rows: TeamLeaderRow[], key?: string, th: Thresholds = DEFAULT_THRESHOLDS) {
  const base = TEAM_CRITERIA.find((c) => c.key === key) ?? TEAM_CRITERIA[0];
  const crit = { ...base, min: resolveMin(base.min, th) };
  const playing = rows.filter((r) => r.games > 0);
  const eligible = playing.filter((r) => !crit.min || crit.min.ok(r));
  const sorted = [...eligible].sort((a, b) => (crit.value(b) ?? -Infinity) - (crit.value(a) ?? -Infinity) || a.name.localeCompare(b.name));
  const ranked = sorted.map((r) => ({ r, rank: 1 }));
  for (let i = 0; i < ranked.length; i++) ranked[i].rank = i > 0 && crit.value(ranked[i].r) === crit.value(ranked[i - 1].r) ? ranked[i - 1].rank : i + 1;
  return { crit, ranked, unranked: playing.filter((r) => crit.min && !crit.min.ok(r)), notPlayed: rows.length - playing.length };
}
