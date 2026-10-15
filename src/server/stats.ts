// Statistics derived exclusively from authoritative, non-voided gameplay events of
// completed games. Solo statistics, individual contributions in team games and team
// statistics are computed separately and never merged into one average.
import type { DB } from './db/db.js';
import { listTeams } from './repos.js';
import * as repo from './repos.js';
import type { TeamLeaderRow } from '../shared/leaderboard.js';
import type { PersonSummary } from '../shared/presentation.js';

const COMPLETED = `g.status = 'completed'`;
/** Games that count in statistics: completed and not marked as practice. */
const COUNTED = `g.status = 'completed' AND g.practice = 0`;

interface AnswerAgg {
  correct: number;
  incorrect: number;
  accuracy: number | null;
  pointsEarned: number;
  pointsLost: number;
}

function answerAgg(rows: { result: string; delta: number }[]): AnswerAgg {
  let correct = 0;
  let incorrect = 0;
  let earned = 0;
  let lost = 0;
  for (const r of rows) {
    if (r.result === 'correct') correct++;
    else if (r.result === 'incorrect') incorrect++;
    if (r.delta > 0) earned += r.delta;
    else lost += -r.delta;
  }
  return { correct, incorrect, accuracy: correct + incorrect ? correct / (correct + incorrect) : null, pointsEarned: earned, pointsLost: lost };
}

export interface CategoryPerf {
  category: string;
  correct: number;
  incorrect: number;
  accuracy: number | null;
  points: number;
}

function categoryPerf(rows: { category: string; result: string; delta: number }[]): CategoryPerf[] {
  const map = new Map<string, { label: string; correct: number; incorrect: number; points: number }>();
  for (const r of rows) {
    // Normalise only case and surrounding whitespace; different names stay different categories.
    const key = r.category.trim().toLowerCase();
    const m = map.get(key) ?? { label: r.category.trim(), correct: 0, incorrect: 0, points: 0 };
    if (r.result === 'correct') m.correct++;
    else if (r.result === 'incorrect') m.incorrect++;
    m.points += r.delta;
    map.set(key, m);
  }
  return [...map.values()]
    .map((m) => ({ category: m.label, correct: m.correct, incorrect: m.incorrect, points: m.points, accuracy: m.correct + m.incorrect ? m.correct / (m.correct + m.incorrect) : null }))
    .sort((a, b) => b.correct + b.incorrect - (a.correct + a.incorrect));
}

function gamesAgg(rows: { final_score: number | null; is_winner: number | null }[]) {
  const scores = rows.map((r) => r.final_score ?? 0);
  const wins = rows.filter((r) => r.is_winner).length;
  return {
    played: rows.length,
    wins,
    losses: rows.length - wins,
    winRate: rows.length ? wins / rows.length : null,
    averageScore: rows.length ? Math.round(scores.reduce((a, b) => a + b, 0) / rows.length) : null,
    highestScore: rows.length ? Math.max(...scores) : null,
    lowestScore: rows.length ? Math.min(...scores) : null,
    totalScore: scores.reduce((a, b) => a + b, 0),
  };
}

