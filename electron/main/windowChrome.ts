import type { BrowserWindow, BrowserWindowConstructorOptions, TitleBarOverlayOptions } from 'electron'
import { resolveEffectiveTheme } from './services/settingsDb'

export const TITLE_BAR_HEIGHT = 40

/** Shared frameless + native overlay options for Prose windows. */
export function windowChromeOptions(): Pick<
  BrowserWindowConstructorOptions,
  'frame' | 'titleBarStyle' | 'titleBarOverlay'
> {
  if (process.platform === 'win32') {
    return {
      frame: false,
      titleBarStyle: 'hidden',
      // Matches the saved theme, or the OS preference on first launch — never
      // hardcoded — so the native title bar never flashes the wrong theme.
      titleBarOverlay: titleBarOverlayForTheme(resolveEffectiveTheme()),
    }
  }
  return { frame: false }
}

// Always returns a concrete options object (never the boolean shorthand
// setTitleBarOverlay also structurally allows) — setTitleBarOverlay's own
// parameter type is narrower than BrowserWindowConstructorOptions['titleBarOverlay']
// (no boolean), so this needs its own precise return type rather than
// reusing that wider constructor-options type.
export function titleBarOverlayForTheme(theme: 'dark' | 'light'): TitleBarOverlayOptions {
  return {
    color: '#00000000',
    symbolColor: theme === 'dark' ? '#e8e8e8' : '#1a1a1a',
    height: TITLE_BAR_HEIGHT,
  }
}

export function applyTitleBarOverlay(win: BrowserWindow, theme: 'dark' | 'light' = 'dark'): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return
  win.setTitleBarOverlay(titleBarOverlayForTheme(theme))
}
