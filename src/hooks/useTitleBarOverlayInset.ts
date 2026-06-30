import { useEffect } from 'react'

const WIN_OVERLAY_WIDTH_FALLBACK_PX = 138
const MAX_OVERLAY_WIDTH_PX = 220

function overlayWidthPx(): number {
  const wco = navigator.windowControlsOverlay
  if (wco) {
    const rect = wco.getTitlebarAreaRect()
    if (rect.width > 0 && rect.width < window.innerWidth * 0.4) {
      return Math.round(rect.width)
    }
    const fromX = window.innerWidth - rect.x
    if (fromX > 0 && fromX < window.innerWidth * 0.4) {
      return Math.round(fromX)
    }
  }
  return WIN_OVERLAY_WIDTH_FALLBACK_PX
}

function applyInset(widthPx: number): void {
  const clamped = Math.min(Math.max(widthPx, 96), MAX_OVERLAY_WIDTH_PX)
  document.documentElement.style.setProperty('--titlebar-overlay-inset', `${clamped}px`)
}

/** Keep `--titlebar-overlay-inset` in sync with the native Windows control region. */
export function useTitleBarOverlayInset(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) {
      document.documentElement.style.removeProperty('--titlebar-overlay-inset')
      return
    }

    applyInset(overlayWidthPx())

    const wco = navigator.windowControlsOverlay
    if (!wco) return

    const update = (): void => applyInset(overlayWidthPx())
    wco.addEventListener('geometrychange', update)
    window.addEventListener('resize', update)
    return () => {
      wco.removeEventListener('geometrychange', update)
      window.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--titlebar-overlay-inset')
    }
  }, [enabled])
}

export function usesNativeWindowControls(): boolean {
  return window.prose?.platform === 'win32'
}
