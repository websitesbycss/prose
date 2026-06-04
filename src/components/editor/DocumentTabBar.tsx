import { useState, useRef, useEffect, Fragment } from 'react'
import { Home, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TabPickerPopover } from '@/components/editor/TabPickerPopover'
import { FORMAT_LABELS } from '@/lib/documentFormat'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { OpenDocumentTab } from '@/store/appStore'

interface DocumentTabBarProps {
  /** Active document title editing — only for the active tab in the editor */
  activeDocumentId?: string | null
  editingTitle?: boolean
  draftTitle?: string
  onDraftTitleChange?: (v: string) => void
  onStartTitleEdit?: () => void
  onCommitTitleEdit?: () => void
  onCancelTitleEdit?: () => void
  saveIndicator?: string
}

/** Vertical rule — horizontal spacing comes from the parent flex gap. */
function TabDivider(): JSX.Element {
  return (
    <div className="flex h-8 shrink-0 items-center" aria-hidden>
      <div className="h-4 w-px bg-border" />
    </div>
  )
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
    <div
      className={cn(
        'group relative flex h-8 max-w-[200px] shrink-0 items-center rounded-md border text-xs transition-colors',
        active
          ? 'border-border bg-background text-foreground shadow-sm'
          : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-1.5 pl-2.5 pr-1 py-1"
        onClick={onSelect}
        onDoubleClick={(e) => {
          if (active && onStartEdit) {
            e.preventDefault()
            onStartEdit()
          }
        }}
        title={active ? 'Double-click to rename' : tab.title}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent text-xs font-medium outline-none"
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
          <span className="truncate font-medium">{tab.title}</span>
        )}
        {!editing && formatLabel && (
          <Badge variant="secondary" className="h-4 shrink-0 px-1 text-[9px] leading-none">
            {formatLabel}
          </Badge>
        )}
      </button>
      <button
        type="button"
        className={cn(
          'mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors',
          'opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100',
          active && 'opacity-70',
        )}
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
  const openTabs = useAppStore((s) => s.openTabs)
  const showDashboard = useAppStore((s) => s.showDashboard)
  const goToDashboard = useAppStore((s) => s.goToDashboard)
  const activateDocumentTab = useAppStore((s) => s.activateDocumentTab)
  const closeDocumentTab = useAppStore((s) => s.closeDocumentTab)
  const saveActiveDocument = useAppStore((s) => s.saveActiveDocument)
  const setNewDocumentModalOpen = useAppStore((s) => s.setNewDocumentModalOpen)

  const [pickerOpen, setPickerOpen] = useState(false)

  function handleSelectTab(id: string): void {
    if (id === activeDocumentId && !showDashboard) return
    void saveActiveDocument?.()
    activateDocumentTab(id)
  }

  function handleCloseTab(id: string, e: React.MouseEvent): void {
    e.stopPropagation()
    if (id === activeDocumentId) {
      void saveActiveDocument?.()
    }
    closeDocumentTab(id)
  }

  function handleHome(): void {
    void saveActiveDocument?.()
    goToDashboard()
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-8 w-8 shrink-0', showDashboard && 'bg-accent text-accent-foreground')}
        onClick={handleHome}
        title="Dashboard"
      >
        <Home className="h-4 w-4" />
      </Button>

      {openTabs.length > 0 && <TabDivider />}

      <div className="flex min-w-0 flex-1 items-center overflow-hidden">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {openTabs.map((tab, index) => {
            const isActive = !showDashboard && tab.id === activeDocumentId
            const prevTab = index > 0 ? openTabs[index - 1] : undefined
            const prevActive =
              prevTab !== undefined && !showDashboard && prevTab.id === activeDocumentId
            const showDivider = index > 0 && !isActive && !prevActive

            return (
              <Fragment key={tab.id}>
                {showDivider && <TabDivider />}
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
              </Fragment>
            )
          })}

          {openTabs.length > 0 && <TabDivider />}

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                title="Open document"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" side="bottom" className="w-auto p-0">
              <TabPickerPopover
                onOpenDocument={() => setPickerOpen(false)}
                onNewDocument={() => {
                  setPickerOpen(false)
                  setNewDocumentModalOpen(true)
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {saveIndicator && (
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{saveIndicator}</span>
      )}
    </div>
  )
}
