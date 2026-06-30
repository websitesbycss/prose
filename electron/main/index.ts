import { app, BrowserWindow, shell, ipcMain, session } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { initSettingsDb, closeSettingsDb, getSettingJson, setSetting } from './services/settingsDb'
import { initIndexDb, closeIndexDb } from './services/indexDb'
import { ensureDocumentsFolderExists, isDocumentsFolderAccessible, rebuildIndexFromFolder, renameUuidSuffixedFiles } from './services/fileService'
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
import { registerSpellHandlers } from './ipc/spell'
import { registerSlidesHandlers } from './ipc/slides'
import { registerSlidesExportHandlers } from './ipc/slidesExport'
import { registerSlidesImportHandlers } from './ipc/slidesImport'
import { registerThumbnailHandlers } from './ipc/thumbnails'
import { registerFileAssociation } from './services/fileAssociation'
import { registerWindowHandlers, initPaths } from './ipc/windows'
import { windowChromeOptions, applyTitleBarOverlay } from './windowChrome'
import { autoUpdater } from 'electron-updater'

const APP_ICON = join(__dirname, '../../resources/icons/prose.ico')

// Pending file open from OS (before window is ready or while running)
let pendingFileOpen: string | null = null

interface SavedBounds { x: number; y: number; width: number; height: number; isMaximized: boolean }

function createMainWindow(): BrowserWindow {
  const saved = getSettingJson<SavedBounds | null>('windowBounds', null)
  const bounds = saved ?? { width: 1280, height: 800 }

  const win = new BrowserWindow({
    ...(saved?.x != null ? { x: saved.x, y: saved.y } : {}),
    width: bounds.width,
    height: bounds.height,
    minWidth: 960,
    minHeight: 600,
    ...windowChromeOptions(),
    show: false,
    autoHideMenuBar: true,
    ...(existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (saved?.isMaximized) win.maximize()

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
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(url).catch(() => {})
      }
    } catch { /* malformed URL — ignore */ }
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed = devUrl ? url.startsWith(devUrl) : url.startsWith('file://')
    if (!allowed) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
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
  // Prose never needs camera/mic/geolocation/notifications — deny every
  // permission request outright rather than relying on Electron's defaults.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  // Register .prose file association so double-click works without an installer
  registerFileAssociation()

  try {
    initSettingsDb()
    initIndexDb()
    await ensureDocumentsFolderExists()

    // Rename legacy UUID-suffixed files and rebuild word counts in the
    // background. Runs async so it doesn't block window creation.
    void renameUuidSuffixedFiles().then(() => rebuildIndexFromFolder())

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
    registerSpellHandlers()
    registerSlidesHandlers()
    registerSlidesExportHandlers()
    registerSlidesImportHandlers()
    registerThumbnailHandlers()
    initPaths(
      join(__dirname, '../preload/index.js'),
      join(__dirname, '../renderer/index.html'),
      process.env['ELECTRON_RENDERER_URL'],
    )
    registerWindowHandlers()

    ipcMain.handle('documents:folderAccessible', () => isDocumentsFolderAccessible())

  } catch (err) {
    console.error('Startup error:', err)
    app.quit()
    return
  }

  createMainWindow()

  // Run migration after window is created so it can display progress
  checkAndRunMigration().catch((err) => {
    console.error('Migration check failed:', err)
  })

  const fileArg = process.argv.find((arg) => arg.endsWith('.prose') && arg !== process.execPath)
  if (fileArg) pendingFileOpen = fileArg

  if (app.isPackaged) {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('Auto-update check failed:', err)
    })
  }

  void ollamaManager.start().catch((err) => {
    console.error('Ollama start error:', err)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
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
