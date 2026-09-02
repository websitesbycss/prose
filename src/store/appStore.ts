import { create } from 'zustand'
import { flushSync } from 'react-dom'
import type { AiSelectionAttachment, FileType, OllamaStatus } from '@/types'

type Theme = 'dark' | 'light'

export interface OpenDocumentTab {
  id: string
  title: string
  format: string
  fileType?: 'document' | 'sheet' | 'board' | 'slides'
}

export interface PanelState {
  ai?: boolean
  citations?: boolean
  animations?: boolean
}

function mirrorPanels(
  panelsByDoc: Record<string, PanelState>,
  activeId: string | null,
): { aiPanelOpen: boolean; citationPanelOpen: boolean; slidesAnimationsPanelOpen: boolean } {
  const p = activeId ? panelsByDoc[activeId] : undefined
  return {
    aiPanelOpen: p?.ai ?? false,
    citationPanelOpen: p?.citations ?? false,
    slidesAnimationsPanelOpen: p?.animations ?? false,
  }
}

// Mirrors theme-init.js's logic exactly, so the React theme state always
// matches the `dark` class theme-init.js already applied to <html> before
// this module even loads — on first launch (nothing stored yet) that means
// following the OS's light/dark preference rather than hardcoding 'dark'.
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('prose-theme')
    if (stored === 'light') return 'light'
    if (stored === 'dark') return 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
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
  newDocumentModalInitialType: FileType | null
  theme: Theme
  sidebarOpen: boolean
  boardSidebarOpen: boolean
  /**
   * Right-panel open state, PER DOCUMENT TAB. Every editor instance reads its
   * own entry — never a global flag — so opening the AI panel in one tab
   * can't open (or overlay) it in any other tab.
   */
  panelsByDoc: Record<string, PanelState>
  /**
   * Mirrors of the ACTIVE document's panelsByDoc entry, kept in sync by every
   * action that changes panel state or the active tab. Toolbars, title bars,
   * and panel close buttons only ever act on the active tab, so they read and
   * toggle these without needing a document id.
   */
  aiPanelOpen: boolean
  slidesAnimationsPanelOpen: boolean
  citationPanelOpen: boolean
  musicPanelOpen: boolean
  musicPanelTab: 'tracks' | 'mixer'
  focusModeActive: boolean
  settingsOpen: boolean
  /** When set, the next time SettingsModal opens it jumps straight to this
   * section (e.g. onboarding's "I'll use my own API key" opens Settings on
   * the AI tab) — cleared by SettingsModal once consumed. */
  settingsInitialSection: string | null
  pomodoroState: PomodoroState
  ollamaStatus: OllamaStatus
  multimodalCapable: boolean
  pendingAiPrompt: string | null
  pendingAiAttachment: AiSelectionAttachment | null
  issueCount: number
  analyzeOnSave: boolean
  activeAiTab: 'chat' | 'analysis'
  assignmentContext: string
  typewriterMode: boolean
  uiScale: number
  typeFilter: 'all' | 'document' | 'sheet' | 'board' | 'slides'

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
  setNewDocumentModalOpen(open: boolean, initialType?: FileType): void
  setTheme(theme: Theme): void
  setSidebarOpen(open: boolean): void
  setBoardSidebarOpen(open: boolean): void
  setAiPanelOpen(open: boolean): void
  setSlidesAnimationsPanelOpen(open: boolean): void
  setCitationPanelOpen(open: boolean): void
  setMusicPanelOpen(open: boolean): void
  setMusicPanelTab(tab: 'tracks' | 'mixer'): void
  setFocusModeActive(active: boolean): void
  setSettingsOpen(open: boolean): void
  setSettingsInitialSection(section: string | null): void
  setPomodoroState(state: Partial<PomodoroState>): void
  setOllamaStatus(status: OllamaStatus): void
  setMultimodalCapable(capable: boolean): void
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
  newDocumentModalInitialType: null,
  theme: readStoredTheme(),
  sidebarOpen: true,
  boardSidebarOpen: true,
  panelsByDoc: {},
  aiPanelOpen: false,
  slidesAnimationsPanelOpen: false,
  citationPanelOpen: false,
  musicPanelOpen: false,
  musicPanelTab: 'tracks',
  focusModeActive: false,
  settingsOpen: false,
  settingsInitialSection: null,
  pomodoroState: DEFAULT_POMODORO,
  ollamaStatus: 'loading',
  multimodalCapable: false,
  pendingAiPrompt: null,
  pendingAiAttachment: null,
  issueCount: 0,
  analyzeOnSave: false,
  activeAiTab: 'chat',
  assignmentContext: '',
  typewriterMode: false,
  uiScale: 110,
  typeFilter: 'all' as 'all' | 'document' | 'sheet' | 'board' | 'slides',

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
        ...mirrorPanels(s.panelsByDoc, id),
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
        ...mirrorPanels(s.panelsByDoc, tab.id),
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
        ...mirrorPanels(s.panelsByDoc, tab.id),
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

      // Drop the closed tab's panel state so a reopened document starts fresh
      const panelsByDoc = { ...s.panelsByDoc }
      delete panelsByDoc[id]

      return {
        openTabs,
        activeDocumentId,
        currentDocumentId: activeDocumentId,
        showDashboard,
        panelsByDoc,
        ...mirrorPanels(panelsByDoc, activeDocumentId),
      }
    }),

  activateDocumentTab: (id) =>
    set((s) => ({
      activeDocumentId: id,
      currentDocumentId: id,
      showDashboard: false,
      ...mirrorPanels(s.panelsByDoc, id),
    })),

  updateDocumentTab: (id, updates) =>
    set((s) => ({
      openTabs: s.openTabs.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),

  goToDashboard: () => set({ showDashboard: true }),

  setSaveActiveDocument: (fn) => set({ saveActiveDocument: fn }),

  setNewDocumentModalOpen: (open, initialType) => set({
    newDocumentModalOpen: open,
    newDocumentModalInitialType: open ? (initialType ?? null) : null,
  }),

  setTheme: (theme) => {
    try {
      localStorage.setItem('prose-theme', theme)
    } catch {
      // Ignore storage write failures (private mode, restricted profiles).
    }
    const apply = (): void => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      flushSync(() => set({ theme }))
      void window.prose.win.setTitleBarOverlay?.(theme)
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
  // Panel setters write to the ACTIVE document's entry — toolbars and close
  // buttons only ever act on the tab the user is looking at. Panels within a
  // document are mutually exclusive: opening one closes the others.
  setAiPanelOpen: (open) =>
    set((s) => {
      const id = s.activeDocumentId
      if (!id) return {}
      const entry: PanelState = open ? { ai: true } : { ...s.panelsByDoc[id], ai: false }
      const panelsByDoc = { ...s.panelsByDoc, [id]: entry }
      return { panelsByDoc, ...mirrorPanels(panelsByDoc, id) }
    }),
  setSlidesAnimationsPanelOpen: (open) =>
    set((s) => {
      const id = s.activeDocumentId
      if (!id) return {}
      const entry: PanelState = open ? { animations: true } : { ...s.panelsByDoc[id], animations: false }
      const panelsByDoc = { ...s.panelsByDoc, [id]: entry }
      return { panelsByDoc, ...mirrorPanels(panelsByDoc, id) }
    }),
  setCitationPanelOpen: (open) =>
    set((s) => {
      const id = s.activeDocumentId
      if (!id) return {}
      const entry: PanelState = open ? { citations: true } : { ...s.panelsByDoc[id], citations: false }
      const panelsByDoc = { ...s.panelsByDoc, [id]: entry }
      return { panelsByDoc, ...mirrorPanels(panelsByDoc, id) }
    }),
  setMusicPanelOpen: (open) => set({ musicPanelOpen: open }),
  setMusicPanelTab: (tab) => set({ musicPanelTab: tab }),
  setFocusModeActive: (active) => set({ focusModeActive: active }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSettingsInitialSection: (section) => set({ settingsInitialSection: section }),
  setPomodoroState: (state) =>
    set((s) => ({ pomodoroState: { ...s.pomodoroState, ...state } })),
  setOllamaStatus: (status) => set({ ollamaStatus: status }),
  setMultimodalCapable: (capable) => set({ multimodalCapable: capable }),
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
