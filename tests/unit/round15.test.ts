// Round 15: the Daily Double! wager timer waits for the host and the host can enter a pending wager
// (R15-18, R15-21); a computer player's chosen tile is announced before its clue opens (R15-29);
// lobby cards keep their identity when a nickname changes (R15-7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';
import { buildLobbyModel } from '../../src/web/pages/board/lobbyModel';

const clock = 1_700_000_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r15id${++ids}`, actor });
function run(s: GameState, ...actions: EngineAction[]) {
  for (const a of actions) {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const attempt = (s: GameState, a: EngineAction) => applyAction(s, a, ctx());
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;

function toDailyDouble() {
  let s = createGame({ id: 'g15', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = run(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'setControl', competitorId: cid(s, 'alex') });
  return run(s, { type: 'selectClue', clueId: 'sci_4' }); // the sample board's Daily Wager
}

describe('Daily Double! controlled by the host (R15-18, R15-21)', () => {
  it('opens without a running wager timer, even with automatic timers on; the host starts it', () => {
    expect(DEFAULT_RULES.timers.autoStart).toBe(true);
    let s = toDailyDouble();
    expect(s.clue).toMatchObject({ isDailyWager: true, stage: 'wager' });
    expect(s.timer).toBeNull();
    s = run(s, { type: 'timerStart', kind: 'wager', seconds: DEFAULT_RULES.timers.wagerSeconds });
    expect(s.timer).toMatchObject({ kind: 'wager', running: true });
    expect(s.clue?.stage).toBe('wager'); // the timer never locks the wager or shows the clue
  });

  it('the host enters a pending wager with the phone’s limits; only Lock shows the clue', () => {
    let s = toDailyDouble();
    const alex = cid(s, 'alex');
    expect(attempt(s, { type: 'enterDailyWager', competitorId: alex, amount: 999_999 }).ok).toBe(false);
    expect(attempt(s, { type: 'enterDailyWager', competitorId: alex, amount: DEFAULT_RULES.dailyWagerMin - 1 }).ok).toBe(false);
    s = run(s, { type: 'enterDailyWager', competitorId: alex, amount: 400 });
    expect(s.clue).toMatchObject({ stage: 'wager', pendingWager: { competitorId: alex, amount: 400 }, wager: null });
    expect(projectState(s, 'public', {}).clue?.question).toBeNull();
    expect(projectState(s, 'public', {}).clue?.pendingWager?.amount).toBeNull(); // hidden from the TV
    s = run(s, { type: 'setDailyWager', competitorId: alex, amount: 400 });
    expect(s.clue).toMatchObject({ stage: 'question', wager: { amount: 400 } });
    expect(attempt(s, { type: 'enterDailyWager', competitorId: alex, amount: 300 }).ok).toBe(false); // closed
  });
});

describe('a computer player’s choice is outlined first (R15-29)', () => {
  let gm: GameManager;
  beforeEach(() => {
    vi.useFakeTimers();
    const db = openDatabase(':memory:');
    const human = insertProfile(db, { name: 'Human', color: '#2563eb', avatar: 'fox', pinHash: 'x' }).id;
    gm = new GameManager(db);
    gm.clock = () => Date.now();
    gm.bots.random = () => 0.99;
    gm.create({ title: 'Bots', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false }, practice: false });
    for (const a of [{ type: 'addPlayer', profileId: human }, { type: 'addBot', name: 'Robo Rita', level: 'expert' }, { type: 'startGame' }, { type: 'introSkip' }] as EngineAction[]) expect(gm.dispatch(a).ok).toBe(true);
  });
  afterEach(() => {
    gm.dispose();
    vi.useRealTimers();
  });

  it('announces the tile, holds it about a second, then opens that clue; the hint is never saved', async () => {
    const changes: (string | null)[] = [];
    gm.onChange = () => changes.push(gm.pickHint?.clueId ?? null);
    const bot = gm.current!.competitors.find((c) => c.bot)!;
    gm.dispatch({ type: 'setControl', competitorId: bot.id });
    for (let i = 0; i < 60 && !gm.pickHint; i++) await vi.advanceTimersByTimeAsync(100);
    const hint = gm.pickHint!;
    expect(hint).toBeTruthy();
    expect(gm.current!.phase).toBe('board');
    expect((gm.current as unknown as Record<string, unknown>).pickHint).toBeUndefined(); // not game state
    await vi.advanceTimersByTimeAsync(1300); // R16-14: two short blinks and a longer third (1.4 s)
    expect(gm.current!.phase).toBe('board'); // still showing the outline
    await vi.advanceTimersByTimeAsync(200);
    expect(gm.current!.phase).toBe('clue');
    expect(gm.current!.clue!.clueId).toBe(hint.clueId);
    expect(gm.pickHint).toBeNull();
    expect(changes).toContain(hint.clueId);
  });

  it('withdraws the choice when the host takes over during the outline', async () => {
    const bot = gm.current!.competitors.find((c) => c.bot)!;
    const human = gm.current!.competitors.find((c) => !c.bot)!;
    gm.dispatch({ type: 'setControl', competitorId: bot.id });
    for (let i = 0; i < 60 && !gm.pickHint; i++) await vi.advanceTimersByTimeAsync(100);
    expect(gm.pickHint).toBeTruthy();
    gm.dispatch({ type: 'setControl', competitorId: human.id });
    await vi.advanceTimersByTimeAsync(1500);
    expect(gm.current!.phase).toBe('board');
    expect(gm.pickHint).toBeNull();
  });
});

describe('TV lobby identity (R15-7)', () => {
  it('a player’s card key is their profile id — the same before and after a nickname', () => {
    let s = createGame({ id: 'g15l', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
    s = run(s, { type: 'addPlayer', profileId: 'alex' }, { type: 'addPlayer', profileId: 'jordan' });
    const view = (nick: string) => projectState(s, 'public', { alex: { id: 'alex', name: 'Alex', nickname: nick, color: '#dc2626', avatar: 'fox', pictureUrl: null }, jordan: { id: 'jordan', name: 'Jordan', nickname: '', color: '#2563eb', avatar: 'owl', pictureUrl: null } });
    const keys = (nick: string) => buildLobbyModel(view(nick), null, null).people.map((p) => p.key);
    expect(keys('')).toEqual(keys('Ace'));
    expect(keys('Ace')).toEqual(['p|alex', 'p|jordan']);
  });
});
