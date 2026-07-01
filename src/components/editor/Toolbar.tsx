import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { useEditorState } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { NodeSelection } from '@tiptap/pm/state'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  List, ListOrdered, IndentIcon, Outdent,
  Subscript, Superscript, Sigma,
  Image, Link2, Table2, BookOpen, Hash, SeparatorHorizontal,
  ChevronDown, Undo2, Redo2, Highlighter, PaintBucket, BarChart3,
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
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'
import type { PageMargins } from '@/types'

// Plain portal dropdown — bypasses Radix focus/pointer issues in Electron
function ColorPickerDropdown({
  trigger,
  tooltip,
  onOpen,
  children,
}: {
  trigger: React.ReactNode
  tooltip: string
  onOpen?: () => void
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (pickerRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  function handleClick() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    const left = Math.max(4, r.left + r.width / 2 - 110)
    setPos({ top: r.bottom + 4, left })
    const opening = !open
    setOpen((o) => !o)
    if (opening) onOpen?.()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={btnRef} onClick={handleClick} style={{ display: 'inline-flex' }}>
          {trigger}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">{tooltip}</TooltipContent>
      {createPortal(
        <AnimatePresence>
          {open && (
            <div
              ref={pickerRef}
              style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
              onMouseDown={(e) => {
                e.stopPropagation()
                if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
              }}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              >
                {children(close)}
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </Tooltip>
  )
}
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { enterVerticalMark, exitVerticalMark, type VerticalMark } from '@/lib/verticalMarkExit'
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
  isZoneEditor?: boolean
  defaultFontFamily?: string
  defaultFontSize?: number
  onOpenMathModal?: () => void
  onOpenChartPicker?: () => void
  onFindOpen?: () => void
  onFocusMode?: () => void
  documentMargins?: PageMargins | null
}

const FONT_FAMILIES = [
  'Calibri',
  'Times New Roman',
  'Georgia',
  'Arial',
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

function CompactGroup({
  icon: Icon, label, children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])
  function handleOpen() {
    if (!btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setOpen((o) => !o)
  }
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button ref={btnRef} variant="ghost" size="sm" className="h-7 px-1.5 flex items-center gap-0.5" onClick={handleOpen}>
            <Icon className="h-3.5 w-3.5" />
            <ChevronDown className="h-2.5 w-2.5 opacity-50" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
      </Tooltip>
      {open && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="flex items-center gap-0.5 rounded-lg border border-border bg-background p-1 shadow-lg"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
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
    <ColorPickerDropdown
      tooltip="Font color"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <span className="text-[15px] font-normal leading-[14px] w-4 text-center">A</span>
          <span className="mt-[5px] h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600" style={{ backgroundColor: currentColor, borderColor: currentColor }} />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={currentColor || '#000000'}
          current={currentColor}
          palette={themedPalette}
          onChange={(c) => editor.chain().setColor(c).run()}
          onPaletteSelect={(c) => editor.chain().setColor(c).run()}
          onReset={() => { editor.chain().focus().unsetColor().run(); close() }}
          resetLabel="Reset color"
        />
      )}
    </ColorPickerDropdown>
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
    <ColorPickerDropdown
      tooltip="Highlight"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <Highlighter className="h-3.5 w-3.5 leading-none" />
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
            style={{ backgroundColor: currentHighlight ?? 'transparent', borderColor: currentHighlight ?? undefined }} />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={currentHighlight || '#fef08a'}
          current={currentHighlight ?? ''}
          palette={HIGHLIGHT_PALETTE}
          onChange={(c) => editor.chain().setHighlight({ color: c }).run()}
          onPaletteSelect={(c) => editor.chain().setHighlight({ color: c }).run()}
          onReset={() => { editor.chain().focus().unsetHighlight().run(); close() }}
          resetLabel="Remove highlight"
        />
      )}
    </ColorPickerDropdown>
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
      <Tooltip>
        <TooltipTrigger asChild>
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
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font family</TooltipContent>
      </Tooltip>
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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {/* Non-focusable trigger — parent onMouseDown preventDefault keeps editor focus */}
            <div className="flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-input transition-colors hover:bg-accent/30">
              <span className="w-10 select-none text-center text-xs">{display}</span>
              <div className="flex h-7 w-5 shrink-0 items-center justify-center border-l border-input text-muted-foreground">
                <ChevronDown className="h-3 w-3" />
              </div>
            </div>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Font size</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-16 p-1"
        side="bottom"
        align="start"
        onCloseAutoFocus={(e) => { e.preventDefault(); editor.view.focus() }}
      >
        <Input
          autoFocus
          className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="h-7 w-28 justify-between border-input px-2 text-xs font-normal"
            >
              <span>{labels[paragraphStyle] ?? 'Paragraph'}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Text style</TooltipContent>
      </Tooltip>
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
    editor.chain().focus().setCustomLineHeight(value).run()
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
          <div className="flex flex-col gap-1 px-2 pb-1 pt-0.5">
            <div className="flex items-center gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded border border-input text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const v = Math.max(0.5, Math.round((parseFloat(customDraft || '1') - 0.05) * 100) / 100)
                  setCustomDraft(String(v))
                }}
              >−</button>
              <Input
                autoFocus
                className="h-7 w-16 text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCustom()
                  if (e.key === 'Escape') setShowCustom(false)
                  if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    const v = Math.min(4.0, Math.round((parseFloat(customDraft || '1') + 0.05) * 100) / 100)
                    setCustomDraft(String(v))
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    const v = Math.max(0.5, Math.round((parseFloat(customDraft || '1') - 0.05) * 100) / 100)
                    setCustomDraft(String(v))
                  }
                }}
              />
              <button
                className="flex h-7 w-7 items-center justify-center rounded border border-input text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const v = Math.min(4.0, Math.round((parseFloat(customDraft || '1') + 0.05) * 100) / 100)
                  setCustomDraft(String(v))
                }}
              >+</button>
            </div>
            <Button
              size="sm"
              className="h-7 w-full px-2 text-xs"
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
    <ColorPickerDropdown
      tooltip="Cell fill color"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <PaintBucket className="h-3.5 w-3.5 leading-none" />
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
            style={{ backgroundColor: currentFill ?? 'transparent', borderColor: currentFill ?? undefined }} />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={currentFill || '#fef08a'}
          current={currentFill ?? ''}
          palette={HIGHLIGHT_PALETTE}
          onChange={(c) => editor.chain().setCellAttribute('backgroundColor', c).run()}
          onPaletteSelect={(c) => editor.chain().setCellAttribute('backgroundColor', c).run()}
          onReset={() => { editor.chain().focus().setCellAttribute('backgroundColor', null).run(); close() }}
          resetLabel="Remove fill"
        />
      )}
    </ColorPickerDropdown>
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
    <ColorPickerDropdown
      tooltip="Border color"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <BorderColorIcon className="leading-none" />
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
            style={{ backgroundColor: currentColor ?? 'transparent', borderColor: currentColor ?? undefined }} />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={currentColor || '#000000'}
          current={currentColor ?? ''}
          palette={themedPalette}
          onChange={(c) => editor.chain().setCellAttribute('borderColor', c).run()}
          onPaletteSelect={(c) => editor.chain().setCellAttribute('borderColor', c).run()}
          onReset={() => { editor.chain().focus().setCellAttribute('borderColor', null).run(); close() }}
          resetLabel="Reset border color"
        />
      )}
    </ColorPickerDropdown>
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

