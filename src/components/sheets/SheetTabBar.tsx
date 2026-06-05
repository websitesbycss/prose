import { useState, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SheetTab } from '@/types/sheet'

interface SheetTabBarProps {
  tabs: SheetTab[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  onAddTab: () => void
  onRenameTab: (tabId: string, name: string) => void
  onDeleteTab: (tabId: string) => void
}

export function SheetTabBar({
  tabs,
  activeTabId,
  onTabChange,
  onAddTab,
  onRenameTab,
  onDeleteTab,
}: SheetTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startRename = (tab: SheetTab, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingId(tab.id)
    setEditValue(tab.name)
    setTimeout(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    }, 0)
  }

  const commitRename = () => {
    if (editingId && editValue.trim()) {
      onRenameTab(editingId, editValue.trim())
    }
    setEditingId(null)
  }

  return (
    <div className="flex h-9 shrink-0 items-end border-t border-border bg-muted/20 pl-1">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            className={cn(
              'group relative flex max-w-[160px] cursor-pointer select-none items-center gap-1 rounded-t-md border-l border-r border-t px-3 py-1 text-xs transition-colors',
              isActive
                ? 'border-border bg-background text-foreground'
                : 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground'
            )}
            onClick={() => onTabChange(tab.id)}
            onDoubleClick={(e) => startRename(tab, e)}
          >
            {editingId === tab.id ? (
              <input
                ref={inputRef}
                className="w-20 min-w-0 bg-transparent text-xs text-foreground outline-none"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{tab.name}</span>
            )}
            {tabs.length > 1 && (
              <button
                className="ml-0.5 hidden shrink-0 rounded p-0.5 hover:bg-muted group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteTab(tab.id)
                }}
                tabIndex={-1}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )
      })}
      <button
        className="mb-0.5 ml-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onAddTab}
        title="Add sheet"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
