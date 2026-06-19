import {
  Chart,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  ScatterController,
  RadarController,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
} from 'chart.js'
import type { ChartConfiguration } from 'chart.js'
import type { ChartType, ChartDef } from '@/types/sheet'

// Register Chart.js components once
Chart.register(
  BarController,
  LineController,
  PieController,
  DoughnutController,
  ScatterController,
  RadarController,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
  Title,
)

// ── Colors ────────────────────────────────────────────────────────────────────

export const CHART_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.75)',  border: 'rgb(99, 102, 241)'  },  // indigo
  { bg: 'rgba(236, 72, 153, 0.75)', border: 'rgb(236, 72, 153)'  },  // pink
  { bg: 'rgba(16, 185, 129, 0.75)', border: 'rgb(16, 185, 129)'  },  // emerald
  { bg: 'rgba(245, 158, 11, 0.75)', border: 'rgb(245, 158, 11)'  },  // amber
  { bg: 'rgba(59, 130, 246, 0.75)', border: 'rgb(59, 130, 246)'  },  // blue
  { bg: 'rgba(239, 68, 68, 0.75)',  border: 'rgb(239, 68, 68)'   },  // red
  { bg: 'rgba(20, 184, 166, 0.75)', border: 'rgb(20, 184, 166)'  },  // teal
  { bg: 'rgba(168, 85, 247, 0.75)', border: 'rgb(168, 85, 247)'  },  // purple
]

// ── Range parsing ─────────────────────────────────────────────────────────────

function colLetterToIndex(col: string): number {
  let n = 0
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellToRC(cell: string): { r: number; c: number } | null {
  const m = cell.trim().match(/^([A-Za-z]+)(\d+)$/)
  if (!m) return null
  return { r: parseInt(m[2]!) - 1, c: colLetterToIndex(m[1]!) }
}

export function parseRange(range: string): { r1: number; c1: number; r2: number; c2: number } | null {
  const parts = range.trim().split(':')
  const a = cellToRC(parts[0]!)
  if (!a) return null
  if (parts.length === 1) return { r1: a.r, c1: a.c, r2: a.r, c2: a.c }
  const b = cellToRC(parts[1]!)
  if (!b) return null
  return {
    r1: Math.min(a.r, b.r),
    c1: Math.min(a.c, b.c),
    r2: Math.max(a.r, b.r),
    c2: Math.max(a.c, b.c),
  }
}

// ── Data extraction from FortuneSheet raw data ────────────────────────────────

type CellLike = { v?: unknown; m?: unknown; f?: string } | null | undefined

function getCellRaw(data: CellLike[][] | undefined, r: number, c: number): string | number | null {
  const cell = data?.[r]?.[c]
  if (!cell) return null
  const val = cell.m ?? cell.v
  if (val === undefined || val === null) return null
  return val as string | number
}

function toNum(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim()
    if (!cleaned) return null
    const n = parseFloat(cleaned)
    return isFinite(n) ? n : null
  }
  return null
}

function isNumericAt(data: CellLike[][] | undefined, r: number, c: number): boolean {
  return toNum(getCellRaw(data, r, c)) !== null
}

export interface ExtractedChartData {
  labels: string[]
  datasets: {
    label: string
    data: (number | null)[] | { x: number; y: number }[]
  }[]
}

export function extractChartData(
  sheetData: CellLike[][] | undefined,
  rng: { r1: number; c1: number; r2: number; c2: number },
  chartType: ChartType,
): ExtractedChartData {
  const { r1, c1, r2, c2 } = rng
  const rows = r2 - r1 + 1
  const cols = c2 - c1 + 1

  if (rows === 0 || cols === 0) return { labels: [], datasets: [] }

  // Detect if first row contains headers (non-numeric in data column positions)
  const hasHeaderRow = cols > 1 && !isNumericAt(sheetData, r1, c1 + 1)
  // Detect if first column contains labels (non-numeric in first data row)
  const dataR1 = r1 + (hasHeaderRow ? 1 : 0)
  const hasLabelCol = rows > 1 && !isNumericAt(sheetData, dataR1, c1)

  const dataRowStart = dataR1
  const dataColStart = c1 + (hasLabelCol ? 1 : 0)

  // Scatter: pairs of numeric columns interpreted as (x, y)
  if (chartType === 'scatter') {
    const datasets: { label: string; data: { x: number; y: number }[] }[] = []
    for (let ci = dataColStart; ci <= c2 - 1; ci += 2) {
      const label = hasHeaderRow
        ? String(getCellRaw(sheetData, r1, ci) ?? `Series ${Math.floor((ci - dataColStart) / 2) + 1}`)
        : `Series ${Math.floor((ci - dataColStart) / 2) + 1}`
      const points: { x: number; y: number }[] = []
      for (let ri = dataRowStart; ri <= r2; ri++) {
        const x = toNum(getCellRaw(sheetData, ri, ci))
        const y = toNum(getCellRaw(sheetData, ri, ci + 1))
        if (x !== null && y !== null) points.push({ x, y })
      }
      datasets.push({ label, data: points })
    }
    return { labels: [], datasets }
  }

  // Axis labels from label column (or sequential numbers)
  const labels: string[] = []
  for (let ri = dataRowStart; ri <= r2; ri++) {
    labels.push(
      hasLabelCol
        ? String(getCellRaw(sheetData, ri, c1) ?? `${ri - dataRowStart + 1}`)
        : String(ri - dataRowStart + 1),
    )
  }

  // Datasets from data columns
  const datasets: { label: string; data: (number | null)[] }[] = []
  for (let ci = dataColStart; ci <= c2; ci++) {
    const seriesLabel = hasHeaderRow
      ? String(getCellRaw(sheetData, r1, ci) ?? `Series ${ci - dataColStart + 1}`)
      : `Series ${ci - dataColStart + 1}`
    const data: (number | null)[] = []
    for (let ri = dataRowStart; ri <= r2; ri++) {
      data.push(toNum(getCellRaw(sheetData, ri, ci)))
    }
    datasets.push({ label: seriesLabel, data })
  }

  return { labels, datasets }
}

