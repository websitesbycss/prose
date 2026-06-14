import { useRef, useEffect, useCallback, useState } from 'react'
import { Chart } from 'chart.js'
import { Pencil, X, GripHorizontal } from 'lucide-react'
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import { useAppStore } from '@/store/appStore'
import type { ChartDef } from '@/types/sheet'
import { parseRange, extractChartData, buildChartConfig } from './chartUtils'

// ── ChartWidget ───────────────────────────────────────────────────────────────

interface ChartWidgetProps {
  chart: ChartDef
  workbookRef: RefObject<WorkbookInstance | null>
  onMove: (chart: ChartDef) => void
  onResize: (chart: ChartDef) => void
  onEdit: (chart: ChartDef) => void
  onDelete: (id: string) => void
}

export function ChartWidget({
  chart,
  workbookRef,
  onMove,
  onResize,
  onEdit,
  onDelete,
}: ChartWidgetProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const isDark = useAppStore((s) => s.theme) === 'dark'
  const [hovered, setHovered] = useState(false)

  // Build / refresh the Chart.js instance whenever relevant props change
  const rebuildChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rng = parseRange(chart.dataRange)
    const sheets = workbookRef.current?.getAllSheets()
    const activeSheet = sheets?.find(s => String(s.id) === chart.sheetId) ?? sheets?.[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetData = activeSheet?.data as any

    const extracted = rng && sheetData
      ? extractChartData(sheetData, rng, chart.type)
      : { labels: [], datasets: [] }

    const config = buildChartConfig(chart, extracted, isDark)

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    chartRef.current = new Chart(canvas, config)
  }, [chart, workbookRef, isDark])

  useEffect(() => {
    rebuildChart()
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [rebuildChart])

  // ── Drag to move ─────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-resize-handle]')) return
    e.preventDefault()
    const startX = e.clientX - chart.x
    const startY = e.clientY - chart.y

    function handleMouseMove(ev: PointerEvent) {
      onMove({ ...chart, x: ev.clientX - startX, y: ev.clientY - startY })
    }
    function handleMouseUp() {
      window.removeEventListener('pointermove', handleMouseMove)
      window.removeEventListener('pointerup', handleMouseUp)
    }
    window.addEventListener('pointermove', handleMouseMove)
    window.addEventListener('pointerup', handleMouseUp)
  }, [chart, onMove])

  // ── Drag to resize (bottom-right corner) ──────────────────────────────────

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startW = chart.width
    const startH = chart.height

    function handleResizeMove(ev: PointerEvent) {
      onResize({
        ...chart,
        width: Math.max(220, startW + (ev.clientX - startX)),
        height: Math.max(160, startH + (ev.clientY - startY)),
      })
    }
    function handleResizeUp() {
      window.removeEventListener('pointermove', handleResizeMove)
      window.removeEventListener('pointerup', handleResizeUp)
    }
    window.addEventListener('pointermove', handleResizeMove)
    window.addEventListener('pointerup', handleResizeUp)
  }, [chart, onResize])

  const titleLabel = chart.title.trim() || (chart.type.charAt(0).toUpperCase() + chart.type.slice(1) + ' chart')

  return (
    <div
      className="group absolute select-none overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      style={{
        left: chart.x,
        top: chart.y,
        width: chart.width,
        height: chart.height,
        zIndex: hovered ? 20 : 10,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle bar */}
      <div
        className="flex h-7 cursor-grab items-center gap-1 border-b border-border/50 bg-muted/40 px-2 active:cursor-grabbing"
        onPointerDown={handleDragStart}
      >
        <GripHorizontal className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className="flex-1 truncate text-[11px] text-muted-foreground">{titleLabel}</span>

        {/* Action buttons — visible on hover */}
        <div
          className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onEdit(chart) }}
            title="Edit chart"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(chart.id) }}
            title="Delete chart"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative" style={{ height: chart.height - 28 }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>

      {/* Resize handle */}
      <div
        data-resize-handle="true"
        className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize opacity-0 transition-opacity group-hover:opacity-60"
        style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--muted-foreground)) 1.5px, transparent 1.5px)', backgroundSize: '4px 4px', backgroundPosition: '1px 1px' }}
        onPointerDown={handleResizeStart}
      />
    </div>
  )
}
