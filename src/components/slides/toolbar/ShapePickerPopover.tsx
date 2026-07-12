import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ShapeType } from '@/types/slides'

// SVG path previews keyed by shape type.
// Paths are scaled from the renderer's 100×100 coordinate space to this icon's 48×40 viewBox.
const SHAPE_ICONS: Record<ShapeType, string> = {
  'rect':                 'M4 4 h40 v24 h-40 Z',
  'roundRect':            'M8 4 h32 a4 4 0 0 1 4 4 v16 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 v-16 a4 4 0 0 1 4 -4 Z',
  'ellipse':              '', // handled specially as <ellipse>
  'triangle':             'M24 2 L46 38 L2 38 Z',
  'rightTriangle':        'M2 38 L46 38 L2 2 Z',
  'parallelogram':        'M10 2 L46 2 L38 38 L2 38 Z',
  'trapezoid':            'M9 2 L39 2 L46 38 L2 38 Z',
  'arrow-right':          'M4 14 L34 14 L34 8 L44 16 L34 24 L34 18 L4 18 Z',
  'arrow-left':           'M44 14 L14 14 L14 8 L4 16 L14 24 L14 18 L44 18 Z',
  'arrow-up':             'M16 40 L16 15 L3 15 L24 2 L45 15 L32 15 L32 40 Z',
  'arrow-down':           'M16 2 L16 25 L3 25 L24 40 L45 25 L32 25 L32 2 Z',
  'arrow-double':         'M4 16 L14 8 L14 12 L34 12 L34 8 L44 16 L34 24 L34 20 L14 20 L14 24 Z',
  'line':                 'M4 20 L44 20',
  'connector':            'M4 20 L44 20 M38 14 L44 20 L38 26',
  'speech-bubble':        'M2 2 L46 2 L46 28 L14 28 L6 38 L10 28 L2 28 Z',
  'thought-bubble':       '', // handled specially as rect + circles
  'star-4':               'M24 2 L30 15 L46 20 L30 25 L24 38 L18 25 L2 20 L18 15 Z',
  'star-5':               'M24 2 L30 14 L45 14 L33 22 L37 35 L24 28 L11 35 L15 22 L3 14 L18 14 Z',
  'star-6':               'M24 2 L31 10 L43 11 L37 20 L43 29 L31 30 L24 38 L17 30 L5 29 L11 20 L5 11 L17 10 Z',
  'banner':               'M2 2 L39 2 L46 20 L39 38 L2 38 Z',
  'wave':                 'M2 24 Q13 10 24 21 Q35 32 46 17 L46 38 L2 38 Z',
  'flowchart-process':    'M4 8 h40 v16 h-40 Z',
  'flowchart-decision':   'M24 2 L46 20 L24 38 L2 20 Z',
  'flowchart-terminal':   'M12 8 h24 a8 8 0 0 1 0 16 h-24 a8 8 0 0 1 0 -16 Z',
  'flowchart-data':       'M10 2 L46 2 L38 38 L2 38 Z',
  'flowchart-connector':  '', // handled specially as <ellipse>
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
  selectedShapeType?: ShapeType | null
  onSelect(shapeType: ShapeType): void
}

export function ShapePickerPopover({ children, selectedShapeType, onSelect }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (popRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function handleOpen(): void {
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
              className="flex h-10 w-10 items-center justify-center rounded border hover:border-border hover:bg-accent"
              style={{
                borderColor: shape === selectedShapeType ? 'hsl(var(--primary))' : 'transparent',
                backgroundColor: shape === selectedShapeType ? 'hsl(var(--primary)/0.12)' : undefined,
              }}
              onClick={() => { onSelect(shape); setOpen(false) }}
            >
              <svg viewBox="0 0 48 40" width="36" height="30" fill="none" stroke="currentColor" strokeWidth="2">
                {shape === 'ellipse' || shape === 'flowchart-connector'
                  ? <ellipse cx="24" cy="20" rx="20" ry="16" />
                  : shape === 'thought-bubble'
                    ? (
                      <g fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="2" width="44" height="27" rx="10" ry="8" />
                        <circle cx="11" cy="33" r="2.5" />
                        <circle cx="5" cy="38" r="1.5" />
                      </g>
                    )
                    : SHAPE_ICONS[shape]
                      ? shape === 'line' || shape === 'connector'
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
