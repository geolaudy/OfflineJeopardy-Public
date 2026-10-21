// Round 5 engine rules: Final Jeopardy! undo restarts the think time (R5-15), wagering only once the
// host opens it (R5-18), submitted vs. changing answers (R5-19) and Daily Double! wagers from
// phones (R5-20).
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { playerContext, projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

let clock = 5_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r5id${++ids}`, actor });

function act(s: GameState, a: EngineAction, actor = 'host'): GameState {
  const r = applyAction(s, a, ctx(actor));
  if (!r.ok) throw new Error(`${a.type}: ${r.error}`);
  return r.state;
}
function run(s: GameState, ...actions: EngineAction[]) {
  for (const a of actions) s = act(s, a);
  return s;
}
const attempt = (s: GameState, a: EngineAction, actor = 'host') => applyAction(s, a, ctx(actor));
const cid = (s: GameState, p: string) => s.competitors.find((c) => c.memberIds.includes(p))!.id;
const buzz = (s: GameState, p: string) => {
  const r = resolveInput(s, { controllerId: `phone:${p}`, profileId: p });
  if (!r.ok) throw new Error(r.reason);
  return act(s, { type: 'buzz', competitorId: r.competitorId, profileId: r.profileId, controllerId: `phone:${p}`, sourceKind: 'phone' }, 'buzzer');
};

function soloGame() {
  let s = createGame({ id: 'g5', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  return run(s, { type: 'startGame' }, { type: 'introSkip' });
}

/** Both players score, then the Final starts. */
function toFinal() {
  let s = run(soloGame(), { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'alex');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'jordan');
  return run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'startFinal' });
}
const finalWager = (s: GameState, p: string, amount: number) => act(s, { type: 'setFinalWager', competitorId: cid(s, p), amount }, `profile:${p}`);
const finalAnswer = (s: GameState, p: string, answer: string, submit = true) => act(s, { type: 'setFinalAnswer', competitorId: cid(s, p), answer, submit }, `profile:${p}`);

describe('Final Jeopardy! wagering opens only when the host opens it (R5-18)', () => {
  it('rejects wagers during the category stage, accepts them while open, rejects them after', () => {
    let s = toFinal();
    expect(s.final?.stage).toBe('category');
    const early = attempt(s, { type: 'setFinalWager', competitorId: cid(s, 'alex'), amount: 100 }, 'profile:alex');
    expect(early.ok).toBe(false);
    expect(early.ok ? '' : early.error).toMatch(/not opened/);
    // Not even the host can enter one early.
    expect(attempt(s, { type: 'setFinalWager', competitorId: cid(s, 'alex'), amount: 100 }).ok).toBe(false);
    s = run(s, { type: 'finalNext' });
    s = finalWager(s, 'alex', 500);
    s = finalWager(s, 'alex', 600); // may change while open
    expect(s.final?.entries.find((e) => e.competitorId === cid(s, 'alex'))?.wager).toBe(600);
    expect(attempt(s, { type: 'setFinalWager', competitorId: cid(s, 'alex'), amount: 5000 }, 'profile:alex').ok).toBe(false); // over the limit
    s = run(s, { type: 'finalNext' }); // wagers locked
    expect(attempt(s, { type: 'setFinalWager', competitorId: cid(s, 'alex'), amount: 1 }, 'profile:alex').ok).toBe(false);
  });
});

describe('Final Jeopardy! answers: submitted, changing, locked (R5-19)', () => {
  it('a draft is not submitted; Change answer keeps the last submitted answer until resubmitted', () => {
    let s = run(toFinal(), { type: 'finalNext' });
    s = finalWager(s, 'alex', 100);
    s = run(s, { type: 'finalNext' });
    s = finalAnswer(s, 'alex', 'Vien', false);
    const entry = () => s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))!;
    expect(projectState(s, 'public', {}).final?.entries.find((e) => e.competitorId === cid(s, 'alex'))?.submitted).toBe(false);
    s = finalAnswer(s, 'alex', 'Vienna');
    expect(entry()).toMatchObject({ answer: 'Vienna', submitted: true, draft: null });
    expect(projectState(s, 'public', {}).final?.entries.find((e) => e.competitorId === cid(s, 'alex'))).toMatchObject({ submitted: true, answer: null });
    // Change answer: gray again on the TV, the submitted answer stays.
    s = finalAnswer(s, 'alex', 'Vienna', false);
    s = finalAnswer(s, 'alex', 'Salzburg', false);
    expect(entry()).toMatchObject({ answer: 'Vienna', submitted: false, draft: 'Salzburg' });
    expect(playerContext(s, 'alex', clock).final).toMatchObject({ answer: 'Vienna', submitted: false, draft: 'Salzburg' });
    // Jordan only typed, never submitted: the draft counts when answers close.
    s = finalAnswer(s, 'jordan', 'Budapest', false);
    s = run(s, { type: 'finalNext' });
    expect(entry()).toMatchObject({ answer: 'Vienna', submitted: true });
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'jordan'))?.answer).toBe('Budapest');
    // Locked after closing.
    expect(attempt(s, { type: 'setFinalAnswer', competitorId: cid(s, 'alex'), answer: 'late' }, 'profile:alex').ok).toBe(false);
  });
});

describe('Undo back into Final Jeopardy! answering restarts the think time (R5-15)', () => {
  it('after the think time ran out: answers re-open with a full, running timer and kept answers', () => {
    // (R11-9: answers close at time-up only with the 'timer' rule.)
    const t = toFinal();
    let s = run({ ...t, rules: { ...t.rules, finalClose: 'timer' } }, { type: 'finalNext' });
    s = finalWager(s, 'alex', 100);
    s = finalWager(s, 'jordan', 100);
    s = run(s, { type: 'finalNext' });
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
    const full = s.timer!.durationMs;
    s = finalAnswer(s, 'alex', 'Vienna');
    clock += full + 10;
    s = act(s, { type: 'timerExpire' }, 'timer');
    expect(s.final?.stage).toBe('closed');
    // Player inputs are not undo steps: Undo goes straight back to the answering stage.
    expect(s.undoStack.at(-1)?.label).toBe('Final answers closed');
    for (let round = 0; round < 3; round++) {
      s = run(s, { type: 'undo' });
      expect(s.final?.stage).toBe('clue');
      expect(s.timer).toMatchObject({ kind: 'final', running: true, remainingMs: full, durationMs: full, startedAt: clock, expired: false });
      expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'alex'))).toMatchObject({ answer: 'Vienna', submitted: true });
      // Re-enter the answer phase end again (time runs out once more).
      clock += full + 10;
      s = act(s, { type: 'timerExpire' }, 'timer');
      expect(s.final?.stage).toBe('closed');
    }
  });

  it('after the host closed the answers early: undo re-opens them with a fresh timer', () => {
    let s = run(toFinal(), { type: 'finalNext' }, { type: 'finalNext' });
    clock += 12_000;
    s = finalAnswer(s, 'jordan', 'Budapest');
    s = run(s, { type: 'finalNext' });
    expect(s.final?.stage).toBe('closed');
    s = run(s, { type: 'undo' });
    expect(s.final?.stage).toBe('clue');
    expect(s.timer).toMatchObject({ kind: 'final', running: true, remainingMs: s.timer!.durationMs, startedAt: clock });
    expect(s.final!.entries.find((e) => e.competitorId === cid(s, 'jordan'))?.answer).toBe('Budapest');
  });

  it('host-entered answers (no phone) are still undoable', () => {
    let s = run(toFinal(), { type: 'finalNext' }, { type: 'finalNext' });
    s = run(s, { type: 'setFinalAnswer', competitorId: cid(s, 'alex'), answer: 'Typed by host' });
    expect(s.undoStack.at(-1)?.label).toBe('Final Jeopardy! answer');
  });
});

describe('Daily Double! wager from the phone (R5-20)', () => {
  function toDailyDouble() {
    let s = run(soloGame(), { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
    s = buzz(s, 'alex');
    s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }); // Alex picks next
    // R16-7: the host unlocks the wager after announcing the Daily Double!.
    return run(s, { type: 'selectClue', clueId: 'sci_4' }, { type: 'openDailyWager' });
  }

  it('only the picking player can wager, within limits; the host locks it and only then the clue shows', () => {
    let s = toDailyDouble();
    const alex = cid(s, 'alex');
    const jordan = cid(s, 'jordan');
    expect(s.clue).toMatchObject({ isDailyWager: true, stage: 'wager', wagerBy: alex });
    expect(playerContext(s, 'alex', clock).dailyWager).toMatchObject({ min: DEFAULT_RULES.dailyWagerMin, pending: null, mine: true });
    expect(playerContext(s, 'jordan', clock).dailyWager).toBeNull();
    expect(attempt(s, { type: 'submitDailyWager', competitorId: jordan, profileId: 'jordan', amount: 100 }, 'profile:jordan').ok).toBe(false);
    const max = playerContext(s, 'alex', clock).dailyWager!.max;
    expect(attempt(s, { type: 'submitDailyWager', competitorId: alex, profileId: 'alex', amount: max + 1 }, 'profile:alex').ok).toBe(false);
    s = act(s, { type: 'submitDailyWager', competitorId: alex, profileId: 'alex', amount: 400 }, 'profile:alex');
    // Host sees the amount; the TV only that a wager is in, and still no clue.
    expect(projectState(s, 'host', {}).clue?.pendingWager).toMatchObject({ competitorId: alex, amount: 400 });
    expect(projectState(s, 'public', {}).clue?.pendingWager).toMatchObject({ competitorId: alex, amount: null });
    expect(projectState(s, 'public', {}).clue?.question).toBeNull();
    s = act(s, { type: 'submitDailyWager', competitorId: alex, profileId: 'alex', amount: 500 }, 'profile:alex'); // change before lock
    s = run(s, { type: 'setDailyWager', competitorId: alex, amount: s.clue!.pendingWager!.amount, profileId: 'alex' });
    expect(s.clue).toMatchObject({ stage: 'question', wager: { competitorId: alex, amount: 500 }, pendingWager: null });
    expect(projectState(s, 'public', {}).clue?.question).toBeTruthy();
    expect(attempt(s, { type: 'submitDailyWager', competitorId: alex, profileId: 'alex', amount: 600 }, 'profile:alex').ok).toBe(false); // closed
  });

  it('team: the first member to enter the wager owns it; teammates cannot overwrite it', () => {
    let s = createGame({ id: 'g6', title: 'Teams', boardId: 'b1', board: SAMPLE_BOARD, mode: 'team', rules: { ...DEFAULT_RULES }, now: clock });
    s = run(
      s,
      { type: 'addTeam', name: 'Wizards', color: '#2563eb', buzzerMode: 'individual', memberIds: ['alex', 'jordan'], teamId: 'tw' },
      { type: 'addTeam', name: 'Dragons', color: '#dc2626', buzzerMode: 'individual', memberIds: ['sam'], teamId: 'td' },
      { type: 'startGame' },
      { type: 'introSkip' },
    );
    const wiz = cid(s, 'alex');
    s = run(s, { type: 'setControl', competitorId: wiz }, { type: 'selectClue', clueId: 'sci_4' }, { type: 'openDailyWager' });
    expect(playerContext(s, 'jordan', clock).dailyWager?.mine).toBe(true);
    s = act(s, { type: 'submitDailyWager', competitorId: wiz, profileId: 'alex', amount: 300 }, 'profile:alex');
    expect(playerContext(s, 'jordan', clock).dailyWager).toMatchObject({ pending: 300, pendingBy: 'alex', mine: false });
    const clash = attempt(s, { type: 'submitDailyWager', competitorId: wiz, profileId: 'jordan', amount: 900 }, 'profile:jordan');
    expect(clash.ok).toBe(false);
    expect(s.clue?.pendingWager?.amount).toBe(300);
    expect(attempt(s, { type: 'submitDailyWager', competitorId: cid(s, 'sam'), profileId: 'sam', amount: 100 }, 'profile:sam').ok).toBe(false); // other team
  });
});

describe('team management (R5-5)', () => {
  const lobby = (players: string[]) => {
    let s = createGame({ id: 'gt', title: 'T', boardId: 'b1', board: SAMPLE_BOARD, mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
    for (const p of players) s = act(s, { type: 'addPlayer', profileId: p });
    return s;
  };
  const teams = (s: GameState) => s.competitors.filter((c) => c.kind === 'team');
  const pick = (s: GameState, p: string, competitorId: string | null) => act(s, { type: 'joinTeam', profileId: p, competitorId }, `profile:${p}`);

  it('default team count is ceil(players / 2); everyone waits in Unassigned', () => {
    for (const [n, expected] of [[0, 2], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3]] as const) {
      const s = act(lobby(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n)), { type: 'setMode', mode: 'team' });
      expect(teams(s)).toHaveLength(expected);
      expect(teams(s).every((t) => t.memberIds.length === 0)).toBe(true);
      expect(s.unassigned.map((u) => u.profileId).sort()).toEqual(['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n));
    }
    const s = act(lobby(['a', 'b', 'c']), { type: 'setMode', mode: 'team' });
    expect(teams(s).map((t) => [t.name, t.color])).toEqual([['Blue Team', '#2563eb'], ['Red Team', '#dc2626']]);
  });

  it('players pick, switch and leave teams within the team size; the host can over-fill, which blocks the start', () => {
    let s = act(lobby(['a', 'b', 'c', 'd']), { type: 'setMode', mode: 'team' });
    s = act(s, { type: 'updateRules', rules: { ...s.rules, maxPerTeam: 2 } });
    const [blue, red] = teams(s).map((t) => t.id);
    s = pick(pick(s, 'a', blue), 'b', blue);
    const full = attempt(s, { type: 'joinTeam', profileId: 'c', competitorId: blue }, 'profile:c');
    expect(full.ok ? '' : full.error).toMatch(/full/);
    s = pick(s, 'b', red); // switch
    s = pick(s, 'c', blue);
    s = pick(s, 'c', null); // back to Unassigned
    expect(s.unassigned.map((u) => u.profileId).sort()).toEqual(['c', 'd']);
    // Host drag-and-drop may exceed the limit (at a position) → highlighted, start blocked.
    s = run(s, { type: 'assignMember', profileId: 'c', competitorId: blue, index: 0 }, { type: 'assignMember', profileId: 'd', competitorId: blue });
    expect(teams(s)[0].memberIds).toEqual(['c', 'a', 'd']);
    const blocked = attempt(s, { type: 'startGame' });
    expect(blocked.ok ? '' : blocked.error).toMatch(/limit is 2: move 1/);
    s = run(s, { type: 'assignMember', profileId: 'd', competitorId: null });
    // Start: d (unassigned) stays in the lobby but does not play; no extra team.
    s = run(s, { type: 'setTeamCount', count: 3 }, { type: 'startGame' });
    expect(s.competitors.map((c) => c.name)).toEqual(['Blue Team', 'Red Team']); // the empty Green Team is left out
    expect(s.unassigned.map((u) => u.profileId)).toEqual(['d']);
    expect(s.lobbyTeams?.map((t) => t.name)).toEqual(['Blue Team', 'Red Team', 'Green Team']);
    expect(attempt(s, { type: 'joinTeam', profileId: 'd', competitorId: blue }, 'profile:d').ok).toBe(false); // lobby only
  });

  it('teams → individuals → teams restores names, colours and members', () => {
    let s = act(lobby(['a', 'b', 'c']), { type: 'setMode', mode: 'team' });
    const [blue] = teams(s).map((t) => t.id);
    s = pick(pick(s, 'a', blue), 'b', blue);
    s = act(s, { type: 'setTeamIdentity', profileId: 'a', competitorId: blue, name: 'The Blue Team', color: '#0891b2' }, 'profile:a');
    s = run(s, { type: 'setMode', mode: 'solo' });
    expect(s.competitors.map((c) => c.kind)).toEqual(['player', 'player', 'player']);
    s = run(s, { type: 'setMode', mode: 'team' });
    expect(teams(s).map((t) => [t.name, t.color, t.memberIds])).toEqual([['The Blue Team', '#0891b2', ['a', 'b']], ['Red Team', '#dc2626', []]]);
    expect(s.unassigned.map((u) => u.profileId)).toEqual(['c']);
  });

  it('team identity: members only, names and colours unique; team count changes keep players', () => {
    let s = act(lobby(['a', 'b', 'c', 'd']), { type: 'setMode', mode: 'team' });
    const [blue, red] = teams(s).map((t) => t.id);
    s = pick(pick(s, 'a', blue), 'c', red);
    expect(attempt(s, { type: 'setTeamIdentity', profileId: 'c', competitorId: blue, name: 'Mine' }, 'profile:c').ok).toBe(false);
    expect(attempt(s, { type: 'setTeamIdentity', profileId: 'a', competitorId: blue, name: 'red team' }, 'profile:a').ok).toBe(false);
    expect(attempt(s, { type: 'setTeamIdentity', profileId: 'a', competitorId: blue, color: '#dc2626' }, 'profile:a').ok).toBe(false);
    s = run(s, { type: 'setTeamCount', count: 1 });
    expect(teams(s).map((t) => t.memberIds)).toEqual([['a']]); // the Red Team went; c is back in Unassigned
    expect(s.unassigned.map((u) => u.profileId).sort()).toEqual(['b', 'c', 'd']);
  });

  it('lobby nicknames: unique, shown as the nickname in every projection, never the profile name', () => {
    let s = lobby(['a', 'b']);
    s = act(s, { type: 'setNickname', profileId: 'a', nickname: '  Quiz   Master ' }, 'profile:a');
    expect(s.nicknames).toEqual({ a: 'Quiz Master' });
    expect(attempt(s, { type: 'setNickname', profileId: 'b', nickname: 'quiz master' }, 'profile:b').ok).toBe(false);
    const v = projectState(s, 'public', { a: { id: 'a', name: 'Alexander', nickname: 'Old', color: '#000000', avatar: 'fox', pictureUrl: null }, b: { id: 'b', name: 'Bea', nickname: 'Permanent', color: '#000000', avatar: 'fox', pictureUrl: null } });
    expect(v.profiles.a).toMatchObject({ name: 'Alexander', nickname: 'Quiz Master' });
    expect(v.profiles.b.nickname).toBe(''); // only lobby nicknames count in a game
    s = act(s, { type: 'setNickname', profileId: 'a', nickname: '' }, 'profile:a');
    expect(s.nicknames).toEqual({});
  });
});
