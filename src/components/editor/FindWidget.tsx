import { useState, useEffect, useRef } from 'react'
import { Search, ChevronUp, ChevronDown, X, Replace } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { getFindState } from '@/extensions/findExtension'
import { cn } from '@/lib/utils'

interface FindWidgetProps {
  editor: Editor | null
  open: boolean
  onClose: () => void
  onNavigate?: () => void
}

export function FindWidget({ editor, open, onClose, onNavigate }: FindWidgetProps): JSX.Element | null {
  const [query, setQuery] = useState('')
  const [replaceValue, setReplaceValue] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [matchInfo, setMatchInfo] = useState({ count: 0, index: 0 })
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync match info from editor on every transaction
  useEffect(() => {
    if (!editor) return
    const update = () => {
      const s = getFindState(editor)
      setMatchInfo({ count: s.results.length, index: s.currentIndex })
    }
    editor.on('transaction', update)
    return () => { editor.off('transaction', update) }
  }, [editor])

  // Focus and clear on open/close
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setQuery('')
      setReplaceValue('')
      setShowReplace(false)
      if (editor?.view) editor.commands.clearFind()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Drive findExtension whenever query changes
  useEffect(() => {
    if (!editor) return
    if (query) {
      editor.commands.setFind(query)
    } else {
      editor.commands.clearFind()
    }
  }, [query, editor])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        editor?.commands.findPrev()
      } else {
        editor?.commands.findNext()
      }
      onNavigate?.()
    }
    if (e.key === 'Escape') {
      onClose()
      editor?.view.focus()
    }
  }

  const matchCount = open ? matchInfo.count : 0
  const matchIndex = matchCount > 0 ? matchInfo.index + 1 : 0

  if (!open) return null

  return (
    <div
      className="pointer-events-auto absolute right-4 top-4 z-50 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg"
      style={{ minWidth: 280 }}
    >
      {/* Find row */}
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <button
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setShowReplace((s) => !s)}
          title="Toggle replace"
          tabIndex={-1}
        >
          <Replace className={cn('h-3.5 w-3.5 transition-transform', showReplace && 'text-primary')} />
        </button>

        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />

        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          placeholder="Find…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {query.length > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
            {matchCount === 0 ? 'No results' : `${matchIndex} / ${matchCount}`}
          </span>
        )}

        <button
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => { editor?.commands.findPrev(); onNavigate?.(); inputRef.current?.focus() }}
          title="Previous match (Shift+Enter)"
          tabIndex={-1}
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => { editor?.commands.findNext(); onNavigate?.(); inputRef.current?.focus() }}
          title="Next match (Enter)"
          tabIndex={-1}
        >
          <ChevronDown className="h-3 w-3" />
        </button>
        <button
          className="ml-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => { onClose(); editor?.view.focus() }}
          title="Close (Escape)"
          tabIndex={-1}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5 border-t border-border px-2 py-1.5">
          <div className="w-3.5 shrink-0" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
            placeholder="Replace with…"
            value={replaceValue}
            onChange={(e) => setReplaceValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (editor && query && replaceValue !== undefined) {
                  editor.commands.findNext()
                  onNavigate?.()
                }
              }
              if (e.key === 'Escape') { onClose(); editor?.view.focus() }
            }}
          />
          <button
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Replace current match"
            onClick={() => {
              if (!editor || !query) return
              // Replace the current highlighted match by inserting text at selection
              const { from, to } = editor.state.selection
              if (from !== to) {
                editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, replaceValue).run()
              }
              editor.commands.findNext()
              onNavigate?.()
            }}
          >
            Replace
          </button>
        </div>
      )}
    </div>
  )
}
