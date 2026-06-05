import type { RefObject } from 'react'
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  WrapText, TableCellsMerge,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { applyFormatToSelection } from './sheetUtils'
import type { SheetCellFormat } from '@/types/sheet'
import type { HotTableClass } from '@handsontable/react'
import type Handsontable from 'handsontable'
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'

const FONT_FAMILIES = ['Default', 'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana']
const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

export interface ToolbarState {
  bold: boolean
  italic: boolean
  underline: boolean
  align: 'left' | 'center' | 'right' | null
  wrap: boolean
  fontFamily: string
  fontSize: number
  textColor: string
  bgColor: string
  isMerged: boolean
}

interface SheetToolbarProps {
  hotRef: RefObject<HotTableClass>
  state: ToolbarState
  cellAddress: string
  formulaBarValue: string
  onFormulaBarChange: (val: string) => void
  onFormulaBarCommit: () => void
  documentId: string | null
}

export function SheetToolbar({
  hotRef,
  state,
  cellAddress,
  formulaBarValue,
  onFormulaBarChange,
  onFormulaBarCommit,
  documentId,
}: SheetToolbarProps) {
  const hot = (): Handsontable | null => hotRef.current?.hotInstance ?? null

  const applyFmt = (updater: (f: SheetCellFormat) => SheetCellFormat) => {
    const h = hot()
    if (h) applyFormatToSelection(h, updater)
  }

  const toggleBool = (key: 'bold' | 'italic' | 'underline' | 'wrap', currentVal: boolean) =>
    applyFmt((f) => ({ ...f, [key]: !currentVal }))

  const setAlign = (align: 'left' | 'center' | 'right') =>
    applyFmt((f) => ({ ...f, align: f.align === align ? undefined : align }))

  const insertRowAbove = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    h.alter('insert_row_above', sel.from.row, 1)
  }
  const insertRowBelow = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    h.alter('insert_row_below', sel.to.row, 1)
  }
  const insertColLeft = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    h.alter('insert_col_start', sel.from.col, 1)
  }
  const insertColRight = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    h.alter('insert_col_end', sel.to.col, 1)
  }
  const deleteRow = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    const r1 = Math.min(sel.from.row, sel.to.row)
    const count = Math.abs(sel.to.row - sel.from.row) + 1
    h.alter('remove_row', r1, count)
  }
  const deleteCol = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    const c1 = Math.min(sel.from.col, sel.to.col)
    const count = Math.abs(sel.to.col - sel.from.col) + 1
    h.alter('remove_col', c1, count)
  }

  const toggleMerge = () => {
    const h = hot(); if (!h) return
    const sel = h.getSelectedRangeLast(); if (!sel) return
    const plugin = h.getPlugin('mergeCells') as unknown as {
      merge(r1: number, c1: number, r2: number, c2: number): void
      unmerge(r1: number, c1: number, r2: number, c2: number): void
    }
    if (state.isMerged) {
      plugin.unmerge(sel.from.row, sel.from.col, sel.to.row, sel.to.col)
    } else {
      plugin.merge(sel.from.row, sel.from.col, sel.to.row, sel.to.col)
    }
    h.render()
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-background">
      {/* Scrollable formatting controls */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-1">
        {/* Font family */}
        <select
          className="h-7 rounded border border-border bg-background px-1.5 text-xs text-foreground focus:outline-none"
          value={state.fontFamily}
          onChange={(e) => applyFmt((f) => ({ ...f, fontFamily: e.target.value }))}
        >
          {FONT_FAMILIES.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Font size */}
        <select
          className="h-7 w-[52px] rounded border border-border bg-background px-1 text-xs text-foreground focus:outline-none"
          value={state.fontSize}
          onChange={(e) => applyFmt((f) => ({ ...f, fontSize: parseInt(e.target.value, 10) }))}
        >
          {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.bold && 'bg-accent')}
          onClick={() => toggleBool('bold', state.bold)} title="Bold"
        ><Bold className="h-3.5 w-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.italic && 'bg-accent')}
          onClick={() => toggleBool('italic', state.italic)} title="Italic"
        ><Italic className="h-3.5 w-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.underline && 'bg-accent')}
          onClick={() => toggleBool('underline', state.underline)} title="Underline"
        ><Underline className="h-3.5 w-3.5" /></Button>

        {/* Text color */}
        <div className="relative" title="Text color">
          <input
            type="color" value={state.textColor}
            className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0"
            onChange={(e) => applyFmt((f) => ({ ...f, textColor: e.target.value }))}
          />
        </div>

        {/* Background color */}
        <div className="relative" title="Fill color">
          <input
            type="color" value={state.bgColor}
            className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0"
            onChange={(e) => applyFmt((f) => ({ ...f, bgColor: e.target.value }))}
          />
        </div>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'left' && 'bg-accent')}
          onClick={() => setAlign('left')} title="Align left"
        ><AlignLeft className="h-3.5 w-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'center' && 'bg-accent')}
          onClick={() => setAlign('center')} title="Align center"
        ><AlignCenter className="h-3.5 w-3.5" /></Button>
        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'right' && 'bg-accent')}
          onClick={() => setAlign('right')} title="Align right"
        ><AlignRight className="h-3.5 w-3.5" /></Button>

        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.wrap && 'bg-accent')}
          onClick={() => toggleBool('wrap', state.wrap)} title="Wrap text"
        ><WrapText className="h-3.5 w-3.5" /></Button>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button
          variant="ghost" size="icon" className={cn('h-7 w-7', state.isMerged && 'bg-accent')}
          onClick={toggleMerge} title="Merge cells"
        ><TableCellsMerge className="h-3.5 w-3.5" /></Button>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertRowAbove} title="Insert row above">
          <ArrowUpToLine className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertRowBelow} title="Insert row below">
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertColLeft} title="Insert column left">
          <ArrowLeftToLine className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertColRight} title="Insert column right">
          <ArrowRightToLine className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={deleteRow} title="Delete row">
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={deleteCol} title="Delete column">
          <Minus className="h-3.5 w-3.5 rotate-90" />
        </Button>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Formula bar — fixed 240px width */}
        <span className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground" style={{ minWidth: '2.5rem' }}>
          {cellAddress || 'A1'}
        </span>
        <input
          className="w-[240px] shrink-0 rounded border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/60"
          value={formulaBarValue}
          onChange={(e) => onFormulaBarChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              onFormulaBarCommit()
            }
            if (e.key === 'Escape') {
              const h = hot()
              if (h) {
                const sel = h.getSelectedRangeLast()
                if (sel) {
                  const src = h.getSourceDataAtCell(sel.from.row, sel.from.col)
                  onFormulaBarChange(src !== null && src !== undefined ? String(src) : '')
                }
              }
            }
          }}
          placeholder="Value or formula…"
        />
      </div>{/* end scrollable */}

      {/* Persistent right section */}
      <ToolbarRightSection
        fileType="sheet"
        documentId={documentId}
      />
    </div>
  )
}
