import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import {
  Plus, Search, Settings, X, Upload, FileText, Pin,
  Pencil, Trash2, Download, ArrowRight, ChevronRight, FolderOpen, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import NewDocumentModal from './NewDocumentModal'
import SettingsModal from '@/components/settings/SettingsModal'
import { DocContextMenu } from './DocContextMenu'
import type { Document, Category, ImportResult } from '@/types'
import { useAppStore } from '@/store/appStore'
import { formatRelativeTime, extractWordCount, cn } from '@/lib/utils'

// ── Pinned docs ───────────────────────────────────────────────────────────────

const PINNED_KEY = 'prose-pinned-docs'

function loadPinnedIds(): Set<string> {
  try {
    const v = localStorage.getItem(PINNED_KEY)
    return new Set(v ? (JSON.parse(v) as string[]) : [])
  } catch { return new Set() }
}

function savePinnedIds(ids: Set<string>): void {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify([...ids])) } catch { /* noop */ }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type SortBy = 'recent' | 'name' | 'words'
type FilterKey = 'all' | 'pinned' | string

const FORMAT_LABELS: Record<string, string> = {
  mla: 'MLA', apa: 'APA', chicago: 'Chicago', ieee: 'IEEE',
}

const CATEGORY_COLORS = [
  '#7F77DD', '#E879A0', '#34D399', '#FBBF24',
  '#60A5FA', '#F87171', '#A78BFA', '#2DD4BF',
]

function isRecent(dateStr: string): boolean {
  return Date.now() - new Date(dateStr).getTime() < 7 * 24 * 60 * 60 * 1000
}

