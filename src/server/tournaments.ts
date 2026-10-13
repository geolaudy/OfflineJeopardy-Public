// Tournaments (O8): storage and standings. Results come from the finished games' historical
// snapshots (game_competitors), so standings always match the game history.
import type { DB } from './db/db.js';
import { computeStandings, type StandingRow, type Tournament, type TournamentResultRow, type TournamentScoring } from '../shared/tournament.js';
import { newId } from './repos.js';

interface Row {
  id: string;
  name: string;
  mode: 'solo' | 'team';
  scoring: TournamentScoring;
  status: 'active' | 'finished';
  created_at: number;
  updated_at: number;
}
const toTournament = (r: Row): Tournament => ({ id: r.id, name: r.name, mode: r.mode, scoring: r.scoring, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at });

export function listTournaments(db: DB): Tournament[] {
  return (db.prepare(`SELECT * FROM tournaments ORDER BY status = 'finished', updated_at DESC`).all() as unknown as Row[]).map(toTournament);
}

export function getTournament(db: DB, id: string): Tournament | null {
  const r = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as unknown as Row | undefined;
  return r ? toTournament(r) : null;
}

export function createTournament(db: DB, t: { name: string; mode: 'solo' | 'team'; scoring: TournamentScoring }): Tournament {
  const now = Date.now();
  const id = newId();
  db.prepare('INSERT INTO tournaments (id, name, mode, scoring, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, t.name, t.mode, t.scoring, 'active', now, now);
  return getTournament(db, id)!;
}

export function updateTournament(db: DB, id: string, patch: { name?: string; status?: 'active' | 'finished'; scoring?: TournamentScoring }) {
  const t = getTournament(db, id);
  if (!t) return null;
  db.prepare('UPDATE tournaments SET name = ?, status = ?, scoring = ?, updated_at = ? WHERE id = ?').run(patch.name ?? t.name, patch.status ?? t.status, patch.scoring ?? t.scoring, Date.now(), id);
  return getTournament(db, id);
}

/** Deleting a tournament keeps its games (they just stop belonging to it). */
export function deleteTournament(db: DB, id: string) {
  db.prepare('UPDATE games SET tournament_id = NULL WHERE tournament_id = ?').run(id);
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
}

export function attachGame(db: DB, gameId: string, tournamentId: string | null) {
  db.prepare('UPDATE games SET tournament_id = ? WHERE id = ?').run(tournamentId, gameId);
  if (tournamentId) db.prepare('UPDATE tournaments SET updated_at = ? WHERE id = ?').run(Date.now(), tournamentId);
}

export function tournamentOfGame(db: DB, gameId: string): string | null {
  const r = db.prepare('SELECT tournament_id AS t FROM games WHERE id = ?').get(gameId) as { t: string | null } | undefined;
  return r?.t ?? null;
}

export function tournamentResults(db: DB, id: string): TournamentResultRow[] {
  const rows = db
    .prepare(
      `SELECT g.id AS gameId, g.ended_at AS endedAt, gc.kind, gc.team_id AS teamId, gc.profile_id AS profileId, gc.name_snapshot AS name,
              gc.color, gc.final_score AS finalScore, gc.placement, gc.is_winner AS isWinner
       FROM games g JOIN game_competitors gc ON gc.game_id = g.id
       WHERE g.tournament_id = ? AND g.status = 'completed' AND g.practice = 0`,
    )
    .all(id) as unknown as { gameId: string; endedAt: number | null; kind: string; teamId: string | null; profileId: string | null; name: string; color: string; finalScore: number | null; placement: number | null; isWinner: number | null }[];
  return rows.map((r) => ({
    gameId: r.gameId,
    key: r.kind === 'team' ? (r.teamId ? `team:${r.teamId}` : `name:${r.name}`) : r.profileId ? `profile:${r.profileId}` : `name:${r.name}`,
    name: r.name,
    color: r.color,
    profileId: r.profileId,
    teamId: r.teamId,
    finalScore: r.finalScore ?? 0,
    placement: r.placement,
    isWinner: !!r.isWinner,
    endedAt: r.endedAt ?? 0,
  }));
}

export interface TournamentGame {
  id: string;
  title: string;
  status: string;
  endedAt: number | null;
  winner: string | null;
}

export function tournamentGames(db: DB, id: string): TournamentGame[] {
  return db
    .prepare(
      `SELECT g.id, g.title, g.status, g.ended_at AS endedAt,
              (SELECT group_concat(gc.name_snapshot, ' & ') FROM game_competitors gc WHERE gc.game_id = g.id AND gc.is_winner = 1) AS winner
       FROM games g WHERE g.tournament_id = ? AND g.status <> 'abandoned' ORDER BY COALESCE(g.ended_at, g.updated_at)`,
    )
    .all(id) as unknown as TournamentGame[];
}

export function standings(db: DB, t: Tournament): StandingRow[] {
  return computeStandings(tournamentResults(db, t.id), t.scoring);
}
