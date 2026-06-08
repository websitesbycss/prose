import { memo } from 'react'
import type { SlideBackground, Gradient, PresentationTheme } from '@/types/slides'

function gradientToCss(gradient: Gradient): string {
  const stops = gradient.stops.map((s) => `${s.color} ${s.position}%`).join(', ')
  if (gradient.type === 'radial') return `radial-gradient(circle, ${stops})`
  return `linear-gradient(${gradient.angle ?? 90}deg, ${stops})`
}

interface Props {
  background: SlideBackground | undefined
  theme: PresentationTheme
}

export const SlideBackground = memo(function SlideBackground({ background, theme }: Props): JSX.Element {
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    zIndex: 0,
    pointerEvents: 'none',
  }

  if (!background) {
    return <div style={{ ...base, backgroundColor: theme.backgroundColor }} />
  }

  switch (background.type) {
    case 'solid':
      return <div style={{ ...base, backgroundColor: background.color }} />
    case 'linear-gradient':
    case 'radial-gradient':
      return <div style={{ ...base, background: gradientToCss(background.gradient) }} />
    case 'image':
      return (
        <div
          style={{
            ...base,
            backgroundImage: `url(${background.src})`,
            backgroundSize: background.size,
            backgroundPosition: 'center',
            backgroundRepeat: background.size === 'repeat' ? 'repeat' : 'no-repeat',
          }}
        />
      )
    default:
      return <div style={{ ...base, backgroundColor: theme.backgroundColor }} />
  }
})
