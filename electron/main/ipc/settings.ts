import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'

// Full implementation in Phase 2
export function registerSettingsHandlers(_db: Database): void {
  ipcMain.handle('settings:get', () => ({}))
  ipcMain.handle('settings:set', () => undefined)
}
