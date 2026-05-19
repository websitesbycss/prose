import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function useSelectionWordCount(editor: Editor | null): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!editor) return

    const update = (): void => {
      const { from, to } = editor.state.selection
      if (from === to) {
        setCount(0)
        return
      }
      const text = editor.state.doc.textBetween(from, to, ' ')
      setCount(countWords(text))
    }

    update()
    editor.on('selectionUpdate', update)
    editor.on('update', update)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('update', update)
    }
  }, [editor])

  return count
}
