import { HTMLContainer, Rectangle2d, ShapeUtil, T, TLBaseShape, useIsEditing, resizeBox } from 'tldraw'
import type { TLResizeInfo } from 'tldraw'
import { useRef, useEffect } from 'react'

// ── Module augmentation ──────────────────────────────────────────────────────

export interface ProseStickyNoteProps {
  text: string
  color: string
  w: number
  h: number
}

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'prose-sticky-note': ProseStickyNoteProps
  }
}

export type ProseStickyNoteShape = TLBaseShape<'prose-sticky-note', ProseStickyNoteProps>

// ── Accent colors for sticky notes ───────────────────────────────────────────

export const STICKY_COLORS = [
  { label: 'Yellow', bg: '#fef08a', text: '#713f12' },
  { label: 'Blue',   bg: '#bae6fd', text: '#0c4a6e' },
  { label: 'Green',  bg: '#bbf7d0', text: '#14532d' },
  { label: 'Pink',   bg: '#fbcfe8', text: '#831843' },
  { label: 'Purple', bg: '#e9d5ff', text: '#581c87' },
]

function colorBg(color: string): string {
  return STICKY_COLORS.find((c) => c.label === color)?.bg ?? STICKY_COLORS[0]!.bg
}
function colorText(color: string): string {
  return STICKY_COLORS.find((c) => c.label === color)?.text ?? STICKY_COLORS[0]!.text
}

// ── Component ────────────────────────────────────────────────────────────────

function StickyNoteComponent({ shape, onTextChange }: {
  shape: ProseStickyNoteShape
  onTextChange: (text: string) => void
}) {
  const isEditing = useIsEditing(shape.id)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [isEditing])

  const bg = colorBg(shape.props.color)
  const fg = colorText(shape.props.color)

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: 'all',
        borderRadius: 8,
        overflow: 'hidden',
        boxSizing: 'border-box',
        boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: bg,
          borderRadius: 8,
          padding: 12,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            style={{
              flex: 1,
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontSize: 13,
              lineHeight: '1.5',
              color: fg,
              fontFamily: 'inherit',
            }}
            value={shape.props.text}
            onChange={(e) => onTextChange(e.target.value)}
          />
        ) : (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              lineHeight: '1.5',
              color: fg,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflow: 'hidden',
            }}
          >
            {shape.props.text || <span style={{ opacity: 0.4 }}>Double-click to edit…</span>}
          </p>
        )}
      </div>
    </HTMLContainer>
  )
}

// ── ShapeUtil ────────────────────────────────────────────────────────────────

export class ProseStickyNoteShapeUtil extends ShapeUtil<ProseStickyNoteShape> {
  static override type = 'prose-sticky-note' as const

  static override props = {
    text: T.string,
    color: T.string,
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): ProseStickyNoteProps {
    return { text: '', color: 'Yellow', w: 200, h: 160 }
  }

  override getGeometry(shape: ProseStickyNoteShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override component(shape: ProseStickyNoteShape) {
    const handleTextChange = (text: string) => {
      this.editor.updateShape<ProseStickyNoteShape>({ id: shape.id, type: 'prose-sticky-note', props: { text } })
    }
    return <StickyNoteComponent shape={shape} onTextChange={handleTextChange} />
  }

  override getIndicatorPath(shape: ProseStickyNoteShape): Path2D {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }

  override canResize() {
    return true
  }

  override onResize(shape: ProseStickyNoteShape, info: TLResizeInfo<ProseStickyNoteShape>) {
    return resizeBox(shape, info)
  }

  override canEdit() {
    return true
  }
}
