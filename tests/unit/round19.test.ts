// Round 19 engine rules for Final Jeopardy!: a submitted wager / answer is final for players and
// bots unless the game allows changes (R19-1) — the host can always correct one; the last wager and
// the last answer stop their timers (R19-2, R19-3); the clue shows with answering locked and the
// host unlocks it (R19-4); the TV's cues follow the states (R19-2, R19-3, R19-5).
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { projectState } from '../../src/server/engine/projection';
import { transitionCues } from '../../src/web/pages/board/soundCues';
import { DEFAULT_RULES, normalizeRules, type GameRules, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let clock = 19_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r19id${++ids}`, actor });
function act(s: GameState, a: EngineAction, actor = 'host'): GameState {
  const r = applyAction(s, a, ctx(actor));
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
const attempt = (s: GameState, a: EngineAction, actor = 'host') => applyAction(s, a, ctx(actor));
const run = (s: GameState, ...actions: EngineAction[]) => actions.reduce((x: GameState, a) => act(x, a), s);
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
const buzz = (s: GameState, p: string) => {
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  return act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' }, 'buzzer');
};
const wager = (s: GameState, p: string, amount: number, actor = `profile:${p}`) => attempt(s, { type: 'setFinalWager', competitorId: cid(s, p), amount }, actor);
const answer = (s: GameState, p: string, text: string, actor = `profile:${p}`, submit?: boolean) => attempt(s, { type: 'setFinalAnswer', competitorId: cid(s, p), answer: text, ...(submit === false ? { submit } : {}) }, actor);
const ok = (r: ReturnType<typeof attempt>) => {
  if (!r.ok) throw new Error(r.error);
  return r.state;
};
const view = (s: GameState) => projectState(s, 'public', {});

/** Two players with a score, a bot without one; the Final's wagering is open. */
function toWagers(rules: Partial<GameRules> = {}) {
  let s = createGame({ id: 'g19', title: 'T', boardId: 'b1', board: structuredClone(SAMPLE_BOARD), mode: 'solo', rules: { ...DEFAULT_RULES, ...rules }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'alex');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'jordan');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'startFinal' }, { type: 'finalNext' });
  expect(s.final?.stage).toBe('wagers');
  return s;
}

describe('Final Jeopardy! submissions are final by default (R19-1)', () => {
  it('the rule is off by default; older saved rules load with it off', () => {
    expect(DEFAULT_RULES.finalChanges).toBe(false);
    const { finalChanges: _drop, ...old } = DEFAULT_RULES;
    expect(normalizeRules(old as Partial<GameRules>).finalChanges !== true).toBe(true);
  });

  it('a player cannot change a submitted wager (nor a bot); the host can correct it while wagering is open', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    const again = wager(s, 'alex', 50);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/locked/i);
    expect(wager(s, 'alex', 50, 'bot').ok).toBe(false);
    // The host's correction (a player without a working phone, a typo).
    s = ok(wager(s, 'alex', 60, 'host'));
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))!.wager).toBe(60);
  });

  it('with the rule on, a player may change the wager while wagering is open — not afterwards', () => {
    let s = ok(wager(toWagers({ finalChanges: true }), 'alex', 100));
    s = ok(wager(s, 'alex', 40));
    s = ok(wager(s, 'jordan', 10));
    s = act(s, { type: 'finalNext' });
    expect(wager(s, 'alex', 30).ok).toBe(false);
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))!.wager).toBe(40);
  });

  it('a submitted answer is final: no new answer, no draft; the host can still correct it', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    s = ok(wager(s, 'jordan', 100));
    s = run(s, { type: 'finalNext' }, { type: 'finalStartThink' });
    s = ok(answer(s, 'alex', 'Vienna'));
    expect(answer(s, 'alex', 'Budapest').ok).toBe(false);
    expect(answer(s, 'alex', 'Buda', `profile:alex`, false).ok).toBe(false); // "Change answer" draft
    s = ok(answer(s, 'alex', 'Budapest', 'host'));
    const e = s.final!.entries.find((x) => x.competitorId === cid(s, 'alex'))!;
    expect([e.answer, e.submitted]).toEqual(['Budapest', true]);
  });

  it('with the rule on, a submitted answer can be changed until answering closes', () => {
    let s = ok(wager(toWagers({ finalChanges: true }), 'alex', 100));
    s = ok(wager(s, 'jordan', 100));
    s = run(s, { type: 'finalNext' }, { type: 'finalStartThink' });
    s = ok(answer(s, 'alex', 'Vienna'));
    s = ok(answer(s, 'alex', 'Budapest'));
    s = act(s, { type: 'finalNext' }); // close
    expect(answer(s, 'alex', 'Prague').ok).toBe(false);
    expect(s.final!.entries.find((x) => x.competitorId === cid(s, 'alex'))!.answer).toBe('Budapest');
  });
});

describe('Final Jeopardy! phases: the last wager, Show Clue, Unlock Answering, the last answer (R19-2 … R19-5)', () => {
  it('the last wager stops the wager time; nothing advances by itself', () => {
    let s = toWagers();
    expect(s.timer).toMatchObject({ kind: 'wager', running: true });
    s = ok(wager(s, 'alex', 100));
    expect(s.timer?.kind).toBe('wager');
    s = ok(wager(s, 'jordan', 100, 'host')); // the last one, entered by the host
    expect(s.timer).toBeNull();
    expect(s.final!.stage).toBe('wagers');
  });

  it('Show Clue: the clue, answering locked, no time; players and bots cannot answer; Unlock Answering opens it once', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    s = ok(wager(s, 'jordan', 100));
    s = act(s, { type: 'finalNext' });
    expect(s.final).toMatchObject({ stage: 'clue', thinking: false });
    expect(s.timer).toBeNull();
    const early = answer(s, 'alex', 'Vienna');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(early.error).toMatch(/host unlocks/i);
    expect(answer(s, 'alex', 'Vie', 'profile:alex', false).ok).toBe(false); // no draft either
    expect(answer(s, 'jordan', 'Vienna', 'bot').ok).toBe(false);
    // The host may still enter an answer for a player who has no device.
    expect(answer(s, 'jordan', 'Vienna', 'host').ok).toBe(true);
    s = act(s, { type: 'finalStartThink' });
    expect(s.final!.thinking).toBe(true);
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
    const started = s.timer!.startedAt;
    clock += 1000;
    const twice = attempt(s, { type: 'finalStartThink' });
    expect(twice.ok && twice.ignored).toBe(true); // no second start
    s = ok(answer(s, 'alex', 'Vienna'));
    expect(s.timer!.startedAt).toBe(started);
  });

  it('a clue with sound: its end no longer opens answering by itself', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    s = ok(wager(s, 'jordan', 100));
    const f = s.board.rounds[s.final!.roundIndex].categories[0].clues[0];
    f.media = [{ kind: 'audio', url: '/media/a.mp3' }];
    s = act(s, { type: 'finalNext' });
    s = act(s, { type: 'mediaPlay', clueId: f.id, side: 'clue', index: 0, durationMs: 2000 });
    clock += 2100;
    const ended = attempt(s, { type: 'mediaEnded', clueId: f.id });
    if (ended.ok) s = ended.state;
    expect(s.final!.thinking).toBe(false);
    expect(s.timer).toBeNull();
  });

  it('the last answer stops the think time; the host still closes answering and reveals', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    s = ok(wager(s, 'jordan', 100));
    s = run(s, { type: 'finalNext' }, { type: 'finalStartThink' });
    s = ok(answer(s, 'alex', 'Vienna'));
    expect(s.timer?.kind).toBe('final');
    s = ok(answer(s, 'jordan', 'Vienna'));
    expect(s.timer).toBeNull();
    expect(s.final!.stage).toBe('clue');
    s = act(s, { type: 'finalNext' });
    expect(s.final!.stage).toBe('closed');
    expect(s.final!.entries.every((e) => e.answer === 'Vienna' && !e.judged)).toBe(true);
  });

  it('the TV: one buzz-in ding for the last wager and the last answer, the Final category ding on Show Clue — none again on the same state', () => {
    let s = ok(wager(toWagers(), 'alex', 100));
    const steps: GameState[] = [s];
    s = ok(wager(s, 'jordan', 100));
    steps.push(s);
    s = act(s, { type: 'finalNext' });
    steps.push(s);
    s = act(s, { type: 'finalStartThink' });
    steps.push(s);
    s = ok(answer(s, 'alex', 'Vienna'));
    steps.push(s);
    s = ok(answer(s, 'jordan', 'Vienna'));
    steps.push(s);
    const views = steps.map(view);
    const cues = views.slice(1).map((v, i) => transitionCues(views[i], v));
    expect(cues).toEqual([['buzz'], ['final'], [], [], ['buzz']]);
    // A TV that reconnects receives the same state again: nothing new.
    expect(transitionCues(views[5], views[5])).toEqual([]);
  });
});
