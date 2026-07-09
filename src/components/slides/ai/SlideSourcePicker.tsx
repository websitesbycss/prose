// Unified Generate-tab source picker — "+ Add a source" opens a small menu
// (Documents / Spreadsheets / Images); picking a document/sheet row adds it
// immediately and closes the menu. All kinds share one ordered list and one
// combined cap, mirroring the design's SapSourcePicker.
import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Table2, Image as ImageIcon, ChevronLeft, Plus, Search, X, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { isSheetContent } from '@/types/sheet'
import { computeUsedRange } from './sheetSource'
import { IMAGE_CAP, openImagePicker, type AttachedImage } from '@/components/editor/imageAttachments'
import { ImageEnlargeModal, type ImagePreview } from '@/components/editor/ImagePill'
import { DocumentPreviewModal } from './DocumentPreviewModal'
import { SheetPreviewModal } from './SheetPreviewModal'

export type SourceAttachment =
  | { kind: 'document'; id: string; title: string }
  | { kind: 'sheet'; id: string; title: string; range: string }
  | ({ kind: 'image' } & AttachedImage)

export const SOURCE_CAP = 5

interface PickerFile { id: string; title: string }

function useLibraryFiles(open: boolean, fileType: 'document' | 'sheet'): PickerFile[] {
  const [files, setFiles] = useState<PickerFile[]>([])
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.prose.documents.getAll().then((all) => {
      if (cancelled) return
      setFiles(
        all
          .filter((d) => (d.fileType ?? 'document') === fileType)
          .map((d) => ({ id: d.id, title: d.title })),
      )
    })
    return () => { cancelled = true }
  }, [open, fileType])
  return files
}

interface Props {
  attachments: SourceAttachment[]
  onAdd(a: SourceAttachment): void
  onRemove(id: string): void
  onRangeChange(id: string, range: string): void
}

