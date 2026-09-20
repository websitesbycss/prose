import { ipcMain, BrowserWindow, screen, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { resolveDocument } from '../services/fileService'
import { applyTitleBarOverlay, windowChromeOptions } from '../windowChrome'
import { resolveEffectiveTheme } from '../services/settingsDb'

// electron-vite bundles every main-process file (this one included) into a
// single out/main/index.js, so __dirname here resolves the same as
// electron/main/index.ts's. One fewer '..' than the source file's own
// on-disk nesting under electron/main/ipc/ would suggest.
const APP_ICON = join(__dirname, '../../resources/icons/prose-icon.ico')

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
// 'destroyed' handler. A window that never called it left its bounds in
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
  lastHoverScreenX: number | null
  grabOffsetX: number
  grabOffsetY: number
} | null = null

export function createProseWindow(docId?: string, pos?: { x: number; y: number }): BrowserWindow {
  const win = new BrowserWindow({
    ...pos,
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    ...windowChromeOptions(),
    // Shown immediately (not gated on 'ready-to-show', which waits for the
    // page's first real paint) so a torn-off tab pops up as close to
    // instantly as Electron allows, instead of a few hundred ms of nothing
    // while a brand new renderer process boots the whole SPA from scratch.
    // backgroundColor matching the app's own theme means that gap reads as
    // "the window appeared, content is loading" instead of a jarring white
    // flash before anything paints.
    show: true,
    backgroundColor: resolveEffectiveTheme() === 'dark' ? '#09090b' : '#ffffff',
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

function createDragPreview(title: string, x: number, y: number): BrowserWindow {
  const preview = new BrowserWindow({
    x,
    y,
    width: 240,
    height: 40,
    frame: false,
    transparent: true,
    // 'screen-saver' keeps the preview above every window, including the
    // source Prose window itself, on Windows. Plain `alwaysOnTop: true`
    // (the default level) can still lose to another always-on-top window.
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  preview.setAlwaysOnTop(true, 'screen-saver')
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

  ipcMain.on('window:startMove', (event, { screenX, screenY }: { screenX: number; screenY: number }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    // Computed here, from the window's ACTUAL current bounds, rather than
    // having the renderer precompute an offset from a cached
    // getContentScreenOffset() result. That cache only refreshes on a
    // 'resize' event, so it went stale after any plain move (drag, snap,
    // manual reposition) with no resize involved. Using it made the window
    // jump to a wrong position (sometimes a different monitor entirely) the
    // instant a new drag started, and stay wrong for every drag after that.
    const bounds = win.getBounds()
    const offsetX = screenX - bounds.x
    const offsetY = screenY - bounds.y
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
    // Set synchronously. resolveDocument() below is async, so without this
    // a second 'tabdrag:detach' arriving before it resolves would pass the
    // `detach` check above (still null) and spawn a duplicate window.
    detachStarting = true

    const grabOffsetX = opts?.grabOffsetX ?? 0
    const grabOffsetY = opts?.grabOffsetY ?? 0

    void resolveDocument(docId).then((resolved) => {
      detachStarting = false
      if (!resolved || detach) return
      const tabTitle = resolved.doc.title || 'Untitled'
      // Anchor the ghost at the cursor's CURRENT position (not wherever the
      // drag started) using the same grab offset the tab was picked up by,
      // so it appears already attached under the mouse instead of flashing
      // at Electron's OS-default window placement for one frame, which,
      // pre-fix, was frequently a different monitor than the drag itself.
      const startPos = screen.getCursorScreenPoint()
      const preview = createDragPreview(tabTitle, startPos.x - grabOffsetX, startPos.y - grabOffsetY)

      preview.once('ready-to-show', () => {
        if (!preview.isDestroyed()) preview.show()
      })

      const sourceBounds = tabBarBounds.get(event.sender.id)
      let hoverWcId: number | null = null

      const interval = setInterval(() => {
        if (!detach) { clearInterval(interval); return }

        const pos = screen.getCursorScreenPoint()
        const mergeTarget = findTabBarAtPoint(pos.x, pos.y, detach.sourceWcId)

        if (detach.preview && !detach.preview.isDestroyed()) {
          // Hidden while hovering a valid merge target instead of left
          // floating on top of it. The target's own insertion-line +
          // highlighted strip (tabdrag:dropHover below) already shows where
          // the tab will land, so hiding the ghost reads as "it's already
          // landed there" rather than two separate previews fighting for
          // attention, closer to Chrome's snap-into-place feel.
          if (mergeTarget) {
            detach.preview.hide()
          } else {
            if (!detach.preview.isVisible()) detach.preview.show()
            // No Math.max(0, ...) clamp: screen coordinates are a signed
            // virtual-desktop space, and a monitor placed left of or above
            // the primary display has legitimately negative x/y. Clamping
            // to 0 pinned the ghost to the primary monitor and made it stop
            // tracking horizontal movement for anyone with that layout.
            detach.preview.setPosition(
              Math.round(pos.x - detach.grabOffsetX),
              Math.round(pos.y - detach.grabOffsetY),
            )
          }
        }

        if (mergeTarget) {
          if (hoverWcId !== mergeTarget.wcId) {
            if (hoverWcId !== null) {
              const prevWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === hoverWcId)
              prevWin?.webContents.send('tabdrag:dropHover', { active: false })
            }
            hoverWcId = mergeTarget.wcId
            detach.hoverWcId = hoverWcId
            detach.lastHoverScreenX = null
          }
          // Only send when the position actually changed since the last
          // send, not unconditionally every 16ms tick. The receiving tab
          // bar re-measures its whole DOM layout on every message, and
          // resending an unchanged position up to 60x/second was the main
          // source of the reported jitter while hovering to merge.
          if (detach.lastHoverScreenX !== pos.x) {
            detach.lastHoverScreenX = pos.x
            const targetWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === mergeTarget.wcId)
            targetWin?.webContents.send('tabdrag:dropHover', { active: true, screenX: pos.x })
          }
        } else if (hoverWcId !== null) {
          const prevWin = BrowserWindow.getAllWindows().find((w) => w.webContents.id === hoverWcId)
          prevWin?.webContents.send('tabdrag:dropHover', { active: false })
          hoverWcId = null
          detach.hoverWcId = null
          detach.lastHoverScreenX = null
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
        lastHoverScreenX: null,
        grabOffsetX,
        grabOffsetY,
      }
    }).catch(() => {
      detachStarting = false
      // resolveDocument failed (deleted mid-drag, index/file mismatch, etc.)
      // The renderer already flipped into 'detached' mode optimistically
      // (DocumentTabBar.tsx) with no way to know main gave up, so it would
      // otherwise be stuck forever with no ghost and no way to finalize.
      // Tell it to snap back to the strip, same as a normal cancel.
      if (!event.sender.isDestroyed()) {
        const pos = screen.getCursorScreenPoint()
        event.sender.send('tabdrag:return', { screenX: pos.x })
      }
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

    // Position the new window so the tab appears under the cursor at the same grab offset.
    // TAB_LEFT = home button (28px) + flex gap (6px) + small padding (~6px)
    const TAB_LEFT = 40
    const TAB_TOP = 8
    // No Math.max(0, ...) clamp: see the matching comment on the ghost
    // preview's positioning above. It broke placement on any monitor with
    // negative virtual-desktop coordinates. Passed straight into the
    // constructor (not set after 'ready-to-show') so the window never
    // visibly appears in the wrong spot before jumping to the right one.
    createProseWindow(detach.docId, {
      x: Math.round(x - TAB_LEFT - detach.grabOffsetX),
      y: Math.round(y - TAB_TOP - detach.grabOffsetY),
    })
    if (detach.preview && !detach.preview.isDestroyed()) detach.preview.close()
    event.sender.send('tabdrag:detached', { docId: detach.docId })
    detach = null
  })
}
