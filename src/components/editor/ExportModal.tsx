import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { ExportOptions, PageMargins } from '@/types'
import { useAppStore } from '@/store/appStore'
import { renderPdfPreviewPages } from '@/lib/pdfPreview'

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

const DEFAULT_MARGINS: PageMargins = { top: 1, right: 1, bottom: 1, left: 1 }

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
  const [format, setFormat]               = useState<ExportOptions['format']>('pdf')
  const [baseName, setBaseName]           = useState(documentTitle)
  const [pageSize, setPageSize]           = useState<ExportOptions['pageSize']>('Letter')
  const [orientation, setOrientation]     = useState<ExportOptions['orientation']>('portrait')
  const [margins, setMargins]             = useState<PageMargins>(documentMargins ?? DEFAULT_MARGINS)
  const [includeHeader, setIncludeHeader] = useState(true)
  const [includeFooter, setIncludeFooter] = useState(true)
  const [openAfterExport, setOpenAfterExport] = useState(false)

  // Preview state
  const [previewLoading, setPreviewLoading] = useState(true)
  const [pdfPages, setPdfPages]             = useState<string[]>([])
  const [zoom, setZoom] = useState(100)

  // Export state
  const [exporting, setExporting] = useState(false)

  const iframeRef        = useRef<HTMLIFrameElement>(null)
  const baseNameInputRef = useRef<HTMLInputElement>(null)
  const previewGenRef    = useRef(0)

  const appTheme     = useAppStore(s => s.theme)
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
    setIncludeHeader(true)
    setIncludeFooter(true)
    setOpenAfterExport(false)
    setPreviewLoading(true)
    setPdfPages([])
    setZoom(100)
    if (iframeRef.current) iframeRef.current.srcdoc = ''
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Focus filename input on open ───────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => baseNameInputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // ── Debounced preview refresh ──────────────────────────────────────────────

  useEffect(() => {
    if (!open) return
    setPreviewLoading(true)
    setPdfPages([])

    const opts: ExportOptions = {
      format, fileName: baseName + EXT[format],
      pageSize, orientation, margins,
      includeHeader, includeFooter, openAfterExport,
    }

    const gen = ++previewGenRef.current
    const timer = setTimeout(async () => {
      try {
        if (isPageFormat) {
          const b64 = await window.prose.export.getPreviewPdf(documentId, opts)
          if (gen !== previewGenRef.current) return
          if (b64) {
            const images = await renderPdfPreviewPages(b64)
            if (gen !== previewGenRef.current) return
            setPdfPages(images)
          }
        } else {
          const html = await window.prose.export.getPreviewHtml(documentId, { ...opts, colorMode: appTheme })
          if (gen !== previewGenRef.current) return
          if (html && iframeRef.current) {
            iframeRef.current.srcdoc = html
          }
        }
      } catch (err) {
        console.error('[ExportModal] preview error:', err)
      } finally {
        if (gen === previewGenRef.current) setPreviewLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [open, format, pageSize, orientation, margins, includeHeader, includeFooter, appTheme]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Export ────────────────────────────────────────────────────────────────

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await window.prose.export.run(documentId, {
        format, fileName: baseName + EXT[format],
        pageSize, orientation, margins,
        includeHeader, includeFooter, openAfterExport,
      })
      onClose()
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

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
          <div className="relative flex flex-1 flex-col overflow-hidden bg-neutral-300 dark:bg-neutral-600">

            {/* ── PDF / DOCX — paginated PDF.js canvas images ── */}
            {isPageFormat ? (
              <div className="relative flex flex-1 flex-col overflow-hidden">
                {previewLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                    <span className="text-xs text-foreground/50 select-none">Generating preview…</span>
                  </div>
                )}
                <div
                  className="prose-preview-scroll flex-1 overflow-y-auto"
                  style={{ opacity: previewLoading ? 0 : 1, transition: 'opacity 0.15s ease' }}
                >
                  <div className="flex flex-col items-center gap-4 py-6 px-6">
                    {pdfPages.map((src, i) => (
                      <img
                        key={i}
                        src={src}
                        alt={`Page ${i + 1}`}
                        draggable={false}
                        className="rounded shadow-lg select-none"
                        style={{ display: 'block', width: `${zoom * 6.4}px`, maxWidth: 'none' }}
                      />
                    ))}
                  </div>
                </div>

                {/* ── Zoom bar — only after load ── */}
                {!previewLoading && pdfPages.length > 0 && (
                <div className="shrink-0 flex items-center gap-2 border-t border-border/50 bg-neutral-300/80 dark:bg-neutral-600/80 px-3 py-1.5">
                  <button
                    onClick={() => setZoom(z => Math.max(25, z - 10))}
                    className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors select-none"
                    aria-label="Zoom out"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  <input
                    type="range"
                    min={25}
                    max={200}
                    step={5}
                    value={zoom}
                    onChange={e => setZoom(Number(e.target.value))}
                    className="h-1 w-28 cursor-pointer accent-primary"
                  />
                  <button
                    onClick={() => setZoom(z => Math.min(200, z + 10))}
                    className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors select-none"
                    aria-label="Zoom in"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </button>
                  <span className="w-9 text-right text-[11px] text-foreground/50 select-none leading-none">{zoom}%</span>
                </div>
                )}
              </div>
            ) : (
              /* ── Markdown / Plain text — simple scrollable HTML iframe ──── */
              <>
                {previewLoading && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                  </div>
                )}
                <iframe
                  key={format}
                  ref={iframeRef}
                  sandbox="allow-scripts"
                  title="Export preview"
                  className="prose-preview-scroll flex-1"
                  style={{
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
                        onChange={(v) => setOrientation(v as 'portrait' | 'landscape')}
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
