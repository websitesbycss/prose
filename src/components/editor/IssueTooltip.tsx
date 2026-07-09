// Hover tooltip for analysis-issue highlights in the document editor. Lives
// here (next to the editor) rather than in AiPanel.tsx — the Issues list and
// "Analyze document" button belong to the AI panel, but the highlights this
// tooltip tracks are painted directly onto the editor content, so the
// component that reads their live DOM position belongs with the editor too.
import { useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import type { Editor } from '@tiptap/react'
import { cn, zoomCorrectedRect } from '@/lib/utils'
import type { Issue } from '@/types'
import { ISSUE_COLORS, applyIssueSuggestion } from './AiPanel'

export function IssueTooltip({
  editor,
  issues,
}: {
  editor: Editor | null
  issues: Issue[]
}): JSX.Element {
  const [tooltip, setTooltip] = useState<{ issue: Issue; x: number; y: number } | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isOverTooltipRef = useRef(false)

  const scheduleHide = useCallback((): void => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      if (!isOverTooltipRef.current) setTooltip(null)
    }, 150)
  }, [])

  const cancelHide = useCallback((): void => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }, [])

  // Anchor to the top-center of the highlighted phrase itself, not the
  // cursor — so hovering anywhere over a multi-word highlight shows the
  // tooltip in the same spot. A single issue can be split across several DOM
  // fragments (mark boundaries like bold/link) and/or wrap across lines, so
  // gather every fragment sharing this issue id and use getClientRects()
  // (per-line rects) to find the topmost/leftmost line.
  const computeAnchor = useCallback((dom: HTMLElement, issueId: string): { x: number; y: number } | null => {
    const fragments = dom.querySelectorAll<HTMLElement>(`[data-issue-id="${CSS.escape(issueId)}"]`)
    let anchor: DOMRect | null = null
    fragments.forEach((frag) => {
      for (const rect of Array.from(frag.getClientRects())) {
        if (!anchor || rect.top < anchor.top || (rect.top === anchor.top && rect.left < anchor.left)) {
          anchor = rect
        }
      }
    })
    if (!anchor) return null
    // The editor's page-zoom control applies CSS `zoom` to an ancestor, which
    // throws off raw getClientRects() coordinates for anything positioned
    // with `position: fixed` — correct for it (see SpellTooltip's
    // resolveViewportCoords for the same issue on the suggestion popup).
    const corrected = zoomCorrectedRect(dom, anchor)
    return { x: corrected.left + corrected.width / 2, y: corrected.top }
  }, [])

  useEffect(() => {
    if (!editor || !editor.view) return

    function onMouseMove(e: MouseEvent): void {
      const target = e.target as HTMLElement
      const el = target.closest('[data-issue-id]') as HTMLElement | null
      if (!el) { scheduleHide(); return }
      cancelHide()
      const issueId = el.getAttribute('data-issue-id')
      const issue = issues.find((i) => i.id === issueId)
      if (!issue || !issueId) { scheduleHide(); return }
      const pos = computeAnchor(editor!.view.dom as HTMLElement, issueId)
      setTooltip(pos ? { issue, x: pos.x, y: pos.y } : { issue, x: e.clientX, y: e.clientY })
    }

    function onMouseLeave(): void { scheduleHide() }

    const dom = editor.view.dom as HTMLElement
    dom.addEventListener('mousemove', onMouseMove)
    dom.addEventListener('mouseleave', onMouseLeave)
    return () => {
      dom.removeEventListener('mousemove', onMouseMove)
      dom.removeEventListener('mouseleave', onMouseLeave)
      cancelHide()
    }
  }, [editor, issues, scheduleHide, cancelHide, computeAnchor])

  // The mousemove handler above only recomputes position when the mouse
  // itself moves, so scrolling the document (mouse wheel, trackpad, no mouse
  // movement) left the tooltip stuck at its old screen position while the
  // highlight moved out from under it — a `scroll` listener didn't reliably
  // catch every way the editor's content can scroll. Instead, poll the live
  // DOM position every animation frame for as long as a tooltip is showing,
  // so it tracks the highlight through any kind of scroll, resize, or layout
  // shift, not just mouse movement.
  useEffect(() => {
    if (!tooltip || !editor || !editor.view) return
    const issueId = tooltip.issue.id
    let rafId = 0
    const track = (): void => {
      const pos = computeAnchor(editor.view.dom as HTMLElement, issueId)
      if (pos) {
        setTooltip((prev) => {
          if (!prev || prev.issue.id !== issueId) return prev
          if (prev.x === pos.x && prev.y === pos.y) return prev
          return { ...prev, x: pos.x, y: pos.y }
        })
      }
      rafId = requestAnimationFrame(track)
    }
    rafId = requestAnimationFrame(track)
    return () => cancelAnimationFrame(rafId)
    // Deliberately keyed on the issue id (not the whole `tooltip` object) so
    // this loop keeps running continuously across x/y updates instead of
    // tearing down and restarting every single frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tooltip?.issue.id, editor, computeAnchor])

  // position: fixed is only viewport-relative when no ancestor has a CSS
  // `transform` set — the editor's page-zoom container almost certainly has
  // one, which would otherwise make "fixed" act like "absolute" relative to
  // that (scaled, scrolled) box instead of the real viewport. Portaling to
  // document.body sidesteps that entirely (same approach SpellTooltip uses).
  // Anchoring vs. animation must live on SEPARATE elements: the bottom-center
  // anchoring is done with a CSS translate, and framer-motion writes its own
  // inline `transform` (for the scale/y entrance) that would silently clobber
  // any translate classes on the same element — which left the tooltip's
  // top-LEFT corner at the anchor point instead of its bottom-center (i.e.
  // shifted to the bottom-right of the highlight by half its width + full
  // height). So: outer div owns fixed position + anchoring translate, inner
  // motion.div only animates.
  return createPortal((
    <AnimatePresence>
      {tooltip && (
        <div
          key="issue-tooltip"
          className="fixed z-[9999] -translate-x-1/2 -translate-y-full"
          style={{ left: tooltip.x + 52, top: tooltip.y - 4 }}
        >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 6 }}
          transition={{ duration: 0.13, ease: [0.25, 0.1, 0.25, 1] }}
          className="pointer-events-auto"
          onMouseEnter={() => { isOverTooltipRef.current = true; cancelHide() }}
          onMouseLeave={() => { isOverTooltipRef.current = false; scheduleHide() }}
        >
          <div className="rounded-lg border border-border bg-background px-3 py-2.5 shadow-lg max-w-[280px]">
            <div className="flex items-center gap-1.5 mb-1">
              <div className={cn('h-1.5 w-1.5 rounded-full shrink-0', ISSUE_COLORS[tooltip.issue.type])} />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {tooltip.issue.category}
              </span>
            </div>
            <p className="text-xs font-medium leading-snug">{tooltip.issue.message}</p>
            {tooltip.issue.suggestion && (
              <>
                <p className="mt-1.5 text-[10px] text-muted-foreground leading-relaxed">
                  <span className="text-foreground">{tooltip.issue.suggestion}</span>
                </p>
                <button
                  className="mt-2 w-full rounded-md bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20 text-left"
                  onClick={() => {
                    if (editor) applyIssueSuggestion(editor, tooltip.issue)
                    setTooltip(null)
                  }}
                >
                  Apply suggestion
                </button>
              </>
            )}
          </div>
          {/* Arrow pointing down toward text */}
          <div
            className="rotate-45 border-b border-r border-border bg-background"
            style={{ width: 8, height: 8, marginLeft: 'calc(50% - 4px)', marginTop: -1 }}
          />
        </motion.div>
        </div>
      )}
    </AnimatePresence>
  ), document.body)
}
