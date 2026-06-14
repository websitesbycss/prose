// ── Sheet data model ──────────────────────────────────────────────────────────
// Stored as the `content` field of a .prose file when fileType === 'sheet'.
// FortuneSheet is the runtime spreadsheet engine; this is the persistence model.

export interface SheetCellFormat {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontFamily?: string
  fontSize?: number       // pt
  textColor?: string      // CSS color string
  bgColor?: string        // CSS color string
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
}

export interface SheetCell {
  /** Raw value (when no formula is present). Null = explicitly empty. */
  value?: string | number | boolean | null
  /** Formula string, always starts with "=". When present, `value` is the last computed result. */
  formula?: string
  format?: SheetCellFormat
}

export interface SheetMergedCell {
  row: number      // 0-based start row
  col: number      // 0-based start col
  rowspan: number  // number of rows covered (>= 1)
  colspan: number  // number of columns covered (>= 1)
}

export interface SheetTab {
  id: string
  name: string
  /** Sparse cell store: keys are "row,col" (e.g. "0,2"). Only non-empty cells are stored. */
  cells: Record<string, SheetCell>
  rowCount: number       // logical row count
  colCount: number       // logical column count
  /** Column widths in pixels. Length ≤ colCount; missing entries use the FortuneSheet default. */
  colWidths: number[]
  /** Row heights in pixels. Length ≤ rowCount; missing entries use the FortuneSheet default. */
  rowHeights: number[]
  mergedCells: SheetMergedCell[]
}

export type ChartType =
  | 'bar'
  | 'barHorizontal'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut'
  | 'scatter'
  | 'radar'

export interface ChartDef {
  id: string
  sheetId: string
  type: ChartType
  dataRange: string
  title: string
  x: number
  y: number
  width: number
  height: number
}

export interface SheetContent {
  version: 1
  activeTabId: string
  tabs: SheetTab[]
  charts?: ChartDef[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isSheetContent(content: unknown): content is SheetContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  return c.version === 1 && Array.isArray(c.tabs)
}

export function countSheetCells(content: SheetContent): number {
  return content.tabs.reduce((sum, tab) => sum + Object.keys(tab.cells).length, 0)
}

/** Minimal initial content for a new Sheet with one empty tab. */
export function createInitialSheetContent(): SheetContent {
  return {
    version: 1,
    activeTabId: 'tab-1',
    tabs: [
      {
        id: 'tab-1',
        name: 'Sheet 1',
        cells: {},
        rowCount: 100,
        colCount: 26,
        colWidths: [],
        rowHeights: [],
        mergedCells: [],
      },
    ],
  }
}
