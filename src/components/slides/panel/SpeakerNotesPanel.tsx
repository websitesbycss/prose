import { useRef, useState, useCallback, useEffect } from 'react'

interface Props {
  notes: string
  onChange(text: string): void
}

const MIN_H = 60
const MAX_H_FRAC = 0.4
const DEFAULT_H = 120

export function SpeakerNotesPanel({ notes, onChange }: Props): JSX.Element {
  const [height, setHeight] = useState(DEFAULT_H)
  const [localNotes, setLocalNotes] = useState(notes)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // Sync when slide changes (notes prop replaces local state)
  useEffect(() => { setLocalNotes(notes) }, [notes])

  function handleChange(text: string): void {
    setLocalNotes(text)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => onChangeRef.current(text), 500)
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const dragRef = useRef<{ startY: number; startH: number } | null>(null)

  const handleDragMouseDown = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startH: height }

    function onMove(ev: MouseEvent): void {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - ev.clientY
      const maxH = window.innerHeight * MAX_H_FRAC
      setHeight(Math.max(MIN_H, Math.min(maxH, dragRef.current.startH + delta)))
    }

    function onUp(): void {
      dragRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [height])

  // Prevent page-level drag cursor during resize
  useEffect(() => {
    // no-op — cleanup handled inside onUp
  }, [])

  return (
    <div
      style={{ height, flexShrink: 0 }}
      className="flex flex-col border-t border-border bg-background"
    >
      {/* Drag handle */}
      <div
        className="flex h-3 shrink-0 cursor-row-resize items-center justify-center hover:bg-accent/40"
        onMouseDown={handleDragMouseDown}
      >
        <div className="h-0.5 w-8 rounded-full bg-border/70" />
      </div>

      <div className="flex shrink-0 items-center px-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
          Speaker notes
        </span>
      </div>

      <textarea
        className="flex-1 resize-none bg-transparent px-3 py-1 text-xs text-foreground/80 placeholder:text-muted-foreground/40 focus:outline-none"
        placeholder="Click to add speaker notes…"
        value={localNotes}
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  )
}
