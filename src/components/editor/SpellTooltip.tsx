import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'motion/react'
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
  lineHeight: number
}

interface SpellTooltipProps {
  editor: Editor | null
  documentId: string
}

const TOOLTIP_HEIGHT = 36

// coordsAtPos uses getBoundingClientRect() internally. In Chromium, CSS `zoom`
// on an ancestor causes those calls to return un-zoomed layout coords instead of
// viewport coords. Walk up to find the zoom container and apply the correction.
function resolveViewportCoords(editor: Editor, docPos: number): { x: number; y: number; lineHeight: number } | null {
  let raw: { left: number; top: number; bottom: number }
  try {
    raw = editor.view.coordsAtPos(docPos)
  } catch {
    return null
  }

  let el: HTMLElement | null = editor.view.dom as HTMLElement
  while (el) {
    const zoomStr = el.style.zoom
    if (zoomStr) {
      const zoom = parseFloat(zoomStr)
      if (!isNaN(zoom) && zoom !== 1) {
        const c = el.getBoundingClientRect()
        return {
          x: c.left + (raw.left - c.left) * zoom,
          y: c.top + (raw.top - c.top) * zoom,
          lineHeight: (raw.bottom - raw.top) * zoom,
        }
      }
    }
    el = el.parentElement
  }
  return { x: raw.left, y: raw.top, lineHeight: raw.bottom - raw.top }
}

export function SpellTooltip({ editor, documentId }: SpellTooltipProps): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  // Track hover state for word and tooltip separately so we only hide when both are false
  const overWordRef = useRef(false)
  const overTooltipRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleHideIfNeeded(): void {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    // Small delay to bridge any gap between leaving word and entering tooltip
    hideTimerRef.current = setTimeout(() => {
      if (!overWordRef.current && !overTooltipRef.current) setState(null)
    }, 80)
  }

  useEffect(() => {
    if (!editor || !editor.view) return
    const dom = editor.view.dom as HTMLElement

    function onMouseOver(e: MouseEvent): void {
      const target = (e.target as HTMLElement).closest('.spell-error') as HTMLElement | null

      if (!target) {
        overWordRef.current = false
        scheduleHideIfNeeded()
        return
      }

      overWordRef.current = true
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }

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

      const candidates = decoSet
        .find(Math.max(0, fromPos - 1), fromPos + word.length + 1)
        .filter((d) => (d.spec as { word?: string }).word === word.toLowerCase())

      if (candidates.length === 0) return

      const deco = candidates[0]
      const spec = deco.spec as { word: string; suggestions: string[] }
      if (!spec.suggestions?.length) return

      const coordsFrom = resolveViewportCoords(editor!, deco.from)
      const coordsTo = resolveViewportCoords(editor!, deco.to)
      if (!coordsFrom) return

      setState({
        word,
        from: deco.from,
        to: deco.to,
        suggestions: spec.suggestions,
        x: coordsTo ? (coordsFrom.x + coordsTo.x) / 2 : coordsFrom.x,
        y: coordsFrom.y,
        lineHeight: coordsFrom.lineHeight,
      })
    }

    function onMouseLeave(): void {
      overWordRef.current = false
      scheduleHideIfNeeded()
    }

    dom.addEventListener('mouseover', onMouseOver)
    dom.addEventListener('mouseleave', onMouseLeave)
    return () => {
      dom.removeEventListener('mouseover', onMouseOver)
      dom.removeEventListener('mouseleave', onMouseLeave)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [editor]) // eslint-disable-line react-hooks/exhaustive-deps

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
    void window.prose.spell.addWord(documentId, state.word)
    editor.view.dispatch(editor.state.tr.setMeta(spellKey, { ignore: state.word }))
    setState(null)
  }

  // Gap scales with line height so the tooltip stays visually close at any font size.
  // state.y is the top of the line box; subtract a small fraction so we don't land
  // all the way at the top of the leading — keeps the tooltip tight to the glyphs.
  const gap = Math.round(state.lineHeight * 0.15)
  const top = state.y - TOOLTIP_HEIGHT - gap

  return createPortal(
    <motion.div
      ref={tooltipRef}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ position: 'fixed', left: state.x, top, transform: 'translateX(-50%)', zIndex: 9999, pointerEvents: 'auto' }}
      className="flex items-center gap-1 rounded-lg border border-border bg-background px-1.5 py-1 shadow-md"
      onMouseEnter={() => {
        overTooltipRef.current = true
        if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
      }}
      onMouseLeave={() => {
        overTooltipRef.current = false
        scheduleHideIfNeeded()
      }}
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
    </motion.div>,
    document.body
  )
}
