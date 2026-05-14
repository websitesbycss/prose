import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import type { Category, Document, DocumentFormat } from '@/types'

interface NewDocumentModalProps {
  open: boolean
  categories: Category[]
  onClose: () => void
  onCreated: (doc: Document) => void
}

const FORMATS: { value: DocumentFormat; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'mla', label: 'MLA' },
  { value: 'apa', label: 'APA' },
  { value: 'chicago', label: 'Chicago' },
  { value: 'ieee', label: 'IEEE' },
]

const HEADER_FORMATS = new Set<DocumentFormat>(['mla', 'apa'])

export default function NewDocumentModal({
  open,
  categories,
  onClose,
  onCreated,
}: NewDocumentModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<DocumentFormat>('none')
  const [categoryId, setCategoryId] = useState<string>('none')
  const [studentName, setStudentName] = useState('')
  const [instructorName, setInstructorName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [creating, setCreating] = useState(false)

  const needsHeader = HEADER_FORMATS.has(format)

  function reset(): void {
    setTitle('')
    setFormat('none')
    setCategoryId('none')
    setStudentName('')
    setInstructorName('')
    setCourseName('')
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  async function handleCreate(): Promise<void> {
    if (!title.trim()) return

    setCreating(true)
    try {
      const initialContent = buildInitialContent(format, {
        studentName: studentName.trim(),
        instructorName: instructorName.trim(),
        courseName: courseName.trim(),
      })

      const doc = await window.prose.documents.create({
        title: title.trim(),
        format,
        categoryId: categoryId === 'none' ? null : categoryId,
        content: initialContent,
      } as Parameters<typeof window.prose.documents.create>[0])

      onCreated(doc as Document)
      reset()
    } catch (err) {
      console.error('Create document error:', err)
      toast.error('Failed to create')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input
              placeholder="Untitled"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Format</label>
              <Select value={format} onValueChange={(v) => setFormat(v as DocumentFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {needsHeader && (
            <>
              <Separator />
              <div className="flex flex-col gap-3">
                <p className="text-xs text-muted-foreground">
                  Pre-fill {format.toUpperCase()} header
                </p>
                <Input
                  placeholder="Student name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                />
                <Input
                  placeholder="Instructor name"
                  value={instructorName}
                  onChange={(e) => setInstructorName(e.target.value)}
                />
                <Input
                  placeholder="Course name"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!title.trim() || creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildInitialContent(
  format: DocumentFormat,
  header: { studentName: string; instructorName: string; courseName: string }
): string {
  if (format !== 'mla' && format !== 'apa') return '{}'

  const today = new Date().toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const headerLines =
    format === 'mla'
      ? [header.studentName, header.instructorName, header.courseName, today].filter(Boolean)
      : [header.studentName, header.instructorName, header.courseName, today].filter(Boolean)

  const paragraphs = headerLines.map((line) => ({
    type: 'paragraph',
    content: line ? [{ type: 'text', text: line }] : [],
  }))

  return JSON.stringify({ type: 'doc', content: paragraphs.length ? paragraphs : [{ type: 'paragraph' }] })
}
