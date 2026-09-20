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
      // Matches the saved theme, or the OS preference on first launch. Never
      // hardcoded. So the native title bar never flashes the wrong theme.
      titleBarOverlay: titleBarOverlayForTheme(resolveEffectiveTheme()),
    }
  }
  return { frame: false }
}

// Always returns a concrete options object (never the boolean shorthand
// setTitleBarOverlay also structurally allows). setTitleBarOverlay's own
// parameter type is narrower than BrowserWindowConstructorOptions['titleBarOverlay']
// (no boolean), so this needs its own precise return type rather than
// reusing that wider constructor-options type.
export function titleBarOverlayForTheme(theme: 'dark' | 'light'): TitleBarOverlayOptions {
  return {
    // A fully transparent color (alpha 00) breaks Windows' automatic hover
    // highlight on the caption buttons. Most visibly in light mode, where it
    // stays invisible instead of darkening on hover (Electron #38431/#48193).
    // A fully opaque color fixes the hover but paints over the title bar's
    // own border-bottom underneath the buttons and shows a wrong-theme patch
    // during any brief theme mismatch. Alpha 01 (barely non-zero) gives
    // Windows a real base color to derive the hover shade from while staying
    // visually transparent, so the page's own background and border still
    // show through underneath.
    color: theme === 'dark' ? '#09090b01' : '#ffffff01',
    symbolColor: theme === 'dark' ? '#e8e8e8' : '#1a1a1a',
    height: TITLE_BAR_HEIGHT,
  }
}

export function applyTitleBarOverlay(win: BrowserWindow, theme: 'dark' | 'light' = 'dark'): void {
  if (process.platform !== 'win32' || win.isDestroyed()) return
  win.setTitleBarOverlay(titleBarOverlayForTheme(theme))
}
