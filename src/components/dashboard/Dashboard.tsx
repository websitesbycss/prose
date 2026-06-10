import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  Plus, Search, Settings, X, Upload, FileText, Pin,
  ArrowRight, FolderOpen,
  Table2, Shapes, PanelLeft, LayoutGrid, List, MoreHorizontal, ChevronDown,
  Sun, Moon,
} from 'lucide-react'
import type { FileType } from '@/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { DocContextMenu } from './DocContextMenu'
import SettingsModal from '@/components/settings/SettingsModal'
import ExportModal from '@/components/editor/ExportModal'
import type { Document, ImportResult } from '@/types'
import { useAppStore } from '@/store/appStore'
import { formatRelativeTime, extractWordCount, cn } from '@/lib/utils'
import { loadPinnedIds, savePinnedIds } from '@/lib/pinnedDocs'

type NavKey = 'all' | 'recent' | 'pinned' | FileType
type ViewMode = 'grid' | 'list'
type SortBy = 'recent' | 'name'

// ── Type configuration ────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  document: {
    label: 'Document',
    navLabel: 'Documents',
    lightColor: '#2563eb',
    darkColor: '#60a5fa',
    lightBg: 'rgba(37,99,235,.09)',
    darkBg: 'rgba(96,165,250,.13)',
    Icon: FileText,
    newLabel: 'New document',
    newDesc: 'Essays, papers, long-form writing',
    continueLabel: 'Continue writing',
  },
  sheet: {
    label: 'Sheet',
    navLabel: 'Sheets',
    lightColor: '#16a34a',
    darkColor: '#4ade80',
    lightBg: 'rgba(22,163,74,.09)',
    darkBg: 'rgba(74,222,128,.13)',
    Icon: Table2,
    newLabel: 'New sheet',
    newDesc: 'Data, references, tables',
    continueLabel: 'Continue editing',
  },
  board: {
    label: 'Board',
    navLabel: 'Boards',
    lightColor: '#7c3aed',
    darkColor: '#a78bfa',
    lightBg: 'rgba(124,58,237,.09)',
    darkBg: 'rgba(167,139,250,.13)',
    Icon: Shapes,
    newLabel: 'New board',
    newDesc: 'Visual maps and diagrams',
    continueLabel: 'Continue mapping',
  },
  slides: {
    label: 'Slideshow',
    navLabel: 'Slideshows',
    lightColor: '#d97706',
    darkColor: '#fbbf24',
    lightBg: 'rgba(217,119,6,.09)',
    darkBg: 'rgba(251,191,36,.13)',
    Icon: PanelLeft,
    newLabel: 'New slideshow',
    newDesc: 'Presentations with slides, shapes, and images',
    continueLabel: 'Continue presenting',
  },
} as const satisfies Record<FileType, {
  label: string; navLabel: string
  lightColor: string; darkColor: string
  lightBg: string; darkBg: string
  Icon: React.FC<{ className?: string; style?: React.CSSProperties }>
  newLabel: string; newDesc: string; continueLabel: string
}>


function fileMeta(doc: Document): string {
  const ft: FileType = doc.fileType ?? 'document'
  if (ft === 'document') {
    const wc = doc.wordCount ?? extractWordCount(doc.content)
    return `${wc.toLocaleString()} words`
  }
  if (ft === 'sheet') return 'Sheet'
  if (ft === 'board') return 'Board'
  if (ft === 'slides') return 'Slideshow'
  return ''
}

