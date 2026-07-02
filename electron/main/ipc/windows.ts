import { ipcMain, BrowserWindow, screen, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { resolveDocument } from '../services/fileService'
import { applyTitleBarOverlay, windowChromeOptions } from '../windowChrome'

const APP_ICON = join(__dirname, '../../../resources/icons/prose.ico')

let _preloadPath = join(__dirname, '../preload/index.js')
let _rendererPath = join(__dirname, '../renderer/index.html')
let _devUrl: string | undefined

export function initPaths(preloadPath: string, rendererPath: string, devUrl?: string): void {
  _preloadPath = preloadPath
  _rendererPath = rendererPath
  _devUrl = devUrl
}

interface TabBarRect {
  x: number
  y: number
  width: number
  height: number
}

const tabBarBounds = new Map<number, TabBarRect>()
// Tracks which webContents already have an unconditional cleanup registered,
// so a stale rect can't outlive its window regardless of whether that window
// ever subscribed to fullscreen events (tabBarBounds used to only get
// cleaned up as a side effect of window:subscribeLeaveFullscreen's own
// 'destroyed' handler — a window that never called it left its bounds in
// the map forever, making merge-drag silently target a closed window).
const tabBarBoundsCleanupRegistered = new Set<number>()

let detachStarting = false
let detach: {
  docId: string
  sourceWinId: number
  sourceWcId: number
  win: BrowserWindow | null
  preview: BrowserWindow | null
  interval: ReturnType<typeof setInterval>
  tabTitle: string
  hoverWcId: number | null
  grabOffsetX: number
  grabOffsetY: number
} | null = null

export function createProseWindow(docId?: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    ...windowChromeOptions(),
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
      const isExternal = (parsed.protocol === 'https:' || parsed.protocol === 'http:')
        && !parsed.hostname.endsWith('.internal')
      if (isExternal) shell.openExternal(url).catch(() => {})
    } catch { /* ignore */ }
    return { action: 'deny' }
  })

  return win
}

let moveInterval: ReturnType<typeof setInterval> | null = null

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

