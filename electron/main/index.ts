import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { initSettingsDb, closeSettingsDb } from './services/settingsDb'
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

function createWindow(): BrowserWindow {
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
    // Deliver any file that was opened before the window was ready
    if (pendingFileOpen) {
      win.webContents.send('app:open-file', pendingFileOpen)
      pendingFileOpen = null
    }
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
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
    // Initialize databases first
    initSettingsDb()
    initIndexDb()

    // Ensure documents folder exists
    await ensureDocumentsFolderExists()

    // Register all IPC handlers
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

    // Documents folder accessibility check IPC
    ipcMain.handle('documents:folderAccessible', () => isDocumentsFolderAccessible())

  } catch (err) {
    console.error('Startup error:', err)
    app.quit()
    return
  }

  const win = createWindow()

  // Run migration after window is created so it can display progress
  checkAndRunMigration().catch((err) => {
    console.error('Migration check failed:', err)
  })

  // Handle .prose file passed as command-line arg on first launch (Windows)
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
