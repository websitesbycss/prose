import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MAX_COLS = 8
const MAX_ROWS = 8

interface Props {
  children: React.ReactNode
  onSelect(cols: number, rows: number): void
}

export function TablePickerPopover({ children, onSelect }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState({ col: 0, row: 0 })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function handleOpen() {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setOpen((o) => !o)
  }

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="inline-flex items-center">
        {children}
      </div>

      {open && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="rounded-lg border border-border bg-background p-2 shadow-xl"
        >
          <div className="mb-1.5 text-center text-[11px] text-muted-foreground">
            {hover.col > 0 && hover.row > 0
              ? `${hover.col} × ${hover.row} table`
              : 'Select table size'}
          </div>
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 20px)` }}>
            {Array.from({ length: MAX_ROWS }, (_, r) =>
              Array.from({ length: MAX_COLS }, (_, c) => (
                <button
                  key={`${r}-${c}`}
                  className="h-5 w-5 rounded-[2px] border"
                  style={{
                    borderColor: r < hover.row && c < hover.col ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                    background: r < hover.row && c < hover.col ? 'hsl(var(--primary)/0.15)' : 'transparent',
                  }}
                  onMouseEnter={() => setHover({ col: c + 1, row: r + 1 })}
                  onClick={() => { onSelect(c + 1, r + 1); setOpen(false) }}
                />
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
