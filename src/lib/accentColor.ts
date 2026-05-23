export const DEFAULT_LIGHT_ACCENT = '#efa02a'
export const DEFAULT_DARK_ACCENT  = '#f2b559'

export const LIGHT_PRESETS = [
  { label: 'Amber',   hex: '#efa02a' },
  { label: 'Blue',    hex: '#2563eb' },
  { label: 'Violet',  hex: '#7c3aed' },
  { label: 'Emerald', hex: '#059669' },
  { label: 'Rose',    hex: '#e11d48' },
  { label: 'Pink',    hex: '#db2777' },
  { label: 'Cyan',    hex: '#0891b2' },
  { label: 'Slate',   hex: '#475569' },
] as const

export const DARK_PRESETS = [
  { label: 'Amber',   hex: '#f2b559' },
  { label: 'Blue',    hex: '#60a5fa' },
  { label: 'Violet',  hex: '#a78bfa' },
  { label: 'Emerald', hex: '#34d399' },
  { label: 'Rose',    hex: '#fb7185' },
  { label: 'Pink',    hex: '#f472b6' },
  { label: 'Cyan',    hex: '#22d3ee' },
  { label: 'Slate',   hex: '#94a3b8' },
] as const

function hexToHslVars(hex: string): string {
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
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function applyAccentColors(lightHex: string, darkHex: string): void {
  let el = document.getElementById('prose-accent') as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = 'prose-accent'
    document.head.appendChild(el)
  }
  const l = hexToHslVars(lightHex)
  const d = hexToHslVars(darkHex)
  el.textContent = `:root{--primary:${l};--ring:${l}}.dark{--primary:${d};--ring:${d}}`
}
