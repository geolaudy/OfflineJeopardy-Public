import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';
import { DEFAULT_RULES, scoresOf } from '../../src/shared/game';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import type { EngineAction } from '../../src/shared/actions';

let gm: GameManager;
let humanId = '';
const ok = (a: EngineAction) => {
  const r = gm.dispatch(a);
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r;
};
const s = () => gm.current!;
const bot = (name: string) => s().competitors.find((c) => c.name === name)!;
const human = () => s().competitors.find((c) => !c.bot)!;

beforeEach(() => {
  vi.useFakeTimers();
  const db = openDatabase(':memory:');
  humanId = insertProfile(db, { name: 'Human', color: '#2563eb', avatar: 'fox', pinHash: 'x' }).id;
  gm = new GameManager(db);
  gm.clock = () => Date.now();
  gm.introStepMs = 10;
});
afterEach(() => {
  gm.dispose();
  vi.useRealTimers();
});

function game(practice: boolean, rand: number) {
  gm.bots.random = () => rand;
  gm.create({ title: 'Bots', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false }, practice });
  ok({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
  return s();
}

describe('computer opponents (O3)', () => {
  it('are added only to solo games, with unique names and a difficulty', () => {
    game(false, 0);
    expect(bot('Robo Rita')).toMatchObject({ kind: 'player', bot: 'expert', memberIds: [], avatar: 'robot' });
    expect(gm.dispatch({ type: 'addBot', name: 'robo rita', level: 'easy' }).ok).toBe(false);
    ok({ type: 'updateCompetitor', competitorId: bot('Robo Rita').id, botLevel: 'easy' });
    expect(bot('Robo Rita').bot).toBe('easy');
    gm.create({ title: 'Teams', boardId: null, board: SAMPLE_BOARD, mode: 'team', rules: DEFAULT_RULES });
    expect(gm.dispatch({ type: 'addBot', name: 'X', level: 'easy' }).ok).toBe(false);
  });

  it('a knowing bot buzzes through the normal engine after its reaction time and answers correctly', () => {
    game(false, 0); // random()=0 → always knows, fastest reaction
    ok({ type: 'addPlayer', profileId: humanId });
    ok({ type: 'startGame' });
    ok({ type: 'selectClue', clueId: 'hist_1' });
    vi.advanceTimersByTime(5000);
    expect(s().buzzer.status).toBe('locked'); // not a practice game: the host opens the buzzers
    expect(s().events.some((e) => e.type === 'buzz')).toBe(false); // bots never buzz early
    ok({ type: 'unlockBuzzers' });
    vi.advanceTimersByTime(299);
    expect(s().buzzer.winner).toBeNull();
    vi.advanceTimersByTime(10); // expert reacts in 300–750 ms
    expect(s().buzzer.winner).toMatchObject({ competitorId: bot('Robo Rita').id, sourceKind: 'bot', profileId: null });
    vi.advanceTimersByTime(2000);
    expect(scoresOf(s().events)[bot('Robo Rita').id]).toBe(200);
    expect(s().clue?.resolved).toBe(true);
  });

  it('a bot that does not know stays quiet; the host can buzz for the human; undo does not make the bot re-answer', () => {
    game(false, 0.99); // never knows, never risks
    ok({ type: 'addPlayer', profileId: humanId });
    ok({ type: 'startGame' });
    ok({ type: 'selectClue', clueId: 'hist_1' });
    ok({ type: 'unlockBuzzers' });
    vi.advanceTimersByTime(5000);
    expect(s().buzzer.winner).toBeNull();
    ok({ type: 'hostBuzz', competitorId: human().id });
    expect(s().buzzer.winner).toMatchObject({ competitorId: human().id, sourceKind: 'host' });
    ok({ type: 'judge', result: 'incorrect' }); // reopens for the bot, which still doesn't know
    vi.advanceTimersByTime(5000);
    expect(s().buzzer.winner).toBeNull();

    // Bot answers a clue, host undoes the judgement: the bot must not answer again on its own.
    gm.bots.random = () => 0;
    ok({ type: 'closeClue' });
    ok({ type: 'selectClue', clueId: 'hist_2' });
    ok({ type: 'unlockBuzzers' });
    vi.advanceTimersByTime(3000);
    const judged = s().events.filter((e) => e.type === 'answer' && !e.voided).length;
    ok({ type: 'undo' });
    vi.advanceTimersByTime(5000);
    expect(s().events.filter((e) => e.type === 'answer' && !e.voided).length).toBe(judged - 1);
  });

  it('practice games open the buzzers by themselves after a reading pause', () => {
    game(true, 0.99);
    ok({ type: 'addPlayer', profileId: humanId });
    ok({ type: 'startGame' });
    expect(s().practice).toBe(true);
    ok({ type: 'selectClue', clueId: 'hist_1' });
    vi.advanceTimersByTime(1400);
    expect(s().buzzer.status).toBe('locked');
    vi.advanceTimersByTime(6000);
    expect(s().buzzer.status).toBe('open');
  });

  it('bots handle Daily Wagers and the Final on their own', () => {
    game(false, 0);
    ok({ type: 'addPlayer', profileId: humanId });
    ok({ type: 'startGame' });
    ok({ type: 'setControl', competitorId: bot('Robo Rita').id });
    ok({ type: 'adjustScore', competitorId: bot('Robo Rita').id, delta: 1000 });
    ok({ type: 'selectClue', clueId: 'sci_4' }); // Daily Wager on the sample board
    expect(s().clue?.isDailyWager).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(s().clue?.wager?.competitorId).toBe(bot('Robo Rita').id);
    vi.advanceTimersByTime(6000);
    expect(s().clue?.resolved).toBe(true);
    ok({ type: 'closeClue' });

    ok({ type: 'adjustScore', competitorId: human().id, delta: 500 });
    ok({ type: 'startFinal' });
    ok({ type: 'finalNext' }); // wagers
    vi.advanceTimersByTime(4000);
    const entry = () => s().final!.entries.find((e) => e.competitorId === bot('Robo Rita').id)!;
    expect(entry().wager).not.toBeNull();
    ok({ type: 'setFinalWager', competitorId: human().id, amount: 100 });
    ok({ type: 'finalNext' }); // clue
    vi.advanceTimersByTime(8000);
    expect(entry().answer).toBeTruthy();
    ok({ type: 'finalNext' }); // reveal
    vi.advanceTimersByTime(2000);
    expect(entry().judged).toBe(true);
  });
});