// Applies attrs to the image node at pos and explicitly restores NodeSelection atomically.
function applyImageAttrs(editor: Editor, pos: number, nodeAttrs: Record<string, unknown>, newAttrs: Record<string, unknown>): void {
  editor.chain()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, undefined, { ...nodeAttrs, ...newAttrs })
      return true
    })
    .setNodeSelection(pos)
    .run()
}

function ImageBorderColorPicker({
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
  const capturedRef = useRef<{ pos: number; attrs: Record<string, unknown> } | null>(null)

  function capture() {
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
      capturedRef.current = { pos: selection.from, attrs: { ...selection.node.attrs } }
    }
  }

  function apply(newAttrs: Record<string, unknown>) {
    // Prefer live selection; fall back to captured pos if focus moved away
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
      applyImageAttrs(editor, selection.from, { ...selection.node.attrs }, newAttrs)
    } else if (capturedRef.current) {
      const { pos } = capturedRef.current
      const node = editor.state.doc.nodeAt(pos)
      if (node && node.type.name === 'image') {
        applyImageAttrs(editor, pos, { ...node.attrs }, newAttrs)
      }
    }
  }

  return (
    <ColorPickerDropdown
      tooltip="Image border color"
      onOpen={capture}
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <BorderColorIcon className="leading-none" />
          <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
            style={{ backgroundColor: currentColor ?? 'transparent', borderColor: currentColor ?? undefined }} />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={currentColor || '#000000'}
          current={currentColor ?? ''}
          palette={themedPalette}
          onChange={(c) => apply({ borderColor: c })}
          onPaletteSelect={(c) => apply({ borderColor: c })}
          onReset={() => { apply({ borderColor: null, borderWidth: null }); close() }}
          resetLabel="Remove border"
        />
      )}
    </ColorPickerDropdown>
  )
}

