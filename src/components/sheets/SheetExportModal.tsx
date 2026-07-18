import { useState, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type Format = 'xlsx' | 'csv'

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange(v: T): void
}): JSX.Element {
  return (
    <div className="flex rounded-md border border-border overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 px-3 py-1.5 text-xs transition-colors',
            value === o.value
              ? 'bg-primary text-primary-foreground font-medium'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SheetExportModalProps {
  open: boolean
  onClose(): void
  sheetTitle: string
  workbookRef: RefObject<WorkbookInstance | null>
}

export function SheetExportModal({ open, onClose, sheetTitle, workbookRef }: SheetExportModalProps): JSX.Element | null {
  const [format, setFormat] = useState<Format>('xlsx')
  const [baseName, setBaseName] = useState(sheetTitle)
  const [exporting, setExporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setFormat('xlsx')
      setBaseName(sheetTitle)
      setExporting(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport(): Promise<void> {
    const wb = workbookRef.current
    if (!wb) return
    setExporting(true)
    try {
      const sheets = wb.getAllSheets()
      const xlsxWb = XLSX.utils.book_new()

      if (format === 'csv') {
        // Export active sheet only
        const active = sheets.find((s) => s.status === 1) ?? sheets[0]
        if (!active) return
        XLSX.utils.book_append_sheet(xlsxWb, sheetToWorksheet(active), active.name || 'Sheet1')
      } else {
        for (const sheet of sheets) {
          XLSX.utils.book_append_sheet(xlsxWb, sheetToWorksheet(sheet), sheet.name || 'Sheet')
        }
      }

      const base64 = XLSX.write(xlsxWb, { bookType: format, type: 'base64' }) as string
      const filename = `${baseName.trim() || sheetTitle}.${format}`
      await window.prose.slides.saveExportBytes(base64, filename, format)
      onClose()
    } catch (err) {
      console.error('[SheetExportModal] export error:', err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="w-[360px] max-w-[96vw] gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-3.5">
          <DialogTitle className="text-sm font-semibold">
            Export: <span className="font-normal text-muted-foreground">{sheetTitle}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 p-5">

          {/* Format */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Format</span>
            <SegmentedControl<Format>
              value={format}
              onChange={setFormat}
              options={[
                { value: 'xlsx', label: 'Excel (.xlsx)' },
                { value: 'csv',  label: 'CSV' },
              ]}
            />
            {format === 'csv' && (
              <p className="text-[11px] text-muted-foreground">Only the active sheet tab will be exported.</p>
            )}
          </div>

          {/* File name */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">File name</span>
            <div className="flex items-center">
              <Input
                ref={inputRef}
                className="h-8 flex-1 rounded-r-none border-r-0 text-xs focus-visible:z-10"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleExport() }}
              />
              <div className="flex h-8 items-center rounded-r-md border border-border bg-muted px-2.5 text-xs text-muted-foreground select-none">
                .{format}
              </div>
            </div>
          </div>

        </div>

        <div className="border-t border-border px-5 py-4">
          <Button
            className="w-full text-xs"
            onClick={() => void handleExport()}
            disabled={exporting || !baseName.trim()}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Convert a FortuneSheet sheet to a SheetJS worksheet, preserving computed
// values, live formulas, merged cells, and column widths / row heights.
// (Formulas used to be exported as literal text — "=SUM(A1:B2)" showed up in
// Excel as a string instead of a working formula, and CSV files got formula
// source instead of values.)
function sheetToWorksheet(sheet: {
  data?: unknown[][] | null
  config?: {
    merge?: Record<string, { r: number; c: number; rs: number; cs: number }>
    columnlen?: Record<string, number>
    rowlen?: Record<string, number>
  }
}): XLSX.WorkSheet {
  const data = sheet.data ?? []

  // Values first (computed results — what CSV and cached xlsx values need)
  const aoa: unknown[][] = data.map((row) => {
    if (!row) return []
    return row.map((cell) => {
      if (!cell || typeof cell !== 'object') return null
      const c = cell as Record<string, unknown>
      if (c['v'] !== undefined && c['v'] !== null) return c['v']
      if (c['m'] !== undefined && c['m'] !== null) return c['m']
      return null
    })
  })
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Attach formulas as real formulas (SheetJS `f`, without the leading '=') so
  // Excel shows the computed value AND keeps the formula editable.
  for (let r = 0; r < data.length; r++) {
    const row = data[r]
    if (!row) continue
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell || typeof cell !== 'object') continue
      const f = (cell as Record<string, unknown>)['f']
      if (typeof f === 'string' && f) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const existing = ws[addr] as XLSX.CellObject | undefined
        if (existing) existing.f = f.startsWith('=') ? f.slice(1) : f
        else ws[addr] = { t: 's', v: '', f: f.startsWith('=') ? f.slice(1) : f } as XLSX.CellObject
      }
    }
  }

  // Merged cells
  const merge = sheet.config?.merge
  if (merge) {
    ws['!merges'] = Object.values(merge).map((m) => ({
      s: { r: m.r, c: m.c },
      e: { r: m.r + m.rs - 1, c: m.c + m.cs - 1 },
    }))
  }

  // Column widths / row heights (FortuneSheet stores px)
  const columnlen = sheet.config?.columnlen
  if (columnlen && Object.keys(columnlen).length > 0) {
    const cols: XLSX.ColInfo[] = []
    for (const [idx, px] of Object.entries(columnlen)) {
      const i = parseInt(idx, 10)
      if (!isNaN(i) && px > 0) cols[i] = { wpx: px }
    }
    ws['!cols'] = cols
  }
  const rowlen = sheet.config?.rowlen
  if (rowlen && Object.keys(rowlen).length > 0) {
    const rows: XLSX.RowInfo[] = []
    for (const [idx, px] of Object.entries(rowlen)) {
      const i = parseInt(idx, 10)
      if (!isNaN(i) && px > 0) rows[i] = { hpx: px }
    }
    ws['!rows'] = rows
  }

  return ws
}
