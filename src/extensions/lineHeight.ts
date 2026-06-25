import { Extension } from '@tiptap/core'

// Named distinctly from setLineHeight/unsetLineHeight — @tiptap/extension-text-style
// ships its own built-in line-height extension (string-valued) that augments
// `Commands` with methods of those exact names. We don't use that extension,
// but importing anything from the package still pulls its ambient .d.ts into
// the project, and TipTap flattens every extension's command methods into one
// shared interface regardless of which outer group declared them — so a
// same-named method with an incompatible signature (string vs number here)
// collides project-wide even though we never call the other extension's copy.
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    customLineHeight: {
      setCustomLineHeight(value: number): ReturnType
      unsetCustomLineHeight(): ReturnType
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
      setCustomLineHeight:
        (value: number) =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineHeight: value })).every(Boolean),

      unsetCustomLineHeight:
        () =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineHeight: null })).every(Boolean),
    }
  },
})
