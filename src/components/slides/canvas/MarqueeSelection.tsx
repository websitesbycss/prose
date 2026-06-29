import type { MarqueeRect } from './types'

interface Props {
  rect: MarqueeRect
}

export function MarqueeSelection({ rect }: Props): JSX.Element {
  const { startX, startY, endX, endY } = rect
  const left = Math.min(startX, endX)
  const top = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)

  return (
    <div
      style={{
        position: 'absolute',
        left: `${left}%`,
        top: `${top}%`,
        width: `${width}%`,
        height: `${height}%`,
        border: '1.5px dashed hsl(var(--primary))',
        backgroundColor: 'hsl(var(--primary) / 0.08)',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  )
}
