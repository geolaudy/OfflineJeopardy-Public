// R6-22/23: clock sync estimator, bounded press correction, the engine's arbitration window, the
// corrected early-buzz rule and the timing results shown to phones and the host.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { playerContext, projectState } from '../../src/server/engine/projection';
import { ClockSync } from '../../src/server/clockSync';
import { correctPress, deviceCapMs } from '../../src/server/buzzTiming';
import { gapIsConfident } from '../../src/shared/buzzTiming';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

describe('ClockSync (server-measured clock offset)', () => {
  const OFFSET = 7_654_321;
  const exchange = (s: ClockSync, at: number, down: number, up: number, e = 0) => {
    const n = s.probe(at);
    s.reply(n, at + down + OFFSET, e, at + down + up);
  };
  it('finds the offset from the tightest round trip, within its bound, and reports synced', () => {
    const s = new ClockSync();
    exchange(s, 0, 40, 10); // asymmetric and slow
    exchange(s, 100, 3, 4); // tight
    expect(s.estimate(200).synced).toBe(false); // fewer than 3 samples
    exchange(s, 200, 30, 30);
    const est = s.estimate(300);
    expect(est.synced).toBe(true);
    expect(Math.abs(est.offset - OFFSET)).toBeLessThanOrEqual(est.uSync);
    expect(est.uSync).toBeLessThan(6);
    expect(est.rttMedian).toBe(50);
  });
  it('ignores unknown or timed-out probes and starts over on a new epoch', () => {
    const s = new ClockSync();
    expect(s.reply(99, 1, 0, 10)).toBe(false);
    const n = s.probe(0);
    s.probe(3000); // the first one times out
    expect(s.reply(n, 5 + OFFSET, 0, 10)).toBe(false);
    for (let i = 0; i < 4; i++) exchange(s, 4000 + i * 100, 3, 3);
    expect(s.estimate(5000).synced).toBe(true);
    exchange(s, 5000, 3, 3, 1); // the page slept: new epoch
    expect(s.estimate(5100)).toMatchObject({ synced: false, samples: 1, epoch: 1 });
  });
  it('very slow links never count as synced', () => {
    const s = new ClockSync();
    for (let i = 0; i < 6; i++) exchange(s, i * 100, 70, 70);
    expect(s.estimate(700).synced).toBe(false);
  });
});

describe('bounded press correction', () => {
  const est = { synced: true, offset: 1000, uSync: 3, rttMedian: 10, jitter: 1, samples: 5, epoch: 2 };
  it('moves a press back by its measured delay, never beyond the cap', () => {
    expect(deviceCapMs('phone', est, 'standard')).toBe(37); // 10 + 2·1 + 25
    expect(correctPress('phone', { arrival: 500, clientAt: 1000 + 480, clientEpoch: 2 }, est, 'standard')).toMatchObject({ compMs: 20, synced: true });
    const forged = correctPress('phone', { arrival: 500, clientAt: 1000 + 100, clientEpoch: 2 }, est, 'standard');
    expect(forged.compMs).toBe(37);
    expect(forged.uncertaintyMs).toBeGreaterThan(300); // the claim is not believed beyond the cap
    expect(deviceCapMs('phone', { ...est, rttMedian: 400 }, 'standard')).toBe(50);
    expect(deviceCapMs('phone', { ...est, rttMedian: 400 }, 'generous')).toBe(100);
    expect(deviceCapMs('phone', est, 'off')).toBe(0);
  });
  it('Joy-Cons/keyboards on the TV window are capped at 30 ms; host and bots never corrected', () => {
    expect(deviceCapMs('joycon', { ...est, rttMedian: 400 }, 'standard')).toBe(30);
    expect(deviceCapMs('host', est, 'standard')).toBe(0);
  });
  it('no correction without a timestamp, for a stale epoch, unsynced, or a press "after" its arrival', () => {
    expect(correctPress('phone', { arrival: 500 }, est, 'standard').compMs).toBe(0);
    expect(correctPress('phone', { arrival: 500, clientAt: 1400, clientEpoch: 1 }, est, 'standard')).toMatchObject({ compMs: 0, synced: false });
    expect(correctPress('phone', { arrival: 500, clientAt: 1400, clientEpoch: 2 }, { ...est, synced: false }, 'standard').compMs).toBe(0);
    expect(correctPress('phone', { arrival: 500, clientAt: 1000 + 600, clientEpoch: 2 }, est, 'standard')).toMatchObject({ compMs: 0, suspicious: true });
  });
  it('a gap is shown as a number only beyond both uncertainties (and 25 ms)', () => {
    const a = { uncertaintyMs: 8, sourceKind: 'phone' as const };
    expect(gapIsConfident(42, a, a)).toBe(true);
    expect(gapIsConfident(20, a, a)).toBe(false);
    expect(gapIsConfident(30, a, { uncertaintyMs: 30, sourceKind: 'phone' })).toBe(false);
    expect(gapIsConfident(26, a, { uncertaintyMs: 8, sourceKind: 'joycon' })).toBe(false); // 8 + 8 + 10 ms across kinds
    expect(gapIsConfident(26, a, a)).toBe(true);
  });
});