export function profileStats(db: DB, profileId: string) {
  // --- games, split by competitor kind (solo vs team)
  const games = db
    .prepare(
      `SELECT gc.kind, gc.final_score, gc.is_winner FROM game_participants gp
       JOIN game_competitors gc ON gc.game_id = gp.game_id AND gc.competitor_id = gp.competitor_id
       JOIN games g ON g.id = gp.game_id WHERE gp.profile_id = ? AND ${COUNTED}`,
    )
    .all(profileId) as { kind: string; final_score: number | null; is_winner: number | null }[];

  // --- answers personally given (solo: delta = score change; team: delta = contribution)
  const answers = db
    .prepare(
      `SELECT gc.kind, e.result, e.score_delta, e.contribution_delta, e.wager, e.note, c.category_name AS category
       FROM gameplay_events e JOIN games g ON g.id = e.game_id
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       LEFT JOIN game_clues c ON c.game_id = e.game_id AND c.clue_id = e.clue_id
       WHERE e.type = 'answer' AND e.voided = 0 AND e.profile_id = ? AND ${COUNTED}`,
    )
    .all(profileId) as { kind: string; result: string; score_delta: number; contribution_delta: number; wager: number | null; note: string | null; category: string | null }[];

  const buzzes = db
    .prepare(
      `SELECT gc.kind, e.result, e.reaction_ms, e.score_delta FROM gameplay_events e JOIN games g ON g.id = e.game_id
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       WHERE e.type = 'buzz' AND e.voided = 0 AND e.profile_id = ? AND ${COUNTED}`,
    )
    .all(profileId) as { kind: string; result: string; reaction_ms: number | null; score_delta: number }[];

  const buzzAgg = (kind: string) => {
    const b = buzzes.filter((x) => x.kind === kind && x.result !== 'early');
    const won = b.filter((x) => x.result === 'won');
    const reactions = won.map((x) => x.reaction_ms).filter((x): x is number => x != null);
    return {
      attempts: b.length,
      successful: won.length,
      early: buzzes.filter((x) => x.kind === kind && x.result === 'early').length,
      earlyPenaltyPoints: -buzzes.filter((x) => x.kind === kind && x.result === 'early').reduce((a, x) => a + (x.score_delta ?? 0), 0),
      averageReactionMs: reactions.length ? Math.round(reactions.reduce((a, c) => a + c, 0) / reactions.length) : null,
    };
  };

  const wagerAgg = (rows: typeof answers, kind: 'daily' | 'final') => {
    const w = rows.filter((a) => a.wager != null && (kind === 'final' ? a.note === 'final' : a.note !== 'final'));
    return { attempted: w.length, won: w.filter((a) => a.result === 'correct').length, lost: w.filter((a) => a.result === 'incorrect').length };
  };

  const solo = answers.filter((a) => a.kind === 'player');
  const team = answers.filter((a) => a.kind === 'team');
  const soloGames = gamesAgg(games.filter((g) => g.kind === 'player'));
  const teamGames = gamesAgg(games.filter((g) => g.kind === 'team'));
  const teamAnswers = answerAgg(team.map((a) => ({ result: a.result, delta: a.contribution_delta })));

  return {
    solo: {
      games: soloGames,
      answers: answerAgg(solo.map((a) => ({ result: a.result, delta: a.score_delta }))),
      buzzer: buzzAgg('player'),
      dailyWagers: wagerAgg(solo, 'daily'),
      finalWagers: wagerAgg(solo, 'final'),
      categories: categoryPerf(solo.map((a) => ({ category: a.category ?? 'Unknown', result: a.result, delta: a.score_delta }))),
    },
    team: {
      games: { played: teamGames.played, wins: teamGames.wins, losses: teamGames.losses, winRate: teamGames.winRate },
      contribution: {
        correct: teamAnswers.correct,
        incorrect: teamAnswers.incorrect,
        accuracy: teamAnswers.accuracy,
        pointsEarned: teamAnswers.pointsEarned,
        pointsLost: teamAnswers.pointsLost,
        net: teamAnswers.pointsEarned - teamAnswers.pointsLost,
      },
      buzzer: buzzAgg('team'),
      dailyWagers: wagerAgg(team, 'daily'),
      finalWagers: wagerAgg(team, 'final'),
      categories: categoryPerf(team.map((a) => ({ category: a.category ?? 'Unknown', result: a.result, delta: a.contribution_delta }))),
    },
    combined: {
      gamesPlayed: games.length,
      wins: games.filter((g) => g.is_winner).length,
      correct: answers.filter((a) => a.result === 'correct').length,
      incorrect: answers.filter((a) => a.result === 'incorrect').length,
    },
  };
}

