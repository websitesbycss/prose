import { create } from 'zustand'
import type { OllamaStatus } from '@/types'

type Theme = 'dark' | 'light'
type PomodoroPhase = 'idle' | 'running' | 'paused' | 'break'

interface PomodoroState {
  phase: PomodoroPhase
  timeRemaining: number
  sessionCount: number
}

interface AppState {
  currentDocumentId: string | null
  theme: Theme
  sidebarOpen: boolean
  aiPanelOpen: boolean
  citationPanelOpen: boolean
  musicPanelOpen: boolean
  focusModeActive: boolean
  settingsOpen: boolean
  pomodoroState: PomodoroState
  ollamaStatus: OllamaStatus

  setCurrentDocumentId(id: string | null): void
  setTheme(theme: Theme): void
  setSidebarOpen(open: boolean): void
  setAiPanelOpen(open: boolean): void
  setCitationPanelOpen(open: boolean): void
  setMusicPanelOpen(open: boolean): void
  setFocusModeActive(active: boolean): void
  setSettingsOpen(open: boolean): void
  setPomodoroState(state: Partial<PomodoroState>): void
  setOllamaStatus(status: OllamaStatus): void
}

const DEFAULT_POMODORO: PomodoroState = {
  phase: 'idle',
  timeRemaining: 25 * 60,
  sessionCount: 0,
}

export const useAppStore = create<AppState>()((set) => ({
  currentDocumentId: null,
  theme: 'dark',
  sidebarOpen: true,
  aiPanelOpen: false,
  citationPanelOpen: false,
  musicPanelOpen: false,
  focusModeActive: false,
  settingsOpen: false,
  pomodoroState: DEFAULT_POMODORO,
  ollamaStatus: 'loading',

  setCurrentDocumentId: (id) => set({ currentDocumentId: id }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('prose-theme', theme)
    } catch (_) {}
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  // AI and citation panels are mutually exclusive — opening one closes the other
  setAiPanelOpen: (open) =>
    set((s) => ({ aiPanelOpen: open, citationPanelOpen: open ? false : s.citationPanelOpen })),
  setCitationPanelOpen: (open) =>
    set((s) => ({ citationPanelOpen: open, aiPanelOpen: open ? false : s.aiPanelOpen })),
  setMusicPanelOpen: (open) => set({ musicPanelOpen: open }),
  setFocusModeActive: (active) => set({ focusModeActive: active }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setPomodoroState: (state) =>
    set((s) => ({ pomodoroState: { ...s.pomodoroState, ...state } })),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),
}))
