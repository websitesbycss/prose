import { ipcMain, BrowserWindow } from 'electron'
import type { OllamaManager } from '../services/ollama'
import { isOllamaInstalled, downloadAndInstallOllama } from '../services/ollamaInstaller'
import { getSettingJson, setSetting } from '../services/settingsDb'

function getModel(): string {
  return getSettingJson<string>('ollamaModel', 'llama3.2:3b') || 'llama3.2:3b'
}

function sendToRenderer(channel: string, data: unknown): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

export function registerOllamaHandlers(manager: OllamaManager): void {
  ipcMain.handle('ollama:checkInstalled', () => isOllamaInstalled())

  ipcMain.handle('ollama:listModels', async () => manager.listModels())

  ipcMain.handle('ollama:installOllama', async (): Promise<void> => {
    try {
      await downloadAndInstallOllama()
      await manager.start()
    } catch (err) {
      console.error('Ollama install error:', err)
      sendToRenderer('ollama:install-progress', { percent: -1, status: 'error' })
      throw err
    }
  })

  ipcMain.handle('ollama:getDownloadStatus', async () => {
    const model = getModel()
    const downloaded = await manager.isModelDownloaded(model)
    if (downloaded) return { downloaded: true, model }

    // The configured model isn't available — check if any model is installed.
    // This handles users who already have a model (e.g. llama3.3) that differs
    // from the default or previously saved setting.
    const allModels = await manager.listModels()
    if (allModels.length > 0) {
      const found = allModels[0]!
      setSetting('ollamaModel', JSON.stringify(found))
      return { downloaded: true, model: found }
    }

    return { downloaded: false, model }
  })

  ipcMain.handle('ollama:startDownload', async (): Promise<void> => {
    const model = getModel()
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
