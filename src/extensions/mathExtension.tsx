import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
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

function InlineMathView({ node }: NodeViewProps) {
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
      className={cn(
        'math-inline inline cursor-default select-none rounded px-0.5',
        hasError && 'text-destructive bg-destructive/10 font-mono text-xs',
      )}
    >
      {hasError ? (
        <span>{node.attrs.latex}</span>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  )
}

function BlockMathView({ node }: NodeViewProps) {
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
      className={cn(
        'math-block my-3 cursor-default select-none overflow-x-auto py-2 text-center',
        hasError && 'text-destructive font-mono text-sm',
      )}
    >
      {hasError ? (
        <div>{node.attrs.latex}</div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </NodeViewWrapper>
  )
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,

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
