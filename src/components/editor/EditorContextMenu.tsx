import { useEffect, useRef, useLayoutEffect, useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import { toast } from 'sonner'

interface MenuCtx {
  x: number
  y: number
  isOnImage: boolean
  imageSrc: string | null
  imageBorderRadius: number
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
      if (isOnImage) {
        const posData = editor!.view.posAtCoords({ left: e.clientX, top: e.clientY })
        if (posData) {
          const doc = editor!.view.state.doc
          for (const tryPos of [posData.inside, posData.pos, posData.pos - 1]) {
            if (tryPos < 0) continue
            try {
              const sel = NodeSelection.create(doc, tryPos)
              if (sel.node.type.name === 'image') {
                editor!.view.dispatch(editor!.view.state.tr.setSelection(sel))
                break
              }
            } catch { /* not a valid node selection at this pos */ }
          }
        }
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

      const $pos = state.doc.resolve(state.selection.from)
      const role = $pos.parent.attrs.role as string | undefined
      const isInHeaderRole = role === 'mla-header' || role === 'apa-header'

      setCtx({
        x: e.clientX,
        y: e.clientY,
        isOnImage,
        imageSrc,
        imageBorderRadius,
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

  if (!ctx.isOnImage) {
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
      className="min-w-[180px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      {ctx.isOnImage && ctx.imageSrc ? (
        <>
          <button
            className="flex w-full items-center px-3 py-1.5 text-left text-foreground transition-colors hover:bg-muted/50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { void copyImage(ctx.imageSrc!) }}
          >
            Copy image
          </button>
          <button
            className="flex w-full items-center px-3 py-1.5 text-left text-foreground transition-colors hover:bg-muted/50"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { void saveImage(ctx.imageSrc!) }}
          >
            Save image as…
          </button>
          <div className="my-1 h-px bg-border" />
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
          <div className="my-1 h-px bg-border" />
          <button
            className="flex w-full items-center px-3 py-1.5 text-left text-destructive transition-colors hover:bg-destructive/10"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(() => editor.commands.deleteSelection())}
          >
            Delete image
          </button>
        </>
      ) : (
        cleaned.map((item, i) => {
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
        })
      )}
    </div>
  )
}