export function teamStats(db: DB, teamId: string) {
  const games = db
    .prepare(`SELECT gc.game_id, gc.competitor_id, gc.final_score, gc.is_winner FROM game_competitors gc JOIN games g ON g.id = gc.game_id WHERE gc.team_id = ? AND ${COUNTED}`)
    .all(teamId) as { game_id: string; competitor_id: string; final_score: number | null; is_winner: number | null }[];
  const answers = db
    .prepare(
      `SELECT e.result, e.score_delta, e.wager, e.note, e.profile_id, c.category_name AS category FROM gameplay_events e
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       JOIN games g ON g.id = e.game_id LEFT JOIN game_clues c ON c.game_id = e.game_id AND c.clue_id = e.clue_id
       WHERE gc.team_id = ? AND e.type = 'answer' AND e.voided = 0 AND ${COUNTED}`,
    )
    .all(teamId) as { result: string; score_delta: number; wager: number | null; note: string | null; profile_id: string | null; category: string | null }[];
  const buzzes = db
    .prepare(
      `SELECT e.result, e.reaction_ms FROM gameplay_events e JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       JOIN games g ON g.id = e.game_id WHERE gc.team_id = ? AND e.type = 'buzz' AND e.voided = 0 AND ${COUNTED}`,
    )
    .all(teamId) as { result: string; reaction_ms: number | null }[];
  const wagers = answers.filter((a) => a.wager != null);
  const reactions = buzzes.filter((b) => b.result === 'won' && b.reaction_ms != null).map((b) => b.reaction_ms!);
  return {
    games: gamesAgg(games),
    answers: answerAgg(answers.map((a) => ({ result: a.result, delta: a.score_delta }))),
    unattributedAnswers: answers.filter((a) => !a.profile_id).length,
    buzzer: {
      attempts: buzzes.filter((b) => b.result !== 'early').length,
      successful: buzzes.filter((b) => b.result === 'won').length,
      averageReactionMs: reactions.length ? Math.round(reactions.reduce((a, c) => a + c, 0) / reactions.length) : null,
    },
    wagers: {
      attempted: wagers.length,
      won: wagers.filter((w) => w.result === 'correct').length,
      lost: wagers.filter((w) => w.result === 'incorrect').length,
      net: wagers.reduce((a, w) => a + w.score_delta, 0),
    },
    categories: categoryPerf(answers.map((a) => ({ category: a.category ?? 'Unknown', result: a.result, delta: a.score_delta }))),
  };
}

export function profileHistory(db: DB, profileId: string) {
  const rows = db
    .prepare(
      `SELECT g.id, g.title, g.mode, g.practice, g.started_at AS startedAt, g.ended_at AS endedAt, gc.name_snapshot AS competitorName, gc.kind,
         gc.final_score AS finalScore, gc.placement, gc.is_winner AS isWinner,
         (SELECT COUNT(*) FROM game_competitors x WHERE x.game_id = g.id) AS competitorCount,
         (SELECT GROUP_CONCAT(x.name_snapshot, ', ') FROM game_competitors x WHERE x.game_id = g.id AND x.is_winner = 1) AS winners,
         (SELECT COUNT(*) FROM gameplay_events e WHERE e.game_id = g.id AND e.profile_id = gp.profile_id AND e.type = 'answer' AND e.voided = 0 AND e.result = 'correct') AS correct,
         (SELECT COUNT(*) FROM gameplay_events e WHERE e.game_id = g.id AND e.profile_id = gp.profile_id AND e.type = 'answer' AND e.voided = 0 AND e.result = 'incorrect') AS incorrect
       FROM game_participants gp JOIN games g ON g.id = gp.game_id
       JOIN game_competitors gc ON gc.game_id = gp.game_id AND gc.competitor_id = gp.competitor_id
       WHERE gp.profile_id = ? AND ${COMPLETED} ORDER BY g.ended_at DESC`,
    )
    .all(profileId) as Record<string, unknown>[];
  return rows.map((r) => ({ ...r, practice: !!r.practice, isWinner: !!r.isWinner, durationMs: r.endedAt && r.startedAt ? (r.endedAt as number) - (r.startedAt as number) : null }));
}

