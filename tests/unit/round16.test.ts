// Round 16: the host unlocks Daily Double! wagering (R16-7) and a wager — from a phone, the host or a
// computer player — stops the wager timer (R16-8); computer players wager again (R16-9): on every
// opening of a Daily Double! (a later game on the same board, after an undo) and within the limits.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { playerContext, projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, scoresOf, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';

const clock = 1_700_000_000_000;
let ids = 0;
const ctx = (now = clock, actor?: string): EngineCtx => ({ now, newId: () => `r16id${++ids}`, actor });
function run(s: GameState, ...actions: EngineAction[]) {
  for (const a of actions) {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const attempt = (s: GameState, a: EngineAction, now = clock) => applyAction(s, a, ctx(now));
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;

function toDailyDouble(rules = {}) {
  let s = createGame({ id: 'g16', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, dailyWagerEntry: 'player', ...rules }, now: clock });
  for (const p of ['alex', 'jordan']) s = run(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'setControl', competitorId: cid(s, 'alex') });
  return run(s, { type: 'selectClue', clueId: 'sci_4' }); // the sample board's Daily Wager
}
const phoneWager = (s: GameState, amount: number): EngineAction => ({ type: 'submitDailyWager', competitorId: cid(s, 'alex'), profileId: 'alex', amount });

describe('Daily Double! wagering unlocked by the host (R16-7, R16-8)', () => {
  it('starts locked: no timer, the phone cannot wager yet and sees it is locked', () => {
    const s = toDailyDouble();
    expect(s.clue).toMatchObject({ stage: 'wager', wagerOpen: false });
    expect(s.timer).toBeNull();
    const r = attempt(s, phoneWager(s, 400));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/unlock/i);
    expect(playerContext(s, 'alex', clock).dailyWager).toMatchObject({ open: false, pending: null });
    expect(projectState(s, 'host', {}).clue?.wagerOpen).toBe(false);
  });

  it('Unlock Wager starts the wager timer exactly once; a phone wager stops it and waits for the host', () => {
    let s = toDailyDouble();
    s = run(s, { type: 'openDailyWager' });
    expect(s.clue?.wagerOpen).toBe(true);
    expect(s.timer).toMatchObject({ kind: 'wager', running: true, durationMs: DEFAULT_RULES.timers.wagerSeconds * 1000, startedAt: clock });
    const again = attempt(s, { type: 'openDailyWager' }, clock + 5000);
    expect(again.ok && again.ignored).toBe(true);
    expect(again.ok && again.state.timer?.startedAt).toBe(clock); // not restarted
    expect(playerContext(s, 'alex', clock).dailyWager?.open).toBe(true);
    s = run(s, phoneWager(s, 400));
    expect(s.timer).toBeNull(); // stopped
    expect(s.clue).toMatchObject({ stage: 'wager', pendingWager: { amount: 400 }, wager: null }); // not shown yet
    s = run(s, { type: 'setDailyWager', competitorId: cid(s, 'alex'), amount: 400, profileId: 'alex' });
    expect(s.clue).toMatchObject({ stage: 'question', wager: { amount: 400 } });
  });

  it('a host-entered wager stops the timer too, and also works before unlocking', () => {
    let s = run(toDailyDouble(), { type: 'openDailyWager' });
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 500 });
    expect(s.timer).toBeNull();
    expect(s.clue?.pendingWager?.amount).toBe(500);
    let t = toDailyDouble();
    t = run(t, { type: 'enterDailyWager', competitorId: cid(t, 'alex'), amount: 300 });
    expect(t.clue).toMatchObject({ wagerOpen: true, pendingWager: { amount: 300 }, stage: 'wager' });
    expect(t.timer).toBeNull();
  });

  it('without wager time in the rules Unlock Wager opens wagering without a timer', () => {
    const s = run(toDailyDouble({ timers: { ...DEFAULT_RULES.timers, wagerSeconds: 0 } }), { type: 'openDailyWager' });
    expect(s.clue?.wagerOpen).toBe(true);
    expect(s.timer).toBeNull();
  });

  it('time running out invents nothing: no wager, no clue; the player can still wager, the host still locks', () => {
    let s = run(toDailyDouble(), { type: 'openDailyWager' });
    const end = clock + DEFAULT_RULES.timers.wagerSeconds * 1000;
    const r = attempt(s, { type: 'timerExpire' }, end);
    expect(r.ok).toBe(true);
    s = (r as { state: GameState }).state;
    expect(s.timer).toMatchObject({ expired: true });
    expect(s.clue).toMatchObject({ stage: 'wager', pendingWager: null, wager: null });
    s = run(s, phoneWager(s, 200));
    expect(s.clue?.pendingWager?.amount).toBe(200);
  });

  it('Unlock Wager can be undone (back to the announcement)', () => {
    let s = run(toDailyDouble(), { type: 'openDailyWager' });
    s = run(s, { type: 'undo' });
    expect(s.clue).toMatchObject({ stage: 'wager', wagerOpen: false });
    expect(s.timer).toBeNull();
  });

  it('a game saved before round 16 (no wagerOpen) opens locked, with Unlock Wager', () => {
    const s = toDailyDouble();
    delete s.clue!.wagerOpen;
    expect(attempt(s, phoneWager(s, 400)).ok).toBe(false);
    expect(run(s, { type: 'openDailyWager' }).clue?.wagerOpen).toBe(true);
  });
});

