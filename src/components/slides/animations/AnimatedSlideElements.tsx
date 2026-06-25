import type { ReactNode } from 'react'
import type { SlideElement } from '@/types/slides'

interface ActiveAnimationState {
  className: string
  duration: number
  delay: number
}

interface Props {
  elements: SlideElement[]
  visibleElementIds: Set<string>
  activeAnimationByElement: Record<string, ActiveAnimationState>
  onElementAnimationEnd?: (elementId: string) => void
  renderElement: (element: SlideElement) => ReactNode
}

export function AnimatedSlideElements({
  elements,
  visibleElementIds,
  activeAnimationByElement,
  onElementAnimationEnd,
  renderElement,
}: Props): JSX.Element {
  return (
    <>
      {elements.map((element) => {
        const active = activeAnimationByElement[element.id]
        const isVisible = visibleElementIds.has(element.id)
        return (
          <div
            key={element.id}
            style={{
              position: 'absolute',
              left: `${element.x}%`,
              top: `${element.y}%`,
              width: `${element.width}%`,
              height: `${element.height}%`,
              transform: `rotate(${element.rotate}deg) scaleX(${element.flipH ? -1 : 1}) scaleY(${element.flipV ? -1 : 1})`,
              transformOrigin: 'center center',
              opacity: isVisible ? element.opacity : 0,
              zIndex: element.zIndex,
              overflow: 'hidden',
              pointerEvents: 'none',
              visibility: isVisible ? 'visible' : 'hidden',
              ['--anim-duration' as string]: `${active?.duration ?? 0}ms`,
              ['--anim-delay' as string]: `${active?.delay ?? 0}ms`,
            }}
            className={active?.className}
            onAnimationEnd={() => onElementAnimationEnd?.(element.id)}
          >
            {renderElement(element)}
          </div>
        )
      })}
    </>
  )
}
