import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/server/db/db';
import { GameManager } from '../../src/server/gameManager';
import { insertProfile } from '../../src/server/repos';
import { DEFAULT_RULES, scoresOf } from '../../src/shared/game';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import type { EngineAction } from '../../src/shared/actions';
import { clueContext, localAnswer, pickClue } from '../../src/server/botAnswers';

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
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

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

/** The human is added first, so the human has control (picks) unless a test says otherwise. */
function game(practice: boolean, rand: number, rules = {}) {
  gm.bots.random = () => rand;
  gm.create({ title: 'Bots', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false, ...rules }, practice });
  ok({ type: 'addPlayer', profileId: humanId });
  ok({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
  return s();
}

describe('computer opponents (O3, R3-9…R3-13)', () => {
  it('practice games move on by themselves when a round is played out: next round, then Final Jeopardy! (K27)', async () => {
    const playOut = () => {
      for (const q of s().board.rounds[s().roundIndex].categories.flatMap((c) => c.clues)) {
        if (s().usedClueIds.includes(q.id)) continue;
        ok({ type: 'selectClue', clueId: q.id });
        ok({ type: 'closeClue', clueId: q.id });
      }
    };
    game(true, 0.99); // high random: the bot never knows, so it never takes control
    ok({ type: 'startGame' });
    const first = s().roundIndex;
    playOut();
    await wait(3000);
    expect(s().roundIndex).toBe(first); // a short pause first
    await wait(800);
    expect(s().roundIndex).toBeGreaterThan(first);
    expect(s().phase).toBe('board');
    playOut();
    await wait(4000);
    expect(s().phase).toBe('final');
    // Not in ordinary games: the host decides when to move on.
    game(false, 0.99);
    ok({ type: 'startGame' });
    const r0 = s().roundIndex;
    playOut();
    await wait(10_000);
    expect(s().roundIndex).toBe(r0);
    expect(s().phase).toBe('board');
  });

  it('are added only to solo games, with unique names and a difficulty', () => {
    game(false, 0);
    expect(bot('Robo Rita')).toMatchObject({ kind: 'player', bot: 'expert', memberIds: [], avatar: 'robot' });
    expect(gm.dispatch({ type: 'addBot', name: 'robo rita', level: 'easy' }).ok).toBe(false);
    ok({ type: 'updateCompetitor', competitorId: bot('Robo Rita').id, botLevel: 'easy' });
    expect(bot('Robo Rita').bot).toBe('easy');
    gm.create({ title: 'Teams', boardId: null, board: SAMPLE_BOARD, mode: 'team', rules: DEFAULT_RULES });
    expect(gm.dispatch({ type: 'addBot', name: 'X', level: 'easy' }).ok).toBe(false);
  });

  it('a bot buzzes, submits its answer, the timer stops and nothing is scored until the host judges', async () => {
    game(false, 0, { timers: { ...DEFAULT_RULES.timers, answerSeconds: 8 } }); // random()=0 → knows, fastest
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'selectClue', clueId: 'hist_1' });
    await wait(5000);
    expect(s().buzzer.status).toBe('locked'); // not a practice game: the host opens the buzzers
    expect(s().events.some((e) => e.type === 'buzz')).toBe(false); // bots never buzz early
    ok({ type: 'unlockBuzzers' });
    await wait(250);
    expect(s().buzzer.winner).toBeNull();
    await wait(800); // expert reacts in 300–750 ms × its own pace
    expect(s().buzzer.winner).toMatchObject({ competitorId: bot('Robo Rita').id, sourceKind: 'bot', profileId: null });
    expect(s().timer?.kind).toBe('answer');
    await wait(3000);
    // Awaiting host judgment: the answer is visible, the timer is gone, no points yet.
    expect(s().clue?.submission).toMatchObject({ competitorId: bot('Robo Rita').id, answer: 'The Inca' });
    expect(s().timer).toBeNull();
    expect(s().events.filter((e) => e.type === 'submission')).toHaveLength(1);
    expect(scoresOf(s().events)[bot('Robo Rita').id] ?? 0).toBe(0);
    await wait(30_000); // no timeout can mark it wrong while the host decides
    expect(s().clue?.resolved).toBe(false);
    expect(s().events.some((e) => e.type === 'answer')).toBe(false);
    ok({ type: 'judge', result: 'correct' });
    expect(scoresOf(s().events)[bot('Robo Rita').id]).toBe(200);
    expect(s().clue?.submission ?? null).toBeNull();
  });

  it('a wrong bot answer is plausible and the host can mark it incorrect', async () => {
    game(false, 0.5, {}); // random 0.5: expert knows a 400 clue? decide → 0.5 < chance, so force not knowing via level
    ok({ type: 'updateCompetitor', competitorId: bot('Robo Rita').id, botLevel: 'easy' });
    gm.bots.random = () => 0.03; // under the easy risk (0.05) but over… knows chance is ≥ 0.05 → knows; use a clue it misses:
    gm.bots.knows = () => false;
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'selectClue', clueId: 'hist_2' });
    ok({ type: 'unlockBuzzers' });
    await wait(4000);
    expect(s().buzzer.winner?.competitorId).toBe(bot('Robo Rita').id); // risked a buzz
    await wait(6000);
    const sub = s().clue!.submission!;
    const right = SAMPLE_BOARD.rounds[0].categories[0].clues[1].answer;
    expect(sub.answer).toBeTruthy();
    expect(sub.answer.toLowerCase()).not.toBe(right.toLowerCase());
    ok({ type: 'judge', result: 'incorrect' });
    expect(scoresOf(s().events)[bot('Robo Rita').id]).toBe(-400);
  });

  it('a bot that does not know stays quiet; the host can buzz for the human; undo does not make the bot re-answer', async () => {
    game(false, 0.99); // never knows, never risks
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'selectClue', clueId: 'hist_1' });
    ok({ type: 'unlockBuzzers' });
    await wait(5000);
    expect(s().buzzer.winner).toBeNull();
    ok({ type: 'hostBuzz', competitorId: human().id });
    expect(s().buzzer.winner).toMatchObject({ competitorId: human().id, sourceKind: 'host' });
    ok({ type: 'judge', result: 'incorrect' }); // reopens for the bot, which still doesn't know
    await wait(5000);
    expect(s().buzzer.winner).toBeNull();

    // Bot submits on a clue, the host undoes: the bot must not submit again on its own.
    gm.bots.random = () => 0;
    ok({ type: 'closeClue' });
    ok({ type: 'selectClue', clueId: 'hist_2' });
    ok({ type: 'unlockBuzzers' });
    await wait(5000);
    expect(s().events.filter((e) => e.type === 'submission' && !e.voided)).toHaveLength(1);
    ok({ type: 'undo' });
    await wait(5000);
    expect(s().events.filter((e) => e.type === 'submission' && !e.voided)).toHaveLength(0);
  });

  it('practice games open the buzzers by themselves after a reading pause', async () => {
    game(true, 0.99);
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    expect(s().practice).toBe(true);
    ok({ type: 'selectClue', clueId: 'hist_1' });
    await wait(1400);
    expect(s().buzzer.status).toBe('locked');
    await wait(6000);
    expect(s().buzzer.status).toBe('open');
  });

  it('a bot with control picks an available clue by itself, never a used one', async () => {
    game(false, 0.99);
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'setControl', competitorId: bot('Robo Rita').id });
    const usedBefore = s().usedClueIds.length;
    await wait(1000);
    expect(s().clue).toBeNull(); // looks at the board for a moment first
    await wait(4000);
    expect(s().phase).toBe('clue');
    expect(s().usedClueIds.length).toBe(usedBefore + 1);
    const picked = s().clue!.clueId;
    ok({ type: 'closeClue' });
    ok({ type: 'setControl', competitorId: bot('Robo Rita').id });
    await wait(5000);
    expect(s().clue?.clueId).toBeTruthy();
    expect(s().clue!.clueId).not.toBe(picked);
    // The human's turn: the bot waits.
    ok({ type: 'closeClue' });
    ok({ type: 'setControl', competitorId: human().id });
    await wait(8000);
    expect(s().phase).toBe('board');
  });

  it('bots wager and answer Daily Wagers and the Final; the host judges them', async () => {
    game(false, 0);
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    ok({ type: 'setControl', competitorId: bot('Robo Rita').id });
    ok({ type: 'adjustScore', competitorId: bot('Robo Rita').id, delta: 1000 });
    ok({ type: 'selectClue', clueId: 'sci_4' }); // Daily Wager on the sample board
    expect(s().clue?.isDailyWager).toBe(true);
    await wait(3500);
    expect(s().clue?.wager?.competitorId).toBe(bot('Robo Rita').id);
    await wait(6000);
    expect(s().clue?.submission?.competitorId).toBe(bot('Robo Rita').id);
    expect(s().clue?.resolved).toBe(false);
    ok({ type: 'judge', result: 'correct' });
    expect(s().clue?.resolved).toBe(true);
    ok({ type: 'closeClue' });
    ok({ type: 'setControl', competitorId: human().id });

    ok({ type: 'adjustScore', competitorId: human().id, delta: 500 });
    ok({ type: 'startFinal' });
    ok({ type: 'finalNext' }); // wagers
    await wait(4000);
    const entry = () => s().final!.entries.find((e) => e.competitorId === bot('Robo Rita').id)!;
    expect(entry().wager).not.toBeNull();
    ok({ type: 'setFinalWager', competitorId: human().id, amount: 100 });
    ok({ type: 'finalNext' }); // clue
    await wait(8000);
    expect(entry().answer).toBeTruthy();
    ok({ type: 'finalNext' }); // reveal
    await wait(5000);
    expect(entry().judged).toBe(false); // the host judges the Final
  });
});

