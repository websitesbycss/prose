import { useState } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  List, ListOrdered, IndentIcon, Outdent,
  Image, Link2, Table2, Music, BookOpen,
  ChevronDown, Undo2, Redo2, Highlighter,
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

interface HeadingFontSizes {
  h1: number
  h2: number
  h3: number
}

interface ToolbarProps {
  editor: Editor | null
  document: Document | null
  onApplyFormat: (format: 'mla' | 'apa') => void
  headingFontSizes: HeadingFontSizes
}

const FONT_FAMILIES = [
  'Times New Roman',
  'Georgia',
  'Arial',
  'Helvetica',
  'Courier New',
]

const COLOR_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

const HIGHLIGHT_PALETTE = [
  '#fef08a', '#fde68a', '#fed7aa',
  '#fca5a5', '#f9a8d4', '#d8b4fe',
  '#a5f3fc', '#86efac', '#bfdbfe',
  '#f3f4f6', '#e5e7eb', '#d1d5db',
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

function ColorSwatchGrid({
  palette,
  current,
  onSelect,
  onReset,
  resetLabel,
}: {
  palette: string[]
  current: string
  onSelect: (color: string) => void
  onReset: () => void
  resetLabel: string
}): JSX.Element {
  const [customColor, setCustomColor] = useState(current || '#000000')

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="grid grid-cols-6 gap-1">
        {palette.map((color) => (
          <button
            key={color}
            className={cn(
              'h-5 w-5 rounded ring-offset-background transition-all hover:ring-2 hover:ring-ring hover:ring-offset-1',
              current === color && 'ring-2 ring-ring ring-offset-1'
            )}
            style={{ backgroundColor: color }}
            onClick={() => onSelect(color)}
            title={color}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={customColor}
          onChange={(e) => setCustomColor(e.target.value)}
          onBlur={(e) => onSelect(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0"
          title="Custom color"
        />
        <span className="text-[10px] text-muted-foreground">Custom</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{customColor}</span>
      </div>
      <Button variant="ghost" size="sm" className="h-6 w-full text-xs" onClick={onReset}>
        {resetLabel}
      </Button>
    </div>
  )
}

function ColorPicker({
  editor,
  currentColor,
}: {
  editor: Editor
  currentColor: string
}): JSX.Element {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <span className="text-[11px] font-bold leading-none">A</span>
              <span className="mt-0.5 h-1 w-4 rounded-sm" style={{ backgroundColor: currentColor }} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font color</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" side="bottom" align="start">
        <ColorSwatchGrid
          palette={COLOR_PALETTE}
          current={currentColor}
          onSelect={(c) => editor.chain().focus().setColor(c).run()}
          onReset={() => editor.chain().focus().unsetColor().run()}
          resetLabel="Reset color"
        />
      </PopoverContent>
    </Popover>
  )
}

function HighlightPicker({
  editor,
  currentHighlight,
}: {
  editor: Editor
  currentHighlight: string | null
}): JSX.Element {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <Highlighter className="h-3.5 w-3.5 leading-none" />
              <span
                className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
                style={{ backgroundColor: currentHighlight ?? 'transparent' }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Highlight</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" side="bottom" align="start">
        <ColorSwatchGrid
          palette={HIGHLIGHT_PALETTE}
          current={currentHighlight ?? ''}
          onSelect={(c) => editor.chain().focus().setHighlight({ color: c }).run()}
          onReset={() => editor.chain().focus().unsetHighlight().run()}
          resetLabel="Remove highlight"
        />
      </PopoverContent>
    </Popover>
  )
}

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72]

function FontSizeInput({
  editor,
  fontSize,
}: {
  editor: Editor
  fontSize: string
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const display = draft ?? fontSize.replace('pt', '')

  function apply(val: string): void {
    const num = parseInt(val)
    if (!isNaN(num) && num >= 6 && num <= 96) {
      editor.chain().focus().setFontSize(`${num}pt`).run()
    }
    setDraft(null)
  }

  return (
    <Popover>
      <div className="flex h-7 items-center overflow-hidden rounded-md border border-input">
        <Input
          className="h-7 w-10 rounded-none border-0 text-center text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
          onMouseDown={(e) => e.stopPropagation()}
          value={display}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => { if (draft !== null) apply(e.target.value) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              apply(draft ?? display)
              ;(e.target as HTMLInputElement).blur()
            }
            if (e.key === 'Escape') setDraft(null)
          }}
        />
        <PopoverTrigger asChild>
          <button className="flex h-7 w-5 shrink-0 items-center justify-center border-l border-input text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ChevronDown className="h-3 w-3" />
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent
        className="w-16 p-1"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col">
          {FONT_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              className={cn(
                'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                fontSize === `${size}pt` && 'bg-accent/50 font-medium'
              )}
              onMouseDown={(e) => {
                e.preventDefault()
                editor.chain().focus().setFontSize(`${size}pt`).run()
                setDraft(null)
              }}
            >
              {size}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ParagraphStylePicker({
  editor,
  paragraphStyle,
  headingFontSizes,
}: {
  editor: Editor
  paragraphStyle: string
  headingFontSizes: HeadingFontSizes
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const labels: Record<string, string> = { p: 'Paragraph', h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3' }

  function apply(v: string): void {
    if (v === 'p') {
      editor.chain().focus().setParagraph().run()
    } else {
      const level = parseInt(v.slice(1)) as 1 | 2 | 3
      const size = ({ h1: headingFontSizes.h1, h2: headingFontSizes.h2, h3: headingFontSizes.h3 })[v]
      editor.chain().focus().setHeading({ level }).setFontSize(`${size}pt`).run()
    }
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-7 w-28 justify-between border-input px-2 text-xs font-normal"
        >
          <span>{labels[paragraphStyle] ?? 'Paragraph'}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1" side="bottom" align="start">
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
            paragraphStyle === 'p' && 'bg-accent/50'
          )}
          onClick={() => apply('p')}
        >
          Paragraph
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-bold transition-colors hover:bg-accent',
            paragraphStyle === 'h1' && 'bg-accent/50'
          )}
          style={{ fontSize: 18 }}
          onClick={() => apply('h1')}
        >
          Heading 1
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-semibold transition-colors hover:bg-accent',
            paragraphStyle === 'h2' && 'bg-accent/50'
          )}
          style={{ fontSize: 14 }}
          onClick={() => apply('h2')}
        >
          Heading 2
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-medium transition-colors hover:bg-accent',
            paragraphStyle === 'h3' && 'bg-accent/50'
          )}
          style={{ fontSize: 12 }}
          onClick={() => apply('h3')}
        >
          Heading 3
        </button>
      </PopoverContent>
    </Popover>
  )
}

