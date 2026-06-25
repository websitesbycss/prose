import { useState, useRef, useEffect } from 'react'
import { Home, Plus, X, FileText, Table2, Shapes, GalleryVerticalEnd } from 'lucide-react'
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
  slides: GalleryVerticalEnd,
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
  mode: 'strip' | 'detached' | 'windowMove'
  tabWidths: Map<string, number>
  tabGap: number
  stripLeft: number
  originIdx: number
  visualInsertIdx: number
}

function tabShiftOffset(tabIndex: number, fromIdx: number, insertIdx: number, slot: number): number {
  if (fromIdx < insertIdx) {
    if (tabIndex > fromIdx && tabIndex < insertIdx) return -slot
  } else if (fromIdx > insertIdx) {
    if (tabIndex >= insertIdx && tabIndex < fromIdx) return slot
  }
  return 0
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
  const insertDocumentTab   = useAppStore((s) => s.insertDocumentTab)
  const setTabOrder         = useAppStore((s) => s.setTabOrder)
  const saveActiveDocument  = useAppStore((s) => s.saveActiveDocument)
  const setNewDocumentModalOpen = useAppStore((s) => s.setNewDocumentModalOpen)

  const [pickerOpen, setPickerOpen] = useState(false)

  // localTabs: display order during a drag; null = use the store's openTabs.
  const [localTabs, setLocalTabs] = useState<OpenDocumentTab[] | null>(null)
  // Which tab is currently being dragged (for opacity fade-out when detached).
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [isDetached, setIsDetached] = useState(false)
  const [dragDeltaX, setDragDeltaX] = useState(0)
  const [visualInsertIdx, setVisualInsertIdx] = useState<number | null>(null)
  const [externalDropIdx, setExternalDropIdx] = useState<number | null>(null)
  const [dropIndicatorLeft, setDropIndicatorLeft] = useState(0)

  const tabStripRef = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragInfo | null>(null)

  const displayTabs = localTabs ?? openTabs
  const isDragging = draggingId !== null

  // Report tab-bar screen bounds for cross-window merge during tear-off
  useEffect(() => {
    const el = tabStripRef.current
    if (!el || !window.prose.tabdrag?.registerTabBarBounds) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.prose.tabdrag.registerTabBarBounds({
        x: Math.round(r.left + window.screenX),
        y: Math.round(r.top + window.screenY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      })
    }
    report()
    window.addEventListener('resize', report)
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => {
      window.removeEventListener('resize', report)
      ro.disconnect()
    }
  }, [openTabs.length, displayTabs.length])

  useEffect(() => {
    if (!window.prose.tabdrag?.onMerge) return
    return window.prose.tabdrag.onMerge(({ docId, screenX }) => {
      const insertIdx =
        typeof screenX === 'number'
          ? computeInsertIdxFromClientX(screenX - window.screenX)
          : openTabs.length
      void window.prose.documents.getById(docId).then((doc) => {
        if (!doc) return
        insertDocumentTab({
          id: doc.id,
          title: doc.title,
          format: doc.format,
          fileType: (doc as { fileType?: string }).fileType as import('@/types').FileType | undefined ?? 'document',
        }, insertIdx)
      })
    })
  }, [insertDocumentTab, openTabs.length])

  useEffect(() => {
    if (!window.prose.tabdrag?.onDropHover) return
    return window.prose.tabdrag.onDropHover(({ active, screenX }) => {
      if (!active) {
        setExternalDropIdx(null)
        return
      }
      if (typeof screenX === 'number') {
        const idx = computeInsertIdxFromClientX(screenX - window.screenX)
        setExternalDropIdx(idx)
        updateDropIndicator(idx)
      }
    })
  }, [openTabs.length])

  function computeInsertIdxFromClientX(clientX: number): number {
    const items = Array.from(
      tabStripRef.current?.querySelectorAll<HTMLElement>('.document-tab-item') ?? [],
    )
    if (items.length === 0) return 0
    let x = items[0]!.getBoundingClientRect().left
    const gap =
      items.length >= 2
        ? items[1]!.getBoundingClientRect().left -
          (items[0]!.getBoundingClientRect().left + items[0]!.getBoundingClientRect().width)
        : 4
    for (let i = 0; i < items.length; i++) {
      const w = items[i]!.getBoundingClientRect().width
      if (clientX < x + w / 2) return i
      x += w + Math.max(gap, 0)
    }
    return items.length
  }

  function updateDropIndicator(insertIdx: number): void {
    const strip = tabStripRef.current
    const items = Array.from(strip?.querySelectorAll<HTMLElement>('.document-tab-item') ?? [])
    if (!strip || items.length === 0) {
      setDropIndicatorLeft(0)
      return
    }
    const stripLeft = strip.getBoundingClientRect().left
    if (insertIdx >= items.length) {
      const last = items[items.length - 1]!
      setDropIndicatorLeft(last.getBoundingClientRect().right - stripLeft)
    } else {
      setDropIndicatorLeft(items[insertIdx]!.getBoundingClientRect().left - stripLeft)
    }
  }

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

  function commitReorder(d: DragInfo): void {
    const others = openTabs.filter((t) => t.id !== d.tabId)
    const moved = openTabs[d.originIdx]
    if (!moved) return
    const next = [...others.slice(0, d.visualInsertIdx), moved, ...others.slice(d.visualInsertIdx)]
    setTabOrder(next.map((t) => t.id))
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
    const originIdx = openTabs.findIndex((t) => t.id === tab.id)

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
      originIdx,
      visualInsertIdx: originIdx,
    }
    setLocalTabs([...openTabs])
    setDraggingId(tab.id)
    setDragDeltaX(0)
    setVisualInsertIdx(originIdx)
    document.body.style.userSelect = 'none'
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
      setDragDeltaX(e.clientX - d.startX)
      const idx = computeInsertIdx(e.clientX, d)
      if (idx !== d.visualInsertIdx) {
        d.visualInsertIdx = idx
        setVisualInsertIdx(idx)
      }
    }
  }

  function endDrag(): void {
    document.body.style.userSelect = ''
    dragRef.current = null
    setDraggingId(null)
    setIsDetached(false)
    setLocalTabs(null)
    setDragDeltaX(0)
    setVisualInsertIdx(null)
  }

  function handlePointerUp(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return

    if (!d.hasMoved) {
      void handleSelectTab(tabId)
      endDrag()
      return
    }
    if (d.mode === 'windowMove') {
      window.prose.win.stopMove()
      endDrag()
      return
    }
    if (d.mode === 'detached') {
      window.prose.tabdrag.finalize({ screenX: e.screenX, screenY: e.screenY })
      endDrag()
      return
    }
    commitReorder(d)
    endDrag()
  }

  function handlePointerCancel(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return
    if (d.mode === 'detached') window.prose.tabdrag.cancel()
    if (d.mode === 'windowMove') window.prose.win.stopMove()
    endDrag()
  }

  // ── IPC listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    const unsubReturn = window.prose.tabdrag.onReturn(({ screenX }) => {
      const d = dragRef.current
      if (!d || d.mode !== 'detached') return
      d.mode = 'strip'
      setIsDetached(false)
      const idx = computeInsertIdx(screenX - window.screenX, d)
      d.visualInsertIdx = idx
      setVisualInsertIdx(idx)
      setDragDeltaX(screenX - window.screenX - d.startX)
    })
    const unsubDetached = window.prose.tabdrag.onDetached(({ docId }) => {
      const tabs = useAppStore.getState().openTabs
      const wasLastTab = tabs.length === 1 && tabs[0]?.id === docId
      closeDocumentTab(docId)
      if (wasLastTab) void window.prose.win.close()
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
        <div
          ref={tabStripRef}
          className="document-tab-strip relative min-w-0 flex-1"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            // Only handle clicks in the empty space (not on tabs, close buttons, or the + button)
            if ((e.target as HTMLElement).closest('.document-tab-item, .document-tab-strip__new')) return
            e.preventDefault()
            window.prose.win.startMove({
              offsetX: e.screenX - window.screenX,
              offsetY: e.screenY - window.screenY,
            })
            const onUp = (): void => {
              window.prose.win.stopMove()
              window.removeEventListener('pointerup', onUp)
            }
            window.addEventListener('pointerup', onUp)
          }}
        >
          {externalDropIdx !== null && (
            <div
              className="pointer-events-none absolute bottom-1 top-1 z-40 w-0.5 rounded-full bg-primary"
              style={{ left: dropIndicatorLeft }}
            />
          )}
          <AnimatePresence initial={false} mode="popLayout">
            {displayTabs.map((tab, tabIndex) => {
              const isActive = !showDashboard && tab.id === activeDocumentId
              const isDraggingThis = tab.id === draggingId
              const d = dragRef.current
              // Other tabs shift by the DRAGGED tab's width (the space it
              // vacates/occupies as it moves past them) — not by their own.
              const slot = d ? (d.tabWidths.get(d.tabId) ?? 100) + d.tabGap : 0
              const originIdx = d?.originIdx ?? tabIndex
              const insertIdx = visualInsertIdx ?? originIdx
              const shift = isDragging && !isDraggingThis
                ? tabShiftOffset(tabIndex, originIdx, insertIdx, slot)
                : 0
              const translateX = isDraggingThis ? dragDeltaX : shift

              return (
                // Two layers on purpose: Motion takes ownership of `transform` on
                // any element where it animates scale/x/y (it writes the combined
                // transform itself on every frame, silently clobbering a `style.
                // transform` we set on the same node). The live drag shift below
                // must win every frame, so it lives on a plain inner div that
                // Motion never touches — the outer motion.div keeps doing the
                // mount/exit pop and the post-drop layout-reorder FLIP animation.
                <motion.div
                  key={tab.id}
                  layout={!isDragging}
                  className="document-tab-item"
                  style={{ zIndex: isDraggingThis ? 30 : undefined, position: 'relative' }}
                  transition={{ duration: 0.13, ease: [0.25, 0.1, 0.25, 1] }}
                  initial={isDragging ? false : { opacity: 0, scale: 0.88, x: -6 }}
                  animate={{ opacity: isDraggingThis && isDetached ? 0 : 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.88, x: -6 }}
                  onPointerDown={(e) => handlePointerDown(tab, e)}
                  onPointerMove={(e) => handlePointerMove(tab.id, e)}
                  onPointerUp={(e) => handlePointerUp(tab.id, e)}
                  onPointerCancel={(e) => handlePointerCancel(tab.id, e)}
                >
                  <div
                    style={{
                      width: '100%',
                      transform: isDragging ? `translateX(${translateX}px)` : undefined,
                      transition: isDraggingThis ? 'none' : 'transform 180ms cubic-bezier(0,0,0.2,1)',
                    }}
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
