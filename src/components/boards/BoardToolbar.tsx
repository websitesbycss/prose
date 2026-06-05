import { useState, useRef, useEffect } from 'react'
import {
  MousePointer2, Hand, Pencil, Square, Circle, ArrowRight, Type, StickyNote,
  PlusSquare, ZoomIn, ZoomOut, Maximize2, Search,
} from 'lucide-react'
import { GeoShapeGeoStyle } from 'tldraw'
import type { Editor } from 'tldraw'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { ProseFileCardProps } from './ProseFileCardShape'
import type { FileType } from '@/types'

interface DashboardDocument {
  id: string
  title: string
  fileType: FileType
  wordCount: number
}

interface BoardToolbarProps {
  editor: Editor | null
  activeTool: string
  onToolChange: (tool: string) => void
  zoomLevel: number
}

const TOOLS = [
  { id: 'select',   icon: MousePointer2, title: 'Select (V)',    key: 'v' },
  { id: 'hand',     icon: Hand,           title: 'Hand (H)',     key: 'h' },
  { id: 'draw',     icon: Pencil,         title: 'Draw (P)',     key: 'p' },
  { id: 'geo_rect', icon: Square,         title: 'Rectangle (R)', key: 'r' },
  { id: 'geo_ellipse', icon: Circle,      title: 'Ellipse (O)',  key: 'o' },
  { id: 'arrow',    icon: ArrowRight,     title: 'Arrow (A)',    key: 'a' },
  { id: 'text',     icon: Type,           title: 'Text (T)',     key: 't' },
  { id: 'prose-sticky-note', icon: StickyNote, title: 'Sticky note (S)', key: 's' },
]

function setEditorTool(editor: Editor | null, toolId: string): void {
  if (!editor) return
  if (toolId === 'geo_rect') {
    editor.setCurrentTool('geo')
    editor.setStyleForNextShapes(GeoShapeGeoStyle, 'rectangle')
  } else if (toolId === 'geo_ellipse') {
    editor.setCurrentTool('geo')
    editor.setStyleForNextShapes(GeoShapeGeoStyle, 'ellipse')
  } else if (toolId === 'prose-sticky-note') {
    editor.setCurrentTool('prose-sticky-note')
  } else {
    editor.setCurrentTool(toolId)
  }
}

export function BoardToolbar({ editor, activeTool, onToolChange, zoomLevel }: BoardToolbarProps): JSX.Element {
  const [filePopoverOpen, setFilePopoverOpen] = useState(false)
  const [files, setFiles] = useState<DashboardDocument[]>([])
  const [search, setSearch] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!filePopoverOpen) { setSearch(''); return }
    void window.prose.documents.getAll().then((docs) => {
      setFiles(docs.map((d) => ({
        id: d.id,
        title: d.title,
        fileType: (d.fileType ?? 'document') as FileType,
        wordCount: (d as { wordCount?: number }).wordCount ?? 0,
      })))
    })
    setTimeout(() => searchRef.current?.focus(), 0)
  }, [filePopoverOpen])

  useEffect(() => {
    if (!filePopoverOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFilePopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filePopoverOpen])

  const filtered = files.filter((f) =>
    f.title.toLowerCase().includes(search.toLowerCase())
  )

  function addFileCard(file: DashboardDocument) {
    if (!editor) return
    setFilePopoverOpen(false)

    // Fetch full file to get preview text
    void window.prose.documents.getById(file.id).then((doc) => {
      if (!doc) return
      let preview = ''
      try {
        // For documents try to extract plain text preview
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

      const { x, y } = editor.getViewportPageBounds().center
      const props: ProseFileCardProps = {
        fileId: file.id,
        fileType: file.fileType,
        title: doc.title,
        wordCount: file.wordCount,
        preview,
        category: '',
        w: 240,
        h: 120,
      }
      editor.createShape({
        type: 'prose-file-card',
        x: x - 120,
        y: y - 60,
        props,
      })
    })
  }

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-2 py-1 relative">
      {/* Tool buttons */}
      {TOOLS.map(({ id, icon: Icon, title }) => (
        <Button
          key={id}
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', activeTool === id && 'bg-accent text-accent-foreground')}
          title={title}
          onClick={() => { onToolChange(id); setEditorTool(editor, id) }}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Add file button */}
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="Add file card"
          onClick={() => setFilePopoverOpen((o) => !o)}
        >
          <PlusSquare className="h-3.5 w-3.5" />
        </Button>

        {filePopoverOpen && (
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
                  onClick={() => addFileCard(f)}
                >
                  <span className="font-medium">{f.title}</span>
                  <span className="ml-1.5 text-[10px] text-muted-foreground capitalize">{f.fileType}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Zoom controls */}
      <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom out" onClick={() => editor?.zoomOut()}>
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>

      <span className="min-w-[3rem] text-center text-[10px] text-muted-foreground tabular-nums">
        {zoomLevel}%
      </span>

      <Button variant="ghost" size="icon" className="h-7 w-7" title="Zoom in" onClick={() => editor?.zoomIn()}>
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>

      <Button variant="ghost" size="icon" className="h-7 w-7" title="Fit to screen" onClick={() => editor?.zoomToFit()}>
        <Maximize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
