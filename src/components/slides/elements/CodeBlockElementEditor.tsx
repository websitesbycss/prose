import { useEffect, useRef, useState, useCallback } from 'react'
import type { CodeBlockElement } from '@/types/slides'

interface Props {
  element: CodeBlockElement
  scale: number
  onCommit(partial: Partial<CodeBlockElement>): void
  onCancel(): void
}

const LANGUAGES = [
  'plaintext', 'javascript', 'typescript', 'python', 'java', 'c', 'cpp',
  'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin', 'bash',
  'sql', 'html', 'css', 'json', 'yaml', 'markdown',
]

export function CodeBlockElementEditor({ element, scale, onCommit, onCancel }: Props): JSX.Element {
  const [code, setCode] = useState(element.code)
  const [language, setLanguage] = useState(element.language)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    textareaRef.current?.focus()
    const len = textareaRef.current?.value.length ?? 0
    textareaRef.current?.setSelectionRange(len, len)
  }, [])

  const commit = useCallback((): void => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit({ code, language })
  }, [code, language, onCommit])

  const isDark = element.theme === 'dark'
  const bg = isDark ? '#1e1e1e' : '#f8f8f8'
  const textColor = isDark ? '#d4d4d4' : '#24292e'
  const labelColor = isDark ? '#888' : '#aaa'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: bg,
        borderRadius: 4 * scale,
        overflow: 'hidden',
        border: '2px solid hsl(var(--primary))',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { committedRef.current = true; onCancel() }
        // Tab inserts spaces
        if (e.key === 'Tab') {
          e.preventDefault()
          const ta = textareaRef.current
          if (!ta) return
          const start = ta.selectionStart
          const end = ta.selectionEnd
          const newCode = code.substring(0, start) + '  ' + code.substring(end)
          setCode(newCode)
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2 })
        }
        e.stopPropagation()
      }}
    >
      {/* Language selector bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8 * scale,
          padding: `${5 * scale}px ${10 * scale}px`,
          borderBottom: `1px solid ${isDark ? '#333' : '#e5e7eb'}`,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: 'monospace', fontSize: 9 * scale, color: labelColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Language:
        </span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={{
            background: isDark ? '#2d2d2d' : '#fff',
            color: textColor,
            border: `1px solid ${isDark ? '#444' : '#d1d5db'}`,
            borderRadius: 4,
            fontSize: 10 * scale,
            padding: `${2 * scale}px ${4 * scale}px`,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        >
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {/* Code textarea */}
      <textarea
        ref={textareaRef}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        onBlur={commit}
        spellCheck={false}
        style={{
          flex: 1,
          resize: 'none',
          border: 'none',
          outline: 'none',
          backgroundColor: 'transparent',
          color: textColor,
          fontFamily: 'monospace',
          fontSize: element.fontSize * scale,
          lineHeight: 1.5,
          padding: `${8 * scale}px ${10 * scale}px`,
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      />
    </div>
  )
}
