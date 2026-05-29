import { Node } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: {
      insertPageBreak(): ReturnType
    }
  }
}

export const PageBreakNode = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },

  renderHTML() {
    return ['div', { 'data-page-break': '', style: 'page-break-before:always;break-before:page;height:0;margin:0;padding:0;border:none;overflow:hidden;' }]
  },

  addNodeView() {
    return () => {
      const div = document.createElement('div')
      div.setAttribute('data-page-break', '')
      div.className = 'page-break-node'
      div.title = 'Page break: click to select, Delete to remove'
      return { dom: div }
    }
  },

  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: 'pageBreak' }).run(),
    }
  },
})
