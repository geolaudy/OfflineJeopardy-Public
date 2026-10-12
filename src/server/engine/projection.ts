// Server-side role projections. Secrets (answers, notes, hidden wagers, Daily Wager
// locations) are removed here, before data ever leaves the server.
import { findClue, scoresOf, type GameState, type Id } from '../../shared/game.js';
import type { GameView, PlayerContext, ProfilePublic, ViewRole } from '../../shared/views.js';
import { buzzBlockReason, competitorForProfile } from './engine.js';

export function projectState(s: GameState, role: ViewRole, profiles: Record<Id, ProfilePublic>): GameView {
  const host = role === 'host';
  const scores = scoresOf(s.events);
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
      answerRevealed: s.clue.answerRevealed,
      resolved: s.clue.resolved,
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
      question: host || st === 'clue' || st === 'reveal' || st === 'done' ? (fq?.question ?? '') : null,
      answer: host || st === 'done' ? (fq?.answer ?? '') : null,
      entries: s.final.entries.map((e) => {
        const visible = host || e.judged;
        return {
          competitorId: e.competitorId,
          hasWager: e.wager != null,
          hasAnswer: !!e.answer,
          wager: visible ? e.wager : null,
          answer: visible ? e.answer : null,
          judged: e.judged,
          correct: e.correct,
          profileId: e.profileId,
        };
      }),
    };
  }

  const { lockouts: _l, ...buzzer } = s.buzzer;
  const view: GameView = {
    role,
    id: s.id,
    title: s.title,
    mode: s.mode,
    phase: s.phase,
    paused: s.paused,
    roundIndex: s.roundIndex,
    rules: s.rules,
    rounds,
    competitors: s.competitors.map((c) => ({ ...c, score: scores[c.id] ?? 0 })),
    unassigned: s.unassigned,
    bindings: s.bindings,
    controlCompetitorId: s.controlCompetitorId,
    clue,
    buzzer,
    final,
    timer: s.timer,
    showJoinQr: s.showJoinQr,
    results: s.results,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    profiles,
  };
  if (host) {
    view.undoLabel = s.undoStack.length ? s.undoStack[s.undoStack.length - 1].label : null;
    view.events = s.events.slice(-80);
    const contrib: Record<Id, number> = {};
    for (const e of s.events) {
      if (e.voided || !e.profileId || !e.contributionDelta) continue;
      contrib[e.profileId] = (contrib[e.profileId] ?? 0) + e.contributionDelta;
    }
    view.contributions = contrib;
  }
  return view;
}

export function playerContext(s: GameState, profileId: Id, now: number): PlayerContext {
  const c = competitorForProfile(s, profileId);
  const u = s.unassigned.find((x) => x.profileId === profileId);
  const shared = c?.kind === 'team' && c.buzzerMode === 'shared';
  const reason = !c ? 'not-playing' : shared ? 'shared-team' : buzzBlockReason(s, c.id, profileId, `phone:${profileId}`, now);
  return {
    profileId,
    competitorId: c?.id ?? null,
    pending: !!u?.pending,
    canBuzz: reason === null,
    buzzReason: reason,
    sharedTeam: !!shared,
  };
}