export function listHistory(db: DB) {
  return db
    .prepare(
      `SELECT g.id, g.title, g.mode, g.practice, g.started_at AS startedAt, g.ended_at AS endedAt,
         (SELECT GROUP_CONCAT(x.name_snapshot, ', ') FROM game_competitors x WHERE x.game_id = g.id AND x.is_winner = 1) AS winners,
         (SELECT COUNT(*) FROM game_competitors x WHERE x.game_id = g.id) AS competitorCount
       FROM games g WHERE ${COMPLETED} ORDER BY g.ended_at DESC`,
    )
    .all();
}

export function isParticipant(db: DB, gameId: string, profileId: string) {
  return !!db.prepare('SELECT 1 FROM game_participants WHERE game_id = ? AND profile_id = ?').get(gameId, profileId);
}

/** Full historical record of one game built only from snapshots + events. */
export function gameDetail(db: DB, gameId: string) {
  const game = db.prepare('SELECT id, title, mode, status, started_at AS startedAt, ended_at AS endedAt, board_id AS boardId FROM games WHERE id = ?').get(gameId) as
    | Record<string, unknown>
    | undefined;
  if (!game) return null;
  const competitors = db
    .prepare(
      `SELECT competitor_id AS id, kind, team_id AS teamId, profile_id AS profileId, name_snapshot AS name, color, buzzer_mode AS buzzerMode,
        final_score AS finalScore, placement, is_winner AS isWinner FROM game_competitors WHERE game_id = ? ORDER BY placement, name_snapshot`,
    )
    .all(gameId) as Record<string, unknown>[];
  const members = db.prepare('SELECT profile_id AS profileId, competitor_id AS competitorId, name_snapshot AS name FROM game_participants WHERE game_id = ?').all(gameId) as {
    profileId: string;
    competitorId: string;
    name: string;
  }[];
  const clues = db
    .prepare(
      `SELECT clue_id AS clueId, round_index AS roundIndex, round_name AS roundName, round_kind AS roundKind, category_name AS category, value, question, answer, daily_wager AS dailyWager
       FROM game_clues WHERE game_id = ? ORDER BY round_index, category_name, value`,
    )
    .all(gameId);
  const events = db
    .prepare(
      `SELECT id, seq, type, at, clue_id AS clueId, competitor_id AS competitorId, profile_id AS profileId, source_kind AS sourceKind, result,
        score_delta AS scoreDelta, contribution_delta AS contributionDelta, wager, reaction_ms AS reactionMs, note, voided, corrects_event_id AS correctsEventId
       FROM gameplay_events WHERE game_id = ? ORDER BY seq`,
    )
    .all(gameId) as Record<string, unknown>[];
  return {
    ...game,
    competitors: competitors.map((c) => ({ ...c, isWinner: !!c.isWinner, members: members.filter((m) => m.competitorId === c.id) })),
    clues,
    events: events.map((e) => ({ ...e, voided: !!e.voided })),
  };
}

/** Leaderboard rows for every profile whose statistics are public. Solo games, team games and
 *  individual contributions in team games are returned as separate groups — the client ranks
 *  within one group at a time and never mixes them. */
export function leaderboard(db: DB, opts: { includePrivate?: boolean } = {}) {
  const profiles = db
    .prepare(`SELECT id, display_name AS name, nickname, color, avatar, picture_file AS pictureFile, picture_off AS pictureOff FROM profiles WHERE deleted_at IS NULL${opts.includePrivate ? '' : ' AND stats_private = 0'}`)
    .all() as { id: string; name: string; nickname: string; color: string; avatar: string; pictureFile: string | null; pictureOff: number }[];
  return profiles.map((p) => {
    const st = profileStats(db, p.id);
    return {
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      color: p.color,
      avatar: p.avatar,
      pictureUrl: p.pictureFile && !p.pictureOff ? `/media/profiles/${p.pictureFile}` : null,
      solo: {
        games: st.solo.games.played,
        wins: st.solo.games.wins,
        winRate: st.solo.games.winRate,
        averageScore: st.solo.games.averageScore,
        highestScore: st.solo.games.highestScore,
        correct: st.solo.answers.correct,
        incorrect: st.solo.answers.incorrect,
        accuracy: st.solo.answers.accuracy,
        earned: st.solo.answers.pointsEarned,
      },
      team: {
        games: st.team.games.played,
        wins: st.team.games.wins,
        winRate: st.team.games.winRate,
      },
      contribution: {
        games: st.team.games.played,
        correct: st.team.contribution.correct,
        incorrect: st.team.contribution.incorrect,
        accuracy: st.team.contribution.accuracy,
        earned: st.team.contribution.pointsEarned,
        net: st.team.contribution.net,
      },
      // Kept for older dashboard code: totals across solo and team games (counts only, no averages).
      games: st.combined.gamesPlayed,
      wins: st.combined.wins,
      correct: st.combined.correct,
      incorrect: st.combined.incorrect,
      accuracy: st.combined.correct + st.combined.incorrect ? st.combined.correct / (st.combined.correct + st.combined.incorrect) : null,
    };
  });
}

