import { memo } from 'react'
import type { ImageElement } from '@/types/slides'

interface Props {
  element: ImageElement
  scale: number
}

export const ImageElementRenderer = memo(function ImageElementRenderer({ element, scale }: Props): JSX.Element {
  const { src, altText, crop, borderRadius, border, shadow, filters } = element

  const filterParts: string[] = []
  if (filters.brightness !== 100) filterParts.push(`brightness(${filters.brightness}%)`)
  if (filters.contrast !== 100) filterParts.push(`contrast(${filters.contrast}%)`)
  if (filters.saturation !== 100) filterParts.push(`saturate(${filters.saturation}%)`)
  if (filters.blur !== 0) filterParts.push(`blur(${filters.blur * scale}px)`)
  const filterStr = filterParts.join(' ') || undefined

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: borderRadius * scale,
    border: border ? `${border.width * scale}px ${border.style} ${border.color}` : undefined,
    boxShadow: shadow
      ? `${shadow.offsetX * scale}px ${shadow.offsetY * scale}px ${shadow.blur * scale}px ${shadow.color}`
      : undefined,
    boxSizing: 'border-box',
  }

  if (crop) {
    const l = crop.left / 100
    const r = crop.right / 100
    const t = crop.top / 100
    const b = crop.bottom / 100
    const scaleW = 1 / (1 - l - r)
    const scaleH = 1 / (1 - t - b)
    return (
      <div style={containerStyle}>
        <div
          style={{
            position: 'relative',
            width: `${scaleW * 100}%`,
            height: `${scaleH * 100}%`,
            marginLeft: `${-l * scaleW * 100}%`,
            marginTop: `${-t * scaleH * 100}%`,
          }}
        >
          <img src={src} alt={altText} style={{ width: '100%', height: '100%', objectFit: 'fill', filter: filterStr, display: 'block' }} draggable={false} />
        </div>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      <img src={src} alt={altText} style={{ width: '100%', height: '100%', objectFit: 'fill', filter: filterStr, display: 'block' }} draggable={false} />
    </div>
  )
})
