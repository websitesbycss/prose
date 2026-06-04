import { ipcMain, BrowserWindow, screen } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const APP_ICON = join(__dirname, '../../../resources/icons/prose.ico')

let dragInterval: ReturnType<typeof setInterval> | null = null
let activeDragDocId: string | null = null
let activeDragSourceWinId: number | null = null

export function createProseWindow(docId?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
    webPreferences: {
      preload: join(__dirname, '../../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    const url = docId ? `${devUrl}#open=${encodeURIComponent(docId)}` : devUrl
    void win.loadURL(url)
  } else {
    void win.loadFile(join(__dirname, '../../renderer/index.html'), {
      hash: docId ? `open=${encodeURIComponent(docId)}` : undefined,
    })
  }

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void import('electron').then(({ shell }) => shell.openExternal(url))
      }
    } catch { /* ignore */ }
    return { action: 'deny' }
  })

  return win
}

export function registerWindowHandlers(): void {
  ipcMain.on('tabdrag:start', (event, docId: string) => {
    activeDragDocId = docId
    activeDragSourceWinId = BrowserWindow.fromWebContents(event.sender)?.id ?? null
    startPolling()
  })

  ipcMain.on('tabdrag:end', (event, { docId, screenX, screenY }: { docId: string; screenX: number; screenY: number }) => {
    stopPolling()

    const sourceWin = BrowserWindow.fromWebContents(event.sender)
    if (!sourceWin) return

    const sb = sourceWin.getBounds()
    const inSource = screenX >= sb.x && screenX <= sb.x + sb.width && screenY >= sb.y && screenY <= sb.y + sb.height

    if (inSource) {
      // Drag ended inside the source window — no action needed.
      activeDragDocId = null
      activeDragSourceWinId = null
      return
    }

    // Check if dropped onto another Prose window.
    const targetWin = BrowserWindow.getAllWindows().find(w => {
      if (w.id === sourceWin.id || w.isDestroyed()) return false
      const b = w.getBounds()
      return screenX >= b.x && screenX <= b.x + b.width && screenY >= b.y && screenY <= b.y + b.height
    })

    if (targetWin) {
      targetWin.webContents.send('tabdrag:accept', { docId, screenX, screenY })
    } else {
      // Tear off into a brand-new window, positioned near the drop point.
      const newWin = createProseWindow(docId)
      newWin.once('ready-to-show', () => {
        newWin.setPosition(Math.max(0, screenX - 300), Math.max(0, screenY - 20))
        newWin.show()
      })
    }

    // Always tell the source to remove the tab after a successful detach.
    event.sender.send('tabdrag:detached', { docId })
    activeDragDocId = null
    activeDragSourceWinId = null
  })
}

function startPolling(): void {
  if (dragInterval) return
  const lastState = new Map<number, boolean>()

  dragInterval = setInterval(() => {
    if (!activeDragDocId) { stopPolling(); return }
    const pos = screen.getCursorScreenPoint()

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.id === activeDragSourceWinId || win.isDestroyed()) continue
      const b = win.getBounds()
      const inside = pos.x >= b.x && pos.x <= b.x + b.width && pos.y >= b.y && pos.y <= b.y + b.height

      // Only send when state changes, plus continuous screenX while inside for drop-index tracking.
      if (inside || lastState.get(win.id)) {
        win.webContents.send('tabdrag:hover', { inside, screenX: pos.x, screenY: pos.y })
      }
      lastState.set(win.id, inside)
    }
  }, 32)
}

function stopPolling(): void {
  if (dragInterval) { clearInterval(dragInterval); dragInterval = null }
  // Clear any active drop zones in all windows.
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('tabdrag:hover', { inside: false, screenX: 0, screenY: 0 })
  }
}
