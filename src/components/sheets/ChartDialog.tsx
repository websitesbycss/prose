import { useState, useRef, useEffect, useCallback } from 'react'
import { Chart } from 'chart.js'
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { ChartType, ChartDef } from '@/types/sheet'
import { parseRange, extractChartData, buildChartConfig } from './chartUtils'

// ── Chart type definitions ────────────────────────────────────────────────────

interface ChartTypeDef {
  id: ChartType
  label: string
  icon: JSX.Element
}

function BarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <rect x="4"  y="18" width="6" height="10" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="13" y="10" width="6" height="18" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="22" y="14" width="6" height="14" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="31" y="4"  width="6" height="24" fill="currentColor" opacity="0.85" rx="1" />
      <line x1="2" y1="28" x2="38" y2="28" stroke="currentColor" opacity="0.3" strokeWidth="1.2" />
    </svg>
  )
}

function HBarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <rect x="4" y="3"  width="10" height="5" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="4" y="11" width="22" height="5" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="4" y="19" width="16" height="5" fill="currentColor" opacity="0.85" rx="1" />
      <rect x="4" y="27" width="28" height="5" fill="currentColor" opacity="0.85" rx="1" />
      <line x1="4" y1="2" x2="4" y2="32" stroke="currentColor" opacity="0.3" strokeWidth="1.2" />
    </svg>
  )
}

function LineIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <polyline points="4,24 12,16 20,20 28,8 36,12" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.85" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="4"  cy="24" r="2" fill="currentColor" opacity="0.85" />
      <circle cx="12" cy="16" r="2" fill="currentColor" opacity="0.85" />
      <circle cx="20" cy="20" r="2" fill="currentColor" opacity="0.85" />
      <circle cx="28" cy="8"  r="2" fill="currentColor" opacity="0.85" />
      <circle cx="36" cy="12" r="2" fill="currentColor" opacity="0.85" />
    </svg>
  )
}

function AreaIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <polygon points="4,28 4,20 12,14 20,18 28,6 36,10 36,28" fill="currentColor" opacity="0.3" />
      <polyline points="4,20 12,14 20,18 28,6 36,10" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.85" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PieIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <circle cx="20" cy="16" r="13" fill="currentColor" opacity="0.15" />
      <path d="M20 16 L20 3 A13 13 0 0 1 33 16 Z" fill="currentColor" opacity="0.85" />
      <path d="M20 16 L33 16 A13 13 0 0 1 9 24 Z" fill="currentColor" opacity="0.55" />
      <path d="M20 16 L9 24 A13 13 0 0 1 20 3 Z" fill="currentColor" opacity="0.35" />
    </svg>
  )
}

function DoughnutIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <path d="M20 16 L20 3 A13 13 0 0 1 33 16 Z" fill="currentColor" opacity="0.85" />
      <path d="M20 16 L33 16 A13 13 0 0 1 9 24 Z" fill="currentColor" opacity="0.55" />
      <path d="M20 16 L9 24 A13 13 0 0 1 20 3 Z" fill="currentColor" opacity="0.35" />
      <circle cx="20" cy="16" r="6" fill="hsl(var(--background))" />
    </svg>
  )
}

function ScatterIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      {[
        [7, 24], [12, 10], [16, 20], [22, 6], [26, 18],
        [30, 12], [35, 22], [10, 16], [28, 26],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.5" fill="currentColor" opacity="0.8" />
      ))}
    </svg>
  )
}

function RadarIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 40 32" width="40" height="32" fill="none">
      <polygon points="20,3 36,22 28,31 12,31 4,22" stroke="currentColor" strokeWidth="1" fill="currentColor" opacity="0.08" />
      <polygon points="20,8 30,21 24,27 16,27 10,21" stroke="currentColor" strokeWidth="1.5" fill="currentColor" opacity="0.25" />
      <line x1="20" y1="3" x2="20" y2="16" stroke="currentColor" opacity="0.2" strokeWidth="1" />
      <line x1="36" y1="22" x2="20" y2="16" stroke="currentColor" opacity="0.2" strokeWidth="1" />
      <line x1="28" y1="31" x2="20" y2="16" stroke="currentColor" opacity="0.2" strokeWidth="1" />
      <line x1="12" y1="31" x2="20" y2="16" stroke="currentColor" opacity="0.2" strokeWidth="1" />
      <line x1="4"  y1="22" x2="20" y2="16" stroke="currentColor" opacity="0.2" strokeWidth="1" />
    </svg>
  )
}

const CHART_TYPES: ChartTypeDef[] = [
  { id: 'bar',           label: 'Bar',              icon: <BarIcon /> },
  { id: 'barHorizontal', label: 'Horizontal Bar',   icon: <HBarIcon /> },
  { id: 'line',          label: 'Line',             icon: <LineIcon /> },
  { id: 'area',          label: 'Area',             icon: <AreaIcon /> },
  { id: 'pie',           label: 'Pie',              icon: <PieIcon /> },
  { id: 'doughnut',      label: 'Doughnut',         icon: <DoughnutIcon /> },
  { id: 'scatter',       label: 'Scatter',          icon: <ScatterIcon /> },
  { id: 'radar',         label: 'Radar',            icon: <RadarIcon /> },
]

// ── Preview canvas ────────────────────────────────────────────────────────────