function createDragPreview(title: string): BrowserWindow {
  const preview = new BrowserWindow({
    width: 240,
    height: 40,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  preview.setIgnoreMouseEvents(true)
  const safe = title.replace(/[<>&"']/g, '')
  void preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
    `<body style="margin:0;font:12px system-ui;background:rgba(30,30,30,.92);color:#fff;border-radius:8px;padding:10px 12px;box-shadow:0 4px 16px rgba(0,0,0,.35);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${safe}</body>`,
  )}`)
  return preview
}

function expandedRect(r: TabBarRect, pad: number): TabBarRect {
  return { x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2 }
}

function pointInRect(x: number, y: number, r: TabBarRect): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}

function findTabBarAtPoint(x: number, y: number, excludeWcId?: number): { wcId: number; rect: TabBarRect } | null {
  for (const [wcId, rect] of tabBarBounds) {
    if (wcId === excludeWcId) continue
    if (pointInRect(x, y, rect)) return { wcId, rect }
  }
  return null
}

function stopDetach(): void {
  if (!detach) return
  clearInterval(detach.interval)
  if (detach.hoverWcId !== null) {
    const prevWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === detach!.hoverWcId)
    prevWin?.webContents.send('tabdrag:dropHover', { active: false })
  }
  if (detach.win && !detach.win.isDestroyed()) detach.win.close()
  if (detach.preview && !detach.preview.isDestroyed()) detach.preview.close()
  detach = null
}

export function registerWindowHandlers(): void {
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

  ipcMain.handle('window:setTitleBarOverlay', (event, theme: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    applyTitleBarOverlay(win, theme === 'light' ? 'light' : 'dark')
  })

  ipcMain.handle('window:usesNativeControls', () => process.platform === 'win32')

  ipcMain.handle('window:getContentScreenOffset', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { x: 0, y: 0 }
    const b = win.getBounds()
    return { x: b.x, y: b.y }
  })

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

  ipcMain.handle('window:setSnapLayout', (event, layout: unknown) => {
    if (typeof layout !== 'string') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (layout === 'maximize') { win.maximize(); return }
    const display = screen.getDisplayMatching(win.getBounds())
    const { x: wx, y: wy, width: ww, height: wh } = display.workArea
    const h1 = Math.round(ww / 2), h2 = ww - h1
    const t1 = Math.round(ww / 3), t2 = ww - 2 * t1
    const q1 = Math.round(ww / 4)
    const snap: Record<string, { x: number; y: number; width: number; height: number }> = {
      'left-half':        { x: wx,          y: wy, width: h1,         height: wh },
      'right-half':       { x: wx + h1,     y: wy, width: h2,         height: wh },
      'left-two-thirds':  { x: wx,          y: wy, width: t1 * 2,     height: wh },
      'center-half':      { x: wx + q1,     y: wy, width: h1,         height: wh },
      'right-two-thirds': { x: wx + t1,     y: wy, width: t1 + t2,    height: wh },
      'left-third':       { x: wx,          y: wy, width: t1,         height: wh },
      'center-third':     { x: wx + t1,     y: wy, width: t1,         height: wh },
      'right-third':      { x: wx + t1 * 2, y: wy, width: t2,         height: wh },
    }
    const b = snap[layout]
    if (!b) return
    if (win.isMaximized()) win.unmaximize()
    win.setBounds(b, true)
  })

  ipcMain.handle('window:isFullscreen', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isFullScreen() ?? false
  })

  const leaveFullscreenSubs = new Map<number, { enter: () => void; leave: () => void }>()
  ipcMain.on('window:subscribeLeaveFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const wcId = event.sender.id
    const existing = leaveFullscreenSubs.get(wcId)
    if (existing && !win.isDestroyed()) {
      win.off('enter-full-screen', existing.enter)
      win.off('leave-full-screen', existing.leave)
    }
    let entered = false
    const enter = (): void => { entered = true }
    const leave = (): void => {
      if (!entered) return
      entered = false
      if (!event.sender.isDestroyed()) event.sender.send('window:leave-fullscreen')
    }
    win.on('enter-full-screen', enter)
    win.on('leave-full-screen', leave)
    leaveFullscreenSubs.set(wcId, { enter, leave })
    event.sender.once('destroyed', () => {
      if (!win.isDestroyed()) { win.off('enter-full-screen', enter); win.off('leave-full-screen', leave) }
      leaveFullscreenSubs.delete(wcId)
      tabBarBounds.delete(wcId)
    })
  })
  ipcMain.on('window:unsubscribeLeaveFullscreen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const sub = leaveFullscreenSubs.get(event.sender.id)
    if (win && sub) { win.off('enter-full-screen', sub.enter); win.off('leave-full-screen', sub.leave) }
    leaveFullscreenSubs.delete(event.sender.id)
  })

  ipcMain.on('tabdrag:registerTabBarBounds', (event, rect: TabBarRect | { left: number; top: number; width: number; height: number }) => {
    if (!rect || typeof rect.width !== 'number') return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const wcId = event.sender.id
    const winBounds = win.getBounds()
    const screenRect: TabBarRect =
      'left' in rect
        ? {
            x: winBounds.x + Math.round(rect.left),
            y: winBounds.y + Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
        : {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          }
    tabBarBounds.set(wcId, screenRect)
    if (!tabBarBoundsCleanupRegistered.has(wcId)) {
      tabBarBoundsCleanupRegistered.add(wcId)
      event.sender.once('destroyed', () => {
        tabBarBounds.delete(wcId)
        tabBarBoundsCleanupRegistered.delete(wcId)
      })
    }
  })

  ipcMain.on('tabdrag:detach', (event, docId: string, opts?: { grabOffsetX?: number; grabOffsetY?: number }) => {
    if (typeof docId !== 'string' || !docId || detach || detachStarting) return
    const sourceWin = BrowserWindow.fromWebContents(event.sender)
    if (!sourceWin) return
    // Set synchronously — resolveDocument() below is async, so without this
    // a second 'tabdrag:detach' arriving before it resolves would pass the
    // `detach` check above (still null) and spawn a duplicate window.
    detachStarting = true

    void resolveDocument(docId).then((resolved) => {
      detachStarting = false
      if (!resolved || detach) return
      const tabTitle = resolved.doc.title || 'Untitled'
      const preview = createDragPreview(tabTitle)

      preview.once('ready-to-show', () => {
        if (!preview.isDestroyed()) preview.show()
      })

      const sourceBounds = tabBarBounds.get(event.sender.id)
      let hoverWcId: number | null = null

      const interval = setInterval(() => {
        if (!detach) { clearInterval(interval); return }

        const pos = screen.getCursorScreenPoint()

        if (detach.preview && !detach.preview.isDestroyed()) {
          detach.preview.setPosition(Math.max(0, pos.x - 20), Math.max(0, pos.y - 12))
        }

        const mergeTarget = findTabBarAtPoint(pos.x, pos.y, detach.sourceWcId)
        if (mergeTarget) {
          if (hoverWcId !== mergeTarget.wcId) {
            if (hoverWcId !== null) {
              const prevWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === hoverWcId)
              prevWin?.webContents.send('tabdrag:dropHover', { active: false })
            }
            hoverWcId = mergeTarget.wcId
            detach.hoverWcId = hoverWcId
          }
          const targetWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === mergeTarget.wcId)
          targetWin?.webContents.send('tabdrag:dropHover', { active: true, screenX: pos.x })
        } else if (hoverWcId !== null) {
          const prevWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === hoverWcId)
          prevWin?.webContents.send('tabdrag:dropHover', { active: false })
          hoverWcId = null
          detach.hoverWcId = null
        }

        if (!sourceWin.isDestroyed() && sourceBounds) {
          const snapZone = expandedRect(sourceBounds, 50)
          if (pointInRect(pos.x, pos.y, snapZone)) {
            sourceWin.webContents.send('tabdrag:return', { screenX: pos.x })
          }
        }
      }, 16)

      detach = {
        docId,
        sourceWinId: sourceWin.id,
        sourceWcId: event.sender.id,
        win: null,
        preview,
        interval,
        tabTitle,
        hoverWcId: null,
        grabOffsetX: opts?.grabOffsetX ?? 0,
        grabOffsetY: opts?.grabOffsetY ?? 0,
      }
    }).catch(() => {
      detachStarting = false
    })
  })

  ipcMain.on('tabdrag:cancel', () => {
    stopDetach()
  })

  ipcMain.on('tabdrag:checkMerge', (event, { screenX, screenY, docId }: { screenX: number; screenY: number; docId: string }) => {
    const mergeTarget = findTabBarAtPoint(screenX, screenY, event.sender.id)
    if (!mergeTarget) return
    const targetWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === mergeTarget.wcId)
    if (!targetWin || targetWin.isDestroyed()) return
    targetWin.webContents.send('tabdrag:merge', { docId, screenX })
    event.sender.send('tabdrag:detached', { docId })
  })

  ipcMain.on('tabdrag:finalize', (event, pos?: { screenX?: number; screenY?: number }) => {
    if (!detach) return
    clearInterval(detach.interval)

    const x = typeof pos?.screenX === 'number' ? pos.screenX : screen.getCursorScreenPoint().x
    const y = typeof pos?.screenY === 'number' ? pos.screenY : screen.getCursorScreenPoint().y

    const mergeTarget = findTabBarAtPoint(x, y, detach.sourceWcId)
    const sourceBounds = tabBarBounds.get(detach.sourceWcId)
    const inSnapBack = sourceBounds && pointInRect(x, y, expandedRect(sourceBounds, 50))

    if (mergeTarget) {
      if (detach.hoverWcId !== null) {
        const hoverWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === detach!.hoverWcId)
        hoverWin?.webContents.send('tabdrag:dropHover', { active: false })
      }
      const targetWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === mergeTarget.wcId)
      targetWin?.webContents.send('tabdrag:merge', { docId: detach.docId, screenX: x })
      if (detach.win && !detach.win.isDestroyed()) detach.win.close()
      if (detach.preview && !detach.preview.isDestroyed()) detach.preview.close()
      event.sender.send('tabdrag:detached', { docId: detach.docId })
      detach = null
      return
    }

    if (inSnapBack) {
      stopDetach()
      event.sender.send('tabdrag:return', { screenX: x })
      return
    }

    const win = createProseWindow(detach.docId)
    const grabX = detach.grabOffsetX
    const grabY = detach.grabOffsetY
    win.once('ready-to-show', () => {
      if (win.isDestroyed()) return
      // Position the new window so the tab appears under the cursor at the same grab offset.
      // TAB_LEFT = home button (28px) + flex gap (6px) + small padding (~6px)
      const TAB_LEFT = 40
      const TAB_TOP = 8
      win.setPosition(Math.max(0, Math.round(x - TAB_LEFT - grabX)), Math.max(0, Math.round(y - TAB_TOP - grabY)))
      win.show()
    })
    if (detach.preview && !detach.preview.isDestroyed()) detach.preview.close()
    event.sender.send('tabdrag:detached', { docId: detach.docId })
    detach = null
  })
}
