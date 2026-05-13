import { ipcMain } from 'electron'

// Full implementation in Phase 10
export function registerExportHandlers(): void {
  ipcMain.handle('export:toDocx', () => undefined)
  ipcMain.handle('export:toPdf', () => undefined)
  ipcMain.handle('export:toMarkdown', () => undefined)
  ipcMain.handle('export:toPlainText', () => undefined)
}
