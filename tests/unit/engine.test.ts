import { describe, expect, it } from 'vitest';
import { applyAction, createGame, normalizeState, type EngineCtx } from '../../src/server/engine/engine';
import { InputFilter, resolveInput } from '../../src/server/engine/buzzer';
import { projectState, playerContext } from '../../src/server/engine/projection';
import { DEFAULT_RULES, rulesFromPreset, scoresOf, type GameRules, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let clock = 1_000_000;
let ids = 0;
const ctx = (): EngineCtx => ({ now: clock, newId: () => `id${++ids}` });

function run(s: GameState, ...actions: EngineAction[]): GameState {
  for (const a of actions) {
    const r = applyAction(s, a, ctx());
    if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
    s = r.state;
  }
  return s;
}
function tryRun(s: GameState, a: EngineAction) {
  return applyAction(s, a, ctx());
}

function soloGame(players = ['alex', 'jordan', 'sam']) {
  let s = createGame({ id: 'g1', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of players) s = run(s, { type: 'addPlayer', profileId: p });
  return s;
}
const cid = (s: GameState, profileId: string) => s.competitors.find((c) => c.memberIds.includes(profileId))!.id;
const buzz = (s: GameState, profileId: string) => {
  const res = resolveInput(s, { controllerId: `phone:${profileId}`, profileId });
  if (!res.ok) throw new Error(res.reason);
  return run(s, { type: 'buzz', competitorId: res.competitorId, profileId: res.profileId, controllerId: `phone:${profileId}`, sourceKind: 'phone' });
};

function teamGame() {
  let s = createGame({ id: 'g2', title: 'Teams', boardId: 'b1', board: SAMPLE_BOARD, mode: 'team', rules: { ...DEFAULT_RULES }, now: clock });
  s = run(
    s,
    { type: 'addTeam', name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: ['alex', 'jordan'], teamId: 'tw' },
    { type: 'addTeam', name: 'Dragons', color: '#dc2626', buzzerMode: 'shared', memberIds: ['taylor', 'sam'], teamId: 'td' },
  );
  const wiz = s.competitors[0].id;
  const dra = s.competitors[1].id;
  s = run(
    s,
    { type: 'bindController', controllerId: 'jc-L-1', kind: 'joycon', label: 'Joy-Con (L)', target: { kind: 'profile', profileId: 'alex' } },
    { type: 'bindController', controllerId: 'jc-R-1', kind: 'joycon', label: 'Joy-Con (R)', target: { kind: 'profile', profileId: 'jordan' } },
    { type: 'bindController', controllerId: 'jc-L-2', kind: 'joycon', label: 'Joy-Con (L)', target: { kind: 'competitor', competitorId: dra } },
  );
  return { s, wiz, dra };
}
const press = (s: GameState, controllerId: string) => {
  const res = resolveInput(s, { controllerId });
  if (!res.ok) return { s, res };
  const r = applyAction(s, { type: 'buzz', competitorId: res.competitorId, profileId: res.profileId, controllerId, sourceKind: 'joycon' }, ctx());
  if (!r.ok) throw new Error(r.error);
  return { s: r.state, res, info: r.info };
};

describe('game flow and scoring', () => {
  it('requires competitors before starting', () => {
    const s = createGame({ id: 'g', title: 'T', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: DEFAULT_RULES, now: clock });
    expect(tryRun(s, { type: 'startGame' })).toMatchObject({ ok: false });
  });

  it('plays a clue: first buzz wins, correct answer awards points and control', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_2' }, { type: 'unlockBuzzers' });
    clock += 300;
    s = buzz(s, 'jordan');
    s = buzz(s, 'alex'); // late
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'jordan'));
    expect(s.buzzer.winner?.reactionMs).toBe(300);
    expect(s.buzzer.queue.map((q) => q.competitorId)).toEqual([cid(s, 'alex')]);
    s = run(s, { type: 'judge', result: 'correct' });
    expect(scoresOf(s.events)).toEqual({ [cid(s, 'jordan')]: 400 });
    expect(s.controlCompetitorId).toBe(cid(s, 'jordan'));
    expect(s.clue?.resolved).toBe(true);
    expect(s.clue?.answerRevealed).toBe(true);
    s = run(s, { type: 'closeClue' });
    expect(s.phase).toBe('board');
    expect(s.usedClueIds).toContain('hist_2');
    expect(tryRun(s, { type: 'selectClue', clueId: 'hist_2' }).ok).toBe(false);
  });

  it('incorrect answers deduct (negative scores allowed) and reopen for others only', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'geo_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(scoresOf(s.events)[cid(s, 'alex')]).toBe(-200);
    expect(s.buzzer.status).toBe('open');
    // alex cannot buzz again on this clue
    const r = applyAction(s, { type: 'buzz', competitorId: cid(s, 'alex'), profileId: 'alex', controllerId: 'phone:alex', sourceKind: 'phone' }, ctx());
    expect(r.ok && r.ignored && r.info).toBe('already-answered');
    s = buzz(s, 'sam');
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'sam'));
  });

  it('classroom preset does not deduct for incorrect answers', () => {
    let s = soloGame();
    s = run(s, { type: 'updateRules', rules: rulesFromPreset('classroom') }, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'geo_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(scoresOf(s.events)[cid(s, 'alex')] ?? 0).toBe(0);
  });

  it('early buzzes are recorded and optionally locked out', () => {
    let s = soloGame();
    s = run(s, { type: 'updateRules', rules: { ...DEFAULT_RULES, earlyBuzzPenalty: 'lockout', earlyBuzzLockoutMs: 500 } }, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'geo_2' });
    s = buzz(s, 'alex'); // early - buzzers locked
    expect(s.buzzer.winner).toBeNull();
    expect(s.events.at(-1)).toMatchObject({ type: 'buzz', result: 'early' });
    s = run(s, { type: 'unlockBuzzers' });
    clock += 100;
    s = buzz(s, 'alex'); // still locked out
    expect(s.buzzer.winner).toBeNull();
    s = buzz(s, 'sam');
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'sam'));
    clock += 1000;
  });

  it('manual adjustments, undo voids events and restores state', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'correct' });
    expect(scoresOf(s.events)[cid(s, 'alex')]).toBe(200);
    s = run(s, { type: 'undo' });
    expect(scoresOf(s.events)[cid(s, 'alex')] ?? 0).toBe(0);
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'alex')); // back to the buzzed state
    expect(s.events.filter((e) => e.type === 'answer')[0].voided).toBe(true);
    s = run(s, { type: 'judge', result: 'incorrect' });
    s = run(s, { type: 'adjustScore', competitorId: cid(s, 'jordan'), delta: 500, note: 'bonus' });
    expect(scoresOf(s.events)).toMatchObject({ [cid(s, 'alex')]: -200, [cid(s, 'jordan')]: 500 });
  });

  it('pauses and resumes timers with the game', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    expect(s.timer).toMatchObject({ kind: 'buzz', running: true, durationMs: 10_000 });
    clock += 4000;
    s = run(s, { type: 'pauseGame' });
    expect(s.timer).toMatchObject({ running: false, remainingMs: 6000 });
    clock += 60_000;
    s = run(s, { type: 'resumeGame' });
    clock += 6000;
    s = run(s, { type: 'timerExpire' });
    expect(s.timer?.expired).toBe(true);
    expect(s.buzzer.status).toBe('locked'); // buzz timer expiry locks buzzers
  });

  it('ignores early timer expiry', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'timerStart', kind: 'custom', seconds: 5 });
    clock += 1000;
    const r = tryRun(s, { type: 'timerExpire' });
    expect(r.ok && r.ignored).toBe(true);
  });
});

