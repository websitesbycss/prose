import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0
}

export function useWordCount(editor: Editor | null, excludeHeader = false): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!editor) return

    const update = (): void => {
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
    editor.on('update', update)
    return () => {
      editor.off('update', update)
    }
  }, [editor, excludeHeader])

  return count
}
