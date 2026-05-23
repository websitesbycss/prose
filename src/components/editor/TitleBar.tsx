import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Sun, Moon, Maximize2, Sparkles, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'
import type { Editor } from '@tiptap/react'
import type { SaveStatus } from '@/hooks/useDocument'

interface TitleBarProps {
  document: Document | null
  editor: Editor | null
  saveStatus: SaveStatus
  onBack: () => void
  onSaveNow: () => Promise<void>
  onTitleChange: (title: string) => Promise<void>
}

const EXPORT_FORMATS = [
  { label: 'Word Document (.docx)', fn: 'toDocx',      typeName: 'a Word Document' },
  { label: 'PDF (.pdf)',            fn: 'toPdf',       typeName: 'a PDF' },
  { label: 'Markdown (.md)',        fn: 'toMarkdown',  typeName: 'a Markdown File' },
  { label: 'Plain Text (.txt)',     fn: 'toPlainText', typeName: 'a Plain Text File' },
] as const

const FORMAT_LABELS: Record<string, string> = {
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
  ieee: 'IEEE',
}

export default function TitleBar({
  document,
  saveStatus,
  onBack,
  onSaveNow,
  onTitleChange,
}: TitleBarProps): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const setFocusModeActive = useAppStore((s) => s.setFocusModeActive)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const issueCount = useAppStore((s) => s.issueCount)

  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleExport(fmt: typeof EXPORT_FORMATS[number]): Promise<void> {
    if (!document) return
    setExporting(true)
    setExportOpen(false)
    try {
      await window.prose.export[fmt.fn](document.id)
      toast.success(`${document.title} successfully exported as ${fmt.typeName}`)
    } catch (err) {
      console.error('Export error:', err)
      toast.error('Export failed')
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function startEdit(): void {
    setDraftTitle(document?.title ?? '')
    setEditing(true)
  }

  async function commitEdit(): Promise<void> {
    setEditing(false)
    if (draftTitle.trim() && draftTitle !== document?.title) {
      await onTitleChange(draftTitle.trim())
    }
  }

  const formatLabel = document ? FORMAT_LABELS[document.format] : undefined

  const saveIndicator =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
      ? 'Saved'
      : ''

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={async () => {
          await onSaveNow()
          onBack()
        }}
        title="Back to dashboard"
      >
        <ArrowLeft className="h-4 w-4" />
      </Button>

      <div className="flex flex-1 items-center gap-2 overflow-hidden">
        {editing ? (
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm font-medium outline-none focus:underline focus:underline-offset-2"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={() => void commitEdit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitEdit()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <button
            className="truncate text-sm font-medium hover:underline hover:underline-offset-2"
            onClick={startEdit}
            title="Click to rename"
          >
            {document?.title ?? 'Loading…'}
          </button>
        )}

        {formatLabel && (
          <Badge variant="secondary" className="shrink-0 text-xs">
            {formatLabel}
          </Badge>
        )}

        {saveIndicator && (
          <span className="shrink-0 text-xs text-muted-foreground">{saveIndicator}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Popover open={exportOpen} onOpenChange={setExportOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={!document || exporting}
              title="Export document"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" side="bottom" align="end">
            <div className="flex flex-col gap-0.5">
              {EXPORT_FORMATS.map((fmt) => (
                <button
                  key={fmt.fn}
                  className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                  onClick={() => void handleExport(fmt)}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-7 w-7', aiPanelOpen && 'bg-accent text-accent-foreground')}
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          title={aiPanelOpen ? 'Hide AI panel' : 'Show AI panel'}
          disabled={ollamaStatus === 'unavailable'}
        >
          <Sparkles className="h-3.5 w-3.5" />
          {issueCount > 0 && !aiPanelOpen && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground">
              {issueCount > 9 ? '9+' : issueCount}
            </span>
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setFocusModeActive(true)}
          title="Focus mode"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
