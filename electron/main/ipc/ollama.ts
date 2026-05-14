import { ipcMain } from 'electron'

// Ollama process management and model download are implemented in Phase 7.
// These stubs keep the IPC surface consistent so the renderer can call them safely.
export function registerOllamaHandlers(): void {
  ipcMain.handle('ollama:getDownloadStatus', () => ({
    downloaded: false,
    model: 'llama3.2:3b',
  }))

  ipcMain.handle('ollama:startDownload', () => undefined)
}
