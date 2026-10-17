// Server-side role projections. Secrets (answers, notes, hidden wagers, Daily Wager
// locations) are removed here, before data ever leaves the server.
import { finalEntryReveal, findClue, livesOf, scoresOf, type BuzzAttempt, type GameState, type Id } from '../../shared/game.js';
import { gapIsConfident } from '../../shared/buzzTiming.js';
import type { GameView, PlayerContext, ProfilePublic, ViewRole } from '../../shared/views.js';
import { buzzBlockReason, competitorForProfile, lockoutUntil, roundMaxValue } from './engine.js';

export function projectState(s: GameState, role: ViewRole, rawProfiles: Record<Id, ProfilePublic>): GameView {
  const host = role === 'host';
  // Everyone sees the lobby colour (R4-13); the profile's own colour stays its preference.
  const profiles: Record<Id, ProfilePublic> = { ...rawProfiles };
  for (const [pid, color] of Object.entries(s.playerColors ?? {})) if (profiles[pid]) profiles[pid] = { ...profiles[pid], color };
  // In a game the nickname is the one chosen for this lobby (R5-17); `name` stays the profile name.
  for (const pid of Object.keys(profiles)) profiles[pid] = { ...profiles[pid], nickname: s.nicknames?.[pid] ?? '' };
  const scores = scoresOf(s.events);
  const lives = livesOf(s);
  const used = new Set(s.usedClueIds);

  const rounds = s.board.rounds.map((r) => ({
    name: r.name,
    kind: r.kind,
    categories: r.categories.map((c) => ({
      id: c.id,
      // Final category names stay hidden from non-hosts until the Final starts.
      name: r.kind === 'final' && !host && s.phase !== 'final' && s.phase !== 'ended' ? '' : c.name,
      clues:
        r.kind === 'final' && !host
          ? []
          : c.clues.map((q) => ({
              id: q.id,
              value: q.value,
              used: used.has(q.id),
              ...(host ? { dailyWager: !!q.dailyWager, question: q.question, answer: q.answer } : {}),
            })),
    })),
  }));

  let clue: GameView['clue'] = null;
  if (s.clue) {
    const f = findClue(s.board, s.clue.clueId);
    const hideQuestion = !host && s.clue.isDailyWager && s.clue.stage === 'wager';
    clue = {
      clueId: s.clue.clueId,
      categoryName: f?.category.name ?? '',
      value: s.clue.value,
      isDailyWager: s.clue.isDailyWager,
      stage: s.clue.stage,
      question: hideQuestion ? null : (f?.clue.question ?? ''),
      answer: host || s.clue.answerRevealed ? (f?.clue.answer ?? '') : null,
      notes: host ? (f?.clue.notes ?? null) : null,
      media: hideQuestion ? [] : (f?.clue.media ?? []),
      wager: s.clue.wager,
      wagerBy: s.clue.wagerBy ?? null,
      pendingWager: s.clue.pendingWager ? { competitorId: s.clue.pendingWager.competitorId, amount: host ? s.clue.pendingWager.amount : null, profileId: s.clue.pendingWager.profileId } : null,
      answerRevealed: s.clue.answerRevealed,
      resolved: s.clue.resolved,
      answeringEnded: s.clue.answeringEnded,
      answerMedia: host || s.clue.answerRevealed ? (f?.clue.answerMedia ?? []) : [],
      layout: f?.clue.layout ?? 'auto',
      unlockMode: s.clue.unlockMode,
      // Where a bot's answer came from is for the host only.
      submission: s.clue.submission ? (host ? s.clue.submission : { competitorId: s.clue.submission.competitorId, answer: s.clue.submission.answer, at: s.clue.submission.at }) : null,
    };
  }

  let final: GameView['final'] = null;
  if (s.final) {
    const round = s.board.rounds[s.final.roundIndex];
    const fc = round.categories[0];
    const fq = fc?.clues[0];
    const st = s.final.stage;
    final = {
      stage: st,
      category: fc?.name ?? '',
      question: host || st === 'clue' || st === 'closed' || st === 'reveal' || st === 'done' ? (fq?.question ?? '') : null,
      answer: host || st === 'done' ? (fq?.answer ?? '') : null,
      order: s.final.order,
      preScores: s.final.preScores,
      cursor: s.final.cursor,
      step: s.final.step,
      // Wagers and answers stay private — from the host too — until their turn in the reveal (R4-2).
      entries: s.final.entries.map((e) => {
        const shown = finalEntryReveal(s.final!, e.competitorId);
        return {
          competitorId: e.competitorId,
          hasWager: e.wager != null,
          hasAnswer: !!e.answer,
          submitted: !!e.submitted && !!e.answer,
          wager: shown !== 'none' ? e.wager : null,
          answer: shown === 'answer' ? e.answer : null,
          judged: e.judged,
          correct: e.correct,
          profileId: e.profileId,
        };
      }),
    };
  }

  const { lockouts: _l, pending: _p, attempts: _a, ...rest } = s.buzzer;
  const buzzer: GameView['buzzer'] = host ? { ...rest, timing: timingRows(s.buzzer.attempts ?? []) } : rest;
  const view: GameView = {
    role,
    id: s.id,
    title: s.title,
    boardId: role === 'host' ? s.boardId : null,
    mode: s.mode,
    phase: s.phase,
    paused: s.paused,
    roundIndex: s.roundIndex,
    rules: s.rules,
    rounds,
    competitors: s.competitors.map((c) => ({ ...c, score: scores[c.id] ?? 0, ...(lives ? { lives: Math.max(0, lives[c.id] ?? 0) } : {}) })),
    unassigned: s.unassigned,
    // Controller ids (e.g. a Joy-Con's Bluetooth address) are for the host only.
    bindings: host ? s.bindings : s.bindings.map((b) => ({ ...b, controllerId: '' })),
    controlCompetitorId: s.controlCompetitorId,
    clue,
    buzzer,
    final,
    timer: s.timer,
    intro: s.intro,
    media: s.media && s.clue && s.media.clueId === s.clue.clueId && (s.media.side === 'clue' || s.clue.answerRevealed || host) ? s.media : null,
    practice: s.practice,
    roomCode: role === 'player' ? null : s.roomCode,
    showJoinQr: s.showJoinQr,
    results: s.results,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    profiles,
  };
  if (host) {
    view.undoLabel = s.undoStack.length ? s.undoStack[s.undoStack.length - 1].label : null;
    // Final wagers stay private until their reveal, also in the host's event history (R4-2).
    view.events = s.events.slice(-80).map((e) => {
      if (!s.final || !e.competitorId || e.result !== 'final') return e;
      const shown = finalEntryReveal(s.final, e.competitorId);
      if (e.type === 'wager' && shown === 'none') return { ...e, wager: undefined };
      if (e.type === 'submission' && shown !== 'answer') return { ...e, note: undefined };
      return e;
    });
    const contrib: Record<Id, number> = {};
    for (const e of s.events) {
      if (e.voided || !e.profileId || !e.contributionDelta) continue;
      contrib[e.profileId] = (contrib[e.profileId] ?? 0) + e.contributionDelta;
    }
    view.contributions = contrib;
  }
  return view;
}

