import { useState } from 'react'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, IndentIcon, Outdent,
  Subscript, Superscript,
  Image, Link2, Table2, Music, BookOpen, Hash,
  ChevronDown, Undo2, Redo2, Highlighter, PaintBucket,
} from 'lucide-react'
import type { DocumentFormat } from '@/types'
import { Button } from '@/components/ui/button'
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
  'Calibri',
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
          className={cn('h-7 w-7', active && '!text-primary')}
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
  theme,
}: {
  editor: Editor
  currentColor: string
  theme: 'dark' | 'light'
}): JSX.Element {
  const themedPalette = COLOR_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

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
          palette={themedPalette}
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

function FontFamilyPicker({
  editor,
  fontFamily,
}: {
  editor: Editor
  fontFamily: string
}): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-7 w-36 justify-between border-input px-2 text-xs font-normal"
          style={{ fontFamily }}
        >
          <span className="truncate">{fontFamily}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-44 p-1"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {FONT_FAMILIES.map((f) => (
          <button
            key={f}
            className={cn(
              'w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
              fontFamily === f && 'bg-accent/50 font-medium'
            )}
            style={{ fontFamily: f }}
            onMouseDown={(e) => {
              e.preventDefault()
              editor.chain().focus().setFontFamily(f).run()
              setOpen(false)
            }}
          >
            {f}
          </button>
        ))}
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
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const display = fontSize.replace('pt', '')

  function apply(val: string): void {
    const num = parseInt(val)
    if (!isNaN(num) && num >= 6 && num <= 96) {
      editor.chain().focus().setFontSize(`${num}pt`).run()
    }
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setDraft(display)
      }}
    >
      <PopoverTrigger asChild>
        {/* Non-focusable trigger — parent onMouseDown preventDefault keeps editor focus */}
        <div className="flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-input transition-colors hover:bg-accent/30">
          <span className="w-10 select-none text-center text-xs">{display}</span>
          <div className="flex h-7 w-5 shrink-0 items-center justify-center border-l border-input text-muted-foreground">
            <ChevronDown className="h-3 w-3" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-16 p-1"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply(draft)
            if (e.key === 'Escape') {
              setOpen(false)
              editor.view.focus()
            }
          }}
        />
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
                setOpen(false)
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
      <PopoverContent
        className="w-36 p-1"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent',
            paragraphStyle === 'p' && 'bg-accent/50'
          )}
          onMouseDown={(e) => { e.preventDefault(); apply('p') }}
        >
          Paragraph
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-bold transition-colors hover:bg-accent',
            paragraphStyle === 'h1' && 'bg-accent/50'
          )}
          style={{ fontSize: 18 }}
          onMouseDown={(e) => { e.preventDefault(); apply('h1') }}
        >
          Heading 1
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-semibold transition-colors hover:bg-accent',
            paragraphStyle === 'h2' && 'bg-accent/50'
          )}
          style={{ fontSize: 14 }}
          onMouseDown={(e) => { e.preventDefault(); apply('h2') }}
        >
          Heading 2
        </button>
        <button
          className={cn(
            'w-full rounded px-2 py-1.5 text-left font-medium transition-colors hover:bg-accent',
            paragraphStyle === 'h3' && 'bg-accent/50'
          )}
          style={{ fontSize: 12 }}
          onMouseDown={(e) => { e.preventDefault(); apply('h3') }}
        >
          Heading 3
        </button>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Line height picker
// ---------------------------------------------------------------------------

const LINE_HEIGHT_PRESETS: number[] = [1.0, 1.15, 1.5, 2.0]

function LineHeightIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {/* Tabler ti-line-height paths */}
      <path stroke="none" d="M0 0h24v24H0z" fill="none" strokeWidth="0" />
      <path d="M3 8l3 -3l3 3" />
      <path d="M3 16l3 3l3 -3" />
      <line x1="6" y1="5" x2="6" y2="19" />
      <line x1="13" y1="7" x2="20" y2="7" />
      <line x1="13" y1="12" x2="20" y2="12" />
      <line x1="13" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function SpacingBars({ value }: { value: number }): JSX.Element {
  const barH = 2
  const barW = 22
  const gap = Math.round(value * 4)
  const totalH = 3 * barH + 2 * gap
  return (
    <svg width={barW} height={totalH} className="shrink-0 overflow-visible">
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={0}
          y={i * (barH + gap)}
          width={barW}
          height={barH}
          rx={1}
          className="fill-current"
        />
      ))}
    </svg>
  )
}

