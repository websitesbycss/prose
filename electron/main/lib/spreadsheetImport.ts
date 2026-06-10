// Spreadsheet import via SheetJS (xlsx). Converts .xlsx, .xls, and .csv into Prose SheetContent.
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { randomUUID } from 'crypto'
import * as XLSX from 'xlsx'

const MAX_IMPORT_BYTES = 50 * 1024 * 1024
const DEFAULT_ROW_COUNT = 100
const DEFAULT_COL_COUNT = 26

interface SheetCell {
  value?: string | number | boolean | null
  formula?: string
}

interface SheetMergedCell {
  row: number
  col: number
  rowspan: number
  colspan: number
}

interface SheetTab {
  id: string
  name: string
  cells: Record<string, SheetCell>
  rowCount: number
  colCount: number
  colWidths: number[]
  rowHeights: number[]
  mergedCells: SheetMergedCell[]
}

export interface SheetContent {
  version: 1
  activeTabId: string
  tabs: SheetTab[]
}

function normalizeFormula(raw: string): string {
  const trimmed = raw.trim()
  return trimmed.startsWith('=') ? trimmed : `=${trimmed}`
}

function xlsxCellToSheetCell(cell: XLSX.CellObject): SheetCell | null {
  const hasFormula = typeof cell.f === 'string' && cell.f.length > 0
  const hasValue = cell.v !== undefined && cell.v !== null && cell.v !== ''

  if (!hasFormula && !hasValue) return null

  const sheetCell: SheetCell = {}
  if (hasFormula) {
    sheetCell.formula = normalizeFormula(cell.f!)
    if (hasValue) sheetCell.value = cell.v as string | number | boolean
  } else {
    sheetCell.value = cell.v as string | number | boolean
  }
  return sheetCell
}

function workbookSheetToTab(sheet: XLSX.WorkSheet, name: string): SheetTab {
  const ref = sheet['!ref']
  const range = ref ? XLSX.utils.decode_range(ref) : { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }

  const dataRowCount = range.e.r - range.s.r + 1
  const dataColCount = range.e.c - range.s.c + 1
  const rowCount = Math.max(dataRowCount, DEFAULT_ROW_COUNT)
  const colCount = Math.max(dataColCount, DEFAULT_COL_COUNT)

  const cells: Record<string, SheetCell> = {}
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const raw = sheet[addr] as XLSX.CellObject | undefined
      if (!raw) continue
      const sc = xlsxCellToSheetCell(raw)
      if (sc) cells[`${r},${c}`] = sc
    }
  }

  const mergedCells: SheetMergedCell[] = (sheet['!merges'] ?? []).map((m) => ({
    row: m.s.r,
    col: m.s.c,
    rowspan: m.e.r - m.s.r + 1,
    colspan: m.e.c - m.s.c + 1,
  }))

  return {
    id: randomUUID(),
    name,
    cells,
    rowCount,
    colCount,
    colWidths: [],
    rowHeights: [],
    mergedCells,
  }
}

function emptyTab(name: string): SheetTab {
  return {
    id: randomUUID(),
    name,
    cells: {},
    rowCount: DEFAULT_ROW_COUNT,
    colCount: DEFAULT_COL_COUNT,
    colWidths: [],
    rowHeights: [],
    mergedCells: [],
  }
}

export function workbookToSheetContent(workbook: XLSX.WorkBook): SheetContent {
  const tabs =
    workbook.SheetNames.length > 0
      ? workbook.SheetNames.map((name) => {
          const sheet = workbook.Sheets[name]
          return sheet ? workbookSheetToTab(sheet, name) : emptyTab(name)
        })
      : [emptyTab('Sheet 1')]

  return {
    version: 1,
    activeTabId: tabs[0]!.id,
    tabs,
  }
}

export async function parseSpreadsheetFile(filePath: string): Promise<SheetContent> {
  const buf = await readFile(filePath)
  if (buf.length > MAX_IMPORT_BYTES) {
    throw new Error('File too large (max 50MB)')
  }

  const ext = extname(filePath).toLowerCase()
  const readOpts: XLSX.ParsingOptions =
    ext === '.csv'
      ? { type: 'buffer', raw: false }
      : { type: 'buffer', cellFormula: true, cellDates: true }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, readOpts)
  } catch {
    throw new Error('Could not read spreadsheet — the file may be corrupted or password-protected')
  }

  return workbookToSheetContent(workbook)
}
