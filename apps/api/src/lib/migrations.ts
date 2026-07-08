import type { Env } from './env.js';
import { getDb, schema } from './db.js';

const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: 'initial_schema',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        name TEXT,
        image TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        filename TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        mime TEXT NOT NULL,
        duration_sec INTEGER,
        storage_path TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        progress_json TEXT,
        asr_provider TEXT NOT NULL,
        asr_model TEXT,
        diarization_provider TEXT NOT NULL,
        llm_provider TEXT NOT NULL,
        llm_model TEXT,
        error TEXT,
        starred INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        completed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS uploads_user_idx ON uploads(user_id);
      CREATE INDEX IF NOT EXISTS uploads_status_idx ON uploads(status);

      CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE UNIQUE,
        language TEXT NOT NULL,
        full_text TEXT NOT NULL,
        segments_json TEXT NOT NULL,
        speakers_json TEXT NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE UNIQUE,
        summary TEXT NOT NULL,
        key_points_json TEXT NOT NULL,
        action_items_json TEXT NOT NULL,
        decisions_json TEXT NOT NULL,
        chapters_json TEXT NOT NULL,
        highlights_json TEXT NOT NULL,
        llm_model TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#FF6B35',
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS tags_user_name_idx ON tags(user_id, name);

      CREATE TABLE IF NOT EXISTS upload_tags (
        upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (upload_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS speaker_labels (
        id TEXT PRIMARY KEY,
        upload_id TEXT NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
        original_label TEXT NOT NULL,
        custom_name TEXT,
        suggested_name TEXT,
        confirmed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS speaker_labels_upload_label_idx
        ON speaker_labels(upload_id, original_label);

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts(user_id);

      CREATE TABLE IF NOT EXISTS verifications (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
    `,
  },
];

const COLUMN_MIGRATIONS: Array<{
  name: string;
  table: string;
  columns: Array<{ column: string; ddl: string }>;
  drops?: string[];
  indexSql?: string;
}> = [
  {
    name: 'add_better_auth_user_columns',
    table: 'users',
    // SQLite ALTER TABLE ADD COLUMN requires CONSTANT defaults — can't
    // use unixepoch(). So we add columns as NULLABLE; the Drizzle
    // schema and app code treat them as nullable on read and set
    // them as needed.
    columns: [
      { column: 'email_verified', ddl: 'INTEGER' },
      { column: 'image', ddl: 'TEXT' },
      { column: 'updated_at', ddl: 'INTEGER' },
    ],
    // Old v1 schema had password_hash on users. Better-Auth stores
    // credentials in accounts.password, so this column is dead weight
    // AND a footgun: any new code that still references it gets a
    // NOT NULL violation. Drop it on existing DBs.
    drops: ['password_hash'],
  },
  {
    name: 'add_better_auth_session_columns',
    table: 'sessions',
    columns: [
      { column: 'token', ddl: 'TEXT' },
      { column: 'ip_address', ddl: 'TEXT' },
      { column: 'user_agent', ddl: 'TEXT' },
      { column: 'updated_at', ddl: 'INTEGER' },
    ],
    indexSql: 'CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token)',
  },
];

export function runMigrations(env: Env) {
  const db = getDb(env);
  const sqlite = (db as any)._sqlite as import('better-sqlite3').Database;
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    )`,
  );
  const applied = new Set(
    sqlite.prepare('SELECT name FROM _migrations').all().map((r: any) => r.name),
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.name)) continue;
    sqlite.exec('BEGIN');
    try {
      sqlite.exec(m.sql);
      sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(m.name);
      sqlite.exec('COMMIT');
      console.log(`[migrations] applied: ${m.name}`);
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }
  for (const cm of COLUMN_MIGRATIONS) {
    if (applied.has(cm.name)) continue;
    const existing = new Set(
      sqlite
        .prepare(`SELECT name FROM pragma_table_info('${cm.table}')`)
        .all()
        .map((r: any) => r.name),
    );
    let added = 0;
    let dropped = 0;
    sqlite.exec('BEGIN');
    try {
      for (const col of cm.columns) {
        if (existing.has(col.column)) continue;
        sqlite.exec(`ALTER TABLE ${cm.table} ADD COLUMN ${col.column} ${col.ddl}`);
        added++;
      }
      for (const col of cm.drops ?? []) {
        if (!existing.has(col)) continue;
        sqlite.exec(`ALTER TABLE ${cm.table} DROP COLUMN ${col}`);
        dropped++;
      }
      if (cm.indexSql) sqlite.exec(cm.indexSql);
      sqlite.prepare('INSERT INTO _migrations (name) VALUES (?)').run(cm.name);
      sqlite.exec('COMMIT');
      console.log(
        `[migrations] applied: ${cm.name} (${added} added, ${dropped} dropped)`,
      );
    } catch (err) {
      sqlite.exec('ROLLBACK');
      throw err;
    }
  }
}

export { schema };