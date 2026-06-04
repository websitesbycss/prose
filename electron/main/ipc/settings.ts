import { ipcMain } from 'electron'
import { getSettingsDb } from '../services/settingsDb'

interface AppSettingsOut {
  theme: 'dark' | 'light'
  defaultFormat: string
  wordCountExcludesHeader: boolean
  defaultWordCountGoal: number | null
  ollamaModel: string
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number
  musicVolume: number
  ambientVolumes: Record<string, number>
  typewriterMode: boolean
  editorFontFamily: string
  editorFontSize: number
  headingFontSizes: { h1: number; h2: number; h3: number }
  lightAccentColor: string | null
  darkAccentColor: string | null
  uiScale: number
}

const DEFAULTS: AppSettingsOut = {
  theme: 'dark',
  defaultFormat: 'none',
  wordCountExcludesHeader: true,
  defaultWordCountGoal: null,
  ollamaModel: 'llama3.2:3b',
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  musicVolume: 45,
  ambientVolumes: {},
  typewriterMode: false,
  editorFontFamily: 'Calibri',
  editorFontSize: 12,
  headingFontSizes: { h1: 36, h2: 24, h3: 18 },
  lightAccentColor: '#2563eb',
  darkAccentColor: '#60a5fa',
  uiScale: 110,
}

const VALID_FORMATS = new Set(['none', 'mla', 'apa', 'chicago', 'ieee'])
const VALID_THEMES = new Set(['dark', 'light'])
const VALID_FONTS = new Set(['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Garamond', 'Courier New'])
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const APP_SETTING_KEYS = new Set(Object.keys(DEFAULTS))

function validateSettingValue(key: string, value: unknown): unknown {
  switch (key) {
    case 'theme':
      return typeof value === 'string' && VALID_THEMES.has(value) ? value : DEFAULTS.theme
    case 'defaultFormat':
      return typeof value === 'string' && VALID_FORMATS.has(value) ? value : DEFAULTS.defaultFormat
    case 'ollamaModel':
      return typeof value === 'string' && value.length <= 128 && /^[\w.:+-]+$/.test(value)
        ? value
        : DEFAULTS.ollamaModel
    case 'editorFontFamily':
      return typeof value === 'string' && VALID_FONTS.has(value) ? value : DEFAULTS.editorFontFamily
    case 'lightAccentColor':
      return value === null || (typeof value === 'string' && HEX_COLOR.test(value))
        ? value as string | null
        : DEFAULTS.lightAccentColor
    case 'darkAccentColor':
      return value === null || (typeof value === 'string' && HEX_COLOR.test(value))
        ? value as string | null
        : DEFAULTS.darkAccentColor
    case 'musicVolume':
      return typeof value === 'number' ? Math.min(100, Math.max(0, value)) : DEFAULTS.musicVolume
    case 'uiScale':
      return typeof value === 'number' ? Math.min(125, Math.max(75, value)) : DEFAULTS.uiScale
    case 'editorFontSize':
      return typeof value === 'number' ? Math.max(8, Math.min(72, value)) : DEFAULTS.editorFontSize
    case 'pomodoroWorkMinutes':
    case 'pomodoroBreakMinutes':
      return typeof value === 'number' ? Math.max(1, Math.min(120, value)) : DEFAULTS[key as keyof AppSettingsOut]
    default:
      return value
  }
}

function loadSettings(): AppSettingsOut {
  const db = getSettingsDb()
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const get = <T>(key: string, fallback: T): T => {
    const raw = map.get(key)
    if (raw === undefined) return fallback
    try { return JSON.parse(raw) as T } catch { return fallback }
  }

  return {
    theme: VALID_THEMES.has(get('theme', DEFAULTS.theme)) ? get('theme', DEFAULTS.theme) : DEFAULTS.theme,
    defaultFormat: VALID_FORMATS.has(get('defaultFormat', DEFAULTS.defaultFormat)) ? get('defaultFormat', DEFAULTS.defaultFormat) : DEFAULTS.defaultFormat,
    wordCountExcludesHeader: get('wordCountExcludesHeader', DEFAULTS.wordCountExcludesHeader),
    defaultWordCountGoal: get('defaultWordCountGoal', DEFAULTS.defaultWordCountGoal),
    ollamaModel: get('ollamaModel', DEFAULTS.ollamaModel) || DEFAULTS.ollamaModel,
    pomodoroWorkMinutes: Math.max(1, get('pomodoroWorkMinutes', DEFAULTS.pomodoroWorkMinutes)),
    pomodoroBreakMinutes: Math.max(1, get('pomodoroBreakMinutes', DEFAULTS.pomodoroBreakMinutes)),
    musicVolume: Math.min(100, Math.max(0, get('musicVolume', DEFAULTS.musicVolume))),
    ambientVolumes: get('ambientVolumes', DEFAULTS.ambientVolumes),
    typewriterMode: get('typewriterMode', DEFAULTS.typewriterMode),
    editorFontFamily: get('editorFontFamily', DEFAULTS.editorFontFamily) || DEFAULTS.editorFontFamily,
    editorFontSize: Math.max(8, Math.min(72, get('editorFontSize', DEFAULTS.editorFontSize))),
    headingFontSizes: (() => {
      const v = get('headingFontSizes', DEFAULTS.headingFontSizes)
      const clamp = (n: number) => Math.max(8, Math.min(96, n))
      return { h1: clamp(v.h1 ?? DEFAULTS.headingFontSizes.h1), h2: clamp(v.h2 ?? DEFAULTS.headingFontSizes.h2), h3: clamp(v.h3 ?? DEFAULTS.headingFontSizes.h3) }
    })(),
    lightAccentColor: get('lightAccentColor', DEFAULTS.lightAccentColor),
    darkAccentColor:  get('darkAccentColor',  DEFAULTS.darkAccentColor),
    uiScale: Math.min(125, Math.max(75, get('uiScale', DEFAULTS.uiScale))),
  }
}

export function registerSettingsHandlers(): void {
  const upsert = getSettingsDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )

  ipcMain.handle('settings:get', (): AppSettingsOut => loadSettings())

  ipcMain.handle('settings:set', (_, data: unknown): void => {
    if (!data || typeof data !== 'object') throw new Error('Invalid settings payload')
    const d = data as Record<string, unknown>
    for (const [key, value] of Object.entries(d)) {
      if (!APP_SETTING_KEYS.has(key)) continue
      upsert.run(key, JSON.stringify(validateSettingValue(key, value)))
    }
  })
}
