import { useState, useRef, useEffect } from 'react'
import { PlusSquare, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { FileType } from '@/types'

interface DashboardDocument {
  id: string
  title: string
  fileType: FileType
  wordCount: number
}

interface BoardToolbarProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  excalidrawAPI: any | null
  onAddFileCard: (
    fileId: string,
    fileType: string,
    title: string,
    wordCount: number,
    preview: string,
  ) => void
}

export function BoardToolbar({ excalidrawAPI, onAddFileCard }: BoardToolbarProps): JSX.Element {
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

  function handleSelectFile(file: DashboardDocument) {
    if (!excalidrawAPI) return
    setFilePopoverOpen(false)

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
    <div className="relative flex shrink-0 items-center gap-0.5 border-b border-border bg-background px-2 py-1">
      {/* Add file card */}
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

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      <span className="text-[10px] text-muted-foreground">
        Double-click a file card to open · Use Excalidraw tools to draw
      </span>
    </div>
  )
}
