import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import { exportToBlob } from '@excalidraw/excalidraw'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { renderPdfPreviewPages } from '@/lib/pdfPreview'
import type { PageMargins } from '@/types'

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

// ── Types & helpers ───────────────────────────────────────────────────────────

type Format      = 'png' | 'pdf'
type PageSize    = 'Letter' | 'A4' | 'Legal'
type Orientation = 'portrait' | 'landscape'
type Scale       = '1' | '2' | '3'

const DEFAULT_MARGINS: PageMargins = { top: 0, right: 0, bottom: 0, left: 0 }

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getImageDimensions(dataUrl: string): Promise<[number, number]> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve([img.naturalWidth, img.naturalHeight])
    img.onerror = reject
    img.src = dataUrl
  })
}

function buildPdf(
  dataUrl: string,
  imgW: number,
  imgH: number,
  pageSize: PageSize,
  orientation: Orientation,
  margins: PageMargins,
): jsPDF {
  const fmt = pageSize === 'A4' ? 'a4' : pageSize.toLowerCase()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdf  = new jsPDF({ orientation, unit: 'in', format: fmt as any })
  const pageW    = pdf.internal.pageSize.getWidth()
  const pageH    = pdf.internal.pageSize.getHeight()
  const contentW = pageW - margins.left - margins.right
  const contentH = pageH - margins.top  - margins.bottom
  const aspect   = imgW / imgH
  let drawW = contentW
  let drawH = drawW / aspect
  if (drawH > contentH) { drawH = contentH; drawW = drawH * aspect }
  const xOff = margins.left + (contentW - drawW) / 2
  const yOff = margins.top  + (contentH - drawH) / 2
  pdf.addImage(dataUrl, 'PNG', xOff, yOff, drawW, drawH)
  return pdf
}

// ── ZoomBar ───────────────────────────────────────────────────────────────────

