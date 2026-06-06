import { useState, useRef, useCallback, useEffect } from 'react'
import { Excalidraw, MainMenu } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { motion, AnimatePresence } from 'motion/react'
import {
  Settings, ChevronLeft, ChevronRight,
  PanelLeft, Square, Circle, ArrowRight,
} from 'lucide-react'

import { useDocument } from '@/hooks/useDocument'
import type { SaveStatus } from '@/hooks/useDocument'
import type { BoardContent } from '@/types/board'
import { isBoardContent } from '@/types/board'
import { FileEditorTitleBar } from '@/components/editor/FileEditorTitleBar'
import { BoardToolbar } from './BoardToolbar'
import { BoardStatusBar } from './BoardStatusBar'
import { AUTO_SAVE_DEBOUNCE_MS, AI_PANEL_WIDTH } from '@/constants'
import { useAppStore } from '@/store/appStore'
import AiPanel from '@/components/editor/AiPanel'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'
import { cn } from '@/lib/utils'
import SettingsModal from '@/components/settings/SettingsModal'

// ── Types ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAPI = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElements = readonly any[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawAppState = any

export interface ProseFileCardData {
  proseFileCard: true
  fileId: string
  fileType: string
  title: string
  wordCount: number
  preview: string
}

// ── ProseFileCard embeddable renderer ─────────────────────────────────────────

function ProseFileCardView({
  data,
  width,
  height,
  onOpen,
}: {
  data: ProseFileCardData
  width: number
  height: number
  onOpen: () => void
}) {
  const typeLabel: Record<string, string> = { document: 'DOC', sheet: 'SHEET', board: 'BOARD' }
  const countLabel: Record<string, string> = { sheet: 'cells', board: 'elements' }
  const unit = countLabel[data.fileType] ?? 'words'

  return (
    <div
      style={{ width, height }}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm"
      onDoubleClick={(e) => { e.stopPropagation(); onOpen() }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
          {typeLabel[data.fileType] ?? 'FILE'}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{data.title}</span>
      </div>
      {data.wordCount > 0 && (
        <p className="mb-1 text-[10px] text-muted-foreground">
          {data.wordCount.toLocaleString()} {unit}
        </p>
      )}
      {data.preview && (
        <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/80">
          {data.preview}
        </p>
      )}
      <p className="mt-auto pt-1.5 text-[9px] text-muted-foreground/50">Double-click to open</p>
    </div>
  )
}

// ── Board AI context builder ──────────────────────────────────────────────────

function buildBoardContext(elements: ExcalidrawElements): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards = elements.filter((el: any) => el.type === 'embeddable' && el.customData?.proseFileCard && !el.isDeleted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const texts = elements.filter((el: any) => el.type === 'text' && !el.isDeleted)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const others = elements.filter((el: any) => el.type !== 'embeddable' && el.type !== 'text' && !el.isDeleted)

  const parts: string[] = [
    `Board has ${elements.filter((e: any) => !e.isDeleted).length} elements:`,
    `  - ${cards.length} file card(s)`,
    `  - ${texts.length} text note(s)`,
    `  - ${others.length} other shape(s)`,
    '',
  ]

  if (cards.length > 0) {
    parts.push('File cards:')
    for (const card of cards) {
      const d = card.customData as ProseFileCardData
      const unit = d.fileType === 'sheet' ? 'cells' : d.fileType === 'board' ? 'elements' : 'words'
      parts.push(`  - "${d.title}" (${d.fileType}, ${d.wordCount} ${unit})`)
      if (d.preview) parts.push(`    Preview: "${d.preview.slice(0, 80)}"`)
    }
    parts.push('')
  }

  if (texts.length > 0) {
    parts.push('Text notes:')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const t of texts.slice(0, 10)) {
      if (t.text) parts.push(`  - "${String(t.text).slice(0, 80)}"`)
    }
  }

  return parts.join('\n')
}

// ── SidebarIcon (mirrors Editor.tsx) ─────────────────────────────────────────

interface SidebarIconProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  expanded: boolean
  active: boolean
  onClick: () => void
}

