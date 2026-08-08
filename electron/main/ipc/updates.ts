import { ipcMain, app, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { getSetting, setSetting } from '../services/settingsDb'

// ── Auto-update flow ──────────────────────────────────────────────────────────
// Startup (packaged only): silently check → if a release is available, notify
// every window right away (before downloading anything) so the renderer can show
// its small bottom-left toast (Update / Remind me later / No thanks). Only once
// the user clicks Update does the download start; the same toast then walks
// through downloading → downloaded, ending on Restart to update.
// "No thanks" persists the skipped version so that release never re-prompts;
// "Remind me later" just dismisses (re-prompts next launch, since nothing was
// downloaded and startup re-checks every time).
// Settings → About also exposes a manual "Check for updates" — since that's
// already an explicit ask, it skips the available step and downloads right
// away, ending on the same "Restart to update" state.

const SKIPPED_VERSION_KEY = 'skippedUpdateVersion'

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; version: string; percent?: number }
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
    // A manual "Check for updates" click already implies consent to install —
    // skip straight to downloading. A silent startup check has no such consent
    // yet, so just announce availability and wait for the toast's Update click.
    if (manualCheckActive) {
      setStatus({ state: 'downloading', version: info.version, percent: 0 })
      autoUpdater.downloadUpdate().catch((err) => {
        setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Download failed' })
      })
    } else {
      setStatus({ state: 'available', version: info.version })
    }
  })
  autoUpdater.on('download-progress', (info) => {
    if (status.state !== 'downloading') return
    setStatus({ state: 'downloading', version: status.version, percent: Math.round(info.percent) })
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

  ipcMain.handle('updates:startDownload', () => {
    if (status.state !== 'available') return
    setStatus({ state: 'downloading', version: status.version, percent: 0 })
    autoUpdater.downloadUpdate().catch((err) => {
      setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Download failed' })
    })
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
