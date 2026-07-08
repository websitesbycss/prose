import { Chart } from 'chart.js'
import type { ChartDef, ChartType, SheetContent } from '@/types/sheet'
import { extractChartData, buildChartConfig, parseRange, sheetTabToCellGrid, type ExtractedChartData } from '@/components/sheets/chartUtils'

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

/**
 * Renders a chart to a static PNG data URL. Used when inserting a Sheets chart
 * into a Document, Slide, or Board — the result is a frozen snapshot that does
 * not live-update if the source sheet later changes. Text size matches the
 * chart's own textScale (same default/override used in the Sheets widget).
 */
export function renderChartSnapshot(chart: ChartDef, sheetContent: SheetContent, isDark: boolean): ChartSnapshot {
  const tab = sheetContent.tabs.find((t) => t.id === chart.sheetId)
  const grid = tab ? sheetTabToCellGrid(tab) : []
  const rng = parseRange(chart.dataRange)
  const extracted = rng ? extractChartData(grid, rng, chart.type) : { labels: [], datasets: [] }

  const config = buildChartConfig(chart, extracted, isDark)
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

export interface AdHocChartSpec {
  chartType: ChartType
  title?: string
  labels: string[]
  datasets: { label: string; data: (number | null)[] }[]
  xAxisLabel?: string
  yAxisLabel?: string
}

/**
 * Renders a chart snapshot from literal data (no source sheet) — used when the
 * AI authors a chart directly (e.g. from numbers in a chat message or restated
 * from a document/spreadsheet source) rather than referencing an existing
 * Sheets chart. Shares `buildChartConfig` with `renderChartSnapshot` and the
 * live Sheets chart widget, so styling/behavior stays identical; this just
 * skips the sheet-range extraction step since the data is already shaped.
 */
export function renderAdHocChartSnapshot(spec: AdHocChartSpec, isDark: boolean): ChartSnapshot {
  const width = 640
  const height = 400
  const mockChart: ChartDef = {
    id: 'ad-hoc', sheetId: '', type: spec.chartType, dataRange: '', title: spec.title ?? '',
    x: 0, y: 0, width, height,
    xAxisLabel: spec.xAxisLabel, yAxisLabel: spec.yAxisLabel,
  }
  const extracted: ExtractedChartData = { labels: spec.labels, datasets: spec.datasets }
  const config = buildChartConfig(mockChart, extracted, isDark)
  config.options = {
    ...config.options,
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
    devicePixelRatio: SNAPSHOT_SCALE,
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const instance = new Chart(canvas, config)
  const dataUrl = instance.toBase64Image('image/png', 1)
  instance.destroy()

  return { dataUrl, width, height }
}
