import { memo, useEffect, useRef, useState } from 'react'
import type { Slide, PresentationTheme, PresentationSettings } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { SlideBackgroundLayer } from '../canvas/SlideBackground'
import { renderSlideElement } from '../elements/renderSlideElement'
import { cn } from '@/lib/utils'

const THUMB_W = 156
const THUMB_H = Math.round(THUMB_W * (SLIDE_BASE_HEIGHT / SLIDE_BASE_WIDTH))
const THUMB_SCALE = THUMB_W / SLIDE_BASE_WIDTH

interface Props {
  slide: Slide
  slideNumber: number
  theme: PresentationTheme
  settings: PresentationSettings
  isActive: boolean
  isDragOver: boolean
  onMouseDown(e: React.MouseEvent): void
  onClick(): void
  onContextMenu(e: React.MouseEvent): void
}

export const SlideThumbnail = memo(function SlideThumbnail({
  slide, slideNumber, theme, isActive, isDragOver,
  onMouseDown, onClick, onContextMenu,
}: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry?.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold: 0, rootMargin: '120px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const sortedElements = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div
      className={cn(
        'flex cursor-pointer flex-col items-center gap-1 rounded-sm px-2 pt-2 pb-1',
        isActive && 'bg-accent dark:bg-white/15',
        isDragOver && 'bg-primary/10',
      )}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {/* Thumbnail frame */}
      <div
        ref={ref}
        style={{ width: THUMB_W, height: THUMB_H, flexShrink: 0 }}
        className={cn(
          'relative overflow-hidden rounded-[2px] border',
          isActive ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.4)]' : 'border-border/60',
        )}
      >
        {visible ? (
          <div
            style={{
              width: SLIDE_BASE_WIDTH,
              height: SLIDE_BASE_HEIGHT,
              transform: `scale(${THUMB_SCALE})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            <SlideBackgroundLayer background={slide.background} theme={theme} />
            {sortedElements.filter((e) => !e.hidden).map((el) => (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  transform: `rotate(${el.rotate}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
                  transformOrigin: 'center center',
                  opacity: el.opacity,
                  zIndex: el.zIndex,
                  overflow: 'hidden',
                }}
              >
                {renderSlideElement(el, 1, true)}
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full w-full animate-pulse bg-muted/30" />
        )}
      </div>

      {/* Slide number */}
      <span className="text-[10px] text-muted-foreground/70 tabular-nums">{slideNumber}</span>
    </div>
  )
})
