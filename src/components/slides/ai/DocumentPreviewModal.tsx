// Lightweight, read-only PDF preview for a single document — used by the
// Slides "Generate from selected" document picker so the user can check a
// document's content before including it. Deliberately has none of
// ExportModal's format/settings sidebar; it only loads the PDF (via getById +
// getPreviewPdf) when actually opened, so browsing the picker list never
// triggers PDF generation for documents the user doesn't inspect.
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ExportOptions, PageMargins } from '@/types'
import { renderPdfPreviewPages } from '@/lib/pdfPreview'

interface Props {
  open: boolean
  onClose(): void
  documentId: string | null
  documentTitle: string
}

const DEFAULT_MARGINS: PageMargins = { top: 1, right: 1, bottom: 1, left: 1 }

export function DocumentPreviewModal({ open, onClose, documentId, documentTitle }: Props): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [pages, setPages] = useState<string[]>([])
  const [error, setError] = useState(false)
  const [zoom, setZoom] = useState(100)
  const genRef = useRef(0)

  useEffect(() => {
    if (!open || !documentId) return
    setLoading(true)
    setPages([])
    setError(false)
    setZoom(100)
    const gen = ++genRef.current

    void (async () => {
      try {
        const doc = await window.prose.documents.getById(documentId)
        if (gen !== genRef.current) return
        const opts: ExportOptions = {
          format: 'pdf',
          fileName: `${documentTitle || 'document'}.pdf`,
          pageSize: 'Letter',
          orientation: 'portrait',
          margins: doc?.pageMargins ?? DEFAULT_MARGINS,
          includeHeader: true,
          includeFooter: true,
          openAfterExport: false,
        }
        const b64 = await window.prose.export.getPreviewPdf(documentId, opts)
        if (gen !== genRef.current) return
        if (!b64) { setError(true); return }
        const images = await renderPdfPreviewPages(b64)
        if (gen !== genRef.current) return
        setPages(images)
      } catch (err) {
        console.error('[DocumentPreviewModal] preview error:', err)
        if (gen === genRef.current) setError(true)
      } finally {
        if (gen === genRef.current) setLoading(false)
      }
    })()
  }, [open, documentId, documentTitle])

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[720px] max-h-[90vh] w-[720px] max-w-[92vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="truncate pr-6 text-sm font-semibold">{documentTitle}</DialogTitle>
        </DialogHeader>

        <div className="relative flex flex-1 flex-col overflow-hidden bg-neutral-300 dark:bg-neutral-600">
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <span className="select-none text-xs text-foreground/50">Generating preview…</span>
            </div>
          )}

          {!loading && error && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="text-center text-xs text-foreground/60">Couldn&apos;t generate a preview for this document.</p>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="flex-1 overflow-y-auto" style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.15s ease' }}>
                <div className="flex flex-col items-center gap-4 px-6 py-6">
                  {pages.map((src, i) => (
                    <img
                      key={i}
                      src={src}
                      alt={`Page ${i + 1}`}
                      draggable={false}
                      className="select-none rounded shadow-lg"
                      style={{ display: 'block', width: `${zoom * 6.4}px`, maxWidth: 'none' }}
                    />
                  ))}
                </div>
              </div>

              {pages.length > 0 && (
                <div className="flex shrink-0 items-center gap-2 border-t border-border/50 bg-neutral-300/80 px-3 py-1.5 dark:bg-neutral-600/80">
                  <button
                    onClick={() => setZoom((z) => Math.max(25, z - 10))}
                    className="flex h-5 w-5 select-none items-center justify-center rounded text-foreground/60 transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                    aria-label="Zoom out"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                  <input
                    type="range"
                    min={25}
                    max={200}
                    step={5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="h-1 w-28 cursor-pointer accent-primary"
                  />
                  <button
                    onClick={() => setZoom((z) => Math.min(200, z + 10))}
                    className="flex h-5 w-5 select-none items-center justify-center rounded text-foreground/60 transition-colors hover:bg-black/10 hover:text-foreground dark:hover:bg-white/10"
                    aria-label="Zoom in"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </button>
                  <span className="w-9 select-none text-right text-[11px] leading-none text-foreground/50">{zoom}%</span>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
