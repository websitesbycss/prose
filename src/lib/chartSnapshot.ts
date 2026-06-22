import { Chart } from 'chart.js'
import type { ChartDef, SheetContent } from '@/types/sheet'
import { extractChartData, buildChartConfig, parseRange, sheetTabToCellGrid } from '@/components/sheets/chartUtils'

export interface ChartSnapshot {
  dataUrl: string
  width: number
  height: number
}

// Backing-store multiplier for crisp output regardless of target zoom — handled
// via Chart.js's own devicePixelRatio option below, NOT by pre-scaling the canvas
// (doing the latter would make Chart.js lay out fonts/legend against the doubled
// canvas size, shrinking text relative to the chart once displayed back down).
const SNAPSHOT_SCALE = 2

// Inserted charts are viewed at arm's length in a Document/Slide/Board rather than
// in the tight Sheets widget, so render their text noticeably larger than the
// in-sheet default.
const SNAPSHOT_FONT_SCALE = 1.25

/**
 * Renders a chart to a static PNG data URL. Used when inserting a Sheets chart
 * into a Document, Slide, or Board — the result is a frozen snapshot that does
 * not live-update if the source sheet later changes.
 */
export function renderChartSnapshot(chart: ChartDef, sheetContent: SheetContent, isDark: boolean): ChartSnapshot {
  const tab = sheetContent.tabs.find((t) => t.id === chart.sheetId)
  const grid = tab ? sheetTabToCellGrid(tab) : []
  const rng = parseRange(chart.dataRange)
  const extracted = rng ? extractChartData(grid, rng, chart.type) : { labels: [], datasets: [] }

  const config = buildChartConfig(chart, extracted, isDark, SNAPSHOT_FONT_SCALE)
  config.options = {
    ...config.options,
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
    devicePixelRatio: SNAPSHOT_SCALE,
  }

  const width = Math.max(1, Math.round(chart.width))
  const height = Math.max(1, Math.round(chart.height))
  // Logical canvas size — Chart.js's retinaScale() multiplies this by
  // devicePixelRatio internally to size the actual backing store, while keeping
  // all layout/font-size math computed against the logical (width, height).
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const instance = new Chart(canvas, config)
  const dataUrl = instance.toBase64Image('image/png', 1)
  instance.destroy()

  return { dataUrl, width, height }
}
