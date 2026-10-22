// Round 17: the host starts a Daily Double!'s answer time (R17-1) — the clue shows with it stopped,
// Start Timer starts it once, independent of the wager timer — and the host types the wager by
// default (R17-2, rule dailyWagerEntry: 'host'; 'player' keeps the phone entry after Unlock Wager).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, normalizeState, type EngineCtx } from '../../src/server/engine/engine';
import { playerContext, projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, normalizeRules, scoresOf, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';
import { shortcutAction } from '../../src/web/pages/host/shortcuts';

const clock = 1_700_000_000_000;
let ids = 0;
const ctx = (now = clock): EngineCtx => ({ now, newId: () => `r17id${++ids}` });
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
  let s = createGame({ id: 'g17', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, ...rules }, now: clock });
  for (const p of ['alex', 'jordan']) s = run(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'setControl', competitorId: cid(s, 'alex') });
  return run(s, { type: 'selectClue', clueId: 'sci_4' }); // the sample board's Daily Wager
}
const phoneWager = (s: GameState, amount: number): EngineAction => ({ type: 'submitDailyWager', competitorId: cid(s, 'alex'), profileId: 'alex', amount });
const lock = (s: GameState, amount: number): EngineAction => ({ type: 'setDailyWager', competitorId: cid(s, 'alex'), amount, profileId: 'alex' });

describe('host-entered Daily Double! wagers are the default (R17-2)', () => {
  it('a fresh game and an older saved rule set both use host entry', () => {
    expect(DEFAULT_RULES.dailyWagerEntry).toBe('host');
    const { dailyWagerEntry: _gone, ...old } = DEFAULT_RULES;
    expect(normalizeRules(old).dailyWagerEntry).toBe('host');
    expect(normalizeRules({ ...DEFAULT_RULES, dailyWagerEntry: 'player' }).dailyWagerEntry).toBe('player');
  });

  it('the host types the wager: no unlock, no wager timer, the phone cannot send one and is told so', () => {
    let s = toDailyDouble();
    expect(s.clue).toMatchObject({ stage: 'wager', wagerEntry: 'host', wagerOpen: false, answerStarted: false });
    expect(s.timer).toBeNull();
    const r = attempt(s, phoneWager(s, 400));
    expect(!r.ok && r.error).toMatch(/host enters/i);
    expect(playerContext(s, 'alex', clock).dailyWager).toMatchObject({ byHost: true, pending: null });
    expect(projectState(s, 'host', {}).clue?.wagerEntry).toBe('host');
    // Invalid amounts are refused with the limits; a valid one is shown to the host and the player.
    const bad = attempt(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 1 });
    expect(!bad.ok && bad.error).toMatch(/between 5 and/);
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 600 });
    expect(s.clue).toMatchObject({ stage: 'wager', pendingWager: { amount: 600 }, wager: null });
    expect(s.timer).toBeNull();
    expect(playerContext(s, 'alex', clock).dailyWager?.pending).toBe(600);
    s = run(s, lock(s, 600));
    expect(s.clue).toMatchObject({ stage: 'question', wager: { amount: 600 }, answerStarted: false });
  });

  it('changing the rule during a Daily Double! does not change the one that is open', () => {
    let s = toDailyDouble();
    s = run(s, { type: 'updateRules', rules: { ...s.rules, dailyWagerEntry: 'player' } });
    expect(s.rules.dailyWagerEntry).toBe('player');
    expect(s.clue?.wagerEntry).toBe('host');
    expect(attempt(s, phoneWager(s, 400)).ok).toBe(false);
    // The next Daily Double! follows the new rule.
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 400 }, lock(s, 400), { type: 'judge', result: 'correct' }, { type: 'closeClue' });
    s.usedClueIds = s.usedClueIds.filter((id) => id !== 'sci_4');
    s = run(s, { type: 'selectClue', clueId: 'sci_4' });
    expect(s.clue?.wagerEntry).toBe('player');
  });

  it('player entry keeps the phone workflow: Unlock Wager → wager timer → phone wager stops it', () => {
    let s = toDailyDouble({ dailyWagerEntry: 'player' });
    expect(attempt(s, phoneWager(s, 400)).ok).toBe(false); // locked until the unlock
    s = run(s, { type: 'openDailyWager' });
    expect(s.timer?.kind).toBe('wager');
    s = run(s, phoneWager(s, 400));
    expect(s.timer).toBeNull();
    expect(playerContext(s, 'alex', clock).dailyWager?.byHost).toBe(false);
  });
});

