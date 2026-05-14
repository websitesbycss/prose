import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'

interface SettingsRow {
  key: string
  value: string
}

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
}

const DEFAULTS: AppSettingsOut = {
  theme: 'dark',
  defaultFormat: 'none',
  wordCountExcludesHeader: true,
  defaultWordCountGoal: null,
  ollamaModel: 'llama3.2:3b',
  pomodoroWorkMinutes: 25,
  pomodoroBreakMinutes: 5,
  musicVolume: 70,
  ambientVolumes: {},
  typewriterMode: false,
  editorFontFamily: 'Times New Roman',
  editorFontSize: 12,
}

const VALID_FORMATS = new Set(['none', 'mla', 'apa', 'chicago', 'ieee'])
const VALID_THEMES = new Set(['dark', 'light'])

function loadSettings(db: Database): AppSettingsOut {
  const rows = db.prepare('SELECT key, value FROM settings').all() as SettingsRow[]
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const get = <T>(key: string, fallback: T): T => {
    const raw = map.get(key)
    if (raw === undefined) return fallback
    try {
      return JSON.parse(raw) as T
    } catch {
      return fallback
    }
  }

  return {
    theme: VALID_THEMES.has(get('theme', DEFAULTS.theme))
      ? get('theme', DEFAULTS.theme)
      : DEFAULTS.theme,
    defaultFormat: VALID_FORMATS.has(get('defaultFormat', DEFAULTS.defaultFormat))
      ? get('defaultFormat', DEFAULTS.defaultFormat)
      : DEFAULTS.defaultFormat,
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
  }
}

export function registerSettingsHandlers(db: Database): void {
  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )

  ipcMain.handle('settings:get', (): AppSettingsOut => {
    return loadSettings(db)
  })

  ipcMain.handle('settings:set', (_, data: unknown): void => {
    if (!data || typeof data !== 'object') throw new Error('Invalid settings payload')
    const d = data as Record<string, unknown>

    const allowed = new Set(Object.keys(DEFAULTS))
    for (const [key, value] of Object.entries(d)) {
      if (!allowed.has(key)) continue
      upsert.run(key, JSON.stringify(value))
    }
  })
}
