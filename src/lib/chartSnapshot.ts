import { Chart } from 'chart.js'
import type { ChartDef, SheetContent } from '@/types/sheet'
import { extractChartData, buildChartConfig, parseRange, sheetTabToCellGrid } from '@/components/sheets/chartUtils'

export interface ChartSnapshot {
  dataUrl: string
  width: number
  height: number
}

// Render at 2x for crisp output in the target editor regardless of zoom.
const SNAPSHOT_SCALE = 2

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

  const config = buildChartConfig(chart, extracted, isDark)
  config.options = {
    ...config.options,
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
    devicePixelRatio: 1,
  }

  const width = Math.max(1, Math.round(chart.width))
  const height = Math.max(1, Math.round(chart.height))
  const canvas = document.createElement('canvas')
  canvas.width = width * SNAPSHOT_SCALE
  canvas.height = height * SNAPSHOT_SCALE

  const instance = new Chart(canvas, config)
  const dataUrl = instance.toBase64Image('image/png', 1)
  instance.destroy()

  return { dataUrl, width, height }
}
