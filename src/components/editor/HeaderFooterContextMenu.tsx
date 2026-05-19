import { useEffect, useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { toast } from 'sonner'
import {
  Undo2, Redo2, Scissors, Copy, Clipboard, RemoveFormatting,
  Link2, Eraser, Unlink2, ExternalLink, Link,
  MousePointerClick, Hash,
} from 'lucide-react'
import { MenuSep, MenuBtn } from './EditorContextMenu'

interface MenuCtx {
  x: number
  y: number
  hasSelection: boolean
  isOnLink: boolean
  linkHref: string | null
  canUndo: boolean
  canRedo: boolean
}

interface Props {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement>
}

export function HeaderFooterContextMenu({ editor, containerRef }: Props): JSX.Element | null {
  const [ctx, setCtx] = useState<MenuCtx | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const dismiss = useCallback(() => {
    setCtx(null)
    setLinkMode(false)
    setLinkDraft('')
  }, [])

  // Capture-phase listener on the container so right-click works even when
  // EditorContent has pointer-events:none (zone not yet active)
  useEffect(() => {
    const container = containerRef.current
    if (!editor || !container) return

    function onContextMenu(e: MouseEvent): void {
      e.preventDefault()
      // stopPropagation in capture phase prevents the event from reaching
      // editor.view.dom, blocking ProseMirror's own contextmenu handling
      e.stopPropagation()

      const { state } = editor!
      const { selection } = state
      const hasSelection = !selection.empty

      const linkAttrs = editor!.getAttributes('link') as Record<string, unknown>
      const isOnLink = !!linkAttrs.href
      const linkHref = typeof linkAttrs.href === 'string' ? linkAttrs.href : null

      setLinkMode(false)
      setLinkDraft('')
      setCtx({
        x: e.clientX,
        y: e.clientY,
        hasSelection,
        isOnLink,
        linkHref,
        canUndo: editor!.can().undo(),
        canRedo: editor!.can().redo(),
      })
    }

    container.addEventListener('contextmenu', onContextMenu, { capture: true })
    return () => container.removeEventListener('contextmenu', onContextMenu, { capture: true })
  }, [editor, containerRef])

  useEffect(() => {
    if (!ctx) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') dismiss()
    }
    function onMouseDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) dismiss()
    }
    function onBlur(): void { dismiss() }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [ctx, dismiss])

  useLayoutEffect(() => {
    if (!ctx || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    if (rect.right > window.innerWidth) el.style.left = `${ctx.x - rect.width}px`
    if (rect.bottom > window.innerHeight) el.style.top = `${ctx.y - rect.height}px`
  }, [ctx, linkMode])

  useEffect(() => {
    if (linkMode) setTimeout(() => linkInputRef.current?.focus(), 0)
  }, [linkMode])

  if (!ctx || !editor) return null

  function run(fn: () => void): void { fn(); dismiss() }

  async function pasteWithoutFormatting(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (!text) return
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const html = escaped.split('\n').map(line => `<p>${line || '<br>'}</p>`).join('')
      editor!.chain().focus().insertContent(html).run()
    } catch {
      toast.error('Cannot read clipboard')
    }
    dismiss()
  }

  function applyLink(): void {
    const href = linkDraft.trim()
    if (!href) { dismiss(); return }
    const url = /^https?:\/\//i.test(href) ? href : `https://${href}`
    editor!.chain().focus().setLink({ href: url }).run()
    dismiss()
  }

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 9999 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {linkMode ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <span className="text-[11px] font-medium text-muted-foreground">Insert link</span>
          <input
            ref={linkInputRef}
            type="url"
            placeholder="https://example.com"
            value={linkDraft}
            onChange={(e) => setLinkDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
              if (e.key === 'Escape') dismiss()
            }}
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-1.5">
            <button
              className="flex-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              onMouseDown={(e) => e.preventDefault()}
              onClick={applyLink}
            >
              Apply
            </button>
            <button
              className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
              onMouseDown={(e) => e.preventDefault()}
              onClick={dismiss}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <MenuBtn icon={Undo2} label="Undo" disabled={!ctx.canUndo} onClick={() => run(() => editor.commands.undo())} />
          <MenuBtn icon={Redo2} label="Redo" disabled={!ctx.canRedo} onClick={() => run(() => editor.commands.redo())} />
          <MenuSep />
          <MenuBtn icon={MousePointerClick} label="Select all" onClick={() => run(() => editor.commands.selectAll())} />
          <MenuBtn icon={Clipboard} label="Paste" onClick={() => run(() => { document.execCommand('paste') })} />
          <MenuBtn icon={RemoveFormatting} label="Paste without formatting" onClick={() => void pasteWithoutFormatting()} />
          {ctx.hasSelection && (
            <>
              <MenuSep />
              <MenuBtn icon={Scissors} label="Cut" onClick={() => run(() => { document.execCommand('cut') })} />
              <MenuBtn icon={Copy} label="Copy" onClick={() => run(() => { document.execCommand('copy') })} />
              <MenuSep />
              <MenuBtn
                icon={Link2}
                label="Insert link"
                onClick={() => {
                  const existing = editor.getAttributes('link').href as string | undefined
                  setLinkDraft(existing ?? '')
                  setLinkMode(true)
                }}
              />
              <MenuBtn icon={Eraser} label="Clear formatting" onClick={() => run(() => editor.chain().clearNodes().unsetAllMarks().run())} />
            </>
          )}
          {ctx.isOnLink && ctx.linkHref && (
            <>
              <MenuSep />
              <MenuBtn icon={ExternalLink} label="Open link" onClick={() => { window.open(ctx.linkHref!, '_blank'); dismiss() }} />
              <MenuBtn icon={Link} label="Copy link" onClick={() => { void navigator.clipboard.writeText(ctx.linkHref!); dismiss() }} />
              <MenuBtn icon={Unlink2} label="Remove link" onClick={() => run(() => editor.chain().focus().unsetLink().run())} />
            </>
          )}
          <MenuSep />
          <MenuBtn
            icon={Hash}
            label="Insert page number"
            onClick={() => run(() => editor.chain().focus().insertPageNumber().run())}
          />
        </>
      )}
    </div>
  )
}
