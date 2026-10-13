// Statistics derived exclusively from authoritative, non-voided gameplay events of
// completed games. Solo statistics, individual contributions in team games and team
// statistics are computed separately and never merged into one average.
import type { DB } from './db/db.js';

const COMPLETED = `g.status = 'completed'`;

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
       JOIN games g ON g.id = gp.game_id WHERE gp.profile_id = ? AND ${COMPLETED}`,
    )
    .all(profileId) as { kind: string; final_score: number | null; is_winner: number | null }[];

  // --- answers personally given (solo: delta = score change; team: delta = contribution)
  const answers = db
    .prepare(
      `SELECT gc.kind, e.result, e.score_delta, e.contribution_delta, e.wager, e.note, c.category_name AS category
       FROM gameplay_events e JOIN games g ON g.id = e.game_id
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       LEFT JOIN game_clues c ON c.game_id = e.game_id AND c.clue_id = e.clue_id
       WHERE e.type = 'answer' AND e.voided = 0 AND e.profile_id = ? AND ${COMPLETED}`,
    )
    .all(profileId) as { kind: string; result: string; score_delta: number; contribution_delta: number; wager: number | null; note: string | null; category: string | null }[];

  const buzzes = db
    .prepare(
      `SELECT gc.kind, e.result, e.reaction_ms, e.score_delta FROM gameplay_events e JOIN games g ON g.id = e.game_id
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       WHERE e.type = 'buzz' AND e.voided = 0 AND e.profile_id = ? AND ${COMPLETED}`,
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
    .prepare(`SELECT gc.game_id, gc.competitor_id, gc.final_score, gc.is_winner FROM game_competitors gc JOIN games g ON g.id = gc.game_id WHERE gc.team_id = ? AND ${COMPLETED}`)
    .all(teamId) as { game_id: string; competitor_id: string; final_score: number | null; is_winner: number | null }[];
  const answers = db
    .prepare(
      `SELECT e.result, e.score_delta, e.wager, e.note, e.profile_id, c.category_name AS category FROM gameplay_events e
       JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       JOIN games g ON g.id = e.game_id LEFT JOIN game_clues c ON c.game_id = e.game_id AND c.clue_id = e.clue_id
       WHERE gc.team_id = ? AND e.type = 'answer' AND e.voided = 0 AND ${COMPLETED}`,
    )
    .all(teamId) as { result: string; score_delta: number; wager: number | null; note: string | null; profile_id: string | null; category: string | null }[];
  const buzzes = db
    .prepare(
      `SELECT e.result, e.reaction_ms FROM gameplay_events e JOIN game_competitors gc ON gc.game_id = e.game_id AND gc.competitor_id = e.competitor_id
       JOIN games g ON g.id = e.game_id WHERE gc.team_id = ? AND e.type = 'buzz' AND e.voided = 0 AND ${COMPLETED}`,
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
      `SELECT g.id, g.title, g.mode, g.started_at AS startedAt, g.ended_at AS endedAt, gc.name_snapshot AS competitorName, gc.kind,
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
  return rows.map((r) => ({ ...r, isWinner: !!r.isWinner, durationMs: r.endedAt && r.startedAt ? (r.endedAt as number) - (r.startedAt as number) : null }));
}

export function listHistory(db: DB) {
  return db
    .prepare(
      `SELECT g.id, g.title, g.mode, g.started_at AS startedAt, g.ended_at AS endedAt,
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
export function leaderboard(db: DB) {
  const profiles = db
    .prepare('SELECT id, display_name AS name, nickname, color, avatar, picture_file AS pictureFile FROM profiles WHERE deleted_at IS NULL AND stats_private = 0')
    .all() as { id: string; name: string; nickname: string; color: string; avatar: string; pictureFile: string | null }[];
  return profiles.map((p) => {
    const st = profileStats(db, p.id);
    return {
      id: p.id,
      name: p.name,
      nickname: p.nickname,
      color: p.color,
      avatar: p.avatar,
      pictureUrl: p.pictureFile ? `/media/profiles/${p.pictureFile}` : null,
      solo: {
        games: st.solo.games.played,
        wins: st.solo.games.wins,
        winRate: st.solo.games.winRate,
        averageScore: st.solo.games.averageScore,
        highestScore: st.solo.games.highestScore,
        correct: st.solo.answers.correct,
        incorrect: st.solo.answers.incorrect,
        accuracy: st.solo.answers.accuracy,
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
