// Shared toolbar icons and components used across slides toolbars.
import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export const BORDER_WEIGHTS = [0.5, 1, 1.5, 2, 3, 4]

export function BorderColorIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="1" />
    </svg>
  )
}

export function BorderWeightIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0">
      <line x1="3" y1="6" x2="21" y2="6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="3" y1="18" x2="21" y2="18" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

export function CornerRadiusIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 4H9C6.24 4 4 6.24 4 9v11" />
    </svg>
  )
}

export function OpacityIcon(): JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" />
      <path d="M12 3a9 9 0 0 0 0 18" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function ColorPickerDropdown({ trigger, tooltip, children }: {
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

export function BorderWeightPicker({ currentWidth, onApply }: {
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
