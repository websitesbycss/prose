import { create } from 'zustand'
import { flushSync } from 'react-dom'
import type { OllamaStatus } from '@/types'

type Theme = 'dark' | 'light'

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem('prose-theme') === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}
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
  musicPanelTab: 'tracks' | 'mixer'
  focusModeActive: boolean
  settingsOpen: boolean
  pomodoroState: PomodoroState
  ollamaStatus: OllamaStatus
  pendingAiPrompt: string | null
  issueCount: number
  analyzeOnSave: boolean
  activeAiTab: 'chat' | 'analysis'
  assignmentContext: string
  typewriterMode: boolean
  uiScale: number

  setCurrentDocumentId(id: string | null): void
  setTheme(theme: Theme): void
  setSidebarOpen(open: boolean): void
  setAiPanelOpen(open: boolean): void
  setCitationPanelOpen(open: boolean): void
  setMusicPanelOpen(open: boolean): void
  setMusicPanelTab(tab: 'tracks' | 'mixer'): void
  setFocusModeActive(active: boolean): void
  setSettingsOpen(open: boolean): void
  setPomodoroState(state: Partial<PomodoroState>): void
  setOllamaStatus(status: OllamaStatus): void
  setPendingAiPrompt(prompt: string | null): void
  setIssueCount(n: number): void
  setAnalyzeOnSave(v: boolean): void
  setActiveAiTab(tab: 'chat' | 'analysis'): void
  setAssignmentContext(ctx: string): void
  setTypewriterMode(v: boolean): void
  setUiScale(v: number): void
}

const DEFAULT_POMODORO: PomodoroState = {
  phase: 'idle',
  timeRemaining: 25 * 60,
  sessionCount: 0,
}

export const useAppStore = create<AppState>()((set) => ({
  currentDocumentId: null,
  theme: readStoredTheme(),
  sidebarOpen: true,
  aiPanelOpen: false,
  citationPanelOpen: false,
  musicPanelOpen: false,
  musicPanelTab: 'tracks',
  focusModeActive: false,
  settingsOpen: false,
  pomodoroState: DEFAULT_POMODORO,
  ollamaStatus: 'loading',
  pendingAiPrompt: null,
  issueCount: 0,
  analyzeOnSave: false,
  activeAiTab: 'chat',
  assignmentContext: '',
  typewriterMode: false,
  uiScale: 110,

  setCurrentDocumentId: (id) => set({ currentDocumentId: id }),
  setTheme: (theme) => {
    try {
      localStorage.setItem('prose-theme', theme)
    } catch (_) {}
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      flushSync(() => set({ theme }))
    }
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduceMotion && typeof document.startViewTransition === 'function') {
      document.startViewTransition(apply)
    } else {
      apply()
    }
  },
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  // AI and citation panels are mutually exclusive; opening one closes the other
  setAiPanelOpen: (open) =>
    set((s) => ({ aiPanelOpen: open, citationPanelOpen: open ? false : s.citationPanelOpen })),
  setCitationPanelOpen: (open) =>
    set((s) => ({ citationPanelOpen: open, aiPanelOpen: open ? false : s.aiPanelOpen })),
  setMusicPanelOpen: (open) => set({ musicPanelOpen: open }),
  setMusicPanelTab: (tab) => set({ musicPanelTab: tab }),
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
  setTypewriterMode: (v) => set({ typewriterMode: v }),
  setUiScale: (v) => {
    document.documentElement.style.fontSize = `${v}%`
    set({ uiScale: v })
  },
}))