function LineHeightPicker({
  editor,
  lineHeight,
  format,
}: {
  editor: Editor
  lineHeight: number | null
  format: DocumentFormat | undefined
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState('')

  const isMlaApa = format === 'mla' || format === 'apa'
  const effectiveLh = lineHeight ?? (isMlaApa ? 2.0 : null)

  function applyLh(value: number): void {
    editor.chain().focus().setLineHeight(value).run()
    setOpen(false)
    setShowCustom(false)
  }

  function applyCustom(): void {
    const num = parseFloat(customDraft)
    if (!isNaN(num) && num >= 0.5 && num <= 4.0) {
      applyLh(num)
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setShowCustom(false)
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <LineHeightIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Line height</TooltipContent>
      </Tooltip>

      <PopoverContent
        className="w-48 p-1"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {LINE_HEIGHT_PRESETS.map((preset) => {
          const isActive = effectiveLh !== null && Math.abs(effectiveLh - preset) < 0.001
          return (
            <button
              key={preset}
              className={cn(
                'flex w-full items-center justify-between rounded px-2.5 py-1.5 transition-colors focus:outline-none',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted/50'
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyLh(preset)}
            >
              <span className="text-xs font-medium tabular-nums">{preset.toFixed(2)}</span>
              <SpacingBars value={preset} />
            </button>
          )
        })}

        <div className="my-1 h-px bg-border" />

        {!showCustom ? (
          <button
            className="flex w-full items-center rounded px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-muted/50 focus:outline-none"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setShowCustom(true)
              setCustomDraft(effectiveLh !== null ? String(effectiveLh) : '')
            }}
          >
            Custom
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-2 pb-1 pt-0.5">
            <Input
              type="number"
              min={0.5}
              max={4.0}
              step={0.05}
              className="h-7 w-20 text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
              value={customDraft}
              autoFocus
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCustom()
                if (e.key === 'Escape') setShowCustom(false)
              }}
            />
            <Button
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={applyCustom}
            >
              Apply
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Table cell tools
// ---------------------------------------------------------------------------

function BorderColorIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </svg>
  )
}

function BorderWeightIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

function CellFillPicker({
  editor,
  currentFill,
}: {
  editor: Editor
  currentFill: string | null
}): JSX.Element {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <PaintBucket className="h-3.5 w-3.5 leading-none" />
              <span
                className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
                style={{ backgroundColor: currentFill ?? 'transparent' }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Cell fill color</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" side="bottom" align="start">
        <ColorSwatchGrid
          palette={HIGHLIGHT_PALETTE}
          current={currentFill ?? ''}
          onSelect={(c) => editor.chain().focus().setCellAttribute('backgroundColor', c).run()}
          onReset={() => editor.chain().focus().setCellAttribute('backgroundColor', null).run()}
          resetLabel="Remove fill"
        />
      </PopoverContent>
    </Popover>
  )
}

function CellBorderColorPicker({
  editor,
  currentColor,
  theme,
}: {
  editor: Editor
  currentColor: string | null
  theme: 'dark' | 'light'
}): JSX.Element {
  const themedPalette = COLOR_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
              <BorderColorIcon className="leading-none" />
              <span
                className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
                style={{ backgroundColor: currentColor ?? 'transparent' }}
              />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Border color</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-auto p-0" side="bottom" align="start">
        <ColorSwatchGrid
          palette={themedPalette}
          current={currentColor ?? ''}
          onSelect={(c) => editor.chain().focus().setCellAttribute('borderColor', c).run()}
          onReset={() => editor.chain().focus().setCellAttribute('borderColor', null).run()}
          resetLabel="Reset border color"
        />
      </PopoverContent>
    </Popover>
  )
}

const BORDER_WEIGHTS = [0.5, 1, 1.5, 2, 3, 4]

