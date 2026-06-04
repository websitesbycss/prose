import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PmNode } from '@tiptap/pm/model'

export const spellKey = new PluginKey<DecorationSet>('spellcheck')

interface SpellSpec {
  word: string
  suggestions: string[]
}

const WORD_RE = /[\w']+/g

function collectWords(doc: PmNode): Map<string, Array<{ from: number; to: number }>> {
  const map = new Map<string, Array<{ from: number; to: number }>>()
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return
    WORD_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = WORD_RE.exec(node.text)) !== null) {
      const raw = m[0].replace(/^'+|'+$/g, '')
      if (raw.length < 2) continue
      const from = pos + m.index
      const to = pos + m.index + m[0].length
      if (!map.has(raw)) map.set(raw, [])
      map.get(raw)!.push({ from, to })
    }
  })
  return map
}

export const SpellcheckExtension = Extension.create({
  name: 'spellcheck',

  addProseMirrorPlugins() {
    const ignored = new Set<string>()
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    // Set by apply() when the ignored set is replaced; consumed by view.update()
    let recheckPending = false

    const plugin = new Plugin<DecorationSet>({
      key: spellKey,

      state: {
        init: () => DecorationSet.empty,
        apply(tr, decorations, _old, newState) {
          const meta = tr.getMeta(spellKey) as
            | { decorations?: DecorationSet; ignore?: string; setIgnored?: string[] }
            | undefined

          if (meta?.setIgnored !== undefined) {
            ignored.clear()
            for (const w of meta.setIgnored) ignored.add(w.toLowerCase())
            recheckPending = true
            return DecorationSet.empty
          }
          if (meta?.decorations !== undefined) return meta.decorations
          if (meta?.ignore) {
            const w = meta.ignore.toLowerCase()
            ignored.add(w)
            return decorations.remove(
              decorations.find(undefined, undefined, (spec) => (spec as SpellSpec).word === w)
            )
          }
          return decorations.map(tr.mapping, newState.doc)
        },
      },

      props: {
        decorations(state) {
          return spellKey.getState(state) ?? DecorationSet.empty
        },
      },

      view(editorView) {
        let checkGeneration = 0

        async function runCheck(): Promise<void> {
          const gen = ++checkGeneration
          const wordMap = collectWords(editorView.state.doc)
          const toCheck = [...wordMap.keys()].filter(w => !ignored.has(w.toLowerCase()))

          if (toCheck.length === 0) {
            if (!editorView.isDestroyed) {
              editorView.dispatch(
                editorView.state.tr.setMeta(spellKey, { decorations: DecorationSet.empty })
              )
            }
            return
          }

          let results: Record<string, { correct: boolean; suggestions: string[] }>
          try {
            results = await window.prose.spell.checkBatch(toCheck)
          } catch {
            return
          }
          if (editorView.isDestroyed || gen !== checkGeneration) return

          const decos: Decoration[] = []
          for (const [word, positions] of wordMap) {
            if (ignored.has(word.toLowerCase())) continue
            const res = results[word]
            if (!res || res.correct) continue
            if (res.suggestions.length === 0) continue
            const spec: SpellSpec = { word: word.toLowerCase(), suggestions: res.suggestions }
            for (const { from, to } of positions) {
              decos.push(Decoration.inline(from, to, { class: 'spell-error', 'data-word': word }, spec))
            }
          }

          const decorations = DecorationSet.create(editorView.state.doc, decos)
          if (!editorView.isDestroyed) {
            editorView.dispatch(editorView.state.tr.setMeta(spellKey, { decorations }))
          }
        }

        function schedule(): void {
          if (debounceTimer) clearTimeout(debounceTimer)
          debounceTimer = setTimeout(() => void runCheck(), 600)
        }

        schedule()

        return {
          update(view, prevState) {
            if (view.state.doc !== prevState.doc || recheckPending) {
              recheckPending = false
              schedule()
            }
          },
          destroy() {
            if (debounceTimer) clearTimeout(debounceTimer)
          },
        }
      },
    })

    return [plugin]
  },
})
