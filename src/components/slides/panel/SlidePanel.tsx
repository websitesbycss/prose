import { useRef, useState, useCallback, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SlideThumbnail } from './SlideThumbnail'
import type { Slide, PresentationTheme, PresentationSettings } from '@/types/slides'
import { cn } from '@/lib/utils'

interface Props {
  slides: Slide[]
  theme: PresentationTheme
  settings: PresentationSettings
  activeIndex: number
  onNavigate(index: number): void
  onAddSlide(): void
  onInsertBlankSlide(afterIndex: number): void
  onDeleteSlide(index: number): void
  onDuplicateSlide(index: number): void
  onReorderSlides(fromIdx: number, toIdx: number): void
}

interface ContextMenu { index: number; x: number; y: number }

export function SlidePanel({
  slides, theme, settings, activeIndex,
  onNavigate, onAddSlide, onInsertBlankSlide, onDeleteSlide, onDuplicateSlide, onReorderSlides,
}: Props): JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null)
  const dragStartY = useRef(0)
  const isDragging = useRef(false)

  const handleThumbnailMouseDown = useCallback((e: React.MouseEvent, idx: number): void => {
    if (e.button !== 0) return
    dragStartY.current = e.clientY
    isDragging.current = false

    function onMove(ev: MouseEvent): void {
      if (!isDragging.current && Math.abs(ev.clientY - dragStartY.current) > 6) {
        isDragging.current = true
        setDragFromIdx(idx)
      }
      if (!isDragging.current || !listRef.current) return
      const items = listRef.current.querySelectorAll<HTMLElement>('[data-slide-idx]')
      let nearest = slides.length
      for (const item of items) {
        const rect = item.getBoundingClientRect()
        const midY = rect.top + rect.height / 2
        if (ev.clientY < midY) { nearest = Number(item.dataset.slideIdx!); break }
      }
      setDragOverIdx(nearest)
    }

    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      if (isDragging.current && dragFromIdx !== null && dragOverIdx !== null && dragOverIdx !== dragFromIdx) {
        onReorderSlides(dragFromIdx, dragOverIdx > dragFromIdx ? dragOverIdx - 1 : dragOverIdx)
      }
      setDragFromIdx(null)
      setDragOverIdx(null)
      isDragging.current = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [dragFromIdx, dragOverIdx, slides.length, onReorderSlides])

  const handleContextMenu = useCallback((e: React.MouseEvent, idx: number): void => {
    e.preventDefault()
    setCtxMenu({ index: idx, x: e.clientX, y: e.clientY })
  }, [])

  // Moves DOM focus to the newly active thumbnail so repeated arrow presses
  // keep stepping from the current slide instead of the originally-clicked
  // one (every thumbnail already exists in the DOM — only its "active"
  // styling changes — so this can focus synchronously, no need to wait for
  // the isActive re-render).
  const focusThumbnail = useCallback((idx: number): void => {
    listRef.current?.querySelector<HTMLElement>(`[data-slide-idx="${idx}"] [tabindex]`)?.focus()
  }, [])

  // Newly added slides (via the "Add slide" button, "Add slide after", or
  // Duplicate) always land as the active slide with nothing selected on the
  // canvas — focus its thumbnail so Delete/arrow keys work on it immediately.
  const prevSlideCountRef = useRef(slides.length)
  useEffect(() => {
    if (slides.length > prevSlideCountRef.current) focusThumbnail(activeIndex)
    prevSlideCountRef.current = slides.length
  }, [slides.length, activeIndex, focusThumbnail])

  // A focused thumbnail (clicked, not mid-drag/rename) can be deleted or
  // navigated away from with the keyboard — mirrors the context menu's
  // "Delete slide" and clicking a neighboring thumbnail.
  const handleThumbnailKeyDown = useCallback((e: React.KeyboardEvent, idx: number): void => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onDeleteSlide(idx)
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (idx > 0) { onNavigate(idx - 1); focusThumbnail(idx - 1) }
      return
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      if (idx < slides.length - 1) { onNavigate(idx + 1); focusThumbnail(idx + 1) }
    }
  }, [onDeleteSlide, onNavigate, slides.length, focusThumbnail])

  // Dismiss on outside pointer — menu stops propagation so item clicks work
  useEffect(() => {
    if (!ctxMenu) return
    function dismiss(e: PointerEvent): void {
      if ((e.target as HTMLElement).closest('[data-slide-ctx-menu]')) return
      setCtxMenu(null)
    }
    window.addEventListener('pointerdown', dismiss, true)
    return () => window.removeEventListener('pointerdown', dismiss, true)
  }, [ctxMenu])

  return (
    <div className="flex h-full w-[180px] shrink-0 flex-col border-r border-border bg-background">
      {/* Slide list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-1">
        {slides.map((slide, idx) => (
          <div key={slide.id} data-slide-idx={idx} className="relative">
            {/* Drop indicator above */}
            {dragOverIdx === idx && (
              <div className="mx-3 h-0.5 rounded-full bg-primary" />
            )}
            <SlideThumbnail
              slide={slide}
              slideNumber={idx + 1}
              theme={theme}
              settings={settings}
              isActive={idx === activeIndex}
              isDragOver={dragFromIdx === idx}
              onMouseDown={(e) => handleThumbnailMouseDown(e, idx)}
              onClick={() => onNavigate(idx)}
              onContextMenu={(e) => handleContextMenu(e, idx)}
              onKeyDown={(e) => handleThumbnailKeyDown(e, idx)}
            />
          </div>
        ))}
        {/* Drop indicator at end */}
        {dragOverIdx === slides.length && (
          <div className="mx-3 h-0.5 rounded-full bg-primary" />
        )}
      </div>

      {/* Add slide button */}
      <div className="shrink-0 border-t border-border p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border/60 py-1.5 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
              onClick={() => onAddSlide()}
            >
              <Plus className="h-3 w-3" />
              Add slide
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Add slide after current</TooltipContent>
        </Tooltip>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div
          data-slide-ctx-menu
          className="fixed z-[99999] min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {[
            { label: 'Add slide after', action: () => { onInsertBlankSlide(ctxMenu.index); setCtxMenu(null) } },
            { label: 'Duplicate slide', action: () => { onDuplicateSlide(ctxMenu.index); setCtxMenu(null) } },
            null,
            { label: 'Delete slide', action: () => { onDeleteSlide(ctxMenu.index); setCtxMenu(null) }, danger: true },
          ].map((item, i) =>
            item === null
              ? <div key={i} className="my-1 h-px bg-border" />
              : (
                <button
                  key={i}
                  className={cn('flex w-full px-3 py-1.5 text-xs', item.danger ? 'text-destructive hover:bg-destructive/10' : 'text-foreground hover:bg-accent')}
                  onClick={item.action}
                >
                  {item.label}
                </button>
              )
          )}
        </div>
      )}
    </div>
  )
}
