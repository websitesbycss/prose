import { Extension } from '@tiptap/core'

const MAX_INDENT = 7

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent(): ReturnType
      outdent(): ReturnType
    }
  }
}

export const Indent = Extension.create({
  name: 'indent',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          indent: {
            default: 0,
            parseHTML: (element) => {
              const ml = element.style.marginLeft
              return ml ? Math.round(parseInt(ml) / 40) : 0
            },
            renderHTML: (attributes) => {
              const level = (attributes.indent as number) || 0
              if (!level) return {}
              return { style: `margin-left: ${level * 40}px` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      indent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          let changed = false
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
            const current = (node.attrs.indent as number) || 0
            if (current < MAX_INDENT) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current + 1 })
              changed = true
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
      outdent:
        () =>
        ({ tr, state, dispatch }) => {
          const { selection } = state
          let changed = false
          state.doc.nodesBetween(selection.from, selection.to, (node, pos) => {
            if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
            const current = (node.attrs.indent as number) || 0
            if (current > 0) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current - 1 })
              changed = true
            }
          })
          if (changed && dispatch) dispatch(tr)
          return changed
        },
    }
  },

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('listItem')) return false
        return editor.commands.indent()
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('listItem')) return false
        return editor.commands.outdent()
      },
    }
  },
})