// ── Chart.js config builder ───────────────────────────────────────────────────

export function buildChartConfig(
  chart: ChartDef,
  extracted: ExtractedChartData,
  isDark: boolean,
): ChartConfiguration {
  const textColor = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.75)'
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
  const { labels, datasets } = extracted
  const type = chart.type
  const isPie = type === 'pie' || type === 'doughnut'
  const isRadar = type === 'radar'
  const titleText = chart.title.trim() || undefined

  const commonPlugins = {
    title: titleText
      ? { display: true, text: titleText, color: textColor, font: { size: 13, weight: 'normal' as const } }
      : { display: false },
    legend: {
      display: datasets.length > 0,
      position: 'bottom' as const,
      labels: { color: textColor, boxWidth: 12, padding: 10, font: { size: 11 } },
    },
    tooltip: { enabled: true },
  }

  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 250 } as const,
    plugins: commonPlugins,
  }

  if (isPie) {
    const pieDatasets = datasets.map((ds) => {
      const count = (ds.data as (number | null)[]).length
      return {
        label: ds.label,
        data: ds.data as (number | null)[],
        backgroundColor: Array.from({ length: count }, (_, i) => CHART_COLORS[i % CHART_COLORS.length]!.bg),
        borderColor: Array.from({ length: count }, (_, i) => CHART_COLORS[i % CHART_COLORS.length]!.border),
        borderWidth: 1.5,
      }
    })
    return {
      type: type === 'doughnut' ? 'doughnut' : 'pie',
      data: { labels, datasets: pieDatasets },
      options: { ...commonOptions },
    } as ChartConfiguration
  }

  if (isRadar) {
    const radarDatasets = datasets.map((ds, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length]!
      return {
        label: ds.label,
        data: ds.data as (number | null)[],
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 2,
        pointRadius: 3,
      }
    })
    return {
      type: 'radar',
      data: { labels, datasets: radarDatasets },
      options: {
        ...commonOptions,
        scales: {
          r: {
            ticks: { color: textColor, backdropColor: 'transparent', font: { size: 10 } },
            grid: { color: gridColor },
            pointLabels: { color: textColor, font: { size: 11 } },
            angleLines: { color: gridColor },
          },
        },
      },
    } as ChartConfiguration
  }

  if (type === 'scatter') {
    const scatterDatasets = datasets.map((ds, i) => {
      const color = CHART_COLORS[i % CHART_COLORS.length]!
      return {
        label: ds.label,
        data: ds.data as { x: number; y: number }[],
        backgroundColor: color.bg,
        borderColor: color.border,
        borderWidth: 1.5,
        pointRadius: 5,
      }
    })
    return {
      type: 'scatter',
      data: { datasets: scatterDatasets },
      options: {
        ...commonOptions,
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor }, beginAtZero: false },
        },
      },
    } as ChartConfiguration
  }

  // Bar, horizontal bar, line, area
  const isHorizontal = type === 'barHorizontal'
  const isLine = type === 'line' || type === 'area'
  const isArea = type === 'area'

  const linearDatasets = datasets.map((ds, i) => {
    const color = CHART_COLORS[i % CHART_COLORS.length]!
    if (isLine) {
      return {
        label: ds.label,
        data: ds.data as (number | null)[],
        backgroundColor: isArea ? color.bg : color.border,
        borderColor: color.border,
        borderWidth: 2,
        fill: isArea,
        tension: 0.35,
        pointRadius: 3,
        pointHoverRadius: 5,
      }
    }
    return {
      label: ds.label,
      data: ds.data as (number | null)[],
      backgroundColor: color.bg,
      borderColor: color.border,
      borderWidth: 1.5,
      borderRadius: 3,
    }
  })

  return {
    type: 'bar',
    data: { labels, datasets: linearDatasets },
    options: {
      ...commonOptions,
      indexAxis: isHorizontal ? 'y' : 'x',
      scales: {
        x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
        y: {
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
          beginAtZero: !isHorizontal,
          stacked: false,
        },
      },
    },
  } as ChartConfiguration
}
