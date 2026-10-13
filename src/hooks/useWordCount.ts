import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function useWordCount(editor: Editor | null, excludeHeader = false): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!editor || editor.isDestroyed) return

    const update = (): void => {
      if (editor.isDestroyed) return
      if (!excludeHeader) {
        setCount(countWords(editor.getText()))
        return
      }

      let words = 0
      editor.state.doc.forEach((node) => {
        const role = node.attrs?.role as string | null
        if (role) return // skip header / title nodes
        words += countWords(node.textContent)
      })
      setCount(words)
    }

    update()
    // Content is loaded with `emitUpdate: false` (initial load, history restore),
    // which skips the 'update' event. Listen to doc-changing transactions instead.
    const onTransaction = ({ transaction }: { transaction: { docChanged: boolean } }): void => {
      if (transaction.docChanged) update()
    }
    editor.on('transaction', onTransaction)
    return () => {
      editor.off('transaction', onTransaction)
    }
  }, [editor, excludeHeader])

  return count
}
