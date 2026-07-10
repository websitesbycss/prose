// Maps Harper's character-offset issue spans (measured against a document's
// flat text content) back to ProseMirror positions, so highlights and
// suggestion-apply/scroll-to-issue can locate the exact range directly —
// no fuzzy quote search needed since Harper gives us exact offsets.
import type { Node as PMNode } from '@tiptap/pm/model'

/** positions[i] = the ProseMirror doc position of the i-th character of doc.textContent. */
export function buildCharPositions(doc: PMNode): number[] {
  const positions: number[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) positions.push(pos + i)
    }
  })
  return positions
}

/** Resolves a single [start, end) character range to ProseMirror doc positions. */
export function charSpanToDocRange(doc: PMNode, start: number, end: number): { from: number; to: number } | null {
  if (start < 0 || end <= start) return null
  const positions = buildCharPositions(doc)
  if (end > positions.length) return null
  return { from: positions[start]!, to: positions[end - 1]! + 1 }
}