/**
 * Short history for lobby cards (R3-6): finished, non-practice games split into solo and team
 * results (a team win is never counted as a solo win) and the current winning streak across both.
 * Players who keep their statistics private get `private: true` and no numbers.
 */
export function lobbySummaries(db: DB, profileIds: string[]): Record<string, PersonSummary> {
  const out: Record<string, PersonSummary> = {};
  if (!profileIds.length) return out;
  const marks = profileIds.map(() => '?').join(',');
  const priv = new Set((db.prepare(`SELECT id FROM profiles WHERE stats_private = 1 AND id IN (${marks})`).all(...profileIds) as { id: string }[]).map((r) => r.id));
  const rows = db
    .prepare(
      `SELECT gp.profile_id AS id, gc.kind, gc.is_winner AS won FROM game_participants gp
       JOIN game_competitors gc ON gc.game_id = gp.game_id AND gc.competitor_id = gp.competitor_id
       JOIN games g ON g.id = gp.game_id WHERE gp.profile_id IN (${marks}) AND ${COUNTED}
       ORDER BY g.ended_at DESC`,
    )
    .all(...profileIds) as { id: string; kind: string; won: number | null }[];
  for (const id of profileIds) out[id] = priv.has(id) ? { private: true, games: 0, wins: 0, soloGames: 0, soloWins: 0, teamGames: 0, teamWins: 0, streak: 0 } : { private: false, games: 0, wins: 0, soloGames: 0, soloWins: 0, teamGames: 0, teamWins: 0, streak: 0 };
  const streakOpen = new Set(profileIds);
  for (const r of rows) {
    const s = out[r.id];
    if (!s || s.private) continue;
    const won = !!r.won;
    s.games++;
    if (r.kind === 'team') {
      s.teamGames++;
      if (won) s.teamWins++;
    } else {
      s.soloGames++;
      if (won) s.soloWins++;
    }
    if (won) s.wins++;
    if (streakOpen.has(r.id)) {
      if (won) s.streak++;
      else streakOpen.delete(r.id);
    }
  }
  return out;
}

/** Saved teams with their own team statistics (team points, not members' contributions). */
export function teamLeaderboard(db: DB): TeamLeaderRow[] {
  return listTeams(db).map((t) => {
    const st = teamStats(db, t.id);
    return {
      id: t.id,
      name: t.name,
      color: t.color,
      avatar: t.avatar,
      members: t.memberIds.length,
      games: st.games.played,
      wins: st.games.wins,
      winRate: st.games.winRate,
      averageScore: st.games.averageScore,
      correct: st.answers.correct,
      incorrect: st.answers.incorrect,
      accuracy: st.answers.accuracy,
    };
  });
}

// ---------- CSV export (host) ----------

function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v == null) return '';
    const s = String(v);
    // Quote when needed; prefix formula-like text so spreadsheets never execute it.
    const safe = /^[=+\-@\t\r]/.test(s) && typeof v === 'string' ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const ratio = (n: number | null) => (n == null ? '' : (Math.round(n * 1000) / 10).toFixed(1));