describe('computer players wager (R16-9)', () => {
  let gm: GameManager;
  let human = '';
  const ok = (a: EngineAction) => {
    const r = gm.dispatch(a);
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    return r;
  };
  const s = () => gm.current!;
  const bot = () => s().competitors.find((c) => c.bot)!;
  const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
  beforeEach(() => {
    vi.useFakeTimers();
    const db = openDatabase(':memory:');
    human = insertProfile(db, { name: 'Human', color: '#2563eb', avatar: 'fox', pinHash: 'x' }).id;
    gm = new GameManager(db);
    gm.clock = () => Date.now();
    gm.bots.random = () => 0;
  });
  afterEach(() => {
    gm.dispose();
    vi.useRealTimers();
  });
  function newGame(board = SAMPLE_BOARD) {
    gm.create({ title: 'Bots', boardId: 'same-board', board, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false, dailyWagerEntry: 'player' }, practice: false });
    ok({ type: 'addPlayer', profileId: human });
    ok({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'setControl', competitorId: bot().id });
  }
  async function botWagers(clueId = 'sci_4') {
    ok({ type: 'selectClue', clueId });
    await wait(6000);
    expect(s().clue?.pendingWager).toBeNull(); // waits for the host's unlock
    ok({ type: 'openDailyWager' });
    expect(s().timer?.kind).toBe('wager');
    await wait(4000);
    const p = s().clue?.pendingWager;
    expect(p?.competitorId).toBe(bot().id);
    expect(s().timer).toBeNull(); // the bot's wager stopped the timer
    expect(s().clue?.stage).toBe('wager'); // the host shows the clue
    return p!.amount;
  }

  it('waits for Unlock Wager, wagers legally, the host locks it and the bot answers', async () => {
    newGame();
    ok({ type: 'adjustScore', competitorId: bot().id, delta: 1000 });
    const amount = await botWagers();
    expect(amount).toBeGreaterThanOrEqual(DEFAULT_RULES.dailyWagerMin);
    expect(amount).toBeLessThanOrEqual(1000);
    ok({ type: 'setDailyWager', competitorId: bot().id, amount });
    // R17-1: the bot answers only once the host has started the answer time.
    await wait(9000);
    expect(s().clue?.submission ?? null).toBeNull();
    ok({ type: 'startDailyAnswer' });
    await wait(9000);
    expect(s().clue?.submission?.competitorId).toBe(bot().id);
    expect(s().clue?.resolved).toBe(false); // the host judges
  });

  it('wagers again in a later game on the same board and after the host undoes the pick', async () => {
    newGame();
    await botWagers();
    ok({ type: 'endGame' });
    newGame();
    await botWagers(); // same board, same clue id, new game
    ok({ type: 'undo' }); // the bot's pending wager
    ok({ type: 'undo' }); // Unlock Wager
    ok({ type: 'undo' }); // the pick
    expect(s().phase).toBe('board');
    ok({ type: 'setControl', competitorId: bot().id });
    await botWagers(); // picked again
  });

  it('wagers within the limits with a negative score and on a board of small values', async () => {
    const small = structuredClone(SAMPLE_BOARD);
    for (const r of small.rounds) for (const c of r.categories) for (const q of c.clues) q.value = Math.max(0, Math.round(q.value / 20));
    newGame(small);
    ok({ type: 'adjustScore', competitorId: bot().id, delta: -300 });
    const amount = await botWagers();
    const max = Math.max(scoresOf(s().events)[bot().id] ?? 0, ...small.rounds[s().roundIndex].categories.flatMap((c) => c.clues.map((q) => q.value)));
    expect(amount).toBeGreaterThanOrEqual(DEFAULT_RULES.dailyWagerMin);
    expect(amount).toBeLessThanOrEqual(max);
  });

  it('wagers in the Final, within its score', async () => {
    newGame();
    ok({ type: 'adjustScore', competitorId: bot().id, delta: 800 });
    ok({ type: 'adjustScore', competitorId: s().competitors.find((c) => !c.bot)!.id, delta: 500 });
    ok({ type: 'startFinal' });
    ok({ type: 'finalNext' }); // wagers
    await wait(4000);
    const w = s().final!.entries.find((e) => e.competitorId === bot().id)!.wager;
    expect(w).not.toBeNull();
    expect(w!).toBeGreaterThanOrEqual(0);
    expect(w!).toBeLessThanOrEqual(800);
  });
});
