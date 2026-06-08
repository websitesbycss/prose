import { useEffect, useRef, useState, useCallback } from 'react'
import type { EquationElement } from '@/types/slides'

interface Props {
  element: EquationElement
  scale: number
  onCommit(partial: Partial<EquationElement>): void
  onCancel(): void
}

export function EquationElementEditor({ element, scale, onCommit, onCancel }: Props): JSX.Element {
  const [latex, setLatex] = useState(element.latex)
  const previewRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const committedRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (!previewRef.current) return
    void import('katex').then(({ default: katex }) => {
      if (!previewRef.current) return
      try {
        katex.render(latex || 'e = mc^2', previewRef.current, {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        })
      } catch {
        if (previewRef.current) previewRef.current.textContent = latex
      }
    })
  }, [latex])

  const commit = useCallback((): void => {
    if (committedRef.current) return
    committedRef.current = true
    onCommit({ latex })
  }, [latex, onCommit])

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'rgba(255,255,255,0.97)',
        border: '2px solid #3B82F6',
        borderRadius: 4,
        overflow: 'hidden',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { committedRef.current = true; onCancel() }
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        e.stopPropagation()
      }}
    >
      <input
        ref={inputRef}
        value={latex}
        onChange={(e) => setLatex(e.target.value)}
        onBlur={commit}
        placeholder="Enter LaTeX expression…"
        style={{
          border: 'none',
          borderBottom: '1px solid #e5e7eb',
          padding: `${4 * scale}px ${6 * scale}px`,
          fontSize: Math.max(11, 13 * scale),
          fontFamily: 'monospace',
          outline: 'none',
          backgroundColor: '#f9fafb',
          flexShrink: 0,
        }}
      />
      <div
        ref={previewRef}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          fontSize: element.fontSize * scale,
          color: element.color,
          padding: `${4 * scale}px`,
        }}
      />
    </div>
  )
}
