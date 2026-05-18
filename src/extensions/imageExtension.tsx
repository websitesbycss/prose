import { Node, mergeAttributes, type CommandProps } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    image: {
      setImage: (options: { src: string; alt?: string; title?: string }) => ReturnType
    }
  }
}
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { cn } from '@/lib/utils'

const MIN_SIZE = 48

type HandlePos = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

const CURSORS: Record<HandlePos, string> = {
  nw: 'nwse-resize', n: 'ns-resize',  ne: 'nesw-resize',
  w:  'ew-resize',                    e:  'ew-resize',
  sw: 'nesw-resize', s: 'ns-resize',  se: 'nwse-resize',
}

const CORNER_HANDLES = new Set<HandlePos>(['nw', 'ne', 'sw', 'se'])
const ALL_HANDLES: HandlePos[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']

function getHandleStyle(pos: HandlePos): React.CSSProperties {
  const base: React.CSSProperties = { position: 'absolute', width: 8, height: 8 }
  switch (pos) {
    case 'nw': return { ...base, top: -4,  left: -4 }
    case 'n':  return { ...base, top: -4,  left: '50%', transform: 'translateX(-50%)' }
    case 'ne': return { ...base, top: -4,  right: -4 }
    case 'w':  return { ...base, top: '50%', left: -4,  transform: 'translateY(-50%)' }
    case 'e':  return { ...base, top: '50%', right: -4, transform: 'translateY(-50%)' }
    case 'sw': return { ...base, bottom: -4, left: -4 }
    case 's':  return { ...base, bottom: -4, left: '50%', transform: 'translateX(-50%)' }
    case 'se': return { ...base, bottom: -4, right: -4 }
  }
}

// Rounded-corner icon (simple SVG, no external dep needed)
function CornerRadiusIcon(): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="shrink-0 text-muted-foreground"
    >
      <path d="M1 13V7a6 6 0 016-6h6" />
    </svg>
  )
}

