// Data access for profiles, teams, boards and games.
import crypto from 'node:crypto';
import { ROOM_CODE_ALPHABET } from '../shared/game.js';
import type { DB } from './db/db.js';
import { tx } from './db/db.js';
import type { Board, BoardContent, BoardMeta, GameState, GameplayEvent } from '../shared/game.js';
import type { ProfilePublic } from '../shared/views.js';
import { newThemeData, type CustomTheme, type CustomThemeData } from '../shared/themes.js';
import { normalizeState } from './engine/engine.js';
import { clueComplete } from '../shared/boardUtils.js';

export const newId = () => crypto.randomUUID();

// ---------------- profiles ----------------

export interface ProfileRow {
  id: string;
  display_name: string;
  nickname: string;
  color: string;
  avatar: string;
  picture_file: string | null;
  /** 1 = the player chose a default picture; the uploaded file is kept (R5-16). */
  picture_off: number;
  pin_hash: string;
  preferred_buzzer: string;
  preferred_button: string;
  preferred_side: string;
  preferred_key: string | null;
  stats_private: number;
  failed_attempts: number;
  locked_until: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface ProfilePrivate extends ProfilePublic {
  /** The uploaded picture, also while a default picture is in use (owner/host only, R5-16). */
  uploadedPictureUrl: string | null;
  preferredBuzzer: string;
  preferredButton: string;
  preferredSide: string;
  preferredKey: string | null;
  statsPrivate: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Random 4-letter room code (cryptographic randomness; not derivable from public data). */
export function newRoomCode() {
  return Array.from({ length: 4 }, () => ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)]).join('');
}

export function pictureUrl(row: Pick<ProfileRow, 'picture_file'> & { picture_off?: number }) {
  return row.picture_file && !row.picture_off ? `/media/profiles/${row.picture_file}` : null;
}

export function toPublic(r: ProfileRow): ProfilePublic {
  return { id: r.id, name: r.display_name, nickname: r.nickname, color: r.color, avatar: r.avatar, pictureUrl: pictureUrl(r) };
}

export function toPrivate(r: ProfileRow): ProfilePrivate {
  return {
    ...toPublic(r),
    uploadedPictureUrl: pictureUrl({ picture_file: r.picture_file }),
    preferredBuzzer: r.preferred_buzzer,
    preferredButton: r.preferred_button,
    preferredSide: r.preferred_side,
    preferredKey: r.preferred_key,
    statsPrivate: !!r.stats_private,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getProfile(db: DB, id: string): ProfileRow | undefined {
  return db.prepare('SELECT * FROM profiles WHERE id = ? AND deleted_at IS NULL').get(id) as ProfileRow | undefined;
}

export function listProfiles(db: DB): ProfileRow[] {
  return db.prepare('SELECT * FROM profiles WHERE deleted_at IS NULL ORDER BY display_name COLLATE NOCASE').all() as unknown as ProfileRow[];
}

export function profilesByIds(db: DB, ids: string[]): Record<string, ProfilePublic> {
  const out: Record<string, ProfilePublic> = {};
  if (!ids.length) return out;
  const rows = db.prepare(`SELECT * FROM profiles WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as unknown as ProfileRow[];
  for (const r of rows) out[r.id] = r.deleted_at ? { ...toPublic(r), name: 'Deleted player', pictureUrl: null } : toPublic(r);
  return out;
}

export function insertProfile(
  db: DB,
  p: { name: string; nickname?: string; color: string; avatar: string; pinHash: string },
): ProfileRow {
  const id = newId();
  const now = Date.now();
  db.prepare(
    `INSERT INTO profiles (id, display_name, nickname, color, avatar, pin_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, p.name, p.nickname ?? '', p.color, p.avatar, p.pinHash, now, now);
  return getProfile(db, id)!;
}

const PROFILE_FIELDS: Record<string, string> = {
  name: 'display_name',
  nickname: 'nickname',
  color: 'color',
  avatar: 'avatar',
  pictureFile: 'picture_file',
  pictureOff: 'picture_off',
  preferredBuzzer: 'preferred_buzzer',
  preferredButton: 'preferred_button',
  preferredSide: 'preferred_side',
  preferredKey: 'preferred_key',
  statsPrivate: 'stats_private',
  pinHash: 'pin_hash',
};

export function updateProfile(db: DB, id: string, patch: Record<string, unknown>) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = PROFILE_FIELDS[k];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null));
  }
  if (!sets.length) return;
  sets.push('updated_at = ?');
  vals.push(Date.now());
  db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
}

