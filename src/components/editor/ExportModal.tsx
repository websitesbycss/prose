import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ExportOptions, PageMargins } from '@/types'

interface ExportModalProps {
  open: boolean
  onClose(): void
  documentId: string
  documentTitle: string
  documentMargins: PageMargins | null
}

const EXT: Record<ExportOptions['format'], string> = {
  pdf: '.pdf',
  docx: '.docx',
  markdown: '.md',
  plaintext: '.txt',
}

// Page pixel dimensions at 96 dpi, portrait orientation
const PAGE_PX: Record<string, { w: number; h: number }> = {
  Letter: { w: 816,  h: 1056 },
  A4:     { w: 794,  h: 1123 },
  Legal:  { w: 816,  h: 1344 },
}

function getPageDims(size: ExportOptions['pageSize'], orient: ExportOptions['orientation']) {
  const base = PAGE_PX[size] ?? PAGE_PX.Letter
  return orient === 'landscape' ? { w: base.h, h: base.w } : base
}

const DEFAULT_MARGINS: PageMargins = { top: 1, right: 1, bottom: 1, left: 1 }
const NAV_H   = 44   // bottom bar height
const PADDING = 32   // pane padding to leave breathing room around page

// Zoom constants — zoomFactor 1 = fit, 4 = 4× fit
const MIN_ZOOM  = 1
const MAX_ZOOM  = 4
const ZOOM_STEP = 0.25

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {children}
      </span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-foreground">{label}</span>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

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
            'flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors',
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

// ── Main component ────────────────────────────────────────────────────────────

