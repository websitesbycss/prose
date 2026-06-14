import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Workbook } from '@fortune-sheet/react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { Sheet, Hooks, Selection } from '@fortune-sheet/core'
import '@fortune-sheet/react/dist/index.css'

import { useDocument } from '@/hooks/useDocument'
import type { SheetContent, ChartDef } from '@/types/sheet'
import { isSheetContent, createInitialSheetContent } from '@/types/sheet'
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function SheetsEditor({ documentId }: SheetsEditorProps) {
  const isActive = useIsActiveTab(documentId)
  const { document: doc, saveStatus, notifySaveStatus } = useDocument(documentId)
  const workbookRef = useRef<WorkbookInstance | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [chartDialogOpen, setChartDialogOpen] = useState(false)
  const [editingChart, setEditingChart] = useState<ChartDef | undefined>(undefined)
  const [charts, setCharts] = useState<ChartDef[]>([])
  const chartsRef = useRef<ChartDef[]>([])
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const theme = useAppStore((s) => s.theme)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)

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

  const flushAndSave = useCallback(async () => {
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
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // Ctrl+S manual save + Ctrl+0 reset zoom
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
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

    const initialTabs = content.tabs.map((t) => ({ id: t.id, name: t.name }))
    tabsRef.current = initialTabs
    setTabs(initialTabs)
    activeTabIdRef.current = content.activeTabId
    setActiveTabId(content.activeTabId)

    const loadedCharts = content.charts ?? []
    chartsRef.current = loadedCharts
    setCharts(loadedCharts)

    setReady(true)
  // Only re-initialize when the document ID changes (opening a different file)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // Context menu AI events
  useEffect(() => {
    if (!isActive) return
    const onExplain = (e: Event) => {
      const { formula } = (e as CustomEvent<{ formula: string }>).detail
      setAiPanelOpen(true)
      setPendingAiPrompt(`Explain this formula: ${formula}`)
    }
    const onGenerate = () => {
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
  }, [])

  const addTab = useCallback(() => {
    const wb = workbookRef.current; if (!wb) return
    wb.addSheet()
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
        />

        {/* Grid + AI panel row */}
        <div className="flex min-h-0 flex-1">
          {/* FortuneSheet container */}
          <div
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

          {/* AI panel */}
          {aiPanelOpen && (
            <div className="shrink-0 overflow-y-auto" style={{ width: AI_PANEL_WIDTH }}>
              <AiPanel
                editor={null}
                fileType="sheet"
                getDocumentContent={getSheetContext}
                onInsertFormula={onInsertFormula}
              />
            </div>
          )}
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
