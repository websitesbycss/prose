import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import type { TableElement, TableCell } from '@/types/slides'

interface Props {
  element: TableElement
  scale: number
  onCommit(partial: Partial<TableElement>): void
  onCancel(): void
  onCellSelect?: (cellIds: string[]) => void
}

interface CellProps {
  cell: TableCell
  isHeader: boolean
  isSelected: boolean
  scale: number
  headerColor?: string
  borderStyle: string
  onFocus(): void
  onUpdateContent(content: string): void
  containerRef: React.RefObject<HTMLDivElement>
}

function EditableCell({ cell, isHeader, isSelected, scale, headerColor, borderStyle, onFocus, onUpdateContent, containerRef }: CellProps): JSX.Element {
  const divRef = useRef<HTMLDivElement>(null)
  const hasInit = useRef(false)

  useLayoutEffect(() => {
    if (!hasInit.current && divRef.current) {
      hasInit.current = true
      divRef.current.innerHTML = cell.content
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const s = cell.style ?? {}

  return (
    <td
      colSpan={cell.colspan ?? 1}
      rowSpan={cell.rowspan ?? 1}
      style={{
        border: borderStyle,
        padding: `${3 * scale}px ${5 * scale}px`,
        verticalAlign: s.verticalAlign ?? 'top',
        backgroundColor: isHeader
          ? (s.backgroundColor ?? headerColor ?? '#f3f4f6')
          : (s.backgroundColor ?? 'transparent'),
        boxShadow: isSelected ? 'inset 0 0 0 2px #3B82F6' : 'none',
        fontWeight: (isHeader || s.bold) ? 'bold' : 'normal',
        fontStyle: s.italic ? 'italic' : 'normal',
        textDecoration: [s.underline && 'underline', s.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
        fontSize: s.fontSize ? s.fontSize * scale : undefined,
        fontFamily: s.fontFamily,
        color: s.color,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        ref={divRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={onFocus}
        onBlur={(e) => onUpdateContent(e.currentTarget.innerHTML)}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            // Let Tab bubble to container for navigation — don't stop propagation
            return
          }
          e.stopPropagation()
        }}
        style={{
          outline: 'none',
          minHeight: `${14 * scale}px`,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textAlign: s.align ?? (isHeader ? 'center' : 'left'),
          cursor: 'text',
          userSelect: 'text',
        }}
      />
    </td>
  )
}

export function TableElementEditor({ element, scale, onCommit, onCancel, onCellSelect }: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const numCols = element.colWidths.length
  const numRows = element.rows.length

  const normalizeWeights = (arr: number[]): number[] => {
    const total = arr.reduce((a, b) => a + b, 0)
    return total > 0 ? arr.map((v) => (v / total) * 100) : arr.map(() => 100 / arr.length)
  }

  const [colWidths, setColWidths] = useState<number[]>(() => normalizeWeights(element.colWidths))
  const [rowHeights, setRowHeights] = useState<number[]>(() =>
    element.rowHeights ? normalizeWeights(element.rowHeights) : Array(numRows).fill(100 / numRows),
  )
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null)
  const [cellsKey, setCellsKey] = useState(0)

  // rowsRef holds the mutable cell content (not re-rendered on every keypress)
  const rowsRef = useRef<TableCell[][]>(element.rows.map((r) => r.map((c) => ({ ...c }))))

  // Reinitialize when rows/cols are added or removed (e.g., from toolbar ops)
  const prevStructRef = useRef({ rows: numRows, cols: numCols })
  useEffect(() => {
    const prev = prevStructRef.current
    if (prev.rows !== numRows || prev.cols !== numCols) {
      prevStructRef.current = { rows: numRows, cols: numCols }
      rowsRef.current = element.rows.map((r) => r.map((c) => ({ ...c })))
      setColWidths(normalizeWeights(element.colWidths))
      if (element.rowHeights) setRowHeights(normalizeWeights(element.rowHeights))
      else setRowHeights(Array(numRows).fill(100 / numRows))
      setCellsKey((k) => k + 1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numRows, numCols])

  // Notify parent of selected cells
  useEffect(() => {
    onCellSelect?.(selectedCellId ? [selectedCellId] : [])
  }, [selectedCellId, onCellSelect])

  const commit = useCallback((): void => {
    // Merge latest typed content into element's rows (preserves toolbar-applied styles)
    const mergedRows = element.rows.length === rowsRef.current.length &&
      element.rows[0]?.length === rowsRef.current[0]?.length
      ? element.rows.map((row, ri) =>
          row.map((cell, ci) => ({
            ...cell,
            content: rowsRef.current[ri]?.[ci]?.content ?? cell.content,
          })),
        )
      : element.rows
    onCommit({ rows: mergedRows, colWidths, rowHeights })
  }, [element.rows, colWidths, rowHeights, onCommit])

  function startColResize(colIdx: number, e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const containerW = containerRef.current!.getBoundingClientRect().width
    const startWidths = [...colWidths]

    function onMove(ev: MouseEvent): void {
      const dx = ((ev.clientX - startX) / containerW) * 100
      const newWidths = [...startWidths]
      newWidths[colIdx] = Math.max(4, startWidths[colIdx] + dx)
      newWidths[colIdx + 1] = Math.max(4, startWidths[colIdx + 1] - dx)
      setColWidths(normalizeWeights(newWidths))
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startRowResize(rowIdx: number, e: React.MouseEvent): void {
    e.preventDefault()
    e.stopPropagation()
    const startY = e.clientY
    const containerH = containerRef.current!.getBoundingClientRect().height
    const startHeights = [...rowHeights]

    function onMove(ev: MouseEvent): void {
      const dy = ((ev.clientY - startY) / containerH) * 100
      const newHeights = [...startHeights]
      newHeights[rowIdx] = Math.max(3, startHeights[rowIdx] + dy)
      newHeights[rowIdx + 1] = Math.max(3, startHeights[rowIdx + 1] - dy)
      setRowHeights(normalizeWeights(newHeights))
    }
    function onUp(): void {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Cumulative positions for resize handles
  const colHandles = colWidths.slice(0, -1).reduce<Array<{ x: number; i: number }>>((acc, _, i) => {
    const x = colWidths.slice(0, i + 1).reduce((a, b) => a + b, 0)
    return [...acc, { x, i }]
  }, [])

  const rowHandles = rowHeights.slice(0, -1).reduce<Array<{ y: number; i: number }>>((acc, _, i) => {
    const y = rowHeights.slice(0, i + 1).reduce((a, b) => a + b, 0)
    return [...acc, { y, i }]
  }, [])

  const borderStyle = element.border
    ? `${Math.max(0.5, element.border.width * scale)}px ${element.border.style} ${element.border.color}`
    : `${Math.max(0.5, scale)}px solid #d1d5db`

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        outline: '2px solid #3B82F6',
        outlineOffset: '-2px',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') { onCancel(); return }
        if (e.key === 'Tab' && containerRef.current) {
          e.preventDefault()
          const cells = containerRef.current.querySelectorAll<HTMLElement>('[contenteditable]')
          const active = document.activeElement as HTMLElement
          const idx = Array.from(cells).indexOf(active)
          if (idx >= 0) {
            const next = cells[idx + (e.shiftKey ? -1 : 1)]
            next?.focus()
          }
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          commit()
        }
      }}
      tabIndex={-1}
    >
      <table
        key={cellsKey}
        style={{
          width: '100%',
          height: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 14 * scale,
        }}
      >
        <colgroup>
          {colWidths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
        </colgroup>
        <tbody>
          {element.rows.map((row, ri) => {
            const isHeader = element.hasHeaderRow && ri === 0
            return (
              <tr key={ri} style={{ height: `${rowHeights[ri] ?? (100 / numRows)}%` }}>
                {row.map((cell, ci) => (
                  <EditableCell
                    key={`${cellsKey}-${cell.id}`}
                    cell={cell}
                    isHeader={isHeader}
                    isSelected={selectedCellId === cell.id}
                    scale={scale}
                    headerColor={element.headerColor}
                    borderStyle={borderStyle}
                    onFocus={() => setSelectedCellId(cell.id)}
                    onUpdateContent={(content) => {
                      rowsRef.current = rowsRef.current.map((r, ri2) =>
                        ri2 === ri ? r.map((c, ci2) => ci2 === ci ? { ...c, content } : c) : r,
                      )
                    }}
                    containerRef={containerRef}
                  />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Column resize handles */}
      {colHandles.map(({ x, i }) => (
        <div
          key={`col-${i}`}
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: 0,
            bottom: 0,
            width: 8,
            marginLeft: -4,
            cursor: 'col-resize',
            zIndex: 20,
          }}
          onMouseDown={(e) => startColResize(i, e)}
        />
      ))}

      {/* Row resize handles */}
      {rowHandles.map(({ y, i }) => (
        <div
          key={`row-${i}`}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${y}%`,
            height: 8,
            marginTop: -4,
            cursor: 'row-resize',
            zIndex: 20,
          }}
          onMouseDown={(e) => startRowResize(i, e)}
        />
      ))}
    </div>
  )
}
