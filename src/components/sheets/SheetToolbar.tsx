import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import {
  Undo2, Redo2,
  Bold, Italic, Underline,
  AlignLeft, AlignCenter, AlignRight,
  WrapText, TableCellsMerge,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine,
  Minus, ChevronDown, PaintBucket, BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { cn } from '@/lib/utils'
import { alignToHt, cellAddress as makeCellAddress } from './sheetUtils'
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'
import { useAppStore } from '@/store/appStore'

const FONT_FAMILIES = ['Calibri', 'Times New Roman', 'Georgia', 'Arial', 'Helvetica', 'Courier New']
const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

const COLOR_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

const FILL_PALETTE = [
  '#fef08a', '#fde68a', '#fed7aa',
  '#fca5a5', '#f9a8d4', '#d8b4fe',
  '#a5f3fc', '#86efac', '#bfdbfe',
  '#f3f4f6', '#e5e7eb', '#d1d5db',
]

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
  workbookRef: RefObject<WorkbookInstance | null>
  state: ToolbarState
  cellAddress: string
  formulaBarValue: string
  onFormulaBarChange: (val: string) => void
  onFormulaBarCommit: () => void
  onFormatChange: () => void
  documentId: string | null
  onSettingsOpen?: () => void
  onSheetExport?: () => void
  onInsertChart?: () => void
}

// ── Shared portal color picker dropdown ──────────────────────────────────────

