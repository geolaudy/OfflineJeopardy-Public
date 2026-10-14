// Randomised play-tests of the pure engine: many seeded games with random rules, modes, players,
// bots and teams, driven by a mix of sensible host/player actions and junk (stale, out-of-order or
// invalid ones). After every step the invariants below must hold. A failure prints the seed and
// the action history so it can be replayed.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, humanParticipants, normalizeState, type EngineCtx } from '../../src/server/engine/engine';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, finalEntryReveal, findClue, scoresOf, timerRemaining, type GameRules, type GameState } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A board with a media-only clue, so those paths are exercised too. */
function board() {
  const b = structuredClone(SAMPLE_BOARD);
  const q = b.rounds[0].categories[1].clues[0];
  q.question = '';
  q.media = [{ kind: 'image', url: '/media/clues/x.webp' }];
  q.unlock = 'immediate';
  return b;
}

const PROFILES = ['ann', 'bob', 'cat', 'dan', 'eve', 'fay'];

interface Game {
  s: GameState;
  now: number;
  ids: number;
  history: string[];
  /** Scores before each still-undoable action (parallel to s.undoStack). */
  undoScores: Record<string, number>[];
}

function play(seed: number, steps: number) {
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
  const chance = (p: number) => r() < p;
  const mode = chance(0.4) ? 'team' : 'solo';
  const rules: GameRules = {
    ...DEFAULT_RULES,
    categoryIntro: chance(0.6),
    autoReopenAfterIncorrect: chance(0.8),
    incorrectDeducts: chance(0.8),
    finalAllowNonPositive: chance(0.3),
    earlyBuzzPenalty: pick(['none', 'lockout', 'clue', 'points'] as const),
    survivalLives: chance(0.2) ? 2 : 0,
    autoUnlock: pick(['off', 'all', 'mediaOnly', 'perClue'] as const),
    teamRetry: pick(['none', 'otherMembers'] as const),
    timers: chance(0.2) ? { autoStart: false, buzzSeconds: 0, answerSeconds: 0, wagerSeconds: 0, finalSeconds: 0 } : DEFAULT_RULES.timers,
  };
  const prefColor: Record<string, string> = {};
  for (const p of PROFILES) prefColor[p] = pick(['#b91c1c', '#1d4ed8', '#15803d']); // lots of clashes on purpose
  const g: Game = { s: createGame({ id: `g${seed}`, title: 'Fuzz', boardId: 'b', board: board(), mode, rules, now: 1_000_000 }), now: 1_000_000, ids: 0, history: [], undoScores: [] };
  const ctx = (): EngineCtx => ({ now: g.now, newId: () => `e${seed}_${g.ids++}`, colorOf: (pid) => prefColor[pid] ?? null });

  const apply = (a: EngineAction) => {
    g.history.push(JSON.stringify(a));
    const before = scoresOf(g.s.events);
    const undoDepth = g.s.undoStack.length;
    let res;
    try {
      res = applyAction(g.s, a, ctx());
    } catch (e) {
      throw new Error(`seed ${seed}: ${a.type} threw ${(e as Error).stack}\n${g.history.slice(-25).join('\n')}`);
    }
    if (!res.ok) return false;
    const s = res.state;
    if (a.type === 'undo') {
      // Undo brings the scores back to exactly what they were before the undone action.
      const want = g.undoScores.pop();
      if (want) expect(norm(scoresOf(s.events)), `seed ${seed} undo\n${g.history.slice(-25).join('\n')}`).toEqual(norm(want));
    } else {
      // A new snapshot was taken (at the size limit the oldest one is dropped, so compare the top).
      const top = (st: GameState) => st.undoStack[st.undoStack.length - 1];
      const pushed = s.undoStack.length > undoDepth || (undoDepth > 0 && top(s) !== undefined && JSON.stringify(top(s)) !== JSON.stringify(top(g.s)));
      if (pushed) g.undoScores.push(before);
      if (g.undoScores.length > s.undoStack.length) g.undoScores.splice(0, g.undoScores.length - s.undoStack.length);
    }
    g.s = s;
    check(g, seed);
    return true;
  };

  // ---- setup
  const players = PROFILES.slice(0, 1 + Math.floor(r() * 5));
  if (mode === 'solo') {
    for (const p of players) apply({ type: chance(0.5) ? 'playerJoin' : 'addPlayer', profileId: p } as EngineAction);
    const bots = Math.floor(r() * 3);
    for (let i = 0; i < bots; i++) apply({ type: 'addBot', name: `Bot ${i}`, level: pick(['easy', 'medium', 'hard', 'expert'] as const) } as EngineAction);
  } else {
    const half = Math.max(1, Math.ceil(players.length / 2));
    apply({ type: 'addTeam', name: 'Reds', color: '#dc2626', buzzerMode: pick(['individual', 'shared'] as const), memberIds: players.slice(0, half), teamId: 't1' } as EngineAction);
    if (players.length > half) apply({ type: 'addTeam', name: 'Blues', color: '#2563eb', buzzerMode: pick(['individual', 'shared'] as const), memberIds: players.slice(half), teamId: 't2' } as EngineAction);
  }
  apply({ type: 'startGame' });

  // ---- play
  for (let i = 0; i < steps && g.s.phase !== 'ended'; i++) {
    g.now += Math.floor(r() * 4000);
    const s = g.s;
    const comps = s.competitors;
    const c = comps.length ? pick(comps) : null;
    const member = c ? (c.memberIds.length ? pick(c.memberIds) : null) : null;
    const timerDue = s.timer?.running ? timerRemaining(s.timer, g.now) : null;
    if (timerDue != null && chance(0.3)) {
      g.now += timerDue;
      apply({ type: 'timerExpire' });
      continue;
    }
    if (!c) {
      // Everyone was removed: someone joins again, or the host ends the game.
      apply(chance(0.5) ? { type: 'playerJoin', profileId: pick(PROFILES) } : { type: 'endGame' });
      continue;
    }
    const round = s.board.rounds[s.roundIndex];
    const open = round?.categories.flatMap((cat) => cat.clues).filter((q) => !s.usedClueIds.includes(q.id)) ?? [];
    let a: EngineAction | null = null;
    if (chance(0.06)) {
      // Junk: anything at any time, including stale clue ids and unknown competitors.
      a = pick<EngineAction>([
        { type: 'judge', result: 'correct' },
        { type: 'closeClue', clueId: 'stale' },
        { type: 'revealAnswer', clueId: 'stale' },
        { type: 'finalReveal' },
        { type: 'judgeFinal', competitorId: c?.id ?? 'x', correct: chance(0.5) },
        { type: 'setFinalWager', competitorId: c?.id ?? 'x', amount: Math.floor(r() * 3000) - 500 },
        { type: 'selectClue', clueId: pick(SAMPLE_BOARD.rounds.flatMap((x) => x.categories.flatMap((y) => y.clues.map((q) => q.id)))) },
        { type: 'setRound', roundIndex: Math.floor(r() * 4) },
        { type: 'startFinal' },
        { type: 'undo' },
        { type: 'setPlayerColor', profileId: member ?? 'zzz', color: pick(['#b91c1c', '#1d4ed8', '#0e7490']) },
        { type: 'removeParticipant', profileId: pick(PROFILES) },
        { type: 'removeCompetitor', competitorId: c?.id ?? 'x' },
        { type: 'removeCompetitor', competitorId: c?.id ?? 'x' },
        { type: 'playerJoin', profileId: pick(PROFILES) },
        { type: 'pauseGame' },
        { type: 'resumeGame' },
        { type: 'endAnswering' },
        { type: 'introNext' },
        { type: 'submitAnswer', competitorId: c?.id ?? 'x', answer: 'Guess' },
      ]);
    } else if (s.intro) {
      a = chance(0.7) ? { type: 'introNext' } : { type: 'introSkip' };
    } else if (s.phase === 'board') {
      if (open.length && chance(0.85)) a = { type: 'selectClue', clueId: pick(open).id };
      else if (chance(0.5)) a = { type: 'startFinal' };
      else {
        const next = s.board.rounds.findIndex((x, k) => k > s.roundIndex && x.kind === 'standard');
        a = next > 0 ? { type: 'setRound', roundIndex: next } : { type: 'endGame' };
      }
    } else if (s.phase === 'clue' && s.clue) {
      const cl = s.clue;
      if (cl.isDailyWager && cl.stage === 'wager') a = { type: 'setDailyWager', competitorId: c!.id, amount: pick([5, 100, 400, 1000, 99999]) };
      else if (cl.answerRevealed) a = chance(0.9) ? { type: 'closeClue', clueId: cl.clueId } : { type: 'hideAnswer' };
      else if (s.buzzer.winner || cl.isDailyWager) a = chance(0.5) ? { type: 'judge', result: chance(0.5) ? 'correct' : 'incorrect', ...(member && c?.kind === 'team' ? { profileId: chance(0.5) ? member : null } : {}) } : chance(0.3) ? { type: 'undo' } : { type: 'judge', result: 'incorrect' };
      else if (s.buzzer.status === 'open') {
        a = c ? { type: 'buzz', competitorId: c.id, profileId: c.kind === 'team' && c.buzzerMode === 'individual' ? member : c.profileId ?? null, controllerId: `ctl-${c.id}`, sourceKind: c.bot ? 'bot' : 'phone' } : { type: 'revealAnswer', clueId: cl.clueId };
        if (chance(0.15)) a = { type: 'revealAnswer', clueId: cl.clueId };
      } else if (cl.answeringEnded) a = { type: 'revealAnswer', clueId: cl.clueId };
      else a = chance(0.6) ? { type: 'unlockBuzzers' } : chance(0.4) ? { type: 'buzz', competitorId: c!.id, profileId: member, controllerId: 'early', sourceKind: 'phone' } : { type: 'revealAnswer', clueId: cl.clueId };
    } else if (s.phase === 'final' && s.final) {
      const f = s.final;
      const e = f.entries.length ? pick(f.entries) : null;
      if (f.stage === 'category') a = { type: 'finalNext' };
      else if (f.stage === 'wagers') a = e && chance(0.7) ? { type: 'setFinalWager', competitorId: e.competitorId, amount: Math.floor(r() * 2500) } : { type: 'finalNext' };
      else if (f.stage === 'clue') a = e && chance(0.7) ? { type: 'setFinalAnswer', competitorId: e.competitorId, answer: pick(['Budapest', 'Vienna', '', 'Paris']) } : { type: 'finalNext' };
      else if (f.stage === 'reveal') {
        const cur = f.order[f.cursor];
        const ce = f.entries.find((x) => x.competitorId === cur);
        a = f.step === 'answer' && ce && !ce.judged ? { type: 'judgeFinal', competitorId: cur, correct: chance(0.5) } : chance(0.1) ? { type: 'undo' } : { type: 'finalReveal' };
      } else a = { type: 'endGame' };
    }
    if (a) apply(a);
  }
  return g;
}

