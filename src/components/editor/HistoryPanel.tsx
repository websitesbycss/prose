import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Editor } from '@tiptap/react'
import type { Snapshot } from '@/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractText).join(' ')
  }
  return ''
}

function contentToPlainText(contentStr: string): string {
  try {
    return extractText(JSON.parse(contentStr) as unknown).trim()
  } catch {
    return ''
  }
}

function truncate(text: string, max = 120): string {
  return text.length > max ? text.slice(0, max) + '…' : text
}

function fmtTime(d: Date): string {
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'pm' : 'am'
  h = h % 12 || 12
  return `${h}:${m}${ampm}`
}

function fmtDate(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'} ago`
  const d = new Date(dateStr)
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === yest.toDateString()) return `Yesterday ${fmtTime(d)}`
  return `${fmtDate(d)} ${fmtTime(d)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface HistoryPanelProps {
  documentId: string
  editor: Editor | null
}

export function HistoryPanel({ documentId, editor }: HistoryPanelProps): JSX.Element {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [restoring, setRestoring] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const snaps = await window.prose.snapshots.getByDocument(documentId)
      setSnapshots(snaps)
      setSelectedId((prev) => {
        // Keep selection if it still exists, otherwise pick most recent
        if (prev && snaps.some((s) => s.id === prev)) return prev
        return snaps.length > 0 ? (snaps[0]?.id ?? null) : null
      })
    } catch {
      setSnapshots([])
      setSelectedId(null)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [documentId])

  // Load on mount / document change
  useEffect(() => {
    setSnapshots([])
    setSelectedId(null)
    setConfirmClear(false)
    setConfirmRestore(false)
    void load()
  }, [documentId, load])

  // Auto-refresh every 20 s so newly created snapshots appear without reopening the panel
  const loadRef = useRef(load)
  loadRef.current = load
  useEffect(() => {
    const id = setInterval(() => { void loadRef.current(true) }, 20_000)
    return () => clearInterval(id)
  }, [])

  const selected = snapshots.find((s) => s.id === selectedId) ?? null

  const previewText = selected
    ? truncate(contentToPlainText(selected.content))
    : editor
      ? truncate(editor.getText())
      : ''
  const previewLabel = selected ? relativeTime(selected.createdAt) : 'current version'

  async function handleRestore(): Promise<void> {
    if (!selected) return
    setRestoring(true)
    try {
      await window.prose.snapshots.restore(selected.id)
      if (editor) {
        const json = JSON.parse(selected.content) as object
        editor.commands.setContent(json, false)
      }
      toast.success('Version restored')
      setConfirmRestore(false)
      setPreviewOpen(false)
    } catch {
      toast.error('Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  async function handleClearAll(): Promise<void> {
    try {
      await window.prose.snapshots.deleteAll(documentId)
      setSnapshots([])
      setSelectedId(null)
      setConfirmClear(false)
    } catch {
      toast.error('Failed to clear history')
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">Version History</span>
          <button
            onClick={() => void load()}
            className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
        {!confirmClear ? (
          <button
            className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setConfirmClear(true)}
            disabled={snapshots.length === 0}
          >
            clear
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">are you sure?</span>
            <button
              className="text-[10px] font-medium text-destructive hover:underline"
              onClick={() => void handleClearAll()}
            >
              yes, clear
            </button>
            <button
              className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setConfirmClear(false)}
            >
              cancel
            </button>
          </div>
        )}
      </div>

      {/* ── Preview block ── */}
      <div className="shrink-0 px-3 pb-2">
        <div className="rounded-lg border border-border bg-muted/5 px-3 py-2.5">
          <p className="mb-1 text-[10px] text-muted-foreground">{previewLabel}</p>
          <p className="break-words font-serif text-[11px] leading-relaxed text-muted-foreground">
            {previewText || <span className="italic opacity-50">No content</span>}
          </p>
        </div>
      </div>

      {/* ── Snapshot list ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-1">
        {loading && (
          <div className="flex flex-col gap-2 pt-1">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="mt-2 h-2 w-2 shrink-0 animate-pulse rounded-full bg-muted/30" />
                <div className="flex flex-1 flex-col gap-1.5 pt-0.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted/30" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && snapshots.length === 0 && (
          <p className="mt-4 px-2 text-center text-[11px] leading-relaxed text-muted-foreground/60">
            No history yet — snapshots are saved automatically every 5 minutes.
          </p>
        )}

        {!loading && snapshots.length > 0 && (
          <div className="flex flex-col">
            {snapshots.map((snap, idx) => {
              const isFirst = idx === 0
              const isLast = idx === snapshots.length - 1
              const isSelected = snap.id === selectedId
              const saveType = snap.label !== null ? 'manual save' : 'auto-saved'

              return (
                <div key={snap.id} className="flex items-stretch gap-2">
                  {/* Timeline column */}
                  <div className="flex w-4 shrink-0 flex-col items-center">
                    <div
                      className="mt-[9px] h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: isFirst
                          ? 'hsl(var(--primary))'
                          : 'hsl(var(--muted-foreground) / 0.2)',
                      }}
                    />
                    {!isLast && (
                      <div
                        className="my-0.5 w-px flex-1 bg-border"
                        style={{ minHeight: 18 }}
                      />
                    )}
                  </div>

                  {/* Row button */}
                  <button
                    className={cn(
                      'mb-0.5 flex flex-1 items-start justify-between rounded-md px-2 py-1.5 text-left transition-colors',
                      isSelected
                        ? 'border border-primary/20 bg-primary/[0.08]'
                        : 'hover:bg-muted/30'
                    )}
                    onClick={() => setSelectedId(snap.id)}
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium leading-tight text-foreground">
                        {relativeTime(snap.createdAt)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {snap.wordCount.toLocaleString()} words · {saveType}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'ml-2 mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-medium',
                        isFirst
                          ? 'border-primary/25 bg-primary/[0.12] text-primary/80'
                          : 'border-border bg-muted/10 text-muted-foreground/50'
                      )}
                    >
                      {isFirst ? 'current' : 'auto'}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Action buttons ── */}
      <div className="shrink-0 border-t border-border px-3 py-2.5">
        {confirmRestore ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] text-muted-foreground">
              this will overwrite your current draft —
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-7 flex-1 border-primary/25 bg-primary/[0.12] text-[11px] text-primary/80 hover:bg-primary/20 hover:text-primary"
                disabled={restoring}
                onClick={() => void handleRestore()}
              >
                {restoring ? 'restoring…' : 'confirm restore'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px] text-muted-foreground"
                onClick={() => setConfirmRestore(false)}
              >
                cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 text-[11px]"
              disabled={!selected}
              onClick={() => setPreviewOpen(true)}
            >
              preview
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 flex-1 border-primary/25 bg-primary/[0.12] text-[11px] text-primary/80 hover:bg-primary/20 hover:text-primary"
              disabled={!selected}
              onClick={() => setConfirmRestore(true)}
            >
              restore
            </Button>
          </div>
        )}
      </div>

      {/* ── Full preview modal ── */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="flex max-h-[70vh] max-w-2xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium">
              {selected ? relativeTime(selected.createdAt) : 'Preview'}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-muted/5 p-4">
            <p className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-foreground">
              {selected ? contentToPlainText(selected.content) : ''}
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-primary/25 bg-primary/[0.12] text-primary/80 hover:bg-primary/20 hover:text-primary"
              disabled={restoring || !selected}
              onClick={() => void handleRestore()}
            >
              {restoring ? 'Restoring…' : 'Restore this version'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