function sortedDocs(docs: Document[], sortBy: SortBy): Document[] {
  return [...docs].sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title)
    if (sortBy === 'words') return ((b.wordCount ?? extractWordCount(b.content)) - (a.wordCount ?? extractWordCount(a.content)))
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard(): JSX.Element {
  const setCurrentDocumentId = useAppStore((s) => s.setCurrentDocumentId)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  const [documents, setDocuments] = useState<Document[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]!)
  const [addingCat, setAddingCat] = useState(false)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPinnedIds)
  const [ctxMenu, setCtxMenu] = useState<{ doc: Document; x: number; y: number } | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const catInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void loadAll() }, [])
  useEffect(() => { if (addingCat) catInputRef.current?.focus() }, [addingCat])

  async function loadAll(): Promise<void> {
    try {
      const [docs, cats] = await Promise.all([
        window.prose.documents.getAll() as Promise<Document[]>,
        window.prose.categories.getAll() as Promise<Category[]>,
      ])
      setDocuments(docs)
      setCategories(cats)
    } catch (err) { console.error('Load error:', err) }
  }

  const handleImportResult = useCallback((result: ImportResult) => {
    if (result.imported.length > 0) {
      setDocuments((prev) => [...result.imported as Document[], ...prev])
      toast.success(`Imported ${result.imported.length} document${result.imported.length !== 1 ? 's' : ''}`)
    }
    if (result.errors.length > 0)
      toast.error(`${result.errors.length} file${result.errors.length !== 1 ? 's' : ''} could not be imported`)
  }, [])

  async function handleImport(): Promise<void> {
    if (importing) return
    setImporting(true)
    try { handleImportResult(await window.prose.documents.importFiles() as ImportResult) }
    catch { toast.error('Import failed') } finally { setImporting(false) }
  }

  function handleDragOver(e: React.DragEvent): void {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    e.preventDefault(); setDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent): void {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false)
  }
  async function handleDrop(e: React.DragEvent): Promise<void> {
    e.preventDefault(); setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as File & { path?: string }).path).filter(Boolean) as string[]
    if (!paths.length) return
    setImporting(true)
    try { handleImportResult(await window.prose.documents.importFiles(paths) as ImportResult) }
    catch { toast.error('Import failed') } finally { setImporting(false) }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return
    try {
      await window.prose.documents.delete(deleteTarget.id)
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id))
      setPinnedIds((prev) => { const n = new Set(prev); n.delete(deleteTarget.id); savePinnedIds(n); return n })
      toast.success('Document deleted')
    } catch { toast.error('Delete failed') } finally { setDeleteTarget(null) }
  }

  async function handleCreateCategory(): Promise<void> {
    const name = newCatName.trim()
    if (!name) return
    try {
      const cat = await window.prose.categories.create({ name, color: newCatColor } as Parameters<typeof window.prose.categories.create>[0])
      setCategories((prev) => [...prev, cat as Category])
      setNewCatName(''); setNewCatColor(CATEGORY_COLORS[0]!); setAddingCat(false)
    } catch { toast.error('Failed to create category') }
  }

  async function handleDeleteCategory(id: string): Promise<void> {
    try {
      await window.prose.categories.delete(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      if (filter === id) setFilter('all')
    } catch { console.error('Delete category error') }
  }

  function togglePin(id: string): void {
    setPinnedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      savePinnedIds(n); return n
    })
  }

  async function handleRename(id: string, title: string): Promise<void> {
    await window.prose.documents.update(id, { title })
    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, title } : d))
  }

  async function handleCtxExport(format: string): Promise<void> {
    if (!ctxMenu) return
    const id = ctxMenu.doc.id
    const fns: Record<string, () => Promise<unknown>> = {
      docx:      () => window.prose.export.toDocx(id),
      pdf:       () => window.prose.export.toPdf(id),
      markdown:  () => window.prose.export.toMarkdown(id),
      plaintext: () => window.prose.export.toPlainText(id),
    }
    try { await fns[format]?.(); toast.success('Exported') }
    catch { toast.error('Export failed') }
  }

  async function handleCtxSetCategory(categoryId: string | null): Promise<void> {
    if (!ctxMenu) return
    const id = ctxMenu.doc.id
    await window.prose.documents.update(id, { categoryId: categoryId ?? undefined })
    setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, categoryId: categoryId ?? undefined } : d))
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      if (filter === 'pinned') return pinnedIds.has(doc.id)
      if (filter !== 'all') return doc.categoryId === filter
      return true
    }).filter((doc) => !search || doc.title.toLowerCase().includes(search.toLowerCase()))
  }, [documents, filter, pinnedIds, search])

  const continueDoc = useMemo<Document | null>(() => {
    if (filter !== 'all' || search || documents.length === 0) return null
    return sortedDocs(documents, 'recent')[0] ?? null
  }, [documents, filter, search])

  const { pinnedList, restList } = useMemo(() => {
    const sorted = sortedDocs(filtered, sortBy)
    if (filter === 'pinned') return { pinnedList: sorted, restList: [] }
    return {
      pinnedList: sorted.filter((d) => pinnedIds.has(d.id)),
      restList: sorted.filter((d) => !pinnedIds.has(d.id)),
    }
  }, [filtered, sortBy, pinnedIds, filter])

  const { todayList, olderList } = useMemo(() => {
    if (sortBy !== 'recent') return { todayList: [], olderList: restList }
    return {
      todayList: restList.filter((d) => isRecent(d.updatedAt)),
      olderList: restList.filter((d) => !isRecent(d.updatedAt)),
    }
  }, [restList, sortBy])

  const pinnedCount = useMemo(
    () => [...pinnedIds].filter((id) => documents.some((d) => d.id === id)).length,
    [pinnedIds, documents]
  )

  // ── Row renderer ───────────────────────────────────────────────────────────

  function renderRow(doc: Document): JSX.Element {
    return (
      <DocRow
        key={doc.id}
        doc={doc}
        categories={categories}
        pinned={pinnedIds.has(doc.id)}
        startEditing={renamingId === doc.id}
        onEditStarted={() => setRenamingId(null)}
        onOpen={() => setCurrentDocumentId(doc.id)}
        onPin={() => togglePin(doc.id)}
        onRename={(title) => handleRename(doc.id, title)}
        onDelete={() => setDeleteTarget(doc)}
        onSetCategory={(categoryId) => handleCtxSetCategory(categoryId)}
        onCreateCategory={async (name, color) => {
          const cat = await window.prose.categories.create({ name, color } as Parameters<typeof window.prose.categories.create>[0])
          setCategories((prev) => [...prev, cat as Category])
        }}
        onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ doc, x: e.clientX, y: e.clientY }) }}
      />
    )
  }

  // ── JSX ────────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('flex h-screen bg-background text-foreground', dragOver && 'ring-2 ring-inset ring-primary/50')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-border">
        <div className="flex h-[52px] shrink-0 items-center px-4 border-b border-border">
          <span className="text-base font-bold tracking-tight text-primary">Prose</span>
        </div>

        <ScrollArea className="flex-1">
          <nav className="flex flex-col gap-0.5 p-2 pb-4">
            <NavItem
              icon={<FileText className="h-3.5 w-3.5" />}
              label="All documents"
              active={filter === 'all'}
              count={documents.length || undefined}
              onClick={() => setFilter('all')}
            />
            <NavItem
              icon={<Pin className="h-3.5 w-3.5" />}
              label="Pinned"
              active={filter === 'pinned'}
              count={pinnedCount || undefined}
              onClick={() => setFilter('pinned')}
            />

            <div className="mt-4 mb-1 px-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
                Categories
              </span>
            </div>

            {categories.map((cat) => (
              <div key={cat.id} className="group/cat flex items-center gap-0.5">
                <NavItem
                  dot={cat.color}
                  label={cat.name}
                  active={filter === cat.id}
                  count={documents.filter((d) => d.categoryId === cat.id).length || undefined}
                  onClick={() => setFilter(cat.id)}
                  className="flex-1"
                />
                <button
                  onClick={() => void handleDeleteCategory(cat.id)}
                  className="hidden group-hover/cat:flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground shrink-0 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            <AnimatePresence mode="wait">
              {addingCat ? (
                <motion.div
                  key="cat-form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-1.5 px-1 py-2">
                    <Input
                      ref={catInputRef}
                      className="h-7 text-xs"
                      placeholder="Category name"
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleCreateCategory()
                        if (e.key === 'Escape') setAddingCat(false)
                      }}
                    />
                    <div className="flex flex-wrap gap-1 px-1">
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewCatColor(color)}
                          className="h-4 w-4 rounded-full transition-all"
                          style={{
                            backgroundColor: color,
                            outline: newCatColor === color ? `2px solid ${color}` : '2px solid transparent',
                            outlineOffset: '2px',
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 flex-1 text-xs" onClick={() => void handleCreateCategory()} disabled={!newCatName.trim()}>
                        Add
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setAddingCat(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.button
                  key="add-cat"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => setAddingCat(true)}
                  className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/40 transition-colors w-full"
                >
                  <Plus className="h-3 w-3" />
                  Add category
                </motion.button>
              )}
            </AnimatePresence>
          </nav>
        </ScrollArea>

        <div className="border-t border-border p-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            Settings
            <ChevronRight className="ml-auto h-3 w-3 opacity-40" />
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
          <div className="relative max-w-[280px] flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Sort toggle — sits immediately right of search */}
          <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5 gap-0.5">
            {(['recent', 'name', 'words'] as SortBy[]).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors',
                  sortBy === s
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s === 'recent' ? 'Recent' : s === 'name' ? 'Name' : 'Words'}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-8 gap-1.5 text-xs"
            onClick={() => void handleImport()}
            disabled={importing}
            title="Import .prose, .md, or .docx"
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNewDocOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New document
          </Button>
        </header>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0 p-5">
            {dragOver && (
              <div className="mb-5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 text-center text-sm text-primary">
                Drop .prose, .md, or .docx files to import
              </div>
            )}

            {documents.length === 0 && !dragOver ? (
              <EmptyState onNew={() => setNewDocOpen(true)} />
            ) : filtered.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-2 py-20 text-center"
              >
                {search ? (
                  <p className="text-sm text-muted-foreground">
                    No documents match <span className="font-medium text-foreground">"{search}"</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents in this view</p>
                )}
              </motion.div>
            ) : (
              <div className="flex flex-col gap-8">
                {/* Continue writing */}
                {continueDoc && (
                  <ContinueCard
                    doc={continueDoc}
                    categories={categories}
                    onOpen={() => setCurrentDocumentId(continueDoc.id)}
                  />
                )}

                {/* Pinned */}
                {pinnedList.length > 0 && (
                  <Section label="Pinned">
                    {pinnedList.map(renderRow)}
                  </Section>
                )}

                {/* Recent: Today / Older */}
                {sortBy === 'recent' ? (
                  <>
                    {todayList.length > 0 && (
                      <Section label="Recent">{todayList.map(renderRow)}</Section>
                    )}
                    {olderList.length > 0 && (
                      <Section label="Older">{olderList.map(renderRow)}</Section>
                    )}
                  </>
                ) : restList.length > 0 && (
                  <Section label={sortBy === 'name' ? 'A – Z' : 'By word count'}>
                    {restList.map(renderRow)}
                  </Section>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Document right-click context menu */}
      <DocContextMenu
        doc={ctxMenu?.doc ?? null}
        pinned={ctxMenu ? pinnedIds.has(ctxMenu.doc.id) : false}
        categories={categories}
        position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onDismiss={() => setCtxMenu(null)}
        onPin={() => ctxMenu && togglePin(ctxMenu.doc.id)}
        onRename={() => ctxMenu && setRenamingId(ctxMenu.doc.id)}
        onDelete={() => ctxMenu && setDeleteTarget(ctxMenu.doc)}
        onExport={(format) => handleCtxExport(format)}
        onSetCategory={(categoryId) => handleCtxSetCategory(categoryId)}
        onCreateCategory={async (name, color) => {
          const cat = await window.prose.categories.create({ name, color } as Parameters<typeof window.prose.categories.create>[0])
          setCategories((prev) => [...prev, cat as Category])
        }}
      />

      {/* Modals */}
      <NewDocumentModal
        open={newDocOpen}
        categories={categories}
        onClose={() => setNewDocOpen(false)}
        onCreated={(doc) => {
          setDocuments((prev) => [doc, ...prev])
          setNewDocOpen(false)
          setCurrentDocumentId(doc.id)
        }}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.title}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface NavItemProps {
  icon?: React.ReactNode
  dot?: string
  label: string
  active: boolean
  count?: number
  onClick: () => void
  className?: string
}

function NavItem({ icon, dot, label, active, count, onClick, className = '' }: NavItemProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
        className
      )}
    >
      {icon && <span className="shrink-0 opacity-60">{icon}</span>}
      {dot && <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="flex-1 truncate text-left">{label}</span>
      {count !== undefined && (
        <span className={cn('tabular-nums text-[10px]', active ? 'text-accent-foreground/60' : 'text-muted-foreground/50')}>
          {count}
        </span>
      )}
    </button>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      {/* Section label left-aligned with icon; column headers mirror DocRow meta exactly */}
      <div className="flex items-center px-3 pb-1 gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 shrink-0">
          {label}
        </span>
        <div className="min-w-0 flex-1" />
        <div className="flex shrink-0 items-center gap-4" style={{ width: 320 }}>
          <span className="w-[68px] shrink-0 text-[10px] font-medium text-muted-foreground/40">Category</span>
          <span className="w-[68px] shrink-0 text-[10px] font-medium text-muted-foreground/40">Format</span>
          <span className="w-[68px] shrink-0 text-[10px] font-medium text-muted-foreground/40">Words</span>
          <span className="w-[68px] shrink-0 text-[10px] font-medium text-muted-foreground/40">Modified</span>
        </div>
      </div>
      {children}
    </div>
  )
}

// ── DocRow ────────────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: Document
  categories: Category[]
  pinned: boolean
  startEditing?: boolean
  onEditStarted?: () => void
  onOpen: () => void
  onPin: () => void
  onRename: (title: string) => Promise<void>
  onDelete: () => void
  onSetCategory: (categoryId: string | null) => Promise<void>
  onCreateCategory: (name: string, color: string) => Promise<void>
  onContextMenu?: (e: React.MouseEvent) => void
}

