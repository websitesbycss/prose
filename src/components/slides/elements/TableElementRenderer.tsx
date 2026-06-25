import { memo } from 'react'
import type { TableElement, TableCell } from '@/types/slides'

interface Props {
  element: TableElement
  scale: number
}

function normalizeWeights(arr: number[]): number[] {
  const total = arr.reduce((a, b) => a + b, 0)
  return total > 0 ? arr.map((v) => (v / total) * 100) : arr.map(() => 100 / arr.length)
}

function Cell({ cell, scale, borderStyle }: { cell: TableCell; scale: number; borderStyle: string }): JSX.Element {
  const { content, style, colspan, rowspan } = cell

  return (
    <td
      colSpan={colspan ?? 1}
      rowSpan={rowspan ?? 1}
      style={{
        border: borderStyle,
        padding: `${5 * scale}px ${7 * scale}px`,
        textAlign: style?.align ?? 'left',
        verticalAlign: style?.verticalAlign ?? 'middle',
        backgroundColor: style?.backgroundColor ?? 'transparent',
        color: style?.color ?? 'inherit',
        fontWeight: style?.bold ? 'bold' : 'normal',
        fontStyle: style?.italic ? 'italic' : 'normal',
        textDecoration: [style?.underline && 'underline', style?.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
        fontSize: style?.fontSize ? style.fontSize * scale : undefined,
        fontFamily: style?.fontFamily,
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </td>
  )
}

export const TableElementRenderer = memo(function TableElementRenderer({ element, scale }: Props): JSX.Element {
  const { rows, border, colWidths, rowHeights } = element
  const borderStyle = border ? `${border.width * scale}px ${border.style} ${border.color}` : `${scale}px solid #d1d5db`
  const widths = normalizeWeights(colWidths)
  const heights = rowHeights ? normalizeWeights(rowHeights) : rows.map(() => 100 / rows.length)

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <table
        style={{
          width: '100%',
          height: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontSize: 14 * scale,
        }}
      >
        <colgroup>
          {widths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
        </colgroup>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ height: `${heights[ri] ?? 100 / rows.length}%` }}>
              {row.map((cell) => (
                <Cell key={cell.id} cell={cell} scale={scale} borderStyle={borderStyle} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
