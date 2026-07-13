// Executes validated prose-actions against the FortuneSheet workbook. Only
// called after the user clicks Apply on an action card — validation lives in
// src/lib/ai/proseActions.ts.
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { ChartDef } from '@/types/sheet'
import type { SheetAction } from '@/lib/ai/proseActions'
import type { AiActionHandler, AiActionResult } from '@/components/editor/AiPanel'
import { alignToHt } from './sheetUtils'

export interface SheetActionDeps {
  workbookRef: RefObject<WorkbookInstance | null>
  getActiveSheetId(): string
  insertChart(partial: Omit<ChartDef, 'id' | 'x' | 'y' | 'width' | 'height'>): void
  onMutated(): void
}

type FsRange = { row: [number, number]; column: [number, number] }

function toFsRange(r1: number, r2: number, c1: number, c2: number): FsRange {
  return { row: [r1, r2], column: [c1, c2] }
}

export function applySheetActions(actions: SheetAction[], deps: SheetActionDeps): AiActionResult {
  const wb = deps.workbookRef.current
  if (!wb) return { ok: false, message: 'Sheet is not ready yet.' }

  const failures: string[] = []
  let appliedCount = 0
  let cellsMutated = false

  for (const action of actions) {
    try {
      switch (action.type) {
        case 'setCells': {
          for (const cell of action.cells) {
            wb.setCellValue(cell.ref.row, cell.ref.col, cell.formula ?? cell.value ?? '')
          }
          cellsMutated = true
          appliedCount++
          break
        }
        case 'setRange': {
          action.values.forEach((row, r) => {
            row.forEach((value, c) => {
              if (value === null || value === '') return
              wb.setCellValue(action.start.row + r, action.start.col + c, value)
            })
          })
          cellsMutated = true
          appliedCount++
          break
        }
        case 'format': {
          const range = toFsRange(action.range.start.row, action.range.end.row, action.range.start.col, action.range.end.col)
          const apply = (attr: string, value: unknown): void => {
            wb.setCellFormatByRange(attr as Parameters<typeof wb.setCellFormatByRange>[0], value, range)
          }
          if (action.bold !== undefined) apply('bl', action.bold ? 1 : 0)
          if (action.italic !== undefined) apply('it', action.italic ? 1 : 0)
          if (action.underline !== undefined) apply('un', action.underline ? 1 : 0)
          if (action.textColor) apply('fc', action.textColor)
          if (action.bgColor) apply('bg', action.bgColor)
          if (action.fontSize !== undefined) apply('fs', action.fontSize)
          if (action.align) apply('ht', alignToHt(action.align))
          if (action.wrap !== undefined) apply('tb', action.wrap ? '2' : '0')
          cellsMutated = true
          appliedCount++
          break
        }
        case 'merge': {
          const range = toFsRange(action.range.start.row, action.range.end.row, action.range.start.col, action.range.end.col)
          wb.mergeCells([range], 'merge-all')
          cellsMutated = true
          appliedCount++
          break
        }
        case 'addChart': {
          deps.insertChart({
            sheetId: deps.getActiveSheetId(),
            type: action.chartType,
            dataRange: action.dataRange,
            title: action.title,
            ...(action.xAxisLabel ? { xAxisLabel: action.xAxisLabel } : {}),
            ...(action.yAxisLabel ? { yAxisLabel: action.yAxisLabel } : {}),
            ...(action.showLegend !== undefined ? { showLegend: action.showLegend } : {}),
            ...(action.showXAxisLabels !== undefined ? { showXAxisLabels: action.showXAxisLabels } : {}),
            ...(action.showYAxisLabels !== undefined ? { showYAxisLabels: action.showYAxisLabels } : {}),
            ...(action.colors ? { colors: action.colors } : {}),
            ...(action.doughnutCutout !== undefined ? { doughnutCutout: action.doughnutCutout } : {}),
            ...(action.straightLines !== undefined ? { straightLines: action.straightLines } : {}),
            ...(action.textScale !== undefined ? { textScale: action.textScale } : {}),
          })
          appliedCount++
          break
        }
      }
    } catch (err) {
      console.error('[sheetAiActions] action failed:', action.type, err)
      failures.push(`${action.type} failed`)
    }
  }

  if (cellsMutated) deps.onMutated()

  if (appliedCount === 0) {
    return { ok: false, message: failures[0] ?? 'Nothing could be applied.' }
  }
  return {
    ok: true,
    ...(failures.length > 0 ? { message: `Applied with ${failures.length} skipped (${failures[0]})` } : {}),
  }
}

export function createSheetActionHandler(deps: SheetActionDeps): AiActionHandler {
  return {
    surface: 'sheet',
    apply: (actions) => applySheetActions(actions as SheetAction[], deps),
  }
}
