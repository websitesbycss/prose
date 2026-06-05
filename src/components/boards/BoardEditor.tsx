import { useState, useRef, useCallback, useEffect } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'

import { useDocument } from '@/hooks/useDocument'
import type { BoardContent } from '@/types/board'
import { isBoardContent, createInitialBoardContent } from '@/types/board'
import { FileEditorTitleBar } from '@/components/editor/FileEditorTitleBar'
import { BoardToolbar } from './BoardToolbar'
import { AUTO_SAVE_DEBOUNCE_MS, AI_PANEL_WIDTH } from '@/constants'
import { useAppStore } from '@/store/appStore'
import AiPanel from '@/components/editor/AiPanel'

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

  // Track active Excalidraw tool for toolbar highlighting
  const [activeToolType, setActiveToolType] = useState('selection')

  // Auto-save ─────────────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestElementsRef = useRef<ExcalidrawElements>([])
  const latestAppStateRef = useRef<ExcalidrawAppState | null>(null)

  const flushAndSave = useCallback(async () => {
    const api = excalidrawAPIRef.current
    if (!api) return
    try {
      const elements = api.getSceneElements()
      const appState = api.getAppState()
      const boardContent: BoardContent = {
        version: 2,
        elements: elements as unknown[],
        appState: {
          zoom: appState.zoom,
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          theme: appState.theme,
        },
      }
      await window.prose.documents.update(documentId, { content: JSON.stringify(boardContent) })
    } catch (err) {
      console.error('[BoardEditor] save error:', err)
    }
  }, [documentId])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), AUTO_SAVE_DEBOUNCE_MS)
  }, [flushAndSave])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

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

  // onChange — auto-save every time the scene changes ─────────────────────────
  const handleChange = useCallback(
    (elements: ExcalidrawElements, appState: ExcalidrawAppState) => {
      latestElementsRef.current = elements
      latestAppStateRef.current = appState
      // Track active tool for toolbar highlighting
      const toolType = appState?.activeTool?.type as string | undefined
      if (toolType) setActiveToolType(toolType)
      scheduleSave()
    },
    [scheduleSave],
  )

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

      // Place at center of current viewport
      const x = -appState.scrollX + (appState.width ?? 800) / 2 / appState.zoom.value - 140
      const y = -appState.scrollY + (appState.height ?? 600) / 2 / appState.zoom.value - 70

      const newElement = {
        type: 'embeddable',
        id: crypto.randomUUID(),
        x,
        y,
        width: 280,
        height: 140,
        angle: 0,
        strokeColor: 'transparent',
        backgroundColor: 'transparent',
        fillStyle: 'solid',
        strokeWidth: 1,
        strokeStyle: 'solid',
        roundness: { type: 3, value: 8 },
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        boundElements: null,
        updated: Date.now(),
        isDeleted: false,
        link: null,
        locked: false,
        seed: Math.floor(Math.random() * 2 ** 31),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2 ** 31),
        index: null,
        customData: {
          proseFileCard: true,
          fileId,
          fileType,
          title,
          wordCount,
          preview,
        } satisfies ProseFileCardData,
      }

      api.updateScene({ elements: [...elements, newElement] })
      scheduleSave()
    },
    [scheduleSave],
  )

  // Loading state ─────────────────────────────────────────────────────────────
  if (!doc || initialData === null) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
        <BoardToolbar
          excalidrawAPI={null}
          activeToolType="selection"
          documentId={documentId}
          onAddFileCard={addFileCard}
        />
        <div className="flex flex-1 items-center justify-center">
          <span className="text-sm text-muted-foreground/50">Loading…</span>
        </div>
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
        onAddFileCard={addFileCard}
      />

      {/* Canvas + AI panel row */}
      <div className="prose-excalidraw-root flex min-h-0 flex-1">
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
          />
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
  )
}
