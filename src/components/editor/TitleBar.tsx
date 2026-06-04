import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Maximize2, Sparkles, Download, Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/appStore'
import { DocumentTabBar } from '@/components/editor/DocumentTabBar'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'
import type { Editor } from '@tiptap/react'
import type { SaveStatus } from '@/hooks/useDocument'
import { getFindState } from '@/extensions/findExtension'
import ExportModal from '@/components/editor/ExportModal'

interface TitleBarProps {
  document: Document | null
  editor: Editor | null
  saveStatus: SaveStatus
  onSaveNow: () => Promise<void>
  onTitleChange: (title: string) => Promise<void>
  findOpen: boolean
  onFindOpenChange: (open: boolean) => void
  findInputRef: React.RefObject<HTMLInputElement>
  onFindNavigate?: () => void
}

export default function TitleBar({
  document,
  editor,
  saveStatus,
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
  const activeDocumentId = useAppStore((s) => s.activeDocumentId)
  const showDashboard = useAppStore((s) => s.showDashboard)
  const updateDocumentTab = useAppStore((s) => s.updateDocumentTab)
  const openTabs = useAppStore((s) => s.openTabs)

  const [editingTitle, setEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findMatchInfo, setFindMatchInfo] = useState({ count: 0, index: 0 })

  useEffect(() => {
    if (!editor) return
    const update = (): void => {
      const s = getFindState(editor)
      setFindMatchInfo({ count: s.results.length, index: s.currentIndex })
    }
    editor.on('transaction', update)
    return () => { editor.off('transaction', update) }
  }, [editor])

  useEffect(() => {
    if (findOpen) {
      setTimeout(() => findInputRef.current?.focus(), 0)
    } else {
      setFindQuery('')
      editor?.commands.clearFind()
    }
  }, [findOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editor) return
    if (findQuery) {
      editor.commands.setFind(findQuery)
    } else {
      editor.commands.clearFind()
    }
  }, [findQuery, editor])

  useEffect(() => {
    if (document) {
      updateDocumentTab(document.id, { title: document.title, format: document.format })
    }
  }, [document?.id, document?.title, document?.format, updateDocumentTab])

  const matchCount = findOpen ? findMatchInfo.count : 0
  const matchIndex = matchCount > 0 ? findMatchInfo.index + 1 : 0

  function startTitleEdit(): void {
    setDraftTitle(document?.title ?? '')
    setEditingTitle(true)
  }

  async function commitTitleEdit(): Promise<void> {
    setEditingTitle(false)
    if (draftTitle.trim() && draftTitle !== document?.title) {
      await onTitleChange(draftTitle.trim())
      if (document) {
        updateDocumentTab(document.id, { title: draftTitle.trim() })
      }
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

  const saveIndicator =
    saveStatus === 'saving'
      ? 'Saving…'
      : saveStatus === 'saved'
      ? 'Saved'
      : ''

  const hasTabs = openTabs.length > 0

  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-foreground">
      {hasTabs ? (
        <DocumentTabBar
          activeDocumentId={activeDocumentId}
          editingTitle={editingTitle}
          draftTitle={draftTitle}
          onDraftTitleChange={setDraftTitle}
          onStartTitleEdit={startTitleEdit}
          onCommitTitleEdit={() => void commitTitleEdit()}
          onCancelTitleEdit={() => setEditingTitle(false)}
          saveIndicator={saveIndicator}
        />
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <span className="truncate text-sm font-medium">{document?.title ?? 'Loading…'}</span>
          {saveIndicator && (
            <span className="shrink-0 text-xs text-muted-foreground">{saveIndicator}</span>
          )}
        </div>
      )}

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

      <div className="flex shrink-0 items-center gap-0.5">
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

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!document}
          title="Preview and export"
          onClick={() => setExportModalOpen(true)}
        >
          <Download className="h-3.5 w-3.5" />
        </Button>

        {document && (
          <ExportModal
            open={exportModalOpen}
            onClose={() => setExportModalOpen(false)}
            documentId={document.id}
            documentTitle={document.title}
            documentMargins={document.pageMargins}
          />
        )}

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
