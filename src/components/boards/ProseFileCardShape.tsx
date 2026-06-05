import { HTMLContainer, Rectangle2d, ShapeUtil, T, TLBaseShape, resizeBox } from 'tldraw'
import type { TLResizeInfo } from 'tldraw'
import { useAppStore } from '@/store/appStore'
import type { FileType } from '@/types'

// ── Module augmentation — register with tldraw's type system ─────────────────

export interface ProseFileCardProps {
  fileId: string
  fileType: string
  title: string
  wordCount: number
  preview: string
  category: string
  w: number
  h: number
}

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'prose-file-card': ProseFileCardProps
  }
}

export type ProseFileCardShape = TLBaseShape<'prose-file-card', ProseFileCardProps>

// ── File type labels / icons ─────────────────────────────────────────────────

const FILE_TYPE_LABEL: Record<string, string> = {
  document: 'Doc',
  sheet: 'Sheet',
  board: 'Board',
}

function unitLabel(fileType: string, count: number): string {
  if (fileType === 'sheet') return `${count} cells`
  if (fileType === 'board') return `${count} elements`
  return `${count} words`
}

// ── Shape component ──────────────────────────────────────────────────────────

function ProseFileCardComponent({ shape }: { shape: ProseFileCardShape }) {
  const { fileType, title, wordCount, preview } = shape.props
  const typeLabel = FILE_TYPE_LABEL[fileType] ?? 'File'

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        pointerEvents: 'all',
        userSelect: 'none',
        borderRadius: 8,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'hsl(var(--background, 224 71% 4%))',
          border: '1px solid hsl(var(--border, 215 28% 17%))',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          padding: '10px 12px',
          boxSizing: 'border-box',
          gap: 6,
          fontFamily: 'inherit',
        }}
      >
        {/* Header: title + type badge */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: 'hsl(var(--foreground, 213 31% 91%))',
              lineHeight: '1.3',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {title}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'hsl(var(--primary, 222 89% 55%))',
              background: 'hsl(var(--primary, 222 89% 55%) / 0.12)',
              borderRadius: 4,
              padding: '2px 5px',
            }}
          >
            {typeLabel}
          </span>
        </div>

        {/* Preview text */}
        {preview && (
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'hsl(var(--muted-foreground, 215 20% 65%))',
              lineHeight: '1.4',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              flex: 1,
            }}
          >
            {preview}
          </p>
        )}

        {/* Footer: word count */}
        <span style={{ fontSize: 10, color: 'hsl(var(--muted-foreground, 215 20% 65%) / 0.7)' }}>
          {unitLabel(fileType, wordCount)}
        </span>
      </div>
    </HTMLContainer>
  )
}

// ── ShapeUtil ────────────────────────────────────────────────────────────────

export class ProseFileCardShapeUtil extends ShapeUtil<ProseFileCardShape> {
  static override type = 'prose-file-card' as const

  static override props = {
    fileId: T.string,
    fileType: T.string,
    title: T.string,
    wordCount: T.number,
    preview: T.string,
    category: T.string,
    w: T.number,
    h: T.number,
  }

  override getDefaultProps(): ProseFileCardProps {
    return {
      fileId: '',
      fileType: 'document',
      title: 'Untitled',
      wordCount: 0,
      preview: '',
      category: '',
      w: 240,
      h: 120,
    }
  }

  override getGeometry(shape: ProseFileCardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    })
  }

  override component(shape: ProseFileCardShape) {
    return <ProseFileCardComponent shape={shape} />
  }

  override getIndicatorPath(shape: ProseFileCardShape): Path2D {
    const path = new Path2D()
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8)
    return path
  }

  override canResize() {
    return true
  }

  override onResize(shape: ProseFileCardShape, info: TLResizeInfo<ProseFileCardShape>) {
    return resizeBox(shape, info)
  }

  override onDoubleClick(shape: ProseFileCardShape) {
    const { fileId, fileType, title } = shape.props
    if (!fileId) return
    const { openDocumentTab } = useAppStore.getState()
    openDocumentTab({ id: fileId, title, format: 'none', fileType: fileType as FileType })
    return undefined
  }
}
