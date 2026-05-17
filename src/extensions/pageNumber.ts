import { Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageNumber: {
      insertPageNumber(): ReturnType
    }
  }
}

export const PageNumberNode = Node.create({
  name: 'pageNumber',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'span[data-page-number]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-page-number': '', class: 'page-number-node' }), '1']
  },

  addNodeView() {
    return () => {
      const span = document.createElement('span')
      span.setAttribute('data-page-number', '')
      span.className = 'page-number-node inline-flex select-none rounded bg-muted px-1 text-[0.7em] font-mono text-muted-foreground'
      span.textContent = '#'
      span.title = 'Page number (auto-increments on export)'
      return { dom: span }
    }
  },

  addCommands() {
    return {
      insertPageNumber:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: 'pageNumber' }).run(),
    }
  },
})
