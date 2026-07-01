// Minimal slide renderer for export rasterization. No interactivity.
import type { Slide, PresentationTheme } from '@/types/slides'
import { SlideBackgroundLayer } from '../canvas/SlideBackground'
import { renderSlideElement } from '../elements/renderSlideElement'

interface Props {
  slide: Slide
  theme: PresentationTheme
  width: number
  height: number
}

export function SlideStaticView({ slide, theme, width, height }: Props): JSX.Element {
  const scale = width / 1920
  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      <SlideBackgroundLayer background={slide.background} theme={theme} />

      {sorted.filter((e) => !e.hidden).map((el) => (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}%`, top: `${el.y}%`,
            width: `${el.width}%`, height: `${el.height}%`,
            transform: `rotate(${el.rotate}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
            transformOrigin: 'center center',
            opacity: el.opacity,
            zIndex: el.zIndex,
            overflow: 'hidden',
          }}
        >
          {renderSlideElement(el, scale, true)}
        </div>
      ))}
    </div>
  )
}