function SidebarIcon({ icon: Icon, label, expanded, active, onClick }: SidebarIconProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-muted-foreground transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
      title={label}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {expanded && <span className="truncate text-xs">{label}</span>}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface BoardEditorProps {
  documentId: string
}

export function BoardEditor({ documentId }: BoardEditorProps) {
  const { document: doc } = useDocument(documentId)
  const excalidrawAPIRef = useRef<ExcalidrawAPI | null>(null)
  const [excalidrawAPIState, setExcalidrawAPIState] = useState<ExcalidrawAPI | null>(null)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const theme = useAppStore((s) => s.theme)
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)
  const boardSidebarOpen = useAppStore((s) => s.boardSidebarOpen)
  const setBoardSidebarOpen = useAppStore((s) => s.setBoardSidebarOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  // Sidebar width — persisted to localStorage
  const [boardSidebarWidth, setBoardSidebarWidth] = useState(() => {
    const v = localStorage.getItem('prose-board-sidebar-width')
    return v ? Math.max(180, parseInt(v)) : 270
  })
  const boardSidebarWidthRef = useRef(boardSidebarWidth)
  const boardSidebarDragRef = useRef<{ x: number; width: number } | null>(null)

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      const d = boardSidebarDragRef.current
      if (!d) return
      const newW = Math.max(180, d.width + e.clientX - d.x)
      setBoardSidebarWidth(newW)
      boardSidebarWidthRef.current = newW
      localStorage.setItem('prose-board-sidebar-width', String(newW))
    }
    function onMouseUp(): void {
      boardSidebarDragRef.current = null
      globalThis.document.body.style.cursor = ''
      globalThis.document.body.style.userSelect = ''
    }
    globalThis.document.addEventListener('mousemove', onMouseMove)
    globalThis.document.addEventListener('mouseup', onMouseUp)
    return () => {
      globalThis.document.removeEventListener('mousemove', onMouseMove)
      globalThis.document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  // Track active Excalidraw tool for toolbar highlighting
  const [activeToolType, setActiveToolType] = useState('selection')

  // Track canvas zoom level (percentage integer, e.g. 100 = 100%)
  const [canvasZoom, setCanvasZoom] = useState(100)

  // Track whether any elements are selected (for sidebar empty state)
  const [hasSelection, setHasSelection] = useState(false)

  // Save status for the status bar
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Music
  const music = useMusicContext()
  const activeAmbient = AMBIENT_LAYERS.filter((l) => music?.ambientEnabled[l.id])
  const ambientPlaying =
    activeAmbient.length === 0 ? null
    : activeAmbient.length === 1 ? activeAmbient[0]!.label
    : activeAmbient.length === 2 ? `${activeAmbient[0]!.label} + ${activeAmbient[1]!.label}`
    : `${activeAmbient.length} Sounds`

  // Auto-save ─────────────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestElementsRef = useRef<ExcalidrawElements>([])
  const latestAppStateRef = useRef<ExcalidrawAppState | null>(null)
  // Last values we scheduled a save for — used to skip onChange events that
  // only update transient state (cursor, hover, active tool) that we don't persist.
  const lastScheduledRef = useRef<{
    elements: ExcalidrawElements
    scrollX: number
    scrollY: number
    zoom: number
  } | null>(null)

  const flushAndSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const elements = latestElementsRef.current
    const appState = latestAppStateRef.current
    const boardContent: BoardContent = {
      version: 2,
      elements: elements as unknown[],
      appState: appState ? {
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        theme: appState.theme,
      } : {},
    }
    try {
      setSaveStatus('saving')
      await window.prose.documents.update(documentId, { content: JSON.stringify(boardContent) })
      setSaveStatus('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('[BoardEditor] save error:', err)
      setSaveStatus('error')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 4000)
    }
  }, [documentId])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), AUTO_SAVE_DEBOUNCE_MS)
  }, [flushAndSave])

  // Ctrl+S / Cmd+S — flush immediately
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void flushAndSave()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [flushAndSave])

  // Flush any pending save on unmount — prevents blank board when switching tabs
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (saveTimerRef.current) void flushAndSave()
  }, [flushAndSave])

  // Parse initial board content ───────────────────────────────────────────────
  const [initialData, setInitialData] = useState<{
    elements: unknown[]
    appState: Record<string, unknown>
  } | null>(null)
  const initialLoadedRef = useRef(false)

  useEffect(() => {
    if (!doc || initialLoadedRef.current) return
    initialLoadedRef.current = true
    try {
      const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
      if (isBoardContent(raw)) {
        setInitialData({ elements: raw.elements ?? [], appState: raw.appState ?? {} })
      } else {
        setInitialData({ elements: [], appState: {} })
      }
    } catch {
      setInitialData({ elements: [], appState: {} })
    }
  }, [doc])

  // onChange — auto-save and track selection/tool ─────────────────────────────
  const handleChange = useCallback(
    (elements: ExcalidrawElements, appState: ExcalidrawAppState) => {
      latestElementsRef.current = elements
      latestAppStateRef.current = appState

      // UI-only tracking (always runs, never triggers a save)
      const toolType = appState?.activeTool?.type as string | undefined
      if (toolType) setActiveToolType(toolType)
      const selectedCount = Object.keys(appState?.selectedElementIds ?? {}).length
      setHasSelection(selectedCount > 0)
      const zoomValue = appState?.zoom?.value
      if (zoomValue != null) setCanvasZoom(Math.round(zoomValue * 100))

      // Only schedule a save when something we actually persist has changed.
      // Excalidraw fires onChange for transient state (cursor position, hover,
      // active tool) that we don't save, which would otherwise reset the debounce
      // and the 'Saved' idle timer on every mouse move.
      const last = lastScheduledRef.current
      const scrollX = appState?.scrollX ?? 0
      const scrollY = appState?.scrollY ?? 0
      const zoom = appState?.zoom?.value ?? 1
      const changed = !last
        || elements !== last.elements
        || scrollX !== last.scrollX
        || scrollY !== last.scrollY
        || zoom !== last.zoom

      if (changed) {
        lastScheduledRef.current = { elements, scrollX, scrollY, zoom }
        scheduleSave()
      }
    },
    [scheduleSave],
  )

  // Canvas zoom ───────────────────────────────────────────────────────────────
  const handleCanvasZoomChange = useCallback((pct: number) => {
    const api = excalidrawAPIRef.current
    if (!api) return
    api.updateScene({ appState: { zoom: { value: pct / 100 } } })
    setCanvasZoom(pct)
  }, [])

  // Board AI context ──────────────────────────────────────────────────────────
  const getBoardContext = useCallback((): string => {
    return buildBoardContext(latestElementsRef.current)
  }, [])

  // ProseFileCard embeddable renderer ────────────────────────────────────────
  const renderEmbeddable = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (element: any): JSX.Element | null => {
      if (!element.customData?.proseFileCard) return null
      const data = element.customData as ProseFileCardData

      const openFile = async () => {
        try {
          const d = await window.prose.documents.getById(data.fileId)
          if (d) openDocumentTab({ id: d.id, title: d.title, format: d.format })
        } catch { /* ignore */ }
      }

      return (
        <ProseFileCardView
          data={data}
          width={element.width}
          height={element.height}
          onOpen={openFile}
        />
      )
    },
    [openDocumentTab],
  )

  // Add file card to board ────────────────────────────────────────────────────
  const addFileCard = useCallback(
    (fileId: string, fileType: string, title: string, wordCount: number, preview: string) => {
      const api = excalidrawAPIRef.current
      if (!api) return

      const appState = api.getAppState()
      const elements = api.getSceneElements()

      const x = -appState.scrollX + (appState.width ?? 800) / 2 / appState.zoom.value - 140
      const y = -appState.scrollY + (appState.height ?? 600) / 2 / appState.zoom.value - 70

      const newElement = {
        type: 'embeddable',
        id: crypto.randomUUID(),
        x, y,
        width: 280, height: 140, angle: 0,
        strokeColor: 'transparent', backgroundColor: 'transparent',
        fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
        roundness: { type: 3, value: 8 }, roughness: 0, opacity: 100,
        groupIds: [], frameId: null, boundElements: null,
        updated: Date.now(), isDeleted: false, link: null, locked: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), index: null,
        customData: {
          proseFileCard: true, fileId, fileType, title, wordCount, preview,
        } satisfies ProseFileCardData,
      }

      api.updateScene({ elements: [...elements, newElement] })
      scheduleSave()
    },
    [scheduleSave],
  )

  // ── Sidebar ────────────────────────────────────────────────────────────────

  const sidebarWidth = boardSidebarOpen ? boardSidebarWidth : 42

  const sidebar = (
    <aside
      className="relative flex shrink-0 flex-col border-r border-border bg-background"
      style={{ width: sidebarWidth }}
    >
      {/* Top: Properties icon */}
      <div className="flex flex-col gap-0.5 p-1.5">
        <SidebarIcon
          icon={PanelLeft}
          label="Properties"
          expanded={boardSidebarOpen}
          active={boardSidebarOpen}
          onClick={() => setBoardSidebarOpen(!boardSidebarOpen)}
        />
      </div>

      {/* Panel content — empty state or transparent (native panel renders through via CSS) */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {boardSidebarOpen && !hasSelection && (
            <motion.div
              key="empty"
              className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            >
              <div className="flex gap-2.5 text-muted-foreground/40">
                <Square className="h-4 w-4" strokeWidth={1.5} />
                <Circle className="h-4 w-4" strokeWidth={1.5} />
                <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Select an element to see its properties.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom: Settings + Collapse */}
      <div className="flex flex-col gap-0.5 border-t border-border p-1.5">
        <SidebarIcon
          icon={Settings}
          label="Settings"
          expanded={boardSidebarOpen}
          active={false}
          onClick={() => setSettingsOpen(true)}
        />
        <button
          onClick={() => setBoardSidebarOpen(!boardSidebarOpen)}
          className="flex h-7 w-full items-center gap-2 rounded-md px-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title={boardSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {boardSidebarOpen
            ? <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          {boardSidebarOpen && <span className="truncate text-xs">Collapse</span>}
        </button>
      </div>

      {/* Drag handle */}
      {boardSidebarOpen && (
        <div
          className="absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30 z-10"
          onMouseDown={(e) => {
            boardSidebarDragRef.current = { x: e.clientX, width: boardSidebarWidth }
            globalThis.document.body.style.cursor = 'col-resize'
            globalThis.document.body.style.userSelect = 'none'
          }}
        />
      )}
    </aside>
  )

  // ── Status bar ─────────────────────────────────────────────────────────────

  const statusBar = (
    <BoardStatusBar
      saveStatus={saveStatus}
      nowPlaying={music?.nowPlayingTitle}
      ambientPlaying={ambientPlaying}
      onMusicClick={() => { setMusicPanelTab('tracks'); setMusicPanelOpen(true) }}
      onAmbientClick={() => { setMusicPanelTab('mixer'); setMusicPanelOpen(true) }}
    />
  )

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!doc || initialData === null) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
        <BoardToolbar
          excalidrawAPI={null}
          activeToolType="selection"
          documentId={documentId}
          canvasZoom={canvasZoom}
          onCanvasZoomChange={handleCanvasZoomChange}
          onAddFileCard={addFileCard}
        />
        <div className="flex flex-1 overflow-hidden">
          {sidebar}
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-muted-foreground/50">Loading…</span>
          </div>
        </div>
        {statusBar}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <FileEditorTitleBar />
      <BoardToolbar
        excalidrawAPI={excalidrawAPIState}
        activeToolType={activeToolType}
        documentId={documentId}
        canvasZoom={canvasZoom}
        onCanvasZoomChange={handleCanvasZoomChange}
        onAddFileCard={addFileCard}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebar}

        {/* Canvas + AI panel row — CSS var lets globals.css translate the properties panel */}
        <div
          className={cn(
            'prose-excalidraw-root flex min-h-0 flex-1',
            boardSidebarOpen && 'prose-board-sidebar-open',
          )}
          style={{ '--board-sidebar-width': `${boardSidebarWidth}px` } as React.CSSProperties}
        >
          <div className="min-h-0 min-w-0 flex-1">
            <Excalidraw
              excalidrawAPI={(api) => { excalidrawAPIRef.current = api; setExcalidrawAPIState(api) }}
              initialData={initialData}
              onChange={handleChange}
              theme={theme === 'dark' ? 'dark' : 'light'}
              gridModeEnabled={true}
              renderEmbeddable={renderEmbeddable}
              UIOptions={{
                welcomeScreen: false,
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas: false,
                  export: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  saveAsImage: false,
                  toggleTheme: false,
                },
                tools: { image: false },
              }}
            >
              {/* Empty MainMenu removes the hamburger menu items */}
              <MainMenu />
            </Excalidraw>
          </div>

          {/* AI panel */}
          {aiPanelOpen && (
            <div className="shrink-0" style={{ width: AI_PANEL_WIDTH }}>
              <AiPanel
                editor={null}
                fileType="board"
                getDocumentContent={getBoardContext}
              />
            </div>
          )}
        </div>
      </div>

      {statusBar}

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
