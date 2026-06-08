import { useEffect, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  currentIndex: number
  total: number
  notesVisible: boolean
  onPrev(): void
  onNext(): void
  onToggleNotes(): void
  onExit(): void
}

export function PresentationToolbar({
  currentIndex, total, notesVisible, onPrev, onNext, onToggleNotes, onExit,
}: Props): JSX.Element {
  const [visible, setVisible] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    setVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => setVisible(false), 2000)
  }, [])

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (e.clientY > window.innerHeight - 80) show()
    }
    window.addEventListener('mousemove', onMove)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [show])

  return (
    <div
      className={cn(
        'pointer-events-none fixed bottom-0 left-0 right-0 z-[99998] flex items-center justify-center pb-4 transition-opacity duration-300',
        visible ? 'pointer-events-auto opacity-100' : 'opacity-0',
      )}
      onMouseEnter={show}
    >
      <div className="flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 backdrop-blur-sm">
        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          onClick={onPrev}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <span className="min-w-[48px] text-center text-sm tabular-nums text-white/80">
          {currentIndex + 1} / {total}
        </span>

        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          onClick={onNext}
          disabled={currentIndex >= total - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </button>

        <div className="mx-1 h-4 w-px bg-white/20" />

        <button
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white',
            notesVisible && 'bg-white/20 text-white',
          )}
          onClick={onToggleNotes}
          title="Toggle speaker notes (N)"
        >
          <MessageSquare className="h-4 w-4" />
        </button>

        <button
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          onClick={onExit}
          title="Exit presentation (Esc)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
