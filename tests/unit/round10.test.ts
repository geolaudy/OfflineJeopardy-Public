// Round 10 engine rules: after a round's last clue the host goes straight to the next round, the
// Final or the results (R10-10), and the clue closes with its real outcome — answered / unanswered —
// instead of counting as skipped. Scores and history are unchanged by the shortcut.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { DEFAULT_RULES, type BoardContent, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let clock = 10_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: (clock += 10), newId: () => `r10id${++ids}`, actor });

function act(s: GameState, a: EngineAction, actor = 'host'): GameState {
  const r = applyAction(s, a, ctx(actor));
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
const run = (s: GameState, ...actions: EngineAction[]) => actions.reduce((x: GameState, a) => act(x, a), s);
const buzz = (s: GameState, p: string) => {
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  return act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' }, 'buzzer');
};
const closes = (s: GameState) => s.events.filter((e) => e.type === 'clue_close' && !e.voided);
const scoreOf = (s: GameState, p: string) => {
  const c = s.competitors.find((x) => x.memberIds.includes(p))!;
  return s.events.filter((e) => !e.voided && e.competitorId === c.id).reduce((a, e) => a + (e.scoreDelta ?? 0), 0);
};

function start(board: BoardContent = SAMPLE_BOARD) {
  let s = createGame({ id: 'g10', title: 'T', boardId: 'b1', board: structuredClone(board), mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  return run(s, { type: 'startGame' }, { type: 'introSkip' });
}

const toRound = (s: GameState, i: number) => run(s, { type: 'setRound', roundIndex: i }, { type: 'introSkip' });

/** Skip every clue of the current round except the last one, which is left open. */
function toLastClue(s: GameState) {
  const clues = s.board.rounds[s.roundIndex].categories.flatMap((c) => c.clues);
  // Out of order: from the last category backwards.
  const order = [...clues].reverse();
  for (const q of order.slice(0, -1)) s = run(s, { type: 'selectClue', clueId: q.id }, { type: 'closeClue', clueId: q.id });
  return act(s, { type: 'selectClue', clueId: order[order.length - 1].id });
}

describe('next round straight from the last clue (R10-10)', () => {
  it('round 1 → round 2: the answered last clue closes as answered and the round 2 introduction starts', () => {
    let s = toLastClue(start());
    const last = s.clue!.clueId;
    s = act(s, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = act(s, { type: 'judge', result: 'correct' });
    if (!s.clue!.answerRevealed) s = act(s, { type: 'revealAnswer' });
    const before = scoreOf(s, 'alex');
    expect(before).toBeGreaterThan(0);
    s = act(s, { type: 'setRound', roundIndex: 1 });
    expect(s.phase).toBe('board');
    expect(s.roundIndex).toBe(1);
    expect(s.clue).toBeNull();
    expect(s.intro).toMatchObject({ roundIndex: 1, step: -1 });
    expect(closes(s).find((e) => e.clueId === last)?.result).toBe('answered');
    expect(scoreOf(s, 'alex')).toBe(before);
    expect(s.events.filter((e) => e.type === 'round_change' && e.roundIndex === 1)).toHaveLength(1);
  });

  it('round 2 → Final: the answered last clue closes as answered; the Final starts at its category', () => {
    let s = toRound(start(), 1);
    s = toLastClue(s);
    const last = s.clue!.clueId;
    s = act(s, { type: 'unlockBuzzers' });
    s = buzz(s, 'jordan');
    s = act(s, { type: 'judge', result: 'correct' });
    if (!s.clue!.answerRevealed) s = act(s, { type: 'revealAnswer' });
    s = act(s, { type: 'startFinal' });
    expect(s.phase).toBe('final');
    expect(s.final?.stage).toBe('category');
    expect(closes(s).filter((e) => e.clueId === last).map((e) => e.result)).toEqual(['answered']);
  });

  it('a revealed clue nobody answered counts as unanswered when the Final starts from it', () => {
    let s = toRound(start(), 1);
    s = toLastClue(s);
    const last = s.clue!.clueId;
    s = run(s, { type: 'revealAnswer' }, { type: 'startFinal' });
    expect(s.phase).toBe('final');
    expect(closes(s).find((e) => e.clueId === last)?.result).toBe('unanswered');
  });

  it('a board without a Final: the last clue of the last round ends the game with results', () => {
    const board = structuredClone(SAMPLE_BOARD);
    board.rounds = board.rounds.filter((r) => r.kind !== 'final');
    let s = toRound(start(board), 1);
    s = toLastClue(s);
    const last = s.clue!.clueId;
    s = run(s, { type: 'revealAnswer' }, { type: 'endGame' });
    expect(s.phase).toBe('ended');
    expect(s.results).toBeTruthy();
    expect(closes(s).find((e) => e.clueId === last)?.result).toBe('unanswered');
  });

  it('one-round board with a Final: straight to the Final; a clue closed before anything happened is still skipped', () => {
    const board = structuredClone(SAMPLE_BOARD);
    board.rounds = board.rounds.filter((r, i) => i === 0 || r.kind === 'final');
    let s = toLastClue(start(board));
    const last = s.clue!.clueId;
    s = act(s, { type: 'startFinal' });
    expect(s.phase).toBe('final');
    expect(closes(s).find((e) => e.clueId === last)?.result).toBe('skipped');
  });

  it('undo after moving on returns to the open last clue', () => {
    let s = toLastClue(start());
    s = act(s, { type: 'revealAnswer' });
    const clueId = s.clue!.clueId;
    s = act(s, { type: 'setRound', roundIndex: 1 });
    s = act(s, { type: 'undo' });
    expect(s.phase).toBe('clue');
    expect(s.clue?.clueId).toBe(clueId);
    expect(s.roundIndex).toBe(0);
  });
});
