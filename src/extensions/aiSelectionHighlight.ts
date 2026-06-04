import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export const aiSelectionHighlightKey = new PluginKey<DecorationSet>('aiSelectionHighlight')

interface HighlightRange {
  from: number
  to: number
}

interface PluginMeta {
  type: 'setRange'
  range: HighlightRange | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    aiSelectionHighlight: {
      setAiSelectionHighlight(from: number, to: number): ReturnType
      clearAiSelectionHighlight(): ReturnType
    }
  }
}

export const AiSelectionHighlight = Extension.create({
  name: 'aiSelectionHighlight',

  addCommands() {
    return {
      setAiSelectionHighlight:
        (from: number, to: number) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const meta: PluginMeta = { type: 'setRange', range: { from, to } }
            tr.setMeta(aiSelectionHighlightKey, meta)
            dispatch(tr)
          }
          return true
        },
      clearAiSelectionHighlight:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const meta: PluginMeta = { type: 'setRange', range: null }
            tr.setMeta(aiSelectionHighlightKey, meta)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: aiSelectionHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old, _oldState, newState) {
            const meta = tr.getMeta(aiSelectionHighlightKey) as PluginMeta | undefined
            if (meta?.type === 'setRange') {
              if (!meta.range) return DecorationSet.empty
              const { from, to } = meta.range
              if (from >= to || from < 0 || to > newState.doc.content.size) {
                return DecorationSet.empty
              }
              return DecorationSet.create(newState.doc, [
                Decoration.inline(from, to, { class: 'ai-selection-highlight' }),
              ])
            }
            if (tr.docChanged) {
              return old.map(tr.mapping, tr.doc)
            }
            return old
          },
        },
        props: {
          decorations(state) {
            return aiSelectionHighlightKey.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
