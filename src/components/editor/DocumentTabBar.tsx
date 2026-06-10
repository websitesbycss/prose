import { useState, useRef, useEffect } from 'react'
import { Home, Plus, X, FileText, Table2, Shapes, PanelLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TabPickerPopover } from '@/components/editor/TabPickerPopover'
import { FORMAT_LABELS } from '@/lib/documentFormat'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { OpenDocumentTab } from '@/store/appStore'

const TAB_TYPE_ICONS = {
  document: FileText,
  sheet: Table2,
  board: Shapes,
  slides: PanelLeft,
} as const

const TAB_TYPE_STROKE_WIDTH: Record<string, number> = {
  document: 1.75,
  sheet: 2.5,
  board: 2,
  slides: 2,
}

interface DocumentTabBarProps {
  activeDocumentId?: string | null
  editingTitle?: boolean
  draftTitle?: string
  onDraftTitleChange?: (v: string) => void
  onStartTitleEdit?: () => void
  onCommitTitleEdit?: () => void
  onCancelTitleEdit?: () => void
}

// ── Internal drag-state tracked in a ref so pointer-move updates don't
//    trigger React re-renders for every mouse pixel.
interface DragInfo {
  tabId: string
  pointerId: number
  startX: number
  startY: number
  hasMoved: boolean
  // Which of the three drag modes we're in:
  mode: 'strip'       // reordering within the tab bar
       | 'detached'   // tear-off to a new window (multi-tab)
       | 'windowMove' // dragging moves the current window (single-tab)
  // Snapshot taken on pointerdown so insert-index is computed from stable
  // values rather than mid-animation DOM positions.
  tabWidths: Map<string, number>  // id → pixel width of each tab item
  tabGap: number                  // pixel gap between consecutive tab items
  stripLeft: number               // left edge of the tab strip element
  insertIdx: number               // current computed insert index into "others"
}

// ── Tab content (label + format badge, or rename input) ──────────────────────

