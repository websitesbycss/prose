import { app, BrowserWindow, shell, ipcMain, session } from 'electron'
import { resolve, isAbsolute } from 'path'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { initSettingsDb, closeSettingsDb, getSettingJson, setSetting } from './services/settingsDb'
import { initIndexDb, closeIndexDb } from './services/indexDb'
import { ensureDocumentsFolderExists, isDocumentsFolderAccessible } from './services/fileService'
import { ollamaManager } from './services/ollama'
import { registerDocumentHandlers } from './ipc/documents'
import { registerSettingsHandlers } from './ipc/settings'
import { registerCategoryHandlers } from './ipc/categories'
import { registerCitationHandlers } from './ipc/citations'
import { registerAiHandlers } from './ipc/ai'
import { registerExportHandlers } from './ipc/export'
import { registerOllamaHandlers } from './ipc/ollama'
import { registerDialogHandlers } from './ipc/dialog'
import { registerSnapshotHandlers } from './ipc/snapshots'
import { registerMigrationHandlers, checkAndRunMigration } from './ipc/migration'
import { registerImportHandlers } from './ipc/import'
import { registerFileAssociation } from './services/fileAssociation'

// Pending file open from OS (before window is ready or while running)
let pendingFileOpen: string | null = null

interface SavedBounds { x: number; y: number; width: number; height: number; isMaximized: boolean }

function createWindow(): BrowserWindow {
  const saved = getSettingJson<SavedBounds | null>('windowBounds', null)
  const bounds = saved ?? { width: 1280, height: 800 }

  const win = new BrowserWindow({
    ...(saved?.x != null ? { x: saved.x, y: saved.y } : {}),
    width: bounds.width,
    height: bounds.height,
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

  if (saved?.isMaximized) win.maximize()

  // Debounced save so rapid resize/move events don't hammer the DB
  let boundsTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleSaveBounds(): void {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(() => {
      if (win.isDestroyed()) return
      const b = win.getBounds()
      setSetting('windowBounds', JSON.stringify({ ...b, isMaximized: win.isMaximized() }))
    }, 500)
  }

  win.on('resize', scheduleSaveBounds)
  win.on('move', scheduleSaveBounds)
  // Flush immediately on close so the final state is always written
  win.on('close', () => {
    if (boundsTimer) { clearTimeout(boundsTimer); boundsTimer = null }
    if (!win.isDestroyed()) {
      const b = win.getBounds()
      setSetting('windowBounds', JSON.stringify({ ...b, isMaximized: win.isMaximized() }))
    }
  })

  win.on('ready-to-show', () => {
    win.show()
    if (pendingFileOpen) {
      win.webContents.send('app:open-file', pendingFileOpen)
      pendingFileOpen = null
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Only open http/https URLs externally; block file:// javascript: etc.
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url).catch(() => {})
      }
    } catch { /* malformed URL — ignore */ }
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Handle file-open events (macOS open-file / Windows second-instance)
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) {
    focused.webContents.send('app:open-file', filePath)
  } else {
    pendingFileOpen = filePath
  }
})

// Handle second-instance (Windows/Linux: user double-clicked a .prose file while app running)
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // On Windows, the file path is passed as a command-line argument
    const filePath = argv.find((arg) => arg.endsWith('.prose'))
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      if (filePath) win.webContents.send('app:open-file', filePath)
    } else if (filePath) {
      pendingFileOpen = filePath
    }
  })
}

app.whenReady().then(async () => {
  // Register .prose file association so double-click works without an installer
  registerFileAssociation()

  try {
    initSettingsDb()
    initIndexDb()
    await ensureDocumentsFolderExists()

    registerDocumentHandlers()
    registerSettingsHandlers()
    registerCategoryHandlers()
    registerCitationHandlers()
    registerAiHandlers(ollamaManager)
    registerExportHandlers()
    registerOllamaHandlers(ollamaManager)
    registerDialogHandlers()
    registerSnapshotHandlers()
    registerMigrationHandlers()
    registerImportHandlers()

    ipcMain.handle('documents:folderAccessible', () => isDocumentsFolderAccessible())

  } catch (err) {
    console.error('Startup error:', err)
    app.quit()
    return
  }

  // Content Security Policy — blocks inline script execution and restricts
  // resource loading to known-safe origins. Ollama on localhost:11434 is the
  // only permitted external connect target.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          [
            "default-src 'self'",
            "script-src 'self'",
            // KaTeX/styled-components require inline styles; fonts need data:
            "style-src 'self' 'unsafe-inline'",
            "font-src 'self' data:",
            "img-src 'self' data: blob:",
            // Ollama local API + same-origin only
            "connect-src 'self' http://localhost:11434",
            "media-src 'none'",
            "object-src 'none'",
            "frame-src 'none'",
            "base-uri 'self'",
            "form-action 'none'",
          ].join('; '),
        ],
      },
    })
  })

  const win = createWindow()

  // Run migration after window is created so it can display progress
  checkAndRunMigration().catch((err) => {
    console.error('Migration check failed:', err)
  })

  const fileArg = process.argv.find((arg) => arg.endsWith('.prose') && arg !== process.execPath)
  if (fileArg) pendingFileOpen = fileArg

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('Auto-update check failed:', err)
    })
  }

  void ollamaManager.start().catch((err) => {
    console.error('Ollama start error:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  ollamaManager.stop()
  closeSettingsDb()
  closeIndexDb()
})
