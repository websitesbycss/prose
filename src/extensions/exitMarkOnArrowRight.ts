import { Extension, getMarkRange } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'

export const ExitMarkOnArrowRight = Extension.create({
  name: 'exitMarkOnArrowRight',

  addKeyboardShortcuts() {
    return {
      ArrowRight: () => {
        const { state, view } = this.editor
        const { selection, schema } = state
        const { $from, empty } = selection

        if (!empty) return false

        const subMark = schema.marks['subscript']
        const supMark = schema.marks['superscript']

        const activeMark =
          subMark && $from.marks().some((m) => m.type === subMark)
            ? subMark
            : supMark && $from.marks().some((m) => m.type === supMark)
            ? supMark
            : null

        if (!activeMark) return false

        const range = getMarkRange($from, activeMark)
        const insertPos = range ? range.to : $from.pos
        const newMarks = activeMark.removeFromSet($from.marks())

        // Inserting a zero-width space with plain marks at insertPos forces the
        // cursor into a real text node that lives outside the <sub>/<sup> element.
        // window.getSelection().collapse() doesn't work because ProseMirror's DOM
        // observer detects the change and reverts it; having an actual text node
        // makes ProseMirror itself place the caret in the right element.
        //
        // Avoid stacking multiple ZWS chars: if one is already here from a
        // previous right-arrow press, just move into it.
        const $insert = state.doc.resolve(insertPos)
        const nodeAfter = $insert.nodeAfter
        const alreadyAnchored =
          nodeAfter?.isText &&
          nodeAfter.text?.[0] === '​' &&
          !activeMark.isInSet(nodeAfter.marks)

        if (alreadyAnchored) {
          view.dispatch(
            state.tr.setSelection(TextSelection.create(state.doc, insertPos + 1))
          )
        } else {
          const tr = state.tr.insert(insertPos, schema.text('​', newMarks))
          view.dispatch(
            tr.setSelection(TextSelection.create(tr.doc, insertPos + 1))
          )
        }

        return true
      },
    }
  },
})
