// Converts a persisted Prose Sheet (SheetTab) into AI-readable text, without
// needing a live FortuneSheet Workbook mounted — used by the Generate tab's
// "Spreadsheet" source kind. Mirrors SheetsEditor.tsx's buildSheetContext
// (used by the Sheets Insights tab) but reads the sparse `cells` map directly
// via sheetTabToCellGrid, which was built exactly for this "outside a live
// workbook" case (see chartUtils.ts).
import type { SheetTab } from '@/types/sheet'
import { sheetTabToCellGrid, parseRange } from '@/components/sheets/chartUtils'
import { colToLetter, cellAddress } from '@/components/sheets/sheetUtils'

const MAX_ROWS = 21
const MAX_COLS = 26

/** Populated bounding box of a sheet tab, e.g. "A1:F340" — or null if empty. */
export function computeUsedRange(tab: SheetTab): string | null {
  let minR = Infinity, minC = Infinity, maxR = -1, maxC = -1
  for (const key of Object.keys(tab.cells)) {
    const [rs, cs] = key.split(',')
    const r = parseInt(rs ?? '', 10)
    const c = parseInt(cs ?? '', 10)
    if (isNaN(r) || isNaN(c)) continue
    if (tab.cells[key]?.value === null || tab.cells[key]?.value === undefined) continue
    if (r < minR) minR = r
    if (c < minC) minC = c
    if (r > maxR) maxR = r
    if (c > maxC) maxC = c
  }
  if (maxR === -1) return null
  return `${cellAddress(minR, minC)}:${cellAddress(maxR, maxC)}`
}

/** Markdown table for a sheet tab's range, capped like buildSheetContext (21 rows × 26 cols, 50 formula lines). */
export function sheetRangeToMarkdown(tab: SheetTab, range: string): string {
  const grid = sheetTabToCellGrid(tab)
  const rng = parseRange(range)
  if (!rng) return `Sheet tab: "${tab.name}"\n(invalid range)`

  const rowCount = Math.min(rng.r2 - rng.r1 + 1, MAX_ROWS)
  const colCount = Math.min(rng.c2 - rng.c1 + 1, MAX_COLS)
  if (rowCount <= 0 || colCount <= 0) return `Sheet tab: "${tab.name}"\n(empty range)`

  const cellAt = (r: number, c: number): string | number | null => {
    const cell = grid[r]?.[c]
    const v = cell?.m ?? cell?.v
    return v === undefined ? null : (v as string | number)
  }

  const headers: string[] = []
  for (let c = 0; c < colCount; c++) {
    const v = cellAt(rng.r1, rng.c1 + c)
    headers.push(v !== null && String(v).trim() !== '' ? String(v) : colToLetter(rng.c1 + c))
  }
  const sep = headers.map(() => '---').join(' | ')

  const dataRows: string[] = []
  for (let r = 1; r < rowCount; r++) {
    const cells: string[] = []
    for (let c = 0; c < colCount; c++) {
      const v = cellAt(rng.r1 + r, rng.c1 + c)
      cells.push(v !== null ? String(v) : '')
    }
    if (cells.every((c) => c === '')) continue
    dataRows.push(cells.join(' | '))
  }

  const formulaCells: string[] = []
  outer: for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      const cell = grid[rng.r1 + r]?.[rng.c1 + c]
      if (cell?.f) {
        formulaCells.push(`${cellAddress(rng.r1 + r, rng.c1 + c)}: ${cell.f} → ${cell.m ?? cell.v ?? ''}`)
        if (formulaCells.length >= 50) break outer
      }
    }
  }

  const parts = [
    `Sheet tab: "${tab.name}" (${range})`,
    '',
    `Data (${dataRows.length} rows, ${colCount} columns):`,
    `| ${headers.join(' | ')} |`,
    `| ${sep} |`,
    ...dataRows.map((row) => `| ${row} |`),
  ]
  if (formulaCells.length > 0) parts.push('', 'Formula cells:', ...formulaCells)
  return parts.join('\n')
}
