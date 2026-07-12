import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  Copy, Clipboard, Trash2, EyeOff, Eye, Eraser,
  ArrowUpAZ, ArrowDownAZ, Filter, Image as ImageIcon, Link2,
} from 'lucide-react'
import { Workbook } from '@fortune-sheet/react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { Sheet, Hooks, Selection } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'

import { useDocument } from '@/hooks/useDocument'
import type { SheetContent, ChartDef, ChartType } from '@/types/sheet'
import { isSheetContent, createInitialSheetContent } from '@/types/sheet'
import { createSheetActionHandler } from './sheetAiActions'
import { SheetInsightsTab } from './SheetInsightsTab'
import type { CellRef } from '@/lib/ai/proseActions'
import { Lightbulb } from 'lucide-react'
import { FileEditorTitleBar } from '@/components/editor/FileEditorTitleBar'
import { SheetToolbar, type ToolbarState } from './SheetToolbar'
import { SheetTabBar } from './SheetTabBar'
import { sheetTabToFSSheet, fsDataToSheetContent, colToLetter, cellAddress, htToAlign } from './sheetUtils'
import { AUTO_SAVE_DEBOUNCE_MS, AI_PANEL_WIDTH } from '@/constants'
import { useAppStore } from '@/store/appStore'
import AiPanel from '@/components/editor/AiPanel'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'
import { useIsActiveTab } from '@/hooks/useIsActiveTab'
import SettingsModal from '@/components/settings/SettingsModal'
import { SheetExportModal } from './SheetExportModal'
import { ChartDialog } from './ChartDialog'
import { ChartOverlay } from './ChartOverlay'
import { dispatchUndoRedoKey } from '@/lib/simulateUndoRedo'
import { useContextMenuIcons } from '@/hooks/useContextMenuIcons'
import { runThumbnailGenerationOnce, clampRectToViewport } from '@/lib/thumbnailGeneration'

// ── Helpers ───────────────────────────────────────────────────────────────────

// FortuneSheet's native right-click menu has no per-item class/data-attribute
// to target — only the rendered (English) label text identifies each action.
// Unmapped labels (e.g. "Insert N rows/columns", which embed a live input and
// vary their text) are simply left without an icon.
const FORTUNE_CONTEXT_MENU_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Copy,
  Paste: Clipboard,
  'Delete selected Row': Trash2,
  'Delete selected Column': Trash2,
  'Hide selected Row': EyeOff,
  'Hide selected Column': EyeOff,
  'Show hidden Row': Eye,
  'Show hidden Column': Eye,
  'Clear content': Eraser,
  'Ascending sort': ArrowUpAZ,
  'Descending sort': ArrowDownAZ,
  Filter,
  'Insert image': ImageIcon,
  'Insert link': Link2,
}

function parseSheetContent(raw: unknown): SheetContent {
  if (isSheetContent(raw)) return raw
  return createInitialSheetContent()
}

const DEFAULT_TOOLBAR: ToolbarState = {
  bold: false, italic: false, underline: false,
  align: null, wrap: false, fontFamily: 'Calibri',
  fontSize: 11, textColor: '#000000', bgColor: '#ffffff',
  isMerged: false,
}

// ── AI context builder ────────────────────────────────────────────────────────

