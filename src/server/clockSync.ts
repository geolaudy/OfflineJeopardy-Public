// Per-connection clock synchronisation for fair buzzing (R6-22, docs/BUZZER_FAIRNESS_RESEARCH.md
// §12.1). The server sends small probes and measures the round trip itself (a client-reported
// ping is never trusted). Each reply carries the client's monotonic clock (performance.now()) at
// the moment it handled the probe, which gives one offset sample:
//
//   rtt = s2 − s1,  θ = c − (s1 + s2) / 2,  half-width h = rtt / 2 + 1 ms
//
// By causality the true offset lies inside [c − s2, c − s1] whatever the path asymmetry, so the
// sample with the tightest round trip is the most accurate one (Cristian / NTP min-RTT filtering).
// Samples age (100 ppm clock drift allowance) so an old tight sample does not win forever.
// Pure: every time is passed in (server monotonic milliseconds).

export interface SyncSample {
  rtt: number;
  theta: number;
  at: number; // server time of the reply
}

export interface SyncEstimate {
  /** Enough tight samples to compare this device's clock with the server's. */
  synced: boolean;
  /** client time − server time (ms): a client timestamp t is server time t − offset. */
  offset: number;
  /** ± uncertainty of `offset` (ms), aged. */
  uSync: number;
  /** Median of the last 8 round trips (ms), null before any. */
  rttMedian: number | null;
  /** RFC 3550 jitter estimate of the round trip (ms). */
  jitter: number;
  samples: number;
  epoch: number;
}

const MAX_SAMPLES = 32;
const MAX_AGE_MS = 60_000;
const MAX_OUTSTANDING = 8;
const PROBE_TIMEOUT_MS = 2_000;
const DRIFT_PER_MS = 0.0001; // 100 ppm
// The bound is a worst case (half the best round trip); 60 ms lets ordinary and busy home Wi-Fi
// phones be corrected (a 20 ms limit left exactly the slow phones uncorrected — more bias, R6-24).
export const SYNC_MAX_UNCERTAINTY_MS = 60;
export const SYNC_MIN_SAMPLES = 3;

export class ClockSync {
  private samples: SyncSample[] = [];
  private rtts: number[] = [];
  private outstanding = new Map<number, number>();
  private next = 1;
  private jitter = 0;
  private lastRtt: number | null = null;
  epoch = -1;

  /** Start a probe at server time `now`; returns its number (send `{t:'sync', n}`). */
  probe(now: number): number {
    for (const [n, s1] of this.outstanding) if (now - s1 > PROBE_TIMEOUT_MS) this.outstanding.delete(n);
    if (this.outstanding.size >= MAX_OUTSTANDING) this.outstanding.delete(this.outstanding.keys().next().value!);
    const n = this.next++;
    this.outstanding.set(n, now);
    return n;
  }

  /** A reply `{n, c, e}` arrived at server time `now`. Unknown / late probes are ignored. */
  reply(n: number, c: number, e: number, now: number): boolean {
    const s1 = this.outstanding.get(n);
    if (s1 === undefined || !Number.isFinite(c)) return false;
    this.outstanding.delete(n);
    // A new epoch (the page slept, came back from the background, reloaded) starts over.
    if (e !== this.epoch) this.reset(e);
    const rtt = Math.max(0, now - s1);
    const theta = c - (s1 + now) / 2;
    if (this.lastRtt !== null) this.jitter += (Math.abs(rtt - this.lastRtt) - this.jitter) / 16;
    this.lastRtt = rtt;
    this.rtts.push(rtt);
    if (this.rtts.length > 8) this.rtts.shift();
    // A tight sample that disagrees with the current estimate: the device clock jumped. Start over
    // from this sample rather than mixing two clocks.
    const est = this.best(now);
    if (est && Math.abs(theta - est.theta) > est.h + rtt / 2 + 1 + 5) {
      this.samples = [];
    }
    this.samples.push({ rtt, theta, at: now });
    while (this.samples.length > MAX_SAMPLES || (this.samples.length && now - this.samples[0].at > MAX_AGE_MS)) this.samples.shift();
    return true;
  }

  private reset(epoch: number) {
    this.epoch = epoch;
    this.samples = [];
    this.rtts = [];
    this.jitter = 0;
    this.lastRtt = null;
  }

  private best(now: number): { theta: number; h: number } | null {
    let b: { theta: number; h: number } | null = null;
    for (const s of this.samples) {
      const h = s.rtt / 2 + 1 + DRIFT_PER_MS * Math.max(0, now - s.at);
      if (!b || h < b.h) b = { theta: s.theta, h };
    }
    return b;
  }

  estimate(now: number): SyncEstimate {
    const b = this.best(now);
    const sorted = [...this.rtts].sort((x, y) => x - y);
    const rttMedian = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
    const samples = this.samples.length;
    return {
      synced: !!b && samples >= SYNC_MIN_SAMPLES && b.h <= SYNC_MAX_UNCERTAINTY_MS,
      offset: b?.theta ?? 0,
      uSync: b?.h ?? Infinity,
      rttMedian,
      jitter: this.jitter,
      samples,
      epoch: this.epoch,
    };
  }

  /** Server-measured round trip for diagnostics (median of the recent ones). */
  get rtt(): number | null {
    const sorted = [...this.rtts].sort((x, y) => x - y);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;
  }
}