function ZoomBar({ zoom, setZoom }: { zoom: number; setZoom: React.Dispatch<React.SetStateAction<number>> }): JSX.Element {
  return (
    <div className="shrink-0 flex items-center gap-2 border-t border-border/50 bg-neutral-300/80 dark:bg-neutral-600/80 px-3 py-1.5">
      <button
        onClick={() => setZoom(z => Math.max(25, z - 10))}
        className="flex h-5 w-5 items-center justify-center rounded text-foreground/60 hover:text-foreground hover:bg-black/10 dark:hover:bg-white/10 transition-colors select-none"
        aria-label="Zoom out"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      <input
        type="range" min={25} max={200} step={5} value={zoom}
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
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface BoardExportModalProps {
  open: boolean
  onClose(): void
  boardTitle: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any
}

export function BoardExportModal({
  open, onClose, boardTitle, excalidrawAPI,
}: BoardExportModalProps): JSX.Element | null {
  const [format,      setFormat]      = useState<Format>('png')
  const [baseName,    setBaseName]    = useState(boardTitle)
  const [pageSize,    setPageSize]    = useState<PageSize>('Letter')
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [margins,     setMargins]     = useState<PageMargins>(DEFAULT_MARGINS)
  const [scale,       setScale]       = useState<Scale>('2')
  const [background,  setBackground]  = useState(true)

  const [previewLoading, setPreviewLoading] = useState(true)
  const [pngPreviewUrl,  setPngPreviewUrl]  = useState('')
  const [pdfPages,       setPdfPages]       = useState<string[]>([])
  const [zoom,           setZoom]           = useState(100)
  const [exporting,      setExporting]      = useState(false)

  const previewGenRef    = useRef(0)
  const baseNameInputRef = useRef<HTMLInputElement>(null)
  const pngUrlRef        = useRef('')

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => { if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current) }
  }, [])

  // Reset on open
  useEffect(() => {
    if (!open) return
    setFormat('png')
    setBaseName(boardTitle)
    setPageSize('Letter')
    setOrientation('landscape')
    setMargins(DEFAULT_MARGINS)
    setScale('2')
    setBackground(true)
    setPreviewLoading(true)
    setPngPreviewUrl('')
    setPdfPages([])
    setZoom(100)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus filename on open
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => baseNameInputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open])

  // Debounced preview generation
  useEffect(() => {
    if (!open || !excalidrawAPI) return
    setPreviewLoading(true)
    setPdfPages([])
    if (pngUrlRef.current) { URL.revokeObjectURL(pngUrlRef.current); pngUrlRef.current = '' }
    setPngPreviewUrl('')

    const gen   = ++previewGenRef.current
    const timer = setTimeout(async () => {
      try {
        const elements = excalidrawAPI.getSceneElements() as readonly unknown[]
        const appState = excalidrawAPI.getAppState()
        const files    = excalidrawAPI.getFiles()

        if (format === 'png') {
          const sc   = parseInt(scale, 10)
          const blob = await exportToBlob({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            elements:      elements as any,
            appState:      { ...appState, exportBackground: background },
            files,
            mimeType:      'image/png',
            getDimensions: (w, h) => ({ width: w * sc, height: h * sc, scale: 1 }),
          })
          if (gen !== previewGenRef.current) return
          const url        = URL.createObjectURL(blob)
          if (pngUrlRef.current) URL.revokeObjectURL(pngUrlRef.current)
          pngUrlRef.current = url
          setPngPreviewUrl(url)
        } else {
          const blob = await exportToBlob({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            elements:      elements as any,
            appState:      { ...appState, exportBackground: background },
            files,
            mimeType:      'image/png',
            getDimensions: (w, h) => ({ width: w * 3, height: h * 3, scale: 1 }),
          })
          if (gen !== previewGenRef.current) return
          const dataUrl        = await blobToDataUrl(blob)
          const [imgW, imgH]   = await getImageDimensions(dataUrl)
          const pdf            = buildPdf(dataUrl, imgW, imgH, pageSize, orientation, margins)
          const b64            = (pdf.output('datauristring') as string).split(',')[1]
          if (gen !== previewGenRef.current) return
          const pages = await renderPdfPreviewPages(b64)
          if (gen !== previewGenRef.current) return
          setPdfPages(pages)
        }
      } catch (err) {
        console.error('[BoardExportModal] preview error:', err)
      } finally {
        if (gen === previewGenRef.current) setPreviewLoading(false)
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [open, format, pageSize, orientation, margins, scale, background]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements = excalidrawAPI.getSceneElements() as any
      const appState = excalidrawAPI.getAppState()
      const files    = excalidrawAPI.getFiles()

      if (format === 'png') {
        const sc   = parseInt(scale, 10)
        const blob = await exportToBlob({
          elements,
          appState:      { ...appState, exportBackground: background },
          files,
          mimeType:      'image/png',
          getDimensions: (w, h) => ({ width: w * sc, height: h * sc, scale: 1 }),
        })
        const url = URL.createObjectURL(blob)
        const a   = document.createElement('a')
        a.href     = url
        a.download = `${baseName}.png`
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } else {
        const blob = await exportToBlob({
          elements,
          appState:      { ...appState, exportBackground: background },
          files,
          mimeType:      'image/png',
          getDimensions: (w, h) => ({ width: w * 3, height: h * 3, scale: 1 }),
        })
        const dataUrl      = await blobToDataUrl(blob)
        const [imgW, imgH] = await getImageDimensions(dataUrl)
        buildPdf(dataUrl, imgW, imgH, pageSize, orientation, margins).save(`${baseName}.pdf`)
      }
      onClose()
    } catch (err) {
      console.error('[BoardExportModal] export error:', err)
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
            Export: <span className="font-normal text-muted-foreground">{boardTitle}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Preview pane ───────────────────────────────���─────────────────── */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-neutral-300 dark:bg-neutral-600">

            {format === 'pdf' ? (
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
                {!previewLoading && pdfPages.length > 0 && (
                  <ZoomBar zoom={zoom} setZoom={setZoom} />
                )}
              </div>
            ) : (
              <div className="relative flex flex-1 flex-col overflow-hidden">
                {previewLoading && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
                    <span className="text-xs text-foreground/50 select-none">Generating preview…</span>
                  </div>
                )}
                <div
                  className="prose-preview-scroll flex-1 overflow-auto flex items-center justify-center p-6"
                  style={{ opacity: previewLoading ? 0 : 1, transition: 'opacity 0.15s ease' }}
                >
                  {pngPreviewUrl && (
                    <img
                      src={pngPreviewUrl}
                      alt="Export preview"
                      draggable={false}
                      className="rounded shadow-lg select-none object-contain"
                      style={{ maxHeight: '100%', width: `${zoom * 6.4}px`, maxWidth: 'none' }}
                    />
                  )}
                </div>
                {!previewLoading && pngPreviewUrl && (
                  <ZoomBar zoom={zoom} setZoom={setZoom} />
                )}
              </div>
            )}
          </div>

          {/* ── Settings panel ───────────────────────────────────────────────── */}
          <div className="flex w-[290px] shrink-0 flex-col border-l border-border">
            <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
              <div className="flex flex-col gap-4 p-4">

                {/* Format */}
                <div className="flex flex-col gap-2">
                  <SectionHeader>Format</SectionHeader>
                  <SegmentedControl<Format>
                    value={format}
                    onChange={(v) => { setFormat(v); setZoom(100) }}
                    options={[
                      { value: 'png', label: 'PNG' },
                      { value: 'pdf', label: 'PDF' },
                    ]}
                  />
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
                      {format === 'png' ? '.png' : '.pdf'}
                    </div>
                  </div>
                </div>

                {/* PDF: page settings */}
                {format === 'pdf' && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Page</SectionHeader>
                    <Row label="Size">
                      <Select value={pageSize} onValueChange={(v) => setPageSize(v as PageSize)}>
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
                      <SegmentedControl<Orientation>
                        value={orientation}
                        onChange={setOrientation}
                        options={[
                          { value: 'portrait',  label: 'Portrait' },
                          { value: 'landscape', label: 'Landscape' },
                        ]}
                      />
                    </Row>
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
                              min={0}
                              max={3}
                              className="h-7 text-xs"
                              value={margins[key]}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                if (!isNaN(v)) setMargins((m) => ({ ...m, [key]: v }))
                              }}
                              onBlur={(e) => {
                                const v = Math.min(3, Math.max(0, parseFloat(e.target.value) || 0))
                                setMargins((m) => ({ ...m, [key]: v }))
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* PNG: resolution */}
                {format === 'png' && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Resolution</SectionHeader>
                    <Row label="Scale">
                      <SegmentedControl<Scale>
                        value={scale}
                        onChange={setScale}
                        options={[
                          { value: '1', label: '1×' },
                          { value: '2', label: '2×' },
                          { value: '3', label: '3×' },
                        ]}
                      />
                    </Row>
                  </div>
                )}

                {/* Image */}
                <div className="flex flex-col gap-3">
                  <SectionHeader>Image</SectionHeader>
                  <Row label="Background">
                    <Switch checked={background} onCheckedChange={setBackground} />
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
