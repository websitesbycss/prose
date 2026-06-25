import {
  Bold, Italic, Underline, AlignLeft, AlignCenter, AlignRight,
  ArrowUpToLine, ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, Minus,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { ColorPickerDropdown, BorderWeightPicker, BorderColorIcon } from './ToolbarShared'
import type { TableElement, TableCellStyle } from '@/types/slides'

interface Props {
  element: TableElement
  selectedCells: string[]
  onUpdateElement(partial: Partial<TableElement>): void
}

const CELL_PALETTE = [
  '#ffffff', '#f3f4f6', '#e5e7eb', '#d1d5db',
  '#fef2f2', '#fef9c3', '#f0fdf4', '#eff6ff',
  '#fee2e2', '#fef08a', '#bbf7d0', '#bfdbfe',
  '#3b82f6', '#22c55e', '#ef4444', '#000000',
]

const BORDER_PALETTE = [
  '#000000', '#374151', '#6b7280', '#9ca3af',
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
]

export function TableEditToolbar({ element, selectedCells, onUpdateElement }: Props): JSX.Element {
  // Get first selected cell for reading current style
  const flatCells = element.rows.flat()
  const selectedCellObjs = flatCells.filter((c) => selectedCells.includes(c.id))
  const cellStyle: TableCellStyle = selectedCellObjs[0]?.style ?? {}

  const selectedRowIdx = element.rows.findIndex((row) => row.some((c) => selectedCells.includes(c.id)))
  const selectedColIdx = selectedRowIdx >= 0
    ? element.rows[selectedRowIdx].findIndex((c) => selectedCells.includes(c.id))
    : -1

  function formatCells(style: Partial<TableCellStyle>): void {
    const newRows = element.rows.map((row) =>
      row.map((cell) =>
        selectedCells.includes(cell.id)
          ? { ...cell, style: { ...cell.style, ...style } }
          : cell,
      ),
    )
    onUpdateElement({ rows: newRows })
  }

  function makeCellRow(cols: number): import('@/types/slides').TableCell[] {
    return Array.from({ length: cols }, () => ({ id: crypto.randomUUID(), content: '' }))
  }

  function insertRowAbove(): void {
    if (selectedRowIdx < 0) return
    const newRows = [
      ...element.rows.slice(0, selectedRowIdx),
      makeCellRow(element.colWidths.length),
      ...element.rows.slice(selectedRowIdx),
    ]
    onUpdateElement({ rows: newRows })
  }

  function insertRowBelow(): void {
    if (selectedRowIdx < 0) return
    const insertAt = selectedRowIdx + 1
    const newRows = [
      ...element.rows.slice(0, insertAt),
      makeCellRow(element.colWidths.length),
      ...element.rows.slice(insertAt),
    ]
    onUpdateElement({ rows: newRows })
  }

  function deleteRow(): void {
    if (selectedRowIdx < 0 || element.rows.length <= 1) return
    onUpdateElement({ rows: element.rows.filter((_, i) => i !== selectedRowIdx) })
  }

  function insertColLeft(): void {
    if (selectedColIdx < 0) return
    const newRows = element.rows.map((row) => [
      ...row.slice(0, selectedColIdx),
      { id: crypto.randomUUID(), content: '' },
      ...row.slice(selectedColIdx),
    ])
    const inserted = 100 / (element.colWidths.length + 1)
    const existing = element.colWidths.map((w) => w * element.colWidths.length / (element.colWidths.length + 1))
    const newColWidths = [
      ...existing.slice(0, selectedColIdx),
      inserted,
      ...existing.slice(selectedColIdx),
    ]
    onUpdateElement({ rows: newRows, colWidths: newColWidths })
  }

  function insertColRight(): void {
    if (selectedColIdx < 0) return
    const insertAt = selectedColIdx + 1
    const newRows = element.rows.map((row) => [
      ...row.slice(0, insertAt),
      { id: crypto.randomUUID(), content: '' },
      ...row.slice(insertAt),
    ])
    const inserted = 100 / (element.colWidths.length + 1)
    const existing = element.colWidths.map((w) => w * element.colWidths.length / (element.colWidths.length + 1))
    const newColWidths = [
      ...existing.slice(0, insertAt),
      inserted,
      ...existing.slice(insertAt),
    ]
    onUpdateElement({ rows: newRows, colWidths: newColWidths })
  }

  function deleteCol(): void {
    if (selectedColIdx < 0 || element.colWidths.length <= 1) return
    const newRows = element.rows.map((row) => row.filter((_, ci) => ci !== selectedColIdx))
    const remaining = element.colWidths.filter((_, ci) => ci !== selectedColIdx)
    const total = remaining.reduce((a, b) => a + b, 0)
    onUpdateElement({ rows: newRows, colWidths: total > 0 ? remaining.map((w) => (w / total) * 100) : remaining })
  }

  const hasSel = selectedCells.length > 0
  const borderW = cellStyle.border?.width ?? 0
  const borderColor = cellStyle.border?.color ?? '#000000'
  const borderLineStyle = cellStyle.border?.style ?? 'solid'
  const fillColor = cellStyle.backgroundColor ?? 'transparent'

  return (
    <div className="flex items-center gap-0.5">
      {/* Text formatting */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.bold ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ bold: !cellStyle.bold })}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Bold</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.italic ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ italic: !cellStyle.italic })}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Italic</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.underline ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ underline: !cellStyle.underline })}>
            <Underline className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Underline</TooltipContent>
      </Tooltip>

      {/* Text color */}
      <ColorPickerDropdown
        tooltip="Text color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1" disabled={!hasSel}>
            <span className="text-[15px] font-normal leading-[14px] w-4 text-center" style={{ fontFamily: 'serif' }}>A</span>
            <span className="mt-[5px] h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600" style={{ backgroundColor: cellStyle.color ?? '#1a1a1a', borderColor: cellStyle.color ?? '#1a1a1a' }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={cellStyle.color ?? '#1a1a1a'}
            current={cellStyle.color ?? ''}
            palette={BORDER_PALETTE}
            onChange={(c) => formatCells({ color: c })}
            onPaletteSelect={(c) => { formatCells({ color: c }); close() }}
            onReset={() => { formatCells({ color: undefined }); close() }}
            resetLabel="Default color"
          />
        )}
      </ColorPickerDropdown>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Alignment */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.align === 'left' || !cellStyle.align ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ align: 'left' })}>
            <AlignLeft className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Align left</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.align === 'center' ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ align: 'center' })}>
            <AlignCenter className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Align center</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={`h-7 w-7 ${cellStyle.align === 'right' ? '!text-primary' : ''}`}
            disabled={!hasSel} onClick={() => formatCells({ align: 'right' })}>
            <AlignRight className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Align right</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Cell fill color */}
      <ColorPickerDropdown
        tooltip="Cell fill color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1" disabled={!hasSel}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M20 14c-.092 1.853-1.486 4.785-3.315 6.585C15.743 21.517 14.881 22 14 22s-1.743-.483-2.685-1.415C9.486 18.785 8.092 15.853 8 14c0-3.314 2.686-6 6-6s6 2.686 6 6zM16.243 5.757l-1.414-1.414-9.9 9.9 1.415 1.414zm-4.484-2.828L4.222 10.465l1.414 1.414 7.536-7.536z"/>
            </svg>
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
              style={{ backgroundColor: fillColor === 'transparent' ? undefined : fillColor, borderColor: fillColor !== 'transparent' ? fillColor : undefined }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={fillColor === 'transparent' ? '#ffffff' : fillColor}
            current={fillColor === 'transparent' ? '' : fillColor}
            palette={CELL_PALETTE}
            onChange={(c) => formatCells({ backgroundColor: c })}
            onPaletteSelect={(c) => { formatCells({ backgroundColor: c }); close() }}
            onReset={() => { formatCells({ backgroundColor: undefined }); close() }}
            resetLabel="No fill"
          />
        )}
      </ColorPickerDropdown>

      {/* Cell border color */}
      <ColorPickerDropdown
        tooltip="Cell border color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1" disabled={!hasSel}>
            <BorderColorIcon className="leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
              style={{ backgroundColor: borderW > 0 ? borderColor : 'transparent', borderColor: borderW > 0 ? borderColor : undefined }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={borderColor}
            current={borderW > 0 ? borderColor : ''}
            palette={BORDER_PALETTE}
            onChange={(c) => formatCells({ border: { color: c, width: borderW || 1, style: borderLineStyle } })}
            onPaletteSelect={(c) => { formatCells({ border: { color: c, width: borderW || 1, style: borderLineStyle } }); close() }}
            onReset={() => { formatCells({ border: undefined }); close() }}
            resetLabel="Remove border"
          />
        )}
      </ColorPickerDropdown>

      {/* Cell border weight */}
      <BorderWeightPicker
        currentWidth={borderW}
        onApply={(w) => formatCells({
          border: w === undefined ? undefined : { color: borderColor, width: w, style: borderLineStyle },
        })}
      />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Row/col operations */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedRowIdx < 0} onClick={insertRowAbove}>
            <ArrowUpToLine className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert row above</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedRowIdx < 0} onClick={insertRowBelow}>
            <ArrowDownToLine className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert row below</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedColIdx < 0} onClick={insertColLeft}>
            <ArrowLeftToLine className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert column left</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={selectedColIdx < 0} onClick={insertColRight}>
            <ArrowRightToLine className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert column right</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" disabled={selectedRowIdx < 0 || element.rows.length <= 1} onClick={deleteRow}>
            <Minus className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Delete row</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive/70 hover:text-destructive" disabled={selectedColIdx < 0 || element.colWidths.length <= 1} onClick={deleteCol}>
            <Minus className="h-3.5 w-3.5 rotate-90" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Delete column</TooltipContent>
      </Tooltip>
    </div>
  )
}
