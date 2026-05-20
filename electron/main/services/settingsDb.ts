import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'

const SETTINGS_DB_FILE = 'prose-settings.db'

let db: Database.Database | null = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`

export function initSettingsDb(): void {
  const dbPath = join(app.getPath('userData'), SETTINGS_DB_FILE)
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
}

export function getSettingsDb(): Database.Database {
  if (!db) throw new Error('Settings database not initialized')
  return db
}

export function closeSettingsDb(): void {
  db?.close()
  db = null
}

export function getSetting(key: string): string | undefined {
  const db = getSettingsDb()
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value
}

export function setSetting(key: string, value: string): void {
  getSettingsDb()
    .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value)
}

export function getSettingJson<T>(key: string, fallback: T): T {
  const raw = getSetting(key)
  if (raw === undefined) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
