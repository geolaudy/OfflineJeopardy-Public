// Round 14 (USER_FEEDBACK "Round 14"): the 12-entry limit (R14-1) and other engine-level changes.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, soloFull, type EngineCtx } from '../../src/server/engine/engine';
import { DEFAULT_RULES, MAX_ENTRIES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let ids = 0;
const ctx = (): EngineCtx => ({ now: 1_000_000, newId: () => `id${++ids}` });
function run(s: GameState, ...actions: EngineAction[]): GameState {
  for (const a of actions) {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
const tryRun = (s: GameState, a: EngineAction) => applyAction(s, a, ctx());
const game = (mode: 'solo' | 'team', rules = {}) => createGame({ id: 'g', title: 'T', boardId: null, board: SAMPLE_BOARD, mode, rules: { ...DEFAULT_RULES, ...rules }, now: 1_000_000 });
const people = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `p${from + i}`);

describe('at most 12 players or teams (R14-1)', () => {
  it('a solo game takes 12 players; the 13th (joining, added or a guest) gets a clear refusal', () => {
    let s = game('solo', { allowSelfJoin: true });
    for (const p of people(11)) s = run(s, { type: 'playerJoin', profileId: p });
    expect(soloFull(s)).toBe(false);
    s = run(s, { type: 'addPlayer', profileId: 'p11' });
    expect(s.competitors).toHaveLength(MAX_ENTRIES);
    expect(soloFull(s)).toBe(true);
    expect(tryRun(s, { type: 'playerJoin', profileId: 'p12' })).toMatchObject({ ok: false, error: 'This game is full (12 players)' });
    expect(tryRun(s, { type: 'addPlayer', profileId: 'p12' })).toMatchObject({ ok: false, error: 'This game is full (12 players)' });
    // A player already in the game is never refused (re-joining after a reconnect).
    expect(tryRun(s, { type: 'playerJoin', profileId: 'p3' })).toMatchObject({ ok: true });
    expect(tryRun(s, { type: 'startGame' }).ok).toBe(true);
  });

  it('computer opponents take seats too', () => {
    let s = game('solo', { allowSelfJoin: true });
    for (const p of people(8)) s = run(s, { type: 'playerJoin', profileId: p });
    for (const n of ['A', 'B', 'C', 'D']) s = run(s, { type: 'addBot', name: n, level: 'easy' });
    expect(s.competitors).toHaveLength(12);
    expect(tryRun(s, { type: 'addBot', name: 'E', level: 'easy' })).toMatchObject({ ok: false, error: expect.stringMatching(/full \(12 players\)/) });
    expect(tryRun(s, { type: 'playerJoin', profileId: 'x' })).toMatchObject({ ok: false });
  });

  it('players waiting for the host to let them in hold a seat', () => {
    let s = game('solo', { allowSelfJoin: false });
    for (const p of people(12)) s = run(s, { type: 'playerJoin', profileId: p });
    expect(s.unassigned).toHaveLength(12);
    expect(tryRun(s, { type: 'playerJoin', profileId: 'x' })).toMatchObject({ ok: false });
    s = run(s, { type: 'approvePlayer', profileId: 'p0' });
    expect(tryRun(s, { type: 'playerJoin', profileId: 'x' })).toMatchObject({ ok: false });
  });

  it('a team game takes 12 teams, with any number of members; joining is never blocked', () => {
    let s = game('team', { allowSelfJoin: true });
    expect(tryRun(s, { type: 'setTeamCount', count: 13 })).toMatchObject({ ok: false, error: 'Up to 12 teams per game' });
    s = run(s, { type: 'setTeamCount', count: 12 });
    expect(s.competitors.filter((c) => c.kind === 'team')).toHaveLength(12);
    expect(tryRun(s, { type: 'addTeam', name: 'Extra', color: '#000000', buzzerMode: 'shared', memberIds: [] })).toMatchObject({ ok: false });
    // 30 people: more than 12 people play, in 12 teams.
    for (const p of people(30)) s = run(s, { type: 'playerJoin', profileId: p });
    expect(s.unassigned).toHaveLength(30);
    s.competitors.forEach((t, i) => {
      for (const p of people(30).filter((_, k) => k % 12 === i)) s = run(s, { type: 'assignMember', profileId: p, competitorId: t.id });
    });
    expect(run(s, { type: 'startGame' }).competitors).toHaveLength(12);
  });

  it('a lobby saved with more than 12 (older version) keeps everyone but cannot start until the host removes some', () => {
    let s = game('solo', { allowSelfJoin: true });
    for (const p of people(12)) s = run(s, { type: 'playerJoin', profileId: p });
    s = { ...s, competitors: [...s.competitors, { ...s.competitors[0], id: 'old13', profileId: 'p99', memberIds: ['p99'] }] };
    expect(tryRun(s, { type: 'startGame' })).toMatchObject({ ok: false, error: 'At most 12 players can play in one game — remove 1 first' });
    expect(s.competitors).toHaveLength(13);
    s = run(s, { type: 'removeCompetitor', competitorId: 'old13' });
    expect(tryRun(s, { type: 'startGame' }).ok).toBe(true);
  });

  it('the host player limit still applies below 12', () => {
    let s = game('solo', { allowSelfJoin: true, maxPlayers: 3 });
    for (const p of people(3)) s = run(s, { type: 'playerJoin', profileId: p });
    expect(soloFull(s)).toBe(true);
    expect(tryRun(s, { type: 'playerJoin', profileId: 'x' })).toMatchObject({ ok: false, error: 'This game is full (3 players)' });
  });
});
