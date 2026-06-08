import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ShapeType } from '@/types/slides'

// SVG path previews keyed by shape type
const SHAPE_ICONS: Record<ShapeType, string> = {
  'rect':                 'M4 4 h40 v24 h-40 Z',
  'roundRect':            'M8 4 h32 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4 Z',
  'ellipse':              '', // handled specially
  'triangle':             'M24 4 L44 28 L4 28 Z',
  'rightTriangle':        'M4 28 L44 28 L4 4 Z',
  'parallelogram':        'M12 4 L48 4 L36 28 L0 28 Z',
  'trapezoid':            'M10 4 L38 4 L44 28 L4 28 Z',
  'arrow-right':          'M4 14 L34 14 L34 8 L44 16 L34 24 L34 18 L4 18 Z',
  'arrow-left':           'M44 14 L14 14 L14 8 L4 16 L14 24 L14 18 L44 18 Z',
  'arrow-up':             'M16 44 L16 14 L8 14 L24 4 L40 14 L32 14 L32 44 Z',
  'arrow-down':           'M16 4 L16 34 L8 34 L24 44 L40 34 L32 34 L32 4 Z',
  'arrow-double':         'M4 16 L14 8 L14 12 L34 12 L34 8 L44 16 L34 24 L34 20 L14 20 L14 24 Z',
  'line':                 'M4 16 L44 16',
  'connector':            'M4 16 Q24 4 44 16',
  'speech-bubble':        'M4 4 h40 a2 2 0 0 1 2 2 v16 a2 2 0 0 1 -2 2 H20 L12 30 L12 24 H6 a2 2 0 0 1 -2 -2 V6 a2 2 0 0 1 2 -2 Z',
  'thought-bubble':       'M8 20 a6 6 0 0 0 5 6 a7 7 0 1 0 22 0 a6 6 0 0 0 5-6 a6 6 0 0 0-6-6 a8 8 0 0 0-20 0 a6 6 0 0 0-6 6 Z M12 30 a2 2 0 1 1 4 0 a2 2 0 1 1 -4 0 Z M10 34 a1.5 1.5 0 1 1 3 0 a1.5 1.5 0 1 1 -3 0 Z',
  'star-4':               'M24 4 L28 20 L44 24 L28 28 L24 44 L20 28 L4 24 L20 20 Z',
  'star-5':               'M24 4 L27 17 L40 17 L30 25 L33 38 L24 31 L15 38 L18 25 L8 17 L21 17 Z',
  'star-6':               'M24 4 L28 14 L38 8 L34 18 L44 22 L34 26 L38 36 L28 30 L24 40 L20 30 L10 36 L14 26 L4 22 L14 18 L10 8 L20 14 Z',
  'banner':               'M4 8 h40 v16 h-40 L8 24 L4 24 Z',
  'wave':                 'M4 20 Q14 8 24 20 Q34 32 44 20',
  'flowchart-process':    'M4 8 h40 v16 h-40 Z',
  'flowchart-decision':   'M24 4 L44 16 L24 28 L4 16 Z',
  'flowchart-terminal':   'M12 8 h24 a8 8 0 0 1 0 16 h-24 a8 8 0 0 1 0 -16 Z',
  'flowchart-data':       'M8 8 h36 l-4 16 h-36 Z',
  'flowchart-connector':  '', // circle
}

const SHAPE_LABELS: Record<ShapeType, string> = {
  'rect': 'Rectangle', 'roundRect': 'Rounded Rect', 'ellipse': 'Ellipse',
  'triangle': 'Triangle', 'rightTriangle': 'Right Triangle',
  'parallelogram': 'Parallelogram', 'trapezoid': 'Trapezoid',
  'arrow-right': '→ Arrow', 'arrow-left': '← Arrow', 'arrow-up': '↑ Arrow', 'arrow-down': '↓ Arrow',
  'arrow-double': '↔ Arrow',
  'line': 'Line', 'connector': 'Curve',
  'speech-bubble': 'Speech Bubble', 'thought-bubble': 'Thought Bubble',
  'star-4': '4-Point Star', 'star-5': '5-Point Star', 'star-6': '6-Point Star',
  'banner': 'Banner', 'wave': 'Wave',
  'flowchart-process': 'Process', 'flowchart-decision': 'Decision',
  'flowchart-terminal': 'Terminal', 'flowchart-data': 'Data', 'flowchart-connector': 'Connector',
}

const ALL_SHAPES: ShapeType[] = Object.keys(SHAPE_LABELS) as ShapeType[]

interface Props {
  children: React.ReactNode
  onSelect(shapeType: ShapeType): void
}

export function ShapePickerPopover({ children, onSelect }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function handleOpen() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setOpen((o) => !o)
  }

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="inline-flex items-center">
        {children}
      </div>

      {open && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="grid max-h-72 w-72 grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-border bg-background p-2 shadow-xl"
        >
          {ALL_SHAPES.map((shape) => (
            <button
              key={shape}
              title={SHAPE_LABELS[shape]}
              className="flex h-10 w-10 items-center justify-center rounded border border-transparent hover:border-border hover:bg-accent"
              onClick={() => { onSelect(shape); setOpen(false) }}
            >
              <svg viewBox="0 0 48 40" width="36" height="30" fill="none" stroke="currentColor" strokeWidth="2">
                {shape === 'ellipse' || shape === 'flowchart-connector'
                  ? <ellipse cx="24" cy="20" rx="20" ry="16" />
                  : SHAPE_ICONS[shape]
                    ? shape === 'line' || shape === 'connector' || shape === 'wave'
                      ? <path d={SHAPE_ICONS[shape]} strokeWidth="2" />
                      : <path d={SHAPE_ICONS[shape]} fill="currentColor" fillOpacity="0.15" />
                    : <rect x="4" y="8" width="40" height="24" />
                }
              </svg>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
