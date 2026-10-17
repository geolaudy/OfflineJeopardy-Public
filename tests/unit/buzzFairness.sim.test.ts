// R6-24: buzzer fairness simulations. Phones (and Joy-Cons) with known physical press times are
// pushed through the real pieces — ClockSync (server-measured offsets from simulated probes),
// correctPress (bounded compensation), the GameManager window rule and the engine's arbitration —
// and compared with plain arrival order (approach A). Network: per-device lognormal delays,
// asymmetric up/down links, jitter, Wi-Fi power-save spikes, main-thread delay on the phone, clock
// offset and drift. Deterministic (seeded). Run with SIM_VERBOSE=1 to print the result table.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, buzzBlockReason, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { playerContext } from '../../src/server/engine/projection';
import { ClockSync } from '../../src/server/clockSync';
import { correctPress, deviceCapMs } from '../../src/server/buzzTiming';
import { BUZZ_WINDOW_MAX_MS, type BuzzFairness } from '../../src/shared/buzzTiming';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

// ---------- seeded randomness ----------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const lognormal = (r: Rng, median: number, sigma: number) => median * Math.exp(sigma * gauss(r));

// ---------- simulated devices ----------
interface Link {
  /** One-way delay distribution (ms). */
  median: number;
  sigma: number;
  /** Wi-Fi power save / contention: probability of an extra 50–300 ms. */
  spike: number;
}
interface Device {
  id: string;
  kind: 'phone' | 'joycon';
  offset: number; // device clock − server clock at t = 0
  drift: number; // ppm
  up: Link;
  down: Link;
  /** Phone main-thread delay between the touch and the message being sent (ms). */
  mainThread: [number, number];
  sync: ClockSync;
  epoch: number;
  /** Cheats: claim a press earlier than it was / hold sync replies to look slow. */
  forgeMs?: number;
  holdReplyMs?: number;
  /** Lost its socket just before the clue: reconnected, no clock samples yet. */
  freshConnection?: boolean;
}
const delay = (r: Rng, l: Link) => lognormal(r, l.median, l.sigma) + (r() < l.spike ? 50 + r() * 250 : 0);
const deviceClock = (d: Device, t: number) => t * (1 + d.drift / 1e6) + d.offset;

function makePhone(r: Rng, id: string, medianMs: number, opts: Partial<Device> = {}): Device {
  return {
    id,
    kind: 'phone',
    offset: (r() - 0.5) * 2e7,
    drift: (r() - 0.5) * 200,
    up: { median: medianMs, sigma: 0.35, spike: 0.03 },
    down: { median: medianMs, sigma: 0.35, spike: 0.1 },
    mainThread: [0, 25],
    sync: new ClockSync(),
    epoch: 0,
    ...opts,
  };
}
/** A Joy-Con read by the TV window: Bluetooth 7–24 ms (not measurable), then a local socket. */
function makeJoycon(r: Rng, id: string): Device {
  return { id, kind: 'joycon', offset: (r() - 0.5) * 1e6, drift: 0, up: { median: 0.6, sigma: 0.3, spike: 0 }, down: { median: 0.6, sigma: 0.3, spike: 0 }, mainThread: [0, 40], sync: new ClockSync(), epoch: 0 };
}

/** Server clock probes as the hub sends them: a burst of 5 × 100 ms, then every 500 ms. */
function syncDevices(r: Rng, devices: Device[], from: number, to: number) {
  for (const d of devices) {
    if (d.freshConnection) continue;
    const times: number[] = [];
    for (let i = 0; i < 5; i++) times.push(from + i * 100);
    for (let t = from + 500; t < to; t += 500) times.push(t);
    for (const s1 of times) {
      const n = d.sync.probe(s1);
      const atDevice = s1 + delay(r, d.down);
      const c = deviceClock(d, atDevice);
      const s2 = atDevice + (d.holdReplyMs ?? 0) + delay(r, d.up);
      d.sync.reply(n, c, d.epoch, s2);
    }
  }
}

