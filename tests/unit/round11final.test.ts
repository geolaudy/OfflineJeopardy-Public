// Round 11 engine rules: Final Jeopardy! answering is closed by the host by default (R11-9) — the
// think time can run out while phones still answer; the host's close is final; the automatic mode
// stays available; the reveal, scoring and Undo are unchanged.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { DEFAULT_RULES, normalizeRules, type GameRules, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let clock = 11_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r11id${++ids}`, actor });
function act(s: GameState, a: EngineAction, actor = 'host'): GameState {
  const r = applyAction(s, a, ctx(actor));
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
const run = (s: GameState, ...actions: EngineAction[]) => actions.reduce((x: GameState, a) => act(x, a), s);
const attempt = (s: GameState, a: EngineAction, actor = 'host') => applyAction(s, a, ctx(actor));
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
const buzz = (s: GameState, p: string) => {
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  return act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' }, 'buzzer');
};
const answer = (s: GameState, p: string, text: string) => act(s, { type: 'setFinalAnswer', competitorId: cid(s, p), answer: text }, `profile:${p}`);

/** Both players score, wager 100 each, and the Final clue is on with its think time running. */
function toAnswering(rules: Partial<GameRules> = {}) {
  let s = createGame({ id: 'g11', title: 'T', boardId: 'b1', board: structuredClone(SAMPLE_BOARD), mode: 'solo', rules: { ...DEFAULT_RULES, ...rules }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'alex');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'jordan');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'startFinal' }, { type: 'finalNext' });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'setFinalWager', competitorId: cid(s, p), amount: 100 }, `profile:${p}`);
  s = act(s, { type: 'finalNext' });
  expect(s.final?.stage).toBe('clue');
  s = act(s, { type: 'finalStartThink' }); // R19-4: the host unlocks answering
  expect(s.timer).toMatchObject({ kind: 'final', running: true });
  return s;
}
/** The think time runs out (the server's expiry). */
function timeUp(s: GameState) {
  clock += s.timer!.durationMs + 50;
  return act(s, { type: 'timerExpire' });
}

describe('Final Jeopardy! answering closed by the host (R11-9)', () => {
  it('host closing is the default; older saved rules load as host closing; an explicit choice is kept', () => {
    expect(DEFAULT_RULES.finalClose).toBe('host');
    const { finalClose: _drop, ...old } = DEFAULT_RULES;
    expect(normalizeRules(old as Partial<GameRules>).finalClose).toBe('host');
    expect(normalizeRules({ ...DEFAULT_RULES, finalClose: 'timer' }).finalClose).toBe('timer');
  });

  it('time up: the timer ends, answering stays open, a late answer and a changed answer still count', () => {
    // (R19-1: changing a submitted answer needs the rule that allows it.)
    let s = answer(toAnswering({ finalChanges: true }), 'alex', 'Vienna');
    s = timeUp(s);
    expect(s.final?.stage).toBe('clue');
    expect(s.timer).toMatchObject({ kind: 'final', expired: true, running: false });
    s = answer(s, 'jordan', 'Budapest'); // after time is up
    s = answer(s, 'alex', 'Budapest'); // changed
    expect(s.final!.entries.map((e) => [e.answer, e.submitted])).toEqual([
      ['Budapest', true],
      ['Budapest', true],
    ]);
    // Closing: everything is kept, nothing is taken afterwards.
    s = act(s, { type: 'finalNext' });
    expect(s.final?.stage).toBe('closed');
    const late = attempt(s, { type: 'setFinalAnswer', competitorId: cid(s, 'jordan'), answer: 'Prague' }, 'profile:jordan');
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/not open/);
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'jordan'))!.answer).toBe('Budapest');
  });

  it('the host can close answering before the time is up; a player who answered nothing stays without an answer', () => {
    let s = answer(toAnswering(), 'alex', 'Vienna');
    s = act(s, { type: 'finalNext' });
    expect(s.final?.stage).toBe('closed');
    expect(s.timer).toBeNull();
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'jordan'))).toMatchObject({ answer: null, submitted: false });
  });

  it('automatic mode still closes answering when the time is up (a typed answer counts)', () => {
    let s = toAnswering({ finalClose: 'timer' });
    s = act(s, { type: 'setFinalAnswer', competitorId: cid(s, 'alex'), answer: 'Vienna', submit: false }, 'profile:alex');
    s = timeUp(s);
    expect(s.final?.stage).toBe('closed');
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))).toMatchObject({ answer: 'Vienna', submitted: true });
    expect(attempt(s, { type: 'setFinalAnswer', competitorId: cid(s, 'jordan'), answer: 'Late' }, 'profile:jordan').ok).toBe(false);
  });

  it('the reveal, judging and scores are unchanged after the host closes late', () => {
    let s = answer(toAnswering(), 'alex', 'Budapest');
    s = timeUp(s);
    s = answer(s, 'jordan', 'Vienna');
    const before = Object.fromEntries(s.competitors.map((c) => [c.id, s.final!.preScores[c.id]]));
    s = run(s, { type: 'finalNext' }, { type: 'finalNext' });
    expect(s.final?.stage).toBe('reveal');
    for (let i = 0; i < 2; i++) {
      const id = s.final!.order[s.final!.cursor];
      s = run(s, { type: 'finalReveal' }, { type: 'finalReveal' }, { type: 'judgeFinal', competitorId: id, correct: id === cid(s, 'alex') }, { type: 'finalReveal' });
    }
    expect(s.final?.stage).toBe('done');
    const scoreOf = (p: string) => s.events.filter((e) => !e.voided && e.competitorId === cid(s, p)).reduce((a, e) => a + (e.scoreDelta ?? 0), 0);
    expect(scoreOf('alex')).toBe(before[cid(s, 'alex')] + 100);
    expect(scoreOf('jordan')).toBe(before[cid(s, 'jordan')] - 100);
  });

  it('Undo after closing returns to answering with a fresh, running think time and the answers kept', () => {
    let s = answer(toAnswering(), 'alex', 'Vienna');
    s = timeUp(s);
    s = act(s, { type: 'finalNext' });
    s = act(s, { type: 'undo' });
    expect(s.final?.stage).toBe('clue');
    expect(s.timer).toMatchObject({ kind: 'final', running: true, expired: false });
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))!.answer).toBe('Vienna');
  });
});
