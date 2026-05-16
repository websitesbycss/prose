import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'

const RESIZE_ZONE = 6

export function useRowResize(editor: Editor | null): void {
  const dragRef = useRef<{
    startY: number
    startHeight: number
    rowPos: number
  } | null>(null)

  useEffect(() => {
    if (!editor) return
    const view = editor.view
    const dom = view.dom as HTMLElement

    function getNearestTr(el: Element | null): HTMLTableRowElement | null {
      let cur = el
      while (cur && cur !== dom) {
        if (cur.tagName === 'TR') return cur as HTMLTableRowElement
        cur = cur.parentElement
      }
      return null
    }

    function isInResizeZone(e: MouseEvent, tr: HTMLTableRowElement): boolean {
      const rect = tr.getBoundingClientRect()
      return e.clientY >= rect.bottom - RESIZE_ZONE && e.clientY <= rect.bottom + RESIZE_ZONE
    }

    function findRowDocPos(tr: HTMLTableRowElement): number | null {
      const rect = tr.getBoundingClientRect()
      const hit = view.posAtCoords({
        left: rect.left + 10,
        top: rect.top + rect.height / 2,
      })
      if (!hit) return null
      const $pos = view.state.doc.resolve(hit.pos)
      for (let d = $pos.depth; d >= 0; d--) {
        if ($pos.node(d).type.name === 'tableRow') return $pos.before(d)
      }
      return null
    }

    function onMouseMove(e: MouseEvent): void {
      if (dragRef.current) {
        const { startY, startHeight, rowPos } = dragRef.current
        const newHeight = Math.max(24, startHeight + (e.clientY - startY))
        const { state } = view
        const node = state.doc.nodeAt(rowPos)
        if (node) {
          view.dispatch(
            state.tr.setNodeMarkup(rowPos, undefined, { ...node.attrs, height: newHeight })
          )
        }
        return
      }
      const trEl = getNearestTr(document.elementFromPoint(e.clientX, e.clientY) as Element | null)
      dom.style.cursor = trEl && isInResizeZone(e, trEl) ? 'row-resize' : ''
    }

    function onMouseDown(e: MouseEvent): void {
      const trEl = getNearestTr(document.elementFromPoint(e.clientX, e.clientY) as Element | null)
      if (!trEl || !isInResizeZone(e, trEl)) return
      const rowPos = findRowDocPos(trEl)
      if (rowPos === null) return
      e.preventDefault()
      dragRef.current = {
        startY: e.clientY,
        startHeight: trEl.getBoundingClientRect().height,
        rowPos,
      }
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'
    }

    function onMouseUp(): void {
      if (!dragRef.current) return
      dragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      dom.style.cursor = ''
    }

    dom.addEventListener('mousemove', onMouseMove)
    dom.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      dom.removeEventListener('mousemove', onMouseMove)
      dom.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [editor])
}