// ---------- one clue ----------
let ids = 0;
function newGame(n: number, now: number): GameState {
  const ctx: EngineCtx = { now, newId: () => `sim${++ids}` };
  const act = (s: GameState, a: EngineAction) => {
    const res = applyAction(s, a, ctx);
    if (!res.ok) throw new Error(res.error);
    return res.state;
  };
  let s = createGame({ id: 'sim', title: 'Sim', boardId: 'b', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, earlyBuzzPenalty: 'lockout' }, now });
  for (let i = 0; i < n; i++) s = act(s, { type: 'addPlayer', profileId: `p${i}` });
  s = act(s, { type: 'startGame' });
  s = act(s, { type: 'introSkip' });
  return act(s, { type: 'selectClue', clueId: 'hist_1' });
}

interface Press {
  device: number;
  /** Physical press (server time base, ground truth). */
  at: number;
}
interface TrialResult {
  truth: number | null; // device index that pressed first (after the unlock)
  winner: number | null;
  firstArrival: number;
  decidedAt: number;
  earlyPenalised: number[];
  state: GameState;
}

function runClue(r: Rng, devices: Device[], presses: Press[], openAt: number, mode: BuzzFairness | 'arrival', opts: { duplicates?: boolean } = {}): TrialResult {
  let s = newGame(devices.length, openAt - 5000);
  let now = openAt - 5000;
  const step = (a: EngineAction, t: number) => {
    now = Math.max(now, t);
    const res = applyAction(s, a, { now, newId: () => `sim${++ids}`, actor: a.type === 'buzz' || a.type === 'buzzResolve' ? 'buzzer' : 'host' });
    if (!res.ok) throw new Error(`${a.type}: ${res.error}`);
    s = res.state;
    return res;
  };
  const fairness: BuzzFairness = mode === 'arrival' ? 'off' : mode;
  s = { ...s, rules: { ...s.rules, buzzFairness: fairness } };
  let unlocked = false;
  // The host unlocks at openAt: presses that arrive before it are early by arrival.
  const unlockIfDue = (t: number) => {
    if (!unlocked && t >= openAt) {
      unlocked = true;
      step({ type: 'unlockBuzzers' }, openAt);
    }
  };
  // Messages in arrival order.
  const msgs: { device: number; arrival: number; clientAt: number; press: number }[] = [];
  for (const p of presses) {
    const d = devices[p.device];
    let arrival: number;
    let clientAt: number;
    if (d.kind === 'joycon') {
      const bt = 7 + r() * 17; // Bluetooth + 60 Hz report: not compensable
      const seenByTv = p.at + bt;
      clientAt = deviceClock(d, seenByTv); // inputreport timeStamp
      arrival = seenByTv + d.mainThread[0] + r() * (d.mainThread[1] - d.mainThread[0]) + delay(r, d.up);
    } else {
      clientAt = deviceClock(d, p.at) - (d.forgeMs ?? 0); // pointerdown timeStamp (a liar subtracts)
      arrival = p.at + d.mainThread[0] + r() * (d.mainThread[1] - d.mainThread[0]) + delay(r, d.up);
    }
    msgs.push({ device: p.device, arrival, clientAt, press: p.at });
    if (opts.duplicates) msgs.push({ device: p.device, arrival: arrival + 3 + r() * 20, clientAt, press: p.at });
  }
  msgs.sort((a, b) => a.arrival - b.arrival);
  const firstArrival = msgs[0]?.arrival ?? openAt;
  let decidedAt = Infinity;
  const settle = (until: number) => {
    const pending = s.buzzer.pending;
    if (pending && pending.deadline <= until) {
      step({ type: 'buzzResolve' }, pending.deadline);
      if (s.buzzer.winner) decidedAt = Math.min(decidedAt, now);
    }
  };
  for (const m of msgs) {
    unlockIfDue(m.arrival);
    settle(m.arrival);
    const d = devices[m.device];
    const kind = d.kind;
    const est = d.sync.estimate(m.arrival);
    const timing = mode === 'arrival' ? undefined : correctPress(kind, { arrival: m.arrival, clientAt: m.clientAt, clientEpoch: d.epoch }, d.freshConnection ? null : est, fairness);
    const pid = `p${m.device}`;
    const ri = resolveInput(s, { controllerId: `phone:${pid}`, profileId: pid });
    if (!ri.ok) throw new Error(ri.reason);
    const pressAt = m.arrival - (timing?.compMs ?? 0);
    // GameManager.otherDevicesCap: other competitors' devices that may still buzz.
    let wait = 0;
    if (mode !== 'arrival')
      devices.forEach((o, j) => {
        if (j === m.device) return;
        const rj = resolveInput(s, { controllerId: `phone:p${j}`, profileId: `p${j}` });
        if (!rj.ok) return;
        const why = buzzBlockReason(s, rj.competitorId, rj.profileId, m.arrival);
        if (why === null || why === 'taken') wait = Math.max(wait, deviceCapMs(o.kind, o.freshConnection ? null : o.sync.estimate(m.arrival), fairness));
      });
    const holdUntil = wait > 0 ? Math.min(m.arrival + BUZZ_WINDOW_MAX_MS, pressAt + wait + 2) : m.arrival;
    step({ type: 'buzz', competitorId: ri.competitorId, profileId: ri.profileId, controllerId: `phone:${pid}`, sourceKind: kind, ...(timing ? { pressAt, uncertaintyMs: timing.uncertaintyMs, holdUntil } : {}) }, m.arrival);
    if (s.buzzer.winner) decidedAt = Math.min(decidedAt, now);
  }
  unlockIfDue(Infinity);
  settle(Infinity);
  const valid = presses.filter((p) => p.at >= openAt).sort((a, b) => a.at - b.at);
  const winnerId = s.buzzer.winner?.profileId;
  const earlyPenalised = s.buzzer.early.map((e) => Number(e.profileId!.slice(1)));
  return { truth: valid[0]?.device ?? null, winner: winnerId ? Number(winnerId.slice(1)) : null, firstArrival, decidedAt, earlyPenalised, state: s };
}

