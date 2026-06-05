import { useRef, useState, useCallback, useEffect } from 'react'
import { Tldraw, getSnapshot, loadSnapshot } from 'tldraw'
import type { Editor, TLStoreSnapshot } from 'tldraw'
import 'tldraw/tldraw.css'

import { useDocument } from '@/hooks/useDocument'
import type { BoardContent } from '@/types/board'
import { isBoardContent } from '@/types/board'
import { FileEditorTitleBar } from '@/components/editor/FileEditorTitleBar'
import { BoardToolbar } from './BoardToolbar'
import { ProseFileCardShapeUtil } from './ProseFileCardShape'
import { ProseStickyNoteShapeUtil } from './ProseStickyNoteShape'
import { AUTO_SAVE_DEBOUNCE_MS, AI_PANEL_WIDTH } from '@/constants'
import { useAppStore } from '@/store/appStore'
import AiPanel from '@/components/editor/AiPanel'

// ── Custom shape utils ────────────────────────────────────────────────────────

const CUSTOM_SHAPE_UTILS = [ProseFileCardShapeUtil, ProseStickyNoteShapeUtil]

// ── Board AI context builder ──────────────────────────────────────────────────

function buildBoardContext(editor: Editor): string {
  const shapes = editor.getCurrentPageShapes()
  const fileCards = shapes.filter((s) => s.type === 'prose-file-card')
  const stickyNotes = shapes.filter((s) => s.type === 'prose-sticky-note')
  const others = shapes.filter((s) => s.type !== 'prose-file-card' && s.type !== 'prose-sticky-note')

  const parts: string[] = [
    `Board has ${shapes.length} elements total:`,
    `  - ${fileCards.length} file card(s)`,
    `  - ${stickyNotes.length} sticky note(s)`,
    `  - ${others.length} other shape(s)`,
    '',
  ]

  if (fileCards.length > 0) {
    parts.push('File cards:')
    for (const card of fileCards) {
      const p = card.props as { title?: string; fileType?: string; wordCount?: number; preview?: string }
      const unit = p.fileType === 'sheet' ? 'cells' : p.fileType === 'board' ? 'elements' : 'words'
      parts.push(`  - "${p.title ?? 'Untitled'}" (${p.fileType ?? 'document'}, ${p.wordCount ?? 0} ${unit})`)
      if (p.preview) parts.push(`    Preview: "${p.preview.slice(0, 80)}"`)
    }
    parts.push('')
  }

  if (stickyNotes.length > 0) {
    parts.push('Sticky notes:')
    for (const note of stickyNotes) {
      const p = note.props as { text?: string; color?: string }
      if (p.text) parts.push(`  - "${p.text.slice(0, 80)}"`)
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
  const editorRef = useRef<Editor | null>(null)
  // Ref so listeners always have access to the latest scheduleSave without re-subscribing
  const scheduleSaveRef = useRef<() => void>(() => undefined)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const [activeTool, setActiveTool] = useState('select')
  // Separate zoom state to avoid re-rendering the whole tree on every camera move
  const [zoomLevel, setZoomLevel] = useState(100)
  // Ref to store unsubscribe functions set up inside onMount, cleaned up on unmount
  const listenersCleanupRef = useRef<(() => void) | null>(null)
  // Track whether we've loaded the initial snapshot so we don't double-load on re-mount
  const snapshotLoadedRef = useRef(false)

  // Auto-save ─────────────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushAndSave = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    try {
      const snapshot = getSnapshot(editor.store)
      const boardContent: BoardContent = { version: 1, snapshot: snapshot as unknown as Record<string, unknown> }
      await window.prose.documents.update(documentId, { content: JSON.stringify(boardContent) })
    } catch (err) {
      console.error('[BoardEditor] save error:', err)
    }
  }, [documentId])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), AUTO_SAVE_DEBOUNCE_MS)
  }, [flushAndSave])

  // Keep the ref current so store listeners always call the latest version
  scheduleSaveRef.current = scheduleSave

  // Unmount: cancel any pending save and clean up tldraw store listeners
  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    listenersCleanupRef.current?.()
  }, [])

  // Board AI context ──────────────────────────────────────────────────────────
  const getBoardContext = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) return ''
    return buildBoardContext(editor)
  }, [])

  // Load initial snapshot once the doc is available and editor is mounted
  useEffect(() => {
    if (!doc || snapshotLoadedRef.current || !editorRef.current) return
    const editor = editorRef.current
    try {
      const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
      if (isBoardContent(raw) && Object.keys(raw.snapshot).length > 0) {
        loadSnapshot(editor.store, raw.snapshot as TLStoreSnapshot)
      }
    } catch { /* keep empty board */ }
    snapshotLoadedRef.current = true
  }, [doc])

  // tldraw mount ──────────────────────────────────────────────────────────────
  const onMount = useCallback((editor: Editor) => {
    editorRef.current = editor

    // Load snapshot if doc is already available at mount time
    if (!snapshotLoadedRef.current) {
      const { document: latestDoc } = { document: doc }
      if (latestDoc) {
        try {
          const raw = typeof latestDoc.content === 'string' ? JSON.parse(latestDoc.content) : latestDoc.content
          if (isBoardContent(raw) && Object.keys(raw.snapshot).length > 0) {
            loadSnapshot(editor.store, raw.snapshot as TLStoreSnapshot)
          }
        } catch { /* keep empty board */ }
        snapshotLoadedRef.current = true
      }
    }

    // Subscribe to document changes for auto-save.
    // Use the ref so we don't need to re-subscribe when scheduleSave changes.
    const unsubSave = editor.store.listen(
      () => scheduleSaveRef.current(),
      { scope: 'document' },
    )

    // Subscribe to session changes for zoom display (debounced to avoid per-frame re-renders).
    let zoomTimer: ReturnType<typeof setTimeout> | null = null
    const unsubZoom = editor.store.listen(() => {
      if (zoomTimer) clearTimeout(zoomTimer)
      zoomTimer = setTimeout(() => {
        setZoomLevel(Math.round(editor.getZoomLevel() * 100))
      }, 60)
    }, { scope: 'session' })

    // Store cleanup so the useEffect above can call it on unmount
    listenersCleanupRef.current = () => {
      unsubSave()
      unsubZoom()
      if (zoomTimer) clearTimeout(zoomTimer)
    }
  // doc is intentionally excluded — handled via the separate useEffect above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!doc) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
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
        editor={editorRef.current}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        zoomLevel={zoomLevel}
      />

      {/* Canvas + AI panel row */}
      <div className="flex min-h-0 flex-1">
        <div className="prose-tldraw-root min-h-0 min-w-0 flex-1 overflow-hidden">
          <Tldraw
            onMount={onMount}
            shapeUtils={CUSTOM_SHAPE_UTILS}
            components={{
              Toolbar: null,
              MainMenu: null,
              StylePanel: null,
              NavigationPanel: null,
              SharePanel: null,
            }}
            options={{
              maxPages: 1,
            }}
          />
        </div>

        {/* AI panel — AiPanel already adds border-l border-border on its root */}
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
