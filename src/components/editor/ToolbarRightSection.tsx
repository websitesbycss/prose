import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  Sun, Moon, Sparkles, Music, MoreHorizontal,
  Search, Download, Maximize2, Settings,
  RotateCcw, Trash2, HelpCircle, Grid3X3,
} from 'lucide-react'
import { BoardExportModal } from '@/components/boards/BoardExportModal'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { PageMargins } from '@/types'
import ExportModal from '@/components/editor/ExportModal'

// ── Shared menu item ─────────────────────────────────────────────────────────

function MenuItem({
  icon: Icon,
  label,
  shortcut,
  danger,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  danger?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-foreground hover:bg-accent',
      )}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">{shortcut}</span>
      )}
    </button>
  )
}

function MenuSep(): JSX.Element {
  return <div className="my-1 h-px bg-border" />
}

// ── Three-dots dropdown ───────────────────────────────────────────────────────

interface ThreeDotsProps {
  fileType: 'document' | 'sheet' | 'board' | 'slides'
  documentId: string | null
  documentTitle?: string
  documentMargins?: PageMargins | null
  onFindOpen?: () => void
  onFocusMode?: () => void
  onSettingsOpen?: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI?: any
  // Sheet-specific
  onSheetExport?: () => void
  // Slides-specific
  onSlidesFind?: () => void
  onSlidesExport?: () => void
  onSlidesPresent?: () => void
  onSlidesToggleGrid?: () => void
  slidesGridActive?: boolean
}

function ThreeDotsMenu({
  fileType,
  documentId,
  documentTitle,
  documentMargins,
  onFindOpen,
  onFocusMode,
  onSettingsOpen,
  excalidrawAPI,
  onSheetExport,
  onSlidesFind,
  onSlidesExport,
  onSlidesPresent,
  onSlidesToggleGrid,
  slidesGridActive,
}: ThreeDotsProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [boardExportOpen, setBoardExportOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeDocumentTab = useAppStore((s) => s.closeDocumentTab)
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  function handleOpen() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    setOpen((o) => !o)
  }

  function dispatchZoom(key: string) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }),
    )
    setOpen(false)
  }

  async function handleDelete() {
    if (!documentId) return
    setOpen(false)
    if (!window.confirm('Delete this file? This cannot be undone.')) return
    await window.prose.documents.delete(documentId)
    closeDocumentTab(documentId)
  }

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={btnRef}
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleOpen}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">More options</TooltipContent>
      </Tooltip>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 99999 }}
            className="min-w-[200px] rounded-lg border border-border bg-background py-1 shadow-lg"
          >
            <MenuItem icon={RotateCcw} label="Reset zoom" shortcut="Ctrl+0" onClick={() => {
              setOpen(false)
              if (excalidrawAPI) {
                excalidrawAPI.updateScene({ appState: { zoom: { value: 1 } } })
              } else {
                dispatchZoom('0')
              }
            }} />

            <MenuSep />

            {fileType === 'document' && onFindOpen && (
              <MenuItem
                icon={Search}
                label="Find in document"
                shortcut="Ctrl+F"
                onClick={() => { setOpen(false); onFindOpen() }}
              />
            )}
            {fileType === 'document' && documentId && (
              <MenuItem
                icon={Download}
                label="Export…"
                onClick={() => { setOpen(false); setExportOpen(true) }}
              />
            )}
            {fileType === 'document' && onFocusMode && (
              <MenuItem
                icon={Maximize2}
                label="Focus mode"
                shortcut="F11"
                onClick={() => { setOpen(false); onFocusMode() }}
              />
            )}
            {fileType === 'document' && (
              <MenuItem
                icon={Settings}
                label="Settings"
                onClick={() => { setOpen(false); setSettingsOpen(true) }}
              />
            )}

            {fileType === 'sheet' && (
              <>
                <MenuItem icon={Download} label="Export…" onClick={() => { setOpen(false); onSheetExport?.() }} />
                <MenuItem icon={Settings} label="Settings" onClick={() => { setOpen(false); onSettingsOpen?.() }} />
              </>
            )}

            {fileType === 'slides' && (
              <>
                {onSlidesFind && (
                  <MenuItem icon={Search} label="Find in presentation" shortcut="Ctrl+F" onClick={() => { setOpen(false); onSlidesFind() }} />
                )}
                {onSlidesExport && (
                  <MenuItem icon={Download} label="Export…" onClick={() => { setOpen(false); onSlidesExport() }} />
                )}
                {onSlidesPresent && (
                  <MenuItem icon={Maximize2} label="Enter presentation mode" shortcut="F5" onClick={() => { setOpen(false); onSlidesPresent() }} />
                )}
                {onSlidesToggleGrid && (
                  <MenuItem icon={Grid3X3} label={slidesGridActive ? 'Hide grid' : 'Show grid'} shortcut="Ctrl+'" onClick={() => { setOpen(false); onSlidesToggleGrid() }} />
                )}
                <MenuItem icon={Settings} label="Settings" onClick={() => { setOpen(false); onSettingsOpen?.() }} />
              </>
            )}

            {fileType === 'board' && (
              <>
                <MenuItem
                  icon={HelpCircle}
                  label="Keyboard shortcuts"
                  shortcut="?"
                  onClick={() => {
                    setOpen(false)
                    if (excalidrawAPI) excalidrawAPI.updateScene({ appState: { openDialog: { name: 'help' } } })
                  }}
                />
                <MenuSep />
                <MenuItem
                  icon={Download}
                  label="Export…"
                  onClick={() => { setOpen(false); setBoardExportOpen(true) }}
                />
                <MenuItem icon={Settings} label="Settings" onClick={() => { setOpen(false); onSettingsOpen?.() }} />
              </>
            )}

            {documentId && (
              <>
                <MenuSep />
                <MenuItem
                  icon={Trash2}
                  label="Delete file"
                  danger
                  onClick={() => void handleDelete()}
                />
              </>
            )}
          </div>,
          document.body,
        )}

      {boardExportOpen && fileType === 'board' && excalidrawAPI && (
        <BoardExportModal
          open={boardExportOpen}
          onClose={() => setBoardExportOpen(false)}
          boardTitle={documentTitle ?? 'Board'}
          excalidrawAPI={excalidrawAPI}
        />
      )}

      {exportOpen && fileType === 'document' && documentId && (
        <ExportModal
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          documentId={documentId}
          documentTitle={documentTitle ?? ''}
          documentMargins={documentMargins ?? null}
        />
      )}
    </>
  )
}

