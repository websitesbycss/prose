import { Extension } from '@tiptap/core'

// Marks paragraph nodes as MLA/APA header sections so they can be
// styled distinctly and excluded from word count.
export const ParagraphRole = Extension.create({
  name: 'paragraphRole',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          role: {
            default: null,
            parseHTML: (el) => el.getAttribute('data-role') || null,
            renderHTML: (attrs) =>
              attrs.role ? { 'data-role': attrs.role as string } : {},
          },
        },
      },
    ]
  },
})
