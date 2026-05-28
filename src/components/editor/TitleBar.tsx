import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Sun, Moon, Maximize2, Sparkles, Download, Search, X, ChevronUp, ChevronDown } from 'lucide-react'
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
import { getFindState } from '@/extensions/findExtension'

interface TitleBarProps {
  document: Document | null
  editor: Editor | null
  saveStatus: SaveStatus
  onBack: () => void
  onSaveNow: () => Promise<void>
  onTitleChange: (title: string) => Promise<void>
  findOpen: boolean
  onFindOpenChange: (open: boolean) => void
  findInputRef: React.RefObject<HTMLInputElement>
  onFindNavigate?: () => void
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
  editor,
  saveStatus,
  onBack,
  onSaveNow,
  onTitleChange,
  findOpen,
  onFindOpenChange,
  findInputRef,
  onFindNavigate,
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
  const [findQuery, setFindQuery] = useState('')
  const [findMatchInfo, setFindMatchInfo] = useState({ count: 0, index: 0 })
  const titleInputRef = useRef<HTMLInputElement>(null)

  // Re-read find plugin state after every transaction so the counter stays live
  useEffect(() => {
    if (!editor) return
    const update = (): void => {
      const s = getFindState(editor)
      setFindMatchInfo({ count: s.results.length, index: s.currentIndex })
    }
    editor.on('transaction', update)
    return () => { editor.off('transaction', update) }
  }, [editor])

  // Focus find input when findOpen becomes true
  useEffect(() => {
    if (findOpen) {
      setTimeout(() => findInputRef.current?.focus(), 0)
    } else {
      setFindQuery('')
      editor?.commands.clearFind()
    }
  }, [findOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run search whenever query changes
  useEffect(() => {
    if (!editor) return
    if (findQuery) {
      editor.commands.setFind(findQuery)
    } else {
      editor.commands.clearFind()
    }
  }, [findQuery, editor])

  const matchCount = findOpen ? findMatchInfo.count : 0
  const matchIndex = matchCount > 0 ? findMatchInfo.index + 1 : 0

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
    if (editing) titleInputRef.current?.select()
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

  function handleFindKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) editor?.commands.findPrev()
      else editor?.commands.findNext()
      onFindNavigate?.()
    }
    if (e.key === 'Escape') {
      onFindOpenChange(false)
      editor?.view.focus()
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
      {/* Left: back + title */}
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
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

        {editing ? (
          <input
            ref={titleInputRef}
            className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none focus:underline focus:underline-offset-2"
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

      {/* Center: find bar (only shown when open) */}
      {findOpen && (
        <div className="flex shrink-0 items-center">
          <div className="flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={findInputRef}
              className="w-40 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              placeholder="Find…"
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              onKeyDown={handleFindKeyDown}
            />
            {findQuery.length > 0 && (
              <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                {matchCount === 0 ? 'No results' : `${matchIndex} / ${matchCount}`}
              </span>
            )}
            <button
              className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => { editor?.commands.findPrev(); onFindNavigate?.(); findInputRef.current?.focus() }}
              title="Previous match (Shift+Enter)"
              tabIndex={-1}
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              className="text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => { editor?.commands.findNext(); onFindNavigate?.(); findInputRef.current?.focus() }}
              title="Next match (Enter)"
              tabIndex={-1}
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <button
              className="ml-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => { onFindOpenChange(false); editor?.view.focus() }}
              title="Close (Escape)"
              tabIndex={-1}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-0.5">
        {/* Search icon lives here when bar is closed — same gap as other icons */}
        {!findOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onFindOpenChange(true)}
            title="Find (Ctrl+F)"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        )}

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