/** Soft delete: history keeps referencing the stable id; personal data is cleared. */
export function softDeleteProfile(db: DB, id: string) {
  tx(db, () => {
    db.prepare(
      `UPDATE profiles SET deleted_at = ?, display_name = 'Deleted player', nickname = '', picture_file = NULL, pin_hash = '!' WHERE id = ?`,
    ).run(Date.now(), id);
    db.prepare('DELETE FROM sessions WHERE profile_id = ?').run(id);
    db.prepare('DELETE FROM team_members WHERE profile_id = ?').run(id);
  });
}

// ---------------- teams ----------------

export interface TeamRecord {
  id: string;
  name: string;
  color: string;
  avatar: string;
  buzzerMode: 'individual' | 'shared';
  archived: boolean;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export function listTeams(db: DB, includeArchived = false): TeamRecord[] {
  const rows = db
    .prepare(`SELECT * FROM teams ${includeArchived ? '' : 'WHERE archived = 0'} ORDER BY name COLLATE NOCASE`)
    .all() as { id: string; name: string; color: string; avatar: string; buzzer_mode: 'individual' | 'shared'; archived: number; created_at: number; updated_at: number }[];
  const members = db.prepare('SELECT team_id, profile_id FROM team_members ORDER BY added_at').all() as { team_id: string; profile_id: string }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    avatar: r.avatar,
    buzzerMode: r.buzzer_mode,
    archived: !!r.archived,
    memberIds: members.filter((m) => m.team_id === r.id).map((m) => m.profile_id),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getTeam(db: DB, id: string) {
  return listTeams(db, true).find((t) => t.id === id);
}

export function saveTeam(
  db: DB,
  t: { id?: string; name: string; color: string; avatar: string; buzzerMode: 'individual' | 'shared'; memberIds: string[]; archived?: boolean },
): TeamRecord {
  const id = t.id ?? newId();
  const now = Date.now();
  tx(db, () => {
    db.prepare(
      `INSERT INTO teams (id, name, color, avatar, buzzer_mode, archived, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, color = excluded.color, avatar = excluded.avatar,
       buzzer_mode = excluded.buzzer_mode, archived = excluded.archived, updated_at = excluded.updated_at`,
    ).run(id, t.name, t.color, t.avatar, t.buzzerMode, t.archived ? 1 : 0, now, now);
    db.prepare('DELETE FROM team_members WHERE team_id = ?').run(id);
    const ins = db.prepare('INSERT INTO team_members (team_id, profile_id, added_at) VALUES (?, ?, ?)');
    [...new Set(t.memberIds)].forEach((pid, i) => ins.run(id, pid, now + i));
  });
  return getTeam(db, id)!;
}

export function deleteTeam(db: DB, id: string) {
  // Teams referenced by history are archived instead of deleted.
  const used = db.prepare('SELECT 1 FROM game_competitors WHERE team_id = ? LIMIT 1').get(id);
  if (used) db.prepare('UPDATE teams SET archived = 1, updated_at = ? WHERE id = ?').run(Date.now(), id);
  else db.prepare('DELETE FROM teams WHERE id = ?').run(id);
}

// ---------------- boards ----------------

interface BoardRow {
  id: string;
  title: string;
  description: string;
  tags_json: string;
  folder: string;
  favorite: number;
  archived: number;
  is_template: number;
  content_json: string;
  created_at: number;
  updated_at: number;
}

function boardMeta(r: BoardRow): BoardMeta & { isTemplate: boolean } {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    tags: JSON.parse(r.tags_json),
    folder: r.folder,
    favorite: !!r.favorite,
    archived: !!r.archived,
    isTemplate: !!r.is_template,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listBoards(db: DB) {
  const rows = db.prepare('SELECT * FROM boards ORDER BY updated_at DESC').all() as unknown as BoardRow[];
  return rows.map((r) => {
    const content = JSON.parse(r.content_json) as BoardContent;
    let clues = 0;
    let complete = 0;
    for (const rd of content.rounds)
      for (const c of rd.categories)
        for (const q of c.clues) {
          clues++;
          if (clueComplete(q)) complete++;
        }
    return {
      ...boardMeta(r),
      rounds: content.rounds.map((rd) => ({ name: rd.name, kind: rd.kind, categories: rd.categories.map((c) => c.name) })),
      clueCount: clues,
      completeCount: complete,
    };
  });
}

export function getBoard(db: DB, id: string): (Board & { isTemplate: boolean }) | undefined {
  const r = db.prepare('SELECT * FROM boards WHERE id = ?').get(id) as BoardRow | undefined;
  if (!r) return undefined;
  return { ...boardMeta(r), content: JSON.parse(r.content_json) };
}

export function saveBoard(
  db: DB,
  b: Partial<BoardMeta> & { id?: string; title: string; content: BoardContent; isTemplate?: boolean },
  opts: { version?: boolean } = {},
) {
  const id = b.id ?? newId();
  const now = Date.now();
  const existing = b.id ? getBoard(db, b.id) : undefined;
  tx(db, () => {
    db.prepare(
      `INSERT INTO boards (id, title, description, tags_json, folder, favorite, archived, is_template, content_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, description = excluded.description, tags_json = excluded.tags_json,
       folder = excluded.folder, favorite = excluded.favorite, archived = excluded.archived, is_template = excluded.is_template,
       content_json = excluded.content_json, updated_at = excluded.updated_at`,
    ).run(
      id,
      b.title,
      b.description ?? existing?.description ?? '',
      JSON.stringify(b.tags ?? existing?.tags ?? []),
      b.folder ?? existing?.folder ?? '',
      (b.favorite ?? existing?.favorite) ? 1 : 0,
      (b.archived ?? existing?.archived) ? 1 : 0,
      (b.isTemplate ?? existing?.isTemplate) ? 1 : 0,
      JSON.stringify(b.content),
      existing?.createdAt ?? now,
      now,
    );
    if (opts.version) {
      db.prepare('INSERT INTO board_versions (board_id, title, content_json, saved_at) VALUES (?, ?, ?, ?)').run(id, b.title, JSON.stringify(b.content), now);
      // keep the 30 most recent versions
      db.prepare(
        `DELETE FROM board_versions WHERE board_id = ? AND id NOT IN (SELECT id FROM board_versions WHERE board_id = ? ORDER BY saved_at DESC, id DESC LIMIT 30)`,
      ).run(id, id);
    }
  });
  return getBoard(db, id)!;
}

export function listBoardVersions(db: DB, boardId: string) {
  return db.prepare('SELECT id, title, saved_at AS savedAt FROM board_versions WHERE board_id = ? ORDER BY saved_at DESC, id DESC').all(boardId) as {
    id: number;
    title: string;
    savedAt: number;
  }[];
}

export function getBoardVersion(db: DB, boardId: string, versionId: number) {
  const r = db.prepare('SELECT title, content_json FROM board_versions WHERE board_id = ? AND id = ?').get(boardId, versionId) as
    | { title: string; content_json: string }
    | undefined;
  return r ? { title: r.title, content: JSON.parse(r.content_json) as BoardContent } : undefined;
}

export function deleteBoard(db: DB, id: string) {
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
}

// ---------------- games ----------------

export interface GameRow {
  id: string;
  board_id: string | null;
  title: string;
  mode: 'solo' | 'team';
  status: 'setup' | 'active' | 'completed' | 'abandoned';
  state_json: string;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  ended_at: number | null;
}

export function gameStatus(s: GameState): GameRow['status'] {
  return s.phase === 'lobby' ? 'setup' : s.phase === 'ended' ? 'completed' : 'active';
}

/** Persist state (without events, which live in gameplay_events) and touched events atomically. */
export function persistGame(db: DB, s: GameState, touched: GameplayEvent[], statusOverride?: GameRow['status']) {
  const { events: _events, ...rest } = s;
  const now = Date.now();
  tx(db, () => {
    db.prepare(
      `INSERT INTO games (id, board_id, title, mode, status, state_json, created_at, updated_at, started_at, ended_at, practice)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET board_id = excluded.board_id, title = excluded.title, mode = excluded.mode, status = excluded.status, state_json = excluded.state_json,
       updated_at = excluded.updated_at, started_at = excluded.started_at, ended_at = excluded.ended_at, practice = excluded.practice`,
    ).run(s.id, s.boardId && getBoardExists(db, s.boardId) ? s.boardId : null, s.title, s.mode, statusOverride ?? gameStatus(s), JSON.stringify(rest), s.createdAt, now, s.startedAt, s.endedAt, s.practice ? 1 : 0);
    const up = db.prepare(
      `INSERT INTO gameplay_events (id, game_id, seq, type, at, clue_id, round_index, competitor_id, team_id, profile_id, controller_id, source_kind,
         result, score_delta, contribution_delta, wager, reaction_ms, note, corrects_event_id, voided, voided_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET voided = excluded.voided, voided_by = excluded.voided_by`,
    );
    for (const e of touched) {
      const team = e.competitorId ? s.competitors.find((c) => c.id === e.competitorId)?.teamId ?? null : null;
      up.run(
        e.id,
        s.id,
        e.seq,
        e.type,
        e.at,
        e.clueId ?? null,
        e.roundIndex ?? null,
        e.competitorId ?? null,
        team,
        e.profileId ?? null,
        e.controllerId ?? null,
        e.sourceKind ?? null,
        e.result ?? null,
        e.scoreDelta,
        e.contributionDelta,
        e.wager ?? null,
        e.reactionMs ?? null,
        e.note ?? null,
        e.correctsEventId ?? null,
        e.voided ? 1 : 0,
        e.voidedBy ?? null,
      );
    }
  });
}

function getBoardExists(db: DB, id: string) {
  return !!db.prepare('SELECT 1 FROM boards WHERE id = ?').get(id);
}

export function loadGame(db: DB, id: string): GameState | undefined {
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(id) as GameRow | undefined;
  if (!row) return undefined;
  const state = JSON.parse(row.state_json) as Omit<GameState, 'events'>;
  const evRows = db.prepare('SELECT * FROM gameplay_events WHERE game_id = ? ORDER BY seq').all(id) as Record<string, unknown>[];
  const events: GameplayEvent[] = evRows.map((r) => ({
    id: r.id as string,
    seq: r.seq as number,
    type: r.type as GameplayEvent['type'],
    at: r.at as number,
    clueId: (r.clue_id as string) ?? undefined,
    roundIndex: (r.round_index as number) ?? undefined,
    competitorId: (r.competitor_id as string) ?? undefined,
    profileId: (r.profile_id as string) ?? null,
    controllerId: (r.controller_id as string) ?? undefined,
    sourceKind: (r.source_kind as GameplayEvent['sourceKind']) ?? undefined,
    result: (r.result as string) ?? undefined,
    scoreDelta: r.score_delta as number,
    contributionDelta: r.contribution_delta as number,
    wager: (r.wager as number) ?? undefined,
    reactionMs: (r.reaction_ms as number) ?? null,
    note: (r.note as string) ?? undefined,
    correctsEventId: (r.corrects_event_id as string) ?? undefined,
    voided: !!r.voided,
    voidedBy: (r.voided_by as string) ?? undefined,
  }));
  // Saves from older versions are upgraded in memory (missing fields get defaults; nothing is dropped).
  const s = normalizeState({ ...state, events } as GameState);
  if (!s.roomCode) s.roomCode = newRoomCode();
  return s;
}

export function listGames(db: DB, statuses: GameRow['status'][]) {
  return db
    .prepare(
      `SELECT id, title, mode, status, created_at AS createdAt, updated_at AS updatedAt, started_at AS startedAt, ended_at AS endedAt
       FROM games WHERE status IN (${statuses.map(() => '?').join(',')}) ORDER BY updated_at DESC`,
    )
    .all(...statuses) as { id: string; title: string; mode: string; status: string; createdAt: number; updatedAt: number; startedAt: number | null; endedAt: number | null }[];
}

/** Snapshot the board's clues at game creation so later board edits never alter history. */
export function snapshotClues(db: DB, s: GameState) {
  const ins = db.prepare(
    `INSERT OR REPLACE INTO game_clues (game_id, clue_id, round_index, round_name, round_kind, category_name, value, question, answer, daily_wager)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  tx(db, () => {
    s.board.rounds.forEach((r, ri) =>
      r.categories.forEach((c) => c.clues.forEach((q) => ins.run(s.id, q.id, ri, r.name, r.kind, c.name, q.value, q.question, q.answer, q.dailyWager ? 1 : 0))),
    );
  });
}

/** Write historical competitor/participant/assignment records (called at start and at end). */
export function recordParticipants(db: DB, s: GameState, profiles: Record<string, ProfilePublic>) {
  tx(db, () => {
    db.prepare('DELETE FROM game_competitors WHERE game_id = ?').run(s.id);
    db.prepare('DELETE FROM game_participants WHERE game_id = ?').run(s.id);
    db.prepare('DELETE FROM game_controller_assignments WHERE game_id = ?').run(s.id);
    const insC = db.prepare(
      `INSERT INTO game_competitors (game_id, competitor_id, kind, team_id, profile_id, name_snapshot, color, buzzer_mode, final_score, placement, is_winner)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insP = db.prepare('INSERT OR IGNORE INTO game_participants (game_id, profile_id, competitor_id, team_id, name_snapshot) VALUES (?, ?, ?, ?, ?)');
    const teamExists = db.prepare('SELECT 1 FROM teams WHERE id = ?');
    for (const c of s.competitors) {
      const res = s.results?.find((r) => r.competitorId === c.id);
      const teamId = c.teamId && teamExists.get(c.teamId) ? c.teamId : null;
      const name = c.bot ? `${c.name} (computer)` : c.kind === 'player' ? profiles[c.profileId!]?.name ?? 'Player' : c.name;
      insC.run(s.id, c.id, c.kind, teamId, c.kind === 'player' ? (c.profileId ?? null) : null, name, c.color, c.buzzerMode, res?.score ?? null, res?.placement ?? null, res ? (res.isWinner ? 1 : 0) : null);
      for (const pid of c.memberIds) insP.run(s.id, pid, c.id, teamId, profiles[pid]?.name ?? 'Player');
    }
    const insA = db.prepare(
      'INSERT INTO game_controller_assignments (game_id, controller_id, kind, label, target_kind, target_id) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const b of s.bindings)
      insA.run(s.id, b.controllerId, b.kind, b.label, b.target.kind, b.target.kind === 'profile' ? b.target.profileId : b.target.competitorId);
  });
}

// ---------- custom TV themes ----------

export function listThemes(db: DB): CustomTheme[] {
  const rows = db.prepare('SELECT * FROM themes ORDER BY name COLLATE NOCASE').all() as { id: string; data_json: string; created_at: number; updated_at: number }[];
  return rows.map(themeFromRow);
}

export function getTheme(db: DB, id: string): CustomTheme | undefined {
  const r = db.prepare('SELECT * FROM themes WHERE id = ?').get(id) as { id: string; data_json: string; created_at: number; updated_at: number } | undefined;
  return r ? themeFromRow(r) : undefined;
}

function themeFromRow(r: { id: string; data_json: string; created_at: number; updated_at: number }): CustomTheme {
  // Older/foreign data is filled with defaults so the board never receives a partial theme.
  const data = { ...newThemeData(), ...(JSON.parse(r.data_json) as Partial<CustomThemeData>) };
  data.colors = { ...newThemeData().colors, ...data.colors };
  return { ...data, id: r.id, createdAt: r.created_at, updatedAt: r.updated_at };
}

export function saveTheme(db: DB, data: CustomThemeData, id?: string): CustomTheme {
  const now = Date.now();
  const existing = id ? getTheme(db, id) : undefined;
  const tid = existing?.id ?? newId();
  db.prepare(
    `INSERT INTO themes (id, name, data_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, data_json = excluded.data_json, updated_at = excluded.updated_at`,
  ).run(tid, data.name, JSON.stringify(data), existing?.createdAt ?? now, now);
  return getTheme(db, tid)!;
}

export function deleteTheme(db: DB, id: string) {
  db.prepare('DELETE FROM themes WHERE id = ?').run(id);
}
