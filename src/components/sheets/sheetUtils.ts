import type { Sheet, Cell, CellWithRowAndCol, SheetConfig } from '@fortune-sheet/core'
import type { SheetTab, SheetCell, SheetContent, SheetMergedCell } from '@/types/sheet'

// ── Column/cell address helpers ───────────────────────────────────────────────

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

// ── Alignment helpers ─────────────────────────────────────────────────────────

export function htToAlign(ht?: number): 'left' | 'center' | 'right' | null {
  if (ht === 0) return 'center'
  if (ht === 1) return 'left'
  if (ht === 2) return 'right'
  return null
}

export function alignToHt(align: 'left' | 'center' | 'right' | null): number | undefined {
  if (align === 'left') return 1
  if (align === 'center') return 0
  if (align === 'right') return 2
  return undefined
}

// ── Our format → FortuneSheet ─────────────────────────────────────────────────

export function sheetTabToFSSheet(tab: SheetTab, isActive: boolean, order: number): Sheet {
  const celldata: CellWithRowAndCol[] = []

  for (const [key, cell] of Object.entries(tab.cells)) {
    const parts = key.split(',')
    const r = parseInt(parts[0]!, 10)
    const c = parseInt(parts[1]!, 10)
    if (isNaN(r) || isNaN(c)) continue

    const fsCell: Cell = {}

    if (cell.formula) {
      fsCell.f = cell.formula
      if (cell.value !== null && cell.value !== undefined) {
        fsCell.v = cell.value as string | number | boolean
        fsCell.m = String(cell.value)
      }
    } else if (cell.value !== null && cell.value !== undefined) {
      fsCell.v = cell.value as string | number | boolean
      fsCell.m = String(cell.value)
    }

    const fmt = cell.format
    if (fmt) {
      if (fmt.bold) fsCell.bl = 1
      if (fmt.italic) fsCell.it = 1
      if (fmt.underline) fsCell.un = 1
      if (fmt.fontSize) fsCell.fs = fmt.fontSize
      if (fmt.fontFamily && fmt.fontFamily !== 'Calibri') fsCell.ff = fmt.fontFamily
      if (fmt.textColor) fsCell.fc = fmt.textColor
      if (fmt.bgColor) fsCell.bg = fmt.bgColor
      const ht = alignToHt(fmt.align ?? null)
      if (ht !== undefined) fsCell.ht = ht
      if (fmt.wrap) fsCell.tb = '2'
    }

    if (Object.keys(fsCell).length > 0) {
      celldata.push({ r, c, v: fsCell })
    }
  }

  // Merge config
  const merge: SheetConfig['merge'] = {}
  for (const mc of tab.mergedCells) {
    merge[`${mc.row}_${mc.col}`] = { r: mc.row, c: mc.col, rs: mc.rowspan, cs: mc.colspan }
  }

  // Column/row size configs
  const columnlen: Record<string, number> = {}
  tab.colWidths.forEach((w, i) => { if (w) columnlen[String(i)] = w })

  const rowlen: Record<string, number> = {}
  tab.rowHeights.forEach((h, i) => { if (h) rowlen[String(i)] = h })

  return {
    id: tab.id,
    name: tab.name,
    status: isActive ? 1 : 0,
    order,
    row: tab.rowCount,
    column: tab.colCount,
    defaultColWidth: 100,
    defaultRowHeight: 20,
    celldata,
    config: { merge, columnlen, rowlen },
  }
}

// ── FortuneSheet → our format ─────────────────────────────────────────────────

function fsCellToSheetCell(cell: Cell): SheetCell | null {
  const hasValue = cell.v !== undefined && cell.v !== null
  const hasFormula = !!cell.f
  const hasFormat = !!(cell.bl || cell.it || cell.un || cell.fs || cell.ff || cell.fc || cell.bg || cell.ht !== undefined || cell.tb)

  if (!hasValue && !hasFormula && !hasFormat) return null

  const sc: SheetCell = {}

  if (hasFormula) {
    sc.formula = cell.f!
    if (hasValue) sc.value = cell.v
  } else if (hasValue) {
    sc.value = cell.v
  }

  if (hasFormat) {
    sc.format = {
      bold: cell.bl === 1 || undefined,
      italic: cell.it === 1 || undefined,
      underline: cell.un === 1 || undefined,
      fontSize: cell.fs,
      fontFamily: typeof cell.ff === 'string' ? cell.ff : undefined,
      textColor: cell.fc,
      bgColor: cell.bg,
      align: htToAlign(cell.ht) ?? undefined,
      wrap: cell.tb === '2' || undefined,
    }
    // Clean up undefined values
    Object.keys(sc.format).forEach((k) => {
      if ((sc.format as Record<string, unknown>)[k] === undefined) {
        delete (sc.format as Record<string, unknown>)[k]
      }
    })
    if (Object.keys(sc.format).length === 0) delete sc.format
  }

  if (Object.keys(sc).length === 0) return null
  return sc
}

export function fsDataToSheetContent(data: Sheet[]): SheetContent {
  const tabs: SheetTab[] = data.map((sheet) => {
    const cells: Record<string, SheetCell> = {}

    if (sheet.data) {
      for (let r = 0; r < sheet.data.length; r++) {
        const row = sheet.data[r]
        if (!row) continue
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (!cell) continue
          const sc = fsCellToSheetCell(cell)
          if (sc) cells[`${r},${c}`] = sc
        }
      }
    } else if (sheet.celldata) {
      for (const item of sheet.celldata) {
        if (!item.v) continue
        const sc = fsCellToSheetCell(item.v)
        if (sc) cells[`${item.r},${item.c}`] = sc
      }
    }

    const config = sheet.config ?? {}
    const mergedCells: SheetMergedCell[] = Object.values(config.merge ?? {}).map((m) => ({
      row: m.r,
      col: m.c,
      rowspan: m.rs,
      colspan: m.cs,
    }))

    const colWidths: number[] = []
    for (const [k, v] of Object.entries(config.columnlen ?? {})) {
      const idx = parseInt(k, 10)
      if (!isNaN(idx)) colWidths[idx] = v
    }

    const rowHeights: number[] = []
    for (const [k, v] of Object.entries(config.rowlen ?? {})) {
      const idx = parseInt(k, 10)
      if (!isNaN(idx)) rowHeights[idx] = v
    }

    return {
      id: String(sheet.id ?? sheet.order ?? 0),
      name: sheet.name,
      cells,
      rowCount: sheet.row ?? 100,
      colCount: sheet.column ?? 26,
      colWidths,
      rowHeights,
      mergedCells,
    }
  })

  const active = data.find((s) => s.status === 1) ?? data[0]
  const activeTabId = String(active?.id ?? tabs[0]?.id ?? '')

  return { version: 1, activeTabId, tabs }
}
