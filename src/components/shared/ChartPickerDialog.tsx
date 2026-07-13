import { useState, useRef, useEffect } from 'react'
import { Chart } from 'chart.js'
import { Search, Table2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { ChartDef, SheetContent } from '@/types/sheet'
import { isSheetContent } from '@/types/sheet'
import { extractChartData, buildChartConfig, parseRange, sheetTabToCellGrid } from '@/components/sheets/chartUtils'
import { renderChartSnapshot, type ChartSnapshot } from '@/lib/chartSnapshot'

interface SheetFile {
  id: string
  title: string
}

// ── Static (non-responsive) thumbnail for a chart inside the picker ───────────

function ChartThumb({
  chart,
  sheetContent,
  isDark,
  onSelect,
}: {
  chart: ChartDef
  sheetContent: SheetContent
  isDark: boolean
  onSelect: () => void
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const tab = sheetContent.tabs.find((t) => t.id === chart.sheetId)
    const grid = tab ? sheetTabToCellGrid(tab) : []
    const rng = parseRange(chart.dataRange)
    const extracted = rng ? extractChartData(grid, rng, chart.type) : { labels: [], datasets: [] }
    const config = buildChartConfig(chart, extracted, isDark)

    // Thumbnail-only overrides: no legend/title/axis-label clutter at this
    // size, no animation replay on every re-render. Left as `responsive: true`
    // (buildChartConfig's default) with the canvas filling a CSS aspect-ratio
    // box below, instead of forcing a fixed intrinsic resolution — that
    // mismatched the actually-displayed box and stretched/squished the chart.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options = config.options as any
    options.animation = false
    options.plugins = {
      ...options.plugins,
      legend: { display: false },
      title: { display: false },
      tooltip: { enabled: false },
    }
    if (options.scales) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const scale of Object.values(options.scales) as any[]) {
        if (scale.ticks) scale.ticks.display = false
        if (scale.title) scale.title.display = false
        if (scale.pointLabels) scale.pointLabels.display = false
      }
    }

    const orphan = Chart.getChart(canvas)
    if (orphan) orphan.destroy()
    const instance = new Chart(canvas, config)
    return () => { instance.destroy() }
  }, [chart, sheetContent, isDark])

  return (
    <button
      type="button"
      className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 p-2 text-left transition-colors hover:border-primary/60 hover:bg-accent"
      onClick={onSelect}
    >
      <div className="relative aspect-[8/5] w-full overflow-hidden rounded-md bg-background">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {chart.title.trim() || `${chart.type} chart`}
      </p>
    </button>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export interface ChartPickerDialogProps {
  open: boolean
  onClose: () => void
  onSelect: (snapshot: ChartSnapshot) => void
}

export function ChartPickerDialog({ open, onClose, onSelect }: ChartPickerDialogProps): JSX.Element {
  const isDark = useAppStore((s) => s.theme) === 'dark'
  const [sheets, setSheets] = useState<SheetFile[]>([])
  const [search, setSearch] = useState('')
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null)
  const [sheetContent, setSheetContent] = useState<SheetContent | null>(null)
  const [loadingCharts, setLoadingCharts] = useState(false)

  useEffect(() => {
    if (!open) {
      setSearch('')
      setSelectedSheetId(null)
      setSheetContent(null)
      return
    }
    void window.prose.documents.getAll().then((docs) => {
      setSheets(
        docs
          .filter((d) => d.fileType === 'sheet')
          .map((d) => ({ id: d.id, title: d.title })),
      )
    })
  }, [open])

  useEffect(() => {
    if (!selectedSheetId) { setSheetContent(null); return }
    setLoadingCharts(true)
    void window.prose.documents.getById(selectedSheetId).then((doc) => {
      if (!doc) { setSheetContent(null); setLoadingCharts(false); return }
      try {
        const raw = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
        setSheetContent(isSheetContent(raw) ? raw : null)
      } catch {
        setSheetContent(null)
      }
      setLoadingCharts(false)
    })
  }, [selectedSheetId])

  const filteredSheets = sheets.filter((s) => s.title.toLowerCase().includes(search.toLowerCase()))
  const charts = sheetContent?.charts ?? []

  function handlePick(chart: ChartDef): void {
    if (!sheetContent) return
    onSelect(renderChartSnapshot(chart, sheetContent, isDark))
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-sm font-semibold">Insert chart</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0" style={{ height: 480 }}>
          {/* Left: Sheets files */}
          <div className="flex w-56 shrink-0 flex-col border-r border-border">
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                placeholder="Search sheets…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {filteredSheets.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No Sheets files found</p>
              )}
              {filteredSheets.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent',
                    selectedSheetId === s.id && 'bg-accent/70 font-medium',
                  )}
                  onClick={() => setSelectedSheetId(s.id)}
                >
                  <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Right: charts in the selected sheet */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            {!selectedSheetId && (
              <p className="text-xs text-muted-foreground">Select a Sheets file to see its charts.</p>
            )}
            {selectedSheetId && loadingCharts && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
            {selectedSheetId && !loadingCharts && charts.length === 0 && (
              <p className="text-xs text-muted-foreground">This sheet has no charts yet.</p>
            )}
            {charts.length > 0 && sheetContent && (
              <div className="grid grid-cols-2 gap-3">
                {charts.map((chart) => (
                  <ChartThumb
                    key={chart.id}
                    chart={chart}
                    sheetContent={sheetContent}
                    isDark={isDark}
                    onSelect={() => handlePick(chart)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
