import { useEffect, useRef, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import { FontFamily } from '@tiptap/extension-font-family'
import { Color } from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import { Link } from '@tiptap/extension-link'
import type { JSONContent } from '@tiptap/core'
import { cn } from '@/lib/utils'
import { RightTab, TabToRightAlign } from '@/extensions/rightTab'
import { PageNumberNode } from '@/extensions/pageNumber'
import { FontSize } from '@/extensions/fontSize'
import { Indent } from '@/extensions/indent'
import { LineHeight } from '@/extensions/lineHeight'
import { ExitMarkOnArrowRight } from '@/extensions/exitMarkOnArrowRight'
import { AUTO_SAVE_DEBOUNCE_MS } from '@/constants'
import { HeaderFooterContextMenu } from './HeaderFooterContextMenu'

interface HeaderFooterEditorProps {
  zone: 'header' | 'footer'
  documentId: string
  contentKey: string
  initialContent: JSONContent | null
  onZoneFocus?: (editor: Editor) => void
  onZoneBlur?: () => void
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
  onZoneFocus,
  onZoneBlur,
}: HeaderFooterEditorProps): JSX.Element {
  const [active, setActive] = useState(false)
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
        heading: { levels: [1, 2, 3] },
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Underline,
      Subscript,
      Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer' } }),
      Indent,
      LineHeight,
      ExitMarkOnArrowRight,
      RightTab,
      TabToRightAlign,
      PageNumberNode,
    ],
    content: initialContent ?? EMPTY_DOC,
    onFocus: ({ editor: e }) => {
      setActive(true)
      onZoneFocus?.(e)
    },
    onUpdate: ({ editor: e }) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void persistContent(e.getJSON())
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    onBlur: () => {
      setActive(false)
      onZoneBlur?.()
    },
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
      setTimeout(() => editor?.commands.focus('end'), 0)
    }
  }

  const label = zone === 'header' ? 'Header' : 'Footer'

  return (
    <div
      ref={containerRef}
      title={`Click to edit ${label.toLowerCase()}. Page numbers update on export.`}
      className={cn(
        'cursor-text',
        active && 'ring-1 ring-inset ring-primary/20'
      )}
      onClick={handleClick}
      onDoubleClick={handleClick}
    >
      {/* Persistent zone label — always visible, acts as a field caption */}
      <div
        className="pointer-events-none select-none pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/35"
        style={{ paddingLeft: 'var(--page-margin-x)' }}
      >
        {label}
      </div>
      <EditorContent
        editor={editor}
        className={cn(
          'header-footer-editor pb-1.5 outline-none',
          !active && 'pointer-events-none'
        )}
        style={{
          paddingLeft: 'var(--page-margin-x)',
          paddingRight: 'var(--page-margin-x)',
        }}
      />
      <HeaderFooterContextMenu editor={editor} containerRef={containerRef} />
    </div>
  )
}

// MLA: everything right-aligned — rightTab pushes lastName + pageNum to the right
export function buildMlaHeaderContent(lastName: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'rightTab' },
          ...(lastName ? [{ type: 'text', text: lastName + ' ' }] : []),
          { type: 'pageNumber' },
        ],
      },
    ],
  }
}

// APA: short title left, rightTab spacer, page number right
export function buildApaHeaderContent(shortTitle: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          ...(shortTitle ? [{ type: 'text', text: shortTitle }] : []),
          { type: 'rightTab' },
          { type: 'pageNumber' },
        ],
      },
    ],
  }
}
