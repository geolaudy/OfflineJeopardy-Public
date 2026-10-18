// Round 9 engine rules: Final Jeopardy! pictures and sounds (R9-6) — clue media shows with the clue,
// correct-response media only once the correct response is shown, sound playback is authoritative
// and cleaned up, a sound clue plays before the think time, and scoring is unchanged.
import { describe, expect, it } from 'vitest';
import { applyAction, createGame, normalizeState, type EngineCtx } from '../../src/server/engine/engine';
import { resolveInput } from '../../src/server/engine/buzzer';
import { projectState } from '../../src/server/engine/projection';
import { DEFAULT_RULES, type BoardContent, type Clue, type GameState, type MediaRef } from '../../src/shared/game';
import type { EngineAction } from '../../src/shared/actions';
import { SAMPLE_BOARD } from '../../src/shared/sampleBoards';
import { clueComplete, validateBoard } from '../../src/shared/boardUtils';

let clock = 9_000_000;
let ids = 0;
const ctx = (actor?: string): EngineCtx => ({ now: clock, newId: () => `r9id${++ids}`, actor });

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
const pub = (s: GameState) => projectState(s, 'public', {});
const host = (s: GameState) => projectState(s, 'host', {});

const IMG: MediaRef = { kind: 'image', url: '/media/map.png', caption: 'Look closely' };
const SND: MediaRef = { kind: 'audio', url: '/media/anthem.mp3' };
const ANS_IMG: MediaRef = { kind: 'image', url: '/media/budapest.png' };
const ANS_SND: MediaRef = { kind: 'audio', url: '/media/answer.mp3' };

/** The sample board with its Final clue changed. */
function boardWith(final: Partial<Clue>): BoardContent {
  const b = structuredClone(SAMPLE_BOARD);
  const fr = b.rounds.find((r) => r.kind === 'final')!;
  Object.assign(fr.categories[0].clues[0], final);
  return b;
}

/** Both players score, then the Final starts with the given clue. */
function toFinal(final: Partial<Clue>) {
  let s = createGame({ id: 'g9', title: 'T', boardId: 'b1', board: boardWith(final), mode: 'solo', rules: { ...DEFAULT_RULES }, now: clock });
  for (const p of ['alex', 'jordan']) s = act(s, { type: 'addPlayer', profileId: p });
  s = run(s, { type: 'startGame' }, { type: 'introSkip' }, { type: 'selectClue', clueId: 'hist_5' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'alex');
  s = run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'selectClue', clueId: 'geo_3' }, { type: 'unlockBuzzers' });
  s = buzz(s, 'jordan');
  return run(s, { type: 'judge', result: 'correct' }, { type: 'closeClue' }, { type: 'startFinal' });
}
const wager = (s: GameState, p: string, amount: number) => act(s, { type: 'setFinalWager', competitorId: cid(s, p), amount }, `profile:${p}`);
const answer = (s: GameState, p: string, text: string) => act(s, { type: 'setFinalAnswer', competitorId: cid(s, p), answer: text }, `profile:${p}`);
/** Category → wagers (both wager 100) → clue on the TV. */
const toClue = (final: Partial<Clue>) => run(wager(wager(run(toFinal(final), { type: 'finalNext' }), 'alex', 100), 'jordan', 100), { type: 'finalNext' });
/** … answers written and closed, every reveal step done and judged → the correct response. */
function toDone(s: GameState) {
  s = answer(answer(s, 'alex', 'Budapest'), 'jordan', 'Vienna');
  s = run(s, { type: 'finalNext' }, { type: 'finalNext' });
  for (let i = 0; i < 2; i++) {
    const id = s.final!.order[s.final!.cursor];
    s = run(s, { type: 'finalReveal' }, { type: 'finalReveal' }, { type: 'judgeFinal', competitorId: id, correct: id === cid(s, 'alex') }, { type: 'finalReveal' });
  }
  return s;
}
const playClue = (s: GameState) => act(s, { type: 'mediaPlay', clueId: 'final_1', side: 'clue', index: 0, durationMs: 4000 });

