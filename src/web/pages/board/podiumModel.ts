// Results podium layout (R5-10). Pure, for tests. Places come from the server's GameResult
// (competition ranking: equal scores share a placement, e.g. 1, 1, 3).
import type { GameResult } from '../../../shared/game';

export interface PodiumColumn extends GameResult {
  /** Another contestant has the same placement. */
  tied: boolean;
  /** First column of its step (a gap separates steps; tied contestants stand side by side). */
  groupStart: boolean;
  /** Entrance order of the step: 0 rises first (3rd), the top step last. */
  riseOrder: number;
}

export interface PodiumLayout {
  /** Left → right: 2nd place, 1st place (centre), 3rd place. Missing places are left out. */
  columns: PodiumColumn[];
  /** Places 4 and below (and anyone placed lower than 3rd), best first. */
  rest: (GameResult & { tied: boolean })[];
  /** Distinct podium places shown (1–3). */
  steps: number;
}

const VISUAL_ORDER = [2, 1, 3];

export function podiumLayout(results: readonly GameResult[]): PodiumLayout {
  const sorted = [...results].sort((a, b) => a.placement - b.placement);
  const count = new Map<number, number>();
  for (const r of sorted) count.set(r.placement, (count.get(r.placement) ?? 0) + 1);
  const tied = (r: GameResult) => (count.get(r.placement) ?? 0) > 1;
  const places = VISUAL_ORDER.filter((p) => count.has(p));
  // Rise order: lowest place first → the top step last.
  const byRise = [...places].sort((a, b) => b - a);
  const columns: PodiumColumn[] = [];
  for (const p of places) {
    sorted
      .filter((r) => r.placement === p)
      .forEach((r, i) => columns.push({ ...r, tied: tied(r), groupStart: i === 0, riseOrder: byRise.indexOf(p) }));
  }
  const rest = sorted.filter((r) => r.placement > 3).map((r) => ({ ...r, tied: tied(r) }));
  return { columns, rest, steps: places.length };
}

/** "1st", "2nd", "3rd", "4th", "11th", "22nd" … */
export function ordinal(n: number) {
  const m = n % 100;
  const s = m >= 11 && m <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

/** "1st" or, for a shared placement, "T-1st". */
export function placeLabel(placement: number, tied: boolean) {
  return `${tied ? 'T-' : ''}${ordinal(placement)}`;
}
