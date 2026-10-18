// R7-4: phone delay on the TV lobby cards ("Phone • 25 ms"). Display only — buzzing never reads it.
// Input is the server-measured round trip the fair-timing clock sync already keeps per connection
// (median of the recent probes, docs/BUZZER_FAIRNESS_RESEARCH.md), so nothing extra is sent to the
// phones. The value is smoothed (exponential average), shown in honest steps (5 ms under 100 ms,
// 10 ms under 1 s, then 100 ms) and only changes when the difference is worth showing
// (hysteresis), so the TV does not flicker and the lobby is rebuilt rarely. Pure: no timers here.

const ALPHA = 0.35;

/** Shown step for a smoothed round trip (ms). Under 10 ms is shown as "< 10 ms" (value 5). */
export function latencyStep(ms: number): number {
  if (ms < 10) return 5;
  if (ms < 100) return Math.round(ms / 5) * 5;
  if (ms < 1000) return Math.round(ms / 10) * 10;
  return Math.round(ms / 100) * 100;
}

export class LatencyDisplay {
  private smooth = new Map<string, number>();
  private shown = new Map<string, number>();

  /** Feed the current round trip per key (null = connected, not measured yet); keys missing from
   *  `current` are gone. Returns true when any shown value appeared, changed or disappeared. */
  update(current: Map<string, number | null>): boolean {
    let changed = false;
    for (const key of [...this.smooth.keys()])
      if (current.get(key) == null) {
        this.smooth.delete(key);
        if (this.shown.delete(key)) changed = true;
      }
    for (const [key, rtt] of current) {
      if (rtt == null || !Number.isFinite(rtt)) continue;
      const prev = this.smooth.get(key);
      const s = prev === undefined ? rtt : prev + ALPHA * (rtt - prev);
      this.smooth.set(key, s);
      const was = this.shown.get(key);
      // Move only when the smoothed value left the shown one by a step and 20 %.
      if (was === undefined || Math.abs(s - was) >= Math.max(5, was * 0.2)) {
        const next = latencyStep(s);
        if (next !== was) {
          this.shown.set(key, next);
          changed = true;
        }
      }
    }
    return changed;
  }

  get(key: string): number | undefined {
    return this.shown.get(key);
  }
}