describe('local bot answers and clue choices (R3-9, R3-11)', () => {
  const rnd = (seq: number[]) => {
    let i = 0;
    return () => seq[i++ % seq.length];
  };
  it('wrong answers come from related material, never the right answer or a repeat', () => {
    const board = structuredClone(SAMPLE_BOARD);
    const cat = board.rounds[0].categories[0];
    const ctx = clueContext(board, cat.clues[0].id)!;
    expect(ctx.category).toBe(cat.name);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const a = localAnswer(ctx, { correct: false, level: 'hard', random: rnd([0.3 + i * 0.1, 0.7]), avoid: seen });
      expect(a.toLowerCase()).not.toBe(ctx.answer.toLowerCase());
      expect(seen.has(a)).toBe(false);
      expect([...ctx.board.map((x) => x.replace(/\s*\([^)]*\)\s*/g, ' ').trim()), 'No idea — pass', 'I really thought I knew this one', 'Pass']).toContain(a);
      seen.add(a);
    }
    expect(localAnswer(ctx, { correct: true, level: 'easy', random: Math.random })).toBe(ctx.answer.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  });

  it('numbers and years get near misses; closer for harder bots', () => {
    const ctx = { category: 'History', question: 'Year of the moon landing', answer: '1969', value: 400, sameCategory: [], board: [] };
    const e = Number(localAnswer(ctx, { correct: false, level: 'expert', random: rnd([0.9]) }));
    const z = Number(localAnswer(ctx, { correct: false, level: 'easy', random: rnd([0.99, 0.95]) }));
    expect(e).not.toBe(1969);
    expect(Math.abs(e - 1969)).toBeLessThanOrEqual(3);
    expect(Math.abs(z - 1969)).toBeLessThanOrEqual(40);
  });

  it('clue picks: only available clues; hard bots work down a category; trailing experts go big', () => {
    gm.create({ title: 'P', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES, categoryIntro: false } });
    ok({ type: 'addPlayer', profileId: humanId });
    ok({ type: 'addBot', name: 'Robo Rita', level: 'expert' });
    ok({ type: 'startGame' });
    ok({ type: 'introSkip' });
    const st = s();
    const round = st.board.rounds[st.roundIndex];
    st.usedClueIds = [round.categories[1].clues[0].id];
    const mem = { goodCategories: new Set<number>(), lastCategory: 1 };
    const id = pickClue(st, bot('Robo Rita').id, 'hard', mem, () => 0.5)!;
    expect(id).toBe(round.categories[1].clues[1].id); // next one down in the same category
    for (let i = 0; i < 30; i++) expect(st.usedClueIds).not.toContain(pickClue(st, bot('Robo Rita').id, 'easy', mem, Math.random));
    ok({ type: 'adjustScore', competitorId: human().id, delta: 5000 });
    const big = pickClue(s(), bot('Robo Rita').id, 'expert', mem, () => 0.5)!;
    const top = Math.max(...round.categories.flatMap((c) => c.clues.map((q) => q.value)));
    expect(round.categories.flatMap((c) => c.clues).find((q) => q.id === big)!.value).toBe(top);
  });
});
