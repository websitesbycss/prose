import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { FlipHorizontal2, FlipVertical2, PaintBucket } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { ShapeElement } from '@/types/slides'

const FILL_PALETTE = [
  '#fef08a', '#fde68a', '#fed7aa',
  '#fca5a5', '#f9a8d4', '#d8b4fe',
  '#a5f3fc', '#86efac', '#bfdbfe',
  '#f3f4f6', '#e5e7eb', '#d1d5db',
]

const STROKE_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

const BORDER_WEIGHTS = [0.5, 1, 1.5, 2, 3, 4]

function BorderColorIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
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

function CornerRadiusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 4H9C6.24 4 4 6.24 4 9v11" />
    </svg>
  )
}

function OpacityIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ColorPickerDropdown({ trigger, tooltip, children }: {
  trigger: React.ReactNode
  tooltip: string
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
    setOpen((o) => !o)
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div ref={btnRef} onClick={handleClick} style={{ display: 'inline-flex', alignItems: 'center' }}>
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
              onMouseDown={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault() }}
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

function BorderWeightPicker({ currentWidth, onApply }: {
  currentWidth: number
  onApply(w: number | undefined): void
}) {
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
        <TooltipContent side="bottom" className="text-xs">Stroke weight</TooltipContent>
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
              Math.abs(currentWidth - w) < 0.01
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-muted/50',
            )}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onApply(w); setOpen(false) }}
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
          onClick={() => { onApply(undefined); setOpen(false) }}
        >
          None
        </button>
      </PopoverContent>
    </Popover>
  )
}

interface Props {
  element: ShapeElement
  onUpdate(partial: Partial<ShapeElement>): void
}

export function ShapeStyleToolbar({ element, onUpdate }: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const borderWidth = element.border?.width ?? 0
  const borderColor = element.border?.color ?? '#000000'
  const borderStyle = element.border?.style ?? 'solid'
  const opacity = Math.round((element.opacity ?? 1) * 100)

  const themedStrokePalette = STROKE_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  const hasCornerRadius = element.shapeType === 'rect' || element.shapeType === 'roundRect'

  return (
    <div className="flex items-center gap-0.5">
      {/* Fill color */}
      <ColorPickerDropdown
        tooltip="Fill color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <PaintBucket className="h-3.5 w-3.5 leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
              style={{ backgroundColor: element.fill ?? 'transparent' }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={element.fill || '#ffffff'}
            current={element.fill ?? ''}
            palette={FILL_PALETTE}
            onChange={(c) => onUpdate({ fill: c })}
            onPaletteSelect={(c) => onUpdate({ fill: c })}
            onReset={() => { onUpdate({ fill: '#ffffff' }); close() }}
            resetLabel="Reset fill"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke color */}
      <ColorPickerDropdown
        tooltip="Stroke color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <BorderColorIcon className="leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
              style={{ backgroundColor: borderWidth > 0 ? borderColor : 'transparent' }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={borderColor}
            current={borderWidth > 0 ? borderColor : ''}
            palette={themedStrokePalette}
            onChange={(c) => onUpdate({ border: { color: c, width: borderWidth || 1, style: borderStyle } })}
            onPaletteSelect={(c) => onUpdate({ border: { color: c, width: borderWidth || 1, style: borderStyle } })}
            onReset={() => { onUpdate({ border: undefined }); close() }}
            resetLabel="Remove stroke"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke weight */}
      <BorderWeightPicker
        currentWidth={borderWidth}
        onApply={(w) => onUpdate({ border: w === undefined ? undefined : { color: borderColor, width: w, style: borderStyle } })}
      />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Corner radius */}
      {hasCornerRadius && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-6 items-center gap-0.5">
              <CornerRadiusIcon />
              <div className="flex h-6 overflow-hidden rounded border border-border/50">
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={element.cornerRadius ?? 0}
                  onChange={(e) => onUpdate({ cornerRadius: Number(e.target.value) })}
                  className="h-full w-10 bg-background px-1 text-[11px] focus:outline-none"
                />
                <div className="flex h-full items-center bg-muted px-1 text-[10px] text-muted-foreground select-none">
                  px
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Corner radius</TooltipContent>
        </Tooltip>
      )}

      {/* Opacity */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex h-6 items-center gap-0.5', hasCornerRadius && 'ml-1')}>
            <OpacityIcon />
            <div className="flex h-6 overflow-hidden rounded border border-border/50">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
                className="h-full w-10 bg-background px-1 text-[11px] focus:outline-none"
              />
              <div className="flex h-full items-center bg-muted px-1 text-[10px] text-muted-foreground select-none">
                %
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Opacity</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Flip H/V */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', element.flipH && '!text-primary')} onClick={() => onUpdate({ flipH: !element.flipH })}>
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Flip horizontal</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', element.flipV && '!text-primary')} onClick={() => onUpdate({ flipV: !element.flipV })}>
            <FlipVertical2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Flip vertical</TooltipContent>
      </Tooltip>
    </div>
  )
}
