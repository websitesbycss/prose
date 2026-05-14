import { useState, useRef, useEffect } from 'react'
import { ArrowLeft, Sun, Moon, Maximize2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

  const [editing, setEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

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
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', aiPanelOpen && 'bg-accent text-accent-foreground')}
          onClick={() => setAiPanelOpen(!aiPanelOpen)}
          title={aiPanelOpen ? 'Hide AI panel' : 'Show AI panel'}
          disabled={ollamaStatus === 'unavailable'}
        >
          <Sparkles className="h-3.5 w-3.5" />
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
