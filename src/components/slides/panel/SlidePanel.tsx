import { useRef, useState, useCallback } from 'react'
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
  onDeleteSlide(index: number): void
  onDuplicateSlide(index: number): void
  onReorderSlides(fromIdx: number, toIdx: number): void
}

interface ContextMenu { index: number; x: number; y: number }

export function SlidePanel({
  slides, theme, settings, activeIndex,
  onNavigate, onAddSlide, onDeleteSlide, onDuplicateSlide, onReorderSlides,
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
    function dismiss() { setCtxMenu(null); window.removeEventListener('mousedown', dismiss) }
    window.addEventListener('mousedown', dismiss)
  }, [])

  return (
    <div className="flex h-full w-[180px] shrink-0 flex-col border-r border-border bg-background">
      {/* Slide list */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-2">
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
              onClick={onAddSlide}
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
          className="fixed z-[99999] min-w-[160px] rounded-lg border border-border bg-background py-1 shadow-lg"
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
        >
          {[
            { label: 'Add slide after', action: () => { onAddSlide(); setCtxMenu(null) } },
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
