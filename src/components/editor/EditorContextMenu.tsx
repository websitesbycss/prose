import { useEffect, useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { toast } from 'sonner'
import {
  Undo2, Redo2, Scissors, Copy, Clipboard, RemoveFormatting,
  Link2, Eraser, Sparkles, ExternalLink, Link, Unlink2,
  Trash2, Download, MousePointerClick,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
} from 'lucide-react'

interface MenuCtx {
  x: number
  y: number
  isOnImage: boolean
  imageSrc: string | null
  imageBorderRadius: number
  isOnPageBreak: boolean
  hasSelection: boolean
  selectedText: string
  isOnLink: boolean
  linkHref: string | null
  isInTable: boolean
  canUndo: boolean
  canRedo: boolean
}

type MenuItem =
  | { type: 'sep' }
  | {
      type: 'btn'
      label: string
      icon?: React.ComponentType<{ className?: string }>
      onClick: () => void
      disabled?: boolean
      destructive?: boolean
    }

interface EditorContextMenuProps {
  editor: Editor | null
}

export function EditorContextMenu({ editor }: EditorContextMenuProps): JSX.Element | null {
  const [ctx, setCtx] = useState<MenuCtx | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const linkInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)

  const dismiss = useCallback(() => {
    setCtx(null)
    setLinkMode(false)
    setLinkDraft('')
  }, [])

  // Live corner radius value for the context-menu slider (separate from ctx snapshot)
  const [liveRadius, setLiveRadius] = useState(0)
  useEffect(() => {
    if (ctx?.isOnImage) setLiveRadius(ctx.imageBorderRadius)
  }, [ctx])

  // Attach contextmenu listener to editor DOM
  useEffect(() => {
    if (!editor) return

    function onContextMenu(e: MouseEvent): void {
      e.preventDefault()
      e.stopPropagation()

      const target = e.target as HTMLElement
      const isOnImage = target.tagName === 'IMG'
      const imageSrc = isOnImage ? (target as HTMLImageElement).src : null

      // Select the image node so updateAttributes works from the context menu
      let imageBorderRadius = 0
      let isOnPageBreak = false
      const posData = editor!.view.posAtCoords({ left: e.clientX, top: e.clientY })
      if (posData) {
        const doc = editor!.view.state.doc
        for (const tryPos of [posData.inside, posData.pos, posData.pos - 1]) {
          if (tryPos < 0) continue
          try {
            const sel = NodeSelection.create(doc, tryPos)
            if (isOnImage && sel.node.type.name === 'image') {
              editor!.view.dispatch(editor!.view.state.tr.setSelection(sel))
              break
            }
            if (sel.node.type.name === 'pageBreak') {
              editor!.view.dispatch(editor!.view.state.tr.setSelection(sel))
              isOnPageBreak = true
              break
            }
          } catch { /* not a valid node selection at this pos */ }
        }
      }
      if (isOnImage && !isOnPageBreak) {
        const attrs = editor!.getAttributes('image')
        imageBorderRadius = typeof attrs.borderRadius === 'number' ? attrs.borderRadius : 0
      }

      const { state } = editor!
      const { selection } = state
      const hasSelection = !selection.empty
      const selectedText = hasSelection ? state.doc.textBetween(selection.from, selection.to, ' ') : ''

      const linkAttrs = editor!.getAttributes('link') as Record<string, unknown>
      const isOnLink = !!linkAttrs.href
      const linkHref = typeof linkAttrs.href === 'string' ? linkAttrs.href : null

      const isInTable = editor!.isActive('table')
      const canUndo = editor!.can().undo()
      const canRedo = editor!.can().redo()

      setLinkMode(false)
      setLinkDraft('')
      setCtx({
        x: e.clientX,
        y: e.clientY,
        isOnImage,
        imageSrc,
        imageBorderRadius,
        isOnPageBreak,
        hasSelection,
        selectedText,
        isOnLink,
        linkHref,
        isInTable,
        canUndo,
        canRedo,
      })
    }

    const dom = editor.view.dom as HTMLElement
    dom.addEventListener('contextmenu', onContextMenu)
    return () => dom.removeEventListener('contextmenu', onContextMenu)
  }, [editor])

  // Dismiss on Escape, click outside, window blur
  useEffect(() => {
    if (!ctx) return

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') dismiss()
    }
    function onMouseDown(e: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) dismiss()
    }
    function onBlur(): void {
      dismiss()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [ctx, dismiss])

  // Overflow correction: flip left/up if menu would overflow viewport
  useLayoutEffect(() => {
    if (!ctx || !menuRef.current) return
    const el = menuRef.current
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    if (rect.right > vw) el.style.left = `${ctx.x - rect.width}px`
    if (rect.bottom > vh) el.style.top = `${ctx.y - rect.height}px`
  }, [ctx, linkMode])

  // Focus link input when link mode opens
  useEffect(() => {
    if (linkMode) setTimeout(() => linkInputRef.current?.focus(), 0)
  }, [linkMode])

  if (!ctx || !editor) return null

  function run(fn: () => void): void {
    fn()
    dismiss()
  }

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

  async function copyImage(src: string): Promise<void> {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('load failed'))
        img.src = src
      })
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx2d = canvas.getContext('2d')!
      ctx2d.drawImage(img, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
      )
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.success('Image copied')
    } catch {
      toast.error('Failed to copy image')
    }
    dismiss()
  }

  async function saveImage(src: string): Promise<void> {
    try {
      let dataUrl = src
      if (!src.startsWith('data:')) {
        const res = await fetch(src)
        const blob = await res.blob()
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }
      await window.prose.export.saveImage(dataUrl)
    } catch {
      toast.error('Failed to save image')
    }
    dismiss()
  }

  // Build menu items
  const items: MenuItem[] = []

  if (!ctx.isOnImage) {
    items.push({ type: 'btn', label: 'Undo', icon: Undo2, disabled: !ctx.canUndo, onClick: () => run(() => editor.commands.undo()) })
    items.push({ type: 'btn', label: 'Redo', icon: Redo2, disabled: !ctx.canRedo, onClick: () => run(() => editor.commands.redo()) })
    items.push({ type: 'sep' })
    items.push({ type: 'btn', label: 'Select all', icon: MousePointerClick, onClick: () => run(() => editor.commands.selectAll()) })
    items.push({ type: 'btn', label: 'Paste', icon: Clipboard, onClick: () => run(() => { document.execCommand('paste') }) })
    items.push({ type: 'btn', label: 'Paste without formatting', icon: RemoveFormatting, onClick: () => void pasteWithoutFormatting() })

    if (!ctx.isOnPageBreak) {
      if (ctx.hasSelection) {
        items.push({ type: 'sep' })
        items.push({ type: 'btn', label: 'Cut', icon: Scissors, onClick: () => run(() => { document.execCommand('cut') }) })
        items.push({ type: 'btn', label: 'Copy', icon: Copy, onClick: () => run(() => { document.execCommand('copy') }) })
        items.push({ type: 'sep' })
        items.push({
          type: 'btn',
          label: 'Insert link',
          icon: Link2,
          onClick: () => {
            const existing = editor.getAttributes('link').href as string | undefined
            setLinkDraft(existing ?? '')
            setLinkMode(true)
          },
        })
        items.push({ type: 'btn', label: 'Clear formatting', icon: Eraser, onClick: () => run(() => editor.chain().clearNodes().unsetAllMarks().run()) })
        items.push({ type: 'sep' })
        items.push({
          type: 'btn',
          label: 'AI: Improve this selection',
          icon: Sparkles,
          onClick: () => {
            setPendingAiPrompt(`Improve this selection: "${ctx.selectedText}"`)
            setAiPanelOpen(true)
            dismiss()
          },
        })
      }

      if (ctx.isOnLink && ctx.linkHref) {
        items.push({ type: 'sep' })
        items.push({ type: 'btn', label: 'Open link', icon: ExternalLink, onClick: () => { window.open(ctx.linkHref!, '_blank'); dismiss() } })
        items.push({ type: 'btn', label: 'Copy link', icon: Link, onClick: () => { void navigator.clipboard.writeText(ctx.linkHref!); dismiss() } })
        items.push({ type: 'btn', label: 'Remove link', icon: Unlink2, onClick: () => run(() => editor.chain().focus().unsetLink().run()) })
      }

      if (ctx.isInTable) {
        items.push({ type: 'sep' })
        items.push({ type: 'btn', label: 'Insert row above', icon: ArrowUp, onClick: () => run(() => editor.chain().focus().addRowBefore().run()) })
        items.push({ type: 'btn', label: 'Insert row below', icon: ArrowDown, onClick: () => run(() => editor.chain().focus().addRowAfter().run()) })
        items.push({ type: 'btn', label: 'Insert column left', icon: ArrowLeft, onClick: () => run(() => editor.chain().focus().addColumnBefore().run()) })
        items.push({ type: 'btn', label: 'Insert column right', icon: ArrowRight, onClick: () => run(() => editor.chain().focus().addColumnAfter().run()) })
        items.push({ type: 'sep' })
        items.push({ type: 'btn', label: 'Delete row', icon: Trash2, destructive: true, onClick: () => run(() => editor.chain().focus().deleteRow().run()) })
        items.push({ type: 'btn', label: 'Delete column', icon: Trash2, destructive: true, onClick: () => run(() => editor.chain().focus().deleteColumn().run()) })
        items.push({ type: 'btn', label: 'Delete table', icon: Trash2, destructive: true, onClick: () => run(() => editor.chain().focus().deleteTable().run()) })
      }
    }
  }

  if (ctx.isOnPageBreak) {
    items.push({ type: 'sep' })
    items.push({ type: 'btn', label: 'Delete page break', icon: Trash2, destructive: true, onClick: () => run(() => editor.commands.deleteSelection()) })
  }

  // Collapse leading/trailing/consecutive separators
  const cleaned: MenuItem[] = []
  for (const item of items) {
    if (item.type === 'sep') {
      if (cleaned.length === 0 || cleaned[cleaned.length - 1]?.type === 'sep') continue
    }
    cleaned.push(item)
  }
  if (cleaned[cleaned.length - 1]?.type === 'sep') cleaned.pop()

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 9999 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {ctx.isOnImage && ctx.imageSrc ? (
        <>
          <MenuBtn icon={Copy} label="Copy image" onClick={() => { void copyImage(ctx.imageSrc!) }} />
          <MenuBtn icon={Download} label="Save image as…" onClick={() => { void saveImage(ctx.imageSrc!) }} />
          <MenuSep />
          {/* Corner radius slider */}
          <div
            className="flex flex-col gap-1.5 px-3 py-2"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <span className="text-[11px] font-medium text-muted-foreground">Corner radius</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={liveRadius}
                className="h-1.5 flex-1 accent-primary"
                onChange={(e) => {
                  const v = Number(e.target.value)
                  setLiveRadius(v)
                  editor.chain().focus().updateAttributes('image', { borderRadius: v }).run()
                }}
              />
              <span className="min-w-[28px] text-right font-sans text-[11px] text-muted-foreground">
                {liveRadius}px
              </span>
            </div>
          </div>
          <MenuSep />
          <MenuBtn icon={Trash2} label="Delete image" destructive onClick={() => run(() => editor.commands.deleteSelection())} />
        </>
      ) : linkMode ? (
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
        cleaned.map((item, i) => {
          if (item.type === 'sep') return <MenuSep key={i} />
          return (
            <MenuBtn
              key={i}
              icon={item.icon}
              label={item.label}
              disabled={item.disabled}
              destructive={item.destructive}
              onClick={item.disabled ? undefined : item.onClick}
            />
          )
        })
      )}
    </div>
  )
}

// ─── Shared primitives ────────────────────────────────────────────────────────

export function MenuSep(): JSX.Element {
  return <div className="my-1 h-px bg-border" />
}

export function MenuBtn({
  icon: Icon,
  label,
  disabled,
  destructive,
  onClick,
}: {
  icon?: React.ComponentType<{ className?: string }>
  label: string
  disabled?: boolean
  destructive?: boolean
  onClick?: () => void
}): JSX.Element {
  return (
    <button
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-40'
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={disabled ? undefined : onClick}
    >
      {Icon ? (
        <Icon className={cn('h-3.5 w-3.5 shrink-0', destructive ? 'text-destructive' : 'text-muted-foreground')} />
      ) : (
        <span className="h-3.5 w-3.5 shrink-0" />
      )}
      {label}
    </button>
  )
}
