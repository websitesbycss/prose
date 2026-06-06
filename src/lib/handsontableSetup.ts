/**
 * One-time Handsontable 17 module registration.
 * Handsontable 17 is modular — plugins, editors, and cell types must be
 * registered before HotTable initializes or getPlugin() / cell editing will fail.
 */
import Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import type { SheetCellFormat } from '@/types/sheet'

let initialized = false

export function ensureHandsontableRegistered(): void {
  if (initialized) return
  initialized = true

  registerAllModules()

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
      if (fmt.wrap) {
        td.style.whiteSpace = 'pre-wrap'
        td.style.overflow = 'visible'
      }
    },
  )
}

ensureHandsontableRegistered()
