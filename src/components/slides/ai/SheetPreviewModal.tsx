// Read-only grid preview for a Sheet picked as a Generate-tab source — mirrors
// DocumentPreviewModal's role but renders a plain HTML table snapshot of the
// sheet's used range instead of rasterizing PDF pages (a live FortuneSheet
// Workbook isn't needed just to look at cell values).
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { isSheetContent, type SheetTab } from '@/types/sheet'
import { sheetTabToCellGrid, parseRange } from '@/components/sheets/chartUtils'

interface Props {
  open: boolean
  onClose(): void
  documentId: string | null
  documentTitle: string
  range: string
}

const PREVIEW_ROW_CAP = 60
const PREVIEW_COL_CAP = 26

export function SheetPreviewModal({ open, onClose, documentId, documentTitle, range }: Props): JSX.Element {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<SheetTab | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open || !documentId) return
    setLoading(true)
    setTab(null)
    setError(false)
    let cancelled = false

    void window.prose.documents.getById(documentId).then((doc) => {
      if (cancelled) return
      try {
        const raw = typeof doc?.content === 'string' ? JSON.parse(doc.content) : doc?.content
        if (isSheetContent(raw)) {
          const activeTab = raw.tabs.find((t) => t.id === raw.activeTabId) ?? raw.tabs[0]
          setTab(activeTab ?? null)
        } else {
          setError(true)
        }
      } catch {
        setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [open, documentId])

  const grid = tab ? sheetTabToCellGrid(tab) : []
  const rng = parseRange(range)
  const rowCount = rng ? Math.min(rng.r2 - rng.r1 + 1, PREVIEW_ROW_CAP) : 0
  const colCount = rng ? Math.min(rng.c2 - rng.c1 + 1, PREVIEW_COL_CAP) : 0

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="flex h-[560px] max-h-[90vh] w-[720px] max-w-[92vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="truncate pr-6 text-sm font-semibold">{documentTitle}</DialogTitle>
        </DialogHeader>

        <div className="relative flex-1 overflow-auto bg-neutral-300 p-4 dark:bg-neutral-600">
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
              <span className="select-none text-xs text-foreground/50">Loading sheet…</span>
            </div>
          )}
          {!loading && (error || !tab || !rng) && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="text-center text-xs text-foreground/60">Couldn&apos;t preview this sheet.</p>
            </div>
          )}
          {!loading && tab && rng && (
            <table className="border-collapse bg-white text-xs shadow-lg dark:bg-neutral-800">
              <tbody>
                {Array.from({ length: rowCount }, (_, r) => (
                  <tr key={r}>
                    {Array.from({ length: colCount }, (_, c) => {
                      const cell = grid[rng.r1 + r]?.[rng.c1 + c]
                      const v = cell?.m ?? cell?.v
                      return (
                        <td
                          key={c}
                          className="whitespace-nowrap border border-neutral-200 px-2 py-1 text-foreground dark:border-neutral-700"
                        >
                          {v !== undefined && v !== null ? String(v) : ''}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
