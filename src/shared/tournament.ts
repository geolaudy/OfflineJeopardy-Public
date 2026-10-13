// Tournaments (O8): a named series of games. Standings are derived from the finished games'
// historical records (never stored), so undoing a game end or deleting a game updates them.

export type TournamentScoring = 'placement' | 'total';
export const SCORING_LABELS: Record<TournamentScoring, string> = {
  placement: 'Placement points (1st 5 · 2nd 3 · 3rd 2 · playing 1)',
  total: 'Total score across all games',
};

/** Points for a finishing place in one game. */
export function placementPoints(place: number | null | undefined): number {
  if (place === 1) return 5;
  if (place === 2) return 3;
  if (place === 3) return 2;
  return 1; // took part
}

export interface Tournament {
  id: string;
  name: string;
  mode: 'solo' | 'team';
  scoring: TournamentScoring;
  status: 'active' | 'finished';
  createdAt: number;
  updatedAt: number;
}

/** One competitor's result in one finished game (from game_competitors). */
export interface TournamentResultRow {
  gameId: string;
  /** Stable key across games: profile id (solo), saved team id (teams), else the name. */
  key: string;
  name: string;
  color: string;
  profileId: string | null;
  teamId: string | null;
  finalScore: number;
  placement: number | null;
  isWinner: boolean;
  endedAt: number;
}

export interface StandingRow {
  rank: number;
  key: string;
  name: string;
  color: string;
  profileId: string | null;
  teamId: string | null;
  games: number;
  wins: number;
  points: number;
  totalScore: number;
}

export function computeStandings(rows: TournamentResultRow[], scoring: TournamentScoring): StandingRow[] {
  const by = new Map<string, Omit<StandingRow, 'rank'> & { lastAt: number }>();
  for (const r of rows) {
    const s = by.get(r.key) ?? { key: r.key, name: r.name, color: r.color, profileId: r.profileId, teamId: r.teamId, games: 0, wins: 0, points: 0, totalScore: 0, lastAt: 0 };
    s.games++;
    if (r.isWinner) s.wins++;
    s.totalScore += r.finalScore;
    s.points += scoring === 'placement' ? placementPoints(r.placement) : r.finalScore;
    if (r.endedAt >= s.lastAt) {
      // Latest name and colour (players may rename themselves between games).
      s.lastAt = r.endedAt;
      s.name = r.name;
      s.color = r.color;
    }
    by.set(r.key, s);
  }
  const list = [...by.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || b.totalScore - a.totalScore || a.name.localeCompare(b.name));
  let rank = 0;
  let prev: (typeof list)[number] | null = null;
  return list.map((s, i) => {
    // Equal points, wins and total share a rank.
    if (!prev || s.points !== prev.points || s.wins !== prev.wins || s.totalScore !== prev.totalScore) rank = i + 1;
    prev = s;
    const { lastAt: _lastAt, ...row } = s;
    return { rank, ...row };
  });
}