export function SlideSourcePicker({ attachments, onAdd, onRemove, onRangeChange }: Props): JSX.Element {
  const multimodalCapable = useAppStore((s) => s.multimodalCapable)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu' | 'document' | 'sheet'>('menu')
  const [search, setSearch] = useState('')
  const [previewDoc, setPreviewDoc] = useState<PickerFile | null>(null)
  const [previewSheet, setPreviewSheet] = useState<{ file: PickerFile; range: string } | null>(null)
  const [enlarged, setEnlarged] = useState<ImagePreview | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setView('menu'); setSearch('') }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const atCap = attachments.length >= SOURCE_CAP
  const docs = useLibraryFiles(view === 'document', 'document')
  const sheets = useLibraryFiles(view === 'sheet', 'sheet')

  const selectedIds = useMemo(
    () => new Set(attachments.filter((a) => a.kind !== 'image').map((a) => a.id)),
    [attachments],
  )
  const filtered = useMemo(() => {
    const list = view === 'document' ? docs : view === 'sheet' ? sheets : []
    const q = search.trim().toLowerCase()
    const unpicked = list.filter((f) => !selectedIds.has(f.id))
    return q ? unpicked.filter((f) => f.title.toLowerCase().includes(q)) : unpicked
  }, [view, docs, sheets, search, selectedIds])

  async function selectDocument(file: PickerFile): Promise<void> {
    if (atCap) return
    onAdd({ kind: 'document', id: file.id, title: file.title })
    setOpen(false); setView('menu'); setSearch('')
  }

  async function selectSheet(file: PickerFile): Promise<void> {
    if (atCap) return
    let range = 'A1:F20'
    try {
      const doc = await window.prose.documents.getById(file.id)
      const raw = typeof doc?.content === 'string' ? JSON.parse(doc.content) : doc?.content
      if (isSheetContent(raw)) {
        const tab = raw.tabs.find((t) => t.id === raw.activeTabId) ?? raw.tabs[0]
        if (tab) range = computeUsedRange(tab) ?? range
      }
    } catch { /* fall back to default range */ }
    onAdd({ kind: 'sheet', id: file.id, title: file.title, range })
    setOpen(false); setView('menu'); setSearch('')
  }

  function pickImages(): void {
    openImagePicker(Math.min(IMAGE_CAP, SOURCE_CAP - attachments.length), (imgs) => {
      for (const img of imgs) onAdd({ kind: 'image', ...img })
    })
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5">
        <p className="text-[11px] leading-none text-muted-foreground">Sources</p>
        <span className="group relative inline-flex items-center leading-none" tabIndex={0}>
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="pointer-events-none absolute left-0 top-full z-30 mt-1.5 w-48 rounded-md border border-border bg-popover p-2 text-[11px] leading-snug text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
            Add up to 5 sources for the AI to read: documents, spreadsheets, or images.
          </span>
        </span>
      </div>

      {attachments.length > 0 && (
        <div className="mb-2 flex flex-col gap-1">
          {attachments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5">
              {a.kind === 'document' && <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
              {a.kind === 'sheet' && <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" />}
              {a.kind === 'image' && (
                <img src={a.url} alt="" className="h-3 w-3 shrink-0 rounded-sm object-cover" draggable={false} />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:underline"
                onClick={() => {
                  if (a.kind === 'document') setPreviewDoc({ id: a.id, title: a.title })
                  else if (a.kind === 'sheet') setPreviewSheet({ file: { id: a.id, title: a.title }, range: a.range })
                  else setEnlarged(a)
                }}
              >
                {a.kind === 'image' ? a.name : a.title}
              </button>
              {a.kind === 'sheet' && (
                <input
                  className="shrink-0 rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground outline-none focus:text-foreground focus:ring-1 focus:ring-ring"
                  style={{ width: `${Math.max(a.range.length, 2) + 1.5}ch` }}
                  spellCheck={false}
                  value={a.range}
                  onChange={(e) => onRangeChange(a.id, e.target.value)}
                />
              )}
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => onRemove(a.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative" ref={ref}>
        {!atCap && (
          <button
            type="button"
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-muted-foreground hover:text-foreground"
            onClick={() => setOpen((o) => !o)}
          >
            <Plus className="h-3 w-3" /> Add a source
          </button>
        )}

        {open && view === 'menu' && (
          <div className="absolute inset-x-0 top-0 z-20 flex flex-col gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <button className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-accent" onClick={() => setView('document')}>
              <FileText className="h-3.5 w-3.5" /> Documents
            </button>
            <button className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-accent" onClick={() => setView('sheet')}>
              <Table2 className="h-3.5 w-3.5" /> Spreadsheets
            </button>
            {multimodalCapable && (
              <button className="flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium text-popover-foreground hover:bg-accent" onClick={pickImages}>
                <ImageIcon className="h-3.5 w-3.5" /> Images
              </button>
            )}
          </div>
        )}

        {open && view !== 'menu' && (
          <div className="absolute inset-x-0 top-0 z-20 rounded-lg border border-border bg-popover shadow-lg">
            <button
              className="flex items-center gap-1 px-2 pb-1 pt-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => { setView('menu'); setSearch('') }}
            >
              <ChevronLeft className="h-3 w-3" /> Back
            </button>
            <div className="mx-2 mb-2 flex items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5">
              <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
              <input
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                placeholder={`Search ${view === 'sheet' ? 'spreadsheets' : 'documents'}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="mx-2 mb-2 max-h-40 overflow-y-auto rounded-md border border-border">
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-[11px] text-muted-foreground">No matches.</p>
              )}
              {filtered.map((f, i) => (
                <div
                  key={f.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-accent/50',
                    i !== filtered.length - 1 && 'border-b border-border',
                  )}
                  onClick={() => void (view === 'sheet' ? selectSheet(f) : selectDocument(f))}
                >
                  {view === 'sheet' ? <Table2 className="h-3 w-3 shrink-0 text-muted-foreground" /> : <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{f.title}</span>
                  <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DocumentPreviewModal
        open={!!previewDoc}
        onClose={() => setPreviewDoc(null)}
        documentId={previewDoc?.id ?? null}
        documentTitle={previewDoc?.title ?? ''}
      />
      <SheetPreviewModal
        open={!!previewSheet}
        onClose={() => setPreviewSheet(null)}
        documentId={previewSheet?.file.id ?? null}
        documentTitle={previewSheet?.file.title ?? ''}
        range={previewSheet?.range ?? 'A1:F20'}
      />
      <ImageEnlargeModal image={enlarged} onClose={() => setEnlarged(null)} />
    </div>
  )
}
