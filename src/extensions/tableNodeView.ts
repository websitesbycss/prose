import { Fragment, Node as PmNode, Slice } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { TableView } from '@tiptap/pm/tables'
import type { EditorView, ViewMutationRecord } from '@tiptap/pm/view'

type HandlePos = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se'

const CURSORS: Record<HandlePos, string> = {
  nw: 'nwse-resize', n: 'ns-resize',  ne: 'nesw-resize',
  w:  'ew-resize',                    e:  'ew-resize',
  sw: 'nesw-resize', s: 'ns-resize',  se: 'nwse-resize',
}

const ALL_HANDLES: HandlePos[] = ['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']
const MIN_TABLE_WIDTH = 100

export class TableNodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private inner: InstanceType<typeof TableView>
  private view: EditorView
  private getPos: () => number | undefined
  private handles: HTMLElement[] = []
  private dragZone: HTMLElement
  private tooltip: HTMLElement | null = null

  constructor(
    node: PmNode,
    view: EditorView,
    getPos: () => number | undefined,
    cellMinWidth: number
  ) {
    this.view = view
    this.getPos = getPos
    this.inner = new TableView(node, cellMinWidth)

    this.dom = document.createElement('div')
    this.dom.className = 'table-outer-wrapper'
    this.applyWidth(node.attrs.tableWidth as number | null)

    this.dom.appendChild(this.inner.dom)

    // Top drag zone — move cursor + click-to-select + drag-to-reposition
    this.dragZone = document.createElement('div')
    this.dragZone.className = 'table-drag-zone'
    this.dragZone.draggable = true
    this.dom.appendChild(this.dragZone)

    this.contentDOM = (this.inner as unknown as { contentDOM: HTMLElement }).contentDOM

    this.dragZone.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const pos = typeof this.getPos === 'function' ? this.getPos() : undefined
      if (pos === undefined) return
      const { tr } = this.view.state
      this.view.dispatch(tr.setSelection(NodeSelection.create(this.view.state.doc, pos)))
    })

    // Wire up ProseMirror-style drag so the drop handler does a real move.
    // We must set view.dragging ourselves because posAtCoords at the drag zone
    // coordinates finds the first cell's content, not the table node.
    this.dragZone.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return
      const pos = typeof this.getPos === 'function' ? this.getPos() : undefined
      if (pos === undefined) return
      const node = this.view.state.doc.nodeAt(pos)
      if (!node) return

      const slice = new Slice(Fragment.from(node), 0, 0)

      // Ghost: semi-transparent clone of the table
      const ghost = this.inner.dom.cloneNode(true) as HTMLElement
      ghost.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0.75;pointer-events:none'
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, e.offsetX, 8)
      requestAnimationFrame(() => ghost.remove())

      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', node.textContent ?? '')

      // Tell ProseMirror this is a move drag of this node
      ;(this.view as unknown as { dragging: { slice: Slice; move: boolean } | null }).dragging = {
        slice,
        move: true,
      }
    })
  }

  private applyWidth(width: number | null): void {
    if (width != null) {
      this.dom.style.width = `${width}px`
    } else {
      this.dom.style.removeProperty('width')
    }
  }

  private getMaxWidth(): number {
    const page = this.dom.closest('.editor-page') as HTMLElement | null
    if (page) {
      const style = getComputedStyle(page)
      const leftStr = style.getPropertyValue('--page-margin-left').trim() || style.getPropertyValue('--page-margin-x').trim()
      const rightStr = style.getPropertyValue('--page-margin-right').trim() || style.getPropertyValue('--page-margin-x').trim()
      const marginLeft = leftStr ? parseFloat(leftStr) : 96
      const marginRight = rightStr ? parseFloat(rightStr) : 96
      return Math.max(MIN_TABLE_WIDTH, page.getBoundingClientRect().width - marginLeft - marginRight)
    }
    return 624
  }

  update(node: PmNode): boolean {
    const result = (this.inner as unknown as { update(n: PmNode): boolean }).update(node)
    if (!result) return false
    this.applyWidth(node.attrs.tableWidth as number | null)
    return true
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    const target = mutation.target as Node
    if (
      this.dragZone.contains(target) ||
      this.handles.some((h) => h.contains(target)) ||
      (this.tooltip && this.tooltip.contains(target))
    ) {
      return true
    }
    return (this.inner as unknown as { ignoreMutation(r: ViewMutationRecord): boolean }).ignoreMutation(mutation)
  }

  selectNode(): void {
    this.dom.classList.add('table-selected')
    this.dom.style.boxShadow = '0 0 0 2px hsl(var(--primary) / 0.3)'
    this.dom.style.borderRadius = '2px'
    this.addHandles()
  }

  deselectNode(): void {
    this.dom.classList.remove('table-selected')
    this.dom.style.removeProperty('box-shadow')
    this.dom.style.removeProperty('border-radius')
    this.removeHandles()
  }

  destroy(): void {
    this.removeHandles()
    const innerAny = this.inner as unknown as { destroy?(): void }
    if (typeof innerAny.destroy === 'function') innerAny.destroy()
  }

  private addHandles(): void {
    this.removeHandles()
    for (const pos of ALL_HANDLES) {
      const el = document.createElement('div')
      el.className = 'table-resize-handle'
      el.style.cursor = CURSORS[pos]
      this.positionHandle(el, pos)
      el.addEventListener('mousedown', (e) => this.onHandleMouseDown(e, pos))
      this.dom.appendChild(el)
      this.handles.push(el)
    }
  }

  private removeHandles(): void {
    for (const h of this.handles) h.remove()
    this.handles = []
    this.tooltip?.remove()
    this.tooltip = null
  }

  private positionHandle(el: HTMLElement, pos: HandlePos): void {
    switch (pos) {
      case 'nw': el.style.top = '-4px'; el.style.left = '-4px'; break
      case 'n':  el.style.top = '-4px'; el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; break
      case 'ne': el.style.top = '-4px'; el.style.right = '-4px'; break
      case 'w':  el.style.top = '50%'; el.style.left = '-4px'; el.style.transform = 'translateY(-50%)'; break
      case 'e':  el.style.top = '50%'; el.style.right = '-4px'; el.style.transform = 'translateY(-50%)'; break
      case 'sw': el.style.bottom = '-4px'; el.style.left = '-4px'; break
      case 's':  el.style.bottom = '-4px'; el.style.left = '50%'; el.style.transform = 'translateX(-50%)'; break
      case 'se': el.style.bottom = '-4px'; el.style.right = '-4px'; break
    }
  }

  private onHandleMouseDown(e: MouseEvent, pos: HandlePos): void {
    e.preventDefault()
    e.stopPropagation()

    const affectsWidth = pos !== 'n' && pos !== 's'
    if (!affectsWidth) return

    const rect = this.dom.getBoundingClientRect()
    const startW = rect.width
    const startX = e.clientX
    const maxW = this.getMaxWidth()

    this.tooltip = document.createElement('div')
    this.tooltip.className = 'table-size-tooltip'
    this.dom.appendChild(this.tooltip)
    this.tooltip.textContent = `${Math.round(startW)}px wide`

    const calcWidth = (ev: MouseEvent): number => {
      const dx = ev.clientX - startX
      let newW = startW
      if (pos === 'e' || pos === 'ne' || pos === 'se') newW = startW + dx
      else if (pos === 'w' || pos === 'nw' || pos === 'sw') newW = startW - dx
      return Math.max(MIN_TABLE_WIDTH, Math.min(maxW, Math.round(newW)))
    }

    const onMove = (ev: MouseEvent): void => {
      const newW = calcWidth(ev)
      this.dom.style.width = `${newW}px`
      if (this.tooltip) this.tooltip.textContent = `${newW}px wide`
    }

    const onUp = (ev: MouseEvent): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''

      this.tooltip?.remove()
      this.tooltip = null

      const newW = calcWidth(ev)
      const nodePos = typeof this.getPos === 'function' ? this.getPos() : undefined
      if (nodePos === undefined) return

      const node = this.view.state.doc.nodeAt(nodePos)
      if (!node) return

      const { tr } = this.view.state

      // Compute total explicit column width from first row's colwidth attrs.
      // Cell colwidths are stored as px values; their sum is the table's true width.
      // When the outer handle resizes to newW, scale every cell proportionally so
      // the table actually renders at newW instead of staying stuck at the old total.
      let totalW = 0
      const firstRow = node.content.firstChild
      if (firstRow) {
        firstRow.forEach((cell) => {
          const cw = (cell.attrs.colwidth as number[] | null) ?? []
          for (const w of cw) totalW += w ?? 0
        })
      }

      if (totalW > 0 && newW !== totalW) {
        const scale = newW / totalW
        // Walk every cell; position of each cell =
        //   nodePos + 1 (enter table) + rowOffset + 1 (enter row) + cellOffset
        node.forEach((row, rowOffset) => {
          row.forEach((cell, cellOffset) => {
            const cw = (cell.attrs.colwidth as number[] | null) ?? []
            if (cw.length > 0) {
              const scaled = cw.map((w) => Math.max(25, Math.round((w ?? 0) * scale)))
              const cellPos = nodePos + 1 + rowOffset + 1 + cellOffset
              tr.setNodeMarkup(cellPos, undefined, { ...cell.attrs, colwidth: scaled })
            }
          })
        })
      }

      tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, tableWidth: newW })
      tr.setSelection(NodeSelection.create(tr.doc, nodePos))
      this.view.dispatch(tr)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = CURSORS[pos]
    document.body.style.userSelect = 'none'
  }
}
