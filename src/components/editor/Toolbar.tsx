import { useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, IndentIcon, Outdent,
  Image, Link2, Table2, Music, BookOpen,
  ChevronDown, Undo2, Redo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { Document } from '@/types'

interface ToolbarProps {
  editor: Editor | null
  document: Document | null
  onApplyFormat: (format: 'mla' | 'apa') => void
}

const FONT_FAMILIES = [
  'Times New Roman',
  'Georgia',
  'Arial',
  'Helvetica',
  'Courier New',
]

const FONT_SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt', '36pt']

const COLOR_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

function ToolbarBtn({
  icon: Icon,
  title,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {title}
      </TooltipContent>
    </Tooltip>
  )
}

function Sep(): JSX.Element {
  return <Separator orientation="vertical" className="mx-0.5 h-5" />
}

function ColorPicker({ editor }: { editor: Editor }): JSX.Element {
  const current = (editor.getAttributes('textStyle').color as string | undefined) ?? '#000000'

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <span className="text-[11px] font-bold leading-none">A</span>
              <span
                className="mt-0.5 h-1 w-4 rounded-sm"
                style={{ backgroundColor: current }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font color</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-2" side="bottom" align="start">
        <div className="grid grid-cols-6 gap-1">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              className="h-5 w-5 rounded ring-offset-background hover:ring-2 hover:ring-ring hover:ring-offset-1 transition-all"
              style={{ backgroundColor: color }}
              onClick={() => {
                editor.chain().focus().setColor(color).run()
              }}
              title={color}
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-6 w-full text-xs"
          onClick={() => editor.chain().focus().unsetColor().run()}
        >
          Reset
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function LinkPopover({ editor }: { editor: Editor }): JSX.Element {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function applyLink(): void {
    if (!url.trim()) {
      editor.chain().focus().unsetLink().run()
    } else {
      const href = url.startsWith('http') ? url : `https://${url}`
      editor.chain().focus().setLink({ href }).run()
    }
    setOpen(false)
    setUrl('')
  }

  return (
    <Popover open={open} onOpenChange={(o) => {
      setOpen(o)
      if (o) {
        const existing = editor.getAttributes('link').href as string | undefined
        setUrl(existing ?? '')
        setTimeout(() => inputRef.current?.select(), 50)
      }
    }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7', editor.isActive('link') && 'bg-accent text-accent-foreground')}
            >
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert link</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" side="bottom" align="start">
        <div className="flex gap-1.5">
          <Input
            ref={inputRef}
            className="h-7 text-xs"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyLink()}
          />
          <Button size="sm" className="h-7 text-xs px-2" onClick={applyLink}>
            Apply
          </Button>
        </div>
        {editor.isActive('link') && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 w-full text-xs text-destructive"
            onClick={() => { editor.chain().focus().unsetLink().run(); setOpen(false) }}
          >
            Remove link
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

export default function Toolbar({ editor, document, onApplyFormat }: ToolbarProps): JSX.Element {
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setCitationPanelOpen = useAppStore((s) => s.setCitationPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)

  if (!editor) {
    return <div className="h-10 shrink-0 border-b border-border" />
  }

  const fontFamily =
    (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? FONT_FAMILIES[0]
  const fontSize =
    (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '12pt'
  const paragraphStyle = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
    ? 'h2'
    : editor.isActive('heading', { level: 3 })
    ? 'h3'
    : 'p'

  async function handleImageInsert(): Promise<void> {
    const e = editor
    if (!e) return
    const dataUrl = await window.prose.dialog.openImage()
    if (dataUrl) e.chain().focus().setImage({ src: dataUrl }).run()
  }

  function handleTableInsert(): void {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }

  return (
    <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2">
      {/* Font family */}
      <Select
        value={fontFamily}
        onValueChange={(v) => editor.chain().focus().setFontFamily(v).run()}
      >
        <SelectTrigger className="h-7 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f} value={f} className="text-xs" style={{ fontFamily: f }}>
              {f}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Font size */}
      <Select
        value={fontSize}
        onValueChange={(v) => editor.chain().focus().setFontSize(v).run()}
      >
        <SelectTrigger className="h-7 w-16 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s} value={s} className="text-xs">
              {s.replace('pt', '')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Paragraph style */}
      <Select
        value={paragraphStyle}
        onValueChange={(v) => {
          if (v === 'p') {
            editor.chain().focus().setParagraph().run()
          } else {
            const level = parseInt(v.slice(1)) as 1 | 2 | 3
            editor.chain().focus().setHeading({ level }).run()
          }
        }}
      >
        <SelectTrigger className="h-7 w-28 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="p" className="text-xs">Paragraph</SelectItem>
          <SelectItem value="h1" className="text-xs font-bold">Heading 1</SelectItem>
          <SelectItem value="h2" className="text-xs font-semibold">Heading 2</SelectItem>
          <SelectItem value="h3" className="text-xs font-medium">Heading 3</SelectItem>
        </SelectContent>
      </Select>

      <Sep />

      {/* Undo / redo */}
      <ToolbarBtn
        icon={Undo2}
        title="Undo (Ctrl+Z)"
        disabled={!editor.can().undo()}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarBtn
        icon={Redo2}
        title="Redo (Ctrl+Y)"
        disabled={!editor.can().redo()}
        onClick={() => editor.chain().focus().redo().run()}
      />

      <Sep />

      {/* Inline formatting */}
      <ToolbarBtn
        icon={Bold}
        title="Bold (Ctrl+B)"
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarBtn
        icon={Italic}
        title="Italic (Ctrl+I)"
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarBtn
        icon={Underline}
        title="Underline (Ctrl+U)"
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarBtn
        icon={Strikethrough}
        title="Strikethrough"
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />

      <ColorPicker editor={editor} />

      <Sep />

      {/* Alignment */}
      <ToolbarBtn
        icon={AlignLeft}
        title="Align left"
        active={editor.isActive({ textAlign: 'left' })}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarBtn
        icon={AlignCenter}
        title="Align center"
        active={editor.isActive({ textAlign: 'center' })}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarBtn
        icon={AlignRight}
        title="Align right"
        active={editor.isActive({ textAlign: 'right' })}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />

      <Sep />

      {/* Lists and indent */}
      <ToolbarBtn
        icon={List}
        title="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarBtn
        icon={ListOrdered}
        title="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarBtn
        icon={IndentIcon}
        title="Indent (Tab)"
        onClick={() => editor.chain().focus().indent().run()}
      />
      <ToolbarBtn
        icon={Outdent}
        title="Outdent (Shift+Tab)"
        onClick={() => editor.chain().focus().outdent().run()}
      />

      <Sep />

      {/* Insert */}
      <ToolbarBtn
        icon={Image}
        title="Insert image"
        onClick={() => void handleImageInsert()}
      />
      <LinkPopover editor={editor} />
      <ToolbarBtn
        icon={Table2}
        title="Insert table"
        onClick={handleTableInsert}
      />

      <Sep />

      {/* Format */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-2 text-xs font-medium',
              document?.format === 'mla' && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onApplyFormat('mla')}
          >
            MLA
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Apply MLA format</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-7 px-2 text-xs font-medium',
              document?.format === 'apa' && 'bg-accent text-accent-foreground'
            )}
            onClick={() => onApplyFormat('apa')}
          >
            APA
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Apply APA format</TooltipContent>
      </Tooltip>

      <Sep />

      {/* Panels */}
      <ToolbarBtn
        icon={Music}
        title="Focus music"
        onClick={() => setMusicPanelOpen(true)}
      />
      <ToolbarBtn
        icon={BookOpen}
        title="Citations"
        active={citationPanelOpen}
        onClick={() => setCitationPanelOpen(!citationPanelOpen)}
      />

      <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/0" aria-hidden />
    </div>
  )
}
