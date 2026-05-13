import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { initDatabase, getDb, closeDatabase } from './services/database'
import { registerDocumentHandlers } from './ipc/documents'
import { registerSettingsHandlers } from './ipc/settings'
import { registerAiHandlers } from './ipc/ai'
import { registerExportHandlers } from './ipc/export'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // Open external links in the system browser, never in the Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  try {
    initDatabase()
    const db = getDb()
    registerDocumentHandlers(db)
    registerSettingsHandlers(db)
    registerAiHandlers()
    registerExportHandlers()
  } catch (err) {
    console.error('Startup error:', err)
    app.quit()
    return
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  closeDatabase()
})
