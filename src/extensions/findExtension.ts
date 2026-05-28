import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'

interface FindPluginState {
  query: string
  results: Array<{ from: number; to: number }>
  currentIndex: number
}

const findKey = new PluginKey<FindPluginState>('prose-find')

function getMatches(doc: PmNode, query: string): Array<{ from: number; to: number }> {
  if (!query) return []
  const results: Array<{ from: number; to: number }> = []
  const lower = query.toLowerCase()
  const len = query.length
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    const text = node.text.toLowerCase()
    let i = 0
    while ((i = text.indexOf(lower, i)) !== -1) {
      results.push({ from: pos + i, to: pos + i + len })
      i += 1
    }
  })
  return results
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    find: {
      setFind: (query: string) => ReturnType
      findNext: () => ReturnType
      findPrev: () => ReturnType
      clearFind: () => ReturnType
    }
  }
}

export const FindExtension = Extension.create({
  name: 'find',

  addCommands() {
    return {
      setFind:
        (query: string) =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            const results = getMatches(state.doc, query)
            const currentIndex = results.length > 0 ? 0 : 0
            tr.setMeta(findKey, { type: 'set', query, results, currentIndex })
            if (results.length > 0) {
              tr.setSelection(TextSelection.create(tr.doc, results[0]!.from, results[0]!.to))
            }
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      findNext:
        () =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            const s = findKey.getState(state)
            if (!s || s.results.length === 0) return false
            const next = (s.currentIndex + 1) % s.results.length
            tr.setMeta(findKey, { type: 'navigate', currentIndex: next })
            const r = s.results[next]!
            tr.setSelection(TextSelection.create(tr.doc, r.from, r.to))
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      findPrev:
        () =>
        ({ tr, dispatch, state }) => {
          if (dispatch) {
            const s = findKey.getState(state)
            if (!s || s.results.length === 0) return false
            const prev = (s.currentIndex - 1 + s.results.length) % s.results.length
            tr.setMeta(findKey, { type: 'navigate', currentIndex: prev })
            const r = s.results[prev]!
            tr.setSelection(TextSelection.create(tr.doc, r.from, r.to))
            dispatch(tr.scrollIntoView())
          }
          return true
        },

      clearFind:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            tr.setMeta(findKey, { type: 'clear' })
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: findKey,
        state: {
          init(): FindPluginState {
            return { query: '', results: [], currentIndex: 0 }
          },
          apply(tr, prev, _oldState, newState): FindPluginState {
            const meta = tr.getMeta(findKey) as
              | { type: 'set'; query: string; results: FindPluginState['results']; currentIndex: number }
              | { type: 'navigate'; currentIndex: number }
              | { type: 'clear' }
              | undefined

            if (meta) {
              if (meta.type === 'set') return { query: meta.query, results: meta.results, currentIndex: meta.currentIndex }
              if (meta.type === 'navigate') return { ...prev, currentIndex: meta.currentIndex }
              if (meta.type === 'clear') return { query: '', results: [], currentIndex: 0 }
            }
            if (tr.docChanged && prev.query) {
              const results = getMatches(newState.doc, prev.query)
              return { ...prev, results, currentIndex: Math.min(prev.currentIndex, Math.max(0, results.length - 1)) }
            }
            return prev
          },
        },
        props: {
          decorations(state) {
            const s = findKey.getState(state)
            if (!s?.query || s.results.length === 0) return DecorationSet.empty
            const decorations = s.results.map((r, i) =>
              Decoration.inline(r.from, r.to, {
                class: i === s.currentIndex ? 'find-match-current' : 'find-match',
              })
            )
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

export function getFindState(editor: import('@tiptap/core').Editor): FindPluginState {
  return findKey.getState(editor.state) ?? { query: '', results: [], currentIndex: 0 }
}
