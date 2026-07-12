import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { createPortal } from 'react-dom'

const SWATCHES = [
  '#000000', '#ffffff', '#374151', '#6b7280', '#ef4444', '#f97316',
  '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
]

interface Props {
  value: string
  onChange(color: string): void
  children: React.ReactNode
  label?: string
}

export function ColorPickerPopover({ value, onChange, children, label }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Sync external value
  useEffect(() => { setHex(value) }, [value])

  function handleOpen(): void {
    if (!triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 4, left: r.left })
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (popoverRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  function handleHexChange(v: string): void {
    setHex(v)
    onChange(v)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = e.target.value
    setHex(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} className="cursor-pointer" title={label}>
        {children}
      </div>

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
          className="rounded-lg border border-border bg-background p-3 shadow-xl"
        >
          <HexColorPicker color={hex} onChange={handleHexChange} style={{ width: 192, height: 140 }} />

          {/* Swatches */}
          <div className="mt-2 grid grid-cols-6 gap-1">
            {SWATCHES.map((s) => (
              <button
                key={s}
                className="h-5 w-5 rounded border border-border/50 transition-transform hover:scale-110"
                style={{ background: s }}
                onClick={() => handleHexChange(s)}
              />
            ))}
          </div>

          {/* Hex input */}
          <input
            type="text"
            value={hex}
            onChange={handleInputChange}
            maxLength={7}
            className="mt-2 w-full rounded border border-border bg-background px-2 py-1 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>,
        document.body,
      )}
    </>
  )
}