function ColorPickerDropdown({
  trigger,
  tooltip,
  children,
}: {
  trigger: React.ReactNode
  tooltip: string
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  function handleClick() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const left = Math.max(4, r.left + r.width / 2 - 110)
    setPos({ top: r.bottom + 4, left })
    setOpen((o) => !o)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={btnRef} onClick={handleClick} style={{ display: 'inline-flex' }}>
          {trigger}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{tooltip}</TooltipContent>
      {createPortal(
        <AnimatePresence>
          {open && (
            <div
              ref={pickerRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
              onMouseDown={(e) => {
                e.stopPropagation()
                if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {children(close)}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Tooltip>
  )
}

// ── Font family picker (matches Documents toolbar) ───────────────────────────

function FontFamilyPicker({
  fontFamily,
  onApply,
}: {
  fontFamily: string
  onApply: (ff: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-7 w-36 justify-between border-input px-2 text-xs font-normal"
              style={{ fontFamily }}
            >
              <span className="truncate">{fontFamily}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font family</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-44 p-1"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {FONT_FAMILIES.map((f) => (
          <button
            key={f}
            className={cn(
              'w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              fontFamily === f && 'bg-accent/50 font-medium'
            )}
            style={{ fontFamily: f }}
            onMouseDown={(e) => {
              e.preventDefault()
              onApply(f)
              setOpen(false)
            }}
          >
            {f}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ── Font size picker (matches Documents toolbar) ─────────────────────────────

function FontSizePicker({
  fontSize,
  onApply,
}: {
  fontSize: number
  onApply: (fs: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  function apply(val: string) {
    const num = parseInt(val)
    if (!isNaN(num) && num >= 6 && num <= 96) onApply(num)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setDraft(String(fontSize))
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <div className="flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-input transition-colors hover:bg-accent/30">
              <span className="w-10 select-none text-center text-xs">{fontSize}</span>
              <div className="flex h-7 w-5 shrink-0 items-center justify-center border-l border-input text-muted-foreground">
                <ChevronDown className="h-3 w-3" />
              </div>
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font size</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-16 p-1"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply(draft)
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        <div className="flex flex-col">
          {FONT_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              className={cn(
                'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                fontSize === size && 'bg-accent/50 font-medium'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                onApply(size)
                setOpen(false)
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Main toolbar ─────────────────────────────────────────────────────────────

export function SheetToolbar({
  workbookRef,
  state,
  cellAddress,
  formulaBarValue,
  onFormulaBarChange,
  onFormulaBarCommit,
  onFormatChange,
  documentId,
  onSettingsOpen,
  onSheetExport,
  onInsertChart,
}: SheetToolbarProps) {
  const theme = useAppStore((s) => s.theme)
  const wb = () => workbookRef.current

  function applyToSelection(attr: string, value: unknown) {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    for (const range of sel) {
      w.setCellFormatByRange(attr as Parameters<typeof w.setCellFormatByRange>[0], value, range)
    }
    onFormatChange()
  }

  const toggleBold = () => applyToSelection('bl', state.bold ? 0 : 1)
  const toggleItalic = () => applyToSelection('it', state.italic ? 0 : 1)
  const toggleUnderline = () => applyToSelection('un', state.underline ? 0 : 1)
  const toggleWrap = () => applyToSelection('tb', state.wrap ? '0' : '2')

  const setAlign = (align: 'left' | 'center' | 'right') => {
    const newHt = state.align === align ? undefined : alignToHt(align)
    applyToSelection('ht', newHt)
  }

  const applyFontFamily = (ff: string) => {
    applyToSelection('ff', ff === 'Calibri' ? undefined : ff)
  }

  const applyFontSize = (fs: number) => applyToSelection('fs', fs)

  const applyTextColor = (fc: string) => applyToSelection('fc', fc)
  const applyBgColor = (bg: string) => applyToSelection('bg', bg)

  const themedColorPalette = COLOR_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  const insertRowAbove = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    w.insertRowOrColumn('row', sel[0].row[0]!, 1, 'lefttop')
  }
  const insertRowBelow = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    w.insertRowOrColumn('row', sel[0].row[sel[0].row.length - 1]!, 1, 'rightbottom')
  }
  const insertColLeft = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    w.insertRowOrColumn('column', sel[0].column[0]!, 1, 'lefttop')
  }
  const insertColRight = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    w.insertRowOrColumn('column', sel[0].column[sel[0].column.length - 1]!, 1, 'rightbottom')
  }
  const deleteRow = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    const rows = sel[0].row
    w.deleteRowOrColumn('row', Math.min(...rows), Math.max(...rows))
  }
  const deleteCol = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    const cols = sel[0].column
    w.deleteRowOrColumn('column', Math.min(...cols), Math.max(...cols))
  }

  const toggleMerge = () => {
    const w = wb(); if (!w) return
    const sel = w.getSelection(); if (!sel?.length) return
    if (state.isMerged) { w.cancelMerge(sel) } else { w.mergeCells(sel, 'merge-all') }
    onFormatChange()
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-background">
      {/* Scrollable formatting controls */}
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2 py-1">

        {/* Undo / Redo */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Undo (Ctrl+Z)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }))}>
              <Redo2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Redo (Ctrl+Y)</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Font family */}
        <FontFamilyPicker fontFamily={state.fontFamily} onApply={applyFontFamily} />

        {/* Font size */}
        <FontSizePicker fontSize={state.fontSize} onApply={applyFontSize} />

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Bold / Italic / Underline */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.bold && 'bg-accent')} onClick={toggleBold}>
              <Bold className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Bold (Ctrl+B)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.italic && 'bg-accent')} onClick={toggleItalic}>
              <Italic className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Italic (Ctrl+I)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.underline && 'bg-accent')} onClick={toggleUnderline}>
              <Underline className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Underline (Ctrl+U)</TooltipContent>
        </Tooltip>

        {/* Text color — A with color swatch */}
        <ColorPickerDropdown
          tooltip="Font color"
          trigger={
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <span className="text-[15px] font-normal leading-[14px] w-4 text-center">A</span>
              <span className="mt-[5px] h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600" style={{ backgroundColor: state.textColor, borderColor: state.textColor ?? undefined }} />
            </Button>
          }
        >
          {(close) => (
            <ChromeColorPicker
              color={state.textColor || '#000000'}
              current={state.textColor}
              palette={themedColorPalette}
              onChange={(c) => applyTextColor(c)}
              onPaletteSelect={(c) => applyTextColor(c)}
              onReset={() => { applyTextColor(theme === 'dark' ? '#ffffff' : '#000000'); close() }}
              resetLabel="Reset color"
            />
          )}
        </ColorPickerDropdown>

        {/* Cell fill — PaintBucket with color swatch */}
        <ColorPickerDropdown
          tooltip="Fill color"
          trigger={
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <PaintBucket className="h-3.5 w-3.5 leading-none" />
              <span
                className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
                style={{ backgroundColor: state.bgColor !== '#ffffff' ? state.bgColor : 'transparent', borderColor: state.bgColor !== '#ffffff' ? state.bgColor : undefined }}
              />
            </Button>
          }
        >
          {(close) => (
            <ChromeColorPicker
              color={state.bgColor || '#ffffff'}
              current={state.bgColor}
              palette={FILL_PALETTE}
              onChange={(c) => applyBgColor(c)}
              onPaletteSelect={(c) => applyBgColor(c)}
              onReset={() => { applyBgColor('#ffffff'); close() }}
              resetLabel="Remove fill"
            />
          )}
        </ColorPickerDropdown>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Alignment */}
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
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.wrap && 'bg-accent')} onClick={toggleWrap}>
              <WrapText className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Wrap text</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Merge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', state.isMerged && 'bg-accent')} onClick={toggleMerge}>
              <TableCellsMerge className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{state.isMerged ? 'Unmerge cells' : 'Merge cells'}</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Row/col operations */}
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

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Insert chart */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onInsertChart}>
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Insert chart</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        {/* Cell address + formula bar (after delete column) */}
        <span
          className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-center font-mono text-xs text-muted-foreground"
          style={{ minWidth: '2.5rem' }}
        >
          {cellAddress || 'A1'}
        </span>
        <input
          className="w-[340px] shrink-0 rounded border border-border bg-background px-2 py-0.5 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/60"
          value={formulaBarValue}
          onChange={(e) => onFormulaBarChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              onFormulaBarCommit()
            }
            if (e.key === 'Escape') {
              const w = wb(); if (!w) return
              const sel = w.getSelection()
              if (sel?.length) {
                const r = sel[0].row[0] ?? 0
                const c = sel[0].column[0] ?? 0
                const formula = w.getCellValue(r, c, { type: 'f' }) as string | undefined
                const value = w.getCellValue(r, c, { type: 'v' })
                onFormulaBarChange(formula ?? (value != null ? String(value) : ''))
              }
            }
          }}
          placeholder="Value or formula…"
        />
      </div>

      {/* Persistent right section */}
      <ToolbarRightSection fileType="sheet" documentId={documentId} onSettingsOpen={onSettingsOpen} onSheetExport={onSheetExport} />
    </div>
  )
}
