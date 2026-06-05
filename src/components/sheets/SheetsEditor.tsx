import { useRef, useState, useCallback, useEffect } from 'react'
import { HotTable, HotTableClass } from '@handsontable/react'
import Handsontable from 'handsontable'
import HyperFormula from 'hyperformula'
import 'handsontable/styles/handsontable.css'
import 'handsontable/styles/ht-theme-main.css'

import { useDocument } from '@/hooks/useDocument'
import type { SheetContent, SheetTab, SheetCellFormat } from '@/types/sheet'
import { isSheetContent, createInitialSheetContent } from '@/types/sheet'
import { FileEditorTitleBar } from '@/components/editor/FileEditorTitleBar'
import { SheetToolbar, type ToolbarState } from './SheetToolbar'
import { SheetTabBar } from './SheetTabBar'
import { cellsToData, serializeTab, cellAddress, colToLetter, getFormatAtCell, restoreTabFormats } from './sheetUtils'
import { AUTO_SAVE_DEBOUNCE_MS, AI_PANEL_WIDTH } from '@/constants'
import { useAppStore } from '@/store/appStore'
import AiPanel from '@/components/editor/AiPanel'

// ── Custom cell renderer (applies proseFormat metadata to cell style) ─────────

Handsontable.renderers.registerRenderer(
  'proseRenderer',
  function (hot, td, row, col, prop, value, cellProperties) {
    Handsontable.renderers.TextRenderer.call(this, hot, td, row, col, prop, value, cellProperties)
    const fmt = (cellProperties as { proseFormat?: SheetCellFormat }).proseFormat
    if (!fmt) return
    if (fmt.bold) td.style.fontWeight = 'bold'
    if (fmt.italic) td.style.fontStyle = 'italic'
    if (fmt.underline) td.style.textDecoration = 'underline'
    if (fmt.fontFamily && fmt.fontFamily !== 'Default') td.style.fontFamily = fmt.fontFamily
    if (fmt.fontSize) td.style.fontSize = `${fmt.fontSize}pt`
    if (fmt.textColor) td.style.color = fmt.textColor
    if (fmt.bgColor) td.style.backgroundColor = fmt.bgColor
    if (fmt.align) td.style.textAlign = fmt.align
    if (fmt.wrap) { td.style.whiteSpace = 'pre-wrap'; td.style.overflow = 'visible' }
  }
)

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_TOOLBAR: ToolbarState = {
  bold: false, italic: false, underline: false,
  align: null, wrap: false, fontFamily: 'Default',
  fontSize: 11, textColor: '#000000', bgColor: '#ffffff',
  isMerged: false,
}

// ── Sheet context builder (sends as documentContent to AI) ────────────────────

function buildSheetContext(hot: Handsontable, activeTab: SheetTab): string {
  const rows = Math.min(hot.countRows(), 21) // header + 20 data rows
  const cols = Math.min(hot.countCols(), 26)

  // Column headers from row 0
  const headers: string[] = []
  for (let c = 0; c < cols; c++) {
    const v = hot.getDataAtCell(0, c)
    headers.push(v !== null && v !== undefined && String(v).trim() !== '' ? String(v) : colToLetter(c))
  }

  // Markdown table
  const sep = headers.map(() => '---').join(' | ')
  const headerRow = headers.join(' | ')
  const dataRows: string[] = []
  for (let r = 1; r < rows; r++) {
    const cells: string[] = []
    for (let c = 0; c < cols; c++) {
      const v = hot.getDataAtCell(r, c)
      cells.push(v !== null && v !== undefined ? String(v) : '')
    }
    if (cells.every((c) => c === '')) continue
    dataRows.push(cells.join(' | '))
  }

  // Formula cells for error checking
  const formulaCells: string[] = []
  for (let r = 0; r < hot.countRows() && formulaCells.length < 50; r++) {
    for (let c = 0; c < hot.countCols() && formulaCells.length < 50; c++) {
      const src = hot.getSourceDataAtCell(r, c)
      if (typeof src === 'string' && src.startsWith('=')) {
        const computed = hot.getDataAtCell(r, c)
        formulaCells.push(`${cellAddress(r, c)}: ${src} → ${computed}`)
      }
    }
  }

  const parts: string[] = [
    `Sheet tab: "${activeTab.name}"`,
    '',
    `Data (${dataRows.length} rows, ${cols} columns):`,
    `| ${headerRow} |`,
    `| ${sep} |`,
    ...dataRows.map((row) => `| ${row} |`),
  ]

  if (formulaCells.length > 0) {
    parts.push('', 'Formula cells:', ...formulaCells)
  }

  // Selected cell info
  const sel = hot.getSelectedRangeLast()
  if (sel) {
    const addr = cellAddress(sel.from.row, sel.from.col)
    const src = hot.getSourceDataAtCell(sel.from.row, sel.from.col)
    const computed = hot.getDataAtCell(sel.from.row, sel.from.col)
    parts.push('', `Selected cell: ${addr}`)
    if (src !== null && src !== undefined) {
      parts.push(`  Value: ${src}`)
      if (String(src).startsWith('=')) {
        parts.push(`  Computed: ${computed}`)
      }
    }
  }

  return parts.join('\n')
}

