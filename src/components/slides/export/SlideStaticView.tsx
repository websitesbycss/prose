// Minimal slide renderer for export rasterization. No interactivity.
import type { Slide, PresentationTheme, SlideMaster } from '@/types/slides'
import { SlideBackground } from '../canvas/SlideBackground'
import { renderSlideElement } from '../elements/renderSlideElement'

interface Props {
  slide: Slide
  theme: PresentationTheme
  master?: SlideMaster
  width: number
  height: number
}

export function SlideStaticView({ slide, theme, master, width, height }: Props): JSX.Element {
  const scale = width / 1920
  const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      <SlideBackground background={slide.background} theme={theme} />

      {master?.elements.map((mel) => (
        <div
          key={mel.id}
          style={{
            position: 'absolute',
            left: `${mel.x}%`, top: `${mel.y}%`,
            width: `${mel.width}%`, height: `${mel.height}%`,
            zIndex: 0, overflow: 'hidden', pointerEvents: 'none',
          }}
        >
          {mel.type === 'logo' && mel.src && (
            <img src={mel.src} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          )}
          {mel.type === 'footer' && (
            <div style={{
              width: '100%', height: '100%', display: 'flex', alignItems: 'center',
              fontSize: (mel.fontSize ?? 16) * scale,
              color: mel.color ?? theme.textColor,
              fontFamily: 'Inter',
            }}>
              {mel.content}
            </div>
          )}
        </div>
      ))}

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
          {renderSlideElement(el, scale)}
        </div>
      ))}
    </div>
  )
}
