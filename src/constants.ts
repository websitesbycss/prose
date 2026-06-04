export const DEFAULT_OLLAMA_MODEL = 'llama3.2:3b' as const
export const FALLBACK_OLLAMA_MODEL = 'llama3:8b' as const
export const AUTO_SAVE_DEBOUNCE_MS = 1000 as const
export const POMODORO_DEFAULT_WORK_MINUTES = 25 as const
export const POMODORO_DEFAULT_BREAK_MINUTES = 5 as const
export const MUSIC_DEFAULT_VOLUME = 45 as const
export const SIDEBAR_COLLAPSED_WIDTH = 42 as const
export const SIDEBAR_EXPANDED_WIDTH = 220 as const
export const AI_PANEL_WIDTH = 320 as const
// Fallback page margin constants (1 in at 96 dpi). Real values come from per-document pageMargins.
export const PAGE_MARGIN_X_PX = 96 as const
export const PAGE_MARGIN_Y_PX = 96 as const
export const PAGE_MARGIN_MIN_IN = 0.25 as const
export const PAGE_MARGIN_MAX_IN = 3.0 as const
export const DEFAULT_PAGE_MARGINS = { top: 1, right: 1, bottom: 1, left: 1 } as const
export const MIN_WINDOW_WIDTH = 960 as const
export const MIN_WINDOW_HEIGHT = 600 as const