function LinkPopover({ editor, isLink }: { editor: Editor; isLink: boolean }): JSX.Element {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(false)

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
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          const existing = editor.getAttributes('link').href as string | undefined
          setUrl(existing ?? '')
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7', isLink && 'bg-accent text-accent-foreground')}
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
            className="h-7 text-xs"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyLink()}
            autoFocus
          />
          <Button size="sm" className="h-7 px-2 text-xs" onClick={applyLink}>
            Apply
          </Button>
        </div>
        {isLink && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 w-full text-xs text-destructive"
            onClick={() => {
              editor.chain().focus().unsetLink().run()
              setOpen(false)
            }}
          >
            Remove link
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ToolbarInner({
  editor,
  document,
  onApplyFormat,
  headingFontSizes,
}: {
  editor: Editor
  document: Document | null
  onApplyFormat: (format: 'mla' | 'apa') => void
  headingFontSizes: HeadingFontSizes
}): JSX.Element {
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setCitationPanelOpen = useAppStore((s) => s.setCitationPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)

  const s = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor.isActive('bold'),
      isItalic: ctx.editor.isActive('italic'),
      isUnderline: ctx.editor.isActive('underline'),
      isStrike: ctx.editor.isActive('strike'),
      isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }),
      isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }),
      isAlignRight: ctx.editor.isActive({ textAlign: 'right' }),
      isBulletList: ctx.editor.isActive('bulletList'),
      isOrderedList: ctx.editor.isActive('orderedList'),
      isLink: ctx.editor.isActive('link'),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo(),
      fontFamily: (ctx.editor.getAttributes('textStyle').fontFamily as string | undefined) ?? (FONT_FAMILIES[0] ?? ''),
      fontSize: (ctx.editor.getAttributes('textStyle').fontSize as string | undefined) ?? '12pt',
      paragraphStyle: ctx.editor.isActive('heading', { level: 1 })
        ? 'h1'
        : ctx.editor.isActive('heading', { level: 2 })
        ? 'h2'
        : ctx.editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p',
      currentColor: (ctx.editor.getAttributes('textStyle').color as string | undefined) ?? '#000000',
      currentHighlight: (ctx.editor.getAttributes('highlight').color as string | undefined) ?? null,
    }),
  })

  async function handleImageInsert(): Promise<void> {
    const dataUrl = await window.prose.dialog.openImage()
    if (dataUrl) editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Font family */}
      <Select
        value={s.fontFamily}
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
      <FontSizeInput editor={editor} fontSize={s.fontSize} />

      {/* Paragraph style */}
      <ParagraphStylePicker
        editor={editor}
        paragraphStyle={s.paragraphStyle}
        headingFontSizes={headingFontSizes}
      />

      <Sep />

      {/* Undo / redo */}
      <ToolbarBtn
        icon={Undo2}
        title="Undo (Ctrl+Z)"
        disabled={!s.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarBtn
        icon={Redo2}
        title="Redo (Ctrl+Shift+Z)"
        disabled={!s.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      />

      <Sep />

      {/* Inline formatting */}
      <ToolbarBtn
        icon={Bold}
        title="Bold (Ctrl+B)"
        active={s.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarBtn
        icon={Italic}
        title="Italic (Ctrl+I)"
        active={s.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarBtn
        icon={Underline}
        title="Underline (Ctrl+U)"
        active={s.isUnderline}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarBtn
        icon={Strikethrough}
        title="Strikethrough"
        active={s.isStrike}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ColorPicker editor={editor} currentColor={s.currentColor} />
      <HighlightPicker editor={editor} currentHighlight={s.currentHighlight} />

      <Sep />

      {/* Alignment */}
      <ToolbarBtn
        icon={AlignLeft}
        title="Align left"
        active={s.isAlignLeft}
        onClick={() => editor.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarBtn
        icon={AlignCenter}
        title="Align center"
        active={s.isAlignCenter}
        onClick={() => editor.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarBtn
        icon={AlignRight}
        title="Align right"
        active={s.isAlignRight}
        onClick={() => editor.chain().focus().setTextAlign('right').run()}
      />

      <Sep />

      {/* Lists and indent */}
      <ToolbarBtn
        icon={List}
        title="Bullet list"
        active={s.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarBtn
        icon={ListOrdered}
        title="Numbered list"
        active={s.isOrderedList}
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
      <LinkPopover editor={editor} isLink={s.isLink} />
      <ToolbarBtn
        icon={Table2}
        title="Insert table"
        onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
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
        active={musicPanelOpen}
        onClick={() => setMusicPanelOpen(!musicPanelOpen)}
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

export default function Toolbar({ editor, document, onApplyFormat, headingFontSizes }: ToolbarProps): JSX.Element {
  if (!editor) return <div className="h-10 shrink-0 border-b border-border" />
  return (
    <ToolbarInner
      editor={editor}
      document={document}
      onApplyFormat={onApplyFormat}
      headingFontSizes={headingFontSizes}
    />
  )
}
