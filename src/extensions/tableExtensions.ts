import { Extension, findParentNode } from '@tiptap/core'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import type { Node as PmNode } from '@tiptap/pm/model'
import { CellSelection } from '@tiptap/pm/tables'
import { TableNodeView } from './tableNodeView'

const CELL_MIN_WIDTH = 60

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

export const CustomTable = Table.configure({ resizable: true }).extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      tableWidth: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const styleW = el.style.width ? parseInt(el.style.width) : null
          const attrW = el.getAttribute('width') ? parseInt(el.getAttribute('width')!) : null
          return styleW ?? attrW ?? null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const w = attrs.tableWidth
          return w != null ? { style: `width: ${w as number}px` } : {}
        },
      },
    }
  },

  addNodeView() {
    return ({ node, view, getPos }) =>
      new TableNodeView(
        node,
        view,
        getPos as () => number | undefined,
        CELL_MIN_WIDTH
      )
  },
})

export const TableCellAttributes = Extension.create({
  name: 'tableCellAttributes',

  addCommands() {
    return {
      setCellAttribute:
        (attr: string, value: unknown) =>
        ({ state, dispatch }) => {
          const { selection } = state

          // Multi-cell selection: apply to every selected cell in one transaction
          if (selection instanceof CellSelection) {
            if (dispatch) {
              const tr = state.tr
              selection.forEachCell((node, pos) => {
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, [attr]: value })
              })
              dispatch(tr)
            }
            return true
          }

          // Single cell: find the cell containing the cursor
          const cell = findParentNode(
            (node: PmNode) =>
              node.type.name === 'tableCell' || node.type.name === 'tableHeader'
          )(selection)

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
