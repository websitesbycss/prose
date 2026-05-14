import { ipcMain, BrowserWindow } from 'electron'
import type { Database } from 'better-sqlite3'
import type { OllamaManager } from '../services/ollama'
import { isOllamaInstalled, downloadAndInstallOllama } from '../services/ollamaInstaller'

function getModel(db: Database): string {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = 'ollamaModel'")
    .get() as { value: string } | undefined
  if (!row) return 'llama3.2:3b'
  try {
    return (JSON.parse(row.value) as string) || 'llama3.2:3b'
  } catch {
    return 'llama3.2:3b'
  }
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data)
  }
}

export function registerOllamaHandlers(db: Database, manager: OllamaManager): void {
  ipcMain.handle('ollama:checkInstalled', () => isOllamaInstalled())

  ipcMain.handle('ollama:listModels', async () => manager.listModels())

  ipcMain.handle('ollama:installOllama', async (): Promise<void> => {
    try {
      await downloadAndInstallOllama()
      // Start Ollama now that it's installed
      await manager.start()
    } catch (err) {
      console.error('Ollama install error:', err)
      sendToRenderer('ollama:install-progress', { percent: -1, status: 'error' })
      throw err
    }
  })

  ipcMain.handle('ollama:getDownloadStatus', async () => {
    const model = getModel(db)
    const downloaded = await manager.isModelDownloaded(model)
    return { downloaded, model }
  })

  ipcMain.handle('ollama:startDownload', async (): Promise<void> => {
    const model = getModel(db)
    try {
      for await (const progress of manager.pull(model)) {
        sendToRenderer('ollama:download-progress', progress)
      }
    } catch (err) {
      console.error('Model download error:', err)
      sendToRenderer('ollama:download-progress', { percent: -1, status: 'error' })
    }
  })
}