const norm = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== 0).sort());

function check(g: Game, seed: number) {
  const s = g.s;
  const where = () => `seed ${seed}\n${g.history.slice(-25).join('\n')}`;
  // Phase / clue consistency.
  if (s.phase === 'clue') expect(s.clue, where()).not.toBeNull();
  if (s.buzzer.winner) expect(s.buzzer.status, where()).toBe('buzzed');
  expect(new Set(s.usedClueIds).size, where()).toBe(s.usedClueIds.length);
  // A person belongs to at most one competitor.
  const members = s.competitors.flatMap((c) => c.memberIds);
  expect(new Set(members).size, where()).toBe(members.length);
  // Every human has a lobby colour; no two share one; bots don't collide with humans.
  const humans = humanParticipants(s);
  const colors = humans.map((p) => s.playerColors?.[p]);
  expect(colors.every(Boolean), where()).toBe(true);
  expect(new Set(colors).size, where()).toBe(colors.length);
  // Views: scores derived from events; nothing secret reaches the TV or the phones.
  const scores = scoresOf(s.events);
  for (const role of ['public', 'player', 'host'] as const) {
    const v = projectState(s, role, {});
    for (const c of v.competitors) expect(c.score, where()).toBe(scores[c.id] ?? 0);
    if (role !== 'host' && s.clue && !s.clue.answerRevealed) {
      expect(v.clue?.answer ?? null, `${role} sees the answer ${where()}`).toBeNull();
      expect(v.clue?.answerMedia ?? [], where()).toEqual([]);
    }
    if (role !== 'host' && s.clue?.isDailyWager && s.clue.stage === 'wager') expect(v.clue?.question ?? null, where()).toBeNull();
    if (s.final && v.final) {
      for (const e of v.final.entries) {
        const shown = finalEntryReveal(s.final, e.competitorId);
        if (shown === 'none') expect(e.wager, `${role} sees a wager early ${where()}`).toBeNull();
        if (shown !== 'answer') expect(e.answer, `${role} sees a Final answer early ${where()}`).toBeNull();
      }
      if (role !== 'host' && s.final.stage !== 'done') expect(v.final.answer, where()).toBeNull();
    }
  }
  // Liveness: whatever the game is waiting on still exists (otherwise the host would be stuck).
  const exists = (id: string | undefined | null) => !id || s.competitors.some((c) => c.id === id);
  expect(exists(s.buzzer.winner?.competitorId), `winner left ${where()}`).toBe(true);
  expect(exists(s.clue?.wager?.competitorId), `Daily Double! wagerer left ${where()}`).toBe(true);
  expect(exists(s.controlCompetitorId), `picker left ${where()}`).toBe(true);
  if (s.final) for (const e of s.final.entries) expect(exists(e.competitorId), `Final entry left ${where()}`).toBe(true);
  if (s.final) {
    expect([...s.final.order].sort(), where()).toEqual(s.final.entries.map((e) => e.competitorId).sort());
    if (s.final.stage === 'reveal') expect(s.final.cursor, where()).toBeLessThan(Math.max(1, s.final.order.length));
  }
  if (s.phase === 'ended') {
    expect(s.results, where()).not.toBeNull();
    const pl = s.results!.map((x) => x.placement);
    expect(pl, where()).toEqual([...pl].sort((a, b) => a - b));
  }
  // Survives being saved and loaded.
  const loaded = normalizeState(JSON.parse(JSON.stringify(s)));
  expect(loaded, where()).toEqual(JSON.parse(JSON.stringify(s)));
  if (s.clue) expect(findClue(s.board, s.clue.clueId), where()).not.toBeNull();
}

describe('randomised play-tests (engine)', () => {
  it('300 random games keep every invariant', () => {
    let finals = 0;
    let ended = 0;
    const games = Number(process.env.FUZZ_GAMES ?? 300);
    for (let seed = 1; seed <= games; seed++) {
      const g = play(seed, 600);
      if (g.s.final) finals++;
      if (g.s.phase === 'ended') ended++;
    }
    // The generator really reaches the interesting parts.
    expect(finals).toBeGreaterThan(50);
    expect(ended).toBeGreaterThan(50);
  }, Number(process.env.FUZZ_TIMEOUT ?? 120_000));
});
