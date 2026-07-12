import { useEffect } from 'react'
import type { Slide, PresentationTheme, PresentationSettings } from '@/types/slides'
import { SlideThumbnail } from '../panel/SlideThumbnail'

interface Props {
  slides: Slide[]
  theme: PresentationTheme
  settings: PresentationSettings
  currentIndex: number
  onSelect(index: number): void
  onClose(): void
}

export function SlideGridOverview({ slides, theme, settings, currentIndex, onSelect, onClose }: Props): JSX.Element {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape' || e.key === 'g' || e.key === 'G') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[99999] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      <div className="flex shrink-0 items-center justify-between px-8 py-4">
        <span className="text-sm font-medium text-white/60">All slides — click to jump</span>
        <button
          className="rounded-md px-3 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
          onClick={onClose}
        >
          Close (G / Esc)
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-8 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {slides.map((slide, idx) => (
            <div
              key={slide.id}
              className="cursor-pointer"
              onClick={() => { onSelect(idx); onClose() }}
            >
              <SlideThumbnail
                slide={slide}
                slideNumber={idx + 1}
                theme={theme}
                settings={settings}
                isActive={idx === currentIndex}
                isDragOver={false}
                onMouseDown={() => {/* handled by parent onClick */}}
                onClick={() => { onSelect(idx); onClose() }}
                onContextMenu={(e) => e.preventDefault()}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
