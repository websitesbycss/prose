import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
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

function withExt(name: string, fmt: ExportOptions['format']): string {
  const stripped = name.replace(/\.(pdf|docx|md|txt)$/i, '')
  return stripped + EXT[fmt]
}

const DEFAULT_MARGINS: PageMargins = { top: 1, right: 1, bottom: 1, left: 1 }

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
            'px-3 py-1 text-xs transition-colors',
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

export default function ExportModal({
  open,
  onClose,
  documentId,
  documentTitle,
  documentMargins,
}: ExportModalProps): JSX.Element | null {
  const [format, setFormat] = useState<ExportOptions['format']>('pdf')
  const [fileName, setFileName] = useState(documentTitle + '.pdf')
  const [pageSize, setPageSize] = useState<ExportOptions['pageSize']>('Letter')
  const [orientation, setOrientation] = useState<ExportOptions['orientation']>('portrait')
  const [margins, setMargins] = useState<PageMargins>(documentMargins ?? DEFAULT_MARGINS)
  const [colorMode, setColorMode] = useState<ExportOptions['colorMode']>('light')
  const [includeHeader, setIncludeHeader] = useState(true)
  const [includeFooter, setIncludeFooter] = useState(true)
  const [openAfterExport, setOpenAfterExport] = useState(false)

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const prevKeyRef = useRef('')

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setFormat('pdf')
      setFileName(documentTitle + '.pdf')
      setPageSize('Letter')
      setOrientation('portrait')
      setMargins(documentMargins ?? DEFAULT_MARGINS)
      setColorMode('light')
      setIncludeHeader(true)
      setIncludeFooter(true)
      setOpenAfterExport(false)
      setPreviewHtml(null)
      setPreviewLoading(true)
    }
  }, [open, documentTitle, documentMargins])

  // Build current options object
  const buildOpts = useCallback((): ExportOptions => ({
    format,
    fileName,
    pageSize,
    orientation,
    margins,
    colorMode,
    includeHeader,
    includeFooter,
    openAfterExport,
  }), [format, fileName, pageSize, orientation, margins, colorMode, includeHeader, includeFooter, openAfterExport])

  // Debounced preview refresh — keyed on settings that affect visual output (not fileName/openAfter)
  useEffect(() => {
    if (!open) return
    const key = [format, pageSize, orientation, JSON.stringify(margins), colorMode, includeHeader, includeFooter].join('|')
    if (key === prevKeyRef.current && previewHtml !== null) return
    prevKeyRef.current = key
    setPreviewLoading(true)

    const timer = setTimeout(async () => {
      try {
        const html = await window.prose.export.getPreviewHtml(documentId, buildOpts())
        setPreviewHtml(html)
      } catch {
        // preview failure is non-fatal
      } finally {
        setPreviewLoading(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [open, format, pageSize, orientation, margins, colorMode, includeHeader, includeFooter]) // eslint-disable-line react-hooks/exhaustive-deps

  // Inject new HTML into existing iframe to avoid flicker
  useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe || !previewHtml) return
    try {
      const doc = iframe.contentDocument
      if (doc) {
        doc.open()
        doc.write(previewHtml)
        doc.close()
      }
    } catch {
      // cross-origin guard (shouldn't happen with srcdoc)
    }
  }, [previewHtml])

  function handleFormatChange(f: ExportOptions['format']): void {
    setFormat(f)
    setFileName((n) => withExt(n, f))
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      await window.prose.export.run(documentId, buildOpts())
      onClose()
    } catch {
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  const isPageFormat = format === 'pdf' || format === 'docx'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[720px] max-h-[90vh] w-[1060px] max-w-[96vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-3.5">
          <DialogTitle className="text-sm font-semibold">
            Export — <span className="font-normal text-muted-foreground">{documentTitle}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Preview pane ── */}
          <div className="relative flex flex-1 items-start justify-center overflow-auto bg-neutral-300 dark:bg-neutral-700">
            {/* Loading shimmer */}
            {previewLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            )}
            <iframe
              ref={iframeRef}
              className={cn('w-full h-full border-0 transition-opacity duration-200', previewLoading ? 'opacity-0' : 'opacity-100')}
              title="Export preview"
              sandbox="allow-scripts"
            />
          </div>

          {/* ── Settings panel ── */}
          <div className="flex w-[272px] shrink-0 flex-col border-l border-border">
            <ScrollArea className="flex-1">
              <div className="flex flex-col gap-4 p-4">

                {/* Format */}
                <div className="flex flex-col gap-2">
                  <SectionHeader>Format</SectionHeader>
                  <Select value={format} onValueChange={(v) => handleFormatChange(v as ExportOptions['format'])}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf" className="text-xs">PDF (.pdf)</SelectItem>
                      <SelectItem value="docx" className="text-xs">Word Document (.docx)</SelectItem>
                      <SelectItem value="markdown" className="text-xs">Markdown (.md)</SelectItem>
                      <SelectItem value="plaintext" className="text-xs">Plain Text (.txt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* File name */}
                <div className="flex flex-col gap-2">
                  <SectionHeader>File name</SectionHeader>
                  <Input
                    className="h-8 text-xs"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                  />
                </div>

                {/* Page — PDF and DOCX only */}
                {isPageFormat && (
                  <div className="flex flex-col gap-3">
                    <SectionHeader>Page</SectionHeader>

                    <Row label="Size">
                      <Select value={pageSize} onValueChange={(v) => setPageSize(v as ExportOptions['pageSize'])}>
                        <SelectTrigger className="h-7 w-28 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Letter" className="text-xs">Letter</SelectItem>
                          <SelectItem value="A4" className="text-xs">A4</SelectItem>
                          <SelectItem value="Legal" className="text-xs">Legal</SelectItem>
                        </SelectContent>
                      </Select>
                    </Row>

                    <Row label="Orientation">
                      <SegmentedControl
                        value={orientation}
                        onChange={setOrientation}
                        options={[
                          { value: 'portrait', label: 'Portrait' },
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
                            { key: 'top', label: 'Top' },
                            { key: 'bottom', label: 'Bottom' },
                            { key: 'left', label: 'Left' },
                            { key: 'right', label: 'Right' },
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
                          { value: 'dark', label: 'Dark' },
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
            </ScrollArea>

            {/* Export button */}
            <div className="shrink-0 border-t border-border p-4">
              <Button
                className="w-full text-xs"
                onClick={() => void handleExport()}
                disabled={exporting || !fileName.trim()}
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