export default function ExportModal({
  open,
  onClose,
  documentId,
  documentTitle,
  documentMargins,
}: ExportModalProps): JSX.Element | null {
  // Export settings
  const [format, setFormat]             = useState<ExportOptions['format']>('pdf')
  const [baseName, setBaseName]         = useState(documentTitle)
  const [pageSize, setPageSize]         = useState<ExportOptions['pageSize']>('Letter')
  const [orientation, setOrientation]   = useState<ExportOptions['orientation']>('portrait')
  const [margins, setMargins]           = useState<PageMargins>(documentMargins ?? DEFAULT_MARGINS)
  const [colorMode, setColorMode]       = useState<ExportOptions['colorMode']>('light')
  const [includeHeader, setIncludeHeader] = useState(true)
  const [includeFooter, setIncludeFooter] = useState(true)
  const [openAfterExport, setOpenAfterExport] = useState(false)

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(true)
  // fitScale = the scale that makes the full page fit the pane (minimum zoom)
  const [fitScale,    setFitScale]   = useState(0.6)
  // zoomFactor: 1 = fit, >1 = zoomed in
  const [zoomFactor,  setZoomFactor] = useState(1)
  const effectiveScale = fitScale * zoomFactor

  // Page navigation
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages,  setTotalPages]  = useState(1)
  const [pageInput,   setPageInput]   = useState('1')

  // Export state
  const [exporting, setExporting] = useState(false)

  const iframeRef       = useRef<HTMLIFrameElement>(null)
  const previewPaneRef  = useRef<HTMLDivElement>(null)
  const baseNameInputRef = useRef<HTMLInputElement>(null)

  const pageDims    = getPageDims(pageSize, orientation)
  const isPageFormat = format === 'pdf' || format === 'docx'
  const ext          = EXT[format]

  // ── Reset on open ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    setFormat('pdf')
    setBaseName(documentTitle)
    setPageSize('Letter')
    setOrientation('portrait')
    setMargins(documentMargins ?? DEFAULT_MARGINS)
    setColorMode('light')
    setIncludeHeader(true)
    setIncludeFooter(true)
    setOpenAfterExport(false)
    setPreviewLoading(true)
    setZoomFactor(1)
    setCurrentPage(1)
    setTotalPages(1)
    setPageInput('1')
    if (iframeRef.current) iframeRef.current.srcdoc = ''
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus filename input on open ───────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => baseNameInputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // ── Fit-scale: synchronous layout read (useLayoutEffect fires before paint,
  //    so offsetWidth/offsetHeight are real layout dimensions, unaffected by the
  //    Dialog's CSS zoom-in-95 opening animation). Also resets zoom to 1 whenever
  //    page size/orientation change so the user always starts from fit.          ──

  useLayoutEffect(() => {
    if (!open) return
    const pane = previewPaneRef.current
    if (!pane) return
    const availW = pane.offsetWidth  - PADDING
    const availH = pane.offsetHeight - NAV_H - PADDING
    if (availW <= 0 || availH <= 0) return
    const s = Math.min(availW / pageDims.w, availH / pageDims.h)
    setFitScale(Math.max(0.05, s))
    setZoomFactor(1)
  }, [pageDims.w, pageDims.h, open])

  // ── ResizeObserver — update fitScale when the window is resized ────────────

  useEffect(() => {
    if (!open) return
    const pane = previewPaneRef.current
    if (!pane) return
    let ro: ResizeObserver | null = null
    const rafId = requestAnimationFrame(() => {
      ro = new ResizeObserver(() => {
        const availW = pane.offsetWidth  - PADDING
        const availH = pane.offsetHeight - NAV_H - PADDING
        if (availW <= 0 || availH <= 0) return
        const s = Math.min(availW / pageDims.w, availH / pageDims.h)
        setFitScale(Math.max(0.05, s))
      })
      ro.observe(pane)
    })
    return () => { cancelAnimationFrame(rafId); ro?.disconnect() }
  }, [pageDims.w, pageDims.h, open])

  // ── postMessage listener for page-info from iframe ─────────────────────────

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== 'page-info') return
      const tp = Math.max(1, Number(e.data.totalPages))
      setTotalPages(tp)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // ── Debounced preview refresh ──────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    setPreviewLoading(true)
    setZoomFactor(1)
    setCurrentPage(1)
    setTotalPages(1)
    setPageInput('1')

    const opts: ExportOptions = {
      format, fileName: baseName + EXT[format],
      pageSize, orientation, margins, colorMode,
      includeHeader, includeFooter, openAfterExport,
    }

    const timer = setTimeout(async () => {
      try {
        const html = await window.prose.export.getPreviewHtml(documentId, opts)
        if (html && iframeRef.current) {
          iframeRef.current.srcdoc = html
        }
      } catch {
        // non-fatal
      } finally {
        setPreviewLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [open, format, pageSize, orientation, margins, colorMode, includeHeader, includeFooter]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Zoom helpers ───────────────────────────────────────────────────────────

  function zoomIn() {
    setZoomFactor(z => Math.min(MAX_ZOOM, parseFloat((z + ZOOM_STEP).toFixed(2))))
  }
  function zoomOut() {
    setZoomFactor(z => Math.max(MIN_ZOOM, parseFloat((z - ZOOM_STEP).toFixed(2))))
  }

  // ── Page navigation ────────────────────────────────────────────────────────

  function goToPage(page: number) {
    const clamped = Math.max(1, Math.min(totalPages, page))
    setCurrentPage(clamped)
    setPageInput(String(clamped))
    iframeRef.current?.contentWindow?.postMessage({ type: 'goto-page', page: clamped }, '*')
  }

  function commitPageInput() {
    const n = parseInt(pageInput, 10)
    goToPage(isNaN(n) ? currentPage : n)
  }

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await window.prose.export.run(documentId, {
        format, fileName: baseName + EXT[format],
        pageSize, orientation, margins, colorMode,
        includeHeader, includeFooter, openAfterExport,
      })
      onClose()
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  // ── Derived display values ────────────────────────────────────────────────

  // Zoom percentage label (100% = fit = entire page visible)
  const zoomLabel = `${Math.round(zoomFactor * 100)}%`

  // When zoomed in, allow the page to overflow (user scrolls to see clipped parts)
  const pageAreaOverflow = zoomFactor > 1 ? 'auto' : 'hidden'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <style>{`
        .prose-preview-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .prose-preview-scroll::-webkit-scrollbar-track { background: transparent; }
        .prose-preview-scroll::-webkit-scrollbar-thumb { background: rgba(120,120,120,0.55); border-radius: 4px; }
        .prose-preview-scroll::-webkit-scrollbar-thumb:hover { background: rgba(120,120,120,0.85); }
      `}</style>
      <DialogContent className="flex h-[720px] max-h-[90vh] w-[1060px] max-w-[96vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5">
          <DialogTitle className="text-sm font-semibold">
            Export — <span className="font-normal text-muted-foreground">{documentTitle}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Preview pane ─────────────────────────────────────────────────── */}
          <div
            ref={previewPaneRef}
            className="relative flex flex-1 flex-col overflow-hidden bg-neutral-300 dark:bg-neutral-600"
          >

            {/* ── Page format preview (PDF / DOCX) ─────────────────────────── */}
            {isPageFormat ? (
              <>
                {/* Scrollable page area — overflow hidden at fit zoom, auto when zoomed */}
                <div
                  className="prose-preview-scroll relative flex-1"
                  style={{ overflow: pageAreaOverflow }}
                >
                  {/* Loading overlay */}
                  {previewLoading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                    </div>
                  )}

                  {/* Inner flex container — 16px padding provides breathing room;
                      PADDING=32 in scale calculation already accounts for this.  */}
                  <div
                    style={{
                      minHeight: '100%',
                      minWidth: '100%',
                      display: 'flex',
                      alignItems: zoomFactor <= 1 ? 'center' : 'flex-start',
                      justifyContent: 'center',
                      padding: '16px',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Page wrapper — sized to scaled page for shadow + clipping */}
                    <div
                      style={{
                        width:       pageDims.w * effectiveScale,
                        height:      pageDims.h * effectiveScale,
                        boxShadow:   '0 4px 24px rgba(0,0,0,0.28)',
                        flexShrink:  0,
                        overflow:    'hidden',
                        position:    'relative',
                        visibility:  previewLoading ? 'hidden' : 'visible',
                      }}
                    >
                      {/* Iframe always in DOM so iframeRef is never null when srcdoc is set */}
                      <iframe
                        ref={iframeRef}
                        sandbox="allow-scripts"
                        title="Export preview"
                        style={{
                          width:           pageDims.w,
                          height:          pageDims.h,
                          transform:       `scale(${effectiveScale})`,
                          transformOrigin: 'top left',
                          border:          'none',
                          display:         'block',
                        }}
                        onLoad={() => {
                          // Request a fresh page-count report after the iframe fully loads,
                          // as a fallback in case the DOMContentLoaded report fires too early.
                          setTimeout(() => {
                            iframeRef.current?.contentWindow?.postMessage({ type: 'request-page-info' }, '*')
                          }, 60)
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom bar: zoom (left) | page nav (center) | spacer (right) */}
                <div className="shrink-0 grid grid-cols-3 items-center border-t border-black/10 bg-black/10 py-2 px-3">

                  {/* Zoom controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); zoomOut() }}
                      disabled={zoomFactor <= MIN_ZOOM}
                      className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
                      title="Zoom out"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <input
                      type="range"
                      min={MIN_ZOOM}
                      max={MAX_ZOOM}
                      step={ZOOM_STEP}
                      value={zoomFactor}
                      onChange={(e) => setZoomFactor(parseFloat(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="w-20 cursor-pointer accent-primary"
                      style={{ height: 4 }}
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); zoomIn() }}
                      disabled={zoomFactor >= MAX_ZOOM}
                      className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground disabled:opacity-30 transition-colors"
                      title="Zoom in"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                    <span className="w-9 text-right text-[11px] leading-none text-foreground/50 select-none">
                      {zoomLabel}
                    </span>
                  </div>

                  {/* Page navigation */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage <= 1}
                      className="flex h-6 w-6 items-center justify-center rounded text-foreground/70 hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>

                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onBlur={commitPageInput}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { commitPageInput(); e.currentTarget.blur() }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-6 w-9 rounded border border-black/20 bg-white/80 text-center text-xs leading-none text-foreground outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-foreground/60 select-none">/ {totalPages}</span>
                    </div>

                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage >= totalPages}
                      className="flex h-6 w-6 items-center justify-center rounded text-foreground/70 hover:text-foreground disabled:opacity-30 transition-colors"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Right spacer (balances the zoom column so nav stays centred) */}
                  <div />
                </div>
              </>
            ) : (
              /* ── Text format preview (Markdown / Plain text) ─────────────── */
              /* Scrollable iframe: no page constraints, no zoom, no nav */
              <>
                {previewLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  sandbox="allow-scripts"
                  title="Export preview"
                  style={{
                    flex:       1,
                    width:      '100%',
                    border:     'none',
                    display:    'block',
                    background: 'transparent',
                    visibility: previewLoading ? 'hidden' : 'visible',
                  }}
                />
              </>
            )}
          </div>

          {/* ── Settings panel ───────────────────────────────────────────────── */}
          {/* scrollbar-gutter:stable reserves scrollbar space so content never
              sits flush against the right edge when PDF/DOCX adds extra rows.   */}
          <div className="flex w-[290px] shrink-0 flex-col border-l border-border">
            <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className="flex flex-col gap-4 p-4">

                {/* Format */}
                <div className="flex flex-col gap-2">
                  <SectionHeader>Format</SectionHeader>
                  <Select value={format} onValueChange={(v) => setFormat(v as ExportOptions['format'])}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf"       className="text-xs">PDF (.pdf)</SelectItem>
                      <SelectItem value="docx"      className="text-xs">Word Document (.docx)</SelectItem>
                      <SelectItem value="markdown"  className="text-xs">Markdown (.md)</SelectItem>
                      <SelectItem value="plaintext" className="text-xs">Plain Text (.txt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* File name */}
                <div className="flex flex-col gap-2">
                  <SectionHeader>File name</SectionHeader>
                  <div className="flex items-center">
                    <Input
                      ref={baseNameInputRef}
                      className="h-8 flex-1 rounded-r-none border-r-0 text-xs focus-visible:z-10"
                      value={baseName}
                      onChange={(e) => setBaseName(e.target.value)}
                    />
                    <div className="flex h-8 items-center rounded-r-md border border-border bg-muted px-2.5 text-xs text-muted-foreground select-none whitespace-nowrap">
                      {ext}
                    </div>
                  </div>
                </div>

                {/* Page — PDF and DOCX only */}
                {isPageFormat && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Page</SectionHeader>

                    <Row label="Size">
                      <Select value={pageSize} onValueChange={(v) => setPageSize(v as ExportOptions['pageSize'])}>
                        <SelectTrigger className="h-7 w-[148px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Letter" className="text-xs">Letter (8.5 × 11")</SelectItem>
                          <SelectItem value="A4"     className="text-xs">A4 (8.3 × 11.7")</SelectItem>
                          <SelectItem value="Legal"  className="text-xs">Legal (8.5 × 14")</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>

                    <Row label="Orientation">
                      <SegmentedControl
                        value={orientation}
                        onChange={setOrientation}
                        options={[
                          { value: 'portrait',  label: 'Portrait' },
                          { value: 'landscape', label: 'Landscape' },
                        ]}
                      />
                    </Row>

                    {/* Margins */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs text-muted-foreground">Margins (inches)</span>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {(
                          [
                            { key: 'top',    label: 'Top' },
                            { key: 'bottom', label: 'Bottom' },
                            { key: 'left',   label: 'Left' },
                            { key: 'right',  label: 'Right' },
                          ] as { key: keyof PageMargins; label: string }[]
                        ).map(({ key, label }) => (
                          <div key={key} className="flex flex-col gap-1">
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                            <Input
                              type="number"
                              step={0.25}
                              min={0.25}
                              max={3}
                              className="h-7 text-xs"
                              value={margins[key]}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v)) setMargins((m) => ({ ...m, [key]: v }))
                              }}
                              onBlur={(e) => {
                                const v = Math.min(3, Math.max(0.25, parseFloat(e.target.value) || 1))
                                setMargins((m) => ({ ...m, [key]: v }))
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Appearance — PDF only */}
                {format === 'pdf' && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Appearance</SectionHeader>
                    <Row label="Color mode">
                      <SegmentedControl
                        value={colorMode}
                        onChange={setColorMode}
                        options={[
                          { value: 'light', label: 'Light' },
                          { value: 'dark',  label: 'Dark' },
                        ]}
                      />
                    </Row>
                  </div>
                )}

                {/* Content — PDF and DOCX only */}
                {isPageFormat && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Content</SectionHeader>
                    <Row label="Include header">
                      <Switch checked={includeHeader} onCheckedChange={setIncludeHeader} />
                    </Row>
                    <Row label="Include footer">
                      <Switch checked={includeFooter} onCheckedChange={setIncludeFooter} />
                    </Row>
                  </div>
                )}

                {/* Behavior */}
                <div className="flex flex-col gap-3">
                  <SectionHeader>Behavior</SectionHeader>
                  <Row label="Open after export">
                    <Switch checked={openAfterExport} onCheckedChange={setOpenAfterExport} />
                  </Row>
                </div>

              </div>
            </div>

            {/* Export button */}
            <div className="shrink-0 border-t border-border p-4">
              <Button
                className="w-full text-xs"
                onClick={() => void handleExport()}
                disabled={exporting || !baseName.trim()}
              >
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
