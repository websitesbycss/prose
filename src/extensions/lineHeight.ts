import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    lineHeight: {
      setLineHeight(value: number): ReturnType
      unsetLineHeight(): ReturnType
    }
  }
}

const TYPES = ['paragraph', 'heading'] as const

export const LineHeight = Extension.create({
  name: 'lineHeight',

  addGlobalAttributes() {
    return [
      {
        types: [...TYPES],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => {
              const lh = element.style.lineHeight
              return lh ? parseFloat(lh) : null
            },
            renderHTML: (attributes) => {
              const lh = attributes.lineHeight as number | null | undefined
              if (lh === null || lh === undefined) return {}
              return { style: `line-height: ${lh}` }
            },
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      // Mirrors the TextAlign extension pattern — delegates to the built-in
      // updateAttributes command so ProseMirror selection handling is identical
      // to how all other block attributes work.
      setLineHeight:
        (value: number) =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineHeight: value })).every(Boolean),

      unsetLineHeight:
        () =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineHeight: null })).every(Boolean),
    }
  },
})