/** One row per player; solo, team and contribution columns are kept in separate groups. */
export function playersCsv(db: DB) {
  const rows = leaderboard(db, { includePrivate: true });
  return csv([
    ['player', 'nickname', 'solo_games', 'solo_wins', 'solo_win_pct', 'solo_avg_score', 'solo_high_score', 'solo_correct', 'solo_incorrect', 'solo_accuracy_pct',
      'team_games', 'team_wins', 'team_win_pct', 'contrib_correct', 'contrib_incorrect', 'contrib_accuracy_pct', 'contrib_points_earned', 'contrib_net'],
    ...rows.map((r) => [
      r.name, r.nickname, r.solo.games, r.solo.wins, ratio(r.solo.winRate), r.solo.averageScore, r.solo.highestScore, r.solo.correct, r.solo.incorrect, ratio(r.solo.accuracy),
      r.team.games, r.team.wins, ratio(r.team.winRate), r.contribution.correct, r.contribution.incorrect, ratio(r.contribution.accuracy), r.contribution.earned, r.contribution.net,
    ]),
  ]);
}

/** One row per competitor per completed game (historical names). */
export function gamesCsv(db: DB) {
  const rows = db
    .prepare(
      `SELECT g.title, g.mode, g.ended_at AS endedAt, gc.name_snapshot AS name, gc.kind, gc.final_score AS score, gc.placement, gc.is_winner AS winner,
         (SELECT GROUP_CONCAT(gp.name_snapshot, ' / ') FROM game_participants gp WHERE gp.game_id = g.id AND gp.competitor_id = gc.competitor_id) AS members
       FROM game_competitors gc JOIN games g ON g.id = gc.game_id WHERE ${COMPLETED} ORDER BY g.ended_at, gc.placement`,
    )
    .all() as { title: string; mode: string; endedAt: number; name: string; kind: string; score: number | null; placement: number | null; winner: number | null; members: string | null }[];
  return csv([
    ['game', 'mode', 'ended_at', 'competitor', 'kind', 'members', 'final_score', 'placement', 'winner'],
    ...rows.map((r) => [r.title, r.mode, new Date(r.endedAt).toISOString(), r.name, r.kind, r.members, r.score, r.placement, r.winner ? 'yes' : 'no']),
  ]);
}

// ---------- head to head (T10) ----------

export interface HeadToHead {
  /** Counted games where both played on different sides. */
  opponents: { games: number; aAhead: number; bAhead: number; tied: number };
  /** Counted team games where both played on the same team. */
  teammates: { games: number; wins: number };
  recent: { gameId: string; title: string; endedAt: number | null; together: boolean; aPlace: number | null; bPlace: number | null; aScore: number; bScore: number; won: 'a' | 'b' | 'both' | 'none' }[];
}

/** One side of a comparison (T10): public profile + headline numbers, or why it cannot be shown. */
export function compareSide(db: DB, id: string, allowPrivate: boolean) {
  const p = repo.getProfile(db, id);
  if (!p || p.deleted_at) return { ok: false as const, error: 'Profile not found', code: 404 };
  if (!allowPrivate && p.stats_private) return { ok: false as const, error: `${repo.toPublic(p).name} keeps their statistics private`, code: 403 };
  const st = profileStats(db, id);
  const c = st.combined;
  return {
    ok: true as const,
    profile: repo.toPublic(p),
    summary: {
      games: c.gamesPlayed,
      wins: c.wins,
      accuracy: c.correct + c.incorrect ? c.correct / (c.correct + c.incorrect) : null,
      bestScore: st.solo.games.highestScore ?? null,
      avgReactionMs: st.solo.buzzer.averageReactionMs ?? st.team.buzzer.averageReactionMs ?? null,
    },
  };
}

