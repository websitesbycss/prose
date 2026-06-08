import { memo } from 'react'
import type { CodeBlockElement } from '@/types/slides'

interface Props {
  element: CodeBlockElement
  scale: number
}

export const CodeBlockElementRenderer = memo(function CodeBlockElementRenderer({ element, scale }: Props): JSX.Element {
  const isDark = element.theme === 'dark'
  const bg = isDark ? '#1e1e1e' : '#f8f8f8'
  const textColor = isDark ? '#d4d4d4' : '#24292e'
  const labelColor = isDark ? '#666' : '#aaa'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: bg,
        borderRadius: 4 * scale,
        padding: `${10 * scale}px ${12 * scale}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {element.language && (
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 9 * scale,
            color: labelColor,
            marginBottom: 5 * scale,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            flexShrink: 0,
          }}
        >
          {element.language}
        </div>
      )}
      <pre
        style={{
          fontFamily: 'monospace',
          fontSize: element.fontSize * scale,
          color: textColor,
          margin: 0,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          lineHeight: 1.5,
          flex: 1,
        }}
      >
        <code>{element.code}</code>
      </pre>
    </div>
  )
})
