import { create } from 'zustand'
import { flushSync } from 'react-dom'
import type { AiSelectionAttachment, OllamaStatus } from '@/types'

type Theme = 'dark' | 'light'

export interface OpenDocumentTab {
  id: string
  title: string
  format: string
  fileType?: 'document' | 'sheet' | 'board'
}

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
  openTabs: OpenDocumentTab[]
  activeDocumentId: string | null
  showDashboard: boolean
  saveActiveDocument: (() => Promise<void>) | null
  newDocumentModalOpen: boolean
  theme: Theme
  sidebarOpen: boolean
  boardSidebarOpen: boolean
  aiPanelOpen: boolean
  citationPanelOpen: boolean
  musicPanelOpen: boolean
  musicPanelTab: 'tracks' | 'mixer'
  focusModeActive: boolean
  settingsOpen: boolean
  pomodoroState: PomodoroState
  ollamaStatus: OllamaStatus
  pendingAiPrompt: string | null
  pendingAiAttachment: AiSelectionAttachment | null
  issueCount: number
  analyzeOnSave: boolean
  activeAiTab: 'chat' | 'analysis'
  assignmentContext: string
  typewriterMode: boolean
  uiScale: number
  typeFilter: 'all' | 'document' | 'sheet' | 'board'

  setCurrentDocumentId(id: string | null): void
  openDocumentTab(tab: OpenDocumentTab): void
  insertDocumentTab(tab: OpenDocumentTab, index: number): void
  reorderTabs(tabId: string, toIndex: number): void
  setTabOrder(tabIds: string[]): void
  closeDocumentTab(id: string): void
  activateDocumentTab(id: string): void
  updateDocumentTab(id: string, updates: Partial<Pick<OpenDocumentTab, 'title' | 'format'>>): void
  goToDashboard(): void
  setSaveActiveDocument(fn: (() => Promise<void>) | null): void
  setNewDocumentModalOpen(open: boolean): void
  setTheme(theme: Theme): void
  setSidebarOpen(open: boolean): void
  setBoardSidebarOpen(open: boolean): void
  setAiPanelOpen(open: boolean): void
  setCitationPanelOpen(open: boolean): void
  setMusicPanelOpen(open: boolean): void
  setMusicPanelTab(tab: 'tracks' | 'mixer'): void
  setFocusModeActive(active: boolean): void
  setSettingsOpen(open: boolean): void
  setPomodoroState(state: Partial<PomodoroState>): void
  setOllamaStatus(status: OllamaStatus): void
  setPendingAiPrompt(prompt: string | null): void
  setPendingAiAttachment(attachment: AiSelectionAttachment | null): void
  setIssueCount(n: number): void
  setAnalyzeOnSave(v: boolean): void
  setActiveAiTab(tab: 'chat' | 'analysis'): void
  setAssignmentContext(ctx: string): void
  setTypewriterMode(v: boolean): void
  setUiScale(v: number): void
  setTypeFilter(filter: 'all' | 'document' | 'sheet' | 'board'): void
}

const DEFAULT_POMODORO: PomodoroState = {
  phase: 'idle',
  timeRemaining: 25 * 60,
  sessionCount: 0,
}

