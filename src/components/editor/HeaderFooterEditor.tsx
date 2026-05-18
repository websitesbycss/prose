import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import type { JSONContent } from '@tiptap/core'
import { cn } from '@/lib/utils'
import { RightTab, TabToRightAlign } from '@/extensions/rightTab'
import { PageNumberNode } from '@/extensions/pageNumber'
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants'

interface HeaderFooterEditorProps {
  zone: 'header' | 'footer'
  documentId: string
  // contentKey changes when the parent wants to force a content reset (e.g. after template apply)
  contentKey: string
  initialContent: JSONContent | null
}

const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

function parseContent(raw: string | null): JSONContent | null {
  if (!raw) return null
  try { return JSON.parse(raw) as JSONContent } catch { return null }
}

export { parseContent as parseHeaderContent }

export function HeaderFooterEditor({
  zone,
  documentId,
  contentKey,
  initialContent,
}: HeaderFooterEditorProps): JSX.Element {
  const [active, setActive] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const docIdRef = useRef(documentId)

  useEffect(() => {
    docIdRef.current = documentId
  }, [documentId])

  const persistContent = useCallback(
    async (content: JSONContent): Promise<void> => {
      try {
        const field = zone === 'header' ? 'headerContent' : 'footerContent'
        await window.prose.documents.update(docIdRef.current, {
          [field]: JSON.stringify(content),
        })
      } catch (err) {
        console.error(`[HeaderFooterEditor:${zone}] save error:`, err)
      }
    },
    [zone]
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Underline,
      TextAlign.configure({ types: ['paragraph'] }),
      RightTab,
      TabToRightAlign,
      PageNumberNode,
    ],
    content: initialContent ?? EMPTY_DOC,
    onCreate: ({ editor: e }) => setIsEmpty(e.isEmpty),
    onUpdate: ({ editor: e }) => {
      setIsEmpty(e.isEmpty)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void persistContent(e.getJSON())
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    onBlur: () => setActive(false),
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          setActive(false)
          return true
        }
        return false
      },
    },
  })

  // Reset content when document switches or when contentKey changes (template applied)
  useEffect(() => {
    if (!editor) return
    editor.commands.setContent(initialContent ?? EMPTY_DOC, false)
    setIsEmpty(editor.isEmpty)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, contentKey])

  // Deactivate when clicking outside this zone
  useEffect(() => {
    if (!active) return
    function onMouseDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [active])

  // Cleanup save timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  function handleClick(): void {
    if (!active) {
      setActive(true)
      // Defer focus so the activation state renders first
      setTimeout(() => editor?.commands.focus('end'), 0)
    }
  }

  const label = zone === 'header' ? 'Header' : 'Footer'

  return (
    <div
      ref={containerRef}
      title={`Double-click to edit ${label.toLowerCase()}. Page numbers update on export.`}
      className={cn(
        'relative min-h-[2em] cursor-text transition-colors duration-150',
        active
          ? 'bg-background ring-1 ring-inset ring-primary/20'
          : 'bg-muted/5 hover:bg-muted/10'
      )}
      onClick={handleClick}
      onDoubleClick={handleClick}
    >
      {!active && isEmpty && (
        <span
          className="pointer-events-none absolute top-1.5 select-none text-[11px] text-muted-foreground/30"
          style={{ left: 'var(--page-margin-x)' }}
        >
          {label}
        </span>
      )}
      <EditorContent
        editor={editor}
        className={cn(
          'header-footer-editor py-1.5 outline-none',
          !active && 'pointer-events-none'
        )}
        style={{
          paddingLeft: 'var(--page-margin-x)',
          paddingRight: 'calc(var(--page-margin-x) / 2)',
        }}
      />
    </div>
  )
}

// Build a Tiptap doc JSON for a right-aligned "LastName #" header line.
export function buildRunningHeadContent(lastName: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          ...(lastName ? [{ type: 'text', text: lastName + ' ' }] : []),
          { type: 'rightTab' },
          { type: 'pageNumber' },
        ],
      },
    ],
  }
}
