import { useState, useRef, useEffect, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { mlaRunningLastName, apaShortTitle } from '@/lib/templates'

interface PageHeaderProps {
  format: string
  content: JSONContent | null
  fontFamily?: string
  editor?: Editor | null
}

export default function PageHeader({ format, content, fontFamily, editor }: PageHeaderProps): JSX.Element | null {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const font = fontFamily ?? 'Times New Roman, serif'

  const override = editor ? (editor.state.doc.attrs.runningHead as string | null) : null

  const commit = useCallback((value: string): void => {
    setEditing(false)
    if (!editor) return
    editor.commands.setRunningHead(value.trim() || null)
  }, [editor])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  if (!content) return null

  if (format === 'mla') {
    const lastName = override ?? mlaRunningLastName(content)
    return (
      <div className="mb-4 flex justify-end text-sm" style={{ fontFamily: font }}>
        {editing ? (
          <span className="flex items-center gap-1">
            <input
              ref={inputRef}
              className="w-28 border-b border-primary bg-transparent text-right text-sm outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commit(draft) }
                if (e.key === 'Escape') setEditing(false)
              }}
            />
            <span> 1</span>
          </span>
        ) : (
          <span
            className="cursor-pointer transition-colors hover:text-primary"
            title="Click to edit running head"
            onClick={() => { setDraft(lastName); setEditing(true) }}
          >
            {lastName ? `${lastName} 1` : '1'}
          </span>
        )}
      </div>
    )
  }

  if (format === 'apa') {
    const shortTitle = override ?? apaShortTitle(content)
    return (
      <div className="mb-4 flex justify-between text-sm" style={{ fontFamily: font }}>
        {editing ? (
          <input
            ref={inputRef}
            className="border-b border-primary bg-transparent text-sm uppercase outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit(draft) }
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : (
          <span
            className="cursor-pointer uppercase transition-colors hover:text-primary"
            title="Click to edit running head"
            onClick={() => { setDraft(shortTitle); setEditing(true) }}
          >
            {shortTitle}
          </span>
        )}
        <span>1</span>
      </div>
    )
  }

  return null
}