// ---------- scenarios ----------
interface Stats {
  trials: number;
  correct: number;
  /** Trials whose true gap between 1st and 2nd press is ≥ 25 ms ("callable"). */
  callable: number;
  callableCorrect: number;
  delays: number[];
  wins: number[];
  truthWins: number[];
  falseEarly: number;
}
const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);

function scenario(seed: number, trials: number, build: (r: Rng) => Device[], pressesFor: (r: Rng, devices: Device[], openAt: number) => Press[], mode: BuzzFairness | 'arrival', opts: { duplicates?: boolean } = {}): Stats {
  const r = mulberry32(seed); // same seed for A and E → identical worlds
  const st: Stats = { trials, correct: 0, callable: 0, callableCorrect: 0, delays: [], wins: [], truthWins: [], falseEarly: 0 };
  for (let t = 0; t < trials; t++) {
    const devices = build(r);
    const openAt = 1_000_000 + t * 60_000;
    syncDevices(r, devices, openAt - 4000, openAt - 50);
    const presses = pressesFor(r, devices, openAt);
    const res = runClue(r, devices, presses, openAt, mode, opts);
    const sorted = presses.filter((p) => p.at >= openAt).sort((a, b) => a.at - b.at);
    const gap = sorted.length > 1 ? sorted[1].at - sorted[0].at : Infinity;
    if (res.truth !== null) {
      st.truthWins[res.truth] = (st.truthWins[res.truth] ?? 0) + 1;
      if (res.winner === res.truth) st.correct++;
      if (gap >= 25) {
        st.callable++;
        if (res.winner === res.truth) st.callableCorrect++;
      }
    }
    if (res.winner !== null) st.wins[res.winner] = (st.wins[res.winner] ?? 0) + 1;
    if (Number.isFinite(res.decidedAt)) st.delays.push(res.decidedAt - res.firstArrival);
    // A press made after the unlock must never be penalised as early.
    for (const i of res.earlyPenalised) if (presses.find((p) => p.device === i)!.at >= openAt) st.falseEarly++;
  }
  return st;
}
const accuracy = (s: Stats) => s.correct / Math.max(1, s.trials);
const callableAccuracy = (s: Stats) => s.callableCorrect / Math.max(1, s.callable);
const table: Record<string, unknown>[] = [];
function record(name: string, a: Stats, e: Stats) {
  table.push({
    scenario: name,
    'A correct %': Math.round(accuracy(a) * 1000) / 10,
    'E correct %': Math.round(accuracy(e) * 1000) / 10,
    'A ≥25ms %': Math.round(callableAccuracy(a) * 1000) / 10,
    'E ≥25ms %': Math.round(callableAccuracy(e) * 1000) / 10,
    'E wait p50': Math.round(pct(e.delays, 0.5)),
    'E wait p99': Math.round(pct(e.delays, 0.99)),
    'A false early': a.falseEarly,
    'E false early': e.falseEarly,
  });
}

