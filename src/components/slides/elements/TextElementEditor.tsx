import { useEffect, useRef, useState, useCallback } from 'react'
import type { TextElement } from '@/types/slides'

interface Props {
  element: TextElement
  scale: number
  onCommit(content: string): void
  onCancel(): void
}

// contenteditable overlay for in-place text editing.
// Commit on blur or Escape; the edited innerHTML becomes the new content.
export function TextElementEditor({ element, scale, onCommit, onCancel }: Props): JSX.Element {
  const divRef = useRef<HTMLDivElement>(null)
  const committedRef = useRef(false)
  const [isEmpty, setIsEmpty] = useState(!element.content || element.content === '' || element.content === '<br>')

  useEffect(() => {
    const el = divRef.current
    if (!el) return
    el.innerHTML = element.content
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    const sel = window.getSelection()
    if (sel) { sel.removeAllRanges(); sel.addRange(range) }
  }, []) // run once on mount

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
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault()
      commit()
      e.stopPropagation()
      return
    }
    if (e.key === 'Enter' && e.shiftKey) {
      // In a list item: insert a plain line break instead of a new bullet
      const sel = window.getSelection()
      let inListItem = false
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.anchorNode
        while (node && node !== divRef.current) {
          if (node.nodeName === 'LI') { inListItem = true; break }
          node = node.parentNode
        }
      }
      e.preventDefault()
      if (inListItem) {
        document.execCommand('insertLineBreak')
      } else {
        commit()
      }
      e.stopPropagation()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      // Indent/outdent only when cursor is inside a list item
      const sel = window.getSelection()
      if (sel && sel.rangeCount > 0) {
        let node: Node | null = sel.anchorNode
        while (node && node !== divRef.current) {
          if (node.nodeName === 'LI') {
            document.execCommand(e.shiftKey ? 'outdent' : 'indent')
            break
          }
          node = node.parentNode
        }
      }
      e.stopPropagation()
      return
    }
    e.stopPropagation()
  }, [commit, onCancel])

  const handleInput = useCallback((): void => {
    const el = divRef.current
    const empty = !el || !el.textContent?.trim()
    setIsEmpty(empty)
  }, [])

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
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div style={{ position: 'relative', width: '100%' }}>
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
              userSelect: 'none',
              color: 'rgba(150,150,150,0.7)',
              fontFamily: element.fontFamily,
              fontSize: element.fontSize * scale,
              lineHeight: element.lineHeight,
              letterSpacing: element.letterSpacing * scale,
              textAlign: alignMap[element.align],
              whiteSpace: 'pre-wrap',
              width: '100%',
            }}
          >
            Enter your text here...
          </div>
        )}
        <div
          ref={divRef}
          className="slide-text-content"
          contentEditable
          suppressContentEditableWarning
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
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
    </div>
  )
}
