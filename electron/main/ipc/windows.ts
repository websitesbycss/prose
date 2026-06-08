import { ipcMain, BrowserWindow, screen } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const APP_ICON = join(__dirname, '../../../resources/icons/prose.ico')

let _preloadPath = join(__dirname, '../preload/index.js')
let _rendererPath = join(__dirname, '../renderer/index.html')
let _devUrl: string | undefined

export function initPaths(preloadPath: string, rendererPath: string, devUrl?: string): void {
  _preloadPath = preloadPath
  _rendererPath = rendererPath
  _devUrl = devUrl
}

// Detach state for the Chrome-style tear-off
let detach: {
  docId: string
  sourceWinId: number
  win: BrowserWindow
  interval: ReturnType<typeof setInterval>
} | null = null

export function createProseWindow(docId?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    frame: false,
    show: false,
    autoHideMenuBar: true,
    ...(existsSync(APP_ICON) ? { icon: APP_ICON } : {}),
    webPreferences: {
      preload: _preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (_devUrl) {
    const url = docId ? `${_devUrl}#open=${encodeURIComponent(docId)}` : _devUrl
    void win.loadURL(url)
  } else {
    void win.loadFile(_rendererPath, {
      hash: docId ? `open=${encodeURIComponent(docId)}` : undefined,
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        void import('electron').then(({ shell }) => { void shell.openExternal(url) })
      }
    } catch { /* ignore */ }
    return { action: 'deny' }
  })

  return win
}

let moveInterval: ReturnType<typeof setInterval> | null = null

/** One maximize subscription per renderer WebContents — prevents listener leaks on tab switches. */
const maximizeSubscriptions = new Map<
  number,
  { win: BrowserWindow; onMax: () => void; onUnmax: () => void }
>()

function clearMaximizeSubscription(wcId: number): void {
  const sub = maximizeSubscriptions.get(wcId)
  if (!sub) return
  if (!sub.win.isDestroyed()) {
    sub.win.removeListener('maximize', sub.onMax)
    sub.win.removeListener('unmaximize', sub.onUnmax)
  }
  maximizeSubscriptions.delete(wcId)
}

export function registerWindowHandlers(): void {
  // Window control buttons
  ipcMain.on('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on('window:maximize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.maximize()
  })
  ipcMain.on('window:unmaximize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.unmaximize()
  })
  ipcMain.on('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
  // Subscribe to maximize state changes for a specific window.
  // Replacing an existing subscription for the same WebContents avoids
  // accumulating BrowserWindow listeners when React remounts WindowControls.
  ipcMain.on('window:subscribeMaximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const wcId = event.sender.id
    clearMaximizeSubscription(wcId)

    const onMax = (): void => {
      if (!event.sender.isDestroyed()) event.sender.send('window:maximize-change', true)
    }
    const onUnmax = (): void => {
      if (!event.sender.isDestroyed()) event.sender.send('window:maximize-change', false)
    }
    win.on('maximize', onMax)
    win.on('unmaximize', onUnmax)
    maximizeSubscriptions.set(wcId, { win, onMax, onUnmax })
    event.sender.once('destroyed', () => clearMaximizeSubscription(wcId))
  })

  ipcMain.on('window:unsubscribeMaximize', (event) => {
    clearMaximizeSubscription(event.sender.id)
  })

  // Single-tab window move: renderer sends offset on drag-out, main follows cursor.
  ipcMain.on('window:startMove', (event, { offsetX, offsetY }: { offsetX: number; offsetY: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (moveInterval) clearInterval(moveInterval)
    moveInterval = setInterval(() => {
      const pos = screen.getCursorScreenPoint()
      win.setPosition(pos.x - offsetX, pos.y - offsetY)
    }, 16)
  })

  ipcMain.on('window:stopMove', () => {
    if (moveInterval) { clearInterval(moveInterval); moveInterval = null }
  })

  ipcMain.on('window:setFullscreen', (event, fullscreen: boolean) => {
    BrowserWindow.fromWebContents(event.sender)?.setFullScreen(fullscreen)
  })

  ipcMain.handle('window:isFullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })
  // Renderer signals tear-off start: create a detached window and follow the cursor.
  ipcMain.on('tabdrag:detach', (event, docId: string) => {
    if (detach) return // already detaching
    const sourceWin = BrowserWindow.fromWebContents(event.sender)
    if (!sourceWin) return

    const cursor = screen.getCursorScreenPoint()
    const win = createProseWindow(docId)

    win.once('ready-to-show', () => {
      if (!win || win.isDestroyed()) return
      const [w] = win.getSize()
      win.setPosition(Math.max(0, cursor.x - Math.floor(w / 2)), Math.max(0, cursor.y - 20))
      win.show()
    })

    // Tab-bar area of the source window: approx top 50px of the window.
    // If the cursor returns there, cancel the tear-off and send tabdrag:return.
    const TAB_BAR_HEIGHT = 50

    const interval = setInterval(() => {
      if (!detach || win.isDestroyed()) { stopDetach(); return }

      const pos = screen.getCursorScreenPoint()

      // Move detached window so it follows the cursor (tab bar under cursor).
      const [w] = win.getSize()
      win.setPosition(Math.max(0, pos.x - Math.floor(w / 2)), Math.max(0, pos.y - 20))

      // If cursor returned to the source window's tab-bar area, auto-cancel.
      if (!sourceWin.isDestroyed()) {
        const sb = sourceWin.getBounds()
        const inTabBar =
          pos.x >= sb.x && pos.x <= sb.x + sb.width &&
          pos.y >= sb.y && pos.y <= sb.y + TAB_BAR_HEIGHT
        if (inTabBar) {
          win.close()
          clearInterval(interval)
          if (detach?.win === win) detach = null
          sourceWin.webContents.send('tabdrag:return', { screenX: pos.x })
        }
      }
    }, 16)

    detach = { docId, sourceWinId: sourceWin.id, win, interval }
  })

  // Renderer signals cancel (cursor returned to source strip via pointer events).
  ipcMain.on('tabdrag:cancel', () => {
    stopDetach()
  })

  // Renderer signals finalise: keep the new window, remove source tab.
  ipcMain.on('tabdrag:finalize', (event) => {
    if (!detach) return
    clearInterval(detach.interval)
    // Send tabdrag:detached to source so it removes the tab.
    event.sender.send('tabdrag:detached', { docId: detach.docId })
    detach = null // window lives on
  })
}

function stopDetach(): void {
  if (!detach) return
  clearInterval(detach.interval)
  if (!detach.win.isDestroyed()) detach.win.close()
  detach = null
}