describe('wagers', () => {
  it('daily wager validates bounds and scores the wager amount', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'sci_4' });
    expect(s.clue?.isDailyWager).toBe(true);
    expect(s.clue?.stage).toBe('wager');
    const alex = cid(s, 'alex');
    expect(tryRun(s, { type: 'setDailyWager', competitorId: alex, amount: 1001 }).ok).toBe(false); // max = max(score 0, round max 1000)
    expect(tryRun(s, { type: 'setDailyWager', competitorId: alex, amount: 1 }).ok).toBe(false);
    expect(tryRun(s, { type: 'unlockBuzzers' }).ok).toBe(false);
    s = run(s, { type: 'setDailyWager', competitorId: alex, amount: 1000 }, { type: 'judge', result: 'incorrect' });
    expect(scoresOf(s.events)[alex]).toBe(-1000);
  });

  it('public projection hides the daily wager question until the wager is set', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'sci_4' });
    expect(projectState(s, 'public', {}).clue?.question).toBeNull();
    expect(projectState(s, 'host', {}).clue?.question).toBeTruthy();
    s = run(s, { type: 'setDailyWager', competitorId: cid(s, 'alex'), amount: 500 });
    expect(projectState(s, 'public', {}).clue?.question).toBeTruthy();
  });

  it('final wager: eligibility, hidden wagers, adjudication and winner', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'jordan');
    s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'startFinal' });
    const alex = cid(s, 'alex');
    const jordan = cid(s, 'jordan');
    expect(s.final?.entries.map((e) => e.competitorId)).toEqual([alex, jordan]); // sam has 0 -> ineligible
    // R4-2: reveal order is lowest → highest score before the Final.
    expect(s.final?.order).toEqual([jordan, alex]);
    expect(s.final?.preScores).toMatchObject({ [alex]: 1000, [jordan]: 600 });
    s = run(s, { type: 'finalNext' });
    expect(tryRun(s, { type: 'setFinalWager', competitorId: jordan, amount: 601 }).ok).toBe(false);
    expect(tryRun(s, { type: 'setFinalAnswer', competitorId: jordan, answer: 'early' }).ok).toBe(false); // clue not shown yet
    s = run(s, { type: 'setFinalWager', competitorId: alex, amount: 1000 }, { type: 'setFinalWager', competitorId: jordan, amount: 600 });
    for (const role of ['public', 'host', 'player'] as const) {
      const v = projectState(s, role, {});
      expect(v.final?.entries.every((e) => e.wager === null && e.hasWager)).toBe(true); // private from the host too
    }
    expect(projectState(s, 'public', {}).final?.question).toBeNull();
    s = run(s, { type: 'finalNext' });
    expect(projectState(s, 'public', {}).final?.question).toBeTruthy();
    expect(projectState(s, 'public', {}).final?.answer).toBeNull();
    // The locked wagers are recorded as events, but the host's event list hides the amounts.
    expect(projectState(s, 'host', {}).events?.filter((e) => e.type === 'wager').every((e) => e.wager === undefined)).toBe(true);
    s = run(s, { type: 'setFinalAnswer', competitorId: alex, answer: 'Vienna' }, { type: 'setFinalAnswer', competitorId: jordan, answer: 'Budapest' });
    expect(projectState(s, 'host', {}).final?.entries.map((e) => [e.hasAnswer, e.answer])).toEqual([[true, null], [true, null]]);
    expect(playerContext(s, 'alex', clock).final).toMatchObject({ wager: 1000, answer: 'Vienna', submitted: true }); // own submission only
    s = run(s, { type: 'finalNext' });
    expect(s.final).toMatchObject({ stage: 'reveal', cursor: 0, step: 'contestant' });
    // Written answers are recorded for history, but stay out of the host's event list until revealed.
    expect(s.events.filter((e) => e.type === 'submission').map((e) => e.note).sort()).toEqual(['Budapest', 'Vienna']);
    expect(JSON.stringify(projectState(s, 'host', {}).events)).not.toMatch(/Vienna|Budapest/);
    expect(tryRun(s, { type: 'judgeFinal', competitorId: jordan, correct: true }).ok).toBe(false); // answer not shown yet
    s = run(s, { type: 'finalReveal' });
    let host = projectState(s, 'host', {}).final!;
    expect(host.entries.find((e) => e.competitorId === jordan)).toMatchObject({ wager: 600, answer: null });
    expect(host.entries.find((e) => e.competitorId === alex)).toMatchObject({ wager: null, answer: null });
    s = run(s, { type: 'finalReveal' });
    expect(projectState(s, 'public', {}).final?.entries.find((e) => e.competitorId === jordan)?.answer).toBe('Budapest');
    expect(tryRun(s, { type: 'judgeFinal', competitorId: alex, correct: true }).ok).toBe(false); // not alex's turn
    expect(tryRun(s, { type: 'finalReveal' }).ok).toBe(false); // judge first
    expect(scoresOf(s.events)[jordan]).toBe(600); // score changes only on judgment
    s = run(s, { type: 'judgeFinal', competitorId: jordan, correct: true });
    expect(scoresOf(s.events)[jordan]).toBe(1200);
    s = run(s, { type: 'finalReveal' });
    expect(s.final).toMatchObject({ cursor: 1, step: 'contestant' });
    host = projectState(s, 'host', {}).final!;
    expect(host.entries.find((e) => e.competitorId === alex)).toMatchObject({ wager: null, answer: null });
    expect(tryRun(s, { type: 'finalNext' }).ok).toBe(false); // alex not judged
    s = run(s, { type: 'finalReveal' }, { type: 'finalReveal' }, { type: 'judgeFinal', competitorId: alex, correct: false }, { type: 'finalReveal' });
    expect(s.final?.stage).toBe('done');
    s = run(s, { type: 'endGame' });
    expect(scoresOf(s.events)).toMatchObject({ [alex]: 0, [jordan]: 1200 });
    expect(s.results?.[0]).toMatchObject({ competitorId: jordan, placement: 1, isWinner: true });
    expect(s.phase).toBe('ended');
  });

  it('final: equal scores reveal in game order; missing wager counts 0; max wager; time up closes answers', () => {
    let s = withRules(soloGame(['a', 'b', 'c']), { finalAllowNonPositive: true });
    s = run(s, { type: 'startGame' }, { type: 'introSkip' });
    s = run(s, { type: 'adjustScore', competitorId: cid(s, 'c'), delta: 400, note: 't' }, { type: 'startFinal' });
    const [a, b, c] = ['a', 'b', 'c'].map((p) => cid(s, p));
    expect(s.final?.order).toEqual([a, b, c]); // a = b = 0 → join order; c has the most
    s = run(s, { type: 'finalNext' });
    expect(tryRun(s, { type: 'setFinalWager', competitorId: c, amount: 401 }).ok).toBe(false);
    s = run(s, { type: 'setFinalWager', competitorId: c, amount: 400 }, { type: 'setFinalWager', competitorId: a, amount: 0 }, { type: 'finalNext' });
    expect(s.final?.entries.find((e) => e.competitorId === b)?.wager).toBe(0); // never submitted
    expect(s.timer?.kind).toBe('final');
    s = run(s, { type: 'setFinalAnswer', competitorId: c, answer: 'x' });
    clock += 31_000;
    s = run(s, { type: 'timerExpire' });
    expect(s.final).toMatchObject({ stage: 'reveal', cursor: 0, step: 'contestant' });
    expect(tryRun(s, { type: 'setFinalAnswer', competitorId: a, answer: 'late' }).ok).toBe(false);
    for (const id of [a, b, c]) s = run(s, { type: 'finalReveal' }, { type: 'finalReveal' }, { type: 'judgeFinal', competitorId: id, correct: id === c }, { type: 'finalReveal' });
    expect(s.final?.stage).toBe('done');
    expect(scoresOf(s.events)[c]).toBe(800);
    expect(projectState(s, 'public', {}).final?.entries.find((e) => e.competitorId === b)).toMatchObject({ wager: 0, answer: null, judged: true });
  });

  it('final: a state saved before the step-by-step reveal gets an order on load', () => {
    let s = run(soloGame(['a', 'b']), { type: 'startGame' }, { type: 'introSkip' });
    s = run(s, { type: 'adjustScore', competitorId: cid(s, 'a'), delta: 500, note: 't' }, { type: 'adjustScore', competitorId: cid(s, 'b'), delta: 200, note: 't' }, { type: 'startFinal' });
    const legacy = JSON.parse(JSON.stringify(s));
    for (const k of ['order', 'preScores', 'cursor', 'step']) delete legacy.final[k];
    const up = normalizeState(legacy);
    expect(up.final).toMatchObject({ order: [cid(s, 'b'), cid(s, 'a')], cursor: 0, step: 'contestant' });
  });

  it('ties share first place', () => {
    let s = run(soloGame(['a', 'b']), { type: 'startGame' }, { type: 'introSkip' }, { type: 'endGame' });
    expect(s.results?.filter((r) => r.isWinner)).toHaveLength(2);
  });
});

