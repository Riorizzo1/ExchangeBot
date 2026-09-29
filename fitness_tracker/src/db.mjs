import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const defaultDbPath = process.env.FITNESS_DB_PATH || path.join(rootDir, 'data', 'fitness.sqlite');

export function openDatabase(dbPath = defaultDbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      date_logged TEXT NOT NULL,
      day_type TEXT NOT NULL,
      phase INTEGER,
      status TEXT NOT NULL CHECK(status IN ('complete', 'partial', 'missed', 'skipped')),
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'app',
      source_record_index INTEGER,
      raw_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS sessions_date_idx ON sessions(date_logged DESC, created_at DESC);

    CREATE TABLE IF NOT EXISTS lift_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      exercise TEXT NOT NULL,
      canonical_exercise TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('complete', 'partial', 'missed', 'skipped')),
      target_weight_lb REAL,
      actual_weight_lb REAL,
      added_weight_lb REAL,
      target_sets INTEGER,
      target_reps INTEGER,
      actual_sets INTEGER,
      actual_reps INTEGER,
      rep_sequence_json TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS attempts_exercise_idx
      ON lift_attempts(canonical_exercise, session_id);

    CREATE TABLE IF NOT EXISTS progression_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
      source_date TEXT NOT NULL,
      goal_key TEXT,
      exercise TEXT NOT NULL,
      canonical_exercise TEXT NOT NULL,
      weight_lb REAL,
      added_weight_lb REAL,
      sets INTEGER,
      reps INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS goals_exercise_idx
      ON progression_goals(canonical_exercise, source_date DESC, id DESC);

    CREATE TABLE IF NOT EXISTS write_events (
      idempotency_key TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT NOT NULL UNIQUE,
      subscription_json TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_success_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS push_preferences (
      key TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
  `);

  const attemptColumns = db.prepare('PRAGMA table_info(lift_attempts)').all().map(column => column.name);
  if (!attemptColumns.includes('rep_sequence_json')) {
    db.exec('ALTER TABLE lift_attempts ADD COLUMN rep_sequence_json TEXT');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS lift_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL REFERENCES lift_attempts(id) ON DELETE CASCADE,
      set_number INTEGER NOT NULL,
      target_weight_lb REAL,
      actual_weight_lb REAL,
      target_reps INTEGER,
      actual_reps INTEGER,
      status TEXT NOT NULL DEFAULT 'complete'
        CHECK(status IN ('planned', 'complete', 'partial', 'missed', 'skipped')),
      rpe REAL,
      rir REAL,
      notes TEXT,
      UNIQUE(attempt_id, set_number)
    );

    CREATE INDEX IF NOT EXISTS lift_sets_attempt_idx ON lift_sets(attempt_id, set_number);

    CREATE TABLE IF NOT EXISTS session_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO schema_migrations(version) VALUES (2);
  `);

  const sessionColumns = db.prepare('PRAGMA table_info(sessions)').all().map(column => column.name);
  if (!sessionColumns.includes('session_kind')) {
    db.exec("ALTER TABLE sessions ADD COLUMN session_kind TEXT NOT NULL DEFAULT 'programmed'");
  }
  if (!sessionColumns.includes('rotation_day')) {
    db.exec('ALTER TABLE sessions ADD COLUMN rotation_day TEXT');
  }
  if (!sessionColumns.includes('advances_rotation')) {
    db.exec('ALTER TABLE sessions ADD COLUMN advances_rotation INTEGER NOT NULL DEFAULT 1');
  }
  db.exec(`
    UPDATE sessions
    SET session_kind = CASE WHEN day_type = 'Custom' THEN 'custom' ELSE 'programmed' END,
        rotation_day = CASE WHEN day_type IN ('Day 1', 'Day 2', 'Day 3') THEN day_type ELSE NULL END,
        advances_rotation = CASE WHEN day_type IN ('Day 1', 'Day 2', 'Day 3') THEN 1 ELSE 0 END
    WHERE session_kind IS NULL OR rotation_day IS NULL;
    INSERT OR IGNORE INTO schema_migrations(version) VALUES (3);
  `);

  db.exec('INSERT OR IGNORE INTO schema_migrations(version) VALUES (4);');

  backfillLiftSets(db);
}

function backfillLiftSets(db) {
  const attempts = db.prepare(`
    SELECT a.* FROM lift_attempts a
    WHERE NOT EXISTS (SELECT 1 FROM lift_sets s WHERE s.attempt_id = a.id)
  `).all();
  const insert = db.prepare(`
    INSERT INTO lift_sets
      (attempt_id, set_number, target_weight_lb, actual_weight_lb, target_reps, actual_reps, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  transaction(db, () => {
    for (const attempt of attempts) {
      const sequence = attempt.rep_sequence_json ? JSON.parse(attempt.rep_sequence_json) : null;
      const setCount = Number(attempt.actual_sets ?? attempt.target_sets ?? sequence?.length ?? 0);
      for (let index = 0; index < setCount; index += 1) {
        const reps = Array.isArray(sequence) ? Number(sequence[index] ?? 0) : attempt.actual_reps;
        insert.run(
          attempt.id,
          index + 1,
          attempt.target_weight_lb ?? attempt.added_weight_lb,
          attempt.actual_weight_lb ?? attempt.added_weight_lb,
          attempt.target_reps,
          reps,
          attempt.outcome,
        );
      }
    }
  });
}

export function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getState(db, key, fallback = null) {
  const row = db.prepare('SELECT value_json FROM app_state WHERE key = ?').get(key);
  return row ? JSON.parse(row.value_json) : fallback;
}

export function setState(db, key, value) {
  db.prepare(`
    INSERT INTO app_state(key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP
  `).run(key, JSON.stringify(value));
}
