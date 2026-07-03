// Sheets "Insights" tab — one click analyzes the sheet with the local model
// and returns a plain-English summary, key statistics (with optional live
// formulas placed into empty cells), and chart recommendations the user can
// insert directly. The model's JSON is fully re-validated here before any of
// it can reach the workbook.
import { useState, useCallback } from 'react'
import { Loader2, Lightbulb, BarChart3, Sigma, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { ChartType } from '@/types/sheet'
import { parseCellRef, parseCellRange, SHEET_CHART_TYPES } from '@/lib/ai/proseActions'
import type { CellRef } from '@/lib/ai/proseActions'

interface InsightStat {
  label: string
  value: string
  formula?: string
  cell?: CellRef
  cellA1?: string
}

interface InsightChart {
  chartType: ChartType
  dataRange: string
  title: string
  reason: string
}

interface Insights {
  summary: string
  stats: InsightStat[]
  charts: InsightChart[]
}

interface Props {
  getSheetContext(): string
  onInsertFormula(cell: CellRef, formula: string): void
  onInsertChart(chart: { type: ChartType; dataRange: string; title: string }): void
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/m, '').trim()
  try { return JSON.parse(trimmed) } catch { /* fall through */ }
  const first = trimmed.indexOf('{')
  const last = trimmed.lastIndexOf('}')
  if (first !== -1 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)) } catch { /* fall through */ }
  }
  return null
}

function validateInsights(data: unknown): Insights | null {
  if (!data || typeof data !== 'object') return null
  const obj = data as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 1000) : ''

  const stats: InsightStat[] = []
  if (Array.isArray(obj.stats)) {
    for (const raw of obj.stats.slice(0, 6)) {
      if (!raw || typeof raw !== 'object') continue
      const s = raw as Record<string, unknown>
      const label = typeof s.label === 'string' ? s.label.trim().slice(0, 80) : ''
      const value = typeof s.value === 'string' || typeof s.value === 'number' ? String(s.value).slice(0, 60) : ''
      if (!label || !value) continue
      const formula = typeof s.formula === 'string' && s.formula.startsWith('=') && s.formula.length <= 300
        // eslint-disable-next-line no-control-regex
        && !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s.formula)
        ? s.formula : undefined
      const cell = formula ? parseCellRef(s.cell) : null
      stats.push({
        label, value,
        ...(formula && cell ? { formula, cell, cellA1: typeof s.cell === 'string' ? s.cell : undefined } : {}),
      })
    }
  }

  const charts: InsightChart[] = []
  if (Array.isArray(obj.charts)) {
    for (const raw of obj.charts.slice(0, 4)) {
      if (!raw || typeof raw !== 'object') continue
      const c = raw as Record<string, unknown>
      const chartType = typeof c.chartType === 'string' && (SHEET_CHART_TYPES as readonly string[]).includes(c.chartType)
        ? (c.chartType as ChartType) : null
      const dataRange = typeof c.dataRange === 'string' && parseCellRange(c.dataRange) ? c.dataRange.trim() : null
      if (!chartType || !dataRange) continue
      charts.push({
        chartType,
        dataRange,
        title: typeof c.title === 'string' ? c.title.slice(0, 120) : '',
        reason: typeof c.reason === 'string' ? c.reason.slice(0, 200) : '',
      })
    }
  }

  if (!summary && stats.length === 0 && charts.length === 0) return null
  return { summary, stats, charts }
}

export function SheetInsightsTab({ getSheetContext, onInsertFormula, onInsertChart }: Props): JSX.Element {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const [loading, setLoading] = useState(false)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inserted, setInserted] = useState<Record<string, boolean>>({})

  const unavailable = ollamaStatus === 'unavailable'

  const analyze = useCallback(async (): Promise<void> => {
    if (ollamaStatus !== 'ready') return
    setLoading(true)
    setError(null)
    setInserted({})
    try {
      const resp = await window.prose.ai.prompt({
        documentContent: getSheetContext(),
        request: 'Analyze this sheet data and respond with ONLY the JSON insights object.',
        fileType: 'sheet-insights',
      })
      const validated = validateInsights(extractJsonObject(resp))
      if (!validated) {
        setError('The model returned an unreadable analysis — try again.')
      } else {
        setInsights(validated)
      }
    } catch {
      setError('Analysis failed. Is Ollama running?')
    } finally {
      setLoading(false)
    }
  }, [ollamaStatus, getSheetContext])

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3 pb-3">
        <Button
          className="w-full gap-2 h-8 text-xs"
          disabled={unavailable || ollamaStatus === 'loading' || loading}
          onClick={() => void analyze()}
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analyzing…
            </>
          ) : (
            <>
              <Lightbulb className="h-3.5 w-3.5" />
              Analyze sheet
            </>
          )}
        </Button>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {!insights && !loading && !error && (
          <div className="pt-6 text-center">
            <Lightbulb className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              Analyze your sheet to get a summary, key statistics, and chart recommendations you can insert with one click.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>
        )}

        {unavailable && (
          <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Ollama is not running. Install it to enable AI insights.
          </p>
        )}

        {insights && (
          <>
            {insights.summary && (
              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <p className="text-xs leading-relaxed text-foreground">{insights.summary}</p>
              </div>
            )}

            {insights.stats.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Sigma className="h-3 w-3" /> Key stats
                </p>
                <div className="space-y-1.5">
                  {insights.stats.map((stat, i) => {
                    const key = `stat-${i}`
                    return (
                      <div key={key} className="rounded-md border border-border bg-background p-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[11px] text-muted-foreground">{stat.label}</span>
                          <span className="shrink-0 text-xs font-semibold">{stat.value}</span>
                        </div>
                        {stat.formula && stat.cell && (
                          <div className="mt-1 flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                              {stat.cellA1 ?? ''}: {stat.formula}
                            </code>
                            {inserted[key] ? (
                              <span className="flex shrink-0 items-center gap-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                                <Check className="h-2.5 w-2.5" /> Inserted
                              </span>
                            ) : (
                              <button
                                className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20"
                                onClick={() => {
                                  onInsertFormula(stat.cell!, stat.formula!)
                                  setInserted((s) => ({ ...s, [key]: true }))
                                }}
                              >
                                Insert formula
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {insights.charts.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <BarChart3 className="h-3 w-3" /> Suggested charts
                </p>
                <div className="space-y-1.5">
                  {insights.charts.map((chart, i) => {
                    const key = `chart-${i}`
                    return (
                      <div key={key} className="rounded-md border border-border bg-background p-2">
                        <p className="text-xs font-medium">
                          {chart.title || `${chart.chartType} chart`}
                          <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">{chart.dataRange}</span>
                        </p>
                        {chart.reason && (
                          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{chart.reason}</p>
                        )}
                        <div className="mt-1.5">
                          {inserted[key] ? (
                            <span className="flex items-center gap-0.5 text-[10px] font-medium text-green-600 dark:text-green-400">
                              <Check className="h-2.5 w-2.5" /> Inserted
                            </span>
                          ) : (
                            <button
                              className={cn(
                                'rounded bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90',
                              )}
                              onClick={() => {
                                onInsertChart({ type: chart.chartType, dataRange: chart.dataRange, title: chart.title })
                                setInserted((s) => ({ ...s, [key]: true }))
                              }}
                            >
                              Insert chart
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
