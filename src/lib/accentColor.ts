export const DEFAULT_LIGHT_ACCENT = '#2563eb'
export const DEFAULT_DARK_ACCENT  = '#60a5fa'

export const LIGHT_PRESETS = [
  { label: 'Blue',    hex: '#2563eb' },
  { label: 'Amber',   hex: '#efa02a' },
  { label: 'Violet',  hex: '#7c3aed' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Rose',    hex: '#e11d48' },
  { label: 'Pink',    hex: '#db2777' },
  { label: 'Cyan',    hex: '#0891b2' },
  { label: 'Slate',   hex: '#475569' },
] as const

export const DARK_PRESETS = [
  { label: 'Blue',    hex: '#60a5fa' },
  { label: 'Amber',   hex: '#f2b559' },
  { label: 'Violet',  hex: '#a78bfa' },
  { label: 'Emerald', hex: '#34d399' },
  { label: 'Rose',    hex: '#fb7185' },
  { label: 'Pink',    hex: '#f472b6' },
  { label: 'Cyan',    hex: '#22d3ee' },
  { label: 'Slate',   hex: '#94a3b8' },
] as const

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  return [h * 360, s * 100, l * 100]
}

function hexToHslVars(hex: string): string {
  const [h, s, l] = hexToHsl(hex)
  return `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100
  const ll = l / 100
  const a = sl * Math.min(ll, 1 - ll)
  const f = (n: number): string => {
    const k = (n + h / 30) % 12
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`
}

// Derives the full set of Excalidraw purple-family variables from one accent hex.
// Light mode: hex is the app's light accent (e.g. #2563eb).
// Dark  mode: hex is the app's dark  accent (e.g. #60a5fa).
function excalidrawPalette(hex: string, isDark: boolean): Record<string, string> {
  const [h, s, l] = hexToHsl(hex)

  if (!isDark) {
    return {
      '--color-primary':                  hex,
      '--color-primary-darker':           hslToHex(h, s, Math.max(0,   l - 10)),
      '--color-primary-darkest':          hslToHex(h, s, Math.max(0,   l - 20)),
      '--color-primary-light':            hslToHex(h, Math.min(100, s * 0.8 + 20), Math.min(100, l + 28)),
      '--color-primary-light-darker':     hslToHex(h, Math.min(100, s * 0.8 + 15), Math.min(100, l + 22)),
      '--color-primary-hover':            hslToHex(h, s, Math.max(0,   l - 7)),
      '--color-primary-contrast-offset':  hslToHex(h, s, Math.max(0,   l - 5)),
      // selection outline drawn around selected canvas elements
      '--color-selection':                hex,
      // surface tints used for button hover/active backgrounds and borders
      '--color-surface-high':             hsl(h, 20, 97),
      '--color-surface-mid':              hsl(h,  8, 97.5),
      '--color-surface-low':              hsl(h, 15, 95),
      '--color-brand-hover':              hslToHex(h, s, Math.max(0,   l - 7)),
      '--color-brand-active':             hslToHex(h, s, Math.max(0,   l - 15)),
      '--color-on-primary-container':     hslToHex(h, 80, 20),
      '--color-surface-primary-container':hslToHex(h, 80, 88),
      // opacity slider track and thumb tint
      '--color-slider-track':             hsl(h, 80, 90),
    }
  }

  return {
    '--color-primary':                  hex,
    '--color-primary-darker':           hslToHex(h, s, Math.min(100, l + 3)),
    '--color-primary-darkest':          hslToHex(h, s, Math.min(100, l + 8)),
    // in dark mode "light" is actually a dark muted variant
    '--color-primary-light':            hslToHex(h, Math.max(0, s - 60), Math.max(0, l - 45)),
    '--color-primary-light-darker':     hslToHex(h, Math.max(0, s - 65), Math.max(0, l - 50)),
    '--color-primary-hover':            hslToHex(h, s, Math.min(100, l + 8)),
    '--color-primary-contrast-offset':  hslToHex(h, s, Math.min(100, l + 5)),
    // selection outline (Excalidraw inverts it in dark mode via theme-filter)
    '--color-selection':                hslToHex(h, 80, 30),
    // surface tints — keep saturation low so they stay close to neutral-dark
    '--color-surface-high':             hsl(h, 10, 18),
    '--color-surface-mid':              hsl(h,  6, 10),
    '--color-surface-low':              hsl(h,  8, 15),
    '--color-brand-hover':              hslToHex(h, s, Math.min(100, l + 8)),
    '--color-brand-active':             hslToHex(h, s, Math.min(100, l + 18)),
    '--color-on-primary-container':     hslToHex(h, 80, 88),
    '--color-surface-primary-container':hslToHex(h, 25, 28),
    '--color-slider-track':             hsl(h, 25, 39),
  }
}

function paletteToCSS(p: Record<string, string>): string {
  return Object.entries(p).map(([k, v]) => `${k}:${v}`).join(';')
}

export function applyAccentColors(lightHex: string, darkHex: string): void {
  let el = document.getElementById('prose-accent') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'prose-accent'
    document.head.appendChild(el)
  }
  const lHsl = hexToHslVars(lightHex)
  const dHsl = hexToHslVars(darkHex)
  const lc = excalidrawPalette(lightHex, false)
  const dc = excalidrawPalette(darkHex, true)
  el.textContent = [
    `:root{--primary:${lHsl};--ring:${lHsl}}`,
    `.dark{--primary:${dHsl};--ring:${dHsl}}`,
    `.prose-excalidraw-root .excalidraw{${paletteToCSS(lc)}}`,
    `.prose-excalidraw-root .excalidraw.theme--dark{${paletteToCSS(dc)}}`,
  ].join('')
}
