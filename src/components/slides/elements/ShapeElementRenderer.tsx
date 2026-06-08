import { memo } from 'react'
import type { ShapeElement, ShapeType } from '@/types/slides'

interface Props {
  element: ShapeElement
  scale: number
}

function star(cx: number, cy: number, outerR: number, innerR: number, points: number): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2
    const r = i % 2 === 0 ? outerR : innerR
    pts.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

type ShapePrimitiveProps = {
  fill: string
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
}

function ShapePrimitive({ shapeType, fill, stroke, strokeWidth, strokeDasharray, cornerRadius }: ShapePrimitiveProps & { shapeType: ShapeType; cornerRadius: number }): JSX.Element {
  const p = { fill, stroke, strokeWidth, strokeDasharray, vectorEffect: 'non-scaling-stroke' as const }
  switch (shapeType) {
    case 'rect':
    case 'flowchart-process':
      return <rect {...p} x="0" y="0" width="100" height="100" rx={cornerRadius} ry={cornerRadius} />
    case 'roundRect':
    case 'flowchart-terminal':
      return <rect {...p} x="0" y="0" width="100" height="100" rx={cornerRadius} ry={cornerRadius} />
    case 'ellipse':
    case 'flowchart-connector':
      return <ellipse {...p} cx="50" cy="50" rx="50" ry="50" />
    case 'triangle':
      return <polygon {...p} points="50,3 97,97 3,97" />
    case 'rightTriangle':
      return <polygon {...p} points="3,97 97,97 3,3" />
    case 'parallelogram':
    case 'flowchart-data':
      return <polygon {...p} points="22,3 100,3 78,97 0,97" />
    case 'trapezoid':
      return <polygon {...p} points="18,3 82,3 100,97 0,97" />
    case 'arrow-right':
      return <polygon {...p} points="0,33 62,33 62,5 100,50 62,95 62,67 0,67" />
    case 'arrow-left':
      return <polygon {...p} points="100,33 38,33 38,5 0,50 38,95 38,67 100,67" />
    case 'arrow-up':
      return <polygon {...p} points="33,100 33,38 5,38 50,0 95,38 67,38 67,100" />
    case 'arrow-down':
      return <polygon {...p} points="33,0 33,62 5,62 50,100 95,62 67,62 67,0" />
    case 'arrow-double':
      return <polygon {...p} points="0,50 18,5 18,36 82,36 82,5 100,50 82,95 82,64 18,64 18,95" />
    case 'line':
      return <line stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" x1="3" y1="50" x2="97" y2="50" />
    case 'connector':
      return (
        <>
          <defs>
            <marker id="slide-arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={stroke} />
            </marker>
          </defs>
          <line
            stroke={stroke} strokeWidth={strokeWidth}
            vectorEffect="non-scaling-stroke"
            x1="3" y1="50" x2="94" y2="50"
            markerEnd="url(#slide-arrow)"
          />
        </>
      )
    case 'speech-bubble':
      return <path {...p} d="M 0,0 L 100,0 L 100,72 L 28,72 L 10,100 L 18,72 L 0,72 Z" />
    case 'thought-bubble':
      return (
        <g {...p}>
          <rect x="5" y="5" width="90" height="68" rx="20" ry="20" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
          <circle cx="22" cy="83" r="7" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
          <circle cx="12" cy="94" r="4.5" fill={fill} stroke={stroke} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" />
        </g>
      )
    case 'star-4':
      return <path {...p} d={star(50, 50, 46, 18, 4)} />
    case 'star-5':
      return <path {...p} d={star(50, 50, 46, 20, 5)} />
    case 'star-6':
      return <path {...p} d={star(50, 50, 46, 28, 6)} />
    case 'banner':
      return <path {...p} d="M 0,0 L 84,0 L 100,50 L 84,100 L 0,100 Z" />
    case 'wave':
      return <path {...p} d="M 0,62 Q 25,22 50,52 Q 75,82 100,42 L 100,100 L 0,100 Z" />
    case 'flowchart-decision':
      return <polygon {...p} points="50,3 97,50 50,97 3,50" />
    default:
      return <rect {...p} x="0" y="0" width="100" height="100" />
  }
}

export const ShapeElementRenderer = memo(function ShapeElementRenderer({ element, scale }: Props): JSX.Element {
  const {
    fill, gradient, border, shadow, cornerRadius = 10,
    content, textAlign = 'center', textVerticalAlign = 'middle',
    textFontFamily, textFontSize = 18, textColor = '#000000',
  } = element

  const strokeColor = border?.color ?? 'transparent'
  const strokeWidth = border?.width ?? 0
  const strokeDasharray = border?.style === 'dashed' ? '6,3' : border?.style === 'dotted' ? '2,3' : undefined

  let fillValue = fill
  if (gradient) {
    fillValue = 'url(#shape-gradient)'
  }

  const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
  const hAlignMap = { left: 'flex-start', center: 'center', right: 'flex-end', justify: 'center' } as const

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        boxShadow: shadow
          ? `${shadow.offsetX * scale}px ${shadow.offsetY * scale}px ${shadow.blur * scale}px ${shadow.color}`
          : undefined,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ width: '100%', height: '100%', display: 'block', overflow: 'visible' }}
      >
        {gradient && (
          <defs>
            {gradient.type === 'linear' ? (
              <linearGradient id="shape-gradient" gradientTransform={`rotate(${gradient.angle ?? 90}, 0.5, 0.5)`} gradientUnits="objectBoundingBox">
                {gradient.stops.map((s, i) => (
                  <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
                ))}
              </linearGradient>
            ) : (
              <radialGradient id="shape-gradient" cx="50%" cy="50%" r="50%" gradientUnits="userSpaceOnUse">
                {gradient.stops.map((s, i) => (
                  <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
                ))}
              </radialGradient>
            )}
          </defs>
        )}
        <ShapePrimitive
          shapeType={element.shapeType}
          fill={fillValue}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          cornerRadius={cornerRadius}
        />
      </svg>

      {content && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: vAlignMap[textVerticalAlign],
            justifyContent: hAlignMap[textAlign],
            padding: `${8 * scale}px`,
            fontFamily: textFontFamily,
            fontSize: textFontSize * scale,
            color: textColor,
            textAlign,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <span style={{ maxWidth: '100%', wordBreak: 'break-word' }}>{content}</span>
        </div>
      )}
    </div>
  )
})
