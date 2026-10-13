import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from '../../src/server/engine/engine';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { shortcutAction } from '../../src/web/pages/host/shortcuts';

let n = 0;
const run = (s: GameState, ...as: EngineAction[]) => {
  for (const a of as) {
    const r = applyAction(s, a, { now: 1000 + n, newId: () => `x${++n}` });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  return s;
};
const host = (s: GameState) => projectState(s, 'host', {});

describe('host keyboard shortcuts (H15)', () => {
  it('maps keys to the actions valid in the current state', () => {
    let s = createGame({ id: 'g', title: 'T', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: DEFAULT_RULES, now: 0 });
    s = run(s, { type: 'addPlayer', profileId: 'a' }, { type: 'startGame' });
    expect(shortcutAction('n', false, host(s))).toEqual({ type: 'introNext' });
    s = run(s, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' });
    expect(shortcutAction(' ', false, host(s))).toEqual({ type: 'unlockBuzzers' });
    expect(shortcutAction('c', false, host(s))).toBeNull(); // nobody buzzed
    expect(shortcutAction('Enter', false, host(s))).toBeNull(); // answer not shown yet
    s = run(s, { type: 'unlockBuzzers' });
    expect(shortcutAction(' ', false, host(s))).toEqual({ type: 'lockBuzzers' });
    expect(shortcutAction('E', false, host(s))).toEqual({ type: 'endAnswering', clueId: 'hist_1' });
    s = run(s, { type: 'buzz', competitorId: s.competitors[0].id, profileId: 'a', controllerId: 'phone:a', sourceKind: 'phone' });
    expect(shortcutAction('C', false, host(s))).toEqual({ type: 'judge', result: 'correct' });
    expect(shortcutAction('x', false, host(s))).toEqual({ type: 'judge', result: 'incorrect' });
    s = run(s, { type: 'judge', result: 'correct' });
    expect(shortcutAction('Enter', false, host(s))).toEqual({ type: 'closeClue', clueId: 'hist_1' });
    expect(shortcutAction('z', true, host(s))).toEqual({ type: 'undo' });
  });
});