function buildSheetContext(sheet: Sheet, tabName: string, selectedRow: number, selectedCol: number): string {
  const data = sheet.data
  if (!data) return `Sheet tab: "${tabName}"\n(no data)`

  const rows = Math.min(data.length, 21)
  const firstRow = data[0]
  const cols = firstRow ? Math.min(firstRow.length, 26) : 26

  const headers: string[] = []
  for (let c = 0; c < cols; c++) {
    const cell = data[0]?.[c]
    const v = cell?.m ?? cell?.v
    headers.push(v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : colToLetter(c))
  }

  const sep = headers.map(() => '---').join(' | ')
  const headerRow = headers.join(' | ')
  const dataRows: string[] = []
  for (let r = 1; r < rows; r++) {
    const cells: string[] = []
    for (let c = 0; c < cols; c++) {
      const cell = data[r]?.[c]
      const v = cell?.m ?? cell?.v
      cells.push(v !== undefined && v !== null ? String(v) : '')
    }
    if (cells.every((c) => c === '')) continue
    dataRows.push(cells.join(' | '))
  }

  const formulaCells: string[] = []
  outer: for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (cell?.f) {
        formulaCells.push(`${cellAddress(r, c)}: ${cell.f} → ${cell.m ?? cell.v ?? ''}`)
        if (formulaCells.length >= 50) break outer
      }
    }
  }

  const parts = [
    `Sheet tab: "${tabName}"`,
    '',
    `Data (${dataRows.length} rows, ${cols} columns):`,
    `| ${headerRow} |`,
    `| ${sep} |`,
    ...dataRows.map((row) => `| ${row} |`),
  ]

  if (formulaCells.length > 0) {
    parts.push('', 'Formula cells:', ...formulaCells)
  }

  parts.push('', `Selected cell: ${cellAddress(selectedRow, selectedCol)}`)
  const sel = data[selectedRow]?.[selectedCol]
  if (sel) {
    const src = sel.f ?? sel.v
    if (src !== undefined && src !== null) {
      parts.push(`  Value: ${src}`)
      if (sel.f) parts.push(`  Computed: ${sel.m ?? sel.v ?? ''}`)
    }
  }

  return parts.join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TabInfo {
  id: string
  name: string
}

interface SheetsEditorProps {
  documentId: string
}

