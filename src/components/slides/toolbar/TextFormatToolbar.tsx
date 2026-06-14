import { useState } from 'react'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  PaintBucket, ChevronDown,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { TextElement } from '@/types/slides'
import { BorderColorIcon, BorderWeightPicker, ColorPickerDropdown } from './ToolbarShared'

const FONT_FAMILIES = ['Calibri', 'Times New Roman', 'Georgia', 'Arial', 'Courier New']
const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72, 96]
const LINE_HEIGHT_PRESETS = [1.0, 1.15, 1.5, 2.0]

const COLOR_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

const FILL_PALETTE = [
  '#fef08a', '#fde68a', '#fed7aa',
  '#fca5a5', '#f9a8d4', '#d8b4fe',
  '#a5f3fc', '#86efac', '#bfdbfe',
  '#f3f4f6', '#e5e7eb', '#d1d5db',
]

interface Props {
  element: TextElement
  onUpdate(partial: Partial<TextElement>): void
}

// ── Font family picker ────────────────────────────────────────────────────────

function FontFamilyPicker({ fontFamily, onApply }: { fontFamily: string; onApply: (ff: string) => void }) {
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
            className={cn('w-full rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent', fontFamily === f && 'bg-accent/50 font-medium')}
            style={{ fontFamily: f }}
            onMouseDown={(e) => { e.preventDefault(); onApply(f); setOpen(false) }}
          >
            {f}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}

// ── Font size picker ──────────────────────────────────────────────────────────

function FontSizePicker({ fontSize, onApply }: { fontSize: number; onApply: (fs: number) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  function apply(val: string) {
    const num = parseInt(val)
    if (!isNaN(num) && num >= 6 && num <= 200) onApply(num)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setDraft(String(fontSize)) }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <div className="flex h-7 cursor-pointer items-center overflow-hidden rounded-md border border-input transition-colors hover:bg-accent/30">
              <span className="w-10 select-none text-center text-xs">{fontSize}</span>
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
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <Input
          autoFocus
          className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply(draft); if (e.key === 'Escape') setOpen(false) }}
        />
        <div className="flex flex-col">
          {FONT_SIZE_PRESETS.map((size) => (
            <button
              key={size}
              className={cn('rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent', fontSize === size && 'bg-accent/50 font-medium')}
              onMouseDown={(e) => { e.preventDefault(); onApply(size); setOpen(false) }}
            >
              {size}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ── Line height icon & bars ───────────────────────────────────────────────────

function LineHeightIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
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
        <rect key={i} x={0} y={i * (barH + gap)} width={barW} height={barH} rx={1} className="fill-current" />
      ))}
    </svg>
  )
}

