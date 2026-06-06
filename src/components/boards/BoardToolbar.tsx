import { useState, useRef, useEffect } from 'react'
import {
  MousePointer2, Hand, Square, Diamond, Circle,
  ArrowRight, Minus, PenLine, Type, Eraser,
  PlusSquare, Search, ZoomIn, ZoomOut, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'
import type { FileType } from '@/types'

// ── Excalidraw tool definitions ───────────────────────────────────────────────

const EXCALIDRAW_TOOLS = [
  { type: 'selection', icon: MousePointer2, title: 'Select (V)' },
  { type: 'hand', icon: Hand, title: 'Pan (H)' },
  { type: 'rectangle', icon: Square, title: 'Rectangle (R)' },
  { type: 'diamond', icon: Diamond, title: 'Diamond (D)' },
  { type: 'ellipse', icon: Circle, title: 'Ellipse (O)' },
  { type: 'arrow', icon: ArrowRight, title: 'Arrow (A)' },
  { type: 'line', icon: Minus, title: 'Line (L)' },
  { type: 'freedraw', icon: PenLine, title: 'Draw (P)' },
  { type: 'text', icon: Type, title: 'Text (T)' },
  { type: 'eraser', icon: Eraser, title: 'Eraser (E)' },
] as const

type ExcalidrawToolType = typeof EXCALIDRAW_TOOLS[number]['type']

// ── File picker popover ───────────────────────────────────────────────────────

interface DashboardDocument {
  id: string
  title: string
  fileType: FileType
  wordCount: number
}

interface FilePickerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null
  onAddFileCard: (fileId: string, fileType: string, title: string, wordCount: number, preview: string) => void
}

function FilePickerPopover({ excalidrawAPI, onAddFileCard }: FilePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<DashboardDocument[]>([])
  const [search, setSearch] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) { setSearch(''); return }
    void window.prose.documents.getAll().then((docs) => {
      setFiles(docs.map((d) => ({
        id: d.id,
        title: d.title,
        fileType: (d.fileType ?? 'document') as FileType,
        wordCount: (d as { wordCount?: number }).wordCount ?? 0,
      })))
    })
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const filtered = files.filter((f) =>
    f.title.toLowerCase().includes(search.toLowerCase())
  )

  function handleSelectFile(file: DashboardDocument) {
    if (!excalidrawAPI) return
    setOpen(false)
    void window.prose.documents.getById(file.id).then((doc) => {
      if (!doc) return
      let preview = ''
      try {
        const content = typeof doc.content === 'string' ? JSON.parse(doc.content) : doc.content
        if (content?.content) {
          const texts: string[] = []
          function walk(node: { text?: string; content?: unknown[] }) {
            if (node.text) texts.push(node.text)
            if (node.content) node.content.forEach((n) => walk(n as { text?: string; content?: unknown[] }))
          }
          walk(content)
          preview = texts.join(' ').slice(0, 80)
        }
      } catch { /* ignore */ }
      onAddFileCard(file.id, file.fileType, doc.title, file.wordCount, preview)
    })
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="Add file card"
        onClick={() => setOpen((o) => !o)}
      >
        <PlusSquare className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-background shadow-lg"
        >
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              placeholder="Search files…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">No files found</p>
            )}
            {filtered.map((f) => (
              <button
                key={f.id}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent"
                onClick={() => handleSelectFile(f)}
              >
                <span className="font-medium">{f.title}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">{f.fileType}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Board zoom controls ───────────────────────────────────────────────────────

const BOARD_ZOOM_MIN = 10
const BOARD_ZOOM_MAX = 300
const BOARD_ZOOM_STEP = 10
const BOARD_ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 300]

function BoardZoomControls({ zoom, onZoomChange }: { zoom: number; onZoomChange(z: number): void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  function clamp(v: number): number {
    return Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, v))
  }

  function apply(val: string): void {
    const n = parseInt(val)
    if (!isNaN(n)) onZoomChange(clamp(n))
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <button
        className="transition-colors hover:text-foreground"
        onClick={() => onZoomChange(clamp(zoom - BOARD_ZOOM_STEP))}
        title="Zoom out"
      >
        <ZoomOut className="h-3 w-3" />
      </button>

      <input
        type="range"
        min={BOARD_ZOOM_MIN}
        max={BOARD_ZOOM_MAX}
        step={1}
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="zoom-slider w-20"
        title={`Zoom: ${zoom}%`}
      />

      <div className="flex items-center gap-0.5">
        <button
          className="transition-colors hover:text-foreground"
          onClick={() => onZoomChange(clamp(zoom + BOARD_ZOOM_STEP))}
          title="Zoom in"
        >
          <ZoomIn className="h-3 w-3" />
        </button>

        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(String(zoom)) }}>
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-0.5 tabular-nums transition-colors hover:text-foreground"
              title="Set zoom level"
            >
              <span className="w-8 text-right">{zoom}%</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-20 p-1" side="bottom" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
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
              {BOARD_ZOOM_PRESETS.map((p) => (
                <button
                  key={p}
                  className="rounded px-2 py-0.5 text-right text-xs hover:bg-accent"
                  onClick={() => { onZoomChange(p); setOpen(false) }}
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

// ── BoardToolbar ──────────────────────────────────────────────────────────────

interface BoardToolbarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null
  activeToolType: string
  documentId: string | null
  canvasZoom: number
  onCanvasZoomChange: (pct: number) => void
  onAddFileCard: (fileId: string, fileType: string, title: string, wordCount: number, preview: string) => void
}

export function BoardToolbar({
  excalidrawAPI,
  activeToolType,
  documentId,
  canvasZoom,
  onCanvasZoomChange,
  onAddFileCard,
}: BoardToolbarProps): JSX.Element {
  function setTool(type: ExcalidrawToolType) {
    if (!excalidrawAPI) return
    try {
      excalidrawAPI.setActiveTool({ type })
    } catch { /* API may not be ready */ }
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-background">
      {/* Tool buttons */}
      <div className="flex items-center gap-0.5 px-2">
        {EXCALIDRAW_TOOLS.map(({ type, icon: Icon, title }) => (
          <Button
            key={type}
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7',
              activeToolType === type && 'bg-accent text-accent-foreground',
            )}
            title={title}
            onClick={() => setTool(type)}
          >
            <Icon className="h-3.5 w-3.5" />
          </Button>
        ))}

        <Separator orientation="vertical" className="mx-0.5 h-5" />

        <FilePickerPopover excalidrawAPI={excalidrawAPI} onAddFileCard={onAddFileCard} />

        <Separator orientation="vertical" className="mx-1.5 h-5" />

        <BoardZoomControls zoom={canvasZoom} onZoomChange={onCanvasZoomChange} />
      </div>

      <div className="flex-1" />

      {/* Persistent right section */}
      <ToolbarRightSection
        fileType="board"
        documentId={documentId}
        excalidrawAPI={excalidrawAPI}
      />
    </div>
  )
}
