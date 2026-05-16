import { Extension, findParentNode } from '@tiptap/core'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import type { Node as PmNode } from '@tiptap/pm/model'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableCellAttributes: {
      setCellAttribute(attr: string, value: unknown): ReturnType
    }
  }
}

const VISUAL_CELL_ATTRS = {
  backgroundColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, unknown>) => {
      const v = attributes.backgroundColor
      return v ? { style: `background-color: ${v as string}` } : {}
    },
  },
  borderColor: {
    default: null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-border-color') || null,
    renderHTML: (attributes: Record<string, unknown>) => {
      const v = attributes.borderColor
      return v
        ? { 'data-border-color': String(v), style: `border-color: ${v as string}` }
        : {}
    },
  },
  borderWidth: {
    default: null,
    parseHTML: (element: HTMLElement) => {
      const val = element.getAttribute('data-border-width')
      return val ? parseFloat(val) : null
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const v = attributes.borderWidth
      return v != null
        ? { 'data-border-width': String(v), style: `border-width: ${v as number}px` }
        : {}
    },
  },
}

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...VISUAL_CELL_ATTRS }
  },
})

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...VISUAL_CELL_ATTRS }
  },
})

export const CustomTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      height: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const h = element.style.height
          return h ? parseFloat(h) : null
        },
        renderHTML: (attributes: Record<string, unknown>) => {
          const h = attributes.height
          return h != null ? { style: `height: ${h as number}px` } : {}
        },
      },
    }
  },
})

export const TableCellAttributes = Extension.create({
  name: 'tableCellAttributes',

  addCommands() {
    return {
      setCellAttribute:
        (attr: string, value: unknown) =>
        ({ state, dispatch }) => {
          const cell = findParentNode(
            (node: PmNode) =>
              node.type.name === 'tableCell' || node.type.name === 'tableHeader'
          )(state.selection)

          if (!cell) return false

          if (dispatch) {
            dispatch(
              state.tr.setNodeMarkup(cell.pos, undefined, {
                ...cell.node.attrs,
                [attr]: value,
              })
            )
          }
          return true
        },
    }
  },
})