/** R6-23: the presses of the current opening in press order, with each one's gap to the winner. */
function timingRows(attempts: BuzzAttempt[]) {
  const w = attempts.find((x) => x.result === 'won');
  if (!w) return [];
  return [...attempts]
    .sort((a, b) => (a === w ? -1 : b === w ? 1 : a.pressAt - b.pressAt))
    .map((x) => {
      const gapMs = x === w ? 0 : Math.max(0, Math.round(x.pressAt - w.pressAt));
      return { competitorId: x.competitorId, profileId: x.profileId, sourceKind: x.sourceKind, result: x.result, gapMs, confident: x === w || gapIsConfident(gapMs, w, x) };
    });
}

/** R6-23: this phone's own press compared with the winner (or, for the winner, the runner-up).
 *  Only for a player who pressed during the current opening. */
function buzzTimingFor(s: GameState, profileId: Id): PlayerContext['buzzTiming'] {
  const attempts = s.buzzer.attempts ?? [];
  const mine = attempts.find((x) => x.controllerId === `phone:${profileId}`) ?? attempts.find((x) => x.profileId === profileId);
  const w = attempts.find((x) => x.result === 'won');
  if (!mine || !w) return null;
  if (mine.result === 'won') {
    const rival = attempts.filter((x) => x.result === 'late' && x.competitorId !== mine.competitorId).sort((a, b) => a.pressAt - b.pressAt)[0];
    if (!rival) return { result: 'won', otherCompetitorId: null, otherProfileId: null, gapMs: null, confident: false, teammateWon: false };
    const gapMs = Math.max(0, Math.round(rival.pressAt - mine.pressAt));
    return { result: 'won', otherCompetitorId: rival.competitorId, otherProfileId: rival.profileId, gapMs, confident: gapIsConfident(gapMs, mine, rival), teammateWon: false };
  }
  const gapMs = Math.max(0, Math.round(mine.pressAt - w.pressAt));
  return { result: 'late', otherCompetitorId: w.competitorId, otherProfileId: w.profileId, gapMs, confident: gapIsConfident(gapMs, w, mine), teammateWon: w.competitorId === mine.competitorId };
}

