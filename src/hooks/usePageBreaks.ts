import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/core'

// 1056px page height minus 2 × 96px py-24 padding
const PAGE_CONTENT_HEIGHT = 864

export function usePageBreaks(editor: Editor | null): void {
  const isUpdating = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editor) return

    function recalculate(): void {
      if (!editor || isUpdating.current) return

      const dom = editor.view.dom as HTMLElement
      const domChildren = Array.from(dom.children) as HTMLElement[]
      const { state } = editor
      const { doc } = state

      // Collect existing page break positions
      const existingBreaks: Array<{ offset: number; size: number }> = []
      doc.forEach((node, offset) => {
        if (node.type.name === 'pageBreak') {
          existingBreaks.push({ offset, size: node.nodeSize })
        }
      })

      // Measure content node heights and determine desired break positions.
      // Insert a break after the last node that fits within each 864px page.
      const insertAfterPos: number[] = []
      let cumHeight = 0
      let lastFitEnd: number | null = null
      let domIdx = 0

      doc.forEach((node, offset) => {
        const el = domChildren[domIdx++]

        if (node.type.name === 'pageBreak') return

        if (!el) return

        const h = el.offsetHeight

        if (cumHeight + h <= PAGE_CONTENT_HEIGHT) {
          cumHeight += h
          lastFitEnd = offset + node.nodeSize
        } else {
          if (lastFitEnd !== null) {
            insertAfterPos.push(lastFitEnd)
          }
          // This node starts a fresh page
          cumHeight = h
          lastFitEnd = offset + node.nodeSize
        }
      })

      // Skip dispatch if breaks are already in the correct positions
      const existingOffsets = existingBreaks.map((b) => b.offset).sort((a, b) => a - b)
      const desiredOffsets = [...insertAfterPos].sort((a, b) => a - b)
      if (
        existingOffsets.length === desiredOffsets.length &&
        existingOffsets.every((p, i) => p === desiredOffsets[i])
      ) {
        return
      }

      const pageBreakType = editor.schema.nodes['pageBreak']
      if (!pageBreakType) return

      isUpdating.current = true
      try {
        let tr = state.tr

        // Delete existing breaks highest-first so positions stay valid
        const sortedBreaks = [...existingBreaks].sort((a, b) => b.offset - a.offset)
        for (const b of sortedBreaks) {
          tr = tr.delete(b.offset, b.offset + b.size)
        }

        // Insert new breaks highest-first; adjust each position for prior deletions
        for (let i = insertAfterPos.length - 1; i >= 0; i--) {
          const origPos = insertAfterPos[i]!
          const numBefore = existingBreaks.filter((b) => b.offset < origPos).length
          const adjustedPos = origPos - numBefore
          tr = tr.insert(adjustedPos, pageBreakType.create({ pageNumber: i + 2 }))
        }

        editor.view.dispatch(tr)
      } finally {
        isUpdating.current = false
      }
    }

    function schedule(): void {
      if (isUpdating.current) return
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(recalculate, 100)
    }

    editor.on('update', schedule)
    // Run once after the editor is ready
    schedule()

    return () => {
      editor.off('update', schedule)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [editor])
}
