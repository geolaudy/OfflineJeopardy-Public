import { describe, expect, it } from 'vitest';
import { balanceTeams, imbalance, ratingOf, type RatedPlayer } from '../../src/shared/teamBalance';

const players = (ratings: number[]): RatedPlayer[] => ratings.map((rating, i) => ({ id: `p${i}`, rating }));

describe('team balancing (T11)', () => {
  it('rates new players as average and rewards accuracy and wins without overreacting to one game', () => {
    expect(ratingOf({ games: 0, wins: 0, correct: 0, incorrect: 0 })).toBeCloseTo(45, 0);
    const strong = ratingOf({ games: 10, wins: 7, correct: 60, incorrect: 10 });
    const weak = ratingOf({ games: 10, wins: 0, correct: 10, incorrect: 30 });
    expect(strong).toBeGreaterThan(70);
    expect(weak).toBeLessThan(35);
    expect(ratingOf({ games: 1, wins: 1, correct: 3, incorrect: 0 })).toBeLessThan(strong); // one lucky game
  });

  it('keeps everyone, makes teams of equal size (±1) and evens out the strength', () => {
    const ps = players([95, 90, 85, 40, 35, 30, 20, 15]);
    const teams = balanceTeams(ps, 2, 7);
    expect(teams.flat().map((p) => p.id).sort()).toEqual(ps.map((p) => p.id).sort());
    expect(teams.map((t) => t.length)).toEqual([4, 4]);
    expect(imbalance(teams)).toBeLessThan(3);
    // A naive split (best four together) would be far worse.
    expect(imbalance([ps.slice(0, 4), ps.slice(4)])).toBeGreaterThan(50);
  });

  it('handles odd counts, more teams than players, and different seeds giving fair splits', () => {
    const ps = players([80, 70, 60, 50, 40, 30, 20]);
    const three = balanceTeams(ps, 3, 1);
    expect(three.map((t) => t.length).sort()).toEqual([2, 2, 3]);
    expect(balanceTeams(players([50, 60]), 5)).toHaveLength(2);
    const a = balanceTeams(players([50, 50, 50, 50, 50, 50]), 2, 1).map((t) => t.map((p) => p.id).sort().join());
    const b = balanceTeams(players([50, 50, 50, 50, 50, 50]), 2, 99).map((t) => t.map((p) => p.id).sort().join());
    expect(a.join('|') === b.join('|') && a.join('|') !== '').toBe(false); // shuffle changes equal-strength splits
  });
});