function CellBorderWeightPicker({
  editor,
  currentWidth,
}: {
  editor: Editor
  currentWidth: number | null
}): JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <BorderWeightIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Border weight</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-36 p-1"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {BORDER_WEIGHTS.map((w) => (
          <button
            key={w}
            className={cn(
              'flex w-full items-center gap-2.5 rounded px-2.5 py-1.5 transition-colors focus:outline-none',
              Math.abs((currentWidth ?? 1) - w) < 0.01
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/50'
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().setCellAttribute('borderWidth', w).run()
              setOpen(false)
            }}
          >
            <div className="flex-1">
              <div className="w-full rounded-full bg-current" style={{ height: `${w}px` }} />
            </div>
            <span className="text-xs tabular-nums">{w}px</span>
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          className="w-full rounded px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-muted/50 focus:outline-none"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            editor.chain().focus().setCellAttribute('borderWidth', null).run()
            setOpen(false)
          }}
        >
          Reset
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
  const format = document?.format
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setCitationPanelOpen = useAppStore((s) => s.setCitationPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)
  const musicPanelOpen = useAppStore((s) => s.musicPanelOpen)
  const theme = useAppStore((s) => s.theme)

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
      isAlignJustify: ctx.editor.isActive({ textAlign: 'justify' }),
      isBulletList: ctx.editor.isActive('bulletList'),
      isOrderedList: ctx.editor.isActive('orderedList'),
      isSubscript: ctx.editor.isActive('subscript'),
      isSuperscript: ctx.editor.isActive('superscript'),
      isLink: ctx.editor.isActive('link'),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo(),
      fontFamily: (() => {
        const raw = (ctx.editor.getAttributes('textStyle').fontFamily as string | undefined) ?? ''
        const clean = raw.replace(/^['"]|['"]$/g, '')
        if (clean) return clean
        if (format === 'mla' || format === 'apa') return 'Times New Roman'
        return 'Calibri'
      })(),
      fontSize: (ctx.editor.getAttributes('textStyle').fontSize as string | undefined) ?? '12pt',
      paragraphStyle: ctx.editor.isActive('heading', { level: 1 })
        ? 'h1'
        : ctx.editor.isActive('heading', { level: 2 })
        ? 'h2'
        : ctx.editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p',
      currentColorRaw: (ctx.editor.getAttributes('textStyle').color as string | undefined) ?? null,
      currentHighlight: (ctx.editor.getAttributes('highlight').color as string | undefined) ?? null,
      lineHeight:
        (ctx.editor.getAttributes('paragraph').lineHeight as number | null | undefined) ??
        (ctx.editor.getAttributes('heading').lineHeight as number | null | undefined) ??
        null,
      isInHeaderRole: (() => {
        const { selection, doc } = ctx.editor.state
        const $pos = doc.resolve(selection.from)
        const role = $pos.parent.attrs.role as string | undefined
        return role === 'mla-header' || role === 'apa-header'
      })(),
      isInTable: ctx.editor.isActive('tableCell') || ctx.editor.isActive('tableHeader'),
      tableCellBg:
        (ctx.editor.getAttributes('tableCell').backgroundColor as string | null) ??
        (ctx.editor.getAttributes('tableHeader').backgroundColor as string | null) ??
        null,
      tableCellBorderColor:
        (ctx.editor.getAttributes('tableCell').borderColor as string | null) ??
        (ctx.editor.getAttributes('tableHeader').borderColor as string | null) ??
        null,
      tableCellBorderWidth:
        (ctx.editor.getAttributes('tableCell').borderWidth as number | null) ??
        (ctx.editor.getAttributes('tableHeader').borderWidth as number | null) ??
        null,
    }),
  })

  const defaultTextColor = theme === 'dark' ? '#ffffff' : '#000000'
  const currentColor = s.currentColorRaw ?? defaultTextColor

  async function handleImageInsert(): Promise<void> {
    const dataUrl = await window.prose.dialog.openImage()
    if (dataUrl) editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  function handleToggleSubSup(mark: 'subscript' | 'superscript', isActive: boolean): void {
    // When turning off or when text is selected, use the standard toggle so the
    // mark is applied/removed from the selection range normally.
    if (isActive || !editor.state.selection.empty) {
      editor.chain().focus()[mark === 'subscript' ? 'toggleSubscript' : 'toggleSuperscript']().run()
      return
    }
    // Turning on with an empty cursor: insert a zero-width space carrying the
    // mark so the <sub>/<sup> element materialises in the DOM immediately and
    // the browser caret visually shifts to the correct vertical position.
    // Without this, the stored mark is pending but has no DOM node, so the
    // caret stays on the baseline until the first real character is typed.
    editor.chain().focus().insertContent({ type: 'text', text: '​', marks: [{ type: mark }] }).run()
  }

  return (
    <div
      className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border px-2"
      onMouseDown={(e) => e.preventDefault()}
    >
      {/* Font family */}
      <FontFamilyPicker editor={editor} fontFamily={s.fontFamily} />

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
      <ColorPicker editor={editor} currentColor={currentColor} theme={theme} />
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
      <ToolbarBtn
        icon={AlignJustify}
        title="Justify"
        active={s.isAlignJustify}
        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
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

      {/* Line height / subscript / superscript */}
      <LineHeightPicker editor={editor} lineHeight={s.lineHeight} format={format} />
      <ToolbarBtn
        icon={Subscript}
        title="Subscript"
        active={s.isSubscript}
        onClick={() => handleToggleSubSup('subscript', s.isSubscript)}
      />
      <ToolbarBtn
        icon={Superscript}
        title="Superscript"
        active={s.isSuperscript}
        onClick={() => handleToggleSubSup('superscript', s.isSuperscript)}
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

      {/* Table cell tools — only visible when cursor is inside a table */}
      {s.isInTable && (
        <>
          <Sep />
          <CellFillPicker editor={editor} currentFill={s.tableCellBg} />
          <CellBorderColorPicker editor={editor} currentColor={s.tableCellBorderColor} theme={theme} />
          <CellBorderWeightPicker editor={editor} currentWidth={s.tableCellBorderWidth} />
        </>
      )}

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
      {s.isInHeaderRole && (
        <ToolbarBtn
          icon={Hash}
          title="Insert page number"
          onClick={() => editor.chain().focus().insertPageNumber().run()}
        />
      )}

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
