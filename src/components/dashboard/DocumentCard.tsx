import { useState, useRef, useEffect } from 'react'
import { motion } from 'motion/react'
import { Pencil, Download, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { formatRelativeTime, extractWordCount } from '@/lib/utils'
import type { Document, Category } from '@/types'

interface DocumentCardProps {
  document: Document
  categories: Category[]
  onOpen: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
}

const FORMAT_LABELS: Record<string, string> = {
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
  ieee: 'IEEE',
}

export const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.25, 0.1, 0.25, 1] } },
}

export default function DocumentCard({
  document,
  categories,
  onOpen,
  onRename,
  onDelete,
}: DocumentCardProps): JSX.Element {
  const category = categories.find((c) => c.id === document.categoryId)
  const wordCount = extractWordCount(document.content)
  const formatLabel = FORMAT_LABELS[document.format]

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(document.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(document.title)
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [editing, document.title])

  function commitRename(): void {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== document.title) onRename(document.id, trimmed)
    setEditing(false)
  }

  return (
    <motion.div
      variants={cardVariants}
      className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors"
      onClick={() => { if (!editing) onOpen(document.id) }}
    >
      {category && (
        <span
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
          style={{ backgroundColor: category.color }}
        />
      )}

      <div className="pr-16">
        {editing ? (
          <input
            ref={inputRef}
            className="w-full rounded border border-primary bg-background px-1.5 py-0.5 text-sm font-medium leading-snug text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { commitRename(); e.currentTarget.blur() }
              if (e.key === 'Escape') { setEditing(false) }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <h3 className="font-medium leading-snug line-clamp-2 text-foreground">
            {document.title}
          </h3>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatRelativeTime(document.updatedAt)}</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} words</span>
        {formatLabel && (
          <Badge variant="secondary" className="text-xs">
            {formatLabel}
          </Badge>
        )}
      </div>

      <div
        className="absolute right-2 top-2 hidden items-center gap-0.5 group-hover:flex"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setEditing(true)}
          title="Rename"
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <ExportMenu documentId={document.id} />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(document.id)}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}

function ExportMenu({ documentId }: { documentId: string }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function run(fn: () => Promise<void>, label: string): Promise<void> {
    setBusy(true)
    setOpen(false)
    try {
      await fn()
      toast.success(`Exported as ${label}`)
    } catch {
      toast.error('Export failed')
    } finally {
      setBusy(false)
    }
  }

  const formats: Array<{ label: string; fn: () => Promise<void> }> = [
    { label: 'Word (.docx)', fn: () => window.prose.export.toDocx(documentId) },
    { label: 'PDF',          fn: () => window.prose.export.toPdf(documentId) },
    { label: 'Markdown',     fn: () => window.prose.export.toMarkdown(documentId) },
    { label: 'Plain text',   fn: () => window.prose.export.toPlainText(documentId) },
  ]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Export" disabled={busy}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" side="bottom" align="end">
        {formats.map(({ label, fn }) => (
          <button
            key={label}
            className="w-full rounded px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent"
            onClick={() => void run(fn, label)}
          >
            {label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
