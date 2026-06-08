import { useEffect, useRef, useCallback } from 'react'
import type { TextElement } from '@/types/slides'

interface Props {
  element: TextElement
  scale: number
  onCommit(content: string): void
  onCancel(): void
}

// contenteditable overlay for in-place text editing.
// Renders on top of the TextElementRenderer, accepting raw HTML content.
// Commit on blur or Escape; the edited innerHTML becomes the new content.
export function TextElementEditor({ element, scale, onCommit, onCancel }: Props): JSX.Element {
  const divRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    el.innerHTML = element.content
    // Place cursor at end
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); sel.addRange(range) }
  }, []) // run once on mount — intentionally no element.content dep

  const commit = useCallback((): void => {
    if (committedRef.current) return
    committedRef.current = true
    const content = divRef.current?.innerHTML ?? element.content
    onCommit(content)
  }, [element.content, onCommit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      committedRef.current = true
      onCancel()
      return
    }
    // Ctrl+Enter or Shift+Enter commits (Enter alone creates <br> inside the contenteditable)
    if (e.key === 'Enter' && (e.ctrlKey || e.shiftKey)) {
      e.preventDefault()
      commit()
    }
    e.stopPropagation() // prevent slide keyboard shortcuts while editing
  }, [commit, onCancel])

  const alignMap: Record<TextElement['align'], string> = {
    left: 'left', center: 'center', right: 'right', justify: 'justify',
  }

  const vAlignMap: Record<TextElement['verticalAlign'], string> = {
    top: 'flex-start', middle: 'center', bottom: 'flex-end',
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: vAlignMap[element.verticalAlign],
        background: element.fill ?? 'transparent',
        padding: `${4 * scale}px`,
        boxSizing: 'border-box',
        cursor: 'text',
        zIndex: 1,
      }}
    >
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={commit}
        onKeyDown={handleKeyDown}
        style={{
          outline: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: element.fontFamily,
          fontSize: element.fontSize * scale,
          color: element.color,
          textAlign: alignMap[element.align],
          lineHeight: element.lineHeight,
          letterSpacing: element.letterSpacing * scale,
          minHeight: 1,
          width: '100%',
        }}
      />
    </div>
  )
}
