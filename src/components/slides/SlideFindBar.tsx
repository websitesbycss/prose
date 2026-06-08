// Phase 32 — Find in presentation bar (Ctrl+F).
// Searches all slide text elements; navigates to matching slides with highlights.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { Slide } from '@/types/slides'

interface Match {
  slideIndex: number
  elementId: string
  text: string
}

interface Props {
  slides: Slide[]
  onNavigate(slideIndex: number): void
  onClose(): void
}

function extractText(slide: Slide): string {
  return slide.elements
    .filter(e => e.type === 'text' && e.content)
    .map(e => (e as { content?: string }).content ?? '')
    .join(' ')
}

export function SlideFindBar({ slides, onNavigate, onClose }: Props): JSX.Element {
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches: Match[] = query.trim()
    ? slides.flatMap((slide, si) =>
        slide.elements
          .filter(e => e.type === 'text' && (e as { content?: string }).content?.toLowerCase().includes(query.toLowerCase()))
          .map(e => ({ slideIndex: si, elementId: e.id, text: (e as { content?: string }).content ?? '' }))
      )
    : []

  const clampedIndex = matches.length > 0 ? matchIndex % matches.length : 0

  useEffect(() => {
    if (matches.length > 0) {
      onNavigate(matches[clampedIndex]!.slideIndex)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampedIndex, query])

  const prev = useCallback((): void => {
    setMatchIndex(i => (i - 1 + matches.length) % Math.max(matches.length, 1))
  }, [matches.length])

  const next = useCallback((): void => {
    setMatchIndex(i => (i + 1) % Math.max(matches.length, 1))
  }, [matches.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'Enter' && matches.length > 0) {
        e.preventDefault()
        if (e.shiftKey) prev()
        else next()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); inputRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [matches.length, next, prev, onClose])

  return (
    <div
      className="absolute right-4 top-2 z-50 flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 shadow-lg"
      role="search"
      aria-label="Find in presentation"
    >
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        className="w-48 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
        placeholder="Find in presentation…"
        value={query}
        onChange={e => { setQuery(e.target.value); setMatchIndex(0) }}
        aria-label="Search query"
      />
      {query && (
        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
          {matches.length === 0 ? 'No results' : `${clampedIndex + 1} / ${matches.length}`}
        </span>
      )}
      <button
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent disabled:opacity-40"
        onClick={prev}
        disabled={matches.length === 0}
        aria-label="Previous match"
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent disabled:opacity-40"
        onClick={next}
        disabled={matches.length === 0}
        aria-label="Next match"
      >
        <ChevronDown className="h-3 w-3" />
      </button>
      <button
        className="flex h-5 w-5 items-center justify-center rounded hover:bg-accent"
        onClick={onClose}
        aria-label="Close find bar"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