function ImageNodeView({ node, updateAttributes, selected, editor }: NodeViewProps): JSX.Element {
  const src = node.attrs.src as string
  const alt = node.attrs.alt as string | null
  const width = node.attrs.width as number | null
  const height = node.attrs.height as number | null
  const borderRadius = ((node.attrs.borderRadius as number) ?? 0)

  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const floatingToolbarRef = useRef<HTMLDivElement>(null)
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(null)
  const [toolbarBelow, setToolbarBelow] = useState(false)

  // Determine if floating toolbar should render below (image near viewport top)
  useLayoutEffect(() => {
    if (!selected || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    // Toolbar is ~40px tall + 8px gap = 48px needed above
    setToolbarBelow(rect.top < 56)
  }, [selected])

  // Block ProseMirror's native mousedown handler from seeing clicks on the
  // floating toolbar — otherwise it resets the NodeSelection. For range inputs
  // we must NOT call preventDefault (that breaks slider drag), but we still
  // need stopPropagation so ProseMirror's listener on the editor DOM never fires.
  useEffect(() => {
    const el = floatingToolbarRef.current
    if (!el) return
    function onMouseDown(e: MouseEvent): void {
      e.stopPropagation()
      if ((e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault()
      }
    }
    el.addEventListener('mousedown', onMouseDown)
    return () => el.removeEventListener('mousedown', onMouseDown)
  }, [selected]) // re-attaches after toolbar mounts/unmounts with selection

  const getMaxWidth = useCallback((): number => {
    const page = containerRef.current?.closest('.editor-page') as HTMLElement | null
    if (page) {
      const marginXStr = getComputedStyle(page).getPropertyValue('--page-margin-x').trim()
      const marginX = marginXStr ? parseFloat(marginXStr) : 96
      return Math.max(MIN_SIZE, page.getBoundingClientRect().width - marginX * 2)
    }
    return 624 // 816px page - 96px * 2 margins
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent, pos: HandlePos) => {
      e.preventDefault()
      e.stopPropagation()

      const img = imgRef.current
      if (!img) return

      const rect = img.getBoundingClientRect()
      const startW = rect.width
      const startH = rect.height
      const startX = e.clientX
      const startY = e.clientY
      const aspectRatio = startH / startW
      const isCorner = CORNER_HANDLES.has(pos)
      const maxW = getMaxWidth()

      function calc(ev: MouseEvent): { w: number; h: number } {
        const dx = ev.clientX - startX
        const dy = ev.clientY - startY
        let w = startW
        let h = startH

        if      (pos === 'se') { w = startW + dx; h = startH + dy }
        else if (pos === 'sw') { w = startW - dx; h = startH + dy }
        else if (pos === 'ne') { w = startW + dx; h = startH - dy }
        else if (pos === 'nw') { w = startW - dx; h = startH - dy }
        else if (pos === 'e')  { w = startW + dx }
        else if (pos === 'w')  { w = startW - dx }
        else if (pos === 's')  { h = startH + dy }
        else if (pos === 'n')  { h = startH - dy }

        // Shift = lock aspect ratio (corner handles only)
        if (isCorner && ev.shiftKey) h = w * aspectRatio

        w = Math.max(MIN_SIZE, Math.min(maxW, Math.round(w)))
        h = Math.max(MIN_SIZE, Math.round(h))
        return { w, h }
      }

      function onMove(ev: MouseEvent): void {
        setDragSize(calc(ev))
      }

      function onUp(ev: MouseEvent): void {
        const { w, h } = calc(ev)
        updateAttributes({ width: w, height: h })
        setDragSize(null)
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [updateAttributes, getMaxWidth]
  )

  // Escape blurs editor (ProseMirror clears node selection on blur)
  useEffect(() => {
    if (!selected) return
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') editor.commands.blur()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, editor])

  const currentW = dragSize?.w ?? width
  const currentH = dragSize?.h ?? height

  const imgStyle: React.CSSProperties = {
    display: 'block',
    maxWidth: '100%',
    ...(borderRadius ? { borderRadius: `${borderRadius}px` } : {}),
    ...(currentW != null ? { width: `${currentW}px` } : {}),
    ...(currentH != null ? { height: `${currentH}px` } : {}),
  }

  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline-block', position: 'relative', verticalAlign: 'bottom', lineHeight: 0 }}
    >
      {/* Floating toolbar — corner radius control */}
      {selected && (
        <div
          ref={floatingToolbarRef}
          className="absolute left-1/2 z-20 flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2"
          style={{
            ...(toolbarBelow
              ? { top: 'calc(100% + 8px)' }
              : { bottom: 'calc(100% + 8px)' }),
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          <CornerRadiusIcon />
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={borderRadius}
            className="h-1.5 w-24 accent-primary"
            onChange={(e) => updateAttributes({ borderRadius: Number(e.target.value) })}
          />
          <span className="min-w-[28px] text-right font-sans text-[11px] text-muted-foreground">
            {borderRadius}px
          </span>
        </div>
      )}

      {/* Live size tooltip during resize drag */}
      {dragSize && (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 -translate-x-1/2 rounded border border-border bg-background px-2 py-0.5 font-sans text-[11px] text-muted-foreground"
          style={{ whiteSpace: 'nowrap' }}
        >
          {dragSize.w} × {dragSize.h}
        </div>
      )}

      {/* Image container: selection ring + border overlay + handles */}
      <div
        ref={containerRef}
        className={cn(selected && 'ring-2 ring-primary/30')}
        style={{
          display: 'inline-block',
          position: 'relative',
          lineHeight: 0,
          borderRadius: borderRadius ? `${borderRadius}px` : undefined,
        }}
      >
        {/* Selection border (2px solid primary, inset so it doesn't push layout) */}
        {selected && (
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              border: '2px solid hsl(var(--primary))',
              borderRadius: borderRadius ? `${borderRadius}px` : undefined,
            }}
          />
        )}

        <img
          ref={imgRef}
          src={src}
          alt={alt ?? ''}
          style={imgStyle}
          draggable={false}
        />

        {/* Resize handles — 8 positions */}
        {selected && ALL_HANDLES.map((pos) => (
          <div
            key={pos}
            className="absolute z-[2] border-2 border-primary bg-background"
            style={{
              ...getHandleStyle(pos),
              borderRadius: '2px',
              cursor: CURSORS[pos],
            }}
            onMouseDown={(e) => handleMouseDown(e, pos)}
          />
        ))}
      </div>
    </NodeViewWrapper>
  )
}

export const CustomImage = Node.create({
  name: 'image',
  group: 'inline',
  inline: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src:          { default: null },
      alt:          { default: null },
      title:        { default: null },
      width:        { default: null },
      height:       { default: null },
      borderRadius: { default: 0 },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (el) => {
          const img = el as HTMLImageElement
          const styleW  = img.style.width        ? parseInt(img.style.width)        : null
          const attrW   = img.getAttribute('width')  ? parseInt(img.getAttribute('width')!)  : null
          const styleH  = img.style.height       ? parseInt(img.style.height)       : null
          const attrH   = img.getAttribute('height') ? parseInt(img.getAttribute('height')!) : null
          const attrBr  = img.style.borderRadius  ? parseInt(img.style.borderRadius)  : 0
          return {
            src:          img.getAttribute('src'),
            alt:          img.getAttribute('alt'),
            title:        img.getAttribute('title'),
            width:        styleW ?? attrW,
            height:       styleH ?? attrH,
            borderRadius: attrBr,
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { width, height, borderRadius, src, alt, title } = HTMLAttributes as {
      width: number | null
      height: number | null
      borderRadius: number
      src: string
      alt: string | null
      title: string | null
    }
    const style: string[] = []
    if (width)        style.push(`width:${width}px`)
    if (height)       style.push(`height:${height}px`)
    if (borderRadius) style.push(`border-radius:${borderRadius}px`)
    return ['img', mergeAttributes({ src, alt, title }, style.length ? { style: style.join(';') } : {})]
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string }) =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name, attrs: options }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
