import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useRef } from 'react'
import katex from 'katex'
import { cn } from '@/lib/utils'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineMath: {
      insertInlineMath: (latex: string) => ReturnType
    }
    blockMath: {
      insertBlockMath: (latex: string) => ReturnType
    }
  }
}

function InlineMathView({ node, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLSpanElement>(null)

  let html = ''
  let hasError = false
  try {
    html = katex.renderToString(node.attrs.latex ?? '', {
      throwOnError: true,
      displayMode: false,
      output: 'html',
    })
  } catch {
    hasError = true
  }

  return (
    <NodeViewWrapper
      as="span"
      style={{ display: 'inline' }}
      onDragStart={(e: React.DragEvent<HTMLSpanElement>) => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          e.dataTransfer.setDragImage(containerRef.current, e.clientX - rect.left, e.clientY - rect.top)
        }
      }}
    >
      {/* inline-block + align-middle keeps the equation on the text baseline without
          expanding the line box the way verticalAlign:bottom does. No px padding so
          the selection ring hugs the actual rendered math with no empty left gap. */}
      <span
        ref={containerRef}
        data-drag-handle
        className={cn(
          'math-inline relative inline-block cursor-move select-none align-middle',
          selected && 'ring-2 ring-primary/30',
          hasError && 'bg-destructive/10 font-mono text-xs text-destructive',
        )}
      >
        {selected && (
          <span
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{ border: '2px solid hsl(var(--primary))' }}
          />
        )}

        {hasError ? (
          <span>{node.attrs.latex}</span>
        ) : (
          <span dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </span>
    </NodeViewWrapper>
  )
}

function BlockMathView({ node, selected }: NodeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  let html = ''
  let hasError = false
  try {
    html = katex.renderToString(node.attrs.latex ?? '', {
      throwOnError: true,
      displayMode: true,
      output: 'html',
    })
  } catch {
    hasError = true
  }

  return (
    <NodeViewWrapper
      className="math-block my-3 select-none overflow-x-auto py-2 text-center"
      onDragStart={(e: React.DragEvent<HTMLDivElement>) => {
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect()
          e.dataTransfer.setDragImage(containerRef.current, e.clientX - rect.left, e.clientY - rect.top)
        }
      }}
    >
      <div
        ref={containerRef}
        className={cn(
          'relative inline-block',
          selected && 'ring-2 ring-primary/30',
          hasError && 'font-mono text-sm text-destructive',
        )}
      >
        {selected && (
          <div
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{ border: '2px solid hsl(var(--primary))' }}
          />
        )}

        {hasError ? (
          <div>{node.attrs.latex}</div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        )}

        <div
          data-drag-handle
          className="absolute inset-0 z-[1]"
          style={{ cursor: 'move' }}
        />
      </div>
    </NodeViewWrapper>
  )
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="inline-math"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute('data-latex') ?? '',
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'inline-math',
        'data-latex': node.attrs.latex,
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(InlineMathView)
  },

  addCommands() {
    return {
      insertInlineMath:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },
})

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: '' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="block-math"]',
        getAttrs: (el) => ({
          latex: (el as HTMLElement).getAttribute('data-latex') ?? '',
        }),
      },
    ]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'block-math',
        'data-latex': node.attrs.latex,
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(BlockMathView)
  },

  addCommands() {
    return {
      insertBlockMath:
        (latex: string) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { latex } }),
    }
  },
})