// ── Component ─────────────────────────────────────────────────────────────────

interface SheetsEditorProps {
  documentId: string
}

export function SheetsEditor({ documentId }: SheetsEditorProps) {
  const { document: doc } = useDocument(documentId)
  const hotRef = useRef<HotTableClass>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)

  // Parse sheet content ───────────────────────────────────────────────────────
  const [sheetContent, setSheetContent] = useState<SheetContent>(() => createInitialSheetContent())
  const [activeTabId, setActiveTabId] = useState<string>(() => createInitialSheetContent().activeTabId)
  const sheetContentRef = useRef(sheetContent)
  const activeTabIdRef = useRef(activeTabId)

  // Once the doc loads, sync sheet content from it
  useEffect(() => {
    if (!doc) return
    try {
      const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
      if (isSheetContent(raw)) {
        setSheetContent(raw)
        sheetContentRef.current = raw
        setActiveTabId(raw.activeTabId)
        activeTabIdRef.current = raw.activeTabId
      }
    } catch { /* keep defaults */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id])

  // Toolbar + formula bar state ───────────────────────────────────────────────
  const [toolbarState, setToolbarState] = useState<ToolbarState>(DEFAULT_TOOLBAR)
  const [formulaAddress, setFormulaAddress] = useState('A1')
  const [formulaBarValue, setFormulaBarValue] = useState('')
  const selectedCellRef = useRef({ row: 0, col: 0 })

  // Auto-save ─────────────────────────────────────────────────────────────────
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushAndSave = useCallback(async () => {
    const h = hotRef.current?.hotInstance
    if (!h) return
    const sc = sheetContentRef.current
    const tabIdx = sc.tabs.findIndex((t) => t.id === activeTabIdRef.current)
    if (tabIdx < 0) return
    const updatedTab = serializeTab(h, sc.tabs[tabIdx]!)
    const tabs = [...sc.tabs]
    tabs[tabIdx] = updatedTab
    const updated: SheetContent = { ...sc, tabs, activeTabId: activeTabIdRef.current }
    setSheetContent(updated)
    sheetContentRef.current = updated
    try {
      await window.prose.documents.update(documentId, { content: JSON.stringify(updated) })
    } catch (err) {
      console.error('[SheetsEditor] save error:', err)
    }
  }, [documentId])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => void flushAndSave(), AUTO_SAVE_DEBOUNCE_MS)
  }, [flushAndSave])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  // Container height for Handsontable ────────────────────────────────────────
  const [hotHeight, setHotHeight] = useState(500)
  useEffect(() => {
    const update = () => {
      if (containerRef.current) setHotHeight(containerRef.current.clientHeight)
    }
    update()
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Context menu DOM events ───────────────────────────────────────────────────
  useEffect(() => {
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
  }, [setAiPanelOpen, setPendingAiPrompt])

  // Sheet AI context ──────────────────────────────────────────────────────────
  const activeTab = sheetContent.tabs.find((t) => t.id === activeTabId) ?? sheetContent.tabs[0]!
  const activeTabRef = useRef(activeTab)
  activeTabRef.current = activeTab

  const getSheetContext = useCallback((): string => {
    const h = hotRef.current?.hotInstance
    if (!h) return ''
    return buildSheetContext(h, activeTabRef.current)
  }, [])

  const onInsertFormula = useCallback((formula: string) => {
    const h = hotRef.current?.hotInstance
    if (!h) return
    const { row, col } = selectedCellRef.current
    h.setDataAtCell(row, col, formula)
  }, [])

  // Tab operations ────────────────────────────────────────────────────────────
  const serializeCurrentTab = useCallback((): SheetContent => {
    const h = hotRef.current?.hotInstance
    const sc = sheetContentRef.current
    if (!h) return sc
    const tabIdx = sc.tabs.findIndex((t) => t.id === activeTabIdRef.current)
    if (tabIdx < 0) return sc
    const tabs = [...sc.tabs]
    tabs[tabIdx] = serializeTab(h, sc.tabs[tabIdx]!)
    return { ...sc, tabs }
  }, [])

  const switchTab = useCallback((tabId: string) => {
    if (tabId === activeTabIdRef.current) return
    const saved = serializeCurrentTab()
    const nextTab = saved.tabs.find((t) => t.id === tabId)
    if (!nextTab) return
    const updated = { ...saved, activeTabId: tabId }
    setSheetContent(updated)
    sheetContentRef.current = updated
    activeTabIdRef.current = tabId
    setActiveTabId(tabId)

    const h = hotRef.current?.hotInstance
    if (h) {
      h.loadData(cellsToData(nextTab))
      restoreTabFormats(h, nextTab)
      h.render()
    }
    scheduleSave()
  }, [serializeCurrentTab, scheduleSave])

  const addTab = useCallback(() => {
    const saved = serializeCurrentTab()
    const n = saved.tabs.length + 1
    const newTab: SheetTab = {
      id: crypto.randomUUID(),
      name: `Sheet ${n}`,
      cells: {},
      rowCount: 100,
      colCount: 26,
      colWidths: [],
      rowHeights: [],
      mergedCells: [],
    }
    const tabs = [...saved.tabs, newTab]
    const updated = { ...saved, tabs, activeTabId: newTab.id }
    setSheetContent(updated)
    sheetContentRef.current = updated
    activeTabIdRef.current = newTab.id
    setActiveTabId(newTab.id)

    const h = hotRef.current?.hotInstance
    if (h) {
      h.loadData(cellsToData(newTab))
      h.render()
    }
    scheduleSave()
  }, [serializeCurrentTab, scheduleSave])

  const renameTab = useCallback((tabId: string, name: string) => {
    const sc = sheetContentRef.current
    const tabs = sc.tabs.map((t) => (t.id === tabId ? { ...t, name } : t))
    const updated = { ...sc, tabs }
    setSheetContent(updated)
    sheetContentRef.current = updated
    scheduleSave()
  }, [scheduleSave])

  const deleteTab = useCallback((tabId: string) => {
    const sc = sheetContentRef.current
    if (sc.tabs.length <= 1) return
    const tabs = sc.tabs.filter((t) => t.id !== tabId)
    const newActiveId = tabId === activeTabIdRef.current ? tabs[0]!.id : activeTabIdRef.current
    const updated = { ...sc, tabs, activeTabId: newActiveId }
    setSheetContent(updated)
    sheetContentRef.current = updated
    if (newActiveId !== activeTabIdRef.current) {
      activeTabIdRef.current = newActiveId
      setActiveTabId(newActiveId)
      const nextTab = tabs.find((t) => t.id === newActiveId)!
      const h = hotRef.current?.hotInstance
      if (h) {
        h.loadData(cellsToData(nextTab))
        restoreTabFormats(h, nextTab)
        h.render()
      }
    }
    scheduleSave()
  }, [scheduleSave])

  // Selection handler — syncs toolbar + formula bar ───────────────────────────
  const onSelectionEnd = useCallback((row: number, col: number) => {
    const h = hotRef.current?.hotInstance
    if (!h || row < 0 || col < 0) return
    selectedCellRef.current = { row, col }
    const fmt = getFormatAtCell(h, row, col)
    const src = h.getSourceDataAtCell(row, col)
    setFormulaAddress(cellAddress(row, col))
    setFormulaBarValue(src !== null && src !== undefined ? String(src) : '')

    const sel = h.getSelectedRangeLast()
    let isMerged = false
    if (sel) {
      const plugin = h.getPlugin('mergeCells') as unknown as {
        mergedCellsCollection?: {
          mergedCells: Array<{ row: number; col: number; rowspan: number; colspan: number }>
        }
      }
      isMerged =
        plugin.mergedCellsCollection?.mergedCells.some(
          (mc) =>
            mc.row === sel.from.row &&
            mc.col === sel.from.col &&
            mc.row + mc.rowspan - 1 === sel.to.row &&
            mc.col + mc.colspan - 1 === sel.to.col
        ) ?? false
    }

    setToolbarState({
      bold: fmt.bold ?? false,
      italic: fmt.italic ?? false,
      underline: fmt.underline ?? false,
      align: fmt.align ?? null,
      wrap: fmt.wrap ?? false,
      fontFamily: fmt.fontFamily ?? 'Default',
      fontSize: fmt.fontSize ?? 11,
      textColor: fmt.textColor ?? '#000000',
      bgColor: fmt.bgColor ?? '#ffffff',
      isMerged,
    })
  }, [])

  const commitFormulaBar = useCallback(() => {
    const h = hotRef.current?.hotInstance
    if (!h) return
    const { row, col } = selectedCellRef.current
    h.setDataAtCell(row, col, formulaBarValue)
  }, [formulaBarValue])

  // Build Handsontable settings ───────────────────────────────────────────────
  const hotSettings: Handsontable.GridSettings = {
    data: cellsToData(activeTab),
    licenseKey: 'non-commercial-and-evaluation',
    formulas: { engine: HyperFormula },
    rowHeaders: true,
    colHeaders: true,
    height: hotHeight,
    width: '100%',
    stretchH: 'none',
    manualColumnResize: true,
    manualRowResize: true,
    mergeCells: activeTab.mergedCells.map((mc) => ({
      row: mc.row, col: mc.col, rowspan: mc.rowspan, colspan: mc.colspan,
    })),
    contextMenu: {
      items: {
        row_above: {},
        row_below: {},
        col_left: {},
        col_right: {},
        remove_row: {},
        remove_col: {},
        mergeCells: {},
        copy: {},
        cut: {},
        undo: {},
        redo: {},
        explain_formula: {
          name: 'Explain this formula',
          disabled: function (this: Handsontable): boolean {
            const r = this.getSelectedRangeLast()
            if (!r) return true
            const src = this.getSourceDataAtCell(r.from.row, r.from.col)
            return typeof src !== 'string' || !src.startsWith('=')
          },
          callback: function (this: Handsontable): void {
            const r = this.getSelectedRangeLast()
            if (!r) return
            const formula = String(this.getSourceDataAtCell(r.from.row, r.from.col))
            window.dispatchEvent(new CustomEvent('prose-sheet-explain-formula', { detail: { formula } }))
          },
        },
        generate_formula: {
          name: 'Generate formula for this column',
          callback: function (this: Handsontable): void {
            const r = this.getSelectedRangeLast()
            if (!r) return
            window.dispatchEvent(
              new CustomEvent('prose-sheet-generate-formula', { detail: { col: r.from.col } })
            )
          },
        },
      },
    },
    undo: true,
    renderer: 'proseRenderer',
    afterChange: (_changes, source) => {
      if (source === 'loadData') return
      scheduleSave()
    },
    afterCreateRow: () => scheduleSave(),
    afterCreateCol: () => scheduleSave(),
    afterRemoveRow: () => scheduleSave(),
    afterRemoveCol: () => scheduleSave(),
    afterColumnResize: () => scheduleSave(),
    afterRowResize: () => scheduleSave(),
    afterMergeCells: () => scheduleSave(),
    afterUnmergeCells: () => scheduleSave(),
    afterSelectionEnd: (row, col) => onSelectionEnd(row, col),
  }

  if (!doc) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <FileEditorTitleBar />
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <FileEditorTitleBar />
      <SheetToolbar
        hotRef={hotRef}
        state={toolbarState}
        cellAddress={formulaAddress}
        formulaBarValue={formulaBarValue}
        onFormulaBarChange={setFormulaBarValue}
        onFormulaBarCommit={commitFormulaBar}
      />

      {/* Grid + AI panel row */}
      <div className="flex min-h-0 flex-1">
        {/* Handsontable container */}
        <div ref={containerRef} className="ht-theme-main-dark prose-hot-root min-h-0 min-w-0 flex-1 overflow-hidden">
          <HotTable ref={hotRef} settings={hotSettings} />
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
        tabs={sheetContent.tabs}
        activeTabId={activeTabId}
        onTabChange={switchTab}
        onAddTab={addTab}
        onRenameTab={renameTab}
        onDeleteTab={deleteTab}
      />
    </div>
  )
}
