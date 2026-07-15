import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Excalidraw, MainMenu, exportToBlob } from '@excalidraw/excalidraw'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no type declarations for CSS side-effect import
import '@excalidraw/excalidraw/index.css'
import { motion, AnimatePresence } from 'motion/react'
import {
  Settings, ChevronLeft, ChevronRight,
  PanelLeft, Square, Circle, ArrowRight,
  Scissors, Copy, Clipboard, Trash2, CopyPlus,
  Group, Ungroup, SendToBack, BringToFront, Link2,
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
import { BoardsAIPanel } from './BoardsAIPanel'
import { STICKY_NOTE_COLORS } from './aiBoardUtils'
import { createBoardActionHandler } from './boardAiActions'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'
import { cn } from '@/lib/utils'
import SettingsModal from '@/components/settings/SettingsModal'
import { ChartPickerDialog } from '@/components/shared/ChartPickerDialog'
import type { ChartSnapshot } from '@/lib/chartSnapshot'
import { dispatchUndoRedoKey } from '@/lib/simulateUndoRedo'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useIsActiveTab } from '@/hooks/useIsActiveTab'
import { useForceRepaintOnMount } from '@/hooks/useForceRepaintOnMount'
import { useContextMenuIcons } from '@/hooks/useContextMenuIcons'
import { runThumbnailGenerationOnce, blobToDataUrl, downscaleToThumbnail } from '@/lib/thumbnailGeneration'