function sortedDocs(docs: Document[], sortBy: SortBy): Document[] {
  return [...docs].sort((a, b) => {
    if (sortBy === 'name') return a.title.localeCompare(b.title)
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

// ── Static thumbnail previews ─────────────────────────────────────────────────

function DocThumbnail(): JSX.Element {
  return (
    <div className="h-full w-full rounded-sm bg-white dark:bg-zinc-800 shadow-sm overflow-hidden p-2.5 flex flex-col gap-1">
      <div className="h-2 w-[60%] rounded-sm bg-zinc-900/50 dark:bg-white/50 mb-1" />
      <div className="h-2 w-[38%] rounded-sm bg-zinc-900/50 dark:bg-white/50 mb-2" />
      {[82, 95, 70, 88, 76, 91, 65, 84, 78, 60].map((w, i) => (
        <div key={i} className="h-[3px] rounded-full bg-zinc-900/15 dark:bg-white/15" style={{ width: `${w}%` }} />
      ))}
    </div>
  )
}

function SheetThumbnail(): JSX.Element {
  const cols = [12, 20, 18, 18, 18, 14]
  const rows = 7
  return (
    <div className="h-full w-full rounded-sm overflow-hidden flex flex-col bg-white dark:bg-zinc-800 shadow-sm" style={{ fontSize: 0 }}>
      {/* Header row */}
      <div className="flex shrink-0 border-b border-zinc-200 dark:border-white/10" style={{ height: 16, background: 'rgba(22,163,74,.10)' }}>
        <div className="shrink-0 border-r border-zinc-200 dark:border-white/10" style={{ width: 16 }} />
        {cols.map((f, i) => (
          <div key={i} className="flex items-center justify-center border-r border-zinc-200 dark:border-white/10 last:border-r-0" style={{ flex: f }}>
            <div className="rounded-sm bg-zinc-900/30 dark:bg-white/30" style={{ width: 7, height: 3 }} />
          </div>
        ))}
      </div>
      {/* Data rows */}
      {Array.from({ length: rows }, (_, ri) => (
        <div key={ri} className="flex flex-1 border-b border-zinc-200/70 dark:border-white/[0.07] last:border-b-0" style={{ background: ri === 0 ? 'rgba(22,163,74,.07)' : undefined }}>
          <div className="shrink-0 border-r border-zinc-200/70 dark:border-white/[0.07] flex items-center justify-center" style={{ width: 16 }}>
            <div className="rounded-sm bg-zinc-900/10 dark:bg-white/10" style={{ width: 6, height: 3 }} />
          </div>
          {cols.map((f, ci) => (
            <div key={ci} className="flex items-center px-1 border-r border-zinc-200/70 dark:border-white/[0.07] last:border-r-0" style={{ flex: f }}>
              <div className="rounded-sm bg-zinc-900/15 dark:bg-white/15" style={{ width: `${(ri === 0 ? 55 : 35) + (ci * 7 + ri * 5) % 40}%`, height: ri === 0 ? 4 : 3 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function BoardThumbnail(): JSX.Element {
  const nodes = [
    { x: 8, y: 12, w: 32, h: 14 },
    { x: 55, y: 8, w: 28, h: 12 },
    { x: 52, y: 52, w: 34, h: 13 },
    { x: 10, y: 58, w: 26, h: 13 },
  ]
  const conns = [[0, 1], [1, 2], [0, 3], [3, 2]] as const
  return (
    <div className="h-full w-full rounded-sm overflow-hidden relative bg-zinc-50 dark:bg-zinc-900">
      <svg viewBox="0 0 100 88" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 w-full h-full">
        <defs>
          <pattern id="db-dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.55" className="fill-zinc-400/50 dark:fill-zinc-500/50" />
          </pattern>
        </defs>
        <rect width="100" height="88" fill="url(#db-dots)" />
        {conns.map(([a, b], i) => {
          const na = nodes[a], nb = nodes[b]
          return <line key={i}
            x1={na.x + na.w / 2} y1={na.y + na.h / 2}
            x2={nb.x + nb.w / 2} y2={nb.y + nb.h / 2}
            className="stroke-zinc-400 dark:stroke-zinc-500" strokeWidth="0.7" opacity="0.5" />
        })}
        {nodes.map((n, i) => (
          <g key={i}>
            <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="2.5"
              className="fill-white dark:fill-zinc-700 stroke-zinc-300 dark:stroke-zinc-500" strokeWidth="0.9" />
            <rect x={n.x + 2.5} y={n.y + 3.5} width={n.w * 0.6} height={2} rx="1" className="fill-zinc-700/40 dark:fill-white/40" />
            <rect x={n.x + 2.5} y={n.y + 7.5} width={n.w * 0.4} height={1.5} rx="0.75" className="fill-zinc-700/20 dark:fill-white/20" />
          </g>
        ))}
      </svg>
    </div>
  )
}

function SlidesThumbnail(): JSX.Element {
  const miniSlides = [0, 1, 2, 3]
  return (
    <div className="h-full w-full rounded-sm overflow-hidden flex bg-zinc-100 dark:bg-zinc-800 shadow-sm">
      {/* Left slide strip */}
      <div className="shrink-0 flex flex-col gap-1 p-1.5 border-r border-zinc-200 dark:border-white/10" style={{ width: '30%' }}>
        {miniSlides.map((i) => (
          <div key={i} className="w-full rounded-[2px] overflow-hidden relative bg-white dark:bg-zinc-700"
            style={{
              aspectRatio: '16/10',
              border: i === 0 ? '1.5px solid #d97706' : '1px solid rgba(0,0,0,0.12)',
            }}>
            <div className="absolute inset-[3px] flex flex-col gap-0.5 justify-center">
              <div className="rounded-full bg-zinc-800/40 dark:bg-white/40" style={{ height: 2, width: `${55 + i * 7}%` }} />
              <div className="rounded-full bg-zinc-800/20 dark:bg-white/20" style={{ height: 1.5, width: `${35 + i * 5}%` }} />
            </div>
          </div>
        ))}
      </div>
      {/* Main canvas */}
      <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-white dark:bg-zinc-700 p-2">
        <div className="rounded-sm bg-zinc-800/45 dark:bg-white/45" style={{ height: 5, width: '78%' }} />
        <div className="rounded-sm bg-zinc-800/25 dark:bg-white/25" style={{ height: 4, width: '60%' }} />
        <div className="rounded-sm bg-zinc-800/15 dark:bg-white/15 mt-1" style={{ height: 3, width: '55%' }} />
        <div className="rounded-sm bg-zinc-800/15 dark:bg-white/15" style={{ height: 3, width: '70%' }} />
        <div className="rounded-sm bg-zinc-800/15 dark:bg-white/15" style={{ height: 3, width: '45%' }} />
      </div>
    </div>
  )
}

function FileThumbnail({ type }: { type: FileType }): JSX.Element {
  if (type === 'sheet') return <SheetThumbnail />
  if (type === 'board') return <BoardThumbnail />
  if (type === 'slides') return <SlidesThumbnail />
  return <DocThumbnail />
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard({ embedded: _embedded = false }: { embedded?: boolean }): JSX.Element {
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const closeDocumentTab = useAppStore((s) => s.closeDocumentTab)
  const updateDocumentTab = useAppStore((s) => s.updateDocumentTab)
  const setNewDocumentModalOpen = useAppStore((s) => s.setNewDocumentModalOpen)
  const settingsOpen = useAppStore((s) => s.settingsOpen)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const isDark = theme === 'dark'

  const [documents, setDocuments] = useState<Document[]>([])
  const [navActive, setNavActive] = useState<NavKey>('all')
  const [view, setView] = useState<ViewMode>('grid')
  const [sortBy, setSortBy] = useState<SortBy>('recent')
  const [search, setSearch] = useState('')
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPinnedIds)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ doc: Document; x: number; y: number } | null>(null)
  const [ctxExportTarget, setCtxExportTarget] = useState<Document | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => { void loadAll() }, [])

  useEffect(() => {
    function onDocumentCreated(e: Event): void {
      const doc = (e as CustomEvent<Document>).detail as Document | undefined
      if (doc) setDocuments((prev) => [doc, ...prev.filter((d) => d.id !== doc.id)])
    }
    window.addEventListener('prose-document-created', onDocumentCreated)
    return () => window.removeEventListener('prose-document-created', onDocumentCreated)
  }, [])

  async function loadAll(): Promise<void> {
    try {
      const docs = await window.prose.documents.getAll() as Document[]
      setDocuments(docs)
    } catch (err) { console.error('Load error:', err) }
  }

  function openDoc(doc: Document): void {
    openDocumentTab({ id: doc.id, title: doc.title, format: doc.format, fileType: doc.fileType ?? 'document' })
  }

  const handleImportResult = useCallback((result: ImportResult) => {
    if (result.imported.length > 0) {
      setDocuments((prev) => [...result.imported as Document[], ...prev])
      toast.success(`Imported ${result.imported.length} file${result.imported.length !== 1 ? 's' : ''}`)
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
      closeDocumentTab(deleteTarget.id)
      toast.success('File deleted')
    } catch { toast.error('Delete failed') } finally { setDeleteTarget(null) }
  }

  function togglePin(id: string): void {
    setPinnedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      savePinnedIds(n); return n
    })
  }

  async function handleRename(id: string, title: string): Promise<void> {
    try {
      await window.prose.documents.update(id, { title })
      setDocuments((prev) => prev.map((d) => d.id === id ? { ...d, title } : d))
      updateDocumentTab(id, { title })
    } catch (err) {
      if ((err as Error).message?.includes('DUPLICATE_TITLE')) {
        toast.error('A file with that name already exists')
      } else {
        toast.error('Failed to rename file')
      }
    }
  }

  function handleCtxExport(): void {
    if (!ctxMenu) return
    setCtxExportTarget(ctxMenu.doc)
    setCtxMenu(null)
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const counts = useMemo(() => ({
    all: documents.length,
    pinned: [...pinnedIds].filter((id) => documents.some((d) => d.id === id)).length,
    document: documents.filter((d) => (d.fileType ?? 'document') === 'document').length,
    sheet: documents.filter((d) => d.fileType === 'sheet').length,
    board: documents.filter((d) => d.fileType === 'board').length,
    slides: documents.filter((d) => d.fileType === 'slides').length,
  }), [documents, pinnedIds])

  const filteredFiles = useMemo(() => {
    let list = documents
    if (navActive === 'pinned') list = list.filter((d) => pinnedIds.has(d.id))
    else if (navActive === 'recent') list = list.slice()
    else if (navActive !== 'all') list = list.filter((d) => (d.fileType ?? 'document') === navActive)
    if (search) list = list.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    const pinned = sortedDocs(list.filter((d) => pinnedIds.has(d.id)), sortBy)
    const unpinned = sortedDocs(list.filter((d) => !pinnedIds.has(d.id)), sortBy)
    return [...pinned, ...unpinned]
  }, [documents, navActive, pinnedIds, search, sortBy])

  const featuredFile = useMemo(() => {
    if (navActive !== 'all' || search || documents.length === 0) return null
    return [...documents].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null
  }, [documents, navActive, search])

  const showQuickStart = navActive !== 'pinned' && !search
  const pageTitle = {
    all: 'All files', recent: 'Recent', pinned: 'Pinned',
    document: 'Documents', sheet: 'Sheets', board: 'Boards', slides: 'Slideshows',
  }[navActive] ?? 'All files'

  const sectionLabel = navActive === 'pinned' ? 'Pinned' : navActive === 'recent' ? 'Recently modified' : 'Files'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className={cn('flex h-full bg-background text-foreground', dragOver && 'ring-2 ring-inset ring-primary/50')}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => void handleDrop(e)}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-border bg-background" style={{ padding: '0 10px 12px' }}>
        {/* Brand */}
        <div className="flex h-[58px] shrink-0 items-center gap-2.5 mb-2 border-b border-border -mx-[10px] px-[14px]">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <span className="text-[17px] font-bold tracking-tight text-foreground" style={{ letterSpacing: '-0.02em' }}>Prose</span>
        </div>

        {/* Nav */}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
          <SidebarNavItem
            icon={<FolderOpen className="h-[15px] w-[15px]" />}
            label="All files"
            count={counts.all}
            active={navActive === 'all'}
            onClick={() => setNavActive('all')}
          />
          <SidebarNavItem
            icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 9 15"/></svg>}
            label="Recent"
            active={navActive === 'recent'}
            onClick={() => setNavActive('recent')}
          />
          <SidebarNavItem
            icon={<Pin className="h-[15px] w-[15px]" />}
            label="Pinned"
            count={counts.pinned || undefined}
            active={navActive === 'pinned'}
            onClick={() => setNavActive('pinned')}
          />

          <div className="mx-2 mt-3 mb-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40">
            File types
          </div>

          {(Object.entries(TYPE_CONFIG) as [FileType, typeof TYPE_CONFIG[FileType]][]).map(([key, cfg]) => (
            <SidebarNavItem
              key={key}
              icon={<cfg.Icon className="h-[15px] w-[15px]" style={{ color: isDark ? cfg.darkColor : cfg.lightColor }} />}
              label={cfg.navLabel}
              count={counts[key] || undefined}
              active={navActive === key}
              onClick={() => setNavActive(key)}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="mt-2 border-t border-border pt-1.5 flex flex-col gap-0.5 -mx-[10px] px-[10px]">
          <SidebarNavItem
            icon={isDark ? <Sun className="h-[15px] w-[15px]" /> : <Moon className="h-[15px] w-[15px]" />}
            label={isDark ? 'Light mode' : 'Dark mode'}
            active={false}
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
          />
          <SidebarNavItem
            icon={<Settings className="h-[15px] w-[15px]" />}
            label="Settings"
            active={false}
            onClick={() => setSettingsOpen(true)}
          />
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar */}
        <header className="flex h-[58px] shrink-0 items-center gap-2.5 border-b border-border px-6">
          <h1 className="text-[19px] font-bold tracking-tight text-foreground" style={{ letterSpacing: '-0.02em', margin: 0 }}>
            {pageTitle}
          </h1>
          <div className="flex-1" />

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              className="h-9 w-[210px] rounded-lg border border-border bg-card pl-9 pr-3 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 text-[13.5px] font-medium"
            onClick={() => void handleImport()}
            disabled={importing}
          >
            <Upload className="h-3.5 w-3.5" />
            Import
          </Button>
          <Button size="sm" className="h-9 gap-1.5 text-[13.5px] font-medium" onClick={() => setNewDocumentModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New file
          </Button>
        </header>

        {/* Body */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-4 p-6">
            {dragOver && (
              <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 p-5 text-center text-sm text-primary">
                Drop files to import (.prose, .md, .docx, .xlsx, .xls, .csv, .pptx)
              </div>
            )}

            {/* Quick-start tiles */}
            {showQuickStart && (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                {(Object.entries(TYPE_CONFIG) as [FileType, typeof TYPE_CONFIG[FileType]][])
                  .filter(([key]) => navActive === 'all' || navActive === 'recent' || navActive === key)
                  .map(([key, cfg]) => (
                    <QuickStartTile
                      key={key}
                      cfg={cfg}
                      isDark={isDark}
                      onClick={() => setNewDocumentModalOpen(true)}
                    />
                  ))}
              </div>
            )}

            {/* Section header */}
            <div className="flex items-center gap-2.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40 leading-none" style={{ paddingTop: 4 }}>
                {sectionLabel}
              </span>
              <div className="flex-1" />

              {/* Grid/List toggle */}
              <div className="flex items-center rounded-lg border border-border p-[3px]">
                <button
                  className={cn('flex h-[30px] w-8 items-center justify-center rounded-[5px] transition-colors',
                    view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  title="Grid view"
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid className="h-[15px] w-[15px]" />
                </button>
                <button
                  className={cn('flex h-[30px] w-8 items-center justify-center rounded-[5px] transition-colors',
                    view === 'list' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                  title="List view"
                  onClick={() => setView('list')}
                >
                  <List className="h-[15px] w-[15px]" />
                </button>
              </div>

              {/* Sort */}
              <button
                className="flex h-7 items-center gap-1 rounded-md px-2.5 text-[12px] font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                onClick={() => setSortBy(s => s === 'recent' ? 'name' : 'recent')}
              >
                {sortBy === 'recent' ? 'Modified' : 'Name'}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
            </div>

            {/* File content */}
            {documents.length === 0 && !dragOver ? (
              <EmptyState onNew={() => setNewDocumentModalOpen(true)} />
            ) : filteredFiles.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-20 text-center">
                <p className="text-sm text-muted-foreground">
                  {search ? <>No files match <span className="font-medium text-foreground">"{search}"</span></> : 'No files in this view'}
                </p>
              </div>
            ) : view === 'grid' ? (
              <GridView
                files={featuredFile ? filteredFiles.filter((f) => f.id !== featuredFile.id) : filteredFiles}
                featuredFile={featuredFile ?? undefined}
                pinnedIds={pinnedIds}
                isDark={isDark}
                onOpen={openDoc}
                onPin={togglePin}
                onContextMenu={(doc, x, y) => setCtxMenu({ doc, x, y })}
              />
            ) : (
              <ListView
                files={filteredFiles}
                pinnedIds={pinnedIds}
                renamingId={renamingId}
                isDark={isDark}
                onOpen={openDoc}
                onPin={togglePin}
                onRename={(id, title) => void handleRename(id, title)}
                onDelete={(doc) => setDeleteTarget(doc)}
                onEditStarted={() => setRenamingId(null)}
                onContextMenu={(doc, x, y) => setCtxMenu({ doc, x, y })}
              />
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Context menu */}
      <DocContextMenu
        doc={ctxMenu?.doc ?? null}
        pinned={ctxMenu ? pinnedIds.has(ctxMenu.doc.id) : false}
        categories={[]}
        position={ctxMenu ? { x: ctxMenu.x, y: ctxMenu.y } : null}
        onDismiss={() => setCtxMenu(null)}
        onPin={() => ctxMenu && togglePin(ctxMenu.doc.id)}
        onRename={() => ctxMenu && setRenamingId(ctxMenu.doc.id)}
        onDelete={() => ctxMenu && setDeleteTarget(ctxMenu.doc)}
        onExport={() => handleCtxExport()}
        onSetCategory={async () => {}}
        onCreateCategory={async () => {}}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      {ctxExportTarget && (
        <ExportModal
          open={!!ctxExportTarget}
          onClose={() => setCtxExportTarget(null)}
          documentId={ctxExportTarget.id}
          documentTitle={ctxExportTarget.title}
          documentMargins={ctxExportTarget.pageMargins}
        />
      )}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete file?</AlertDialogTitle>
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

// ── Sidebar nav item ──────────────────────────────────────────────────────────

function SidebarNavItem({ icon, label, count, active, onClick }: {
  icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[7px] px-2 h-[34px] text-[13px] font-medium transition-colors text-left',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      <span className="shrink-0 flex w-[18px] items-center justify-center">{icon}</span>
      <span className="flex-1 truncate leading-none" style={{ paddingTop: 2 }}>{label}</span>
      {count !== undefined && (
        <span className="font-mono text-[11px] text-muted-foreground/50 leading-none">{count}</span>
      )}
    </button>
  )
}

// ── Quick-start tile ──────────────────────────────────────────────────────────

function QuickStartTile({ cfg, isDark, onClick }: {
  cfg: typeof TYPE_CONFIG[FileType]; isDark: boolean; onClick: () => void
}): JSX.Element {
  const color = isDark ? cfg.darkColor : cfg.lightColor
  const bg = isDark ? cfg.darkBg : cfg.lightBg
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center gap-3.5 rounded-[11px] border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
      style={{ minWidth: 0 }}
    >
      <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: bg, color }}>
        <cfg.Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-foreground">{cfg.newLabel}</div>
        <div className="text-[11.5px] text-muted-foreground leading-snug mt-0.5">{cfg.newDesc}</div>
      </div>
    </button>
  )
}

// ── Grid view ─────────────────────────────────────────────────────────────────

function GridView({ files, featuredFile, pinnedIds, isDark, onOpen, onPin, onContextMenu }: {
  files: Document[]; featuredFile?: Document; pinnedIds: Set<string>; isDark: boolean
  onOpen: (doc: Document) => void
  onPin: (id: string) => void
  onContextMenu: (doc: Document, x: number, y: number) => void
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3.5">
      {featuredFile && (
        <FeaturedCard
          file={featuredFile}
          isDark={isDark}
          onOpen={() => onOpen(featuredFile)}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(featuredFile, e.clientX, e.clientY) }}
        />
      )}
      {files.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {files.map((f) => (
            <GridCard
              key={f.id}
              file={f}
              pinned={pinnedIds.has(f.id)}
              isDark={isDark}
              onOpen={() => onOpen(f)}
              onPin={() => onPin(f.id)}
              onContextMenu={(e) => { e.preventDefault(); onContextMenu(f, e.clientX, e.clientY) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FeaturedCard({ file, isDark, onOpen, onContextMenu }: {
  file: Document; isDark: boolean
  onOpen: () => void; onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const ft: FileType = file.fileType ?? 'document'
  const cfg = TYPE_CONFIG[ft]
  const color = isDark ? cfg.darkColor : cfg.lightColor

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex overflow-hidden rounded-[11px] border border-border bg-card cursor-pointer transition-colors hover:border-primary/30"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail */}
      <div className="shrink-0 bg-muted/40 overflow-hidden" style={{ width: 210, padding: '16px 0 16px 16px' }}>
        <div className="h-full w-full blur-[1px] opacity-50">
          <FileThumbnail type={ft} />
        </div>
      </div>
      {/* Body */}
      <div className="flex flex-1 flex-col justify-center gap-2.5 px-7 py-6">
        <div className="text-[10.5px] font-semibold uppercase tracking-widest" style={{ color, letterSpacing: '0.06em' }}>
          {cfg.continueLabel}
        </div>
        <h2 className="text-[22px] font-bold leading-tight text-foreground" style={{ letterSpacing: '-0.02em', margin: 0 }}>
          {file.title}
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          <TypeBadge type={ft} isDark={isDark} />
          <span className="text-[12px] text-muted-foreground">{formatRelativeTime(file.updatedAt)}</span>
          <span className="text-[12px] text-muted-foreground">{fileMeta(file)}</span>
        </div>
        <button
          className="flex items-center gap-1.5 self-start text-[13px] font-semibold text-primary transition-all hover:gap-2.5"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2 }}
        >
          Open <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  )
}

function GridCard({ file, pinned, isDark, onOpen, onPin, onContextMenu }: {
  file: Document; pinned: boolean; isDark: boolean
  onOpen: () => void; onPin: () => void; onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const ft: FileType = file.fileType ?? 'document'
  return (
    <div
      className="group flex flex-col overflow-hidden rounded-[10px] border border-border bg-card cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-lg hover:border-primary/30"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail */}
      <div className="relative bg-muted/40 overflow-hidden" style={{ height: 138, padding: '12px 12px 0' }}>
        <button
          className={cn(
            'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center transition-opacity',
            pinned ? 'opacity-100 text-foreground' : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground',
          )}
          onClick={(e) => { e.stopPropagation(); onPin() }}
          title={pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className={cn('h-4 w-4', pinned && 'fill-current')} />
        </button>
        <div className="h-full w-full blur-[1px] opacity-50">
          <FileThumbnail type={ft} />
        </div>
      </div>
      {/* Card body */}
      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <div className="truncate text-[13.5px] font-semibold text-foreground" style={{ letterSpacing: '-0.01em' }}>
          {file.title}
        </div>
        <div className="flex items-center gap-2">
          <TypeBadge type={ft} isDark={isDark} small />
          <span className="text-[11.5px] text-muted-foreground">{formatRelativeTime(file.updatedAt)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────

function TypeBadge({ type, isDark, small }: { type: FileType; isDark: boolean; small?: boolean }): JSX.Element {
  const cfg = TYPE_CONFIG[type]
  const color = isDark ? cfg.darkColor : cfg.lightColor
  const bg = isDark ? cfg.darkBg : cfg.lightBg
  return (
    <span
      className="inline-flex items-center gap-1 rounded-[5px] font-medium"
      style={{ color, background: bg, fontSize: small ? 11 : 12, padding: small ? '2px 6px' : '3px 7px' }}
    >
      <cfg.Icon className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {cfg.label}
    </span>
  )
}

// ── List view ─────────────────────────────────────────────────────────────────

function ListView({ files, pinnedIds, renamingId, isDark, onOpen, onPin, onRename, onDelete, onEditStarted, onContextMenu }: {
  files: Document[]; pinnedIds: Set<string>; renamingId: string | null; isDark: boolean
  onOpen: (doc: Document) => void
  onPin: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (doc: Document) => void
  onEditStarted: () => void
  onContextMenu: (doc: Document, x: number, y: number) => void
}): JSX.Element {
  return (
    <div className="flex flex-col rounded-[10px] border border-border overflow-hidden">
      {/* Header */}
      <div className="grid items-center border-b border-border bg-muted/30 px-3 py-2"
        style={{ gridTemplateColumns: '32px 1fr 100px 120px 120px 60px', gap: '0 12px' }}>
        <span />
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40">Name</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40">Type</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40">Modified</span>
        <span className="text-[10.5px] font-semibold uppercase tracking-widest text-muted-foreground/40">Size</span>
        <span />
      </div>
      {files.map((f) => (
        <ListRow
          key={f.id}
          file={f}
          pinned={pinnedIds.has(f.id)}
          startEditing={renamingId === f.id}
          isDark={isDark}
          onOpen={() => onOpen(f)}
          onPin={() => onPin(f.id)}
          onRename={(title) => onRename(f.id, title)}
          onDelete={() => onDelete(f)}
          onEditStarted={onEditStarted}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(f, e.clientX, e.clientY) }}
        />
      ))}
    </div>
  )
}

function ListRow({ file, pinned, startEditing, isDark, onOpen, onPin, onRename, onDelete: _onDelete, onEditStarted, onContextMenu }: {
  file: Document; pinned: boolean; startEditing?: boolean; isDark: boolean
  onOpen: () => void; onPin: () => void
  onRename: (title: string) => void; onDelete: () => void
  onEditStarted: () => void; onContextMenu: (e: React.MouseEvent) => void
}): JSX.Element {
  const ft: FileType = file.fileType ?? 'document'
  const cfg = TYPE_CONFIG[ft]
  const color = isDark ? cfg.darkColor : cfg.lightColor
  const bg = isDark ? cfg.darkBg : cfg.lightBg
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(file.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) { setDraft(file.title); requestAnimationFrame(() => inputRef.current?.select()) }
  }, [editing, file.title])

  useEffect(() => {
    if (startEditing) { setEditing(true); onEditStarted() }
  }, [startEditing]) // eslint-disable-line react-hooks/exhaustive-deps

  function commitRename(): void {
    const t = draft.trim()
    if (t && t !== file.title) onRename(t)
    setEditing(false)
  }

  return (
    <div
      className="group grid items-center border-b border-border last:border-b-0 px-3 cursor-pointer transition-colors hover:bg-muted/30"
      style={{ gridTemplateColumns: '32px 1fr 100px 120px 120px 52px', gap: '0 12px', height: 52 }}
      onClick={() => { if (!editing) onOpen() }}
      onContextMenu={onContextMenu}
    >
      {/* Icon */}
      <div className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[7px]" style={{ background: bg, color }}>
        <cfg.Icon className="h-3.5 w-3.5" />
      </div>

      {/* Title */}
      <div className="min-w-0">
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
          <span className="block truncate text-[13.5px] font-medium text-foreground">{file.title}</span>
        )}
      </div>

      {/* Type */}
      <span className="text-[12.5px] text-muted-foreground">{cfg.label}</span>

      {/* Modified */}
      <span className="text-[12.5px] text-muted-foreground">{formatRelativeTime(file.updatedAt)}</span>

      {/* Size */}
      <span className="font-mono text-[12px] text-muted-foreground/60">{fileMeta(file)}</span>

      {/* Actions */}
      <div className="flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
        <button
          title={pinned ? 'Unpin' : 'Pin'}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            pinned
              ? 'text-foreground hover:bg-muted/60'
              : 'opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-muted/60',
          )}
          onClick={(e) => { e.stopPropagation(); onPin() }}
        >
          <Pin className={cn('h-3 w-3', pinned && 'fill-current')} />
        </button>
        <button
          title="More"
          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onContextMenu(e as unknown as React.MouseEvent) }}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
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
      <div className="relative mb-1">
        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-2xl border-2 border-dashed border-border/60">
          <FileText className="h-8 w-8 text-muted-foreground/25" />
        </div>
        <div className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary shadow-sm">
          <Plus className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      </div>
      <div>
        <p className="text-base font-semibold text-foreground">No files yet</p>
        <p className="mt-1 text-sm text-muted-foreground/70">
          Create a Document, Sheet, Board, or Slideshow to get started
        </p>
      </div>
      <Button onClick={onNew} className="gap-1.5">
        <Plus className="h-4 w-4" />
        New file
      </Button>
      <p className="text-[11px] text-muted-foreground/40">
        Drag and drop .prose, .md, or .docx files to import
      </p>
    </motion.div>
  )
}
