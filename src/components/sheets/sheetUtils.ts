import type Handsontable from 'handsontable'
import type { SheetTab, SheetCell, SheetCellFormat } from '@/types/sheet'

export function colToLetter(col: number): string {
  let s = ''
  let c = col
  while (c >= 0) {
    s = String.fromCharCode(65 + (c % 26)) + s
    c = Math.floor(c / 26) - 1
  }
  return s
}

export function cellAddress(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`
}

export function cellsToData(tab: SheetTab): (string | number | boolean | null)[][] {
  const data: (string | number | boolean | null)[][] = Array.from(
    { length: tab.rowCount },
    () => Array(tab.colCount).fill(null) as (string | number | boolean | null)[]
  )
  for (const [key, cell] of Object.entries(tab.cells)) {
    const parts = key.split(',')
    const r = parseInt(parts[0]!, 10)
    const c = parseInt(parts[1]!, 10)
    if (r >= 0 && r < tab.rowCount && c >= 0 && c < tab.colCount) {
      data[r]![c] = cell.formula ?? cell.value ?? null
    }
  }
  return data
}

export function serializeTab(hot: Handsontable, existingTab: SheetTab): SheetTab {
  const sourceData = hot.getSourceData() as (string | number | boolean | null)[][]
  const cells: Record<string, SheetCell> = {}

  for (let r = 0; r < sourceData.length; r++) {
    const row = sourceData[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const src = row[c]
      if (src === null || src === undefined || src === '') continue
      const meta = hot.getCellMeta(r, c) as { proseFormat?: SheetCellFormat }
      const cell: SheetCell = {}
      if (typeof src === 'string' && src.startsWith('=')) {
        cell.formula = src
        const computed = hot.getDataAtCell(r, c)
        cell.value = computed as string | number | boolean | null
      } else {
        cell.value = src
      }
      if (meta.proseFormat && Object.keys(meta.proseFormat).length > 0) {
        cell.format = meta.proseFormat
      }
      cells[`${r},${c}`] = cell
    }
  }

  // Also capture cells that only have format (no value)
  // by checking all tracked formatted cells in the existing tab
  for (const [key, cell] of Object.entries(existingTab.cells)) {
    if (cells[key]) continue  // already captured
    if (cell.format && Object.keys(cell.format).length > 0) {
      const parts = key.split(',')
      const r = parseInt(parts[0]!, 10)
      const c = parseInt(parts[1]!, 10)
      const meta = hot.getCellMeta(r, c) as { proseFormat?: SheetCellFormat }
      if (meta.proseFormat && Object.keys(meta.proseFormat).length > 0) {
        cells[key] = { format: meta.proseFormat }
      }
    }
  }

  const mergedCells = getMergedCells(hot)
  const colCount = hot.countCols()
  const rowCount = hot.countRows()

  const colWidths: number[] = []
  for (let c = 0; c < colCount; c++) {
    colWidths.push(hot.getColWidth(c) ?? 50)
  }

  const rowHeights: number[] = []
  for (let r = 0; r < rowCount; r++) {
    rowHeights.push(hot.getRowHeight(r) ?? 23)
  }

  return { ...existingTab, cells, rowCount, colCount, colWidths, rowHeights, mergedCells }
}

function getMergedCells(hot: Handsontable) {
  try {
    const plugin = hot.getPlugin('mergeCells') as unknown as {
      isEnabled(): boolean
      mergedCellsCollection?: {
        mergedCells: Array<{ row: number; col: number; rowspan: number; colspan: number }>
      }
    }
    if (!plugin.isEnabled() || !plugin.mergedCellsCollection) return []
    return plugin.mergedCellsCollection.mergedCells.map((mc) => ({
      row: mc.row,
      col: mc.col,
      rowspan: mc.rowspan,
      colspan: mc.colspan,
    }))
  } catch {
    return []
  }
}

export function getFormatAtCell(hot: Handsontable, row: number, col: number): SheetCellFormat {
  const meta = hot.getCellMeta(row, col) as { proseFormat?: SheetCellFormat }
  return meta.proseFormat ?? {}
}

export function applyFormatToSelection(
  hot: Handsontable,
  updater: (existing: SheetCellFormat) => SheetCellFormat,
  fallbackRange?: Array<{ from: { row: number; col: number }; to: { row: number; col: number } }>,
): void {
  type ActiveEditor = {
    isOpened?: () => boolean
    row?: number
    col?: number
    focus?: () => void
  }
  const editor = hot.getActiveEditor() as ActiveEditor | undefined
  if (editor?.isOpened?.()) {
    const r = editor.row
    const c = editor.col
    if (r === undefined || c === undefined) return
    const meta = hot.getCellMeta(r, c) as { proseFormat?: SheetCellFormat }
    hot.setCellMeta(r, c, 'proseFormat', updater(meta.proseFormat ?? {}))
    hot.render()
    editor.focus?.()
    return
  }

  let selected = hot.getSelectedRange()
  if (!selected?.length && fallbackRange?.length) {
    selected = fallbackRange
  }
  if (!selected?.length) return

  for (const range of selected) {
    const r1 = Math.min(range.from.row, range.to.row)
    const r2 = Math.max(range.from.row, range.to.row)
    const c1 = Math.min(range.from.col, range.to.col)
    const c2 = Math.max(range.from.col, range.to.col)
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const meta = hot.getCellMeta(r, c) as { proseFormat?: SheetCellFormat }
        hot.setCellMeta(r, c, 'proseFormat', updater(meta.proseFormat ?? {}))
      }
    }
  }
  hot.render()
  hot.listen()
}

export function restoreTabFormats(hot: Handsontable, tab: SheetTab): void {
  for (const [key, cell] of Object.entries(tab.cells)) {
    if (!cell.format) continue
    const parts = key.split(',')
    const r = parseInt(parts[0]!, 10)
    const c = parseInt(parts[1]!, 10)
    hot.setCellMeta(r, c, 'proseFormat', cell.format)
  }
}
