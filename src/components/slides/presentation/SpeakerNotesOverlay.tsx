import type { Slide } from '@/types/slides'

interface Props {
  slide: Slide
  currentIndex: number
  total: number
  elapsedSeconds: number
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function SpeakerNotesOverlay({ slide, currentIndex, total, elapsedSeconds }: Props): JSX.Element {
  return (
    <div className="fixed bottom-16 left-4 right-4 z-[99997] flex items-start gap-4 rounded-xl bg-black/80 p-4 backdrop-blur-sm">
      {/* Slide info */}
      <div className="shrink-0 text-center">
        <div className="text-2xl font-bold tabular-nums text-white">{currentIndex + 1}</div>
        <div className="text-[11px] text-white/50">of {total}</div>
        <div className="mt-2 font-mono text-sm tabular-nums text-white/60">{formatTime(elapsedSeconds)}</div>
      </div>

      <div className="h-16 w-px bg-white/10" />

      {/* Notes text */}
      <div className="flex-1 overflow-y-auto">
        {slide.notes ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{slide.notes}</p>
        ) : (
          <p className="text-sm italic text-white/30">No speaker notes for this slide.</p>
        )}
      </div>
    </div>
  )
}
