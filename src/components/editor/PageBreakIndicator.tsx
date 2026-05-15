import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

const SEP_HEIGHT = 88
const GRAD = 32
const BAND = SEP_HEIGHT - GRAD * 2  // 24px

export function PageBreakIndicator({ node }: NodeViewProps): JSX.Element {
  const pageNumber = (node.attrs.pageNumber as number) ?? 2

  return (
    <NodeViewWrapper
      contentEditable={false}
      data-page-break=""
      className="pointer-events-none select-none relative"
      style={{
        marginLeft: '-96px',
        marginRight: '-96px',
        height: `${SEP_HEIGHT}px`,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 bg-gradient-to-b from-white to-zinc-100 dark:from-zinc-800 dark:to-zinc-900"
        style={{ height: GRAD }}
      />
      <div
        className="absolute inset-x-0 bg-zinc-100 dark:bg-zinc-900"
        style={{ top: GRAD, height: BAND }}
      />
      <span
        className="absolute text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums"
        style={{ top: GRAD, lineHeight: `${BAND}px`, right: 0 }}
      >
        page {pageNumber}
      </span>
      <div
        className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-800"
        style={{ height: GRAD }}
      />
    </NodeViewWrapper>
  )
}
