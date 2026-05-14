import { motion } from 'motion/react'
import { Edit2, Download, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatRelativeTime, extractWordCount } from '@/lib/utils'
import type { Document, Category } from '@/types'

interface DocumentCardProps {
  document: Document
  categories: Category[]
  onOpen: (id: string) => void
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
  onDelete,
}: DocumentCardProps): JSX.Element {
  const category = categories.find((c) => c.id === document.categoryId)
  const wordCount = extractWordCount(document.content)
  const formatLabel = FORMAT_LABELS[document.format]

  return (
    <motion.div
      variants={cardVariants}
      className="group relative flex flex-col gap-3 rounded-lg border border-border bg-card p-4 cursor-pointer hover:border-primary/40 transition-colors"
      onClick={() => onOpen(document.id)}
    >
      {category && (
        <span
          className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full"
          style={{ backgroundColor: category.color }}
        />
      )}

      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium leading-snug line-clamp-2 text-foreground pr-1">
          {document.title}
        </h3>
        {formatLabel && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {formatLabel}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{formatRelativeTime(document.updatedAt)}</span>
        <span>·</span>
        <span>{wordCount.toLocaleString()} words</span>
      </div>

      <div
        className="absolute right-2 top-2 hidden items-center gap-0.5 group-hover:flex"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onOpen(document.id)}
          title="Open"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-50 cursor-not-allowed"
          title="Export (available in Phase 10)"
          disabled
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
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