function DocRow({ doc, categories, pinned, startEditing, onEditStarted, onOpen, onPin, onRename, onDelete, onSetCategory, onCreateCategory, onContextMenu }: DocRowProps): JSX.Element {
  const category = categories.find((c) => c.id === doc.categoryId)
  const wordCount = doc.wordCount ?? extractWordCount(doc.content)
  const formatLabel = FORMAT_LABELS[doc.format]
  const accentColor = category?.color

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(doc.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) { setDraft(doc.title); requestAnimationFrame(() => inputRef.current?.select()) }
  }, [editing, doc.title])

  useEffect(() => {
    if (startEditing) { setEditing(true); onEditStarted?.() }
  }, [startEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commitRename(): void {
    const t = draft.trim()
    if (t && t !== doc.title) void onRename(t)
    setEditing(false)
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-accent/40 cursor-pointer transition-colors"
      onClick={() => { if (!editing) onOpen() }}
      onContextMenu={onContextMenu}
    >
      {/* Icon */}
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors"
        style={{ backgroundColor: accentColor ? accentColor + '20' : 'hsl(var(--muted)/0.5)' }}
      >
        <FileText
          className="h-[15px] w-[15px]"
          style={{ color: accentColor ?? 'hsl(var(--muted-foreground))' }}
        />
      </div>

      {/* Title — no stopPropagation so clicking anywhere on the row opens the doc */}
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-medium text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitRename(); e.currentTarget.blur() }
              if (e.key === 'Escape') setEditing(false)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="block truncate text-sm font-medium text-foreground">
            {doc.title}
          </span>
        )}
      </div>

      {/* Meta / Actions — right side; swap on hover */}
      <div className="relative flex shrink-0 items-center" style={{ width: 320 }}>
        {/* Meta — visible at rest; same widths/gap as Section header columns */}
        <div className="flex items-center gap-4 transition-opacity group-hover:opacity-0">
          <span className="w-[68px] shrink-0 truncate text-[11px] font-medium leading-none"
            style={{ color: accentColor ?? 'hsl(var(--muted-foreground)/0.5)' }}
          >
            {category?.name ?? ''}
          </span>
          <span className="w-[68px] shrink-0 text-[11px] text-muted-foreground/60">
            {formatLabel ?? ''}
          </span>
          <span className="w-[68px] shrink-0 text-[11px] text-muted-foreground/60 tabular-nums">
            {wordCount.toLocaleString()} words
          </span>
          <span className="w-[68px] shrink-0 text-[11px] text-muted-foreground/50">
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </div>

        {/* Actions — visible on hover */}
        <div
          className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionBtn title={pinned ? 'Unpin' : 'Pin'} onClick={onPin} active={pinned}>
            <Pin className="h-3.5 w-3.5" fill={pinned ? 'currentColor' : 'none'} />
          </ActionBtn>
          <ActionBtn title="Rename" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </ActionBtn>
          <ExportMenu documentId={doc.id} documentTitle={doc.title} />
          <CategoryMenu
            doc={doc}
            categories={categories}
            onSetCategory={onSetCategory}
            onCreateCategory={onCreateCategory}
          />
          <ActionBtn title="Delete" onClick={onDelete} destructive>
            <Trash2 className="h-3.5 w-3.5" />
          </ActionBtn>
        </div>
      </div>
    </motion.div>
  )
}

