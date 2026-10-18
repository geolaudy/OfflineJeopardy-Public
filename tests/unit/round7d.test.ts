// Round 7 milestone D (engine): the score editor's "Latest score changes" (R7-22) — a manual
// adjustment is removed, a gameplay change is offset (statistics kept), each only once, quietly,
// audited and undoable; undo also brings back an event the undone action had voided.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, scoresOf, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

const clock = 8_000_000;
let ids = 0;
const ctx = (): EngineCtx => ({ now: clock, newId: () => `r7d${++ids}`, actor: 'host' });
function act(s: GameState, a: EngineAction): GameState {
  const r = applyAction(s, a, ctx());
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
const tryAct = (s: GameState, a: EngineAction) => applyAction(s, a, ctx());
const run = (s: GameState, ...actions: EngineAction[]) => actions.reduce((x, a) => act(x, a), s);
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
const score = (s: GameState, p: string) => scoresOf(s.events)[cid(s, p)] ?? 0;
const last = (s: GameState) => s.events[s.events.length - 1];
function soloGame() {
  let s = createGame({ id: 'g7d', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  return run(s, { type: 'startGame' }, { type: 'introSkip' });
}
function correctAnswer(s: GameState, p: string) {
  s = run(s, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  s = act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' });
  return act(s, { type: 'judge', result: 'correct' });
}

describe('take back a score change (R7-22)', () => {
  it('removes a manual adjustment: voided, recorded, quiet, only once', () => {
    let s = soloGame();
    s = act(s, { type: 'adjustScore', competitorId: cid(s, 'alex'), delta: 400, note: 'manual' });
    const adj = last(s);
    expect(score(s, 'alex')).toBe(400);
    s = act(s, { type: 'reverseScoreChange', eventId: adj.id });
    expect(score(s, 'alex')).toBe(0);
    const orig = s.events.find((e) => e.id === adj.id)!;
    expect(orig.voided).toBe(true);
    expect(last(s)).toMatchObject({ type: 'score_adjust', scoreDelta: 0, correctsEventId: adj.id, note: 'adjustment removed' });
    expect(projectState(s, 'public', {}).scoreCause?.quiet).toBe(true);
    expect(tryAct(s, { type: 'reverseScoreChange', eventId: adj.id }).ok).toBe(false);
  });

  it('offsets a correct answer but keeps the answer (statistics) — once', () => {
    let s = correctAnswer(soloGame(), 'alex');
    const answer = s.events.find((e) => e.type === 'answer' && !e.voided)!;
    const value = answer.scoreDelta;
    expect(score(s, 'alex')).toBe(value);
    s = act(s, { type: 'reverseScoreChange', eventId: answer.id });
    expect(score(s, 'alex')).toBe(0);
    expect(s.events.find((e) => e.id === answer.id)!.voided).toBe(false);
    expect(last(s)).toMatchObject({ type: 'score_adjust', scoreDelta: -value, correctsEventId: answer.id });
    expect(tryAct(s, { type: 'reverseScoreChange', eventId: answer.id }).ok).toBe(false);
  });

  it('refuses events without a score change', () => {
    const s = soloGame();
    const start = s.events.find((e) => e.type === 'game_start')!;
    expect(tryAct(s, { type: 'reverseScoreChange', eventId: start.id }).ok).toBe(false);
    expect(tryAct(s, { type: 'reverseScoreChange', eventId: 'nope' }).ok).toBe(false);
  });

  it('Undo brings the removed adjustment back (and the score with it)', () => {
    let s = soloGame();
    s = act(s, { type: 'adjustScore', competitorId: cid(s, 'jordan'), delta: -200, note: 'manual' });
    const adj = last(s);
    s = act(s, { type: 'reverseScoreChange', eventId: adj.id });
    expect(score(s, 'jordan')).toBe(0);
    s = act(s, { type: 'undo' });
    expect(score(s, 'jordan')).toBe(-200);
    expect(s.events.find((e) => e.id === adj.id)!.voided).toBe(false);
    // …and it can be taken back again afterwards.
    s = act(s, { type: 'reverseScoreChange', eventId: adj.id });
    expect(score(s, 'jordan')).toBe(0);
  });
});
