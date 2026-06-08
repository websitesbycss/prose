import { useRef, useCallback } from 'react'
import type { TableElement, TableCell } from '@/types/slides'

interface Props {
  element: TableElement
  scale: number
  onCommit(partial: Partial<TableElement>): void
  onCancel(): void
}

interface CellProps {
  cell: TableCell
  isHeader: boolean
  isFirst: boolean
  scale: number
  borderStyle: string
  onCommitCell(content: string): void
}

function EditableCell({ cell, isHeader, isFirst, scale, borderStyle, onCommitCell }: CellProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  // Set content via ref to avoid dangerouslySetInnerHTML + contentEditable conflict
  const initRef = useRef(false)
  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    ;(ref as React.MutableRefObject<HTMLDivElement | null>).current = el
    if (!initRef.current) {
      initRef.current = true
      el.innerHTML = cell.content
      if (isFirst) {
        el.focus()
        const range = document.createRange()
        range.selectNodeContents(el)
        range.collapse(false)
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges(); sel.addRange(range) }
      }
    }
  }, [cell.content, isFirst])

  return (
    <td
      colSpan={cell.colspan ?? 1}
      rowSpan={cell.rowspan ?? 1}
      style={{
        border: borderStyle,
        padding: `${4 * scale}px ${6 * scale}px`,
        verticalAlign: 'middle',
        backgroundColor: 'transparent',
        color: cell.style?.color ?? 'inherit',
        fontWeight: cell.style?.bold || isHeader ? 'bold' : 'normal',
        fontStyle: cell.style?.italic ? 'italic' : 'normal',
        fontSize: cell.style?.fontSize ? cell.style.fontSize * scale : undefined,
        fontFamily: cell.style?.fontFamily,
        overflow: 'hidden',
      }}
    >
      <div
        ref={setRef}
        contentEditable
        suppressContentEditableWarning
        style={{
          outline: 'none',
          minHeight: `${16 * scale}px`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textAlign: cell.style?.align ?? (isHeader ? 'center' : 'left'),
          cursor: 'text',
        }}
        onBlur={(e) => onCommitCell(e.currentTarget.innerHTML)}
        onKeyDown={(e) => {
          // Tab moves to next cell
          if (e.key === 'Tab') {
            e.preventDefault()
            onCommitCell(e.currentTarget.innerHTML)
            const tds = document.querySelectorAll('[data-table-editor-cell]')
            const idx = Array.from(tds).indexOf(e.currentTarget.closest('[data-table-editor-cell]') as Element)
            const next = tds[idx + (e.shiftKey ? -1 : 1)] as HTMLElement | undefined
            next?.querySelector<HTMLElement>('[contenteditable]')?.focus()
          }
          e.stopPropagation()
        }}
        data-table-cell-editable
      />
    </td>
  )
}

export function TableElementEditor({ element, scale, onCommit, onCancel }: Props): JSX.Element {
  // Track updated rows in a ref to avoid re-render issues
  const rowsRef = useRef(element.rows.map((row) => row.map((cell) => ({ ...cell }))))

  const borderStyle = element.border
    ? `${element.border.width * scale}px ${element.border.style} ${element.border.color}`
    : `${scale}px solid #d1d5db`

  function updateCell(ri: number, ci: number, content: string) {
    rowsRef.current = rowsRef.current.map((row, i) =>
      i === ri ? row.map((cell, j) => j === ci ? { ...cell, content } : cell) : row
    )
  }

  function commit() {
    onCommit({ rows: rowsRef.current })
  }

  let firstCell = true

  return (
    <div
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', border: '2px solid #3B82F6', borderRadius: 2 }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { onCancel() }
      }}
      onBlur={(e) => {
        // Commit when focus leaves the entire table editor
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          commit()
        }
      }}
    >
      <table
        style={{
          width: '100%',
          height: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 14 * scale,
        }}
      >
        {element.hasHeaderRow && rowsRef.current[0] && (
          <thead>
            <tr style={{ backgroundColor: element.headerColor ?? '#f3f4f6' }}>
              {rowsRef.current[0].map((cell, ci) => {
                const isFirst = firstCell; if (firstCell) firstCell = false
                return (
                  <td key={ci} data-table-editor-cell style={{ border: borderStyle }}>
                    <EditableCell
                      cell={cell}
                      isHeader
                      isFirst={isFirst}
                      scale={scale}
                      borderStyle="none"
                      onCommitCell={(content) => updateCell(0, ci, content)}
                    />
                  </td>
                )
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {rowsRef.current.slice(element.hasHeaderRow ? 1 : 0).map((row, ri) => {
            const actualRi = ri + (element.hasHeaderRow ? 1 : 0)
            return (
              <tr key={ri}>
                {row.map((cell, ci) => {
                  const isFirst = firstCell; if (firstCell) firstCell = false
                  return (
                    <td key={ci} data-table-editor-cell style={{ border: borderStyle }}>
                      <EditableCell
                        cell={cell}
                        isHeader={false}
                        isFirst={isFirst}
                        scale={scale}
                        borderStyle="none"
                        onCommitCell={(content) => updateCell(actualRi, ci, content)}
                      />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