describe('teams, buzzers and attribution', () => {
  it('individual-mode team buzz records team and individual; scoring goes to team only', () => {
    let { s, wiz } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'tech_3' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-1')); // alex
    expect(s.buzzer.winner).toMatchObject({ competitorId: wiz, profileId: 'alex', controllerId: 'jc-L-1', sourceKind: 'joycon' });
    s = run(s, { type: 'judge', result: 'correct' });
    const ans = s.events.find((e) => e.type === 'answer')!;
    expect(ans).toMatchObject({ competitorId: wiz, profileId: 'alex', scoreDelta: 600, contributionDelta: 600 });
    expect(scoresOf(s.events)).toEqual({ [wiz]: 600 }); // exactly 600, no extra points for alex
    const host = projectState(s, 'host', {});
    expect(host.contributions).toEqual({ alex: 600 });
  });

  it('incorrect answer: team loses value, only the answering member is charged', () => {
    let { s, wiz } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'tech_2' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-1'));
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(scoresOf(s.events)[wiz]).toBe(-400);
    expect(projectState(s, 'host', {}).contributions).toEqual({ alex: -400 });
  });

  it('team-aware arbitration: teammates cannot steal or re-buzz, other team can after incorrect', () => {
    let { s, wiz, dra } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'tech_1' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-1'));
    let r = press(s, 'jc-R-1'); // jordan, same team
    expect(r.s.buzzer.winner?.profileId).toBe('alex');
    expect(r.s.buzzer.queue).toHaveLength(0);
    s = run(r.s, { type: 'judge', result: 'incorrect' });
    r = press(s, 'jc-R-1'); // jordan: team already used its attempt (default rule)
    expect(r.info).toBe('already-answered');
    r = press(r.s, 'jc-L-2'); // dragons shared buzzer
    expect(r.s.buzzer.winner).toMatchObject({ competitorId: dra, profileId: null });
  });

  it('teamRetry=otherMembers lets a different teammate try after a miss', () => {
    let { s, wiz } = teamGame();
    s = run(s, { type: 'updateRules', rules: { ...DEFAULT_RULES, teamRetry: 'otherMembers' } }, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'tech_1' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-1'));
    s = run(s, { type: 'judge', result: 'incorrect' });
    let r = press(s, 'jc-L-1');
    expect(r.info).toBe('already-answered');
    r = press(r.s, 'jc-R-1');
    expect(r.s.buzzer.winner).toMatchObject({ competitorId: wiz, profileId: 'jordan' });
  });

  it('shared buzzer: team-only by default, host can attribute, and correct later with audit trail', () => {
    let { s, dra } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'food_2' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-2'));
    s = run(s, { type: 'judge', result: 'correct' }); // Team Only / Unknown
    const ans = s.events.find((e) => e.type === 'answer')!;
    expect(ans).toMatchObject({ competitorId: dra, profileId: null, scoreDelta: 400, contributionDelta: 0 });
    expect(projectState(s, 'host', {}).contributions).toEqual({});
    s = run(s, { type: 'correctAttribution', eventId: ans.id, profileId: 'taylor' });
    expect(scoresOf(s.events)[dra]).toBe(400); // unchanged — no double counting
    expect(projectState(s, 'host', {}).contributions).toEqual({ taylor: 400 });
    const orig = s.events.find((e) => e.id === ans.id)!;
    expect(orig.voided).toBe(true);
    expect(s.events.some((e) => e.type === 'attribution_correction' && e.correctsEventId === ans.id)).toBe(true);
    expect(tryRun(s, { type: 'correctAttribution', eventId: s.events.at(-1)!.id, profileId: 'alex' }).ok).toBe(false); // alex not on dragons
  });

  it('host chooses the answering member of a shared team at judgement time', () => {
    let { s, dra } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'food_1' }, { type: 'unlockBuzzers' });
    ({ s } = press(s, 'jc-L-2'));
    s = run(s, { type: 'judge', result: 'correct', profileId: 'sam' });
    expect(s.events.find((e) => e.type === 'answer')).toMatchObject({ competitorId: dra, profileId: 'sam', contributionDelta: 200 });
  });

  it('phones of shared-team members and unbound controllers cannot buzz', () => {
    const { s } = teamGame();
    expect(resolveInput(s, { controllerId: 'phone:taylor', profileId: 'taylor' })).toMatchObject({ ok: false, reason: 'shared-team-device' });
    expect(resolveInput(s, { controllerId: 'jc-unknown' })).toMatchObject({ ok: false, reason: 'unassigned' });
    expect(resolveInput(s, { controllerId: 'phone:alex', profileId: 'alex' })).toMatchObject({ ok: true, profileId: 'alex' });
    expect(playerContext(s, 'taylor', clock).sharedTeam).toBe(true);
  });

  it('per-team buzzer mode is independent', () => {
    let { s, wiz, dra } = teamGame();
    s = run(s, { type: 'updateCompetitor', competitorId: wiz, buzzerMode: 'shared' });
    expect(s.competitors.find((c) => c.id === dra)!.buzzerMode).toBe('shared');
    s = run(s, { type: 'updateCompetitor', competitorId: dra, buzzerMode: 'individual' });
    expect(s.competitors.find((c) => c.id === wiz)!.buzzerMode).toBe('shared');
    expect(s.competitors.find((c) => c.id === dra)!.buzzerMode).toBe('individual');
  });

  it('mixed devices (Joy-Con vs phone) share one arbitration', () => {
    let { s, wiz } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'tech_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'jordan'); // jordan via phone
    const r = press(s, 'jc-L-2'); // dragons joy-con second
    expect(r.s.buzzer.winner).toMatchObject({ competitorId: wiz, profileId: 'jordan', sourceKind: 'phone' });
    expect(r.s.buzzer.queue).toHaveLength(1);
  });

  it('team wagers affect the team score once, attribution optional', () => {
    let { s, wiz } = teamGame();
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'sci_4' }, { type: 'setDailyWager', competitorId: wiz, amount: 800 }, { type: 'judge', result: 'correct' });
    expect(scoresOf(s.events)[wiz]).toBe(800);
    expect(projectState(s, 'host', {}).contributions).toEqual({});
  });

  it('a player can be on only one team per game; membership moves are tracked', () => {
    let { s, wiz, dra } = teamGame();
    expect(tryRun(s, { type: 'addTeam', name: 'X', color: '#000000', buzzerMode: 'individual', memberIds: ['alex'] }).ok).toBe(false);
    s = run(s, { type: 'assignMember', profileId: 'alex', competitorId: dra });
    expect(s.competitors.find((c) => c.id === wiz)!.memberIds).toEqual(['jordan']);
    expect(s.competitors.find((c) => c.id === dra)!.memberIds).toContain('alex');
  });
});

