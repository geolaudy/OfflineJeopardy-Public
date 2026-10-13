// Automatic team balancing (T11). Ratings come from each player's history; new players count as
// average. Teams are drawn snake-style from strongest to weakest, then improved by swaps until
// the team totals are as close as possible. A seed lets the host "shuffle" between equally good splits.

export interface RatedPlayer {
  id: string;
  /** 0–100; 50 = average / no history. */
  rating: number;
}

export interface PlayerRecord {
  games: number;
  wins: number;
  correct: number;
  incorrect: number;
}

/**
 * Skill estimate with gentle priors so one lucky game does not dominate:
 * accuracy as if every player had 3 extra right and 3 extra wrong answers, win rate as if
 * every player had one extra win in three extra games.
 */
export function ratingOf(r: PlayerRecord): number {
  const acc = (r.correct + 3) / (r.correct + r.incorrect + 6);
  const win = (r.wins + 1) / (r.games + 3);
  return Math.round((acc * 0.7 + win * 0.3) * 1000) / 10;
}

/** Small deterministic PRNG (mulberry32) so a seed reproduces the same shuffle. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sum = (team: RatedPlayer[]) => team.reduce((s, p) => s + p.rating, 0);
/** How unfair a split is: spread of team averages (sizes differ by at most one). */
export function imbalance(teams: RatedPlayer[][]): number {
  const avgs = teams.filter((t) => t.length).map((t) => sum(t) / t.length);
  return avgs.length ? Math.max(...avgs) - Math.min(...avgs) : 0;
}

export function balanceTeams(players: RatedPlayer[], teamCount: number, seed = 1): RatedPlayer[][] {
  const n = Math.max(1, Math.min(teamCount, players.length || 1));
  const rand = rng(seed);
  // Strongest first; near-equal ratings are shuffled so "Shuffle" gives a different but fair split.
  const order = [...players].map((p) => ({ p, k: p.rating + rand() * 4 })).sort((a, b) => b.k - a.k).map((x) => x.p);
  const teams: RatedPlayer[][] = Array.from({ length: n }, () => []);
  order.forEach((p, i) => {
    const round = Math.floor(i / n);
    const pos = i % n;
    teams[round % 2 === 0 ? pos : n - 1 - pos].push(p);
  });
  // Improve with pairwise swaps between teams while that lowers the imbalance.
  for (let pass = 0; pass < 50; pass++) {
    let best = imbalance(teams);
    let move: [number, number, number, number] | null = null;
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let i = 0; i < teams[a].length; i++)
          for (let j = 0; j < teams[b].length; j++) {
            [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
            const v = imbalance(teams);
            [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
            if (v < best - 1e-9) {
              best = v;
              move = [a, i, b, j];
            }
          }
    if (!move) break;
    const [a, i, b, j] = move;
    [teams[a][i], teams[b][j]] = [teams[b][j], teams[a][i]];
  }
  return teams;
}

/** Friendly default names, paired with the team colours in order. */
export const BALANCED_TEAM_NAMES = ['Blue Owls', 'Red Foxes', 'Green Turtles', 'Gold Lions', 'Purple Dragons', 'Pink Flamingos', 'Teal Whales', 'Lime Geckos'];
