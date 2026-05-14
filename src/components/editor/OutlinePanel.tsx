import { useState, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'

interface HeadingEntry {
  pos: number
  level: 1 | 2 | 3
  text: string
}

function extractHeadings(editor: Editor): HeadingEntry[] {
  const headings: HeadingEntry[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.attrs.level <= 3) {
      headings.push({
        pos,
        level: node.attrs.level as 1 | 2 | 3,
        text: node.textContent,
      })
    }
  })
  return headings
}

interface OutlinePanelProps {
  editor: Editor | null
}

export default function OutlinePanel({ editor }: OutlinePanelProps): JSX.Element {
  const [headings, setHeadings] = useState<HeadingEntry[]>([])

  useEffect(() => {
    if (!editor) return
    const update = (): void => setHeadings(extractHeadings(editor))
    update()
    editor.on('update', update)
    return () => { editor.off('update', update) }
  }, [editor])

  if (headings.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-muted-foreground">
        Add headings to see an outline.
      </p>
    )
  }

  return (
    <nav className="flex flex-col gap-0.5 px-1.5 py-2 overflow-y-auto">
      {headings.map((h, i) => (
        <button
          key={`${h.pos}-${i}`}
          className={cn(
            'w-full truncate rounded px-1.5 py-1 text-left text-xs transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            h.level === 1 && 'font-medium',
            h.level === 2 && 'pl-3.5 text-muted-foreground',
            h.level === 3 && 'pl-6 text-muted-foreground/70',
          )}
          onClick={() => {
            if (!editor) return
            editor.commands.setTextSelection(h.pos + 1)
            editor.commands.scrollIntoView()
            editor.view.focus()
          }}
          title={h.text || undefined}
        >
          {h.text || <span className="italic opacity-40">Untitled</span>}
        </button>
      ))}
    </nav>
  )
}
