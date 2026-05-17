import { useEffect, useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { toast } from 'sonner'

interface MenuCtx {
  x: number
  y: number
  isOnImage: boolean
  imageSrc: string | null
  hasSelection: boolean
  selectedText: string
  isOnLink: boolean
  linkHref: string | null
  isInTable: boolean
  isInHeaderRole: boolean
  canUndo: boolean
  canRedo: boolean
}

type MenuItem =
  | { type: 'sep' }
  | {
      type: 'btn'
      label: string
      onClick: () => void
      disabled?: boolean
      destructive?: boolean
    }

interface EditorContextMenuProps {
  editor: Editor | null
}

export function EditorContextMenu({ editor }: EditorContextMenuProps): JSX.Element | null {
  const [ctx, setCtx] = useState<MenuCtx | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)

  const dismiss = useCallback(() => setCtx(null), [])

  // Attach contextmenu listener to editor DOM
  useEffect(() => {
    if (!editor) return

    function onContextMenu(e: MouseEvent): void {
      e.preventDefault()
      e.stopPropagation()

      const target = e.target as HTMLElement
      const isOnImage = target.tagName === 'IMG'
      const imageSrc = isOnImage ? (target as HTMLImageElement).src : null

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

      const $pos = state.doc.resolve(state.selection.from)
      const role = $pos.parent.attrs.role as string | undefined
      const isInHeaderRole = role === 'mla-header' || role === 'apa-header'

      setCtx({
        x: e.clientX,
        y: e.clientY,
        isOnImage,
        imageSrc,
        hasSelection,
        selectedText,
        isOnLink,
        linkHref,
        isInTable,
        isInHeaderRole,
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
  }, [ctx])

  if (!ctx || !editor) return null

  function run(fn: () => void): void {
    fn()
    dismiss()
  }

  async function copyImage(src: string): Promise<void> {
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      toast.success('Image copied')
    } catch {
      toast.error('Failed to copy image')
    }
    dismiss()
  }

  async function saveImage(src: string): Promise<void> {
    try {
      // Convert to base64 data URL if it's a blob/object URL
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

  if (ctx.isOnImage && ctx.imageSrc) {
    // Image-exclusive menu
    items.push({
      type: 'btn',
      label: 'Copy image',
      onClick: () => { void copyImage(ctx.imageSrc!) },
    })
    items.push({
      type: 'btn',
      label: 'Save image as…',
      onClick: () => { void saveImage(ctx.imageSrc!) },
    })
    items.push({ type: 'sep' })
    items.push({
      type: 'btn',
      label: 'Delete image',
      destructive: true,
      onClick: () => run(() => editor.commands.deleteSelection()),
    })
  } else {
    // Standard menu
    items.push({
      type: 'btn',
      label: 'Undo',
      disabled: !ctx.canUndo,
      onClick: () => run(() => editor.commands.undo()),
    })
    items.push({
      type: 'btn',
      label: 'Redo',
      disabled: !ctx.canRedo,
      onClick: () => run(() => editor.commands.redo()),
    })
    items.push({ type: 'sep' })
    items.push({
      type: 'btn',
      label: 'Select all',
      onClick: () => run(() => editor.commands.selectAll()),
    })
    items.push({
      type: 'btn',
      label: 'Paste',
      onClick: () => {
        run(() => {
          document.execCommand('paste')
        })
      },
    })
    if (ctx.isInHeaderRole) {
      items.push({
        type: 'btn',
        label: 'Insert page number',
        onClick: () => run(() => editor.chain().focus().insertPageNumber().run()),
      })
    }

    if (ctx.hasSelection) {
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'Cut',
        onClick: () => run(() => { document.execCommand('cut') }),
      })
      items.push({
        type: 'btn',
        label: 'Copy',
        onClick: () => run(() => { document.execCommand('copy') }),
      })
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'Clear formatting',
        onClick: () => run(() => editor.chain().clearNodes().unsetAllMarks().run()),
      })
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'AI: Improve this selection',
        onClick: () => {
          setPendingAiPrompt(`Improve this selection: "${ctx.selectedText}"`)
          setAiPanelOpen(true)
          dismiss()
        },
      })
    }

    if (ctx.isOnLink && ctx.linkHref) {
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'Open link',
        onClick: () => {
          window.open(ctx.linkHref!, '_blank')
          dismiss()
        },
      })
      items.push({
        type: 'btn',
        label: 'Copy link',
        onClick: () => {
          void navigator.clipboard.writeText(ctx.linkHref!)
          dismiss()
        },
      })
      items.push({
        type: 'btn',
        label: 'Remove link',
        onClick: () => run(() => editor.chain().focus().unsetLink().run()),
      })
    }

    if (ctx.isInTable) {
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'Insert row above',
        onClick: () => run(() => editor.chain().focus().addRowBefore().run()),
      })
      items.push({
        type: 'btn',
        label: 'Insert row below',
        onClick: () => run(() => editor.chain().focus().addRowAfter().run()),
      })
      items.push({
        type: 'btn',
        label: 'Insert column left',
        onClick: () => run(() => editor.chain().focus().addColumnBefore().run()),
      })
      items.push({
        type: 'btn',
        label: 'Insert column right',
        onClick: () => run(() => editor.chain().focus().addColumnAfter().run()),
      })
      items.push({ type: 'sep' })
      items.push({
        type: 'btn',
        label: 'Delete row',
        destructive: true,
        onClick: () => run(() => editor.chain().focus().deleteRow().run()),
      })
      items.push({
        type: 'btn',
        label: 'Delete column',
        destructive: true,
        onClick: () => run(() => editor.chain().focus().deleteColumn().run()),
      })
      items.push({
        type: 'btn',
        label: 'Delete table',
        destructive: true,
        onClick: () => run(() => editor.chain().focus().deleteTable().run()),
      })
    }
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
      className="min-w-[160px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {cleaned.map((item, i) => {
        if (item.type === 'sep') {
          return <div key={i} className="my-1 h-px bg-border" />
        }
        return (
          <button
            key={i}
            disabled={item.disabled}
            className={cn(
              'flex w-full items-center px-3 py-1.5 text-left transition-colors',
              item.destructive
                ? 'text-destructive hover:bg-destructive/10'
                : 'text-foreground hover:bg-muted/50',
              item.disabled && 'cursor-not-allowed opacity-40'
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={item.disabled ? undefined : item.onClick}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