describe('input filter (debounce / held buttons)', () => {
  it('is edge-triggered and debounced per controller', () => {
    const f = new InputFilter(100);
    const ev = (pressed: boolean, at: number, button = 'A', controllerId = 'c1') => ({ controllerId, kind: 'joycon' as const, button, pressed, at });
    expect(f.accept(ev(true, 0))).toBe(true);
    expect(f.accept(ev(true, 10))).toBe(false); // held - repeated report
    expect(f.accept(ev(true, 500))).toBe(false); // still held
    expect(f.accept(ev(false, 510))).toBe(false);
    expect(f.accept(ev(true, 550))).toBe(true);
    expect(f.accept(ev(false, 560))).toBe(false);
    expect(f.accept(ev(true, 600))).toBe(false); // bounce within 100ms
    expect(f.accept(ev(true, 600, 'A', 'c2'))).toBe(true); // other controller unaffected
  });
});

describe('projections never leak secrets', () => {
  it('public and player views exclude answers, notes, daily wager locations and undo data', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' });
    for (const role of ['public', 'player'] as const) {
      const v = projectState(s, role, {});
      const json = JSON.stringify(v);
      expect(json).not.toContain('The Inca');
      expect(json).not.toContain('Budapest');
      expect(json).not.toContain('"dailyWager":');
      expect(v.events).toBeUndefined();
      expect(v.clue?.question).toContain('Machu Picchu');
    }
    expect(JSON.stringify(projectState(s, 'host', {}))).toContain('The Inca');
    s = run(s, { type: 'revealAnswer' });
    expect(projectState(s, 'public', {}).clue?.answer).toBe('The Inca');
  });
});