export function playerContext(s: GameState, profileId: Id, now: number): PlayerContext {
  const c = competitorForProfile(s, profileId);
  const u = s.unassigned.find((x) => x.profileId === profileId);
  const shared = c?.kind === 'team' && c.buzzerMode === 'shared';
  const reason = !c ? 'not-playing' : shared ? 'shared-team' : buzzBlockReason(s, c.id, profileId, now);
  const until = c && !shared ? lockoutUntil(s, c.id, profileId) : 0;
  return {
    profileId,
    competitorId: c?.id ?? null,
    pending: !!u?.pending,
    canBuzz: reason === null,
    canPress: reason === null || reason === 'locked',
    buzzReason: reason,
    sharedTeam: !!shared,
    lockedUntil: until > now ? until : null,
    // Lobby colour (R4-13): when the preferred colour was taken the phone offers the free ones.
    color: s.playerColors?.[profileId]
      ? {
          current: s.playerColors[profileId],
          choose: !!s.colorPrompts?.includes(profileId),
          taken: Object.entries(s.playerColors)
            .filter(([p]) => p !== profileId)
            .map(([, c]) => c)
            .concat(s.competitors.filter((x) => x.bot).map((x) => x.color.toLowerCase())),
        }
      : null,
    // The player's own (team's) Final submission, so a reconnecting phone shows what was sent.
    final: c && s.final ? (() => {
      const e = s.final!.entries.find((x) => x.competitorId === c.id);
      return e ? { wager: e.wager, answer: e.answer, submitted: !!e.submitted && !!e.answer, draft: e.draft ?? null } : null;
    })() : null,
    buzzTiming: s.phase === 'clue' ? buzzTimingFor(s, profileId) : null,
    dailyWager: c && s.phase === 'clue' && s.clue?.isDailyWager && s.clue.stage === 'wager' && s.clue.wagerBy === c.id ? (() => {
      const p = s.clue!.pendingWager;
      return { min: s.rules.dailyWagerMin, max: Math.max(scoresOf(s.events)[c.id] ?? 0, roundMaxValue(s)), pending: p?.amount ?? null, pendingBy: p?.profileId ?? null, mine: !p || !p.profileId || p.profileId === profileId };
    })() : null,
  };
}
