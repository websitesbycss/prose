import { useState, useRef, useEffect, useCallback } from 'react'
import { Home, Plus, X } from 'lucide-react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TabPickerPopover } from '@/components/editor/TabPickerPopover'
import { FORMAT_LABELS } from '@/lib/documentFormat'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { OpenDocumentTab } from '@/store/appStore'

interface DocumentTabBarProps {
  activeDocumentId?: string | null
  editingTitle?: boolean
  draftTitle?: string
  onDraftTitleChange?: (v: string) => void
  onStartTitleEdit?: () => void
  onCommitTitleEdit?: () => void
  onCancelTitleEdit?: () => void
  saveIndicator?: string
}

const TAB_MOTION = {
  initial: { opacity: 0, scale: 0.88, x: -6 },
  animate: { opacity: 1, scale: 1, x: 0 },
  exit: { opacity: 0, scale: 0.88, x: -6 },
  transition: { duration: 0.14, ease: [0.25, 0.1, 0.25, 1] as const },
}

function DocumentTab({
  tab,
  active,
  onSelect,
  onClose,
  onStartEdit,
  editing,
  draftTitle,
  onDraftChange,
  onCommitEdit,
  onCancelEdit,
}: {
  tab: OpenDocumentTab
  active: boolean
  onSelect(): void
  onClose(e: React.MouseEvent): void
  onStartEdit?(): void
  editing?: boolean
  draftTitle?: string
  onDraftChange?: (v: string) => void
  onCommitEdit?: () => void
  onCancelEdit?: () => void
}): JSX.Element {
  const formatLabel = FORMAT_LABELS[tab.format]
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  return (
    <div className={cn('document-tab', active && 'document-tab--active')}>
      <button
        type="button"
        className="document-tab__label"
        onClick={onSelect}
        onDoubleClick={(e) => {
          if (active && onStartEdit) { e.preventDefault(); onStartEdit() }
        }}
        title={active ? 'Double-click to rename' : tab.title}
      >
        {editing ? (
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
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <span className="document-tab__title">{tab.title}</span>
            {formatLabel && <span className="document-tab__format">{formatLabel}</span>}
          </>
        )}
      </button>
      <button
        type="button"
        className="document-tab__close"
        aria-label={`Close ${tab.title}`}
        onClick={onClose}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function DocumentTabBar({
  activeDocumentId,
  editingTitle,
  draftTitle,
  onDraftTitleChange,
  onStartTitleEdit,
  onCommitTitleEdit,
  onCancelTitleEdit,
  saveIndicator,
}: DocumentTabBarProps): JSX.Element {
  const openTabs          = useAppStore((s) => s.openTabs)
  const showDashboard     = useAppStore((s) => s.showDashboard)
  const goToDashboard     = useAppStore((s) => s.goToDashboard)
  const activateDocumentTab  = useAppStore((s) => s.activateDocumentTab)
  const closeDocumentTab     = useAppStore((s) => s.closeDocumentTab)
  const insertDocumentTab    = useAppStore((s) => s.insertDocumentTab)
  const saveActiveDocument   = useAppStore((s) => s.saveActiveDocument)
  const setNewDocumentModalOpen = useAppStore((s) => s.setNewDocumentModalOpen)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [dropIndex, setDropIndex]   = useState<number | null>(null)
  const tabStripRef = useRef<HTMLDivElement>(null)

  // Convert a screen-X coordinate to a tab-strip insert index.
  const getDropIndex = useCallback((screenX: number): number => {
    if (!tabStripRef.current) return openTabs.length
    const clientX = screenX - window.screenX
    const items = tabStripRef.current.querySelectorAll<HTMLElement>('.document-tab-item')
    for (let i = 0; i < items.length; i++) {
      const r = items[i]!.getBoundingClientRect()
      if (clientX < r.left + r.width / 2) return i
    }
    return openTabs.length
  }, [openTabs.length])

  // IPC listeners for cross-window drag events.
  useEffect(() => {
    const tabdrag = window.prose.tabdrag
    if (!tabdrag) return

    const unsubHover = tabdrag.onHover(({ inside, screenX }) => {
      setDropIndex(inside ? getDropIndex(screenX) : null)
    })

    const unsubAccept = tabdrag.onAccept(async ({ docId, screenX }) => {
      setDropIndex(null)
      const idx = getDropIndex(screenX)
      try {
        const doc = await window.prose.documents.getById(docId)
        if (!doc) return
        insertDocumentTab({ id: doc.id, title: doc.title, format: doc.format }, idx)
      } catch { /* ignore */ }
    })

    const unsubDetached = tabdrag.onDetached(({ docId }) => {
      closeDocumentTab(docId)
    })

    return () => { unsubHover(); unsubAccept(); unsubDetached() }
  }, [getDropIndex, insertDocumentTab, closeDocumentTab])

  function handleTabDragStart(docId: string, e: React.DragEvent): void {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', docId)
    window.prose.tabdrag?.start(docId)
  }

  function handleTabDragEnd(docId: string, e: React.DragEvent): void {
    window.prose.tabdrag?.end({ docId, screenX: e.screenX, screenY: e.screenY })
  }

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

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-visible">
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
            {openTabs.map((tab, index) => {
              const isActive = !showDashboard && tab.id === activeDocumentId
              return (
                <motion.div
                  key={tab.id}
                  layout
                  className="document-tab-item"
                  style={{ originX: 0 }}
                  initial={TAB_MOTION.initial}
                  animate={TAB_MOTION.animate}
                  exit={TAB_MOTION.exit}
                  transition={TAB_MOTION.transition}
                  draggable
                  onDragStart={(e) => handleTabDragStart(tab.id, e as unknown as React.DragEvent)}
                  onDragEnd={(e) => handleTabDragEnd(tab.id, e as unknown as React.DragEvent)}
                >
                  {dropIndex === index && <div className="document-tab-drop-zone" />}
                  <DocumentTab
                    tab={tab}
                    active={isActive}
                    editing={isActive && editingTitle}
                    draftTitle={draftTitle}
                    onDraftChange={onDraftTitleChange}
                    onStartEdit={onStartTitleEdit}
                    onCommitEdit={onCommitTitleEdit}
                    onCancelEdit={onCancelTitleEdit}
                    onSelect={() => handleSelectTab(tab.id)}
                    onClose={(e) => handleCloseTab(tab.id, e)}
                  />
                </motion.div>
              )
            })}
            {dropIndex === openTabs.length && <div key="drop-end" className="document-tab-drop-zone" />}
          </AnimatePresence>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="document-tab-strip__new" title="Open document">
                <Plus className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" side="bottom" className="w-auto p-0">
              <TabPickerPopover
                onOpenDocument={() => setPickerOpen(false)}
                onNewDocument={() => { setPickerOpen(false); setNewDocumentModalOpen(true) }}
              />
            </PopoverContent>
          </Popover>
        </div>
      )}

      {saveIndicator && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{saveIndicator}</span>
      )}
    </div>
  )
}
