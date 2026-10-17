// Fair buzzer timing (R6-22/23): shared constants and the rule for when a timing gap between two
// presses is reliable enough to show as a number. See docs/BUZZER_FAIRNESS_RESEARCH.md §11–12.
import type { InputKind } from './game.js';

/** How much the server may move a press earlier than its arrival to undo network delay. */
export type BuzzFairness = 'off' | 'standard' | 'generous';
export const BUZZ_FAIRNESS_OPTIONS: Record<BuzzFairness, { label: string; description: string; phoneCapMs: number; bridgeCapMs: number }> = {
  standard: { label: 'Fair timing (recommended)', description: 'Corrects up to 50 ms of phone Wi-Fi delay, measured continuously. A short wait (at most 60 ms) lets a slower connection that pressed first still win.', phoneCapMs: 50, bridgeCapMs: 30 },
  generous: { label: 'Fair timing — slow Wi-Fi', description: 'Corrects up to 100 ms of phone delay for crowded or slow networks.', phoneCapMs: 100, bridgeCapMs: 30 },
  off: { label: 'First to arrive', description: 'No correction: the first press that reaches this computer wins.', phoneCapMs: 0, bridgeCapMs: 0 },
};

/** Longest the server ever waits for a competing press after the first one arrives. */
export const BUZZ_WINDOW_MAX_MS = 60;
/** Presses closer than this are shown as "Very close" whatever the measurements say. */
export const BUZZ_CLOSE_GAP_MS = 25;
/** Unknown difference between device kinds' input pipelines (touch screen vs Bluetooth button). */
export const BUZZ_CROSS_KIND_BIAS_MS = 10;
/** Timing noise of each input path that cannot be measured (touch sampling, Bluetooth reports). */
export const BUZZ_KIND_FLOOR_MS: Record<InputKind, number> = { phone: 4, joycon: 9, keyboard: 4, gamepad: 8, host: 0, bot: 0 };

/** True when `gapMs` between two presses is larger than both presses' uncertainty, so a number
 *  like "Alex buzzed 40 ms before you" is honest; otherwise show "Very close". */
export function gapIsConfident(gapMs: number, a: { uncertaintyMs?: number; sourceKind: InputKind }, b: { uncertaintyMs?: number; sourceKind: InputKind }): boolean {
  const bias = a.sourceKind === b.sourceKind ? 0 : BUZZ_CROSS_KIND_BIAS_MS;
  return gapMs >= BUZZ_CLOSE_GAP_MS && gapMs > (a.uncertaintyMs ?? 50) + (b.uncertaintyMs ?? 50) + bias;
}