describe('the host starts the Daily Double! answer time (R17-1)', () => {
  it('showing the clue starts no timer; Start Timer starts the answer timer exactly once', () => {
    let s = toDailyDouble();
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 500 }, lock(s, 500));
    expect(s.timer).toBeNull();
    expect(s.clue?.answerStarted).toBe(false);
    const view = projectState(s, 'host', {});
    expect(view.clue).toMatchObject({ answerStarted: false, stage: 'question' });
    expect(shortcutAction(' ', false, view)).toEqual({ type: 'startDailyAnswer' });
    expect(shortcutAction('c', false, view)).toBeNull(); // judging waits for Start Timer
    s = run(s, { type: 'startDailyAnswer' });
    expect(s.clue?.answerStarted).toBe(true);
    expect(s.timer).toMatchObject({ kind: 'answer', running: true, startedAt: clock, durationMs: DEFAULT_RULES.timers.answerSeconds * 1000 });
    const again = attempt(s, { type: 'startDailyAnswer' }, clock + 3000);
    expect(again.ok && again.ignored).toBe(true);
    expect(again.ok && again.state.timer?.startedAt).toBe(clock);
    const after = projectState(s, 'host', {});
    expect(shortcutAction('c', false, after)).toEqual({ type: 'judge', result: 'correct' });
    expect(shortcutAction(' ', false, after)).toBeNull();
  });

  it('cannot start before the clue shows; the wager timer and the answer timer are separate', () => {
    let s = toDailyDouble({ dailyWagerEntry: 'player' });
    expect(attempt(s, { type: 'startDailyAnswer' }).ok).toBe(false);
    s = run(s, { type: 'openDailyWager' });
    expect(s.timer?.kind).toBe('wager');
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 300 });
    expect(s.timer).toBeNull();
    // A wager locked while the wager timer still runs: the timer ends, no answer timer starts.
    let t = run(toDailyDouble({ dailyWagerEntry: 'player' }), { type: 'openDailyWager' });
    t = run(t, { type: 'enterDailyWager', competitorId: cid(t, 'alex'), amount: 300 });
    t.timer = { kind: 'wager', durationMs: 30000, remainingMs: 30000, startedAt: clock, running: true, expired: false };
    t = run(t, lock(t, 300));
    expect(t.timer).toBeNull();
    t = run(t, { type: 'startDailyAnswer' });
    expect(t.timer?.kind).toBe('answer');
  });

  it('time running out ends nothing by itself; the host still judges and the score follows the wager', () => {
    let s = toDailyDouble();
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 500 }, lock(s, 500), { type: 'startDailyAnswer' });
    const end = clock + DEFAULT_RULES.timers.answerSeconds * 1000;
    const r = attempt(s, { type: 'timerExpire' }, end);
    expect(r.ok).toBe(true);
    s = r.ok ? r.state : s;
    expect(s.timer).toMatchObject({ expired: true, running: false });
    expect(s.clue?.resolved).toBe(false);
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(scoresOf(s.events)[cid(s, 'alex')]).toBe(-500);
  });

  it('without answer time in the rules Start Timer is skipped: judging is open at once', () => {
    let s = toDailyDouble({ timers: { ...DEFAULT_RULES.timers, answerSeconds: 0 } });
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 500 }, lock(s, 500));
    const view = projectState(s, 'host', {});
    expect(shortcutAction('c', false, view)).toEqual({ type: 'judge', result: 'correct' });
    s = run(s, { type: 'startDailyAnswer' });
    expect(s.timer).toBeNull();
    expect(s.clue?.answerStarted).toBe(true);
  });

  it('an answer timer started from More counts as Start Timer; undo returns to the stopped clue', () => {
    let s = toDailyDouble();
    s = run(s, { type: 'enterDailyWager', competitorId: cid(s, 'alex'), amount: 500 }, lock(s, 500));
    const u = run(s, { type: 'startDailyAnswer' }, { type: 'undo' });
    expect(u.clue?.answerStarted).toBe(false);
    expect(u.timer).toBeNull();
    s = run(s, { type: 'timerStart', kind: 'answer', seconds: 5 });
    expect(s.clue?.answerStarted).toBe(true);
  });

  it('a Daily Double! saved by an older version keeps its phone entry and running answer time', () => {
    let s = toDailyDouble({ dailyWagerEntry: 'player' });
    s = run(s, { type: 'openDailyWager' }, phoneWager(s, 400), lock(s, 400));
    delete s.clue!.wagerEntry;
    delete s.clue!.answerStarted;
    const n = normalizeState(structuredClone(s));
    expect(n.clue).toMatchObject({ wagerEntry: 'player', answerStarted: true });
  });
});

describe('computer players with host entry (R17-2)', () => {
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

  it('a bot wagers by itself (no unlock, nothing typed), the host shows the clue and starts the time', async () => {
    gm.create({ title: 'Bots', boardId: 'b17', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false }, practice: false });
    ok({ type: 'addPlayer', profileId: human });
    ok({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'setControl', competitorId: bot().id });
    ok({ type: 'adjustScore', competitorId: bot().id, delta: 1000 });
    ok({ type: 'selectClue', clueId: 'sci_4' });
    expect(s().clue?.wagerEntry).toBe('host');
    await wait(4000);
    const p = s().clue?.pendingWager;
    expect(p?.competitorId).toBe(bot().id);
    expect(p!.amount).toBeGreaterThanOrEqual(DEFAULT_RULES.dailyWagerMin);
    expect(s().clue?.stage).toBe('wager'); // the host reveals the clue
    ok({ type: 'setDailyWager', competitorId: bot().id, amount: p!.amount });
    await wait(8000);
    expect(s().clue?.submission ?? null).toBeNull(); // waits for Start Timer
    ok({ type: 'startDailyAnswer' });
    await wait(8000);
    expect(s().clue?.submission?.competitorId).toBe(bot().id);
  });
});
