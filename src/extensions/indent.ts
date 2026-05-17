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
      {
        types: ['paragraph'],
        attributes: {
          noIndent: {
            default: false,
            parseHTML: (element) => element.hasAttribute('data-no-indent'),
            renderHTML: (attributes) =>
              (attributes.noIndent as boolean) ? { 'data-no-indent': '' } : {},
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
            const noIndent = (node.attrs.noIndent as boolean) || false
            if (noIndent) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, noIndent: false })
              changed = true
            } else if (current < MAX_INDENT) {
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
            const noIndent = (node.attrs.noIndent as boolean) || false
            if (current > 0) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: current - 1 })
              changed = true
            } else if (!noIndent) {
              tr.setNodeMarkup(pos, undefined, { ...node.attrs, noIndent: true })
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
      Backspace: ({ editor }) => {
        const { selection, doc } = editor.state
        if (!selection.empty) return false
        const $pos = doc.resolve(selection.from)
        if ($pos.parentOffset !== 0 || $pos.parent.type.name !== 'paragraph') return false
        const indent = ($pos.parent.attrs.indent as number) || 0
        const noIndent = ($pos.parent.attrs.noIndent as boolean) || false
        if (indent > 0 || noIndent) return false
        // Only intercept backspace for CSS-indented paragraphs (MLA/APA)
        const hasCssIndent = editor.view.dom.closest('.format-mla, .format-apa') !== null
        if (!hasCssIndent) return false
        return editor.commands.outdent()
      },
    }
  },
})
