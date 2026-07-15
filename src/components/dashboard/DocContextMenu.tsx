import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Pin, Pencil, Download, Trash2 } from 'lucide-react'
import type { Document } from '@/types'
import { MenuSep, MenuBtn } from '@/components/editor/EditorContextMenu'

export interface DocContextMenuProps {
  doc: Document | null
  pinned: boolean
  position: { x: number; y: number } | null
  onDismiss: () => void
  onPin: () => void
  onRename: () => void
  onDelete: () => void
  onExport: () => void
}

export function DocContextMenu({
  doc, pinned, position,
  onDismiss, onPin, onRename, onDelete, onExport,
}: DocContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)

  const dismiss = useCallback(() => {
    onDismiss()
  }, [onDismiss])

  // Dismiss on Escape / click outside
  useEffect(() => {
    if (!position) return
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') dismiss() }
    function onDown(e: MouseEvent): void {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      dismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [position, dismiss])

  // Overflow-correct main menu
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !position) return
    const r = el.getBoundingClientRect()
    let x = position.x, y = position.y
    if (x + r.width  > window.innerWidth  - 8) x = window.innerWidth  - r.width  - 8
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    el.style.left = `${x}px`
    el.style.top  = `${y}px`
  }, [position])

  if (!position || !doc) return null

  // ── Main menu ────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: position.y, left: position.x, zIndex: 9999 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseDown={(e) => e.preventDefault()}
    >
      <MenuBtn
        icon={Pin}
        label={pinned ? 'Unpin' : 'Pin'}
        onClick={() => { onPin(); dismiss() }}
      />
      <MenuBtn
        icon={Pencil}
        label="Rename"
        onClick={() => { onRename(); dismiss() }}
      />
      <MenuSep />

      {/* Export… */}
      <MenuBtn
        icon={Download}
        label="Export…"
        onClick={() => { onExport(); dismiss() }}
      />

      <MenuSep />
      <MenuBtn
        icon={Trash2}
        label="Delete"
        destructive
        onClick={() => { onDelete(); dismiss() }}
      />
    </div>,
    document.body
  )
}