export function SheetsEditor({ documentId }: SheetsEditorProps): JSX.Element {
  useContextMenuIcons('.fortune-menuitem-row, .luckysheet-cols-menuitem-content', FORTUNE_CONTEXT_MENU_ICONS)
  const isActive = useIsActiveTab(documentId)
  const { document: doc, saveStatus, notifySaveStatus } = useDocument(documentId)
  const workbookRef = useRef<WorkbookInstance | null>(null)
  const workbookWrapperRef = useRef<HTMLDivElement>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [chartDialogOpen, setChartDialogOpen] = useState(false)
  const [editingChart, setEditingChart] = useState<ChartDef | undefined>(undefined)
  const [charts, setCharts] = useState<ChartDef[]>([])
  const chartsRef = useRef<ChartDef[]>([])
  // Charts are positioned in unscrolled grid-content coordinates, so the
  // overlay needs the live scroll offset to track the grid instead of
  // floating fixed over it. FortuneSheet's grid scrolling isn't exposed via
  // its public API — but it does drive two real (invisible) native scroll
  // elements internally, .luckysheet-scrollbar-x/-y, so we read scroll
  // position directly from those.
  const [gridScroll, setGridScroll] = useState({ x: 0, y: 0 })
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const theme = useAppStore((s) => s.theme)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)

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

  // Music
  const music = useMusicContext()
  const activeAmbient = AMBIENT_LAYERS.filter((l) => music?.ambientEnabled[l.id])
  const ambientPlaying =
    activeAmbient.length === 0 ? null
    : activeAmbient.length === 1 ? activeAmbient[0]!.label
    : activeAmbient.length === 2 ? `${activeAmbient[0]!.label} + ${activeAmbient[1]!.label}`
    : `${activeAmbient.length} Sounds`

  // Initial FortuneSheet data — computed once when doc loads, then stable
  const fsDataRef = useRef<Sheet[] | null>(null)
  const [ready, setReady] = useState(false)

  // Tab bar state (lightweight)
  const [tabs, setTabs] = useState<TabInfo[]>([])
  const [activeTabId, setActiveTabId] = useState('')
  const tabsRef = useRef<TabInfo[]>([])
  const activeTabIdRef = useRef('')

  // Zoom state (percentage, 10–400)
  const [zoom, setZoom] = useState(100)

  // Toolbar + formula bar state
  const [toolbarState, setToolbarState] = useState<ToolbarState>(DEFAULT_TOOLBAR)
  const [formulaAddress, setFormulaAddress] = useState('A1')
  const [formulaBarValue, setFormulaBarValue] = useState('')
  const selectedCellRef = useRef({ row: 0, col: 0 })

  // Auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDataRef = useRef<Sheet[] | null>(null)
  const zoomChangeRef = useRef(false)

  // Undo/redo enabled state — FortuneSheet keeps its undo stack entirely
  // internal (no public API to query it), so we mirror its depth ourselves:
  // genuine edits push, our own Undo/Redo button clicks pop/push between the
  // two stacks the same way FortuneSheet's internal handleUndo/handleRedo do.
  const undoDepthRef = useRef(0)
  const redoDepthRef = useRef(0)
  const pendingUndoRedoRef = useRef<'undo' | 'redo' | null>(null)
  const undoCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Safety net for `pendingUndoRedoRef`: if FortuneSheet's real internal stack
  // didn't actually have anything to undo/redo (our mirrored depth had
  // drifted), no onChange follows to clear the flag — left unhandled, it would
  // stay stuck and silently misclassify the NEXT genuine edit as this undo/redo.
  const pendingClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // FortuneSheet fires onChange once while it finishes initializing the sheet
  // it was just given — not a real user edit — which was being miscounted as
  // the first "undo-able" edit, leaving Undo enabled (but non-functional)
  // immediately after opening a sheet. Skip depth tracking for onChange calls
  // that land within this grace window after (re)loading a document.
  const loadedAtRef = useRef(0)
  const INIT_GRACE_MS = 600
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const flushAndSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const data = pendingDataRef.current
    if (!data) return
    const content = fsDataToSheetContent(data)
    content.charts = chartsRef.current
    notifySaveStatus('saving')
    try {
      await window.prose.documents.update(documentId, { content: JSON.stringify(content) })
      notifySaveStatus('saved')
    } catch (err) {
      console.error('[SheetsEditor] save error:', err)
      notifySaveStatus('error')
    }
  }, [documentId, notifySaveStatus])

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

  // Set zoom via applyOp which uses Immer's applyPatches directly — no frozen-object mutation
  const handleZoomChange = useCallback((newPct: number) => {
    const clamped = Math.min(400, Math.max(10, Math.round(newPct / 10) * 10))
    const wb = workbookRef.current
    if (!wb) return
    const sheets = wb.getAllSheets()
    const activeSheet = sheets.find(s => s.status === 1) ?? sheets[0]
    if (!activeSheet?.id) return
    const ratio = parseFloat((clamped / 100).toFixed(1))
    zoomChangeRef.current = true
    wb.applyOp([
      { op: 'replace', id: String(activeSheet.id), path: ['zoomRatio'], value: ratio },
      { op: 'replace', path: ['zoomRatio'], value: ratio },
    ])
    setZoom(clamped)
  }, [])

  useEffect(() => () => {
    if (saveTimerRef.current) void flushAndSave()
  }, [flushAndSave])

  // Thumbnail generation — fired by the main process after every successful
  // content auto-save. Crops to roughly the first 12 rows / 8 columns instead
  // of the full grid container, using the same column/row sizes configured on
  // the <Workbook> below (defaultColWidth/defaultRowHeight) plus FortuneSheet's
  // standard row/column header sizes, then hands the region off to the main
  // process for the actual 560x315 resize.
  useEffect(() => {
    return window.prose.thumbnails.onGenerate((fileId) => {
      if (fileId !== documentId) return
      void runThumbnailGenerationOnce(fileId, async () => {
        if (!ready) return
        const wrapper = workbookWrapperRef.current
        if (!wrapper) return
        const gridRect = wrapper.getBoundingClientRect()
        if (gridRect.width <= 0 || gridRect.height <= 0) return

        const ROW_HEADER_WIDTH = 46
        const COL_HEADER_HEIGHT = 20
        const COL_WIDTH = 100
        const ROW_HEIGHT = 20
        const cropWidth = Math.min(gridRect.width, ROW_HEADER_WIDTH + 8 * COL_WIDTH)
        const cropHeight = Math.min(gridRect.height, COL_HEADER_HEIGHT + 12 * ROW_HEIGHT)

        const rect = clampRectToViewport({ x: gridRect.left, y: gridRect.top, width: cropWidth, height: cropHeight })
        if (!rect) return
        const base64 = await window.prose.thumbnails.captureRegion(rect)
        await window.prose.thumbnails.save(fileId, base64)
      })
    })
  }, [documentId, ready])

  // Track the grid's scroll offset so the chart overlay can follow it — see
  // the comment on gridScroll's declaration for why we read these elements
  // directly instead of going through FortuneSheet's API.
  useEffect(() => {
    if (!ready) return
    const wrapper = workbookWrapperRef.current
    if (!wrapper) return

    const scrollerX = wrapper.querySelector('.luckysheet-scrollbar-x')
    const scrollerY = wrapper.querySelector('.luckysheet-scrollbar-y')
    if (!scrollerX || !scrollerY) return

    const onScrollX = (): void => setGridScroll((s) => ({ ...s, x: scrollerX.scrollLeft }))
    const onScrollY = (): void => setGridScroll((s) => ({ ...s, y: scrollerY.scrollTop }))
    scrollerX.addEventListener('scroll', onScrollX)
    scrollerY.addEventListener('scroll', onScrollY)
    return () => {
      scrollerX.removeEventListener('scroll', onScrollX)
      scrollerY.removeEventListener('scroll', onScrollY)
    }
  }, [ready])

  // Ctrl+S manual save + Ctrl+0 reset zoom
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        void flushAndSave()
      }
      if (e.ctrlKey && e.key === '0') {
        e.preventDefault()
        handleZoomChange(100)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isActive, flushAndSave, handleZoomChange])

  // Load doc and compute initial FS data
  useEffect(() => {
    if (!doc) return
    let content: SheetContent
    try {
      const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
      content = parseSheetContent(raw)
    } catch {
      content = createInitialSheetContent()
    }

    fsDataRef.current = content.tabs.map((tab, i) =>
      sheetTabToFSSheet(tab, tab.id === content.activeTabId, i)
    )
    // Seed the autosave baseline immediately — pendingDataRef otherwise stays
    // null until FortuneSheet's onChange fires, so a chart inserted before any
    // cell edit would never trigger a save (flushAndSave bails on null data).
    // fsDataToSheetContent already handles the celldata-only shape this carries.
    pendingDataRef.current = fsDataRef.current

    const initialTabs = content.tabs.map((t) => ({ id: t.id, name: t.name }))
    tabsRef.current = initialTabs
    setTabs(initialTabs)
    activeTabIdRef.current = content.activeTabId
    setActiveTabId(content.activeTabId)

    const loadedCharts = content.charts ?? []
    chartsRef.current = loadedCharts
    setCharts(loadedCharts)

    // Fresh Workbook instance (key={documentId} below) means FortuneSheet's own
    // undo/redo stack also starts empty — reset our mirrored depth tracking too.
    undoDepthRef.current = 0
    redoDepthRef.current = 0
    pendingUndoRedoRef.current = null
    if (undoCountTimerRef.current) { clearTimeout(undoCountTimerRef.current); undoCountTimerRef.current = null }
    if (pendingClearTimerRef.current) { clearTimeout(pendingClearTimerRef.current); pendingClearTimerRef.current = null }
    loadedAtRef.current = Date.now()
    setCanUndo(false)
    setCanRedo(false)

    setReady(true)
  // Only re-initialize when the document ID changes (opening a different file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // FortuneSheet only re-measures its grid on a window resize event — it
  // doesn't observe its own container resizing — so it needs a nudge: once at
  // mount (container settling into its initial layout) and again whenever the
  // AI panel's width actually changes (drag-resize or open/close), once that
  // change has visually settled (150ms covers both a debounced drag and the
  // panel's own 0.12s open/close animation).
  useEffect(() => {
    if (!ready) return
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))
    return () => cancelAnimationFrame(id)
  }, [ready])

  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => window.dispatchEvent(new Event('resize')), 150)
    return () => clearTimeout(id)
  }, [ready, aiPanelWidth, aiPanelOpen])

  // Context menu AI events
  useEffect(() => {
    if (!isActive) return
    const onExplain = (e: Event): void => {
      const { formula } = (e as CustomEvent<{ formula: string }>).detail
      setAiPanelOpen(true)
      setPendingAiPrompt(`Explain this formula: ${formula}`)
    }
    const onGenerate = (): void => {
      setAiPanelOpen(true)
      setPendingAiPrompt('Generate a formula for this column. Describe what you want to calculate:')
    }
    window.addEventListener('prose-sheet-explain-formula', onExplain)
    window.addEventListener('prose-sheet-generate-formula', onGenerate)
    return () => {
      window.removeEventListener('prose-sheet-explain-formula', onExplain)
      window.removeEventListener('prose-sheet-generate-formula', onGenerate)
    }
  }, [isActive, setAiPanelOpen, setPendingAiPrompt])

  // AI context getter
  const getSheetContext = useCallback((): string => {
    const wb = workbookRef.current
    if (!wb) return ''
    try {
      const sheets = wb.getAllSheets()
      const active = sheets.find((s) => s.status === 1) ?? sheets[0]
      if (!active) return ''
      const tabName = tabsRef.current.find((t) => t.id === String(active.id))?.name ?? active.name
      const { row, col } = selectedCellRef.current
      return buildSheetContext(active, tabName, row, col)
    } catch {
      return ''
    }
  }, [])

  const onInsertFormula = useCallback((formula: string) => {
    const wb = workbookRef.current; if (!wb) return
    const { row, col } = selectedCellRef.current
    wb.setCellValue(row, col, formula)
  }, [])

  // Writes an AI-generated table (parsed from a markdown response) starting
  // at the selected cell — the first row is treated as a header row.
  const onInsertTableData = useCallback((rows: string[][]) => {
    const wb = workbookRef.current; if (!wb) return
    const { row: startRow, col: startCol } = selectedCellRef.current
    rows.forEach((rowValues, r) => {
      rowValues.forEach((value, c) => {
        wb.setCellValue(startRow + r, startCol + c, value)
      })
    })
  }, [])

  // commitFormulaBar — writes formula bar value back to selected cell
  const commitFormulaBar = useCallback(() => {
    const wb = workbookRef.current; if (!wb) return
    const { row, col } = selectedCellRef.current
    wb.setCellValue(row, col, formulaBarValue)
  }, [formulaBarValue])

  // Tab operations
  const switchTab = useCallback((tabId: string) => {
    const wb = workbookRef.current; if (!wb) return
    wb.activateSheet({ id: tabId })
    // FortuneSheet's onChange doesn't reliably fire on a pure activation (no data
    // mutation), so update the tab bar's active state immediately rather than
    // waiting for handleChange to notice the new status:1 sheet.
    activeTabIdRef.current = tabId
    setActiveTabId(tabId)
  }, [])

  // Marks the next onChange as consuming this undo/redo (see handleChange)
  // rather than being a genuine edit. Armed with a short safety timeout: if
  // our mirrored depth was wrong and FortuneSheet's real stack had nothing to
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

  // FortuneSheet has no public undo()/redo() API — it only responds to a real
  // keydown on its hidden cell-editor element, so locate that within this
  // sheet's own wrapper and dispatch there.
  const handleUndo = useCallback(() => {
    if (undoDepthRef.current === 0) return
    armPendingUndoRedo('undo')
    const target = workbookWrapperRef.current?.querySelector('.luckysheet-cell-input')
    dispatchUndoRedoKey(target, 'undo')
  }, [armPendingUndoRedo])

  const handleRedo = useCallback(() => {
    if (redoDepthRef.current === 0) return
    armPendingUndoRedo('redo')
    const target = workbookWrapperRef.current?.querySelector('.luckysheet-cell-input')
    dispatchUndoRedoKey(target, 'redo')
  }, [armPendingUndoRedo])

  // A native Ctrl+Z/Ctrl+Y keypress goes straight to FortuneSheet's own
  // keydown handler on its hidden cell-input, bypassing handleUndo/handleRedo
  // (and armPendingUndoRedo) entirely — so it used to always fall into
  // handleChange's "genuine edit" branch, corrupting the mirrored depth
  // counters relative to FortuneSheet's real stack. Intercept in the CAPTURE
  // phase (fires before FortuneSheet's bubble-phase handler) so native hotkeys
  // go through the exact same bookkeeping as the toolbar buttons.
  useEffect(() => {
    if (!ready || !isActive) return
    const wrapper = workbookWrapperRef.current
    if (!wrapper) return
    function onKeyCapture(e: KeyboardEvent): void {
      if (!e.ctrlKey || (e.code !== 'KeyZ' && e.code !== 'KeyY')) return
      const isRedo = e.code === 'KeyY' || e.shiftKey
      const depthRef = isRedo ? redoDepthRef : undoDepthRef
      if (depthRef.current === 0) return
      armPendingUndoRedo(isRedo ? 'redo' : 'undo')
    }
    wrapper.addEventListener('keydown', onKeyCapture, true)
    return () => wrapper.removeEventListener('keydown', onKeyCapture, true)
  }, [ready, isActive, armPendingUndoRedo])

  const addTab = useCallback(() => {
    const wb = workbookRef.current; if (!wb) return
    wb.addSheet()
    // addSheet() activates the new sheet internally (changeSheet sets
    // ctx.currentSheetId synchronously) but doesn't reliably trigger onChange —
    // same gap as switchTab, so read the now-active sheet back directly.
    const sheets = wb.getAllSheets()
    const active = sheets.find(s => s.status === 1) ?? sheets[sheets.length - 1]
    const newId = active?.id !== undefined ? String(active.id) : ''
    if (newId) {
      activeTabIdRef.current = newId
      setActiveTabId(newId)
    }
  }, [])

  const renameTab = useCallback((tabId: string, name: string) => {
    const wb = workbookRef.current; if (!wb) return
    wb.setSheetName(name, { id: tabId })
  }, [])

  const deleteTab = useCallback((tabId: string) => {
    if (tabsRef.current.length <= 1) return
    const wb = workbookRef.current; if (!wb) return
    wb.deleteSheet({ id: tabId })
  }, [])

  // ── Chart management ──────────────────────────────────────────────────────

  const updateChartsAndSave = useCallback((updated: ChartDef[]) => {
    chartsRef.current = updated
    setCharts(updated)
    scheduleSave()
  }, [scheduleSave])

  const handleInsertChart = useCallback((partial: Omit<ChartDef, 'id' | 'x' | 'y' | 'width' | 'height'>) => {
    const offset = chartsRef.current.filter(c => c.sheetId === partial.sheetId).length * 20
    const newChart: ChartDef = {
      ...partial,
      id: `chart-${Date.now()}`,
      x: 20 + offset,
      y: 20 + offset,
      width: 520,
      height: 340,
    }
    updateChartsAndSave([...chartsRef.current, newChart])
  }, [updateChartsAndSave])

  const handleUpdateChart = useCallback((updated: ChartDef) => {
    updateChartsAndSave(chartsRef.current.map(c => c.id === updated.id ? updated : c))
  }, [updateChartsAndSave])

  const handleDeleteChart = useCallback((id: string) => {
    updateChartsAndSave(chartsRef.current.filter(c => c.id !== id))
  }, [updateChartsAndSave])

  const handleEditChart = useCallback((chart: ChartDef) => {
    setEditingChart(chart)
    setChartDialogOpen(true)
  }, [])

  const handleOpenInsertChart = useCallback(() => {
    setEditingChart(undefined)
    setChartDialogOpen(true)
  }, [])

  // Get the initial range from current selection for the chart dialog
  const getInitialChartRange = useCallback((): string => {
    try {
      const coords = workbookRef.current?.getSelectionCoordinates()
      return coords?.[0] ?? ''
    } catch {
      return ''
    }
  }, [])

  // ── End chart management ──────────────────────────────────────────────────

  // ── AI actions + insights ──────────────────────────────────────────────────

  const aiActionHandler = useMemo(() => createSheetActionHandler({
    workbookRef,
    getActiveSheetId: () => activeTabIdRef.current,
    insertChart: handleInsertChart,
    onMutated: scheduleSave,
  }), [handleInsertChart, scheduleSave])

  const insightsInsertFormula = useCallback((cell: CellRef, formula: string) => {
    const wb = workbookRef.current; if (!wb) return
    wb.setCellValue(cell.row, cell.col, formula)
    scheduleSave()
  }, [scheduleSave])

  const insightsInsertChart = useCallback((chart: { type: ChartType; dataRange: string; title: string }) => {
    handleInsertChart({
      sheetId: activeTabIdRef.current,
      type: chart.type,
      dataRange: chart.dataRange,
      title: chart.title,
    })
  }, [handleInsertChart])

  // ── End AI actions + insights ──────────────────────────────────────────────

  // onChange: sync tab bar, zoom, and schedule save
  const handleChange = useCallback((data: Sheet[]) => {
    pendingDataRef.current = data

    const newTabs = data.map((s) => ({ id: String(s.id ?? ''), name: s.name }))
    const prevTabs = tabsRef.current
    const tabsChanged = newTabs.length !== prevTabs.length ||
      newTabs.some((t, i) => t.id !== prevTabs[i]?.id || t.name !== prevTabs[i]?.name)
    if (tabsChanged) {
      tabsRef.current = newTabs
      setTabs(newTabs)
    }

    const active = data.find((s) => s.status === 1) ?? data[0]
    const newActiveId = String(active?.id ?? '')
    if (newActiveId !== activeTabIdRef.current) {
      activeTabIdRef.current = newActiveId
      setActiveTabId(newActiveId)
    }

    // Sync zoom from active sheet
    const newZoom = Math.round((active?.zoomRatio ?? 1) * 100)
    setZoom(newZoom)

    if (zoomChangeRef.current) {
      zoomChangeRef.current = false
      return
    }

    scheduleSave()

    // Undo/redo depth tracking — see comment near the refs' declaration.
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
    } else if (Date.now() - loadedAtRef.current < INIT_GRACE_MS) {
      // FortuneSheet settling in after (re)loading a document — not a real edit.
    } else {
      // A genuine edit. Debounce briefly so a continuous drag (range fill,
      // multi-cell paste) collapses into one counted undo step instead of one
      // per onChange firing, without delaying the button's enabled state by
      // the (much longer) save debounce.
      if (undoCountTimerRef.current) clearTimeout(undoCountTimerRef.current)
      undoCountTimerRef.current = setTimeout(() => {
        undoDepthRef.current += 1
        redoDepthRef.current = 0
        setCanUndo(true)
        setCanRedo(false)
      }, 300)
    }
  }, [scheduleSave])

  // Stable hooks object — closures use refs so hooks object never changes
  const fortuneHooks = useMemo<Hooks>(() => ({
    afterSelectionChange: (_sheetId: string, selection: Selection) => {
      const wb = workbookRef.current; if (!wb) return
      const r = selection.row_focus ?? selection.row[0] ?? 0
      const c = selection.column_focus ?? selection.column[0] ?? 0
      selectedCellRef.current = { row: r, col: c }

      // Formula bar
      try {
        const rawFormula = wb.getCellValue(r, c, { type: 'f' }) as string | undefined
        const formula = rawFormula ? rawFormula.replace(/<[^>]*>/g, '') : undefined
        const value = wb.getCellValue(r, c, { type: 'v' })
        setFormulaAddress(cellAddress(r, c))
        setFormulaBarValue(formula ?? (value != null ? String(value) : ''))
      } catch { /* ignore if workbook not ready */ }

      // Toolbar state — read from live sheet data
      try {
        const sheets = wb.getAllSheets()
        const active = sheets.find((s) => s.status === 1) ?? sheets[0]
        const cell = active?.data?.[r]?.[c] ?? null

        setToolbarState({
          bold: cell?.bl === 1,
          italic: cell?.it === 1,
          underline: cell?.un === 1,
          fontFamily: typeof cell?.ff === 'string' ? cell.ff : 'Calibri',
          fontSize: typeof cell?.fs === 'number' ? cell.fs : 11,
          textColor: cell?.fc ?? '#000000',
          bgColor: cell?.bg ?? '#ffffff',
          align: htToAlign(cell?.ht),
          wrap: cell?.tb === '2',
          isMerged: !!cell?.mc && cell.mc.rs !== undefined,
        })
      } catch { /* ignore */ }
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  if (!ready || !fsDataRef.current) {
    return (
      <TooltipProvider delayDuration={400}>
        <div className="flex h-screen flex-col bg-background">
          <FileEditorTitleBar />
        </div>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
        <SheetToolbar
          workbookRef={workbookRef}
          state={toolbarState}
          cellAddress={formulaAddress}
          formulaBarValue={formulaBarValue}
          onFormulaBarChange={setFormulaBarValue}
          onFormulaBarCommit={commitFormulaBar}
          onFormatChange={scheduleSave}
          documentId={documentId}
          onSettingsOpen={() => setSettingsOpen(true)}
          onSheetExport={() => setExportOpen(true)}
          onInsertChart={handleOpenInsertChart}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
        />

        {/* Grid + AI panel row. The grid shrinks to fill whatever space the
            AI panel leaves — FortuneSheet doesn't observe its own container
            resizing, so a window-resize event is dispatched below on every
            width change (drag, open/close) to force it to re-measure. */}
        <div className="flex min-h-0 flex-1">
          {/* FortuneSheet container */}
          <div
            ref={workbookWrapperRef}
            className={cn(
              'relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
              theme === 'dark' && 'fortune-dark'
            )}
          >
            <ChartOverlay
              charts={charts}
              activeSheetId={activeTabId}
              workbookRef={workbookRef}
              onUpdateChart={handleUpdateChart}
              onDeleteChart={handleDeleteChart}
              onEditChart={handleEditChart}
              scrollX={gridScroll.x}
              scrollY={gridScroll.y}
            />
            <Workbook
              key={documentId}
              ref={workbookRef}
              data={fsDataRef.current}
              onChange={handleChange}
              showToolbar={false}
              showFormulaBar={false}
              showSheetTabs={false}
              lang="en"
              hooks={fortuneHooks}
              defaultColWidth={100}
              defaultRowHeight={20}
            />
          </div>

          {/* AI panel — resizable, same width-animated open/close as Slides'
              right panel (SlidesEditor.tsx). Stays mounted at all times so
              chat/analysis state survives closing and reopening the panel. */}
          <motion.div
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
              className="absolute inset-0 overflow-y-auto"
              initial={false}
              animate={{ opacity: aiPanelOpen ? 1 : 0, x: aiPanelOpen ? 0 : 16 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
            >
              <AiPanel
                editor={null}
                fileType="sheet"
                getDocumentContent={getSheetContext}
                onInsertFormula={onInsertFormula}
                onInsertTableData={onInsertTableData}
                actionHandler={aiActionHandler}
                extraTab={{
                  label: 'Insights',
                  icon: Lightbulb,
                  content: (
                    <SheetInsightsTab
                      getSheetContext={getSheetContext}
                      onInsertFormula={insightsInsertFormula}
                      onInsertChart={insightsInsertChart}
                    />
                  ),
                }}
              />
            </motion.div>
          </motion.div>
        </div>

        <SheetTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onTabChange={switchTab}
          onAddTab={addTab}
          onRenameTab={renameTab}
          onDeleteTab={deleteTab}
          zoom={zoom}
          onZoomChange={handleZoomChange}
          saveStatus={saveStatus}
          nowPlaying={music?.nowPlayingTitle ?? null}
          ambientPlaying={ambientPlaying}
        />
      </div>

      {settingsOpen && (
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}
      {exportOpen && (
        <SheetExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          sheetTitle={doc?.title ?? 'Sheet'}
          workbookRef={workbookRef}
        />
      )}
      {chartDialogOpen && (
        <ChartDialog
          open={chartDialogOpen}
          onClose={() => { setChartDialogOpen(false); setEditingChart(undefined) }}
          workbookRef={workbookRef}
          activeSheetId={activeTabId}
          initialRange={editingChart ? editingChart.dataRange : getInitialChartRange()}
          editChart={editingChart}
          onInsert={handleInsertChart}
          onUpdate={handleUpdateChart}
        />
      )}
    </TooltipProvider>
  )
}
