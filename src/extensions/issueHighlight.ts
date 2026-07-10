import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import type { Issue } from '@/types'
import { buildCharPositions } from '@/lib/issueSpan'

export const issueHighlightKey = new PluginKey<DecorationSet>('issueHighlight')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    issueHighlight: {
      setAnalysisIssues(issues: Issue[]): ReturnType
      clearAnalysisIssues(): ReturnType
    }
  }
}

function buildDecorations(doc: PMNode, issues: Issue[]): DecorationSet {
  const positions = buildCharPositions(doc)
  const decos: Decoration[] = []

  for (const issue of issues) {
    const { start, end } = issue.span
    if (start < 0 || end <= start || end > positions.length) continue

    decos.push(
      Decoration.inline(positions[start]!, positions[end - 1]! + 1, {
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