// ---------- User feedback round 1 (USER_FEEDBACK.md FB-3.x, FB-4.5, FB-5.1, FB-E2) ----------

const withRules = (s: GameState, patch: Partial<GameRules>) => run(s, { type: 'updateRules', rules: { ...s.rules, ...patch } });
const lastEarly = (s: GameState) => s.events.filter((e) => e.type === 'buzz' && e.result === 'early').at(-1);
const tryBuzz = (s: GameState, profileId: string) =>
  applyAction(s, { type: 'buzz', competitorId: cid(s, profileId), profileId, controllerId: `phone:${profileId}`, sourceKind: 'phone' }, ctx());

describe('early-buzz rules (FB-3)', () => {
  it('no penalty: early press is recorded, player can still buzz once open', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' });
    s = buzz(s, 'alex');
    expect(lastEarly(s)).toMatchObject({ competitorId: cid(s, 'alex'), scoreDelta: 0 });
    expect(s.buzzer.early).toHaveLength(1);
    s = run(s, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'alex'));
  });

  it('short lockout expires; lockout is per person, not per device', () => {
    let s = withRules(run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'lockout', earlyBuzzLockoutMs: 400 });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = buzz(s, 'alex'); // phone, early
    s = run(s, { type: 'unlockBuzzers' });
    // The same person on another device (a bound Joy-Con) is still locked out.
    s = run(s, { type: 'bindController', controllerId: 'jc1', kind: 'joycon', label: 'JC', target: { kind: 'profile', profileId: 'alex' } });
    expect(press(s, 'jc1').info).toBe('locked-out');
    expect(playerContext(s, 'alex', clock)).toMatchObject({ canBuzz: false, buzzReason: 'locked-out', lockedUntil: clock + 400 });
    clock += 450;
    expect(press(s, 'jc1').info).toBe('won');
  });

  it('out-for-the-clue lockout lasts until the next clue', () => {
    let s = withRules(run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'clue' });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'unlockBuzzers' });
    clock += 60_000;
    s = buzz(s, 'alex');
    expect(s.buzzer.winner).toBeNull();
    s = buzz(s, 'sam');
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'sam'));
    s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'hist_2' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'alex')); // fresh clue, no lockout
  });

  it('point penalty: deducted once per player per clue, refundable with an audit trail', () => {
    let s = withRules(run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'points', earlyBuzzPoints: 150, earlyBuzzLockoutMs: 100 });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = buzz(s, 'alex');
    expect(scoresOf(s.events)[cid(s, 'alex')]).toBe(-150);
    clock += 200;
    s = buzz(s, 'alex'); // second early press on the same clue: no second deduction
    expect(scoresOf(s.events)[cid(s, 'alex')]).toBe(-150);
    const penalty = s.events.find((e) => e.type === 'buzz' && e.result === 'early' && e.scoreDelta === -150)!;
    s = run(s, { type: 'refundPenalty', eventId: penalty.id });
    expect(scoresOf(s.events)[cid(s, 'alex')] ?? 0).toBe(0);
    expect(s.events.find((e) => e.id === penalty.id)?.voided).toBe(true);
    // the early press itself stays on record for statistics, without points
    expect(s.events.filter((e) => e.type === 'buzz' && e.result === 'early' && !e.voided)).toHaveLength(2);
    expect(tryRun(s, { type: 'refundPenalty', eventId: penalty.id }).ok).toBe(false);
  });

  it('changing the rule mid-game applies to the next buzz only and never rewrites earlier penalties', () => {
    let s = withRules(run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'points', earlyBuzzPoints: 100 });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = buzz(s, 'alex');
    s = withRules(s, { earlyBuzzPenalty: 'none' });
    s = buzz(s, 'sam');
    expect(scoresOf(s.events)).toMatchObject({ [cid(s, 'alex')]: -100 });
    expect(scoresOf(s.events)[cid(s, 'sam')] ?? 0).toBe(0);
    expect(s.events.filter((e) => e.result === 'early').map((e) => e.note)).toEqual(['points', 'none']);
  });

  it('is not "early" after time ran out or when already out of the clue', () => {
    let s = withRules(run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'points', earlyBuzzPoints: 100 });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    clock += 10_000;
    s = run(s, { type: 'timerExpire' });
    expect(s.clue?.answeringEnded).toBe(true);
    const r = tryBuzz(s, 'alex');
    expect(r.ok && r.info).toBe('ended');
    expect(scoresOf(s.events)[cid(s, 'alex')] ?? 0).toBe(0);
    // already tried this clue (auto re-open off) → not early either
    s = withRules(s, { autoReopenAfterIncorrect: false });
    s = run(s, { type: 'closeClue' }, { type: 'selectClue', clueId: 'hist_2' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(s.buzzer.status).toBe('locked');
    const r2 = tryBuzz(s, 'alex');
    expect(r2.ok && r2.info).toBe('already-answered');
    // ...but another player pressing before the host re-opens IS early
    s = buzz(s, 'sam');
    expect(lastEarly(s)?.competitorId).toBe(cid(s, 'sam'));
  });

  it('teams: individual buzzers lock out only that member; a shared buzzer locks out the team', () => {
    const t = teamGame();
    let s = withRules(run(t.s, { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'clue' });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = press(s, 'jc-L-1').s; // Alex (Wizards, individual buzzers) early
    s = press(s, 'jc-L-2').s; // Dragons' shared device early
    expect(s.buzzer.early.map((e) => [e.competitorId, e.profileId])).toEqual([
      [t.wiz, 'alex'],
      [t.dra, null],
    ]);
    s = run(s, { type: 'unlockBuzzers' });
    expect(press(s, 'jc-L-2').info).toBe('locked-out');
    expect(press(s, 'jc-L-1').info).toBe('locked-out');
    expect(press(s, 'jc-R-1').info).toBe('won'); // Alex's teammate is not punished
  });

  it('team point penalty hits the team score once; contribution only for an identified member', () => {
    const t = teamGame();
    let s = withRules(run(t.s, { type: 'startGame' }, { type: 'introSkip' }), { earlyBuzzPenalty: 'points', earlyBuzzPoints: 50 });
    s = run(s, { type: 'selectClue', clueId: 'hist_1' });
    s = press(s, 'jc-L-1').s;
    s = press(s, 'jc-L-2').s;
    expect(scoresOf(s.events)).toEqual({ [t.wiz]: -50, [t.dra]: -50 });
    expect(s.events.filter((e) => e.result === 'early').map((e) => [e.profileId, e.contributionDelta])).toEqual([
      ['alex', -50],
      [null, 0],
    ]);
  });

  it('phones may press while locked (early presses count like physical buzzers)', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' });
    expect(playerContext(s, 'alex', clock)).toMatchObject({ canBuzz: false, canPress: true, buzzReason: 'locked' });
    s = run(s, { type: 'revealAnswer' });
    expect(playerContext(s, 'alex', clock)).toMatchObject({ canPress: false, buzzReason: 'ended' });
  });
});

