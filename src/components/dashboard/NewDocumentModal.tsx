import { useState, useEffect } from 'react'
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
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { Document, DocumentFormat, PageMargins } from '@/types'
import { DEFAULT_PAGE_MARGINS, PAGE_MARGIN_MIN_IN, PAGE_MARGIN_MAX_IN } from '@/constants'
import { buildMlaContent, buildApaContent } from '@/lib/templates'
import { buildMlaHeaderContent, buildApaHeaderContent } from '@/components/editor/HeaderFooterEditor'

interface NewDocumentModalProps {
  open: boolean
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
  onClose,
  onCreated,
}: NewDocumentModalProps): JSX.Element {
  const [title, setTitle] = useState('')
  const [format, setFormat] = useState<DocumentFormat>('none')
  const [studentName, setStudentName] = useState('')
  const [instructorName, setInstructorName] = useState('')
  const [courseName, setCourseName] = useState('')
  const [institution, setInstitution] = useState('')
  const [essayTitle, setEssayTitle] = useState('')
  const [defaultWordCountGoal, setDefaultWordCountGoal] = useState<number | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [pageMargins, setPageMargins] = useState<PageMargins>(DEFAULT_PAGE_MARGINS)
  const [creating, setCreating] = useState(false)

  // Pre-fill format and word count goal from settings on each open
  useEffect(() => {
    if (!open) return
    void window.prose.settings.get().then((s) => {
      const appSettings = s as { defaultFormat: string; defaultWordCountGoal: number | null }
      setFormat(appSettings.defaultFormat as DocumentFormat)
      setDefaultWordCountGoal(appSettings.defaultWordCountGoal)
    })
  }, [open])

  const needsHeader = HEADER_FORMATS.has(format)

  function reset(): void {
    setTitle('')
    setFormat('none')
    setStudentName('')
    setInstructorName('')
    setCourseName('')
    setInstitution('')
    setEssayTitle('')
    setAdvancedOpen(false)
    setPageMargins(DEFAULT_PAGE_MARGINS)
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  async function handleCreate(): Promise<void> {
    if (!title.trim()) return

    setCreating(true)
    try {
      let contentStr = '{}'
      let headerStr: string | null = null

      if (format === 'mla') {
        const content = buildMlaContent(
          {
            studentName: studentName.trim(),
            instructorName: instructorName.trim(),
            courseName: courseName.trim(),
            essayTitle: essayTitle.trim(),
          },
          []
        )
        contentStr = JSON.stringify(content)
        const lastName = studentName.trim().split(/\s+/).pop() ?? ''
        headerStr = JSON.stringify(buildMlaHeaderContent(lastName))
      } else if (format === 'apa') {
        const content = buildApaContent(
          {
            essayTitle: essayTitle.trim(),
            studentName: studentName.trim(),
            institution: institution.trim(),
            courseAndNumber: courseName.trim(),
            instructorName: instructorName.trim(),
          },
          []
        )
        contentStr = JSON.stringify(content)
        const shortTitle = essayTitle.trim().toUpperCase().slice(0, 50)
        headerStr = JSON.stringify(buildApaHeaderContent(shortTitle))
      }

      const doc = await window.prose.documents.create({
        title: title.trim(),
        format,
        content: contentStr,
        wordCountGoal: defaultWordCountGoal,
        pageMargins,
      } as Parameters<typeof window.prose.documents.create>[0])

      // documents:create doesn't accept headerContent — set it in a follow-up update
      if (headerStr) {
        await window.prose.documents.update((doc as Document).id, { headerContent: headerStr })
      }

      onCreated(headerStr ? { ...(doc as Document), headerContent: headerStr } : (doc as Document))
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
              onKeyDown={(e) => e.key === 'Enter' && void handleCreate()}
              autoFocus
            />
          </div>

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

          <Separator />
          <button
            type="button"
            onClick={() => setAdvancedOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Advanced
          </button>

          {advancedOpen && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">Page margins</p>
              <div className="grid grid-cols-2 gap-2">
                {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                  <div key={side} className="flex items-center gap-1.5">
                    <label className="w-12 text-xs capitalize text-muted-foreground">{side}</label>
                    <Input
                      type="number"
                      step={0.25}
                      min={PAGE_MARGIN_MIN_IN}
                      max={PAGE_MARGIN_MAX_IN}
                      className="h-7 w-16 text-xs"
                      value={pageMargins[side]}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (!isNaN(v)) {
                          setPageMargins((m) => ({
                            ...m,
                            [side]: Math.min(PAGE_MARGIN_MAX_IN, Math.max(PAGE_MARGIN_MIN_IN, v)),
                          }))
                        }
                      }}
                    />
                    <span className="text-xs text-muted-foreground">in</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                {format === 'apa' && (
                  <Input
                    placeholder="Institution"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                  />
                )}
                <Input
                  placeholder={format === 'apa' ? 'Course name and number' : 'Course name'}
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
                <Input
                  placeholder={format === 'apa' ? 'Paper title' : 'Essay title'}
                  value={essayTitle}
                  onChange={(e) => setEssayTitle(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={() => void handleCreate()} disabled={!title.trim() || creating}>
            {creating ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
