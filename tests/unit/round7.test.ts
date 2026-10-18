// Round 7 (engine/projection): manual score adjustments and undo are "quiet" score changes (R7-11).
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

const clock = 7_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r7id${++ids}`, actor });

function act(s: GameState, a: EngineAction, actor = 'host'): GameState {
  const r = applyAction(s, a, ctx(actor));
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
const run = (s: GameState, ...actions: EngineAction[]) => actions.reduce((x, a) => act(x, a), s);
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
const buzz = (s: GameState, p: string) => {
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  return act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' }, 'buzzer');
};
function soloGame() {
  let s = createGame({ id: 'g7', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  return run(s, { type: 'startGame' }, { type: 'introSkip' });
}
const cause = (s: GameState) => projectState(s, 'public', {}).scoreCause;

describe('score change cause (R7-11)', () => {
  it('a judged answer is a gameplay change; a manual adjustment and an undo are quiet', () => {
    let s = soloGame();
    expect(cause(s)).toBeNull();
    s = run(s, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = act(s, { type: 'judge', result: 'correct' });
    const judged = cause(s)!;
    expect(judged.quiet).toBe(false);
    s = act(s, { type: 'adjustScore', competitorId: cid(s, 'jordan'), delta: 400, note: 'manual' });
    expect(cause(s)).toEqual({ seq: expect.any(Number), quiet: true });
    expect(cause(s)!.seq).toBeGreaterThan(judged.seq);
    s = act(s, { type: 'undo' });
    expect(cause(s)!.quiet).toBe(true);
    // The next gameplay score change is loud again.
    s = act(s, { type: 'closeClue' });
    s = run(s, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'jordan');
    s = act(s, { type: 'judge', result: 'incorrect' });
    expect(cause(s)!.quiet).toBe(false);
  });
  it('every role sees the cause (the TV and phones animate scores too)', () => {
    let s = soloGame();
    s = act(s, { type: 'adjustScore', competitorId: cid(s, 'alex'), delta: -200, note: 'manual' });
    for (const role of ['public', 'host', 'player'] as const) expect(projectState(s, role, {}).scoreCause?.quiet).toBe(true);
  });
});

describe('gamepads through Steam Link / Xbox-style pads (R7-32)', async () => {
  const { isBuzzButton } = await import('../../src/shared/protocol');
  it('"any button" ignores Back, Start, Guide and stick presses; shoulders and triggers buzz', () => {
    for (const b of ['B8', 'B9', 'B10', 'B11', 'B16']) expect(isBuzzButton('any', b)).toBe(false);
    for (const b of ['B0', 'B4', 'B5', 'B6', 'B7', 'B12']) expect(isBuzzButton('any', b)).toBe(true);
    expect(isBuzzButton('B4,B6', 'B6')).toBe(true);
    expect(isBuzzButton('B4,B6', 'B5')).toBe(false);
    // Joy-Con rules unchanged.
    expect(isBuzzButton('any', 'HOME')).toBe(false);
    expect(isBuzzButton('any', 'SL')).toBe(true);
  });
});
