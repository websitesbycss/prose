import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const DB_FILE_NAME = 'prose.db'

let db: Database.Database | null = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7F77DD',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '{}',
    format TEXT NOT NULL DEFAULT 'none',
    word_count_goal INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS citations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    fields TEXT NOT NULL,
    formatted TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

export function initDatabase(): void {
  const dbPath = join(app.getPath('userData'), DB_FILE_NAME)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database accessed before initialization')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