// ── Public component ─────────────────────────────────────────────────────────

export interface ToolbarRightSectionProps {
  fileType: 'document' | 'sheet' | 'board' | 'slides'
  documentId: string | null
  documentTitle?: string
  documentMargins?: PageMargins | null
  onFindOpen?: () => void
  onFocusMode?: () => void
  onSettingsOpen?: () => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI?: any
  onSheetExport?: () => void
  onSlidesFind?: () => void
  onSlidesExport?: () => void
  onSlidesPresent?: () => void
  onSlidesToggleGrid?: () => void
  slidesGridActive?: boolean
}

export function ToolbarRightSection({
  fileType,
  documentId,
  documentTitle,
  documentMargins,
  onFindOpen,
  onFocusMode,
  onSettingsOpen,
  excalidrawAPI,
  onSheetExport,
  onSlidesFind,
  onSlidesExport,
  onSlidesPresent,
  onSlidesToggleGrid,
  slidesGridActive,
}: ToolbarRightSectionProps): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const setTheme = useAppStore((s) => s.setTheme)
  const aiPanelOpen = useAppStore((s) => s.aiPanelOpen)
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const issueCount = useAppStore((s) => s.issueCount)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)

  return (
    <div className="flex shrink-0 items-center gap-0.5 pr-1">
      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('h-7 w-7', musicPanelOpen && 'bg-accent text-accent-foreground')}
            onClick={() => {
              if (!musicPanelOpen) setMusicPanelTab('tracks')
              setMusicPanelOpen(!musicPanelOpen)
            }}
          >
            <Music className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Music</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative h-7 w-7', aiPanelOpen && 'bg-accent text-accent-foreground')}
            onClick={() => setAiPanelOpen(!aiPanelOpen)}
            disabled={ollamaStatus === 'unavailable'}
          >
            <Sparkles className="h-3.5 w-3.5" />
            {issueCount > 0 && !aiPanelOpen && (
              <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-bold leading-none text-primary-foreground">
                {issueCount > 9 ? '9+' : issueCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {aiPanelOpen ? 'Hide AI panel' : 'Show AI panel'}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        </TooltipContent>
      </Tooltip>

      <ThreeDotsMenu
        fileType={fileType}
        documentId={documentId}
        documentTitle={documentTitle}
        documentMargins={documentMargins}
        onFindOpen={onFindOpen}
        onFocusMode={onFocusMode}
        onSettingsOpen={onSettingsOpen}
        excalidrawAPI={excalidrawAPI}
        onSheetExport={onSheetExport}
        onSlidesFind={onSlidesFind}
        onSlidesExport={onSlidesExport}
        onSlidesPresent={onSlidesPresent}
        onSlidesToggleGrid={onSlidesToggleGrid}
        slidesGridActive={slidesGridActive}
      />
    </div>
  )
}