function ChartPreview({
  chartType,
  dataRange,
  title,
  workbookRef,
  activeSheetId,
}: {
  chartType: ChartType
  dataRange: string
  title: string
  workbookRef: RefObject<WorkbookInstance | null>
  activeSheetId: string
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const isDark = useAppStore((s) => s.theme) === 'dark'

  const rebuild = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rng = parseRange(dataRange)
    const sheets = workbookRef.current?.getAllSheets()
    const activeSheet = sheets?.find(s => String(s.id) === activeSheetId) ?? sheets?.[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetData = activeSheet?.data as any

    const mockChart: ChartDef = {
      id: 'preview',
      sheetId: activeSheetId,
      type: chartType,
      dataRange,
      title,
      x: 0, y: 0, width: 0, height: 0,
    }

    const extracted = rng && sheetData
      ? extractChartData(sheetData, rng, chartType)
      : { labels: ['A', 'B', 'C', 'D'], datasets: [{ label: 'Series 1', data: [4, 7, 3, 9] }] }

    const config = buildChartConfig(mockChart, extracted, isDark)

    // Defensive: clear any orphaned Chart.js instance on this canvas
    const orphan = Chart.getChart(canvas)
    if (orphan) orphan.destroy()

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    chartRef.current = new Chart(canvas, config)

    // Force a resize on the next frame so Chart.js measures the settled layout
    requestAnimationFrame(() => { chartRef.current?.resize() })
  }, [chartType, dataRange, title, workbookRef, activeSheetId, isDark])

  useEffect(() => {
    const timer = setTimeout(rebuild, 150)
    return () => {
      clearTimeout(timer)
    }
  }, [rebuild])

  useEffect(() => {
    return () => {
      chartRef.current?.destroy()
    }
  }, [])

  return (
    <div className="relative flex-1 min-h-0 rounded-lg border border-border bg-muted/30" style={{ minHeight: 280 }}>
      <div className="absolute inset-0 p-2">
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
      </div>
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface ChartDialogProps {
  open: boolean
  onClose: () => void
  workbookRef: RefObject<WorkbookInstance | null>
  activeSheetId: string
  initialRange?: string
  editChart?: ChartDef
  onInsert: (chart: Omit<ChartDef, 'id' | 'x' | 'y' | 'width' | 'height'>) => void
  onUpdate?: (chart: ChartDef) => void
}

export function ChartDialog({
  open,
  onClose,
  workbookRef,
  activeSheetId,
  initialRange = '',
  editChart,
  onInsert,
  onUpdate,
}: ChartDialogProps): JSX.Element {
  const [chartType, setChartType] = useState<ChartType>(editChart?.type ?? 'bar')
  const [dataRange, setDataRange] = useState(editChart?.dataRange ?? initialRange)
  const [title, setTitle] = useState(editChart?.title ?? '')

  useEffect(() => {
    if (open) {
      setChartType(editChart?.type ?? 'bar')
      setDataRange(editChart?.dataRange ?? initialRange)
      setTitle(editChart?.title ?? '')
    }
  }, [open, editChart, initialRange])

  const isEditing = !!editChart

  function handleSubmit() {
    const payload = {
      sheetId: activeSheetId,
      type: chartType,
      dataRange: dataRange.trim() || 'A1:B10',
      title: title.trim(),
    }
    if (isEditing && onUpdate && editChart) {
      onUpdate({ ...editChart, ...payload })
    } else {
      onInsert(payload)
    }
    onClose()
  }

  const rangeValid = !dataRange.trim() || !!parseRange(dataRange.trim())

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            {isEditing ? 'Edit chart' : 'Insert chart'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0" style={{ height: 460 }}>
          {/* Left: chart type list */}
          <div className="w-44 shrink-0 border-r border-border overflow-y-auto py-1.5">
            {CHART_TYPES.map((ct) => (
              <button
                key={ct.id}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                  chartType === ct.id && 'bg-accent/70 text-foreground font-medium',
                  chartType !== ct.id && 'text-muted-foreground',
                )}
                onClick={() => setChartType(ct.id)}
              >
                <span className={cn(
                  'shrink-0 text-foreground/70',
                  chartType === ct.id && 'text-primary',
                )}>
                  {ct.icon}
                </span>
                <span className="truncate">{ct.label}</span>
              </button>
            ))}
          </div>

          {/* Right: config + preview */}
          <div className="flex flex-1 min-w-0 flex-col gap-3 p-4">
            {/* Config fields */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs mb-1.5 text-muted-foreground">Data range</p>
                <Input
                  className={cn(
                    'h-7 font-mono text-xs',
                    !rangeValid && dataRange.trim() && 'border-destructive focus-visible:ring-destructive/40',
                  )}
                  value={dataRange}
                  onChange={(e) => setDataRange(e.target.value)}
                  placeholder="A1:C10"
                />
                {!rangeValid && dataRange.trim() && (
                  <p className="mt-1 text-[11px] text-destructive">Invalid range format (use e.g. A1:C10)</p>
                )}
              </div>
              <div className="w-48 shrink-0">
                <p className="text-xs mb-1.5 text-muted-foreground">Chart title (optional)</p>
                <Input
                  className="h-7 text-xs"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled chart"
                />
              </div>
            </div>

            {/* Live preview */}
            <ChartPreview
              chartType={chartType}
              dataRange={dataRange}
              title={title}
              workbookRef={workbookRef}
              activeSheetId={activeSheetId}
            />
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSubmit}>
            {isEditing ? 'Update chart' : 'Insert chart'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
