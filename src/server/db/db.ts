// SQLite persistence using Node's built-in node:sqlite (works identically in
// Node 24 and Electron 44 — no native module rebuilds).
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export type DB = DatabaseSync;

const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'fox',
  picture_file TEXT,
  pin_hash TEXT NOT NULL,
  preferred_buzzer TEXT NOT NULL DEFAULT 'phone',
  preferred_button TEXT NOT NULL DEFAULT 'any',
  preferred_side TEXT NOT NULL DEFAULT 'any',
  preferred_key TEXT,
  stats_private INTEGER NOT NULL DEFAULT 0,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('host', 'profile')),
  profile_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
  label TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_profile ON sessions(profile_id);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'shield',
  buzzer_mode TEXT NOT NULL DEFAULT 'individual' CHECK (buzzer_mode IN ('individual', 'shared')),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE team_members (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (team_id, profile_id)
);

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  folder TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0,
  is_template INTEGER NOT NULL DEFAULT 0,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE board_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_json TEXT NOT NULL,
  saved_at INTEGER NOT NULL
);
CREATE INDEX board_versions_board ON board_versions(board_id, saved_at);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  board_id TEXT REFERENCES boards(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'team')),
  status TEXT NOT NULL CHECK (status IN ('setup', 'active', 'completed', 'abandoned')),
  state_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER
);
CREATE INDEX games_status ON games(status, updated_at);

-- Historical snapshot of competitors (teams / solo players) at game end
CREATE TABLE game_competitors (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  competitor_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('player', 'team')),
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  profile_id TEXT REFERENCES profiles(id),
  name_snapshot TEXT NOT NULL,
  color TEXT NOT NULL,
  buzzer_mode TEXT NOT NULL,
  final_score INTEGER,
  placement INTEGER,
  is_winner INTEGER,
  PRIMARY KEY (game_id, competitor_id)
);

-- Historical team membership: which profile played for which competitor in this game
CREATE TABLE game_participants (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  competitor_id TEXT NOT NULL,
  team_id TEXT,
  name_snapshot TEXT NOT NULL,
  PRIMARY KEY (game_id, profile_id)
);
CREATE INDEX game_participants_profile ON game_participants(profile_id);

-- Historical clue snapshots (editing the board later never changes history)
CREATE TABLE game_clues (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  clue_id TEXT NOT NULL,
  round_index INTEGER NOT NULL,
  round_name TEXT NOT NULL,
  round_kind TEXT NOT NULL,
  category_name TEXT NOT NULL,
  value INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  daily_wager INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (game_id, clue_id)
);

CREATE TABLE gameplay_events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  at INTEGER NOT NULL,
  clue_id TEXT,
  round_index INTEGER,
  competitor_id TEXT,
  team_id TEXT,
  profile_id TEXT,
  controller_id TEXT,
  source_kind TEXT,
  result TEXT,
  score_delta INTEGER NOT NULL DEFAULT 0,
  contribution_delta INTEGER NOT NULL DEFAULT 0,
  wager INTEGER,
  reaction_ms INTEGER,
  note TEXT,
  corrects_event_id TEXT,
  voided INTEGER NOT NULL DEFAULT 0,
  voided_by TEXT,
  UNIQUE (game_id, seq)
);
CREATE INDEX events_profile ON gameplay_events(profile_id, type);
CREATE INDEX events_competitor ON gameplay_events(game_id, competitor_id);

CREATE TABLE controllers (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  side TEXT,
  buzz_buttons TEXT NOT NULL DEFAULT 'any',
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE game_controller_assignments (
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  controller_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id TEXT NOT NULL,
  PRIMARY KEY (game_id, controller_id)
);

CREATE TABLE media (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  file TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  original_name TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT
);
`,
  },
  {
    // Additive only: existing databases keep all data.
    version: 2,
    name: 'custom board themes',
    sql: `
CREATE TABLE themes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
`,
  },
  {
    // Additive: existing games are regular (counted) games.
    version: 3,
    name: 'practice games',
    sql: `ALTER TABLE games ADD COLUMN practice INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    // Additive: tournaments group games; existing games belong to none.
    version: 4,
    name: 'tournaments',
    sql: `
CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'team')),
  scoring TEXT NOT NULL CHECK (scoring IN ('placement', 'total')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
ALTER TABLE games ADD COLUMN tournament_id TEXT REFERENCES tournaments(id) ON DELETE SET NULL;
CREATE INDEX games_tournament ON games(tournament_id);
`,
  },
  {
    // Round 4 wording (R4-7): saved boards' Final round "Final Wager" → "Final Jeopardy!". Only the
    // library copy changes; finished games and saved versions keep their historical snapshots.
    version: 5,
    name: 'final-jeopardy-round-name',
    sql: `
UPDATE boards SET content_json = REPLACE(REPLACE(content_json,
  '"name":"Final Wager","kind":"final"', '"name":"Final Jeopardy!","kind":"final"'),
  '"kind":"final","name":"Final Wager"', '"kind":"final","name":"Final Jeopardy!"')
WHERE content_json LIKE '%"Final Wager"%';
`,
  },
  {
    // R5-16: choosing a default picture hides an uploaded one instead of deleting it, so the
    // player can switch back. The file is removed only when they delete or replace it.
    version: 6,
    name: 'profile-picture-off',
    sql: `ALTER TABLE profiles ADD COLUMN picture_off INTEGER NOT NULL DEFAULT 0;`,
  },
  {
    // R12-11: guests play with a nickname only. Their row gives the game a stable identity (buzzers,
    // scores, history) but is hidden from profile lists, sign-in, leaderboards and statistics, and
    // removed when nothing refers to it any more.
    version: 7,
    name: 'guest-profiles',
    sql: `ALTER TABLE profiles ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;`,
  },
];

export function openDatabase(file: string): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 3000;');
  migrate(db);
  return db;
}

export function migrate(db: DB) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  const current = row.v ?? 0;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    tx(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(m.version, m.name, Date.now());
    });
  }
}

export function schemaVersion(db: DB): number {
  return (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v;
}

let depth = 0;
/** Run fn inside a transaction (nested calls join the outer transaction). */
export function tx<T>(db: DB, fn: () => T): T {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    depth--;
  }
}

export function integrityCheck(db: DB): string {
  const r = db.prepare('PRAGMA integrity_check').get() as Record<string, string>;
  return Object.values(r)[0];
}

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  if (!r) return fallback;
  try {
    return JSON.parse(r.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: DB, key: string, value: unknown) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

export function audit(db: DB, actor: string, action: string, detail?: unknown) {
  db.prepare('INSERT INTO audit_log (at, actor, action, detail_json) VALUES (?, ?, ?, ?)').run(Date.now(), actor, action, detail === undefined ? null : JSON.stringify(detail));
}
