// Buzzer fairness simulation (R6-24), shared by tests/unit/buzzFairness.sim.test.ts and the
// developer tools' fairness test (R7-31). Phones (and Joy-Cons) with known physical press times are
// pushed through the real pieces — ClockSync (server-measured offsets from simulated probes),
// correctPress (bounded compensation), the GameManager window rule and the engine's arbitration —
// and compared with plain arrival order. Network: per-device lognormal delays, asymmetric up/down
// links, jitter, Wi-Fi power-save spikes, main-thread delay on the phone, clock offset and drift.
// Deterministic (seeded). Pure: nothing here touches the live game.
import { applyAction, createGame, buzzBlockReason, type EngineCtx } from './engine/engine.js';
import { resolveInput } from './engine/buzzer.js';
import { ClockSync } from './clockSync.js';
import { correctPress, deviceCapMs } from './buzzTiming.js';
import { BUZZ_WINDOW_MAX_MS, type BuzzFairness } from '../shared/buzzTiming.js';
import { DEFAULT_RULES, type GameState } from '../shared/game.js';
import type { EngineAction } from '../shared/actions.js';
import { SAMPLE_BOARD } from '../shared/sampleBoards.js';

// ---------- seeded randomness ----------
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = () => number;
const gauss = (r: Rng) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const lognormal = (r: Rng, median: number, sigma: number) => median * Math.exp(sigma * gauss(r));

// ---------- simulated devices ----------
export interface Link {
  /** One-way delay distribution (ms). */
  median: number;
  sigma: number;
  /** Wi-Fi power save / contention: probability of an extra 50–300 ms. */
  spike: number;
}
export interface Device {
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
export const delay = (r: Rng, l: Link) => lognormal(r, l.median, l.sigma) + (r() < l.spike ? 50 + r() * 250 : 0);
export const deviceClock = (d: Device, t: number) => t * (1 + d.drift / 1e6) + d.offset;

export function makePhone(r: Rng, id: string, medianMs: number, opts: Partial<Device> = {}): Device {
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
export function makeJoycon(r: Rng, id: string): Device {
  return { id, kind: 'joycon', offset: (r() - 0.5) * 1e6, drift: 0, up: { median: 0.6, sigma: 0.3, spike: 0 }, down: { median: 0.6, sigma: 0.3, spike: 0 }, mainThread: [0, 40], sync: new ClockSync(), epoch: 0 };
}

/** Server clock probes as the hub sends them: a burst of 5 × 100 ms, then every 500 ms. */
export function syncDevices(r: Rng, devices: Device[], from: number, to: number) {
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

export interface Press {
  device: number;
  /** Physical press (server time base, ground truth). */
  at: number;
}
export interface TrialResult {
  truth: number | null; // device index that pressed first (after the unlock)
  winner: number | null;
  firstArrival: number;
  decidedAt: number;
  earlyPenalised: number[];
  state: GameState;
}

export function runClue(r: Rng, devices: Device[], presses: Press[], openAt: number, mode: BuzzFairness | 'arrival', opts: { duplicates?: boolean } = {}): TrialResult {
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
export interface Stats {
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
export const pct = (xs: number[], p: number) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] : 0);

export function scenario(seed: number, trials: number, build: (r: Rng) => Device[], pressesFor: (r: Rng, devices: Device[], openAt: number) => Press[], mode: BuzzFairness | 'arrival', opts: { duplicates?: boolean } = {}): Stats {
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
export const accuracy = (s: Stats) => s.correct / Math.max(1, s.trials);
export const callableAccuracy = (s: Stats) => s.callableCorrect / Math.max(1, s.callable);
/** Near-simultaneous presses: everyone reacts within `spread` ms of each other after the unlock. */
export const together = (spread: number) => (r: Rng, devices: Device[], openAt: number): Press[] => {
  const base = openAt + 180 + r() * 120;
  return devices.map((_, i) => ({ device: i, at: base + r() * spread }));
};

// ---------- developer tools: fairness test with known simulated offsets (R7-31) ----------

export interface FairnessTestConfig {
  /** Simulated phones: typical one-way Wi-Fi delay, how much it varies, and power-save spikes. */
  phones: { delayMs: number; jitter: 'low' | 'normal' | 'high'; spikes: boolean }[];
  /** Simulated Joy-Cons (Bluetooth to the game PC). */
  joycons: number;
  /** Everyone presses within this many milliseconds of each other, after the unlock. */
  spreadMs: number;
  trials: number;
  seed: number;
  /** The fair-timing mode compared with plain arrival order. */
  mode: Exclude<BuzzFairness, 'off'>;
}

export interface FairnessSummary {
  /** Clues won by whoever really pressed first (%). */
  correctPct: number;
  /** The same, counting only clues where the first two presses were ≥ 25 ms apart (%). */
  callablePct: number;
  callable: number;
  /** Extra wait before the winner is known, from the first arrival (ms). */
  waitP50: number;
  waitP99: number;
  /** Presses made after the unlock but penalised as early (must be 0). */
  falseEarly: number;
  /** Clues won per device, and clues each device really pressed first. */
  wins: number[];
  truthWins: number[];
}

export interface FairnessTestResult {
  devices: string[];
  trials: number;
  arrival: FairnessSummary;
  fair: FairnessSummary;
}

const JITTER: Record<FairnessTestConfig['phones'][number]['jitter'], number> = { low: 0.15, normal: 0.35, high: 0.6 };

function summarize(st: Stats, n: number): FairnessSummary {
  const per = (xs: number[]) => Array.from({ length: n }, (_, i) => xs[i] ?? 0);
  return {
    correctPct: Math.round(accuracy(st) * 1000) / 10,
    callablePct: Math.round(callableAccuracy(st) * 1000) / 10,
    callable: st.callable,
    waitP50: Math.round(pct(st.delays, 0.5)),
    waitP99: Math.round(pct(st.delays, 0.99)),
    falseEarly: st.falseEarly,
    wins: per(st.wins),
    truthWins: per(st.truthWins),
  };
}

/** Runs the same simulated clues (same seed) by arrival order and with fair timing. */
export function runFairnessTest(cfg: FairnessTestConfig): FairnessTestResult {
  const build = (r: Rng) => [
    ...cfg.phones.map((p, i) => {
      const link = { median: Math.max(0.5, p.delayMs), sigma: JITTER[p.jitter], spike: p.spikes ? 0.05 : 0 };
      return makePhone(r, `phone${i + 1}`, link.median, { up: link, down: { ...link, spike: p.spikes ? 0.1 : 0 } });
    }),
    ...Array.from({ length: cfg.joycons }, (_, i) => makeJoycon(r, `joycon${i + 1}`)),
  ];
  const n = cfg.phones.length + cfg.joycons;
  const devices = [...cfg.phones.map((p, i) => `Phone ${i + 1} (${p.delayMs} ms, ${p.jitter} jitter${p.spikes ? ', spikes' : ''})`), ...Array.from({ length: cfg.joycons }, (_, i) => `Joy-Con ${i + 1}`)];
  const arrival = scenario(cfg.seed, cfg.trials, build, together(cfg.spreadMs), 'arrival');
  const fair = scenario(cfg.seed, cfg.trials, build, together(cfg.spreadMs), cfg.mode);
  return { devices, trials: cfg.trials, arrival: summarize(arrival, n), fair: summarize(fair, n) };
}
