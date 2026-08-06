// Maps Harper's character-offset issue spans back to ProseMirror positions.
//
// The flat text Harper lints MUST come from flattenDocText below, never from
// doc.textContent — textContent concatenates blocks with no separator, which
// glued the last word of one paragraph to the first word of the next
// ("John Doe" + "Professor Matt" → "DoeProfessor") and produced bogus
// compound-word spelling errors. flattenDocText inserts a newline at every
// block boundary and keeps a parallel positions[] map so spans measured
// against that text resolve to exact ProseMirror ranges; separator characters
// map to -1 (they have no doc position).
import type { Node as PMNode } from '@tiptap/pm/model'

export interface FlatDocText {
  text: string
  /** positions[i] = PM doc position of text[i]; -1 for inserted separators. */
  positions: number[]
}

export function flattenDocText(doc: PMNode): FlatDocText {
  let text = ''
  const positions: number[] = []
  let pastFirstBlock = false

  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      if (pastFirstBlock) {
        text += '\n'
        positions.push(-1)
      }
      pastFirstBlock = true
      return true
    }
    if (node.isText && node.text) {
      text += node.text
      for (let i = 0; i < node.text.length; i++) positions.push(pos + i)
    } else if (node.isInline && node.isLeaf) {
      // Inline atoms (hard breaks, images, inline math, page numbers): a word
      // boundary in the flat text, but no lintable characters of their own.
      text += node.type.name === 'hardBreak' ? '\n' : ' '
      positions.push(-1)
    }
    return true
  })

  return { text, positions }
}

/**
 * Resolves a [start, end) character span (measured against flattenDocText's
 * text) to a ProseMirror range using its positions map. Separator characters
 * at the span's edges are trimmed off.
 */
export function spanToDocRange(
  positions: number[],
  start: number,
  end: number,
): { from: number; to: number } | null {
  if (start < 0 || end <= start || end > positions.length) return null
  let s = start
  let e = end
  while (s < e && positions[s] === -1) s++
  while (e > s && positions[e - 1] === -1) e--
  if (s >= e) return null
  return { from: positions[s]!, to: positions[e - 1]! + 1 }
}

/** Convenience wrapper that flattens `doc` itself. */
export function charSpanToDocRange(doc: PMNode, start: number, end: number): { from: number; to: number } | null {
  return spanToDocRange(flattenDocText(doc).positions, start, end)
}
