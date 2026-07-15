import { useRef, useEffect, useCallback, useState } from 'react'
import { Chart } from 'chart.js'
import { Pencil, X, GripHorizontal } from 'lucide-react'
import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import { useAppStore } from '@/store/appStore'
import type { ChartDef } from '@/types/sheet'
import {
  parseRange, extractChartData, buildChartConfig,
  SHEET_ROW_HEADER_WIDTH, SHEET_COL_HEADER_HEIGHT, SHEET_SCROLLBAR_THICKNESS,
} from './chartUtils'

// ── ChartWidget ───────────────────────────────────────────────────────────────

const MIN_CHART_WIDTH = 220
const MIN_CHART_HEIGHT = 160

interface ChartWidgetProps {
  chart: ChartDef
  workbookRef: RefObject<WorkbookInstance | null>
  /** The grid's own scrollable wrapper — measured to clamp drag/resize to the
   * actual content viewport (never under the headers or scrollbars). */
  containerRef: RefObject<HTMLDivElement | null>
  onMove: (chart: ChartDef) => void
  onResize: (chart: ChartDef) => void
  onEdit: (chart: ChartDef) => void
  onDelete: (id: string) => void
  scrollX: number
  scrollY: number
  /** Current zoom percentage (10-400) — chart x/y/width/height are stored at
   * the 100% zoom baseline; mouse deltas (real screen pixels) are converted
   * to that baseline so drag/resize track the cursor 1:1 at any zoom. */
  zoom: number
  /** Bumped once FortuneSheet's cell data has actually finished hydrating —
   * forces a rebuild even though none of the chart's own fields changed, so
   * the chart doesn't stay stuck on the blank data it saw the instant it
   * first rendered (before hydration landed). */
  dataReadyTick: number
}

export function ChartWidget({
  chart,
  workbookRef,
  containerRef,
  onMove,
  onResize,
  onEdit,
  onDelete,
  scrollX,
  scrollY,
  zoom,
  dataReadyTick,
}: ChartWidgetProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const isDark = useAppStore((s) => s.theme) === 'dark'
  const [hovered, setHovered] = useState(false)

  // Extract only data-relevant fields so position/size changes don't rebuild the chart
  const {
    id: chartId, sheetId, type: chartType, dataRange, title: chartTitle,
    xAxisLabel, yAxisLabel, showXAxisLabels, showYAxisLabels, showLegend,
    colors, doughnutCutout, straightLines, textScale,
  } = chart
  const colorsKey = colors?.join(',') ?? ''

  // Build / refresh the Chart.js instance only when data-relevant props change
  const rebuildChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rng = parseRange(dataRange)
    const sheets = workbookRef.current?.getAllSheets()
    const activeSheet = sheets?.find(s => String(s.id) === sheetId) ?? sheets?.[0]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheetData = activeSheet?.data as any

    const extracted = rng && sheetData
      ? extractChartData(sheetData, rng, chartType)
      : { labels: [], datasets: [] }

    const mockChart = {
      id: chartId, sheetId, type: chartType, dataRange, title: chartTitle,
      x: 0, y: 0, width: 0, height: 0,
      xAxisLabel, yAxisLabel, showXAxisLabels, showYAxisLabels, showLegend,
      colors, doughnutCutout, straightLines, textScale,
    }
    const config = buildChartConfig(mockChart, extracted, isDark)

    // Defensive: clear any orphaned Chart.js instance on this canvas before creating a new one
    const orphan = Chart.getChart(canvas)
    if (orphan) orphan.destroy()

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    chartRef.current = new Chart(canvas, config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chartId, sheetId, chartType, dataRange, chartTitle, workbookRef, isDark,
    xAxisLabel, yAxisLabel, showXAxisLabels, showYAxisLabels, showLegend,
    colorsKey, doughnutCutout, straightLines, textScale, dataReadyTick,
  ])

  useEffect(() => {
    rebuildChart()
    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [rebuildChart])

  // Keep the latest scroll/zoom readable inside drag/resize listeners without
  // having to tear down and re-add them on every scroll or zoom change.
  const scrollXRef = useRef(scrollX)
  const scrollYRef = useRef(scrollY)
  const zoomRef = useRef(zoom)
  useEffect(() => { scrollXRef.current = scrollX; scrollYRef.current = scrollY; zoomRef.current = zoom })

  // Charts are clamped to the grid's actual scrollable content viewport at
  // the CURRENT scroll position — never draggable/resizable under the
  // row-number column, column-letter row, or either scrollbar strip. Reads
  // only refs, so it's stable across renders without needing to appear in
  // any dependency array.
  const contentBounds = useCallback((): { minX: number; minY: number; maxRight: number; maxBottom: number } | null => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    const zoomFraction = zoomRef.current / 100
    return {
      minX: (scrollXRef.current + SHEET_ROW_HEADER_WIDTH) / zoomFraction,
      minY: (scrollYRef.current + SHEET_COL_HEADER_HEIGHT) / zoomFraction,
      maxRight: (scrollXRef.current + rect.width - SHEET_SCROLLBAR_THICKNESS) / zoomFraction,
      maxBottom: (scrollYRef.current + rect.height - SHEET_SCROLLBAR_THICKNESS) / zoomFraction,
    }
  }, [containerRef])

  // ── Drag to move ─────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-resize-handle]')) return
    e.preventDefault()
    const zoomFraction = zoomRef.current / 100
    const startX = e.clientX - chart.x * zoomFraction
    const startY = e.clientY - chart.y * zoomFraction

    function handleMouseMove(ev: PointerEvent): void {
      const bounds = contentBounds()
      const zf = zoomRef.current / 100
      let x = (ev.clientX - startX) / zf
      let y = (ev.clientY - startY) / zf
      if (bounds) {
        x = Math.min(Math.max(x, bounds.minX), bounds.maxRight - chart.width)
        y = Math.min(Math.max(y, bounds.minY), bounds.maxBottom - chart.height)
      }
      onMove({ ...chart, x, y })
    }
    function handleMouseUp(): void {
      window.removeEventListener('pointermove', handleMouseMove)
      window.removeEventListener('pointerup', handleMouseUp)
    }
    window.addEventListener('pointermove', handleMouseMove)
    window.addEventListener('pointerup', handleMouseUp)
  }, [chart, onMove, contentBounds])

  // ── Drag to resize (bottom-right corner) ──────────────────────────────────

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startW = chart.width
    const startH = chart.height

    function handleResizeMove(ev: PointerEvent): void {
      const bounds = contentBounds()
      const zf = zoomRef.current / 100
      let width = startW + (ev.clientX - startX) / zf
      let height = startH + (ev.clientY - startY) / zf
      width = Math.max(MIN_CHART_WIDTH, width)
      height = Math.max(MIN_CHART_HEIGHT, height)
      if (bounds) {
        width = Math.min(width, bounds.maxRight - chart.x)
        height = Math.min(height, bounds.maxBottom - chart.y)
      }
      onResize({ ...chart, width, height })
    }
    function handleResizeUp(): void {
      window.removeEventListener('pointermove', handleResizeMove)
      window.removeEventListener('pointerup', handleResizeUp)
    }
    window.addEventListener('pointermove', handleResizeMove)
    window.addEventListener('pointerup', handleResizeUp)
  }, [chart, onResize, contentBounds])

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
