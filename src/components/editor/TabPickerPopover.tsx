import { useEffect, useMemo, useState } from 'react'
import { Search, Pin, FileText, Table2, Shapes, Plus, GalleryVerticalEnd } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { loadPinnedIds } from '@/lib/pinnedDocs'
import { FORMAT_LABELS } from '@/lib/documentFormat'
import { cn, formatRelativeTime } from '@/lib/utils'
import type { Document, FileType } from '@/types'
import { useAppStore } from '@/store/appStore'

const FILE_TYPE_ICONS: Record<FileType, React.FC<{ className?: string }>> = {
  document: FileText,
  sheet: Table2,
  board: Shapes,
  slides: GalleryVerticalEnd,
}

interface TabPickerPopoverProps {
  onOpenDocument(): void
  onNewDocument(): void
}

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 7 * 24 * 60 * 60 * 1000
}

function PickerRow({
  doc,
  pinned,
  onSelect,
}: {
  doc: Document
  pinned?: boolean
  onSelect(): void
}): JSX.Element {
  const formatLabel = FORMAT_LABELS[doc.format]
  const fileType = doc.fileType ?? 'document'
  const TypeIcon = FILE_TYPE_ICONS[fileType]

  return (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
      onClick={onSelect}
    >
      <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{doc.title}</span>
      {formatLabel && (
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {formatLabel}
        </span>
      )}
      {pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />}
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatRelativeTime(doc.updatedAt)}
      </span>
    </button>
  )
}

export function TabPickerPopover({ onOpenDocument, onNewDocument }: TabPickerPopoverProps): JSX.Element {
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const [documents, setDocuments] = useState<Document[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void window.prose.documents.getAll().then((docs) => {
      if (!cancelled) {
        setDocuments(docs as Document[])
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [])

  const pinnedIds = useMemo(() => loadPinnedIds(), [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? documents.filter((d) => d.title.toLowerCase().includes(q))
      : documents
    return [...list].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
  }, [documents, search])

  const pinnedDocs = useMemo(
    () => filtered.filter((d) => pinnedIds.has(d.id)),
    [filtered, pinnedIds],
  )

  const recentDocs = useMemo(() => {
    const unpinned = filtered.filter((d) => !pinnedIds.has(d.id))
    if (search.trim()) return unpinned.slice(0, 12)
    const recent = unpinned.filter((d) => isRecent(d.updatedAt))
    return (recent.length > 0 ? recent : unpinned).slice(0, 8)
  }, [filtered, pinnedIds, search])

  function selectDoc(doc: Document): void {
    openDocumentTab({ id: doc.id, title: doc.title, format: doc.format, fileType: doc.fileType ?? 'document' })
    onOpenDocument()
  }

  return (
    <div className="flex w-[350px] flex-col" onPointerDown={(e) => e.stopPropagation()}>
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        <div className="w-full min-w-0 space-y-3 px-2 pt-2 pb-4">
          {loading && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">Loading…</p>
          )}

          {!loading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No documents found</p>
          )}

          {!loading && pinnedDocs.length > 0 && (
            <section>
              <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Pinned
              </p>
              <div className="space-y-0.5">
                {pinnedDocs.map((doc) => (
                  <PickerRow key={doc.id} doc={doc} pinned onSelect={() => selectDoc(doc)} />
                ))}
              </div>
            </section>
          )}

          {!loading && recentDocs.length > 0 && (
            <section>
              <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {search.trim() ? 'Results' : 'Recent'}
              </p>
              <div className="space-y-0.5">
                {recentDocs.map((doc) => (
                  <PickerRow key={doc.id} doc={doc} onSelect={() => selectDoc(doc)} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <div className="border-t border-border p-2">
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
            'text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
          )}
          onClick={onNewDocument}
        >
          <Plus className="h-3.5 w-3.5" />
          New file
        </button>
      </div>
    </div>
  )
}