describe('engine arbitration window', () => {
  let clock = 9_000_000;
  let ids = 0;
  const ctx = (): EngineCtx => ({ now: clock, newId: () => `bt${++ids}` });
  const act = (s: GameState, a: EngineAction) => {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
  const press = (s: GameState, p: string, pressAgo: number, holdMs: number, u = 5) =>
    act(s, { type: 'buzz', competitorId: cid(s, p), profileId: p, controllerId: `phone:${p}`, sourceKind: 'phone', pressAt: clock - pressAgo, uncertaintyMs: u, holdUntil: clock + holdMs });
  function open(players = ['ann', 'bob', 'cat']) {
    let s = createGame({ id: 'g', title: 'T', boardId: 'b', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, earlyBuzzPenalty: 'lockout' }, now: clock });
    for (const p of players) s = act(s, { type: 'addPlayer', profileId: p }).state;
    for (const a of [{ type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' }] as EngineAction[]) s = act(s, a).state;
    return s;
  }

  it('waits for the window; a later-arriving earlier press wins; the others queue in press order', () => {
    let s = open();
    clock += 300;
    let r = press(s, 'ann', 2, 40); // arrives first, pressed 2 ms ago
    expect(r.info).toBe('pending');
    s = r.state;
    expect(s.buzzer.winner).toBeNull();
    expect(projectState(s, 'public', {}).buzzer).not.toHaveProperty('pending');
    clock += 10;
    s = press(s, 'bob', 30, 40).state; // arrives 10 ms later but pressed 18 ms before Ann
    expect(act(s, { type: 'buzzResolve' })).toMatchObject({ ignored: true }); // window still open
    clock += 40;
    r = act(s, { type: 'buzzResolve' });
    s = r.state;
    expect(s.buzzer.winner?.profileId).toBe('bob');
    expect(s.buzzer.winner?.reactionMs).toBe(300 + 10 - 30);
    expect(s.buzzer.queue.map((q) => q.profileId)).toEqual(['ann']);
    expect(s.events.filter((e) => e.type === 'buzz').map((e) => `${e.profileId}:${e.result}`)).toEqual(['bob:won', 'ann:late']);
    // Timing results: Ann lost by 18 ms — too close to call; Bob sees he was first.
    expect(playerContext(s, 'ann', clock).buzzTiming).toMatchObject({ result: 'late', gapMs: 18, confident: false, otherProfileId: 'bob' });
    expect(playerContext(s, 'bob', clock).buzzTiming).toMatchObject({ result: 'won', otherProfileId: 'ann', gapMs: 18 });
    expect(playerContext(s, 'cat', clock).buzzTiming).toBeNull(); // never pressed: nothing to show
    expect(projectState(s, 'host', {}).buzzer.timing?.map((t) => [t.profileId, t.gapMs])).toEqual([['bob', 0], ['ann', 18]]);
    expect(projectState(s, 'public', {}).buzzer).not.toHaveProperty('timing');
  });

  it('resolves at once when every competitor who may buzz has pressed', () => {
    let s = open(['ann', 'bob']);
    clock += 200;
    s = press(s, 'ann', 1, 50).state;
    clock += 5;
    const r = press(s, 'bob', 1, 50);
    expect(r.state.buzzer.winner?.profileId).toBe('ann');
    expect(r.state.buzzer.pending).toBeNull();
  });

  it('any other action settles the window first (the presses came before it)', () => {
    let s = open();
    clock += 200;
    s = press(s, 'cat', 1, 50).state;
    s = act(s, { type: 'judge', result: 'correct' }).state; // the host's tap lands inside the window
    expect(s.events.filter((e) => e.type === 'answer').map((e) => e.profileId)).toEqual(['cat']);
  });

  it('a duplicate press in the window is ignored; a reopen clears the previous timing', () => {
    let s = open(['ann', 'bob', 'cat']);
    clock += 200;
    s = press(s, 'ann', 1, 50).state;
    const dup = press(s, 'ann', 1, 50);
    expect(dup.ignored).toBe(true);
    clock += 60;
    s = act(dup.state, { type: 'buzzResolve' }).state;
    s = act(s, { type: 'judge', result: 'incorrect' }).state; // auto re-open
    expect(s.buzzer.status).toBe('open');
    expect(playerContext(s, 'ann', clock).buzzTiming).toBeNull();
  });

  it('early: penalised only when the corrected press is before the unlock by more than its uncertainty', () => {
    let s = open(['ann', 'bob']);
    const opened = s.buzzer.openedAt!;
    clock += 20;
    // Pressed 50 ms before the unlock, ±5 ms → certainly early (arrived 20 ms after it).
    let r = press(s, 'ann', 70, 0);
    expect(r.info).toBe('early');
    expect(r.state.buzzer.early.map((e) => e.profileId)).toEqual(['ann']);
    expect(r.state.events.at(-1)?.note).toContain('before the unlock');
    // Pressed 10 ms before the unlock but ±15 ms → benefit of the doubt: counts at the unlock.
    s = r.state;
    r = press(s, 'bob', 30, 0, 15);
    expect(r.info).toBe('won');
    expect(r.state.buzzer.winner?.reactionMs).toBe(0);
    expect(r.state.buzzer.winner?.pressAt).toBe(opened);
  });

  it('without timing fields the engine is plain arrival order (host buzz, bots, older callers)', () => {
    const s = open();
    clock += 100;
    const r = act(s, { type: 'buzz', competitorId: cid(s, 'bob'), profileId: 'bob', controllerId: 'phone:bob', sourceKind: 'phone' });
    expect(r.info).toBe('won');
    expect(r.state.buzzer.winner?.reactionMs).toBe(100);
  });
});
