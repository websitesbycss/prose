import { ipcMain, app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getSetting, setSetting } from '../services/settingsDb'

// ── Auto-update flow ──────────────────────────────────────────────────────────
// Startup (packaged only): silently check → download in the background → once
// the update is fully downloaded, notify every window so the renderer can show
// its small bottom-left toast (Restart to update / Remind me later / No thanks).
// "No thanks" persists the skipped version so that release never re-prompts;
// "Remind me later" just dismisses (re-prompts next launch).
// Settings → About also exposes a manual "Check for updates", which reuses the
// same pipeline but reports terminal states (up to date / error) back too, and
// ignores the skipped-version preference (an explicit check means "tell me").

const SKIPPED_VERSION_KEY = 'skippedUpdateVersion'

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; version: string }
  | { state: 'downloaded'; version: string }
  | { state: 'up-to-date' }
  | { state: 'error'; message: string }

let status: UpdateStatus = { state: 'idle' }
let manualCheckActive = false

function broadcast(): void {
  const skipped = getSetting(SKIPPED_VERSION_KEY) ?? null
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('updates:status', { ...status, skippedVersion: skipped, manual: manualCheckActive })
  }
}

function setStatus(next: UpdateStatus): void {
  status = next
  broadcast()
}

export function registerUpdateHandlers(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => setStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => {
    setStatus({ state: 'downloading', version: info.version })
    autoUpdater.downloadUpdate().catch((err) => {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Download failed' })
    })
  })
  autoUpdater.on('update-not-available', () => {
    setStatus({ state: 'up-to-date' })
    manualCheckActive = false
  })
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({ state: 'downloaded', version: info.version })
    manualCheckActive = false
  })
  autoUpdater.on('error', (err) => {
    // Startup checks fail quietly (offline is normal for this app); manual
    // checks surface the failure in the Settings UI.
    setStatus({ state: 'error', message: err.message })
    manualCheckActive = false
  })

  ipcMain.handle('updates:getState', () => ({
    ...status,
    skippedVersion: getSetting(SKIPPED_VERSION_KEY) ?? null,
    currentVersion: app.getVersion(),
  }))

  ipcMain.handle('updates:check', async (): Promise<void> => {
    if (!app.isPackaged) return
    if (status.state === 'checking' || status.state === 'downloading') return
    manualCheckActive = true
    try {
      await autoUpdater.checkForUpdates()
    } catch {
      // 'error' event already updated status
    }
  })

  ipcMain.handle('updates:install', () => {
    if (status.state !== 'downloaded') return
    autoUpdater.quitAndInstall()
  })

  ipcMain.handle('updates:skipVersion', (_e, version: unknown) => {
    if (typeof version !== 'string' || !version) return
    setSetting(SKIPPED_VERSION_KEY, version)
  })
}

/** Silent background check on startup — packaged builds only. */
export function checkForUpdatesOnStartup(): void {
  if (!app.isPackaged) return
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Auto-update check failed:', err)
  })
}
