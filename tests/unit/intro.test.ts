// R5-12: category introduction controls — Previous, direct jump, Stop Auto — and the GameManager's
// automatic pacing never firing a stale step after the host took over.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { hostActionSchema } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';

let clock = 2_000_000;
let ids = 0;
const ctx = (): EngineCtx => ({ now: clock, newId: () => `id${++ids}` });

function run(s: GameState, ...actions: EngineAction[]): GameState {
  for (const a of actions) {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const tryRun = (s: GameState, a: EngineAction) => applyAction(s, a, ctx());

function started() {
  let s = createGame({ id: 'g1', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  s = run(s, { type: 'addPlayer', profileId: 'alex' }, { type: 'startGame' });
  return s;
}
const cats = (s: GameState) => s.board.rounds[s.roundIndex].categories.length;

describe('category introduction controls (R5-12)', () => {
  it('validates the new actions in the host schema', () => {
    expect(hostActionSchema.safeParse({ type: 'introPrev' }).success).toBe(true);
    expect(hostActionSchema.safeParse({ type: 'introStopAuto' }).success).toBe(true);
    expect(hostActionSchema.safeParse({ type: 'introGoto', step: 3 }).success).toBe(true);
    expect(hostActionSchema.safeParse({ type: 'introGoto', step: -2 }).success).toBe(false);
    expect(hostActionSchema.safeParse({ type: 'introGoto', step: 1.5 }).success).toBe(false);
  });

  it('Previous goes back one step, down to the round title card, and stamps the step time', () => {
    let s = run(started(), { type: 'introNext' }, { type: 'introNext' });
    expect(s.intro?.step).toBe(1);
    clock += 1000;
    s = run(s, { type: 'introPrev' });
    expect(s.intro).toMatchObject({ step: 0, at: clock, auto: false });
    s = run(s, { type: 'introPrev' });
    expect(s.intro?.step).toBe(-1);
    // Already at the title card: nothing to go back to.
    const r = tryRun(s, { type: 'introPrev' });
    expect(r).toMatchObject({ ok: true, ignored: true });
    if (r.ok) expect(r.state.intro?.step).toBe(-1);
  });

  it('jumps straight to any category (forward or back) and rejects steps outside the round', () => {
    let s = started();
    const n = cats(s);
    s = run(s, { type: 'introGoto', step: 4 });
    expect(s.intro?.step).toBe(4);
    s = run(s, { type: 'introGoto', step: 1 });
    expect(s.intro?.step).toBe(1);
    s = run(s, { type: 'introGoto', step: -1 });
    expect(s.intro?.step).toBe(-1);
    expect(tryRun(s, { type: 'introGoto', step: n })).toMatchObject({ ok: false });
    // The last category stays on screen until Next / Skip ends the introduction.
    s = run(s, { type: 'introGoto', step: n - 1 });
    expect(s.intro?.step).toBe(n - 1);
    expect(s.phase).toBe('board');
    s = run(s, { type: 'introNext' });
    expect(s.intro).toBeNull();
    // Without an introduction the controls are ignored, not errors.
    expect(tryRun(s, { type: 'introGoto', step: 0 })).toMatchObject({ ok: true, ignored: true });
    expect(tryRun(s, { type: 'introPrev' })).toMatchObject({ ok: true, ignored: true });
    expect(tryRun(s, { type: 'introStopAuto' })).toMatchObject({ ok: true, ignored: true });
  });

  it('a jump or Previous takes over from auto mode; Stop Auto keeps the current category', () => {
    let s = run(started(), { type: 'startIntro', auto: true });
    expect(s.intro).toMatchObject({ step: -1, auto: true });
    s = run(s, { type: 'introNext' }, { type: 'introNext' });
    expect(s.intro).toMatchObject({ step: 1, auto: true });
    const before = s.intro!.at;
    clock += 500;
    s = run(s, { type: 'introStopAuto' });
    expect(s.intro).toMatchObject({ step: 1, auto: false, at: before }); // same category, same start
    s = run(s, { type: 'startIntro', auto: true }); // "Auto" again continues from here
    expect(s.intro).toMatchObject({ step: 1, auto: true });
    s = run(s, { type: 'introGoto', step: 3 });
    expect(s.intro).toMatchObject({ step: 3, auto: false });
    s = run(s, { type: 'startIntro', auto: true }, { type: 'introPrev' });
    expect(s.intro).toMatchObject({ step: 2, auto: false });
  });

  it('keeps Skip semantics, still blocks clue selection, and is visible to every projection', () => {
    let s = run(started(), { type: 'introGoto', step: 2 });
    expect(tryRun(s, { type: 'selectClue', clueId: s.board.rounds[s.roundIndex].categories[0].clues[0].id })).toMatchObject({ ok: false });
    expect(projectState(s, 'public', {}).intro?.step).toBe(2);
    s = run(s, { type: 'introSkip' });
    expect(s.intro).toBeNull();
    // Intro navigation is not an undo step (it changes nothing that is scored).
    expect(s.undoStack.at(-1)?.label).toBe('start game');
  });
});

describe('GameManager automatic introduction pacing (R5-12)', () => {
  let gm: GameManager;
  const ok = (a: EngineAction) => {
    const r = gm.dispatch(a);
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    return r;
  };
  const intro = () => gm.current!.intro;
  const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    const db = openDatabase(':memory:');
    const pid = insertProfile(db, { name: 'Alex', color: '#2563eb', avatar: 'fox', pinHash: 'x' }).id;
    gm = new GameManager(db);
    gm.clock = () => Date.now();
    gm.introStepMs = 1000;
    gm.create({ title: 'Intro', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: true } });
    ok({ type: 'addPlayer', profileId: pid });
    ok({ type: 'startGame' });
  });
  afterEach(() => {
    gm.dispose();
    vi.useRealTimers();
  });

  it('advances one step per interval while auto is on', async () => {
    ok({ type: 'startIntro', auto: true });
    await wait(1005);
    expect(intro()?.step).toBe(0);
    await wait(1000);
    expect(intro()?.step).toBe(1);
  });

  it('Stop Auto cancels the pending step: the current category stays', async () => {
    ok({ type: 'startIntro', auto: true });
    await wait(1005);
    expect(intro()?.step).toBe(0);
    await wait(600);
    ok({ type: 'introStopAuto' });
    await wait(5000);
    expect(intro()).toMatchObject({ step: 0, auto: false });
  });

  it('a step scheduled before Previous or a jump never fires afterwards', async () => {
    ok({ type: 'startIntro', auto: true });
    await wait(1005);
    await wait(1000);
    expect(intro()?.step).toBe(1);
    await wait(900); // the next automatic step is 100 ms away
    ok({ type: 'introPrev' });
    await wait(5000);
    expect(intro()).toMatchObject({ step: 0, auto: false });
    ok({ type: 'startIntro', auto: true });
    await wait(900);
    ok({ type: 'introGoto', step: 4 });
    await wait(5000);
    expect(intro()).toMatchObject({ step: 4, auto: false });
  });

  it('unrelated actions do not reset the pacing; a manual Next restarts the interval', async () => {
    ok({ type: 'startIntro', auto: true });
    await wait(600);
    ok({ type: 'showJoinQr', show: true }); // unrelated: the step still comes on time
    await wait(405);
    expect(intro()?.step).toBe(0);
    await wait(500);
    ok({ type: 'introNext' }); // manual tap while auto: next step a full interval later
    expect(intro()?.step).toBe(1);
    await wait(800);
    expect(intro()?.step).toBe(1);
    await wait(205);
    expect(intro()?.step).toBe(2);
  });

  it('auto mode ends the introduction after the last category', async () => {
    const n = gm.current!.board.rounds[gm.current!.roundIndex].categories.length;
    ok({ type: 'introGoto', step: n - 2 });
    ok({ type: 'startIntro', auto: true });
    await wait(1005);
    expect(intro()?.step).toBe(n - 1);
    await wait(1000);
    expect(intro()).toBeNull();
  });
});
