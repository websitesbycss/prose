import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const INDEX_DB_FILE = 'prose-index.db'

let db: Database.Database | null = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    format TEXT NOT NULL DEFAULT 'none',
    word_count INTEGER NOT NULL DEFAULT 0,
    category_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'document'
  );

  CREATE INDEX IF NOT EXISTS idx_documents_updated ON documents(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#7F77DD',
    created_at TEXT NOT NULL
  );
`

export function initIndexDb(): void {
  const dbPath = join(app.getPath('userData'), INDEX_DB_FILE)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(SCHEMA)
  // Migration: add file_type column to existing databases (ALTER TABLE fails silently if already present)
  try { db.exec(`ALTER TABLE documents ADD COLUMN file_type TEXT NOT NULL DEFAULT 'document'`) } catch { /* already exists */ }
}

export function getIndexDb(): Database.Database {
  if (!db) throw new Error('Index database not initialized')
  return db
}

export function closeIndexDb(): void {
  db?.close()
  db = null
}

export interface IndexRow {
  id: string
  title: string
  file_path: string
  format: string
  word_count: number
  category_id: string | null
  created_at: string
  updated_at: string
  file_type: string
}

export function upsertIndex(row: IndexRow): void {
  getIndexDb()
    .prepare(`INSERT INTO documents (id, title, file_path, format, word_count, category_id, created_at, updated_at, file_type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                file_path = excluded.file_path,
                format = excluded.format,
                word_count = excluded.word_count,
                category_id = excluded.category_id,
                updated_at = excluded.updated_at,
                file_type = excluded.file_type`)
    .run(row.id, row.title, row.file_path, row.format, row.word_count, row.category_id, row.created_at, row.updated_at, row.file_type)
}

export function removeFromIndex(id: string): void {
  getIndexDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
}

export function getIndexRow(id: string): IndexRow | undefined {
  return getIndexDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as IndexRow | undefined
}

export function getAllIndexRows(): IndexRow[] {
  return getIndexDb()
    .prepare('SELECT * FROM documents ORDER BY updated_at DESC')
    .all() as IndexRow[]
}
