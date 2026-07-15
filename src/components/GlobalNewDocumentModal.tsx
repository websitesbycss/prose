import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { FileText, Table2, Shapes, GalleryVerticalEnd, X, Upload, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import NewDocumentModal from '@/components/dashboard/NewDocumentModal'
import { useAppStore } from '@/store/appStore'
import type { Document, FileType, ImportResult } from '@/types'

/** Type picker card shown before creating a Sheet or Board (Document uses its own modal). */
function SimpleNewFileModal({
  fileType,
  onClose,
  onCreated,
}: {
  fileType: 'sheet' | 'board' | 'slides'
  onClose: () => void
  onCreated: (doc: Document) => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const label = fileType === 'sheet' ? 'Sheet' : fileType === 'slides' ? 'Presentation' : 'Board'

  async function handleCreate(): Promise<void> {
    const t = title.trim()
    if (!t) { setError('Title is required'); return }
    setCreating(true)
    setError('')
    try {
      const doc = await window.prose.documents.create({ title: t, fileType, format: 'none' }) as Document
      onCreated(doc)
    } catch (err) {
      setError((err as Error).message ?? 'Failed to create')
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">New {label}</h2>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <input
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={`${label} title`}
            value={title}
            autoFocus
            onChange={(e) => { setTitle(e.target.value); setError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); if (e.key === 'Escape') onClose() }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={!title.trim() || creating} onClick={() => void handleCreate()}>
              {creating ? 'Creating…' : `Create ${label}`}
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

/** First step: choose Document, Sheet, Board, or Slides. */
function TypePickerModal({
  onSelect,
  onClose,
  onImported,
}: {
  onSelect: (type: FileType) => void
  onClose: () => void
  onImported: (docs: Document[]) => void
}): JSX.Element {
  const [importing, setImporting] = useState(false)

  async function handleImport(): Promise<void> {
    if (importing) return
    setImporting(true)
    try {
      const result = await window.prose.documents.importFiles() as ImportResult
      if (result.imported.length > 0) {
        onImported(result.imported as Document[])
        toast.success(`Imported ${result.imported.length} file${result.imported.length !== 1 ? 's' : ''}`)
      }
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} file${result.errors.length !== 1 ? 's' : ''} could not be imported`)
      }
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  const types: Array<{ type: FileType; Icon: React.FC<{ className?: string }>; label: string; description: string }> = [
    {
      type: 'document',
      Icon: FileText,
      label: 'Document',
      description: 'Write anything. Notes, essays, reports, letters, or any long-form text.',
    },
    {
      type: 'sheet',
      Icon: Table2,
      label: 'Sheet',
      description: 'Organize data, run calculations, and analyze numbers.',
    },
    {
      type: 'board',
      Icon: Shapes,
      label: 'Board',
      description: 'Map your ideas, files, and notes on an infinite canvas.',
    },
    {
      type: 'slides',
      Icon: GalleryVerticalEnd,
      label: 'Slides',
      description: 'Create presentations with slides, shapes, images, and more.',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -8 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold">New file</h2>
          <button
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {types.map(({ type, Icon, label, description }) => (
            <button
              key={type}
              className="flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              onClick={() => onSelect(type)}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground/70">{description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" variant="outline" className="h-9 gap-1.5 text-[13.5px] font-medium leading-none hover:border-primary/50 hover:bg-accent/40" onClick={onClose}>
            <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
            <span className="mt-0.5">Cancel</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 text-[13.5px] font-medium leading-none hover:border-primary/50 hover:bg-accent/40"
            onClick={() => void handleImport()}
            disabled={importing}
          >
            <Upload className="h-3.5 w-3.5 shrink-0" />
            <span>Import</span>
          </Button>
        </div>
      </motion.div>
    </div>
  )
}

/** App-level new file modal — usable from the tab bar, dashboard, or anywhere else. */
export function GlobalNewDocumentModal(): JSX.Element {
  const open = useAppStore((s) => s.newDocumentModalOpen)
  const initialType = useAppStore((s) => s.newDocumentModalInitialType)
  const setOpen = useAppStore((s) => s.setNewDocumentModalOpen)
  const openDocumentTab = useAppStore((s) => s.openDocumentTab)
  const [selectedType, setSelectedType] = useState<FileType | null>(null)

  useEffect(() => {
    if (!open) { setSelectedType(null); return }
    setSelectedType(initialType)
  }, [open, initialType])

  function handleCreated(doc: Document): void {
    setOpen(false)
    openDocumentTab({ id: doc.id, title: doc.title, format: doc.format, fileType: doc.fileType ?? 'document' })
    window.dispatchEvent(new CustomEvent('prose-document-created', { detail: doc }))
  }

  function handleImported(docs: Document[]): void {
    setOpen(false)
    // Open every imported file as a tab immediately — landing on the last one
    // imported — same as picking Document/Sheet/Board/Slides above.
    for (const doc of docs) {
      openDocumentTab({ id: doc.id, title: doc.title, format: doc.format, fileType: doc.fileType ?? 'document' })
      window.dispatchEvent(new CustomEvent('prose-document-created', { detail: doc }))
    }
  }

  if (!open) return <></>

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Type picker — shown until user picks a type */}
          {selectedType === null && (
            <TypePickerModal
              onSelect={setSelectedType}
              onClose={() => setOpen(false)}
              onImported={handleImported}
            />
          )}

          {/* Document: use the full creation modal */}
          {selectedType === 'document' && (
            <NewDocumentModal
              open
              onClose={() => setOpen(false)}
              onCreated={handleCreated}
            />
          )}

          {/* Sheet, Board, or Slides: simple title-only creation */}
          {(selectedType === 'sheet' || selectedType === 'board' || selectedType === 'slides') && (
            <SimpleNewFileModal
              fileType={selectedType}
              onClose={() => setOpen(false)}
              onCreated={handleCreated}
            />
          )}
        </>
      )}
    </AnimatePresence>
  )
}
