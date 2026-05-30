import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Pin, Pencil, Download, FolderOpen, Trash2, ChevronRight, Plus, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Document, Category } from '@/types'
import { MenuSep, MenuBtn } from '@/components/editor/EditorContextMenu'

const CATEGORY_COLORS = [
  '#7F77DD', '#E879A0', '#34D399', '#FBBF24',
  '#60A5FA', '#F87171', '#A78BFA', '#2DD4BF',
]


export interface DocContextMenuProps {
  doc: Document | null
  pinned: boolean
  categories: Category[]
  position: { x: number; y: number } | null
  onDismiss: () => void
  onPin: () => void
  onRename: () => void
  onDelete: () => void
  onExport: () => void
  onSetCategory: (categoryId: string | null) => Promise<void>
  onCreateCategory: (name: string, color: string) => Promise<void>
}

export function DocContextMenu({
  doc, pinned, categories, position,
  onDismiss, onPin, onRename, onDelete, onExport, onSetCategory, onCreateCategory,
}: DocContextMenuProps): JSX.Element | null {
  const menuRef        = useRef<HTMLDivElement>(null)
  const catTrigger     = useRef<HTMLButtonElement>(null)
  const catMenuRef     = useRef<HTMLDivElement>(null)
  const closeTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [activeSubmenu, setActiveSubmenu] = useState<'category' | null>(null)
  const [catPos, setCatPos]               = useState<{ x: number; y: number } | null>(null)
  const [addingCat, setAddingCat]         = useState(false)
  const [newCatName, setNewCatName]       = useState('')
  const [newCatColor, setNewCatColor]     = useState(CATEGORY_COLORS[0]!)
  const catInputRef = useRef<HTMLInputElement>(null)

  const dismiss = useCallback(() => {
    setActiveSubmenu(null)
    setAddingCat(false)
    setNewCatName('')
    setNewCatColor(CATEGORY_COLORS[0]!)
    onDismiss()
  }, [onDismiss])

  // Dismiss on Escape / click outside all panels
  useEffect(() => {
    if (!position) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') dismiss() }
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (catMenuRef.current?.contains(t)) return
      dismiss()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [position, dismiss])

  // Focus category name input when addingCat opens
  useEffect(() => {
    if (addingCat) setTimeout(() => catInputRef.current?.focus(), 0)
  }, [addingCat])

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

  // Overflow-correct category submenu after it mounts
  useLayoutEffect(() => {
    if (activeSubmenu !== 'category' || !catMenuRef.current || !catPos) return
    const el = catMenuRef.current
    const r  = el.getBoundingClientRect()
    let { x, y } = catPos
    if (x + r.width  > window.innerWidth  - 8) x = (catTrigger.current?.getBoundingClientRect().left ?? x) - r.width - 4
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8
    el.style.left = `${x}px`
    el.style.top  = `${y}px`
  }, [activeSubmenu, catPos, addingCat]) // re-run when form toggles (height changes)

  function openSubmenu(name: 'category') {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    const trigger = catTrigger.current
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    setCatPos({ x: r.right + 4, y: r.top })
    setActiveSubmenu(name)
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setActiveSubmenu(null), 120)
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  async function handleCreateCategory() {
    const name = newCatName.trim()
    if (!name) return
    await onCreateCategory(name, newCatColor)
    setAddingCat(false)
    setNewCatName('')
    setNewCatColor(CATEGORY_COLORS[0]!)
  }

  if (!position || !doc) return null

  // ── Submenus ────────────────────────────────────────────────────────────────

  const exportMenu = null

  const catMenu = activeSubmenu === 'category' && catPos ? (
    <div
      ref={catMenuRef}
      style={{ position: 'fixed', top: catPos.y, left: catPos.x, zIndex: 10000 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onMouseDown={(e) => { if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}
    >
      {/* Add category inline form */}
      {addingCat ? (
        <div className="flex flex-col gap-2 px-3 py-2">
          <input
            ref={catInputRef}
            className="h-7 w-full rounded border border-input bg-background px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
            placeholder="Category name"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreateCategory()
              if (e.key === 'Escape') setAddingCat(false)
            }}
          />
          <div className="flex flex-wrap gap-1 px-0.5">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => setNewCatColor(color)}
                className="h-4 w-4 rounded-full transition-all"
                style={{
                  backgroundColor: color,
                  outline: newCatColor === color ? `2px solid ${color}` : '2px solid transparent',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              disabled={!newCatName.trim()}
              className="flex-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              onClick={() => void handleCreateCategory()}
            >
              Add
            </button>
            <button
              className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50"
              onClick={() => setAddingCat(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <MenuBtn icon={Plus} label="Add category" onClick={() => setAddingCat(true)} />
      )}

      {categories.length > 0 && <MenuSep />}

      {categories.map((cat) => (
        <button
          key={cat.id}
          className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50"
          onClick={() => {
            void onSetCategory(doc.categoryId === cat.id ? null : cat.id)
            dismiss()
          }}
        >
          <span className="flex w-3.5 shrink-0 items-center justify-center">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
          </span>
          <span className="flex-1 truncate">{cat.name}</span>
          {doc.categoryId === cat.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </button>
      ))}
    </div>
  ) : null

  // ── Main menu ────────────────────────────────────────────────────────────────

  return createPortal(
    <>
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

        {/* Add to category… */}
        <button
          ref={catTrigger}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50',
            activeSubmenu === 'category' && 'bg-muted/50'
          )}
          onMouseEnter={() => openSubmenu('category')}
          onMouseLeave={scheduleClose}
          onMouseDown={(e) => e.preventDefault()}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          Add to category…
          <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <MenuSep />
        <MenuBtn
          icon={Trash2}
          label="Delete"
          destructive
          onClick={() => { onDelete(); dismiss() }}
        />
      </div>
      {exportMenu}
      {catMenu}
    </>,
    document.body
  )
}
