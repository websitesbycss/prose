import { useState, useRef } from 'react'
import { Plus, X, ZoomIn, ZoomOut, ChevronDown, Music, SlidersVertical } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { SaveStatus } from '@/hooks/useDocument'

interface TabInfo {
  id: string
  name: string
}

interface SheetTabBarProps {
  tabs: TabInfo[]
  activeTabId: string
  onTabChange: (tabId: string) => void
  onAddTab: () => void
  onRenameTab: (tabId: string, name: string) => void
  onDeleteTab: (tabId: string) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  saveStatus: SaveStatus
  nowPlaying?: string | null
  ambientPlaying?: string | null
}

const ZOOM_MIN = 10
const ZOOM_MAX = 400
const ZOOM_STEP = 10
const ZOOM_PRESETS = [50, 75, 100, 125, 150, 200]

function ZoomControls({ zoom, onZoomChange }: { zoom: number; onZoomChange(z: number): void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  function clamp(v: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
  }

  function apply(val: string): void {
    const n = parseInt(val)
    if (!isNaN(n)) onZoomChange(clamp(n))
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className="text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onZoomChange(clamp(zoom - ZOOM_STEP))}
        title="Zoom out (Ctrl+-)"
      >
        <ZoomOut className="h-3 w-3" />
      </button>

      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={1}
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="zoom-slider w-20"
        title={`Zoom: ${zoom}%`}
      />

      <div className="flex items-center gap-0.5">
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onZoomChange(clamp(zoom + ZOOM_STEP))}
          title="Zoom in (Ctrl+=)"
        >
          <ZoomIn className="h-3 w-3" />
        </button>

        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) setDraft(String(zoom))
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-0.5 tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              title="Set zoom level"
            >
              <span className="w-8 text-right">{zoom}%</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-20 p-1"
            side="top"
            align="end"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Input
              className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply(draft)
                if (e.key === 'Escape') setOpen(false)
              }}
            />
            <div className="flex flex-col">
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p}
                  className={cn(
                    'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                    zoom === p && 'bg-accent/50 font-medium'
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    onZoomChange(p)
                    setOpen(false)
                  }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export function SheetTabBar({
  tabs,
  activeTabId,
  onTabChange,
  onAddTab,
  onRenameTab,
  onDeleteTab,
  zoom,
  onZoomChange,
  saveStatus,
  nowPlaying,
  ambientPlaying,
}: SheetTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)

  const saveLabel =
    saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Save failed'
    : ''

  const startRename = (tab: TabInfo, e: React.MouseEvent) => {
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
    <div className="flex h-7 shrink-0 items-center border-t border-border bg-muted/20 px-1 text-[11px] text-muted-foreground">
      {/* Left: scrollable sheet tabs */}
      <div className="flex min-w-0 flex-1 items-end overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              className={cn(
                'group relative flex max-w-[160px] shrink-0 cursor-pointer select-none items-center gap-1 rounded-t-md border-l border-r border-t px-2 py-0.5 text-xs transition-colors',
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
          className="mb-0.5 ml-1 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={onAddTab}
          title="Add sheet"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Right: zoom + music + save */}
      <div className="flex shrink-0 items-center gap-3 pl-4 pr-2">
        <ZoomControls zoom={zoom} onZoomChange={onZoomChange} />
        {nowPlaying && (
          <button
            onClick={() => { setMusicPanelTab('tracks'); setMusicPanelOpen(!musicPanelOpen) }}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
            title="Open music panel"
          >
            <Music className="h-2.5 w-2.5" />
            {nowPlaying}
          </button>
        )}
        {ambientPlaying && (
          <button
            onClick={() => { setMusicPanelTab('ambient'); setMusicPanelOpen(!musicPanelOpen) }}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
            title="Open ambient mixer"
          >
            <SlidersVertical className="h-2.5 w-2.5" />
            {ambientPlaying}
          </button>
        )}
        {saveLabel && (
          <span className={saveStatus === 'error' ? 'text-destructive' : undefined}>{saveLabel}</span>
        )}
      </div>
    </div>
  )
}
