import type { RefObject, MutableRefObject } from 'react'
import {
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  WrapText, TableCellsMerge,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine,
  Minus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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
  selectionRangeRef: MutableRefObject<Array<{ from: { row: number; col: number }; to: { row: number; col: number } }>>
  state: ToolbarState
  cellAddress: string
  formulaBarValue: string
  onFormulaBarChange: (val: string) => void
  onFormulaBarCommit: () => void
  onFormatChange: () => void
  documentId: string | null
}

/** Keep Handsontable cell focus while interacting with toolbar controls. */
function keepHotFocus(e: React.MouseEvent): void {
  e.preventDefault()
}

export function SheetToolbar({
  hotRef,
  selectionRangeRef,
  state,
  cellAddress,
  formulaBarValue,
  onFormulaBarChange,
  onFormulaBarCommit,
  onFormatChange,
  documentId,
}: SheetToolbarProps) {
  const hot = (): Handsontable | null => hotRef.current?.hotInstance ?? null

  const applyFmt = (updater: (f: SheetCellFormat) => SheetCellFormat) => {
    const h = hot()
    if (!h) return
    applyFormatToSelection(h, updater, selectionRangeRef.current)
    onFormatChange()
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
      {/* Scrollable formatting controls — mousedown preventDefault keeps cell edit focus */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-1" onMouseDown={keepHotFocus}>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.bold && 'bg-accent')} onClick={() => toggleBool('bold', state.bold)}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Bold</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.italic && 'bg-accent')} onClick={() => toggleBool('italic', state.italic)}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Italic</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.underline && 'bg-accent')} onClick={() => toggleBool('underline', state.underline)}>
              <Underline className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Underline</TooltipContent>
        </Tooltip>

        {/* Text color */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <input
                type="color" value={state.textColor}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0"
                onChange={(e) => applyFmt((f) => ({ ...f, textColor: e.target.value }))}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Text color</TooltipContent>
        </Tooltip>

        {/* Background color */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <input
                type="color" value={state.bgColor}
                className="h-7 w-7 cursor-pointer rounded border border-border bg-transparent p-0.5 [&::-webkit-color-swatch-wrapper]:p-0"
                onChange={(e) => applyFmt((f) => ({ ...f, bgColor: e.target.value }))}
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Fill color</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'left' && 'bg-accent')} onClick={() => setAlign('left')}>
              <AlignLeft className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'center' && 'bg-accent')} onClick={() => setAlign('center')}>
              <AlignCenter className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.align === 'right' && 'bg-accent')} onClick={() => setAlign('right')}>
              <AlignRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.wrap && 'bg-accent')} onClick={() => toggleBool('wrap', state.wrap)}>
              <WrapText className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Wrap text</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.isMerged && 'bg-accent')} onClick={toggleMerge}>
              <TableCellsMerge className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{state.isMerged ? 'Unmerge cells' : 'Merge cells'}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertRowAbove}>
              <ArrowUpToLine className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert row above</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertRowBelow}>
              <ArrowDownToLine className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert row below</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertColLeft}>
              <ArrowLeftToLine className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert column left</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={insertColRight}>
              <ArrowRightToLine className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert column right</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={deleteRow}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete row</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={deleteCol}>
              <Minus className="h-3.5 w-3.5 rotate-90" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Delete column</TooltipContent>
        </Tooltip>
      </div>{/* end formatting controls with focus guard */}

      {/* Formula bar — outside focus guard so it can receive keyboard input */}
      <div className="flex shrink-0 items-center gap-0.5 px-2 py-1">
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
      </div>{/* end formula bar */}

      {/* Persistent right section */}
      <ToolbarRightSection
        fileType="sheet"
        documentId={documentId}
      />
    </div>
  )
}
