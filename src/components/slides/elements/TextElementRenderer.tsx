import { memo } from 'react'
import type { TextElement } from '@/types/slides'

interface Props {
  element: TextElement
  scale: number
  isStatic?: boolean
}

export const TextElementRenderer = memo(function TextElementRenderer({ element, scale, isStatic = false }: Props): JSX.Element {
  const {
    content, fontFamily, fontSize, color, align, verticalAlign,
    lineHeight, letterSpacing, fill, border, shadow, overflow,
  } = element

  const vAlignMap = { top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const
  const overflowCss = overflow === 'clip' ? 'hidden' : 'visible'

  const isEmpty = !content || content === '' || content === '<br>'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: vAlignMap[verticalAlign],
        overflow: overflowCss,
        padding: `${4 * scale}px`,
        background: fill ?? 'transparent',
        border: border ? `${border.width * scale}px ${border.style} ${border.color}` : undefined,
        boxShadow: shadow
          ? `${shadow.offsetX * scale}px ${shadow.offsetY * scale}px ${shadow.blur * scale}px ${shadow.color}`
          : undefined,
        boxSizing: 'border-box',
      }}
    >
      {isEmpty && !isStatic ? (
        <div
          style={{
            width: '100%',
            fontFamily,
            fontSize: fontSize * scale,
            color: 'rgba(150,150,150,0.6)',
            textAlign: align,
            lineHeight,
            letterSpacing: letterSpacing * scale,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontStyle: 'italic',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          Enter your text here...
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            fontFamily,
            fontSize: fontSize * scale,
            color,
            textAlign: align,
            lineHeight,
            letterSpacing: letterSpacing * scale,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
          dangerouslySetInnerHTML={{ __html: content }}
        />
      )}
    </div>
  )
})
