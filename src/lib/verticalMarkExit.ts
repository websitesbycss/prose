import type { Editor } from '@tiptap/core'
import { getMarkRange } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

const ZWS = '\u200B'

export type VerticalMark = 'subscript' | 'superscript'

/** Move the caret out of sub/sup so it renders at the baseline where the next character will insert. */
export function exitVerticalMark(editor: Editor, mark: VerticalMark): void {
  const markType = editor.schema.marks[mark]
  if (!markType) return

  const { state, view } = editor
  const { $from, empty } = state.selection

  if (!empty) {
    editor.chain().focus().unsetMark(mark).run()
    return
  }

  let tr = state.tr.removeStoredMark(markType)
  const range = getMarkRange($from, markType)

  if (!range) {
    view.dispatch(tr)
    editor.commands.focus()
    return
  }

  const markedText = state.doc.textBetween(range.from, range.to, '')

  // Placeholder-only sub/sup from toolbar enable — remove the element entirely.
  if (markedText === ZWS) {
    tr = tr.delete(range.from, range.to)
    const pos = range.from
    const $pos = tr.doc.resolve(pos)
    const nodeAfter = $pos.nodeAfter
    const needsAnchor =
      !(nodeAfter?.isText && nodeAfter.text?.[0] === ZWS && !markType.isInSet(nodeAfter.marks))
    if (needsAnchor) tr = tr.insert(pos, state.schema.text(ZWS))
    tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1))
    view.dispatch(tr)
    editor.commands.focus()
    return
  }

  // Exit at the cursor when inside the mark; otherwise after the marked run.
  const cursorInMark = $from.marks().some((m) => m.type === markType)
  const insertPos =
    cursorInMark && $from.pos >= range.from && $from.pos <= range.to
      ? $from.pos
      : range.to
  const $insert = tr.doc.resolve(insertPos)
  const nodeAfter = $insert.nodeAfter
  const alreadyAnchored =
    nodeAfter?.isText &&
    nodeAfter.text?.[0] === ZWS &&
    !markType.isInSet(nodeAfter.marks)

  if (alreadyAnchored) {
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
  } else {
    tr = tr.insert(insertPos, state.schema.text(ZWS))
    tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
  }

  view.dispatch(tr)
  editor.commands.focus()
}

/** Insert a zero-width space carrying the mark so the caret shifts vertically in the DOM. */
export function enterVerticalMark(editor: Editor, mark: VerticalMark): void {
  editor.chain().focus().insertContent({ type: 'text', text: ZWS, marks: [{ type: mark }] }).run()
}