export function headToHead(db: DB, a: string, b: string): HeadToHead {
  const rows = db
    .prepare(
      `SELECT g.id AS gameId, g.title, g.ended_at AS endedAt, pa.competitor_id AS ca, pb.competitor_id AS cb,
              ga.placement AS aPlace, gb.placement AS bPlace, ga.final_score AS aScore, gb.final_score AS bScore,
              ga.is_winner AS aWin, gb.is_winner AS bWin
       FROM games g
       JOIN game_participants pa ON pa.game_id = g.id AND pa.profile_id = ?
       JOIN game_participants pb ON pb.game_id = g.id AND pb.profile_id = ?
       JOIN game_competitors ga ON ga.game_id = g.id AND ga.competitor_id = pa.competitor_id
       JOIN game_competitors gb ON gb.game_id = g.id AND gb.competitor_id = pb.competitor_id
       WHERE ${COUNTED}
       ORDER BY g.ended_at DESC`,
    )
    .all(a, b) as unknown as { gameId: string; title: string; endedAt: number | null; ca: string; cb: string; aPlace: number | null; bPlace: number | null; aScore: number | null; bScore: number | null; aWin: number | null; bWin: number | null }[];
  const out: HeadToHead = { opponents: { games: 0, aAhead: 0, bAhead: 0, tied: 0 }, teammates: { games: 0, wins: 0 }, recent: [] };
  for (const r of rows) {
    const together = r.ca === r.cb;
    if (together) {
      out.teammates.games++;
      if (r.aWin) out.teammates.wins++;
    } else {
      out.opponents.games++;
      const pa = r.aPlace ?? Infinity;
      const pb = r.bPlace ?? Infinity;
      if (pa < pb) out.opponents.aAhead++;
      else if (pb < pa) out.opponents.bAhead++;
      else out.opponents.tied++;
    }
    if (out.recent.length < 8)
      out.recent.push({
        gameId: r.gameId,
        title: r.title,
        endedAt: r.endedAt,
        together,
        aPlace: r.aPlace,
        bPlace: r.bPlace,
        aScore: r.aScore ?? 0,
        bScore: r.bScore ?? 0,
        won: r.aWin && r.bWin ? 'both' : r.aWin ? 'a' : r.bWin ? 'b' : 'none',
      });
  }
  return out;
}

/** A finished game as the TV home screen and the host's recent-games list show it (R5-2). Only
 *  what history recorded: no winner is invented for games without recorded results. */
export interface RecentGame {
  id: string;
  title: string;
  boardTitle: string;
  endedAt: number;
  mode: 'solo' | 'team';
  practice: boolean;
  /** Winner(s) from the recorded results (empty when none were recorded). */
  winners: { name: string; color: string; avatar: string; pictureUrl: string | null; team: boolean }[];
  winningScore: number | null;
  /** People who played (computer opponents counted separately). */
  players: number;
  bots: number;
  teams: number;
}

type CompRow = { gameId: string; kind: 'player' | 'team'; teamId: string | null; profileId: string | null; name: string; color: string; score: number | null; placement: number | null; isWinner: number | null };

function competitorIdentity(db: DB, r: CompRow, profiles: Record<string, { avatar: string; pictureUrl: string | null }>, teams: Map<string, { avatar: string }>) {
  if (r.kind === 'team') return { avatar: (r.teamId && teams.get(r.teamId)?.avatar) || 'shield', pictureUrl: null };
  if (!r.profileId) return { avatar: 'robot', pictureUrl: null }; // computer opponent
  const p = profiles[r.profileId];
  return { avatar: p?.avatar ?? 'fox', pictureUrl: p?.pictureUrl ?? null };
}