function TabContent({
  tab,
  active: _active,
  editing,
  draftTitle,
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
}: {
  tab: OpenDocumentTab
  active: boolean
  editing?: boolean
  draftTitle?: string
  onDraftChange?: (v: string) => void
  onCommitEdit?: () => void
  onCancelEdit?: () => void
}): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  if (editing) {
    return (
      <span className="document-tab__label">
        <input
          ref={inputRef}
          className="document-tab__input"
          value={draftTitle ?? tab.title}
          onChange={(e) => onDraftChange?.(e.target.value)}
          onBlur={() => onCommitEdit?.()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitEdit?.()
            if (e.key === 'Escape') onCancelEdit?.()
            e.stopPropagation()
          }}
        />
      </span>
    )
  }

  const formatLabel = FORMAT_LABELS[tab.format]
  const fileType = tab.fileType ?? 'document'
  const TypeIcon = TAB_TYPE_ICONS[fileType] ?? FileText
  return (
    <span className="document-tab__label">
      <TypeIcon className="h-3 w-3 shrink-0 opacity-50" strokeWidth={TAB_TYPE_STROKE_WIDTH[fileType] ?? 2} />
      <span className="document-tab__title">{tab.title}</span>
      {fileType === 'document' && formatLabel && <span className="document-tab__format">{formatLabel}</span>}
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function DocumentTabBar({
  activeDocumentId: activeDocumentIdProp,
  editingTitle,
  draftTitle,
  onDraftTitleChange,
  onStartTitleEdit,
  onCommitTitleEdit,
  onCancelTitleEdit,
}: DocumentTabBarProps): JSX.Element {
  const openTabs            = useAppStore((s) => s.openTabs)
  const storeActiveId       = useAppStore((s) => s.activeDocumentId)
  const activeDocumentId    = activeDocumentIdProp ?? storeActiveId
  const showDashboard       = useAppStore((s) => s.showDashboard)
  const goToDashboard       = useAppStore((s) => s.goToDashboard)
  const activateDocumentTab = useAppStore((s) => s.activateDocumentTab)
  const closeDocumentTab    = useAppStore((s) => s.closeDocumentTab)
  const setTabOrder         = useAppStore((s) => s.setTabOrder)
  const saveActiveDocument  = useAppStore((s) => s.saveActiveDocument)
  const setNewDocumentModalOpen = useAppStore((s) => s.setNewDocumentModalOpen)

  const [pickerOpen, setPickerOpen] = useState(false)

  // localTabs: display order during a drag; null = use the store's openTabs.
  const [localTabs, setLocalTabs] = useState<OpenDocumentTab[] | null>(null)
  // Which tab is currently being dragged (for opacity fade-out when detached).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Whether we're in tear-off (detach) mode.
  const [isDetached, setIsDetached] = useState(false)

  const tabStripRef = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragInfo | null>(null)

  const displayTabs = localTabs ?? openTabs

  // ── Insert-index computation ────────────────────────────────────────────
  // Uses snapshotted widths + gap so it never reads mid-animation DOM state.
  // "others" = displayTabs in their CURRENT logical order, minus the dragging tab.

  function computeInsertIdx(clientX: number, d: DragInfo): number {
    const others = displayTabs.filter((t) => t.id !== d.tabId)
    let x = d.stripLeft
    for (let i = 0; i < others.length; i++) {
      const w = d.tabWidths.get(others[i]!.id) ?? 100
      if (clientX < x + w / 2) return i
      x += w + d.tabGap
    }
    return others.length
  }

  // Apply a new insert index → rebuild localTabs with the dragging tab inserted there.
  function applyInsertIdx(newIdx: number, d: DragInfo): void {
    if (newIdx === d.insertIdx) return
    d.insertIdx = newIdx
    const base = localTabs ?? openTabs
    const others = base.filter((t) => t.id !== d.tabId)
    const dragging = base.find((t) => t.id === d.tabId)!
    const next = [...others.slice(0, newIdx), dragging, ...others.slice(newIdx)]
    setLocalTabs(next)
  }

  // ── Pointer handlers ────────────────────────────────────────────────────

  function handlePointerDown(tab: OpenDocumentTab, e: React.PointerEvent): void {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('.document-tab__close')) return
    if ((e.target as HTMLElement).tagName === 'INPUT') return

    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)

    // Snapshot stable geometry for the insert-index computation.
    const items = Array.from(
      tabStripRef.current?.querySelectorAll<HTMLElement>('.document-tab-item') ?? [],
    )
    const tabWidths = new Map<string, number>()
    openTabs.forEach((t, i) => {
      tabWidths.set(t.id, items[i]?.getBoundingClientRect().width ?? 100)
    })
    const tabGap =
      items.length >= 2
        ? items[1]!.getBoundingClientRect().left -
          (items[0]!.getBoundingClientRect().left + (tabWidths.get(openTabs[0]!.id) ?? 100))
        : 4
    const stripLeft = items[0]?.getBoundingClientRect().left ?? 0
    const insertIdx = openTabs.findIndex((t) => t.id === tab.id)

    dragRef.current = {
      tabId: tab.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false,
      mode: 'strip',
      tabWidths,
      tabGap: Math.max(tabGap, 0),
      stripLeft,
      insertIdx,
    }
    setLocalTabs([...openTabs])
    setDraggingId(tab.id)
  }

  function handlePointerMove(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return

    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.hasMoved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return
    d.hasMoved = true

    const stripRect = tabStripRef.current?.getBoundingClientRect()
    const THRESHOLD = 30
    const inStrip =
      !stripRect ||
      (e.clientY >= stripRect.top - THRESHOLD && e.clientY <= stripRect.bottom + THRESHOLD)

    if (!inStrip && d.mode === 'strip') {
      if (openTabs.length <= 1) {
        // Single tab: move the window instead of creating a new one.
        d.mode = 'windowMove'
        window.prose.win.startMove({
          offsetX: e.screenX - window.screenX,
          offsetY: e.screenY - window.screenY,
        })
      } else {
        // Multi-tab: tear off to new window.
        d.mode = 'detached'
        setIsDetached(true)
        window.prose.tabdrag.detach(tabId)
      }
    } else if (inStrip && d.mode === 'detached') {
      d.mode = 'strip'
      setIsDetached(false)
      window.prose.tabdrag.cancel()
    } else if (inStrip && d.mode === 'windowMove') {
      // Window-move is a one-way transition; don't cancel mid-drag.
    }

    if (d.mode === 'strip') {
      applyInsertIdx(computeInsertIdx(e.clientX, d), d)
    }
  }

  function handlePointerUp(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return

    if (!d.hasMoved) {
      void handleSelectTab(tabId)
    } else if (d.mode === 'windowMove') {
      window.prose.win.stopMove()
    } else if (d.mode === 'detached') {
      window.prose.tabdrag.finalize()
      closeDocumentTab(tabId)
    } else {
      if (localTabs) setTabOrder(localTabs.map((t) => t.id))
    }

    dragRef.current = null
    setDraggingId(null)
    setIsDetached(false)
    setLocalTabs(null)
  }

  function handlePointerCancel(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return
    if (d.mode === 'detached') window.prose.tabdrag.cancel()
    if (d.mode === 'windowMove') window.prose.win.stopMove()
    dragRef.current = null
    setDraggingId(null)
    setIsDetached(false)
    setLocalTabs(null)
  }

  // ── IPC listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubReturn = window.prose.tabdrag.onReturn(({ screenX }) => {
      const d = dragRef.current
      if (!d || d.mode !== 'detached') return
      d.mode = 'strip'
      setIsDetached(false)
      // Re-enter strip mode: compute insert position from returned cursor X.
      applyInsertIdx(computeInsertIdx(screenX - window.screenX, d), d)
    })
    const unsubDetached = window.prose.tabdrag.onDetached(({ docId }) => {
      closeDocumentTab(docId)
    })
    return () => { unsubReturn(); unsubDetached() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab actions ──────────────────────────────────────────────────────────

  async function handleSelectTab(id: string): Promise<void> {
    if (id === activeDocumentId && !showDashboard) return
    await saveActiveDocument?.()
    activateDocumentTab(id)
  }

  async function handleCloseTab(id: string, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    if (id === activeDocumentId) await saveActiveDocument?.()
    closeDocumentTab(id)
  }

  async function handleHome(): Promise<void> {
    await saveActiveDocument?.()
    goToDashboard()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'document-tab-bar__home h-7 w-7 shrink-0',
          showDashboard && 'document-tab-bar__home--active',
        )}
        onClick={handleHome}
        title="Dashboard"
      >
        <Home className="h-3.5 w-3.5" />
      </Button>

      {openTabs.length > 0 && (
        <div ref={tabStripRef} className="document-tab-strip min-w-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {displayTabs.map((tab) => {
              const isActive = !showDashboard && tab.id === activeDocumentId
              const isDraggingThis = tab.id === draggingId

              return (
                <motion.div
                  key={tab.id}
                  layout
                  className="document-tab-item"
                  style={{ originX: 0 }}
                  // Layout animation gives the smooth "tabs slide to make room"
                  // effect.  We keep it at a short fixed duration so other tabs
                  // animate in during the drag but the response still feels snappy.
                  transition={{ duration: 0.13, ease: [0.25, 0.1, 0.25, 1] }}
                  initial={{ opacity: 0, scale: 0.88, x: -6 }}
                  animate={{
                    opacity: isDraggingThis && isDetached ? 0 : 1,
                    scale: 1,
                    x: 0,
                  }}
                  exit={{ opacity: 0, scale: 0.88, x: -6 }}
                  onPointerDown={(e) => handlePointerDown(tab, e)}
                  onPointerMove={(e) => handlePointerMove(tab.id, e)}
                  onPointerUp={(e) => handlePointerUp(tab.id, e)}
                  onPointerCancel={(e) => handlePointerCancel(tab.id, e)}
                >
                  <div
                    className={cn('document-tab', isActive && 'document-tab--active')}
                    onDoubleClick={() => {
                      if (isActive && onStartTitleEdit) onStartTitleEdit()
                    }}
                  >
                    <TabContent
                      tab={tab}
                      active={isActive}
                      editing={isActive && editingTitle}
                      draftTitle={draftTitle}
                      onDraftChange={onDraftTitleChange}
                      onCommitEdit={onCommitTitleEdit}
                      onCancelEdit={onCancelTitleEdit}
                    />
                    <button
                      type="button"
                      className="document-tab__close"
                      aria-label={`Close ${tab.title}`}
                      onClick={(e) => { void handleCloseTab(tab.id, e) }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="document-tab-strip__new" title="Open file">
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" sideOffset={4} collisionPadding={8} className="z-[300] w-auto p-0">
              <TabPickerPopover
                onOpenDocument={() => setPickerOpen(false)}
                onNewDocument={() => { setPickerOpen(false); setNewDocumentModalOpen(true) }}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  )
}
