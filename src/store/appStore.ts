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
  pendingAiPrompt: string | null
  issueCount: number
  analyzeOnSave: boolean
  activeAiTab: 'chat' | 'analysis'
  assignmentContext: string

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
  setPendingAiPrompt(prompt: string | null): void
  setIssueCount(n: number): void
  setAnalyzeOnSave(v: boolean): void
  setActiveAiTab(tab: 'chat' | 'analysis'): void
  setAssignmentContext(ctx: string): void
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
  pendingAiPrompt: null,
  issueCount: 0,
  analyzeOnSave: false,
  activeAiTab: 'chat',
  assignmentContext: '',

  setCurrentDocumentId: (id) => set({ currentDocumentId: id }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('prose-theme', theme)
    } catch (_) {}
    // Gate the color transition so it only fires during the theme switch,
    // not on every hover/active state change throughout the session.
    document.documentElement.classList.add('theme-transitioning')
    document.documentElement.classList.toggle('dark', theme === 'dark')
    set({ theme })
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 250)
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
  setPendingAiPrompt: (prompt) => set({ pendingAiPrompt: prompt }),
  setIssueCount: (n) => set({ issueCount: n }),
  setAnalyzeOnSave: (v) => set({ analyzeOnSave: v }),
  setActiveAiTab: (tab) => set({ activeAiTab: tab }),
  setAssignmentContext: (ctx) => set({ assignmentContext: ctx }),
}))