describe('unanswered clue flow (FB-5.1)', () => {
  it('time runs out → reveal → return: no score change, closed as unanswered', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    clock += 10_000;
    s = run(s, { type: 'timerExpire' });
    expect(s.clue).toMatchObject({ answeringEnded: true, answerRevealed: false });
    s = run(s, { type: 'revealAnswer', clueId: 'hist_1' });
    expect(projectState(s, 'public', {}).clue?.answer).toBe('The Inca');
    s = run(s, { type: 'closeClue', clueId: 'hist_1' });
    expect(s.phase).toBe('board');
    expect(s.events.at(-1)).toMatchObject({ type: 'clue_close', result: 'unanswered' });
    expect(scoresOf(s.events)).toEqual({});
    expect(s.usedClueIds).toContain('hist_1');
  });

  it('host can end answering without a timer; re-opening is still possible', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = run(s, { type: 'endAnswering' });
    expect(s.clue?.answeringEnded).toBe(true);
    expect(s.buzzer.status).toBe('locked');
    s = run(s, { type: 'unlockBuzzers' });
    expect(s.clue?.answeringEnded).toBe(false);
    s = buzz(s, 'alex');
    expect(tryRun(s, { type: 'endAnswering' }).ok).toBe(false); // judge first
  });

  it('everyone wrong → answering ended automatically', () => {
    let s = run(soloGame(['alex', 'sam']), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(s.clue?.answeringEnded).toBe(false);
    s = buzz(s, 'sam');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(s.clue?.answeringEnded).toBe(true);
    s = run(s, { type: 'revealAnswer' }, { type: 'closeClue' });
    expect(s.events.at(-1)).toMatchObject({ type: 'clue_close', result: 'unanswered' });
  });

  it('stale double taps cannot close the next clue or complete twice', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'closeClue', clueId: 'hist_1' });
    expect(s.events.at(-1)).toMatchObject({ type: 'clue_close', result: 'skipped' });
    s = run(s, { type: 'selectClue', clueId: 'hist_2' });
    const r = tryRun(s, { type: 'closeClue', clueId: 'hist_1' });
    expect(r.ok && r.ignored).toBe(true);
    expect(r.ok && r.state.phase).toBe('clue');
    expect(s.events.filter((e) => e.type === 'clue_close')).toHaveLength(1);
  });

  it('a correct answer closes as answered', () => {
    let s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' });
    expect(s.events.at(-1)).toMatchObject({ type: 'clue_close', result: 'answered' });
  });
});

