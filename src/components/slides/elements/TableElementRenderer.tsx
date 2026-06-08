import { memo } from 'react'
import type { TableElement, TableCell } from '@/types/slides'

interface Props {
  element: TableElement
  scale: number
}

function Cell({ cell, isHeader, scale, borderStyle }: { cell: TableCell; isHeader: boolean; scale: number; borderStyle: string }): JSX.Element {
  const { content, style, colspan, rowspan } = cell
  const td = isHeader ? 'th' : 'td'
  const Tag = td as 'td'

  return (
    <Tag
      colSpan={colspan ?? 1}
      rowSpan={rowspan ?? 1}
      style={{
        border: borderStyle,
        padding: `${5 * scale}px ${7 * scale}px`,
        textAlign: style?.align ?? (isHeader ? 'center' : 'left'),
        verticalAlign: style?.verticalAlign ?? 'middle',
        backgroundColor: style?.backgroundColor ?? 'transparent',
        color: style?.color ?? 'inherit',
        fontWeight: style?.bold || isHeader ? 'bold' : 'normal',
        fontStyle: style?.italic ? 'italic' : 'normal',
        textDecoration: [style?.underline && 'underline', style?.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
        fontSize: style?.fontSize ? style.fontSize * scale : undefined,
        fontFamily: style?.fontFamily,
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      {content}
    </Tag>
  )
}

export const TableElementRenderer = memo(function TableElementRenderer({ element, scale }: Props): JSX.Element {
  const { rows, border, hasHeaderRow, headerColor } = element
  const borderStyle = border ? `${border.width * scale}px ${border.style} ${border.color}` : `${scale}px solid #d1d5db`

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
        {hasHeaderRow && rows[0] && (
          <thead>
            <tr style={{ backgroundColor: headerColor ?? '#f3f4f6' }}>
              {rows[0].map((cell) => (
                <Cell key={cell.id} cell={cell} isHeader scale={scale} borderStyle={borderStyle} />
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.slice(hasHeaderRow ? 1 : 0).map((row, ri) => (
            <tr key={ri}>
              {row.map((cell) => (
                <Cell key={cell.id} cell={cell} isHeader={false} scale={scale} borderStyle={borderStyle} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})