describe('Final Jeopardy! clue media (R9-6.1, 6.2)', () => {
  it('text-only clue: unchanged — the think time starts with the clue, no media anywhere', () => {
    const s = toClue({});
    expect(s.final).toMatchObject({ stage: 'clue', thinking: true });
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
    expect(pub(s).final).toMatchObject({ clueId: 'final_1', media: [], answerMedia: [], thinking: true });
  });

  it('image-only clue: hidden from the TV until the clue, then shown; the think time starts at once', () => {
    let s = run(toFinal({ question: '', media: [IMG] }), { type: 'finalNext' });
    expect(pub(s).final?.media).toEqual([]);
    expect(pub(s).final?.question).toBeNull();
    expect(host(s).final?.media).toEqual([IMG]); // the host may read ahead
    s = run(s, { type: 'finalNext' });
    expect(pub(s).final).toMatchObject({ question: '', media: [IMG], thinking: true });
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
    // An image is not something to play.
    expect(attempt(s, { type: 'mediaPlay', clueId: 'final_1', side: 'clue', index: 0 }).ok).toBe(false);
  });

  it('text and image clue: both public with the clue', () => {
    const s = toClue({ media: [IMG] });
    expect(pub(s).final).toMatchObject({ question: expect.stringContaining('Danube'), media: [IMG] });
  });
});

describe('Final Jeopardy! clue sound (R9-6.4)', () => {
  it('a sound clue plays first; the think time begins when it ends', () => {
    let s = toClue({ question: '', media: [SND] });
    expect(s.final?.thinking).toBe(false);
    expect(s.timer).toBeNull();
    expect(pub(s).final?.thinking).toBe(false);
    s = playClue(s);
    expect(pub(s).media).toMatchObject({ clueId: 'final_1', side: 'clue', status: 'playing' });
    // Answers may be written meanwhile.
    s = answer(s, 'alex', 'Budapest');
    clock += 4000;
    s = act(s, { type: 'mediaEnded', clueId: 'final_1' }, 'media');
    expect(s.media?.status).toBe('ended');
    expect(s.final?.thinking).toBe(true);
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
  });

  it('text and sound clue: the host can start the think time early; playing on is still allowed', () => {
    let s = playClue(toClue({ media: [SND] }));
    s = act(s, { type: 'finalStartThink' });
    expect(s.final?.thinking).toBe(true);
    expect(s.timer).toMatchObject({ kind: 'final', running: true });
    expect(s.media?.status).toBe('playing');
    expect(attempt(s, { type: 'finalStartThink' })).toMatchObject({ ok: true, ignored: true });
  });

  it('pause, resume and restart are one playback (never a second copy), and the position is kept', () => {
    let s = playClue(toClue({ media: [SND] }));
    clock += 1500;
    s = act(s, { type: 'mediaPause' });
    expect(s.media).toMatchObject({ status: 'paused', positionMs: 1500 });
    clock += 5000;
    s = playClue(s); // Resume
    expect(s.media).toMatchObject({ status: 'playing', positionMs: 1500, startedAt: clock });
    s = playClue(s); // a repeated Play while playing continues where it is
    expect(s.media).toMatchObject({ status: 'playing', positionMs: 1500 });
    s = act(s, { type: 'mediaRestart' });
    expect(s.media).toMatchObject({ status: 'playing', positionMs: 0 });
  });

  it('no playback before the clue is on the TV; playback stops when the reveals begin, after Undo and at the end', () => {
    let s = run(toFinal({ media: [SND] }), { type: 'finalNext' });
    expect(attempt(s, { type: 'mediaPlay', clueId: 'final_1', side: 'clue', index: 0 }).ok).toBe(false);
    s = playClue(run(wager(wager(s, 'alex', 100), 'jordan', 100), { type: 'finalNext' }));
    // Undo back into wagering: the clue leaves the TV, so does its sound.
    const undone = run(s, { type: 'undo' });
    expect(undone.final?.stage).toBe('wagers');
    expect(undone.media).toBeNull();
    // Answers closed: the clue is still on the TV, the sound may go on.
    s = run(s, { type: 'finalNext' });
    expect(s.final?.stage).toBe('closed');
    expect(s.media?.status).toBe('playing');
    s = run(s, { type: 'finalNext' });
    expect(s.final?.stage).toBe('reveal');
    expect(s.media).toBeNull();
    expect(attempt(s, { type: 'mediaPlay', clueId: 'final_1', side: 'clue', index: 0 }).ok).toBe(false);
  });

  it('a stale command for another clue is ignored', () => {
    const s = toClue({ media: [SND] });
    expect(attempt(s, { type: 'mediaPlay', clueId: 'hist_5', side: 'clue', index: 0 })).toMatchObject({ ok: true, ignored: true });
  });
});

