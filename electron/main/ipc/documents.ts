import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'

// Full implementation in Phase 2
export function registerDocumentHandlers(_db: Database): void {
  ipcMain.handle('documents:getAll', () => [])
  ipcMain.handle('documents:getById', () => null)
  ipcMain.handle('documents:create', () => null)
  ipcMain.handle('documents:update', () => null)
  ipcMain.handle('documents:delete', () => undefined)
}
