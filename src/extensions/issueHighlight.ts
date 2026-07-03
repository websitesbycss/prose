import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Issue } from '@/types'
import { findQuoteIndex } from '@/lib/quoteMatch'

export const issueHighlightKey = new PluginKey<DecorationSet>('issueHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    issueHighlight: {
      setAnalysisIssues(issues: Issue[]): ReturnType
      clearAnalysisIssues(): ReturnType
    }
  }
}

// Build a flat array of { char, docPos } so we can find a quote across nodes.
function buildPosMap(doc: PMNode): { text: string; positions: number[] } {
  const positions: number[] = []
  let text = ''
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        positions.push(pos + i)
        text += node.text[i]
      }
    }
  })
  return { text, positions }
}

function buildDecorations(doc: PMNode, issues: Issue[]): DecorationSet {
  const { text, positions } = buildPosMap(doc)
  const decos: Decoration[] = []

  for (const issue of issues) {
    const quote = issue.quote.trim()
    if (!quote || quote.length < 2) continue
    const idx = findQuoteIndex(text, quote)
    if (idx === -1 || idx + quote.length > positions.length) continue

    const from = positions[idx]!
    const to = positions[idx + quote.length - 1]! + 1

    decos.push(
      Decoration.inline(from, to, {
        class: `issue-highlight issue-highlight--${issue.type}`,
        'data-issue-id': issue.id,
      })
    )
  }

  return DecorationSet.create(doc, decos)
}

interface PluginMeta {
  type: 'setIssues'
  issues: Issue[]
}

export const IssueHighlight = Extension.create({
  name: 'issueHighlight',

  addCommands() {
    return {
      setAnalysisIssues:
        (issues: Issue[]) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const meta: PluginMeta = { type: 'setIssues', issues }
            tr.setMeta(issueHighlightKey, meta)
            dispatch(tr)
          }
          return true
        },
      clearAnalysisIssues:
        () =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            const meta: PluginMeta = { type: 'setIssues', issues: [] }
            tr.setMeta(issueHighlightKey, meta)
            dispatch(tr)
          }
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: issueHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(issueHighlightKey) as PluginMeta | undefined
            if (meta?.type === 'setIssues') {
              return buildDecorations(tr.doc, meta.issues)
            }
            if (tr.docChanged) {
              return old.map(tr.mapping, tr.doc)
            }
            return old
          },
        },
        props: {
          decorations(state) {
            return issueHighlightKey.getState(state) ?? DecorationSet.empty
          },
        },
      }),
    ]
  },
})