function ActionBtn({
  title, onClick, children, active, destructive,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  active?: boolean
  destructive?: boolean
}): JSX.Element {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded transition-colors',
        destructive
          ? 'text-muted-foreground hover:text-destructive'
          : active
          ? 'text-primary hover:text-primary/80'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </button>
  )
}

function ExportMenu({ documentId, documentTitle }: { documentId: string; documentTitle: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>, typeName: string): Promise<void> {
    setBusy(true); setOpen(false)
    try { await fn(); toast.success(`Exported as ${typeName}`) }
    catch { toast.error('Export failed') }
    finally { setBusy(false) }
  }

  const formats = [
    { name: 'Word (.docx)', typeName: 'Word',       fn: () => window.prose.export.toDocx(documentId) },
    { name: 'PDF (.pdf)',   typeName: 'PDF',         fn: () => window.prose.export.toPdf(documentId) },
    { name: 'Markdown',     typeName: 'Markdown',    fn: () => window.prose.export.toMarkdown(documentId) },
    { name: 'Plain text',   typeName: 'plain text',  fn: () => window.prose.export.toPlainText(documentId) },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          title="Export"
          disabled={busy}
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" side="bottom" align="end">
        {formats.map(({ name, typeName, fn }) => (
          <button
            key={name}
            className="w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            onClick={() => void run(fn, typeName)}
          >
            {name}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

function CategoryMenu({
  doc, categories, onSetCategory, onCreateCategory,
}: {
  doc: Document
  categories: Category[]
  onSetCategory: (id: string | null) => Promise<void>
  onCreateCategory: (name: string, color: string) => Promise<void>
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [addingCat, setAddingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0]!)
  const catInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingCat) setTimeout(() => catInputRef.current?.focus(), 0)
  }, [addingCat])

  function handleOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setAddingCat(false); setNewCatName(''); setNewCatColor(CATEGORY_COLORS[0]!) }
  }

  async function handleCreate() {
    const name = newCatName.trim()
    if (!name) return
    await onCreateCategory(name, newCatColor)
    setAddingCat(false)
    setNewCatName('')
    setNewCatColor(CATEGORY_COLORS[0]!)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          title="Set category"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-1 text-[13px]" side="bottom" align="end" onClick={(e) => e.stopPropagation()}>
        {addingCat ? (
          <div className="flex flex-col gap-2 px-3 py-2">
            <input
              ref={catInputRef}
              className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
              placeholder="Category name"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
                if (e.key === 'Escape') setAddingCat(false)
              }}
            />
            <div className="flex flex-wrap gap-1 px-0.5">
              {CATEGORY_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setNewCatColor(color)}
                  className="h-4 w-4 rounded-full transition-all"
                  style={{
                    backgroundColor: color,
                    outline: newCatColor === color ? `2px solid ${color}` : '2px solid transparent',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <button
                disabled={!newCatName.trim()}
                className="flex-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                onClick={() => void handleCreate()}
              >
                Add
              </button>
              <button
                className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
                onClick={() => setAddingCat(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50"
            onClick={() => setAddingCat(true)}
          >
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            Add category
          </button>
        )}
        {categories.length > 0 && <div className="my-1 h-px bg-border" />}
        {categories.map((cat) => (
          <button
            key={cat.id}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50"
            onClick={() => { void onSetCategory(doc.categoryId === cat.id ? null : cat.id); setOpen(false) }}
          >
            <span className="flex w-3.5 shrink-0 items-center justify-center">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
            </span>
            <span className="flex-1 truncate">{cat.name}</span>
            {doc.categoryId === cat.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ── Continue writing card ─────────────────────────────────────────────────────

function ContinueCard({
  doc, categories, onOpen,
}: {
  doc: Document
  categories: Category[]
  onOpen: () => void
}): JSX.Element {
  const category = categories.find((c) => c.id === doc.categoryId)
  const wordCount = doc.wordCount ?? extractWordCount(doc.content)
  const formatLabel = FORMAT_LABELS[doc.format]
  const accent = category?.color ?? 'hsl(var(--primary))'

  return (
    <motion.button
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/30 hover:bg-card/80"
      onClick={onOpen}
    >
      {/* Left accent strip */}
      <div
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-xl"
        style={{ backgroundColor: accent }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: accent + '18' }}
        >
          <FileText className="h-5 w-5" style={{ color: accent }} />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
            Continue writing
          </p>
          <p className="truncate font-semibold text-foreground">{doc.title}</p>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
            {category && (
              <>
                <span style={{ color: accent }}>{category.name}</span>
                <span className="opacity-40">·</span>
              </>
            )}
            {formatLabel && (
              <>
                <span>{formatLabel}</span>
                <span className="opacity-40">·</span>
              </>
            )}
            <span>{wordCount.toLocaleString()} words</span>
            <span className="opacity-40">·</span>
            <span>{formatRelativeTime(doc.updatedAt)}</span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground/60 transition-colors group-hover:text-foreground">
          Open
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </motion.button>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center justify-center gap-5 py-28 text-center"
    >
      {/* Icon cluster */}
      <div className="relative mb-1">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-2 border-dashed border-border/60">
          <FileText className="h-8 w-8 text-muted-foreground/25" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-sm">
          <Plus className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      </div>

      <div>
        <p className="text-base font-semibold text-foreground">No documents yet</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Start writing or import an existing file
        </p>
      </div>

      <Button onClick={onNew} className="gap-1.5">
        <Plus className="h-4 w-4" />
        New document
      </Button>

      <p className="text-[11px] text-muted-foreground/40">
        Drag and drop .prose, .md, or .docx files to import
      </p>
    </motion.div>
  )
}