export function recentGames(db: DB, limit = 3): RecentGame[] {
  const games = db
    .prepare(
      `SELECT g.id, g.title, g.mode, g.practice, g.ended_at AS endedAt, b.title AS boardTitle,
         (SELECT COUNT(*) FROM game_participants p WHERE p.game_id = g.id) AS players
       FROM games g LEFT JOIN boards b ON b.id = g.board_id WHERE ${COMPLETED} AND g.ended_at IS NOT NULL ORDER BY g.ended_at DESC LIMIT ?`,
    )
    .all(limit) as { id: string; title: string; mode: 'solo' | 'team'; practice: number; endedAt: number; boardTitle: string | null; players: number }[];
  if (!games.length) return [];
  const comps = db
    .prepare(
      `SELECT game_id AS gameId, kind, team_id AS teamId, profile_id AS profileId, name_snapshot AS name, color, final_score AS score, placement, is_winner AS isWinner
       FROM game_competitors WHERE game_id IN (${games.map(() => '?').join(',')})`,
    )
    .all(...games.map((g) => g.id)) as CompRow[];
  const profiles = repo.profilesByIds(db, [...new Set(comps.map((c) => c.profileId).filter((x): x is string => !!x))]);
  const teams = new Map(listTeams(db, true).map((t) => [t.id, t]));
  return games.map((g) => {
    const mine = comps.filter((c) => c.gameId === g.id);
    const won = mine.filter((c) => !!c.isWinner);
    return {
      id: g.id,
      title: g.title,
      boardTitle: g.boardTitle ?? g.title,
      endedAt: g.endedAt,
      mode: g.mode,
      practice: !!g.practice,
      winners: won.map((c) => ({ name: c.name, color: c.color, team: c.kind === 'team', ...competitorIdentity(db, c, profiles, teams) })),
      winningScore: won.length && won[0].score != null ? won[0].score : null,
      players: g.players,
      bots: mine.filter((c) => c.kind === 'player' && !c.profileId).length,
      teams: mine.filter((c) => c.kind === 'team').length,
    };
  });
}

/** Public summary of one finished game for the TV (R5-2.3): final standings and simple counts. */
export function gameSummary(db: DB, gameId: string) {
  const g = db
    .prepare(`SELECT g.id, g.title, g.mode, g.practice, g.started_at AS startedAt, g.ended_at AS endedAt, b.title AS boardTitle FROM games g LEFT JOIN boards b ON b.id = g.board_id WHERE g.id = ? AND ${COMPLETED}`)
    .get(gameId) as { id: string; title: string; mode: 'solo' | 'team'; practice: number; startedAt: number | null; endedAt: number; boardTitle: string | null } | undefined;
  if (!g) return null;
  const comps = db
    .prepare(
      `SELECT game_id AS gameId, competitor_id AS competitorId, kind, team_id AS teamId, profile_id AS profileId, name_snapshot AS name, color, final_score AS score, placement, is_winner AS isWinner
       FROM game_competitors WHERE game_id = ? ORDER BY placement, name_snapshot`,
    )
    .all(gameId) as (CompRow & { competitorId: string })[];
  const members = db.prepare('SELECT competitor_id AS competitorId, name_snapshot AS name FROM game_participants WHERE game_id = ?').all(gameId) as { competitorId: string; name: string }[];
  const answers = db
    .prepare(`SELECT competitor_id AS competitorId, result, COUNT(*) AS n FROM gameplay_events WHERE game_id = ? AND type = 'answer' AND voided = 0 GROUP BY competitor_id, result`)
    .all(gameId) as { competitorId: string; result: string; n: number }[];
  const played = (db.prepare(`SELECT COUNT(*) AS n FROM gameplay_events WHERE game_id = ? AND type = 'clue_open' AND voided = 0`).get(gameId) as { n: number }).n;
  const profiles = repo.profilesByIds(db, comps.map((c) => c.profileId).filter((x): x is string => !!x));
  const teams = new Map(listTeams(db, true).map((t) => [t.id, t]));
  const count = (id: string, result: string) => answers.find((a) => a.competitorId === id && a.result === result)?.n ?? 0;
  return {
    id: g.id,
    title: g.title,
    boardTitle: g.boardTitle ?? g.title,
    mode: g.mode,
    practice: !!g.practice,
    startedAt: g.startedAt,
    endedAt: g.endedAt,
    cluesPlayed: played,
    standings: comps.map((c) => ({
      placement: c.placement,
      name: c.name,
      color: c.color,
      team: c.kind === 'team',
      ...competitorIdentity(db, c, profiles, teams),
      score: c.score,
      isWinner: !!c.isWinner,
      members: members.filter((m) => m.competitorId === c.competitorId).map((m) => m.name),
      correct: count(c.competitorId, 'correct'),
      incorrect: count(c.competitorId, 'incorrect'),
    })),
  };
}