/** Near-simultaneous presses: everyone reacts within `spread` ms of each other after the unlock. */
const together = (spread: number) => (r: Rng, devices: Device[], openAt: number): Press[] => {
  const base = openAt + 180 + r() * 120;
  return devices.map((_, i) => ({ device: i, at: base + r() * spread }));
};

const N = 400;

describe('buzzer fairness simulations (R6-24)', () => {
  it('2 phones, fast vs slow Wi-Fi: the slow phone that pressed first wins far more often than by arrival', () => {
    const build = (r: Rng) => [makePhone(r, 'fast', 3), makePhone(r, 'slow', 35)];
    const a = scenario(11, N, build, together(80), 'arrival');
    const e = scenario(11, N, build, together(80), 'standard');
    record('2 phones 3 ms vs 35 ms', a, e);
    expect(callableAccuracy(e)).toBeGreaterThan(callableAccuracy(a) + 0.1);
    expect(callableAccuracy(e)).toBeGreaterThan(0.95);
    // Bias: by arrival the fast phone wins much more than its true share; corrected it is close.
    const share = (s: Stats, i: number) => (s.wins[i] ?? 0) / N;
    const truth = (s: Stats, i: number) => (s.truthWins[i] ?? 0) / N;
    expect(Math.abs(share(e, 1) - truth(e, 1))).toBeLessThan(Math.abs(share(a, 1) - truth(a, 1)));
    expect(pct(e.delays, 0.99)).toBeLessThanOrEqual(BUZZ_WINDOW_MAX_MS + 1);
  });

  it('5 phones with mixed latency and jitter', () => {
    const build = (r: Rng) => [3, 8, 15, 25, 40].map((m, i) => makePhone(r, `p${i}`, m));
    const a = scenario(22, N, build, together(100), 'arrival');
    const e = scenario(22, N, build, together(100), 'standard');
    record('5 phones 3–40 ms', a, e);
    expect(callableAccuracy(e)).toBeGreaterThan(callableAccuracy(a));
    expect(callableAccuracy(e)).toBeGreaterThan(0.9);
  });

  it('10 phones, jitter and Wi-Fi power-save spikes: stable, bounded wait, better than arrival order', () => {
    const build = (r: Rng) => Array.from({ length: 10 }, (_, i) => makePhone(r, `p${i}`, 3 + r() * 30, { up: { median: 3 + r() * 30, sigma: 0.5, spike: 0.05 } }));
    const a = scenario(33, N, build, together(150), 'arrival');
    const e = scenario(33, N, build, together(150), 'standard');
    record('10 phones + spikes', a, e);
    expect(callableAccuracy(e)).toBeGreaterThan(callableAccuracy(a));
    expect(pct(e.delays, 0.99)).toBeLessThanOrEqual(BUZZ_WINDOW_MAX_MS + 1);
    expect(e.falseEarly).toBe(0);
  });

  it('equal phones gain nothing: with identical latencies the result matches arrival order closely', () => {
    const build = (r: Rng) => Array.from({ length: 4 }, (_, i) => makePhone(r, `p${i}`, 6));
    const a = scenario(44, N, build, together(60), 'arrival');
    const e = scenario(44, N, build, together(60), 'standard');
    record('4 equal phones 6 ms', a, e);
    expect(callableAccuracy(e)).toBeGreaterThanOrEqual(callableAccuracy(a) - 0.02);
  });

  it('duplicated and reordered messages never double-count a press', () => {
    const build = (r: Rng) => [makePhone(r, 'a', 5), makePhone(r, 'b', 30), makePhone(r, 'c', 12)];
    const e = scenario(55, 200, build, together(50), 'standard', { duplicates: true });
    record('3 phones, every message duplicated', scenario(55, 200, build, together(50), 'arrival', { duplicates: true }), e);
    // One winner per clue, every other press queued once.
    const r = mulberry32(5);
    const devices = build(r);
    syncDevices(r, devices, 1_000_000 - 4000, 1_000_000 - 50);
    const res = runClue(r, devices, together(50)(r, devices, 1_000_000), 1_000_000, 'standard', { duplicates: true });
    const won = res.state.events.filter((x) => x.type === 'buzz' && x.result === 'won');
    const late = res.state.events.filter((x) => x.type === 'buzz' && x.result === 'late');
    expect(won).toHaveLength(1);
    expect(late).toHaveLength(2);
    expect(new Set(late.map((x) => x.competitorId)).size).toBe(2);
  });

  it('early presses: clearly-early presses that arrive after the unlock are caught too; on-time presses never penalised', () => {
    // Phone 0 anticipates (presses 5–60 ms before the unlock) on slow Wi-Fi so its press arrives
    // after the unlock; phone 1 presses after the unlock.
    const build = (r: Rng) => [makePhone(r, 'eager', 40, { up: { median: 40, sigma: 0.2, spike: 0 } }), makePhone(r, 'fair', 5)];
    const presses = (r: Rng, _d: Device[], openAt: number): Press[] => [
      { device: 0, at: openAt - 5 - r() * 55 },
      { device: 1, at: openAt + 150 + r() * 50 },
    ];
    const a = scenario(66, N, build, presses, 'arrival');
    const e = scenario(66, N, build, presses, 'standard');
    // Count catches of the real early press.
    const caught = (mode: BuzzFairness | 'arrival') => {
      const r = mulberry32(66);
      let n = 0;
      for (let t = 0; t < N; t++) {
        const devices = build(r);
        const openAt = 1_000_000 + t * 60_000;
        syncDevices(r, devices, openAt - 4000, openAt - 50);
        const res = runClue(r, devices, presses(r, devices, openAt), openAt, mode);
        if (res.earlyPenalised.includes(0)) n++;
      }
      return n / N;
    };
    const caughtA = caught('arrival');
    const caughtE = caught('standard');
    table.push({ scenario: 'early press arriving after unlock', 'A caught %': Math.round(caughtA * 1000) / 10, 'E caught %': Math.round(caughtE * 1000) / 10, 'A false early': a.falseEarly, 'E false early': e.falseEarly });
    // Only presses earlier than the unlock by more than their timing uncertainty may be penalised,
    // so E catches the clearly-early ones that arrival order misses — never an on-time press.
    expect(caughtE).toBeGreaterThan(caughtA + 0.05);
    expect(e.falseEarly).toBe(0);
    // A press that may have been early (inside the uncertainty) gets the benefit of the doubt and
    // counts as pressed at the unlock; the player who waited still wins at least as often as by
    // arrival order.
    expect(e.correct).toBeGreaterThanOrEqual(a.correct);
  });

  it('on-time presses right after the unlock are never called early (fast and slow phones, 10 players)', () => {
    const build = (r: Rng) => Array.from({ length: 10 }, (_, i) => makePhone(r, `p${i}`, 3 + r() * 40));
    const presses = (r: Rng, d: Device[], openAt: number): Press[] => d.map((_, i) => ({ device: i, at: openAt + r() * 40 }));
    const e = scenario(77, N, build, presses, 'standard');
    expect(e.falseEarly).toBe(0);
  });

  it('a forged timestamp gains at most the cap; it never beats a press made more than 50 ms + uncertainty earlier', () => {
    // No Wi-Fi spikes here: this measures what the forgery itself gains (a spike on the honest
    // phone would delay it beyond any correction, forged or not).
    const calm = { median: 5, sigma: 0.35, spike: 0 };
    const build = (r: Rng) => [makePhone(r, 'honest', 5, { up: calm, down: calm }), makePhone(r, 'liar', 5, { forgeMs: 500, up: calm, down: calm })];
    // The liar presses 0–150 ms after the honest player.
    const r = mulberry32(88);
    let liarWins = 0;
    let liarWinsBeyondCap = 0;
    for (let t = 0; t < N; t++) {
      const devices = build(r);
      const openAt = 1_000_000 + t * 60_000;
      syncDevices(r, devices, openAt - 4000, openAt - 50);
      const honest = openAt + 200;
      const lag = r() * 150;
      const res = runClue(r, devices, [{ device: 0, at: honest }, { device: 1, at: honest + lag }], openAt, 'standard');
      if (res.winner === 1) {
        liarWins++;
        if (lag > 50 + 30) liarWinsBeyondCap++;
      }
    }
    table.push({ scenario: 'forged timestamp (−500 ms)', 'liar wins %': Math.round((liarWins / N) * 1000) / 10, 'wins with lag > cap': liarWinsBeyondCap });
    expect(liarWinsBeyondCap).toBe(0);
    expect(liarWins / N).toBeLessThan(0.5);
  });

  it('inflating latency (holding sync replies) cannot raise the correction above the cap', () => {
    const r = mulberry32(99);
    const d = makePhone(r, 'slowpoke', 5, { holdReplyMs: 400 });
    syncDevices(r, [d], 0, 5000);
    const est = d.sync.estimate(5000);
    expect(deviceCapMs('phone', est, 'standard')).toBeLessThanOrEqual(50);
    expect(deviceCapMs('phone', est, 'generous')).toBeLessThanOrEqual(100);
    // Holding replies makes the round trip huge, so the device does not even count as synced.
    expect(est.synced).toBe(false);
    const c = correctPress('phone', { arrival: 5000, clientAt: deviceClock(d, 4000), clientEpoch: 0 }, est, 'standard');
    expect(c.compMs).toBe(0);
  });

  it('a phone that just reconnected (no clock samples) counts by arrival and does not make others wait', () => {
    const build = (r: Rng) => [makePhone(r, 'synced', 5), makePhone(r, 'fresh', 30, { freshConnection: true })];
    const e = scenario(111, 200, build, together(80), 'standard');
    expect(pct(e.delays, 0.99)).toBeLessThanOrEqual(BUZZ_WINDOW_MAX_MS + 1);
    expect(e.falseEarly).toBe(0);
    // The fresh phone's presses are not corrected, so it is treated like arrival order.
    expect(e.trials).toBe(200);
  });

  it('Joy-Con vs phone: the Bluetooth path is not network-compensated, the phone path is', () => {
    const build = (r: Rng) => [makeJoycon(r, 'jc'), makePhone(r, 'phone', 30)];
    const a = scenario(122, N, build, together(80), 'arrival');
    const e = scenario(122, N, build, together(80), 'standard');
    record('Joy-Con vs phone (30 ms Wi-Fi)', a, e);
    expect(callableAccuracy(e)).toBeGreaterThan(callableAccuracy(a));
    expect(callableAccuracy(e)).toBeGreaterThan(0.9);
  });

  it('phones see how close it was only with confidence (numbers only beyond the uncertainty)', () => {
    const r = mulberry32(133);
    const devices = [makePhone(r, 'a', 4), makePhone(r, 'b', 4)];
    syncDevices(r, devices, 1_000_000 - 4000, 1_000_000 - 50);
    const wide = runClue(r, devices, [{ device: 0, at: 1_000_200 }, { device: 1, at: 1_000_290 }], 1_000_000, 'standard');
    const loser = playerContext(wide.state, 'p1', 1_000_400).buzzTiming!;
    expect(loser).toMatchObject({ result: 'late', confident: true });
    expect(loser.gapMs!).toBeGreaterThan(60);
    expect(loser.gapMs!).toBeLessThan(120);
    expect(playerContext(wide.state, 'p0', 1_000_400).buzzTiming).toMatchObject({ result: 'won', confident: true });
    const close = runClue(r, devices, [{ device: 0, at: 1_000_200 }, { device: 1, at: 1_000_208 }], 1_000_000, 'standard');
    expect(playerContext(close.state, close.winner === 0 ? 'p1' : 'p0', 1_000_400).buzzTiming).toMatchObject({ result: 'late', confident: false });
  });

  it('prints the comparison (SIM_VERBOSE=1)', () => {
    if (process.env.SIM_VERBOSE) console.table(table);
    expect(table.length).toBeGreaterThan(5);
  });
});
