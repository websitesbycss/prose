import { Node, mergeAttributes, Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    rightTab: {
      insertRightTab(): ReturnType
    }
  }
}

// Inline spacer node — pushes content after it to the right edge when the
// parent paragraph has display:flex (which .header-footer-editor applies via CSS).
export const RightTab = Node.create({
  name: 'rightTab',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'span[data-right-tab]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-right-tab': '', class: 'right-tab' }),
    ]
  },

  addNodeView() {
    return () => {
      const span = document.createElement('span')
      span.setAttribute('data-right-tab', '')
      span.className = 'right-tab'
      return { dom: span }
    }
  },

  addCommands() {
    return {
      insertRightTab:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: 'rightTab' }).run(),
    }
  },
})

// Intercepts Tab in header/footer editors to insert a right-align spacer.
export const TabToRightAlign = Extension.create({
  name: 'tabToRightAlign',

  addKeyboardShortcuts() {
    return {
      Tab: () => this.editor.commands.insertRightTab(),
    }
  },
})