export const useAppStore = create<AppState>()((set) => ({
  currentDocumentId: null,
  openTabs: [],
  activeDocumentId: null,
  showDashboard: true,
  saveActiveDocument: null,
  newDocumentModalOpen: false,
  theme: readStoredTheme(),
  sidebarOpen: true,
  boardSidebarOpen: true,
  aiPanelOpen: false,
  citationPanelOpen: false,
  musicPanelOpen: false,
  musicPanelTab: 'tracks',
  focusModeActive: false,
  settingsOpen: false,
  pomodoroState: DEFAULT_POMODORO,
  ollamaStatus: 'loading',
  pendingAiPrompt: null,
  pendingAiAttachment: null,
  issueCount: 0,
  analyzeOnSave: false,
  activeAiTab: 'chat',
  assignmentContext: '',
  typewriterMode: false,
  uiScale: 110,
  typeFilter: 'all',

  setCurrentDocumentId: (id) => {
    if (id === null) {
      set({ showDashboard: true })
      return
    }
    set((s) => {
      const exists = s.openTabs.some((t) => t.id === id)
      return {
        activeDocumentId: id,
        currentDocumentId: id,
        showDashboard: false,
        openTabs: exists ? s.openTabs : [...s.openTabs, { id, title: 'Untitled', format: 'mla' }],
      }
    })
  },

  openDocumentTab: (tab) =>
    set((s) => {
      const exists = s.openTabs.some((t) => t.id === tab.id)
      const openTabs = exists
        ? s.openTabs.map((t) => (t.id === tab.id ? { ...t, ...tab } : t))
        : [...s.openTabs, tab]
      return {
        openTabs,
        activeDocumentId: tab.id,
        currentDocumentId: tab.id,
        showDashboard: false,
      }
    }),

  insertDocumentTab: (tab, index) =>
    set((s) => {
      if (s.openTabs.some((t) => t.id === tab.id)) return {}
      const openTabs = [...s.openTabs]
      openTabs.splice(Math.max(0, Math.min(index, openTabs.length)), 0, tab)
      return {
        openTabs,
        activeDocumentId: tab.id,
        currentDocumentId: tab.id,
        showDashboard: false,
      }
    }),

  reorderTabs: (tabId, toIndex) =>
    set((s) => {
      const fromIndex = s.openTabs.findIndex((t) => t.id === tabId)
      if (fromIndex === -1 || fromIndex === toIndex) return {}
      const openTabs = [...s.openTabs]
      const [tab] = openTabs.splice(fromIndex, 1)
      openTabs.splice(toIndex, 0, tab!)
      return { openTabs }
    }),

  setTabOrder: (tabIds) =>
    set((s) => {
      const map = new Map(s.openTabs.map((t) => [t.id, t]))
      const reordered = tabIds.map((id) => map.get(id)).filter(Boolean) as typeof s.openTabs
      const remaining = s.openTabs.filter((t) => !tabIds.includes(t.id))
      return { openTabs: [...reordered, ...remaining] }
    }),

  closeDocumentTab: (id) =>
    set((s) => {
      const idx = s.openTabs.findIndex((t) => t.id === id)
      const openTabs = s.openTabs.filter((t) => t.id !== id)
      let activeDocumentId = s.activeDocumentId
      let showDashboard = s.showDashboard

      if (s.activeDocumentId === id) {
        if (openTabs.length === 0) {
          activeDocumentId = null
          showDashboard = true
        } else {
          const next = openTabs[Math.min(idx, openTabs.length - 1)]!
          activeDocumentId = next.id
          showDashboard = false
        }
      }

      return {
        openTabs,
        activeDocumentId,
        currentDocumentId: activeDocumentId,
        showDashboard,
      }
    }),

  activateDocumentTab: (id) =>
    set({
      activeDocumentId: id,
      currentDocumentId: id,
      showDashboard: false,
    }),

  updateDocumentTab: (id, updates) =>
    set((s) => ({
      openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  goToDashboard: () => set({ showDashboard: true }),

  setSaveActiveDocument: (fn) => set({ saveActiveDocument: fn }),

  setNewDocumentModalOpen: (open) => set({ newDocumentModalOpen: open }),

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
  setBoardSidebarOpen: (open) => set({ boardSidebarOpen: open }),
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
  setPendingAiAttachment: (attachment) => set({ pendingAiAttachment: attachment }),
  setIssueCount: (n) => set({ issueCount: n }),
  setAnalyzeOnSave: (v) => set({ analyzeOnSave: v }),
  setActiveAiTab: (tab) => set({ activeAiTab: tab }),
  setAssignmentContext: (ctx) => set({ assignmentContext: ctx }),
  setTypewriterMode: (v) => set({ typewriterMode: v }),
  setUiScale: (v) => {
    document.documentElement.style.fontSize = `${v}%`
    set({ uiScale: v })
  },
  setTypeFilter: (filter) => set({ typeFilter: filter }),
}))
