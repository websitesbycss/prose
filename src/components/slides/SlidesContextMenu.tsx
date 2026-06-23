import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  Undo2, Redo2, MousePointerClick, Clipboard, RemoveFormatting,
  Scissors, Copy, CopyPlus, Trash2, Lock, Unlock, Group, Ungroup,
  ChevronRight, AlignHorizontalJustifyCenter, Layers, RotateCw,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  ChevronUp, ChevronDown, BringToFront, SendToBack,
  RotateCcw, FlipHorizontal, FlipVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MenuSep, MenuBtn } from '@/components/editor/EditorContextMenu'
import type { SlideElement } from '@/types/slides'
import type { OrderDirection } from './slideElementOps'

export type AlignKind = 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'dist-h' | 'dist-v'

export interface SlideContextMenuCtx {
  x: number
  y: number
  targetKind: 'canvas' | 'element'
}

interface SlidesContextMenuProps {
  ctx: SlideContextMenuCtx | null
  onDismiss(): void
  elements: SlideElement[]
  selectedIds: string[]
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  onSelectAll(): void
  onPaste(): void
  onPasteWithoutFormatting(): void
  onCut(): void
  onCopy(): void
  onDuplicate(): void
  onDelete(): void
  onAlign(type: AlignKind): void
  onOrder(direction: OrderDirection): void
  onRotateBy(deg: number): void
  onFlip(axis: 'h' | 'v'): void
  onToggleLock(): void
  onGroup(): void
  onUngroup(): void
}

type SubmenuName = 'align' | 'order' | 'rotate' | null

const ALIGN_BUTTONS: { type: AlignKind; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { type: 'left',     icon: AlignStartVertical,    label: 'Align left' },
  { type: 'center-h', icon: AlignCenterVertical,   label: 'Align center' },
  { type: 'right',    icon: AlignEndVertical,      label: 'Align right' },
  { type: 'top',       icon: AlignStartHorizontal, label: 'Align top' },
  { type: 'center-v', icon: AlignCenterHorizontal, label: 'Align middle' },
  { type: 'bottom',   icon: AlignEndHorizontal,    label: 'Align bottom' },
]

const DISTRIBUTE_BUTTONS: { type: AlignKind; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { type: 'dist-h', icon: AlignHorizontalDistributeCenter, label: 'Distribute horizontally' },
  { type: 'dist-v', icon: AlignVerticalDistributeCenter,   label: 'Distribute vertically' },
]

const ORDER_BUTTONS: { type: OrderDirection; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { type: 'back',     icon: ChevronDown,    label: 'Send backward' },
  { type: 'forward',  icon: ChevronUp,      label: 'Bring forward' },
  { type: 'back-all', icon: SendToBack,     label: 'Send to back' },
  { type: 'front',    icon: BringToFront,   label: 'Bring to front' },
]

const ROTATE_BUTTONS: { deg: number; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { deg: 90,  icon: RotateCw,  label: 'Rotate clockwise 90°' },
  { deg: 180, icon: RotateCw,  label: 'Rotate 180°' },
  { deg: 270, icon: RotateCcw, label: 'Rotate 270°' },
]