function LineHeightPicker({ lineHeight, onChange }: { lineHeight: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDraft, setCustomDraft] = useState('')

  function applyLh(value: number): void {
    onChange(value)
    setOpen(false)
    setShowCustom(false)
  }

  function applyCustom(): void {
    const num = parseFloat(customDraft)
    if (!isNaN(num) && num >= 0.5 && num <= 4.0) applyLh(num)
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setShowCustom(false) }}>
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
      <PopoverContent className="w-48 p-1" side="bottom" align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        {LINE_HEIGHT_PRESETS.map((preset) => {
          const isActive = Math.abs(lineHeight - preset) < 0.001
          return (
            <button
              key={preset}
              className={cn(
                'flex w-full items-center justify-between rounded px-2.5 py-1.5 transition-colors focus:outline-none',
                isActive ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted/50',
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
            onClick={() => { setShowCustom(true); setCustomDraft(String(lineHeight)) }}
          >
            Custom
          </button>
        ) : (
          <div className="flex flex-col gap-1 px-2 pb-1 pt-0.5">
            <div className="flex items-center gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded border border-input text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { const v = Math.max(0.5, Math.round((parseFloat(customDraft || '1') - 0.05) * 100) / 100); setCustomDraft(String(v)) }}
              >−</button>
              <Input
                autoFocus
                className="h-7 w-16 text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
                value={customDraft}
                onChange={(e) => setCustomDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyCustom()
                  if (e.key === 'Escape') setShowCustom(false)
                  if (e.key === 'ArrowUp') { e.preventDefault(); const v = Math.min(4.0, Math.round((parseFloat(customDraft || '1') + 0.05) * 100) / 100); setCustomDraft(String(v)) }
                  if (e.key === 'ArrowDown') { e.preventDefault(); const v = Math.max(0.5, Math.round((parseFloat(customDraft || '1') - 0.05) * 100) / 100); setCustomDraft(String(v)) }
                }}
              />
              <button
                className="flex h-7 w-7 items-center justify-center rounded border border-input text-xs hover:bg-accent"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { const v = Math.min(4.0, Math.round((parseFloat(customDraft || '1') + 0.05) * 100) / 100); setCustomDraft(String(v)) }}
              >+</button>
            </div>
            <Button size="sm" className="h-7 w-full px-2 text-xs" onClick={applyCustom}>Apply</Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ── Main toolbar ──────────────────────────────────────────────────────────────

export function TextFormatToolbar({ element, onUpdate }: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)

  const isBold = element.content.includes('<strong>') || element.content.includes('<b>')
  const isItalic = element.content.includes('<em>') || element.content.includes('<i>')
  const isUnderline = element.content.includes('<u>')
  const isStrike = element.content.includes('<s>') || element.content.includes('<del>')

  function wrapToggle(tag: string, openTag: string, closeTag: string, test: boolean) {
    if (test) {
      onUpdate({ content: element.content.replace(new RegExp(`<${tag}>|<\/${tag}>`, 'gi'), '') })
    } else {
      onUpdate({ content: `<${openTag}>${element.content}</${closeTag}>` })
    }
  }

  const themedColorPalette = COLOR_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  return (
    <div className="flex items-center gap-0.5">
      {/* Font family */}
      <FontFamilyPicker fontFamily={element.fontFamily} onApply={(ff) => onUpdate({ fontFamily: ff })} />

      {/* Font size */}
      <FontSizePicker fontSize={element.fontSize} onApply={(fs) => onUpdate({ fontSize: fs })} />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Bold / Italic / Underline / Strikethrough */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', isBold && '!text-primary')} onClick={() => wrapToggle('strong', 'strong', 'strong', isBold)}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Bold</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', isItalic && '!text-primary')} onClick={() => wrapToggle('em', 'em', 'em', isItalic)}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Italic</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', isUnderline && '!text-primary')} onClick={() => wrapToggle('u', 'u', 'u', isUnderline)}>
            <Underline className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Underline</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', isStrike && '!text-primary')} onClick={() => wrapToggle('s', 's', 's', isStrike)}>
            <Strikethrough className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Strikethrough</TooltipContent>
      </Tooltip>

      {/* Text color — "A" letter + color swatch */}
      <ColorPickerDropdown
        tooltip="Font color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <span className="text-[15px] font-normal leading-[14px] w-4 text-center">A</span>
            <span className="mt-[5px] h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600" style={{ backgroundColor: element.color, borderColor: element.color ?? undefined }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={element.color || '#1a1a1a'}
            current={element.color}
            palette={themedColorPalette}
            onChange={(c) => onUpdate({ color: c })}
            onPaletteSelect={(c) => onUpdate({ color: c })}
            onReset={() => { onUpdate({ color: theme === 'dark' ? '#ffffff' : '#1a1a1a' }); close() }}
            resetLabel="Reset color"
          />
        )}
      </ColorPickerDropdown>

      {/* Background color — PaintBucket + color swatch */}
      <ColorPickerDropdown
        tooltip="Background color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <PaintBucket className="h-3.5 w-3.5 leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600" style={{ backgroundColor: element.fill ?? 'transparent', borderColor: element.fill ?? undefined }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={element.fill || '#fef08a'}
            current={element.fill ?? ''}
            palette={FILL_PALETTE}
            onChange={(c) => onUpdate({ fill: c })}
            onPaletteSelect={(c) => onUpdate({ fill: c })}
            onReset={() => { onUpdate({ fill: undefined }); close() }}
            resetLabel="Remove fill"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke color — BorderColorIcon + swatch */}
      <ColorPickerDropdown
        tooltip="Stroke color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <BorderColorIcon className="leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
              style={{ backgroundColor: (element.border?.width ?? 0) > 0 ? (element.border?.color ?? 'transparent') : 'transparent', borderColor: (element.border?.width ?? 0) > 0 ? (element.border?.color ?? undefined) : undefined }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={element.border?.color || '#000000'}
            current={(element.border?.width ?? 0) > 0 ? (element.border?.color ?? '') : ''}
            palette={themedColorPalette}
            onChange={(c) => onUpdate({ border: { color: c, width: element.border?.width || 1, style: element.border?.style ?? 'solid' } })}
            onPaletteSelect={(c) => onUpdate({ border: { color: c, width: element.border?.width || 1, style: element.border?.style ?? 'solid' } })}
            onReset={() => { onUpdate({ border: undefined }); close() }}
            resetLabel="Remove stroke"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke weight */}
      <BorderWeightPicker
        currentWidth={element.border?.width ?? 0}
        onApply={(w) => onUpdate({ border: w === undefined ? undefined : { color: element.border?.color ?? '#000000', width: w, style: element.border?.style ?? 'solid' } })}
      />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Text alignment */}
      {(['left', 'center', 'right', 'justify'] as const).map((a, i) => {
        const icons = [AlignLeft, AlignCenter, AlignRight, AlignJustify]
        const Icon = icons[i]!
        const labels = ['Align left', 'Align center', 'Align right', 'Justify']
        return (
          <Tooltip key={a}>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className={cn('h-7 w-7', element.align === a && '!text-primary')} onClick={() => onUpdate({ align: a })}>
                <Icon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{labels[i]}</TooltipContent>
          </Tooltip>
        )
      })}

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Line height */}
      <LineHeightPicker lineHeight={element.lineHeight} onChange={(v) => onUpdate({ lineHeight: v })} />
    </div>
  )
}
