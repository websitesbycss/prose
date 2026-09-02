import Database from 'better-sqlite3'
import { app, nativeTheme } from 'electron'
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
  db.pragma('foreign_keys = ON')
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

/**
 * The theme to use when nothing has been explicitly saved yet — i.e. on
 * first launch. Follows the OS's own light/dark preference (via Electron's
 * nativeTheme, backed by Windows' app theme / macOS's appearance setting)
 * rather than hardcoding 'dark', so the native title bar and any main-process
 * theme decision match what the renderer shows via prefers-color-scheme.
 */
export function resolveEffectiveTheme(): 'dark' | 'light' {
  const stored = getSettingJson<string | null>('theme', null)
  if (stored === 'dark' || stored === 'light') return stored
  try {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  } catch {
    return 'dark'
  }
}