export function SlidesContextMenu({
  ctx, onDismiss, elements, selectedIds,
  canUndo, canRedo, onUndo, onRedo,
  onSelectAll, onPaste, onPasteWithoutFormatting,
  onCut, onCopy, onDuplicate, onDelete,
  onAlign, onOrder, onRotateBy, onFlip, onToggleLock, onGroup, onUngroup,
}: SlidesContextMenuProps): JSX.Element | null {
  const menuRef = useRef<HTMLDivElement>(null)
  const subMenuRef = useRef<HTMLDivElement>(null)
  const alignTrigger = useRef<HTMLButtonElement>(null)
  const orderTrigger = useRef<HTMLButtonElement>(null)
  const rotateTrigger = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [activeSubmenu, setActiveSubmenu] = useState<SubmenuName>(null)
  const [subPos, setSubPos] = useState<{ x: number; y: number } | null>(null)

  const dismiss = useCallback(() => {
    setActiveSubmenu(null)
    setSubPos(null)
    onDismiss()
  }, [onDismiss])

  // Dismiss on Escape / click outside both panels
  useEffect(() => {
    if (!ctx) return
    function onKey(e: KeyboardEvent): void { if (e.key === 'Escape') dismiss() }
    function onDown(e: MouseEvent): void {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (subMenuRef.current?.contains(t)) return
      dismiss()
    }
    function onBlur(): void { dismiss() }
    document.addEventListener('keydown', onKey)
    // Capture phase: the canvas's own mousedown handlers call stopPropagation
    // (to suppress marquee-select/drag), which would otherwise stop this from
    // ever seeing clicks on slide elements. Capture fires before that.
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [ctx, dismiss])

  // Overflow-correct the main menu
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !ctx) return
    const r = el.getBoundingClientRect()
    let x = ctx.x, y = ctx.y
    if (x + r.width > window.innerWidth - 8) x = window.innerWidth - r.width - 8
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8
    if (x < 8) x = 8
    if (y < 8) y = 8
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [ctx])

  // Overflow-correct the active submenu
  useLayoutEffect(() => {
    if (!activeSubmenu || !subMenuRef.current || !subPos) return
    const trigger = activeSubmenu === 'align' ? alignTrigger.current : activeSubmenu === 'order' ? orderTrigger.current : rotateTrigger.current
    const el = subMenuRef.current
    const r = el.getBoundingClientRect()
    let { x, y } = subPos
    if (x + r.width > window.innerWidth - 8) x = (trigger?.getBoundingClientRect().left ?? x) - r.width - 4
    if (y + r.height > window.innerHeight - 8) y = window.innerHeight - r.height - 8
    el.style.left = `${x}px`
    el.style.top = `${y}px`
  }, [activeSubmenu, subPos])

  function openSubmenu(name: SubmenuName, trigger: HTMLButtonElement | null): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    if (!trigger) return
    const r = trigger.getBoundingClientRect()
    setSubPos({ x: r.right + 4, y: r.top })
    setActiveSubmenu(name)
  }

  function scheduleClose(): void {
    closeTimer.current = setTimeout(() => setActiveSubmenu(null), 120)
  }

  function cancelClose(): void {
    if (closeTimer.current) clearTimeout(closeTimer.current)
  }

  if (!ctx) return null

  function run(fn: () => void): void {
    fn()
    dismiss()
  }

  const selectedEls = elements.filter((e) => selectedIds.includes(e.id))
  const isGroup = selectedEls.length > 1 && selectedEls.every((e) => e.groupId && e.groupId === selectedEls[0]!.groupId)
  const isMulti = selectedEls.length > 1 && !isGroup
  const hasSelection = selectedEls.length > 0
  const allLocked = hasSelection && selectedEls.every((e) => e.locked)

  const variant: 'canvas' | 'single' | 'multi' | 'group' =
    ctx.targetKind === 'canvas' || !hasSelection ? 'canvas' : isGroup ? 'group' : isMulti ? 'multi' : 'single'

  // ── Submenus ─────────────────────────────────────────────────────────────────

  const alignMenu = activeSubmenu === 'align' && subPos ? (
    <div
      ref={subMenuRef}
      style={{ position: 'fixed', top: subPos.y, left: subPos.x, zIndex: 10000 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ALIGN_BUTTONS.map(({ type, icon, label }) => (
        <MenuBtn key={type} icon={icon} label={label} onClick={() => run(() => onAlign(type))} />
      ))}
      {variant === 'multi' && (
        <>
          <MenuSep />
          {DISTRIBUTE_BUTTONS.map(({ type, icon, label }) => (
            <MenuBtn key={type} icon={icon} label={label} onClick={() => run(() => onAlign(type))} />
          ))}
        </>
      )}
    </div>
  ) : null

  const orderMenu = activeSubmenu === 'order' && subPos ? (
    <div
      ref={subMenuRef}
      style={{ position: 'fixed', top: subPos.y, left: subPos.x, zIndex: 10000 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ORDER_BUTTONS.map(({ type, icon, label }) => (
        <MenuBtn key={type} icon={icon} label={label} onClick={() => run(() => onOrder(type))} />
      ))}
    </div>
  ) : null

  const rotateMenu = activeSubmenu === 'rotate' && subPos ? (
    <div
      ref={subMenuRef}
      style={{ position: 'fixed', top: subPos.y, left: subPos.x, zIndex: 10000 }}
      className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
      onMouseEnter={cancelClose}
      onMouseLeave={scheduleClose}
      onMouseDown={(e) => e.preventDefault()}
    >
      {ROTATE_BUTTONS.map(({ deg, icon, label }) => (
        <MenuBtn key={deg} icon={icon} label={label} onClick={() => run(() => onRotateBy(deg))} />
      ))}
      <MenuSep />
      <MenuBtn icon={FlipHorizontal} label="Flip horizontally" onClick={() => run(() => onFlip('h'))} />
      <MenuBtn icon={FlipVertical} label="Flip vertically" onClick={() => run(() => onFlip('v'))} />
    </div>
  ) : null

  function SubmenuTrigger({
    name, triggerRef, icon: Icon, label,
  }: {
    name: SubmenuName
    triggerRef: React.RefObject<HTMLButtonElement>
    icon: React.ComponentType<{ className?: string }>
    label: string
  }): JSX.Element {
    return (
      <button
        ref={triggerRef}
        data-submenu-trigger="true"
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted/50',
          activeSubmenu === name && 'bg-muted/50',
        )}
        onMouseEnter={() => openSubmenu(name, triggerRef.current)}
        onMouseLeave={scheduleClose}
        onMouseDown={(e) => e.preventDefault()}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {label}
        <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
      </button>
    )
  }

  return createPortal(
    <>
      <div
        ref={menuRef}
        style={{ position: 'fixed', top: ctx.y, left: ctx.x, zIndex: 9999 }}
        className="min-w-[200px] rounded-lg border border-border bg-background py-1 text-[13px] shadow-lg"
        onMouseDown={(e) => e.preventDefault()}
        onMouseOver={(e) => {
          // Close any open submenu the instant the cursor is over something in
          // the main menu that isn't a submenu trigger — no hover-out delay.
          if (!activeSubmenu) return
          if ((e.target as HTMLElement).closest('[data-submenu-trigger]')) return
          cancelClose()
          setActiveSubmenu(null)
        }}
      >
        <MenuBtn icon={Undo2} label="Undo" disabled={!canUndo} onClick={() => run(onUndo)} />
        <MenuBtn icon={Redo2} label="Redo" disabled={!canRedo} onClick={() => run(onRedo)} />
        <MenuSep />
        <MenuBtn icon={MousePointerClick} label="Select all" onClick={() => run(onSelectAll)} />
        <MenuBtn icon={Clipboard} label="Paste" onClick={() => run(onPaste)} />
        <MenuBtn icon={RemoveFormatting} label="Paste without formatting" onClick={() => run(onPasteWithoutFormatting)} />

        {variant !== 'canvas' && (
          <>
            <MenuSep />
            <MenuBtn icon={Scissors} label="Cut" onClick={() => run(onCut)} />
            <MenuBtn icon={Copy} label="Copy" onClick={() => run(onCopy)} />
            <MenuBtn icon={CopyPlus} label="Duplicate" onClick={() => run(onDuplicate)} />
            <MenuSep />
            <SubmenuTrigger name="align" triggerRef={alignTrigger} icon={AlignHorizontalJustifyCenter} label="Align" />
            <SubmenuTrigger name="order" triggerRef={orderTrigger} icon={Layers} label="Order" />
            <SubmenuTrigger name="rotate" triggerRef={rotateTrigger} icon={RotateCw} label="Rotate" />
            <MenuSep />
            <MenuBtn
              icon={allLocked ? Unlock : Lock}
              label={allLocked ? 'Unlock' : 'Lock'}
              onClick={() => run(onToggleLock)}
            />
            {variant === 'multi' && <MenuBtn icon={Group} label="Group" onClick={() => run(onGroup)} />}
            {variant === 'group' && <MenuBtn icon={Ungroup} label="Ungroup" onClick={() => run(onUngroup)} />}
            <MenuSep />
            <MenuBtn
              icon={Trash2}
              label={variant === 'single' ? 'Delete element' : variant === 'group' ? 'Delete group' : 'Delete elements'}
              destructive
              onClick={() => run(onDelete)}
            />
          </>
        )}
      </div>
      {alignMenu}
      {orderMenu}
      {rotateMenu}
    </>,
    document.body,
  )
}
