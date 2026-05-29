import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import type { Node as PmNode } from '@tiptap/pm/model'

interface SpellTooltipState {
  word: string
  from: number
  to: number
  suggestions: string[]
  x: number
  y: number
}

interface SpellTooltipProps {
  editor: Editor | null
}

// Extract the word around a document position.
function wordAt(doc: PmNode, pos: number): { word: string; from: number; to: number } | null {
  const $pos = doc.resolve(pos)
  const text = $pos.parent.textContent
  const offset = $pos.parentOffset
  if (!text) return null

  let start = offset
  while (start > 0 && /[\w']/.test(text[start - 1]!)) start--
  let end = offset
  while (end < text.length && /[\w']/.test(text[end]!)) end++
  if (start >= end) return null

  const word = text.slice(start, end).replace(/^'+|'+$/g, '') // strip leading/trailing apostrophes
  if (word.length < 2) return null

  const blockStart = $pos.start()
  return { word, from: blockStart + start, to: blockStart + end }
}

export function SpellTooltip({ editor }: SpellTooltipProps): JSX.Element | null {
  const [state, setState] = useState<SpellTooltipState | null>(null)
  const [ignored, setIgnored] = useState<Set<string>>(new Set())
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom as HTMLElement

    function handler(e: MouseEvent): void {
      if (e.button !== 0) return
      void (async () => {
        await new Promise<void>((r) => setTimeout(r, 50))
        const { state: edState } = editor!
        const { from } = edState.selection
        const info = wordAt(edState.doc, from)
        if (!info) { setState(null); return }
        if (ignored.has(info.word.toLowerCase())) { setState(null); return }
        const result = await window.prose.spell.check(info.word)
        if (result.correct || result.suggestions.length === 0) { setState(null); return }
        try {
          const coords = editor!.view.coordsAtPos(info.from)
          setState({ word: info.word, from: info.from, to: info.to, suggestions: result.suggestions, x: coords.left, y: coords.top })
        } catch {
          setState(null)
        }
      })()
    }

    dom.addEventListener('mouseup', handler)
    return () => dom.removeEventListener('mouseup', handler)
  }, [editor, ignored])

  // Dismiss when editor selection moves away from the word
  useEffect(() => {
    if (!editor || !state) return
    const handler = (): void => {
      const { from } = editor.state.selection
      if (from < state.from || from > state.to) setState(null)
    }
    editor.on('selectionUpdate', handler)
    return () => { editor.off('selectionUpdate', handler) }
  }, [editor, state])

  // Flip tooltip up if it would go off-screen bottom
  useLayoutEffect(() => {
    if (!state || !tooltipRef.current) return
    const rect = tooltipRef.current.getBoundingClientRect()
    if (rect.right > window.innerWidth - 8) {
      tooltipRef.current.style.left = `${window.innerWidth - rect.width - 8}px`
    }
  }, [state])

  if (!state) return null

  function applySuggestion(suggestion: string): void {
    if (!editor) return
    const { tr } = editor.state
    tr.replaceWith(state!.from, state!.to, editor.state.schema.text(suggestion))
    editor.view.dispatch(tr)
    setState(null)
  }

  function ignore(): void {
    setIgnored((prev) => new Set([...prev, state!.word.toLowerCase()]))
    setState(null)
  }

  // Render the tooltip fixed above the word
  const TOOLTIP_HEIGHT = 36
  return (
    <div
      ref={tooltipRef}
      style={{
        position: 'fixed',
        left: state.x,
        top: state.y - TOOLTIP_HEIGHT - 6,
        zIndex: 9999,
        pointerEvents: 'auto',
      }}
      className="flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md"
      onMouseDown={(e) => e.preventDefault()}
    >
      {state.suggestions.map((s) => (
        <button
          key={s}
          className="rounded px-2 py-0.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
          onClick={() => applySuggestion(s)}
        >
          {s}
        </button>
      ))}
      <div className="mx-0.5 h-4 w-px bg-border" />
      <button
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        onClick={ignore}
        title="Ignore"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