describe('category introduction (FB-4.5)', () => {
  it('starts with each round, steps through every category, can be replayed, skipped or interrupted', () => {
    let s = run(soloGame(), { type: 'startGame' });
    const cats = s.board.rounds[s.roundIndex].categories.length;
    expect(s.intro).toEqual({ roundIndex: s.roundIndex, step: -1, auto: false, at: clock });
    expect(projectState(s, 'public', {}).intro?.step).toBe(-1);
    for (let i = 0; i < cats; i++) s = run(s, { type: 'introNext' });
    expect(s.intro?.step).toBe(cats - 1);
    s = run(s, { type: 'introNext' });
    expect(s.intro).toBeNull();
    s = run(s, { type: 'startIntro', auto: true });
    expect(s.intro).toMatchObject({ step: -1, auto: true });
    s = run(s, { type: 'introSkip' });
    expect(s.intro).toBeNull();
    s = run(s, { type: 'startIntro' });
    // R4-16: no clue can be opened while the categories are being introduced.
    expect(tryRun(s, { type: 'selectClue', clueId: 'hist_1' })).toMatchObject({ ok: false, error: expect.stringMatching(/Introduce the categories/) });
    s = run(s, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' });
    expect(s.intro).toBeNull();
    s = run(s, { type: 'closeClue' }, { type: 'setRound', roundIndex: 1 });
    expect(s.intro).toMatchObject({ roundIndex: 1, step: -1 });
  });

  it('can be turned off by rule', () => {
    let s = withRules(soloGame(), { categoryIntro: false });
    s = run(s, { type: 'startGame' }, { type: 'introSkip' });
    expect(s.intro).toBeNull();
  });
});

describe('saved-game compatibility (FB-E2)', () => {
  it('upgrades a state saved before the feedback changes', () => {
    const s = run(soloGame(), { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    const legacy = JSON.parse(JSON.stringify(s));
    delete legacy.intro;
    delete legacy.clue.answeringEnded;
    delete legacy.buzzer.early;
    const { earlyBuzzPenalty: _a, earlyBuzzPoints: _b, categoryIntro: _c, ...oldRules } = legacy.rules;
    legacy.rules = { ...oldRules, earlyBuzzLockoutMs: 300 };
    const up = normalizeState(structuredClone(legacy));
    expect(up.intro).toBeNull();
    expect(up.clue?.answeringEnded).toBe(false);
    expect(up.buzzer.early).toEqual([]);
    expect(up.rules).toMatchObject({ earlyBuzzPenalty: 'lockout', earlyBuzzLockoutMs: 300, earlyBuzzPoints: 100, categoryIntro: true });
    const after = buzz(up, 'alex');
    expect(after.buzzer.winner?.competitorId).toBe(cid(after, 'alex'));
    const off = normalizeState({ ...structuredClone(legacy), rules: { ...oldRules, earlyBuzzLockoutMs: 0 } });
    expect(off.rules.earlyBuzzPenalty).toBe('none');
  });
});

describe('room codes (P17)', () => {
  it('gates joining only when required, validates codes, and never shows the code to phones', () => {
    let s = createGame({ id: 'g', title: 'T', boardId: null, board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock, roomCode: 'KXZQ' });
    s = run(s, { type: 'playerJoin', profileId: 'free' }); // not required: no code needed
    s = withRules(s, { requireRoomCode: true });
    expect(tryRun(s, { type: 'playerJoin', profileId: 'alex', code: 'AAAA' })).toMatchObject({ ok: false });
    expect(tryRun(s, { type: 'playerJoin', profileId: 'alex' })).toMatchObject({ ok: false });
    s = run(s, { type: 'playerJoin', profileId: 'alex', code: 'kxzq' }); // case-insensitive
    expect(s.competitors.map((c) => c.profileId)).toEqual(['free', 'alex']);
    expect(tryRun(s, { type: 'setRoomCode', code: 'AB1' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setRoomCode', code: 'ABIO' }).ok).toBe(false); // look-alike letters excluded
    s = run(s, { type: 'setRoomCode', code: 'MNPQ' });
    expect(projectState(s, 'public', {}).roomCode).toBe('MNPQ');
    expect(projectState(s, 'host', {}).roomCode).toBe('MNPQ');
    expect(projectState(s, 'player', {}).roomCode).toBeNull();
  });
});

describe('survival mode (O8)', () => {
  it('wrong answers cost lives; eliminated players cannot buzz, skip the Final and rank below survivors; undo restores a life', () => {
    let s = withRules(soloGame(['alex', 'sam']), { survivalLives: 1 });
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    expect(tryBuzz(s, 'alex').ok && (tryBuzz(s, 'alex') as { info?: string }).info).toBe('eliminated');
    s = run(s, { type: 'undo' });
    expect(s.buzzer.winner?.competitorId).toBe(cid(s, 'alex')); // life restored with the undo
    s = run(s, { type: 'judge', result: 'incorrect' });
    s = run(s, { type: 'closeClue' }, { type: 'adjustScore', competitorId: cid(s, 'alex'), delta: 5000 }, { type: 'adjustScore', competitorId: cid(s, 'sam'), delta: 100 });
    s = run(s, { type: 'startFinal' });
    expect(s.final!.entries.map((e) => e.competitorId)).toEqual([cid(s, 'sam')]);
    s = run(s, { type: 'endGame' });
    expect(s.results![0]).toMatchObject({ competitorId: cid(s, 'sam'), isWinner: true });
  });

  it('every view shows lives left (and none when survival is off)', () => {
    let s = withRules(soloGame(['alex', 'sam']), { survivalLives: 3 });
    s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'incorrect' });
    for (const role of ['host', 'public', 'player'] as const) {
      const v = projectState(s, role, {});
      expect(v.competitors.find((c) => c.id === cid(s, 'alex'))?.lives).toBe(2);
      expect(v.competitors.find((c) => c.id === cid(s, 'sam'))?.lives).toBe(3);
    }
    expect(projectState(soloGame(['alex']), 'public', {}).competitors[0].lives).toBeUndefined();
  });
});

describe('media clues, answer media and automatic unlock (R2-13/14/16)', () => {
  const mediaBoard = () => {
    const b = structuredClone(SAMPLE_BOARD);
    const cats = b.rounds[0].categories;
    cats[0].clues[0].media = [{ kind: 'audio', url: '/media/clues/a.mp3' }]; // hist_1: audio + text
    cats[0].clues[1].media = [{ kind: 'image', url: '/media/clues/i.webp', caption: 'Hint' }]; // hist_2: image only
    cats[0].clues[1].question = '';
    cats[0].clues[1].answerMedia = [{ kind: 'image', url: '/media/clues/full.webp', caption: 'Uncovered' }];
    cats[0].clues[2].media = [{ kind: 'audio', url: '/media/clues/b.mp3' }];
    cats[0].clues[2].unlock = 'mediaEnd'; // hist_3
    return b;
  };
  const mk = (autoUnlock: GameRules['autoUnlock']) => {
    let s = createGame({ id: 'gm', title: 'M', boardId: null, board: mediaBoard(), mode: 'solo', rules: { ...DEFAULT_RULES, autoUnlock, categoryIntro: false }, now: clock });
    s = run(s, { type: 'addPlayer', profileId: 'alex' }, { type: 'startGame' }, { type: 'introSkip' });
    return s;
  };

  it('default (off) keeps the host in charge, even for clues with their own setting', () => {
    let s = run(mk('off'), { type: 'selectClue', clueId: 'hist_2' });
    expect(s.clue?.unlockMode).toBe('host');
    expect(s.buzzer.status).toBe('locked');
  });

  it('media-only clues unlock immediately when the rule says so; text clues wait', () => {
    let s = run(mk('mediaOnly'), { type: 'selectClue', clueId: 'hist_2' });
    expect(s.buzzer.status).toBe('open');
    s = run(s, { type: 'closeClue' }, { type: 'selectClue', clueId: 'hist_1' });
    expect(s.buzzer.status).toBe('locked');
    s = run(s, { type: 'closeClue' }, { type: 'updateRules', rules: { ...s.rules, autoUnlock: 'all' } }, { type: 'selectClue', clueId: 'hist_4' });
    expect(s.buzzer.status).toBe('open'); // rule change applies to the next clue
  });

  it('per-clue "after media finishes": play → end opens the buzzers; pause/resume keeps position', () => {
    let s = run(mk('perClue'), { type: 'selectClue', clueId: 'hist_3' });
    expect(s.clue?.unlockMode).toBe('mediaEnd');
    s = run(s, { type: 'mediaPlay', clueId: 'hist_3', side: 'clue', index: 0, durationMs: 4000 });
    expect(s.buzzer.status).toBe('locked');
    clock += 1000;
    s = run(s, { type: 'mediaPause' });
    expect(s.media).toMatchObject({ status: 'paused', positionMs: 1000 });
    clock += 5000;
    s = run(s, { type: 'mediaPlay', clueId: 'hist_3', side: 'clue', index: 0 }); // resume
    expect(s.media).toMatchObject({ status: 'playing', positionMs: 1000, durationMs: 4000 });
    clock += 1000;
    expect(tryRun(s, { type: 'mediaEnded', clueId: 'hist_3' })).toMatchObject({ ok: true, ignored: true }); // too early
    clock += 2100;
    s = run(s, { type: 'mediaEnded', clueId: 'hist_3' });
    expect(s.media?.status).toBe('ended');
    expect(s.buzzer.status).toBe('open');
  });

  it('answer media is hidden from the TV until reveal; reveal stops clue audio; closing clears media', () => {
    let s = run(mk('off'), { type: 'selectClue', clueId: 'hist_2' });
    expect(projectState(s, 'public', {}).clue?.answerMedia).toEqual([]);
    expect(projectState(s, 'host', {}).clue?.answerMedia).toHaveLength(1);
    expect(JSON.stringify(projectState(s, 'public', {}))).not.toContain('full.webp');
    expect(tryRun(s, { type: 'mediaPlay', clueId: 'hist_2', side: 'answer', index: 0 }).ok).toBe(false);
    s = run(s, { type: 'revealAnswer' });
    expect(projectState(s, 'public', {}).clue?.answerMedia[0]).toMatchObject({ url: '/media/clues/full.webp', caption: 'Uncovered' });
    s = run(s, { type: 'closeClue' }, { type: 'selectClue', clueId: 'hist_1' }, { type: 'mediaPlay', clueId: 'hist_1', side: 'clue', index: 0, durationMs: 9000 });
    s = run(s, { type: 'revealAnswer' });
    expect(s.media?.status).toBe('stopped');
    s = run(s, { type: 'closeClue' });
    expect(s.media).toBeNull();
    expect(tryRun(s, { type: 'mediaPlay', clueId: 'nope', side: 'clue', index: 0 }).ok).toBe(false);
  });
});

describe('lobby controls: change mode and board before the game starts (R2-6)', () => {
  it('solo to teams keeps everyone and their personal buzzers; back to solo releases shared team buzzers', () => {
    let s = soloGame(['alex', 'jordan']);
    s = run(
      s,
      { type: 'addBot', name: 'Robo', level: 'easy' },
      { type: 'bindController', controllerId: 'jc-1', kind: 'joycon', label: 'Joy-Con (L)', target: { kind: 'profile', profileId: 'alex' } },
      { type: 'bindController', controllerId: 'kb-1', kind: 'keyboard', label: 'Key A', target: { kind: 'profile', profileId: 'jordan' } },
    );
    s = run(s, { type: 'setMode', mode: 'team' });
    expect(s.mode).toBe('team');
    expect(s.competitors).toHaveLength(0); // the computer opponent leaves (solo only)
    expect(s.unassigned.map((u) => u.profileId).sort()).toEqual(['alex', 'jordan']);
    expect(s.bindings.map((b) => b.controllerId)).toEqual(['jc-1', 'kb-1']); // personal buzzers stay with the player
    s = run(s, { type: 'addTeam', name: 'Owls', color: '#2563eb', buzzerMode: 'shared', memberIds: ['alex', 'jordan'] });
    s = run(s, { type: 'bindController', controllerId: 'jc-2', kind: 'joycon', label: 'Joy-Con (R)', target: { kind: 'competitor', competitorId: s.competitors[0].id } });
    s = run(s, { type: 'setMode', mode: 'solo' });
    expect(s.competitors.map((c) => c.profileId).sort()).toEqual(['alex', 'jordan']);
    expect(s.unassigned).toHaveLength(0);
    expect(s.bindings.map((b) => b.controllerId)).toEqual(['jc-1', 'kb-1']); // the team's shared buzzer is released
  });

  it('only in the lobby; practice games stay individual; the board can be swapped before the start', () => {
    let s = soloGame(['alex']);
    const other = { ...SAMPLE_BOARD, rounds: SAMPLE_BOARD.rounds.slice(0, 1) };
    s = run(s, { type: 'setBoard', boardId: 'b2', board: other, title: 'Other board' });
    expect(s.boardId).toBe('b2');
    expect(s.title).toBe('Other board');
    expect(s.board.rounds).toHaveLength(1);
    expect(s.competitors).toHaveLength(1);
    const practice = createGame({ id: 'p', title: 'P', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock, practice: true });
    expect(tryRun(practice, { type: 'setMode', mode: 'team' }).ok).toBe(false);
    s = run(s, { type: 'addPlayer', profileId: 'sam' }, { type: 'startGame' }, { type: 'introSkip' });
    expect(tryRun(s, { type: 'setMode', mode: 'team' }).ok).toBe(false);
    expect(tryRun(s, { type: 'setBoard', boardId: 'b1', board: SAMPLE_BOARD }).ok).toBe(false);
  });
});
