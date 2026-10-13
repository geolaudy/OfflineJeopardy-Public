import { describe, expect, it } from 'vitest';
import { computeStandings, placementPoints, type TournamentResultRow } from '../../src/shared/tournament';

const row = (gameId: string, key: string, placement: number, finalScore: number, endedAt = 1, name = key): TournamentResultRow => ({
  gameId,
  key,
  name,
  color: '#000000',
  profileId: key,
  teamId: null,
  finalScore,
  placement,
  isWinner: placement === 1,
  endedAt,
});

describe('tournament standings (O8)', () => {
  it('awards placement points and adds them up across games', () => {
    expect([1, 2, 3, 4, null].map(placementPoints)).toEqual([5, 3, 2, 1, 1]);
    const rows = [row('g1', 'alex', 1, 2000), row('g1', 'sam', 2, 1500), row('g1', 'kim', 3, -200), row('g2', 'sam', 1, 3000), row('g2', 'alex', 2, 400), row('g2', 'kim', 3, 100)];
    const s = computeStandings(rows, 'placement');
    expect(s.map((r) => [r.rank, r.key, r.points, r.games, r.wins])).toEqual([
      [1, 'sam', 8, 2, 1],
      [2, 'alex', 8, 2, 1],
      [3, 'kim', 4, 2, 0],
    ]);
    // Tie on points and wins: total score decides (Sam 4500 vs Alex 2400).
    expect(s[0].totalScore).toBe(4500);
  });

  it('total-score tournaments rank by the sum of final scores, players may skip games, names follow the latest game', () => {
    const rows = [row('g1', 'alex', 1, 2000, 1, 'Alex'), row('g1', 'sam', 2, 1500, 1), row('g2', 'alex', 2, 400, 2, 'Alexandra'), row('g3', 'jo', 1, 5000, 3)];
    const s = computeStandings(rows, 'total');
    expect(s.map((r) => [r.rank, r.name, r.points, r.games])).toEqual([
      [1, 'jo', 5000, 1],
      [2, 'Alexandra', 2400, 2],
      [3, 'sam', 1500, 1],
    ]);
  });

  it('identical records share a rank', () => {
    const s = computeStandings([row('g1', 'a', 1, 100), row('g2', 'b', 1, 100)], 'placement');
    expect(s.map((r) => r.rank)).toEqual([1, 1]);
    expect(computeStandings([], 'placement')).toEqual([]);
  });
});
