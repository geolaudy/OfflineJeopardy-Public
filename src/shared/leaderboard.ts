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
  /** Rate-based criteria need a minimum sample to be ranked fairly. */
  min?: { label: string; ok: (r: LeaderRow) => boolean };
}

export const MIN_GAMES = 3;
export const MIN_ANSWERS = 10;

export const CRITERIA: Record<LeaderView, Criterion[]> = {
  solo: [
    { key: 'wins', label: 'Wins', format: 'count', value: (r) => r.solo.wins },
    { key: 'winRate', label: 'Win %', format: 'pct', value: (r) => r.solo.winRate, min: { label: `at least ${MIN_GAMES} solo games`, ok: (r) => r.solo.games >= MIN_GAMES } },
    { key: 'avg', label: 'Average score', format: 'score', value: (r) => r.solo.averageScore, min: { label: `at least ${MIN_GAMES} solo games`, ok: (r) => r.solo.games >= MIN_GAMES } },
    { key: 'high', label: 'Highest score', format: 'score', value: (r) => r.solo.highestScore },
    { key: 'earned', label: 'Points earned', format: 'score', value: (r) => r.solo.earned ?? null },
    { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.solo.correct },
    { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.solo.incorrect },
    { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.solo.accuracy, min: { label: `at least ${MIN_ANSWERS} answers`, ok: (r) => r.solo.correct + r.solo.incorrect >= MIN_ANSWERS } },
    { key: 'games', label: 'Games played', format: 'count', value: (r) => r.solo.games },
  ],
  team: [
    { key: 'wins', label: 'Team wins', format: 'count', value: (r) => r.team.wins },
    { key: 'winRate', label: 'Team win %', format: 'pct', value: (r) => r.team.winRate, min: { label: `at least ${MIN_GAMES} team games`, ok: (r) => r.team.games >= MIN_GAMES } },
    { key: 'games', label: 'Team games played', format: 'count', value: (r) => r.team.games },
  ],
  contribution: [
    { key: 'net', label: 'Net contribution', format: 'score', value: (r) => r.contribution.net },
    { key: 'earned', label: 'Points earned', format: 'score', value: (r) => r.contribution.earned },
    { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.contribution.correct },
    { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.contribution.incorrect },
    { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.contribution.accuracy, min: { label: `at least ${MIN_ANSWERS} answers`, ok: (r) => r.contribution.correct + r.contribution.incorrect >= MIN_ANSWERS } },
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
export function rankRows(rows: LeaderRow[], view: LeaderView, key?: string) {
  const crit = criterionFor(view, key);
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
  min?: { label: string; ok: (r: TeamLeaderRow) => boolean };
}

export const TEAM_CRITERIA: TeamCriterion[] = [
  { key: 'wins', label: 'Wins', format: 'count', value: (r) => r.wins },
  { key: 'winRate', label: 'Win %', format: 'pct', value: (r) => r.winRate, min: { label: `at least ${MIN_GAMES} games`, ok: (r) => r.games >= MIN_GAMES } },
  { key: 'avg', label: 'Average score', format: 'score', value: (r) => r.averageScore, min: { label: `at least ${MIN_GAMES} games`, ok: (r) => r.games >= MIN_GAMES } },
  { key: 'correct', label: 'Correct answers', format: 'count', value: (r) => r.correct },
  { key: 'incorrect', label: 'Incorrect answers', format: 'count', value: (r) => r.incorrect },
  { key: 'accuracy', label: 'Accuracy', format: 'pct', value: (r) => r.accuracy, min: { label: `at least ${MIN_ANSWERS} answers`, ok: (r) => r.correct + r.incorrect >= MIN_ANSWERS } },
  { key: 'games', label: 'Games played', format: 'count', value: (r) => r.games },
];

export const TEAMS_VIEW_LABEL = { label: 'Teams', hint: 'Saved teams ranked by their own results. Team points belong to the team.' };

export const teamSecondaryLine = (r: TeamLeaderRow) =>
  `${r.members} ${r.members === 1 ? 'member' : 'members'} · ${r.games} ${r.games === 1 ? 'game' : 'games'} · ${r.wins} ${r.wins === 1 ? 'win' : 'wins'}`;

/** Same tie and minimum-sample rules as rankRows, for saved teams. */
export function rankTeamRows(rows: TeamLeaderRow[], key?: string) {
  const crit = TEAM_CRITERIA.find((c) => c.key === key) ?? TEAM_CRITERIA[0];
  const playing = rows.filter((r) => r.games > 0);
  const eligible = playing.filter((r) => !crit.min || crit.min.ok(r));
  const sorted = [...eligible].sort((a, b) => (crit.value(b) ?? -Infinity) - (crit.value(a) ?? -Infinity) || a.name.localeCompare(b.name));
  const ranked = sorted.map((r) => ({ r, rank: 1 }));
  for (let i = 0; i < ranked.length; i++) ranked[i].rank = i > 0 && crit.value(ranked[i].r) === crit.value(ranked[i - 1].r) ? ranked[i - 1].rank : i + 1;
  return { crit, ranked, unranked: playing.filter((r) => crit.min && !crit.min.ok(r)), notPlayed: rows.length - playing.length };
}
