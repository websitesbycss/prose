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
  grabOffsetX: number
  grabOffsetY: number
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
  const barRootRef    = useRef<HTMLDivElement>(null)
  const dragRef     = useRef<DragInfo | null>(null)
  const screenOffsetRef = useRef({ x: 0, y: 0 })

  const displayTabs = localTabs ?? openTabs
  const isDragging = draggingId !== null
  const isSingleTab = openTabs.length <= 1

  function screenXToClientX(screenX: number): number {
    return screenX - screenOffsetRef.current.x
  }

  function armWindowMoveStop(): void {
    const onUp = (): void => {
      window.prose.win.stopMove()
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointerup', onUp)
  }

  function startWindowMoveFromEvent(e: { screenX: number; screenY: number }): void {
    window.prose.win.startMove({
      offsetX: e.screenX - screenOffsetRef.current.x,
      offsetY: e.screenY - screenOffsetRef.current.y,
    })
    armWindowMoveStop()
  }

  // Window screen origin for accurate merge hit-testing (frameless windows).
  useEffect(() => {
    const update = (): void => {
      void window.prose.win.getContentScreenOffset?.().then((o) => {
        screenOffsetRef.current = o
      })
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Report tab-bar screen bounds for cross-window merge during tear-off
  useEffect(() => {
    const el = barRootRef.current
    if (!el || !window.prose.tabdrag?.registerTabBarBounds) return
    const report = (): void => {
      const r = el.getBoundingClientRect()
      window.prose.tabdrag.registerTabBarBounds({
        left: Math.round(r.left),
        top: Math.round(r.top),
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
          ? computeInsertIdxFromClientX(screenXToClientX(screenX))
          : openTabs.length
      void window.prose.documents.getById(docId).then((doc) => {
        if (!doc) return
        insertDocumentTab({
          id: doc.id,
          title: doc.title,
          format: doc.format,
          fileType: doc.fileType ?? 'document',
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
        const idx = computeInsertIdxFromClientX(screenXToClientX(screenX))
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

  function updateInternalDropIndicator(insertIdx: number): void {
    const strip = tabStripRef.current
    if (!strip) return
    const items = Array.from(strip.querySelectorAll<HTMLElement>('.document-tab-item'))
      .filter((el) => !el.classList.contains('document-tab-item--dragging'))
    const stripLeft = strip.getBoundingClientRect().left
    if (items.length === 0) { setDropIndicatorLeft(0); return }
    if (insertIdx >= items.length) {
      setDropIndicatorLeft(items[items.length - 1]!.getBoundingClientRect().right - stripLeft)
    } else {
      setDropIndicatorLeft(items[insertIdx]!.getBoundingClientRect().left - stripLeft)
    }
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

  // Retargeting only happens once the cursor is close to where the drop
  // line would actually render — not the instant it crosses some tab's
  // midpoint — so the indicator tracks the mouse itself instead of jumping
  // around based on the dragged tab's own (possibly off-center) edges.
  const REORDER_SNAP_THRESHOLD = 25

  function computeInsertIdx(clientX: number, d: DragInfo): number {
    const others = displayTabs.filter((t) => t.id !== d.tabId)
    // boundaries[i] is the x position of the drop line for inserting at index i.
    const boundaries: number[] = [d.stripLeft]
    let x = d.stripLeft
    for (let i = 0; i < others.length; i++) {
      x += (d.tabWidths.get(others[i]!.id) ?? 100) + d.tabGap
      boundaries.push(x)
    }

    let closestIdx = 0
    let closestDist = Infinity
    for (let i = 0; i < boundaries.length; i++) {
      const dist = Math.abs(clientX - boundaries[i]!)
      if (dist < closestDist) { closestDist = dist; closestIdx = i }
    }
    return closestDist <= REORDER_SNAP_THRESHOLD ? closestIdx : d.visualInsertIdx
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
    const tabRect = items[originIdx]?.getBoundingClientRect()
    const grabOffsetX = tabRect ? e.clientX - tabRect.left : 0
    const grabOffsetY = tabRect ? e.clientY - tabRect.top : 0

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
      grabOffsetX,
      grabOffsetY,
    }
    // Deliberately NOT setting draggingId/localTabs/visualInsertIdx here — that
    // flips on the drop-indicator line and dims the tab's opacity immediately,
    // which flashed on every plain click before the 4px move threshold below
    // ever ran. Those visual-drag states now only turn on in handlePointerMove,
    // the first time real movement is detected.
  }

  function handlePointerMove(tabId: string, e: React.PointerEvent): void {
    const d = dragRef.current
    if (!d || d.tabId !== tabId || d.pointerId !== e.pointerId) return

    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.hasMoved) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      d.hasMoved = true
      setLocalTabs([...openTabs])
      setDraggingId(d.tabId)
      setVisualInsertIdx(d.originIdx)
      document.body.style.userSelect = 'none'
    }

    const stripRect = tabStripRef.current?.getBoundingClientRect()
    const THRESHOLD = 30
    const inStrip =
      !stripRect ||
      (e.clientY >= stripRect.top - THRESHOLD && e.clientY <= stripRect.bottom + THRESHOLD)

    // Single tab within strip: move the window. Outside strip: allow detach for cross-window merging.
    if (isSingleTab && inStrip) {
      if (d.mode === 'detached') { window.prose.tabdrag.cancel(); setIsDetached(false); d.mode = 'strip' }
      if (d.mode !== 'windowMove') {
        d.mode = 'windowMove'
        setDraggingId(null)
        setLocalTabs(null)
        setDragDeltaX(0)
        setVisualInsertIdx(null)
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch { /* ignore */ }
        startWindowMoveFromEvent(e)
      }
      return
    }
    if (isSingleTab && d.mode === 'windowMove') return  // once window-moving, stay that way

    if (!inStrip && d.mode === 'strip') {
      d.mode = 'detached'
      setIsDetached(true)
      void (async () => {
        if (tabId === activeDocumentId && saveActiveDocument) await saveActiveDocument()
        window.prose.tabdrag.detach(tabId, { grabOffsetX: d.grabOffsetX, grabOffsetY: d.grabOffsetY })
      })()
    } else if (inStrip && d.mode === 'detached') {
      d.mode = 'strip'
      setIsDetached(false)
      window.prose.tabdrag.cancel()
    }

    if (d.mode === 'strip') {
      setDragDeltaX(e.clientX - d.startX)
      const idx = computeInsertIdx(e.clientX, d)
      if (idx !== d.visualInsertIdx) {
        d.visualInsertIdx = idx
        setVisualInsertIdx(idx)
      }
      updateInternalDropIndicator(idx)
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
      handleSelectTab(tabId)
      endDrag()
      return
    }
    if (d.mode === 'windowMove') {
      window.prose.win.stopMove()
      if (isSingleTab) {
        const tabId2 = d.tabId
        void (async () => {
          if (tabId2 === activeDocumentId && saveActiveDocument) await saveActiveDocument()
          window.prose.tabdrag.checkMerge?.({ screenX: e.screenX, screenY: e.screenY, docId: tabId2 })
        })()
      }
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
      const idx = computeInsertIdx(screenXToClientX(screenX), d)
      d.visualInsertIdx = idx
      setVisualInsertIdx(idx)
      setDragDeltaX(screenXToClientX(screenX) - d.startX)
    })
    const unsubDetached = window.prose.tabdrag.onDetached(({ docId }) => {
      void (async () => {
        const tabs = useAppStore.getState().openTabs
        const wasLastTab = tabs.length === 1 && tabs[0]?.id === docId
        const saveFn = useAppStore.getState().saveActiveDocument
        if (docId === useAppStore.getState().activeDocumentId && saveFn) {
          await saveFn()
        }
        closeDocumentTab(docId)
        if (wasLastTab) void window.prose.win.close()
      })()
    })
    return () => { unsubReturn(); unsubDetached() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Tab actions ──────────────────────────────────────────────────────────

  // Tab chrome switches immediately — the previous document's save is fired
  // (its synchronous flush captures the content to write) but never awaited,
  // so a slow disk write can't stall the switch. Editors stay mounted-but-hidden
  // (see EditorTabHost's HiddenTabPane), so there's normally nothing to wait on
  // anyway; any real load time shows up inside that editor's own content area.
  function handleSelectTab(id: string): void {
    if (id === activeDocumentId && !showDashboard) return
    void saveActiveDocument?.()
    activateDocumentTab(id)
  }

  function handleCloseTab(id: string, e: React.MouseEvent): void {
    e.stopPropagation()
    if (id === activeDocumentId) void saveActiveDocument?.()
    closeDocumentTab(id)
  }

  function handleHome(): void {
    void saveActiveDocument?.()
    goToDashboard()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={barRootRef}
      className={cn('flex min-w-0 flex-1 items-center gap-1.5', isDragging ? 'overflow-visible' : 'overflow-hidden')}
    >
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
          className={cn('document-tab-strip relative min-w-0 flex-1', isDragging && 'document-tab-strip--dragging')}
          onPointerDown={(e) => {
            if (e.button !== 0) return
            // Only handle clicks in the empty space (not on tabs, close buttons, or the + button)
            if ((e.target as HTMLElement).closest('.document-tab-item, .document-tab-strip__new')) return
            e.preventDefault()
            startWindowMoveFromEvent(e)
          }}
        >
          {(externalDropIdx !== null || (isDragging && visualInsertIdx !== null && !isDetached)) && (
            <div
              className="pointer-events-none absolute bottom-1 top-1 z-40 w-0.5 rounded-full bg-primary"
              style={{ left: dropIndicatorLeft }}
            />
          )}
          <AnimatePresence initial={false} mode="popLayout">
            {displayTabs.map((tab) => {
              const isActive = !showDashboard && tab.id === activeDocumentId
              const isDraggingThis = tab.id === draggingId
              const translateX = isDraggingThis ? dragDeltaX : 0
              const isShifting = false

              return (
                <motion.div
                  key={tab.id}
                  layout={isDragging ? false : 'position'}
                  className={cn(
                    'document-tab-item',
                    isDraggingThis && 'document-tab-item--dragging',
                    isShifting && 'document-tab-item--shifting',
                  )}
                  style={{ position: 'relative' }}
                  transition={{ duration: 0.13, ease: [0.25, 0.1, 0.25, 1] }}
                  initial={isDragging ? false : { opacity: 0, scale: 0.88, x: -6 }}
                  animate={{ opacity: isDraggingThis && isDetached ? 0 : isDraggingThis ? 0.55 : 1, scale: 1, x: 0 }}
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
                        onClick={(e) => handleCloseTab(tab.id, e)}
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

      {/* Draggable title-bar fill: right of tabs → window controls (Chrome-style). */}
      <div
        className="title-bar-drag-fill"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          startWindowMoveFromEvent(e)
        }}
      />
    </div>
  )
}