// Excalidraw's native right-click menu has no per-item class/data-attribute to
// target — only the rendered (English) label identifies each action. This is
// a best-effort match against its default English labels; unmapped items are
// simply left without an icon.
const EXCALIDRAW_CONTEXT_MENU_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Cut: Scissors,
  Copy,
  Paste: Clipboard,
  Delete: Trash2,
  Duplicate: CopyPlus,
  'Group selection': Group,
  'Ungroup selection': Ungroup,
  'Send to back': SendToBack,
  'Bring to front': BringToFront,
  Link: Link2,
  'Create link': Link2,
}

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
}): JSX.Element {
  const typeLabel: Record<string, string> = { document: 'DOC', sheet: 'SHEET', board: 'BOARD' }
  const countLabel: Record<string, string> = { sheet: 'cells', board: 'elements' }
  const unit = countLabel[data.fileType] ?? 'words'

  const [thumbUrl, setThumbUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void window.prose.thumbnails.getDataUrl(data.fileId).then((url) => {
      if (!cancelled && url) setThumbUrl(url)
    })
    return () => { cancelled = true }
  }, [data.fileId])

  return (
    <div
      style={{ width, height }}
      className="flex flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm"
      onDoubleClick={(e) => { e.stopPropagation(); onOpen() }}
    >
      {thumbUrl ? (
        <div className="h-16 w-full shrink-0 overflow-hidden">
          <img src={thumbUrl} draggable={false} className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col overflow-hidden p-3">
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
        {!thumbUrl && data.preview && (
          <p className="line-clamp-2 text-[10px] leading-relaxed text-muted-foreground/80">
            {data.preview}
          </p>
        )}
        <p className="mt-auto pt-1 text-[9px] text-muted-foreground/50">Double-click to open</p>
      </div>
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function BoardEditor({ documentId }: BoardEditorProps): JSX.Element {
  useContextMenuIcons('.context-menu-item__label', EXCALIDRAW_CONTEXT_MENU_ICONS)
  const isActive = useIsActiveTab(documentId)
  const { document: doc } = useDocument(documentId)
  const excalidrawAPIRef = useRef<ExcalidrawAPI | null>(null)
  const [excalidrawAPIState, setExcalidrawAPIState] = useState<ExcalidrawAPI | null>(null)
  const excalidrawWrapperRef = useRef<HTMLDivElement>(null)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const theme = useAppStore((s) => s.theme)
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)
  const boardSidebarOpen = useAppStore((s) => s.boardSidebarOpen)
  const setBoardSidebarOpen = useAppStore((s) => s.setBoardSidebarOpen)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const boardSidebarWidth = 240

  // AI panel width — resizable via drag handle, same behavior as Documents'
  // AI panel (Editor.tsx), persisted to the same localStorage key so the
  // width preference is shared across file types.
  const [aiPanelWidth, setAiPanelWidth] = useState(() => {
    const v = localStorage.getItem('prose-ai-panel-width')
    return v ? Math.max(240, parseInt(v)) : AI_PANEL_WIDTH
  })
  const aiPanelDragRef = useRef<{ x: number; width: number } | null>(null)
  const aiPanelWidthRef = useRef(aiPanelWidth)
  useEffect(() => { aiPanelWidthRef.current = aiPanelWidth }, [aiPanelWidth])
  // Suppresses the panel's open/close width transition while actively
  // drag-resizing — else every mousemove retargets an eased animation and the
  // panel edge lags behind the cursor instead of tracking it 1:1.
  const [isResizingAiPanel, setIsResizingAiPanel] = useState(false)

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!aiPanelDragRef.current) return
      const delta = aiPanelDragRef.current.x - e.clientX
      const width = Math.min(600, Math.max(240, aiPanelDragRef.current.width + delta))
      setAiPanelWidth(width)
      aiPanelWidthRef.current = width
    }
    function onMouseUp(): void {
      if (!aiPanelDragRef.current) return
      aiPanelDragRef.current = null
      setIsResizingAiPanel(false)
      localStorage.setItem('prose-ai-panel-width', String(aiPanelWidthRef.current))
      if (globalThis.document?.body) {
        globalThis.document.body.style.cursor = ''
        globalThis.document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const aiPanelRef = useRef<HTMLDivElement>(null)
  useForceRepaintOnMount(aiPanelRef)

  // Thumbnail generation — fired by the main process after every successful
  // content auto-save. Unlike Documents/Sheets this never goes through
  // captureRegion — Excalidraw renders its own export via exportToBlob, which
  // we then downscale to the standard 560x315 thumbnail size client-side.
  useEffect(() => {
    return window.prose.thumbnails.onGenerate((fileId) => {
      if (fileId !== documentId) return
      void runThumbnailGenerationOnce(fileId, async () => {
        const api = excalidrawAPIRef.current
        if (!api) return
        const elements = api.getSceneElements()
        if (!elements || elements.length === 0) return // retain prior has_thumbnail state, don't touch it

        // exportToBlob is a standalone function from the package, not a method
        // on the imperative API ref — it needs the scene handed to it explicitly.
        const blob = await exportToBlob({
          elements,
          appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
          files: api.getFiles(),
          mimeType: 'image/png',
        })
        const dataUrl = await blobToDataUrl(blob)
        const base64 = await downscaleToThumbnail(dataUrl)
        await window.prose.thumbnails.save(fileId, base64)
      })
    })
  }, [documentId])

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

  // Undo/redo enabled state — Excalidraw keeps its undo stack entirely internal
  // (the public API only exposes history.clear(), no isUndoStackEmpty), so we
  // mirror its depth ourselves: genuine edits push, our own Undo/Redo button
  // clicks pop/push between the two stacks the same way Excalidraw's internal
  // undo/redo actions do.
  const undoDepthRef = useRef(0)
  const redoDepthRef = useRef(0)
  const pendingUndoRedoRef = useRef<'undo' | 'redo' | null>(null)
  const undoCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Safety net for `pendingUndoRedoRef`: if our mirrored depth had drifted and
  // Excalidraw's real stack had nothing to undo/redo, no onChange follows to
  // clear the flag — without this it would stay stuck and misclassify the
  // next genuine edit as this undo/redo.
  const pendingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

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

  const setSaveActiveDocument = useAppStore((s) => s.setSaveActiveDocument)

  useEffect(() => {
    if (!isActive) return
    setSaveActiveDocument(async () => { await flushAndSave() })
    return () => setSaveActiveDocument(null)
  }, [isActive, flushAndSave, setSaveActiveDocument])

  // Ctrl+S / Cmd+S — flush immediately; Ctrl+F — block (disabled for boards)
  useEffect(() => {
    if (!isActive) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        void flushAndSave()
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [isActive, flushAndSave])

  // Flush any pending save on unmount — prevents blank board when switching tabs
  useEffect(() => () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    if (saveTimerRef.current) void flushAndSave()
  }, [flushAndSave])

  // Parse initial board content ───────────────────────────────────────────────
  const [initialData, setInitialData] = useState<{
    elements: ExcalidrawElements
    appState: Record<string, unknown>
  } | null>(null)
  const initialLoadedRef = useRef(false)

  useEffect(() => {
    if (!doc || initialLoadedRef.current) return
    initialLoadedRef.current = true
    try {
      const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
      if (isBoardContent(raw)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setInitialData({ elements: (raw.elements ?? []) as any[], appState: raw.appState ?? {} })
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

      // Undo/redo depth tracking — gated on the elements array specifically
      // (not scroll/zoom) since panning/zooming isn't part of Excalidraw's
      // undo history. `last !== null` excludes the initial onChange the
      // library fires on mount, which isn't a user edit.
      if (last !== null && elements !== last.elements) {
        if (pendingUndoRedoRef.current === 'undo') {
          if (pendingClearTimerRef.current) { clearTimeout(pendingClearTimerRef.current); pendingClearTimerRef.current = null }
          undoDepthRef.current = Math.max(0, undoDepthRef.current - 1)
          redoDepthRef.current += 1
          pendingUndoRedoRef.current = null
          setCanUndo(undoDepthRef.current > 0)
          setCanRedo(true)
        } else if (pendingUndoRedoRef.current === 'redo') {
          if (pendingClearTimerRef.current) { clearTimeout(pendingClearTimerRef.current); pendingClearTimerRef.current = null }
          redoDepthRef.current = Math.max(0, redoDepthRef.current - 1)
          undoDepthRef.current += 1
          pendingUndoRedoRef.current = null
          setCanUndo(true)
          setCanRedo(redoDepthRef.current > 0)
        } else {
          // Debounce briefly so a continuous drag collapses into one counted
          // undo step instead of one per onChange firing.
          if (undoCountTimerRef.current) clearTimeout(undoCountTimerRef.current)
          undoCountTimerRef.current = setTimeout(() => {
            undoDepthRef.current += 1
            redoDepthRef.current = 0
            setCanUndo(true)
            setCanRedo(false)
          }, 300)
        }
      }

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

      const openFile = async (): Promise<void> => {
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
        updated: Date.now(), isDeleted: false, link: 'https://prose-embed.internal/file-card', locked: false,
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

  // Insert a static chart snapshot as a native Excalidraw image element — moves,
  // resizes, and rotates just like any other board element, and does not
  // live-update if the source sheet's chart changes later.
  const [chartPickerOpen, setChartPickerOpen] = useState(false)

  const addChartElement = useCallback(
    (snapshot: ChartSnapshot) => {
      const api = excalidrawAPIRef.current
      if (!api) return

      const appState = api.getAppState()
      const elements = api.getSceneElements()

      const maxWidth = 480
      const scale = snapshot.width > maxWidth ? maxWidth / snapshot.width : 1
      const width = Math.round(snapshot.width * scale)
      const height = Math.round(snapshot.height * scale)

      const x = -appState.scrollX + (appState.width ?? 800) / 2 / appState.zoom.value - width / 2
      const y = -appState.scrollY + (appState.height ?? 600) / 2 / appState.zoom.value - height / 2

      const fileId = crypto.randomUUID()
      api.addFiles([{
        id: fileId,
        dataURL: snapshot.dataUrl,
        mimeType: 'image/png',
        created: Date.now(),
      }])

      const newElement = {
        type: 'image',
        id: crypto.randomUUID(),
        x, y, width, height, angle: 0,
        strokeColor: 'transparent', backgroundColor: 'transparent',
        fillStyle: 'solid', strokeWidth: 1, strokeStyle: 'solid',
        roundness: null, roughness: 0, opacity: 100,
        groupIds: [], frameId: null, boundElements: null,
        updated: Date.now(), isDeleted: false, link: null, locked: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1, versionNonce: Math.floor(Math.random() * 2 ** 31), index: null,
        fileId, status: 'saved', scale: [1, 1], crop: null,
      }

      api.updateScene({ elements: [...elements, newElement] })
      scheduleSave()
    },
    [scheduleSave],
  )

  // AI brainstorm — places each generated idea as a sticky note (rectangle +
  // bound text), tiled in a grid near the current viewport center.
  const addBrainstormNotes = useCallback(
    (ideas: string[]) => {
      const api = excalidrawAPIRef.current
      if (!api || ideas.length === 0) return

      const appState = api.getAppState()
      const elements = api.getSceneElements()

      const NOTE_W = 200
      const NOTE_H = 140
      const GAP = 24
      const cols = Math.min(4, Math.ceil(Math.sqrt(ideas.length)))
      const rows = Math.ceil(ideas.length / cols)
      const gridW = cols * NOTE_W + (cols - 1) * GAP
      const gridH = rows * NOTE_H + (rows - 1) * GAP
      const originX = -appState.scrollX + (appState.width ?? 800) / 2 / appState.zoom.value - gridW / 2
      const originY = -appState.scrollY + (appState.height ?? 600) / 2 / appState.zoom.value - gridH / 2

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newElements: any[] = []

      ideas.forEach((idea, i) => {
        const x = originX + (i % cols) * (NOTE_W + GAP)
        const y = originY + Math.floor(i / cols) * (NOTE_H + GAP)
        const color = STICKY_NOTE_COLORS[i % STICKY_NOTE_COLORS.length]!
        const rectId = crypto.randomUUID()
        const textId = crypto.randomUUID()
        const now = Date.now()

        newElements.push({
          type: 'rectangle',
          id: rectId,
          x, y,
          width: NOTE_W,
          height: NOTE_H,
          angle: 0,
          strokeColor: 'transparent',
          backgroundColor: color,
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          boundElements: [{ type: 'text', id: textId }],
          updated: now,
          isDeleted: false,
          link: null,
          locked: false,
          seed: Math.floor(Math.random() * 2 ** 31),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          index: null,
          roundness: { type: 3 },
        })

        newElements.push({
          type: 'text',
          id: textId,
          x: x + 10,
          y: y + 10,
          width: NOTE_W - 20,
          height: NOTE_H - 20,
          angle: 0,
          strokeColor: '#1e1e1e',
          backgroundColor: 'transparent',
          fillStyle: 'solid',
          strokeWidth: 2,
          strokeStyle: 'solid',
          roughness: 0,
          opacity: 100,
          groupIds: [],
          frameId: null,
          boundElements: null,
          containerId: rectId,
          text: idea,
          fontSize: 15,
          fontFamily: 1,
          textAlign: 'center',
          verticalAlign: 'middle',
          autoResize: true,
          lineHeight: 1.25,
          updated: now,
          isDeleted: false,
          link: null,
          locked: false,
          seed: Math.floor(Math.random() * 2 ** 31),
          version: 1,
          versionNonce: Math.floor(Math.random() * 2 ** 31),
          index: null,
        })
      })

      api.updateScene({ elements: [...elements, ...newElements] })
      scheduleSave()
    },
    [scheduleSave],
  )

  // AI chat action handler — lets prose-actions from the AI panel draw nodes,
  // arrows, and file cards on the board (after the user clicks Apply).
  const boardActionHandler = useMemo(() => createBoardActionHandler({
    getApi: () => excalidrawAPIRef.current,
    addFileCard,
    scheduleSave,
  }), [addFileCard, scheduleSave])

  // Marks the next onChange as consuming this undo/redo (see handleChange)
  // rather than being a genuine edit. Armed with a short safety timeout: if
  // our mirrored depth was wrong and Excalidraw's real stack had nothing to
  // do, no onChange follows to clear the flag, so clear it ourselves instead
  // of leaving it stuck to misclassify the next real edit.
  const armPendingUndoRedo = useCallback((action: 'undo' | 'redo') => {
    if (undoCountTimerRef.current) { clearTimeout(undoCountTimerRef.current); undoCountTimerRef.current = null }
    if (pendingClearTimerRef.current) clearTimeout(pendingClearTimerRef.current)
    pendingUndoRedoRef.current = action
    pendingClearTimerRef.current = setTimeout(() => {
      pendingUndoRedoRef.current = null
      pendingClearTimerRef.current = null
    }, 250)
  }, [])

  // Excalidraw has no public undo()/redo() API — it only responds to a real
  // keydown on its own root container (.excalidraw-container), so locate that
  // element within this board's own wrapper and dispatch there.
  const handleUndo = useCallback(() => {
    if (undoDepthRef.current === 0) return
    armPendingUndoRedo('undo')
    const root = excalidrawWrapperRef.current?.querySelector('.excalidraw-container')
    dispatchUndoRedoKey(root, 'undo')
  }, [armPendingUndoRedo])

  const handleRedo = useCallback(() => {
    if (redoDepthRef.current === 0) return
    armPendingUndoRedo('redo')
    const root = excalidrawWrapperRef.current?.querySelector('.excalidraw-container')
    dispatchUndoRedoKey(root, 'redo')
  }, [armPendingUndoRedo])

  // A native Ctrl+Z/Ctrl+Y keypress goes straight to Excalidraw's own keydown
  // handler on its root container, bypassing handleUndo/handleRedo (and
  // armPendingUndoRedo) entirely — so it used to always fall into
  // handleChange's "genuine edit" branch, corrupting the mirrored depth
  // counters relative to Excalidraw's real stack. Intercept in the CAPTURE
  // phase (fires before Excalidraw's bubble-phase handler) so native hotkeys
  // go through the exact same bookkeeping as the toolbar buttons.
  useEffect(() => {
    if (!isActive || !excalidrawAPIState) return
    const root = excalidrawWrapperRef.current?.querySelector('.excalidraw-container')
    if (!root) return
    function onKeyCapture(e: Event): void {
      const ke = e as KeyboardEvent
      if (!ke.ctrlKey || (ke.code !== 'KeyZ' && ke.code !== 'KeyY')) return
      const isRedo = ke.code === 'KeyY' || ke.shiftKey
      const depthRef = isRedo ? redoDepthRef : undoDepthRef
      if (depthRef.current === 0) return
      armPendingUndoRedo(isRedo ? 'redo' : 'undo')
    }
    root.addEventListener('keydown', onKeyCapture, true)
    return () => root.removeEventListener('keydown', onKeyCapture, true)
  }, [isActive, excalidrawAPIState, armPendingUndoRedo])

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
          {boardSidebarOpen && !hasSelection && (activeToolType === 'selection' || activeToolType === 'hand' || activeToolType === 'eraser') && (
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
      <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
        <BoardToolbar
          excalidrawAPI={null}
          activeToolType="selection"
          documentId={documentId}
          documentTitle={doc?.title}
          canvasZoom={canvasZoom}
          onCanvasZoomChange={handleCanvasZoomChange}
          onAddFileCard={addFileCard}
          onSettingsOpen={() => setSettingsOpen(true)}
        />
        <div className="flex flex-1 overflow-hidden">
          {sidebar}
          <div className="flex flex-1 items-center justify-center">
            <span className="text-sm text-muted-foreground/50">Loading…</span>
          </div>
        </div>
        {statusBar}
      </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
    <div className="flex h-screen flex-col bg-background">
      <FileEditorTitleBar />
      <BoardToolbar
        excalidrawAPI={excalidrawAPIState}
        activeToolType={activeToolType}
        documentId={documentId}
        documentTitle={doc.title}
        canvasZoom={canvasZoom}
        onCanvasZoomChange={handleCanvasZoomChange}
        onAddFileCard={addFileCard}
        onInsertChart={() => setChartPickerOpen(true)}
        onSettingsOpen={() => setSettingsOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
      />

      <div className="flex flex-1 overflow-hidden">
        {sidebar}

        {/* Canvas + AI panel row — CSS var lets globals.css translate the properties panel */}
        <div
          className={cn(
            'prose-excalidraw-root flex min-h-0 flex-1',
            boardSidebarOpen && isActive && 'prose-board-sidebar-open',
          )}
          style={{ '--board-sidebar-width': `${boardSidebarWidth}px` } as React.CSSProperties}
        >
          <div className="min-h-0 min-w-0 flex-1" ref={excalidrawWrapperRef}>
            <Excalidraw
              excalidrawAPI={(api) => { excalidrawAPIRef.current = api; setExcalidrawAPIState(api) }}
              initialData={initialData}
              onChange={handleChange}
              theme={theme === 'dark' ? 'dark' : 'light'}
              gridModeEnabled={true}
              renderEmbeddable={renderEmbeddable}
              validateEmbeddable={(url) => url.startsWith('https://prose-embed.internal')}
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

          {/* AI panel — resizable, same width-animated open/close as Slides'
              right panel (SlidesEditor.tsx). Stays mounted at all times so
              chat state survives closing and reopening the panel. */}
          <motion.div
            ref={aiPanelRef}
            className="relative shrink-0 overflow-hidden border-l border-border"
            initial={false}
            animate={{ width: aiPanelOpen ? aiPanelWidth : 0 }}
            transition={{ duration: isResizingAiPanel ? 0 : 0.12, ease: 'easeOut' }}
            style={{ pointerEvents: aiPanelOpen ? 'auto' : 'none' }}
          >
            <div
              className="absolute left-0 top-0 z-10 h-full w-1 cursor-col-resize transition-colors hover:bg-primary/30"
              onMouseDown={(e) => {
                aiPanelDragRef.current = { x: e.clientX, width: aiPanelWidth }
                setIsResizingAiPanel(true)
                globalThis.document.body.style.cursor = 'col-resize'
                globalThis.document.body.style.userSelect = 'none'
              }}
            />
            <motion.div
              className="absolute inset-0"
              style={{ width: aiPanelWidth }}
              initial={false}
              animate={{ opacity: aiPanelOpen ? 1 : 0, x: aiPanelOpen ? 0 : 16 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <BoardsAIPanel
                getBoardContext={getBoardContext}
                onInsert={addBrainstormNotes}
                actionHandler={boardActionHandler}
              />
            </motion.div>
          </motion.div>
        </div>
      </div>

      {statusBar}

      {settingsOpen && (
        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {chartPickerOpen && (
        <ChartPickerDialog
          open={chartPickerOpen}
          onClose={() => setChartPickerOpen(false)}
          onSelect={addChartElement}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
