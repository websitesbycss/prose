import { useEffect, useState, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { Plus, Search, Settings, FolderPlus, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import DocumentCard, { cardVariants } from './DocumentCard'
import NewDocumentModal from './NewDocumentModal'
import type { Document, Category } from '@/types'
import { useAppStore } from '@/store/appStore'

type SidebarFilter = 'all' | 'uncategorized' | string

const CATEGORY_COLORS = [
  '#7F77DD',
  '#E879A0',
  '#34D399',
  '#FBBF24',
  '#60A5FA',
  '#F87171',
  '#A78BFA',
  '#2DD4BF',
]

export default function Dashboard(): JSX.Element {
  const setCurrentDocumentId = useAppStore((s) => s.setCurrentDocumentId)

  const [documents, setDocuments] = useState<Document[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filter, setFilter] = useState<SidebarFilter>('all')
  const [search, setSearch] = useState('')
  const [newDocOpen, setNewDocOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatColor, setNewCatColor] = useState(CATEGORY_COLORS[0])
  const [addingCat, setAddingCat] = useState(false)
  const catInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (addingCat) catInputRef.current?.focus()
  }, [addingCat])

  async function loadAll(): Promise<void> {
    try {
      const [docs, cats] = await Promise.all([
        window.prose.documents.getAll() as Promise<Document[]>,
        window.prose.categories.getAll() as Promise<Category[]>,
      ])
      setDocuments(docs)
      setCategories(cats)
    } catch (err) {
      console.error('Load error:', err)
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteTarget) return
    try {
      await window.prose.documents.delete(deleteTarget.id)
      setDocuments((prev) => prev.filter((d) => d.id !== deleteTarget.id))
      toast.success('Deleted')
    } catch (err) {
      console.error('Delete error:', err)
      toast.error('Delete failed')
    } finally {
      setDeleteTarget(null)
    }
  }

  async function handleCreateCategory(): Promise<void> {
    const name = newCatName.trim()
    if (!name) return
    try {
      const cat = await window.prose.categories.create({
        name,
        color: newCatColor,
      } as Parameters<typeof window.prose.categories.create>[0])
      setCategories((prev) => [...prev, cat as Category])
      setNewCatName('')
      setNewCatColor(CATEGORY_COLORS[0])
      setAddingCat(false)
    } catch (err) {
      console.error('Create category error:', err)
      toast.error('Failed to create')
    }
  }

  async function handleDeleteCategory(id: string): Promise<void> {
    try {
      await window.prose.categories.delete(id)
      setCategories((prev) => prev.filter((c) => c.id !== id))
      if (filter === id) setFilter('all')
    } catch (err) {
      console.error('Delete category error:', err)
    }
  }

  const filtered = documents.filter((doc) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'uncategorized' && !doc.categoryId) ||
      doc.categoryId === filter
    const matchesSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-border">
        <div className="flex h-14 items-center px-4">
          <span className="text-lg font-semibold tracking-tight text-primary">Prose</span>
        </div>

        <ScrollArea className="flex-1 px-2">
          <nav className="flex flex-col gap-0.5 pb-4">
            <SidebarItem
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label="All documents"
            />
            <SidebarItem
              active={filter === 'uncategorized'}
              onClick={() => setFilter('uncategorized')}
              label="Uncategorized"
            />

            <div className="mt-3 mb-1 flex items-center justify-between px-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Categories
              </span>
              <button
                onClick={() => setAddingCat(true)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="New category"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>

            {categories.map((cat) => (
              <div key={cat.id} className="group flex items-center">
                <SidebarItem
                  active={filter === cat.id}
                  onClick={() => setFilter(cat.id)}
                  label={cat.name}
                  color={cat.color}
                  className="flex-1"
                />
                <button
                  onClick={() => handleDeleteCategory(cat.id)}
                  className="hidden group-hover:flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}

            <AnimatePresence>
              {addingCat && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 px-2 py-2">
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
                    <div className="flex flex-wrap gap-1">
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => setNewCatColor(color)}
                          className="h-4 w-4 rounded-full ring-offset-background transition-all"
                          style={{
                            backgroundColor: color,
                            outline:
                              newCatColor === color
                                ? `2px solid ${color}`
                                : '2px solid transparent',
                            outlineOffset: '2px',
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        className="h-6 flex-1 text-xs"
                        onClick={() => void handleCreateCategory()}
                        disabled={!newCatName.trim()}
                      >
                        Add
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 text-xs"
                        onClick={() => setAddingCat(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </nav>
        </ScrollArea>

        <div className="border-t border-border p-2">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Settings className="h-4 w-4" />
            Settings
            <ChevronRight className="ml-auto h-3 w-3" />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center gap-3 border-b border-border px-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search documents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setNewDocOpen(true)}
          >
            <Plus className="h-4 w-4" />
            New document
          </Button>
        </header>

        {/* Document grid */}
        <ScrollArea className="flex-1">
          <div className="p-6">
            {filtered.length === 0 ? (
              <EmptyState
                hasSearch={!!search}
                onNew={() => setNewDocOpen(true)}
              />
            ) : (
              <motion.div
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.05 } },
                  hidden: {},
                }}
              >
                {filtered.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    categories={categories}
                    onOpen={(id) => setCurrentDocumentId(id)}
                    onDelete={(id) => {
                      const target = documents.find((d) => d.id === id)
                      if (target) setDeleteTarget(target)
                    }}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* New document modal */}
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete document?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{deleteTarget?.title}" and all its citations. This cannot
              be undone.
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

interface SidebarItemProps {
  active: boolean
  onClick: () => void
  label: string
  color?: string
  className?: string
}

function SidebarItem({ active, onClick, label, color, className = '' }: SidebarItemProps): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
        active
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      } ${className}`}
    >
      {color && (
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

interface EmptyStateProps {
  hasSearch: boolean
  onNew: () => void
}

function EmptyState({ hasSearch, onNew }: EmptyStateProps): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center gap-3 py-24 text-center"
    >
      {hasSearch ? (
        <p className="text-muted-foreground text-sm">No documents match that search</p>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">No documents yet</p>
          <Button variant="outline" size="sm" onClick={onNew}>
            Create your first document
          </Button>
        </>
      )}
    </motion.div>
  )
}