function ImageBorderWeightPicker({
  editor,
  currentWidth,
}: {
  editor: Editor
  currentWidth: number | null
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const capturedRef = useRef<{ pos: number; attrs: Record<string, unknown> } | null>(null)

  function handleOpenChange(o: boolean) {
    if (o) {
      const { selection } = editor.state
      if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
        capturedRef.current = { pos: selection.from, attrs: { ...selection.node.attrs } }
      }
    }
    setOpen(o)
  }

  function apply(newAttrs: Record<string, unknown>) {
    const { selection } = editor.state
    if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
      applyImageAttrs(editor, selection.from, { ...selection.node.attrs }, newAttrs)
    } else if (capturedRef.current) {
      const { pos } = capturedRef.current
      const node = editor.state.doc.nodeAt(pos)
      if (node && node.type.name === 'image') {
        applyImageAttrs(editor, pos, { ...node.attrs }, newAttrs)
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <BorderWeightIcon />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Image border weight</TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-36 p-1"
        side="bottom"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
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
            onClick={() => { apply({ borderWidth: w }); setOpen(false) }}
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
          onClick={() => { apply({ borderWidth: null, borderColor: null }); setOpen(false) }}
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
  isZoneEditor,
  defaultFontFamily = 'Calibri',
  defaultFontSize = 12,
  onOpenMathModal,
  onOpenChartPicker,
  onFindOpen,
  onFocusMode,
  documentMargins,
}: {
  editor: Editor
  document: Document | null
  onApplyFormat: (format: 'mla' | 'apa') => void
  headingFontSizes: HeadingFontSizes
  isZoneEditor: boolean
  defaultFontFamily?: string
  defaultFontSize?: number
  onOpenMathModal?: () => void
  onOpenChartPicker?: () => void
  onFindOpen?: () => void
  onFocusMode?: () => void
  documentMargins?: PageMargins | null
}): JSX.Element {
  const format = document?.format
  const setCitationPanelOpen = useAppStore((s) => s.setCitationPanelOpen)
  const citationPanelOpen = useAppStore((s) => s.citationPanelOpen)
  const theme = useAppStore((s) => s.theme)

  const toolbarScrollRef = useRef<HTMLDivElement>(null)
  const [toolbarWidth, setToolbarWidth] = useState(9999)
  const compact = toolbarWidth < 1000
  useEffect(() => {
    const el = toolbarScrollRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => { if (entry) setToolbarWidth(entry.contentRect.width) })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

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
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
      fontFamily: (() => {
        const raw = (ctx.editor.getAttributes('textStyle').fontFamily as string | undefined) ?? ''
        const clean = raw.replace(/^['"]|['"]$/g, '')
        if (clean) return clean
        if (format === 'mla' || format === 'apa') return 'Times New Roman'
        return defaultFontFamily
      })(),
      fontSize: (ctx.editor.getAttributes('textStyle').fontSize as string | undefined) ?? `${defaultFontSize}pt`,
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
      isOnImage: (() => {
        const { selection } = ctx.editor.state
        return selection instanceof NodeSelection && selection.node.type.name === 'image'
      })(),
      imageBorderColor: (() => {
        const { selection } = ctx.editor.state
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          return (selection.node.attrs.borderColor as string | null) ?? null
        }
        return null
      })(),
      imageBorderWidth: (() => {
        const { selection } = ctx.editor.state
        if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
          return (selection.node.attrs.borderWidth as number | null) ?? null
        }
        return null
      })(),
    }),
  })

  const defaultTextColor = theme === 'dark' ? '#ffffff' : '#000000'
  const currentColor = s.currentColorRaw ?? defaultTextColor

  async function handleImageInsert(): Promise<void> {
    const dataUrl = await window.prose.dialog.openImage()
    if (dataUrl) editor.chain().focus().setImage({ src: dataUrl }).run()
  }

  function handleToggleSubSup(mark: VerticalMark, isActive: boolean): void {
    if (!editor.state.selection.empty) {
      editor.chain().focus()[mark === 'subscript' ? 'toggleSubscript' : 'toggleSuperscript']().run()
      return
    }
    if (isActive) {
      exitVerticalMark(editor, mark)
      return
    }
    enterVerticalMark(editor, mark)
  }

  return (
    <div
      className="relative z-[1] flex h-10 shrink-0 border-b border-border bg-muted/20 text-foreground"
    >
    {/* Scrollable formatting controls */}
    <div
      ref={toolbarScrollRef}
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-2"
      onMouseDown={(e) => e.preventDefault()}
    >
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
      {compact ? (
        <CompactGroup icon={AlignLeft} label="Alignment">
          <ToolbarBtn icon={AlignLeft} title="Align left" active={s.isAlignLeft} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarBtn icon={AlignCenter} title="Align center" active={s.isAlignCenter} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarBtn icon={AlignRight} title="Align right" active={s.isAlignRight} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <ToolbarBtn icon={AlignJustify} title="Justify" active={s.isAlignJustify} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
        </CompactGroup>
      ) : (
        <>
          <ToolbarBtn icon={AlignLeft} title="Align left" active={s.isAlignLeft} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <ToolbarBtn icon={AlignCenter} title="Align center" active={s.isAlignCenter} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <ToolbarBtn icon={AlignRight} title="Align right" active={s.isAlignRight} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <ToolbarBtn icon={AlignJustify} title="Justify" active={s.isAlignJustify} onClick={() => editor.chain().focus().setTextAlign('justify').run()} />
        </>
      )}

      {!isZoneEditor && <Sep />}

      {/* Lists and indent */}
      {!isZoneEditor && (
        compact ? (
          <CompactGroup icon={List} label="Lists &amp; indent">
            <ToolbarBtn icon={List} title="Bullet list" active={s.isBulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolbarBtn icon={ListOrdered} title="Numbered list" active={s.isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <ToolbarBtn icon={IndentIcon} title="Indent (Tab)" onClick={() => editor.chain().focus().indent().run()} />
            <ToolbarBtn icon={Outdent} title="Outdent (Shift+Tab)" onClick={() => editor.chain().focus().outdent().run()} />
            <ToolbarBtn icon={Subscript} title="Subscript" active={s.isSubscript} onClick={() => handleToggleSubSup('subscript', s.isSubscript)} />
            <ToolbarBtn icon={Superscript} title="Superscript" active={s.isSuperscript} onClick={() => handleToggleSubSup('superscript', s.isSuperscript)} />
          </CompactGroup>
        ) : (
          <>
            <ToolbarBtn icon={List} title="Bullet list" active={s.isBulletList} onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolbarBtn icon={ListOrdered} title="Numbered list" active={s.isOrderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
            <ToolbarBtn icon={IndentIcon} title="Indent (Tab)" onClick={() => editor.chain().focus().indent().run()} />
            <ToolbarBtn icon={Outdent} title="Outdent (Shift+Tab)" onClick={() => editor.chain().focus().outdent().run()} />
          </>
        )
      )}

      <Sep />

      {/* Line height / subscript / superscript */}
      <LineHeightPicker editor={editor} lineHeight={s.lineHeight} format={format} />
      {(!compact || isZoneEditor) && (
        <>
          <ToolbarBtn icon={Subscript} title="Subscript" active={s.isSubscript} onClick={() => handleToggleSubSup('subscript', s.isSubscript)} />
          <ToolbarBtn icon={Superscript} title="Superscript" active={s.isSuperscript} onClick={() => handleToggleSubSup('superscript', s.isSuperscript)} />
        </>
      )}
      {(!compact || isZoneEditor) && (
        <ToolbarBtn icon={Sigma} title="Insert equation (LaTeX)" onClick={() => onOpenMathModal?.()} />
      )}

      <Sep />

      {/* Insert */}
      {compact && !isZoneEditor ? (
        <CompactGroup icon={Image} label="Insert">
          <ToolbarBtn icon={Image} title="Insert image" onClick={() => void handleImageInsert()} />
          <ToolbarBtn icon={Table2} title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
          <ToolbarBtn icon={Sigma} title="Insert equation (LaTeX)" onClick={() => onOpenMathModal?.()} />
          <ToolbarBtn icon={SeparatorHorizontal} title="Insert page break" onClick={() => editor.chain().focus().insertPageBreak().run()} />
          <ToolbarBtn icon={BarChart3} title="Insert chart" onClick={() => onOpenChartPicker?.()} />
          {/* Link popover stays open on click — stop propagation so compact group doesn't close */}
          <span onClick={(e) => e.stopPropagation()}>
            <LinkPopover editor={editor} isLink={s.isLink} />
          </span>
        </CompactGroup>
      ) : (
        <>
          {!isZoneEditor && <ToolbarBtn icon={Image} title="Insert image" onClick={() => void handleImageInsert()} />}
          <LinkPopover editor={editor} isLink={s.isLink} />
          {isZoneEditor && <ToolbarBtn icon={Hash} title="Insert page number" onClick={() => editor.chain().focus().insertPageNumber().run()} />}
          {!isZoneEditor && <ToolbarBtn icon={Table2} title="Insert table" onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />}
          {!isZoneEditor && <ToolbarBtn icon={SeparatorHorizontal} title="Insert page break" onClick={() => editor.chain().focus().insertPageBreak().run()} />}
          {!isZoneEditor && <ToolbarBtn icon={BarChart3} title="Insert chart" onClick={() => onOpenChartPicker?.()} />}
        </>
      )}
      {isZoneEditor && compact && <ToolbarBtn icon={Hash} title="Insert page number" onClick={() => editor.chain().focus().insertPageNumber().run()} />}

      {/* Image border tools — only visible when an image is selected */}
      {s.isOnImage && !isZoneEditor && (
        <>
          <Sep />
          <ImageBorderColorPicker editor={editor} currentColor={s.imageBorderColor} theme={theme} />
          <ImageBorderWeightPicker editor={editor} currentWidth={s.imageBorderWidth} />
        </>
      )}

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
      <Sep />

      {/* Citations */}
      <ToolbarBtn
        icon={BookOpen}
        title="Citations"
        active={citationPanelOpen}
        onClick={() => setCitationPanelOpen(!citationPanelOpen)}
      />

      <ChevronDown className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/0" aria-hidden />
    </div>{/* end scrollable */}

    {/* Persistent right section */}
    <ToolbarRightSection
      fileType="document"
      documentId={document?.id ?? null}
      documentTitle={document?.title}
      documentMargins={documentMargins}
      onFindOpen={onFindOpen}
      onFocusMode={onFocusMode}
    />
    </div>
  )
}

export default function Toolbar({
  editor,
  document,
  onApplyFormat,
  headingFontSizes,
  isZoneEditor = false,
  defaultFontFamily,
  defaultFontSize,
  onOpenMathModal,
  onOpenChartPicker,
  onFindOpen,
  onFocusMode,
  documentMargins,
}: ToolbarProps): JSX.Element {
  if (!editor) {
    return (
      <div className="relative z-[1] flex h-10 shrink-0 border-b border-border bg-muted/20">
        <div className="flex-1" />
        <ToolbarRightSection fileType="document" documentId={null} onFindOpen={onFindOpen} onFocusMode={onFocusMode} />
      </div>
    )
  }
  return (
    <ToolbarInner
      editor={editor}
      document={document}
      onApplyFormat={onApplyFormat}
      headingFontSizes={headingFontSizes}
      isZoneEditor={isZoneEditor}
      defaultFontFamily={defaultFontFamily}
      defaultFontSize={defaultFontSize}
      onOpenMathModal={onOpenMathModal}
      onOpenChartPicker={onOpenChartPicker}
      onFindOpen={onFindOpen}
      onFocusMode={onFocusMode}
      documentMargins={documentMargins}
    />
  )
}
