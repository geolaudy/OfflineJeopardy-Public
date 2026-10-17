// Bounded press-time correction (R6-22, docs/BUZZER_FAIRNESS_RESEARCH.md §12.3). A device sends
// the time it saw the press on its own clock; with the clock offset from ClockSync the server
// turns that into server time and moves the press earlier than its arrival — but never by more
// than the device's measured network delay allows, and never by more than the cap. A client that
// lies about its timestamp, or delays its sync replies to look slow, can gain at most the cap.
import type { InputKind } from '../shared/game.js';
import { BUZZ_FAIRNESS_OPTIONS, BUZZ_KIND_FLOOR_MS, type BuzzFairness } from '../shared/buzzTiming.js';
import type { SyncEstimate } from './clockSync.js';

/** Uncertainty given to a press without a usable timestamp (arrival order only). */
export const UNSYNCED_UNCERTAINTY_MS = 60;

export interface PressTiming {
  /** Server monotonic time the message arrived. */
  arrival: number;
  /** The device's own time of the press (its performance.now() base), if it sent one. */
  clientAt?: number;
  /** The device's sync epoch the timestamp belongs to. */
  clientEpoch?: number;
}

export interface CorrectedPress {
  /** How much earlier than its arrival the press is placed (ms, 0…cap). */
  compMs: number;
  /** ± uncertainty of the corrected press time (ms). */
  uncertaintyMs: number;
  /** Most this device may be corrected right now (ms). */
  capMs: number;
  synced: boolean;
  /** The timestamp claimed a press after it arrived (beyond the sync uncertainty): ignored. */
  suspicious?: boolean;
}

/** The most a device's presses may be moved earlier: its measured delay (median round trip +
 *  2 × jitter + 25 ms), limited by the fairness setting; 0 when not synced. */
export function deviceCapMs(kind: InputKind, est: SyncEstimate | null | undefined, mode: BuzzFairness): number {
  if (!est?.synced || kind === 'host' || kind === 'bot') return 0;
  const opt = BUZZ_FAIRNESS_OPTIONS[mode] ?? BUZZ_FAIRNESS_OPTIONS.standard;
  const limit = kind === 'phone' ? opt.phoneCapMs : opt.bridgeCapMs;
  const measured = (est.rttMedian ?? 0) + 2 * est.jitter + 25;
  return Math.max(0, Math.min(limit, measured));
}

export function correctPress(kind: InputKind, t: PressTiming, est: SyncEstimate | null | undefined, mode: BuzzFairness): CorrectedPress {
  const floor = BUZZ_KIND_FLOOR_MS[kind] ?? 4;
  const capMs = deviceCapMs(kind, est, mode);
  if (!est || !est.synced || t.clientAt == null || !Number.isFinite(t.clientAt) || t.clientEpoch !== est.epoch) {
    return { compMs: 0, uncertaintyMs: kind === 'host' || kind === 'bot' ? 0 : UNSYNCED_UNCERTAINTY_MS + floor, capMs, synced: false };
  }
  const base = est.uSync + 1 + floor;
  const pressed = t.clientAt - est.offset; // server time of the press, as the device claims it
  if (pressed > t.arrival + est.uSync + 2) return { compMs: 0, uncertaintyMs: base, capMs, synced: true, suspicious: true };
  const raw = Math.max(0, t.arrival - pressed);
  const compMs = Math.min(raw, capMs);
  // Capped: the press may really have been earlier than we place it — say so in the uncertainty.
  return { compMs, uncertaintyMs: base + (raw - compMs), capMs, synced: true };
}
