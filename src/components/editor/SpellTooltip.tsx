import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { spellKey } from '@/extensions/spellcheckExtension'

interface TooltipState {
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

export function SpellTooltip({ editor }: SpellTooltipProps): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = useCallback((): void => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setState(null), 150)
  }, [])

  const cancelHide = useCallback((): void => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom as HTMLElement

    function onMouseOver(e: MouseEvent): void {
      const target = (e.target as HTMLElement).closest('.spell-error') as HTMLElement | null
      if (!target) { scheduleHide(); return }
      cancelHide()

      const word = target.getAttribute('data-word')
      if (!word) return

      const decoSet = spellKey.getState(editor!.state)
      if (!decoSet) return

      let fromPos: number
      try {
        fromPos = editor!.view.posAtDOM(target, 0)
      } catch {
        return
      }

      // Find the decoration for this word (search a small window around the element start)
      const candidates = decoSet
        .find(Math.max(0, fromPos - 1), fromPos + word.length + 1)
        .filter((d) => (d.spec as { word?: string }).word === word.toLowerCase())

      if (candidates.length === 0) return

      const deco = candidates[0]
      const spec = deco.spec as { word: string; suggestions: string[] }
      if (!spec.suggestions?.length) return

      const rect = target.getBoundingClientRect()
      setState({
        word,
        from: deco.from,
        to: deco.to,
        suggestions: spec.suggestions,
        x: rect.left,
        y: rect.top,
      })
    }

    function onMouseLeave(): void { scheduleHide() }

    dom.addEventListener('mouseover', onMouseOver)
    dom.addEventListener('mouseleave', onMouseLeave)
    return () => {
      dom.removeEventListener('mouseover', onMouseOver)
      dom.removeEventListener('mouseleave', onMouseLeave)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [editor, scheduleHide, cancelHide])

  // Dismiss when the cursor moves away from the squiggled word
  useEffect(() => {
    if (!editor || !state) return
    const handler = (): void => {
      const { from } = editor.state.selection
      if (from < state.from || from > state.to) setState(null)
    }
    editor.on('selectionUpdate', handler)
    return () => { editor.off('selectionUpdate', handler) }
  }, [editor, state])

  // Flip left if tooltip would overflow the right edge
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
    if (!editor || !state) return
    void window.prose.spell.addWord(state.word)
    editor.view.dispatch(editor.state.tr.setMeta(spellKey, { ignore: state.word }))
    setState(null)
  }

  const TOOLTIP_HEIGHT = 36
  return (
    <div
      ref={tooltipRef}
      style={{ position: 'fixed', left: state.x, top: state.y - TOOLTIP_HEIGHT - 6, zIndex: 9999, pointerEvents: 'auto' }}
      className="flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md"
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
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