describe('Final Jeopardy! correct-response media (R9-6.3, 6.5)', () => {
  it('image-only correct response: private to the host until the correct response is shown', () => {
    let s = toClue({ answer: '', answerMedia: [ANS_IMG] });
    expect(pub(s).final).toMatchObject({ answer: null, answerMedia: [] });
    expect(host(s).final).toMatchObject({ answer: '', answerMedia: [ANS_IMG] });
    s = answer(answer(s, 'alex', 'Budapest'), 'jordan', 'Vienna');
    s = run(s, { type: 'finalNext' }, { type: 'finalNext' });
    // During the reveals the contestants' answers show, never the official one.
    const id = s.final!.order[0];
    s = run(s, { type: 'finalReveal' }, { type: 'finalReveal' });
    expect(pub(s).final?.entries.find((e) => e.competitorId === id)?.answer).toBeTruthy();
    expect(pub(s).final).toMatchObject({ answer: null, answerMedia: [] });
  });

  it('text and image correct response: both public once shown', () => {
    const s = toDone(toClue({ answerMedia: [ANS_IMG] }));
    expect(s.final?.stage).toBe('done');
    expect(pub(s).final).toMatchObject({ answer: 'Budapest', answerMedia: [ANS_IMG] });
  });

  it('correct-response sound: playable only once shown, never automatically, and its playback is public then', () => {
    let s = toClue({ answerMedia: [ANS_SND] });
    expect(attempt(s, { type: 'mediaPlay', clueId: 'final_1', side: 'answer', index: 0 }).ok).toBe(false);
    s = toDone(s);
    expect(s.media).toBeNull(); // nothing plays by itself
    s = act(s, { type: 'mediaPlay', clueId: 'final_1', side: 'answer', index: 0, durationMs: 3000 });
    expect(pub(s).media).toMatchObject({ side: 'answer', status: 'playing' });
    s = run(s, { type: 'endGame' });
    expect(s.media).toBeNull();
  });

  it('scores and transitions are the same with media as without', () => {
    const plain = toDone(toClue({}));
    const withMedia = toDone(toClue({ question: '', media: [IMG, SND], answerMedia: [ANS_IMG, ANS_SND] }));
    const scores = (s: GameState) => pub(s).competitors.map((c) => c.score);
    expect(scores(withMedia)).toEqual(scores(plain));
    expect(withMedia.final?.entries.map((e) => [e.judged, e.correct])).toEqual(plain.final?.entries.map((e) => [e.judged, e.correct]));
    expect(run(withMedia, { type: 'endGame' }).phase).toBe('ended');
  });
});

describe('saved games and boards (R9-6.9)', () => {
  it('a Final saved before round 9 keeps its think time running', () => {
    const s = toClue({});
    const old = structuredClone(s) as GameState;
    delete (old.final as Partial<typeof old.final>)!.thinking;
    expect(normalizeState(old).final?.thinking).toBe(true);
  });

  it('a picture or sound answer counts as an answer for board checks', () => {
    expect(clueComplete({ question: 'Q', answer: '', answerMedia: [ANS_IMG] })).toBe(true);
    expect(clueComplete({ question: 'Q', answer: '' })).toBe(false);
    const issues = validateBoard(boardWith({ question: '', answer: '', media: [IMG], answerMedia: [ANS_IMG] }));
    expect(issues.filter((i) => /World Capitals/.test(i.message))).toEqual([]);
  });
});
