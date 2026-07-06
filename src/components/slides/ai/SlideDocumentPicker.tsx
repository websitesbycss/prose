// Document picker for the Slides "Generate from documents" mode — lets the
// user choose exactly which Prose Documents the AI should read, instead of
// silently grabbing the first few in the library. Search + list are always
// sorted by most-recently-modified (same default order as the Dashboard);
// there is no sort control by design.
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Search, FileText } from 'lucide-react'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { cn } from '@/lib/utils'

interface PickerDoc {
  id: string
  title: string
  updatedAt: string
}

interface Props {
  selectedIds: Set<string>
  onToggle(id: string): void
  instructions: string
  onInstructionsChange(v: string): void
}

function Checkbox({ checked }: { checked: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-input bg-background',
      )}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5.2 4 7.7 8.5 2.3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

export function SlideDocumentPicker({ selectedIds, onToggle, instructions, onInstructionsChange }: Props): JSX.Element {
  const [docs, setDocs] = useState<PickerDoc[] | null>(null)
  const [search, setSearch] = useState('')
  const [previewDoc, setPreviewDoc] = useState<PickerDoc | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.prose.documents.getAll().then((all) => {
      if (cancelled) return
      const docsOnly = all
        .filter((d) => (d.fileType ?? 'document') === 'document')
        .map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      setDocs(docsOnly)
    })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    if (!docs) return []
    const q = search.trim().toLowerCase()
    if (!q) return docs
    return docs.filter((d) => d.title.toLowerCase().includes(q))
  }, [docs, search])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] text-muted-foreground">
        Select documents for the AI to read, then describe what you want below.
      </p>

      {/* Search */}
      <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          placeholder="Search documents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="max-h-72 overflow-y-auto rounded-md border border-border">
        {docs === null && (
          <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">Loading documents…</p>
        )}
        {docs !== null && filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            {docs.length === 0 ? 'No documents yet.' : 'No documents match your search.'}
          </p>
        )}
        {filtered.map((doc, i) => (
          <div
            key={doc.id}
            className={cn(
              'flex cursor-pointer items-center gap-2 px-2 py-1.5 transition-colors hover:bg-accent/50',
              i !== filtered.length - 1 && 'border-b border-border',
            )}
            onClick={() => { setPreviewDoc(doc); setPreviewOpen(true) }}
          >
            <button
              type="button"
              className="shrink-0 p-0.5"
              onClick={(e) => { e.stopPropagation(); onToggle(doc.id) }}
            >
              <Checkbox checked={selectedIds.has(doc.id)} />
            </button>
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-xs text-foreground">{doc.title}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </div>
        ))}
      </div>

      {/* Additional instructions */}
      <textarea
        className="h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Optional instructions — e.g. &quot;create 8 slides&quot; or &quot;use a two-column layout for comparisons&quot;"
        value={instructions}
        onChange={(e) => onInstructionsChange(e.target.value)}
      />

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        documentId={previewDoc?.id ?? null}
        documentTitle={previewDoc?.title ?? ''}
      />
    </div>
  )
}
