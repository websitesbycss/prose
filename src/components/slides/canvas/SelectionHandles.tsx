import type { HandleType } from './types'

interface Props {
  onResizeMouseDown(e: React.MouseEvent, handle: HandleType): void
  onRotateMouseDown(e: React.MouseEvent): void
}

const HANDLE_SIZE = 8
const HALF = HANDLE_SIZE / 2

const HANDLES: Array<{ id: HandleType; style: React.CSSProperties; cursor: string }> = [
  { id: 'nw', style: { left: -HALF, top: -HALF },                               cursor: 'nwse-resize' },
  { id: 'n',  style: { left: `calc(50% - ${HALF}px)`, top: -HALF },             cursor: 'ns-resize' },
  { id: 'ne', style: { right: -HALF, top: -HALF },                               cursor: 'nesw-resize' },
  { id: 'e',  style: { right: -HALF, top: `calc(50% - ${HALF}px)` },             cursor: 'ew-resize' },
  { id: 'se', style: { right: -HALF, bottom: -HALF },                             cursor: 'nwse-resize' },
  { id: 's',  style: { left: `calc(50% - ${HALF}px)`, bottom: -HALF },           cursor: 'ns-resize' },
  { id: 'sw', style: { left: -HALF, bottom: -HALF },                             cursor: 'nesw-resize' },
  { id: 'w',  style: { left: -HALF, top: `calc(50% - ${HALF}px)` },             cursor: 'ew-resize' },
]

const HANDLE_BASE: React.CSSProperties = {
  position: 'absolute',
  width: HANDLE_SIZE,
  height: HANDLE_SIZE,
  backgroundColor: '#ffffff',
  border: '1.5px solid #3B82F6',
  borderRadius: 1.5,
  zIndex: 10001,
}

export function SelectionHandles({ onResizeMouseDown, onRotateMouseDown }: Props): JSX.Element {
  return (
    <>
      {/* Resize handles */}
      {HANDLES.map(({ id, style, cursor }) => (
        <div
          key={id}
          style={{ ...HANDLE_BASE, ...style, cursor }}
          onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); onResizeMouseDown(e, id) }}
        />
      ))}

      {/* Rotation arm */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(50% - 0.5px)',
          top: -30,
          width: 1,
          height: 30,
          backgroundColor: '#3B82F6',
          pointerEvents: 'none',
          zIndex: 10000,
        }}
      />

      {/* Rotation handle */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(50% - 7px)',
          top: -44,
          width: 14,
          height: 14,
          backgroundColor: '#ffffff',
          border: '1.5px solid #3B82F6',
          borderRadius: '50%',
          cursor: 'grab',
          zIndex: 10001,
        }}
        onMouseDown={(e) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); onRotateMouseDown(e) }}
      />
    </>
  )
}
