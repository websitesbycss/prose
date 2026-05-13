import { ipcMain } from 'electron'

// Full implementation in Phase 7
export function registerAiHandlers(): void {
  ipcMain.handle('ai:prompt', () => '')
  ipcMain.handle('ai:getStatus', () => 'unavailable')
  ipcMain.handle('ai:streamPrompt', () => undefined)
}
