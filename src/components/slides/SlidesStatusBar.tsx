import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'
import type { Slide } from '@/types/slides'

interface Props {
  activeSlideIndex: number
  totalSlides: number
  activeSlide: Slide | null
  zoom: number      // 0 = fit, 25–400 = explicit %
  saveStatus: 'saved' | 'saving' | 'error' | 'unsaved'
  onZoomChange(zoom: number): void
}

const ZOOM_PRESETS = [25, 50, 75, 100, 150, 200, 400]

export function SlidesStatusBar({ activeSlideIndex, totalSlides, activeSlide, zoom, saveStatus, onZoomChange }: Props): JSX.Element {
  const nowPlaying = useAppStore((s) => s.nowPlaying)
  const ambientPlaying = useAppStore((s) => s.ambientPlaying)

  const [savedVisible, setSavedVisible] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (saveStatus === 'saved') {
      setSavedVisible(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSavedVisible(false), 2000)
    } else {
      setSavedVisible(false)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
    }
    return () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }
  }, [saveStatus])

  const transitionLabel = activeSlide?.transition?.type && activeSlide.transition.type !== 'none'
    ? activeSlide.transition.type.charAt(0).toUpperCase() + activeSlide.transition.type.slice(1)
    : null

  const zoomLabel = zoom === 0 ? 'Fit' : `${zoom}%`

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border bg-background px-3 text-[11px] text-muted-foreground">
      {/* Left: slide counter */}
      <span className="shrink-0 tabular-nums" aria-label={`Slide ${activeSlideIndex + 1} of ${totalSlides}`}>
        Slide {activeSlideIndex + 1} of {totalSlides}
      </span>

      {/* Center: transition type */}
      <div className="flex flex-1 items-center justify-center">
        {transitionLabel && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{transitionLabel}</span>
        )}
      </div>

      {/* Right: media indicators + zoom + save */}
      <div className="flex shrink-0 items-center gap-3">
        {(nowPlaying || ambientPlaying) && (
          <span className="text-[10px] text-primary">♫</span>
        )}

        {/* Zoom control */}
        <div className="flex items-center gap-1">
          <button
            className="rounded px-1 hover:bg-accent"
            onClick={() => onZoomChange(Math.max(25, zoom === 0 ? 90 : zoom - 10))}
            aria-label="Zoom out"
          >
            −
          </button>
          <select
            className="w-14 rounded border-none bg-transparent text-center text-[11px] text-muted-foreground focus:outline-none"
            value={zoom === 0 ? 'fit' : String(zoom)}
            onChange={e => onZoomChange(e.target.value === 'fit' ? 0 : parseInt(e.target.value))}
            aria-label="Zoom level"
          >
            <option value="fit">Fit</option>
            {ZOOM_PRESETS.map(p => (
              <option key={p} value={String(p)}>{p}%</option>
            ))}
          </select>
          <button
            className="rounded px-1 hover:bg-accent"
            onClick={() => onZoomChange(Math.min(400, zoom === 0 ? 110 : zoom + 10))}
            aria-label="Zoom in"
          >
            +
          </button>
        </div>

        {/* Save status */}
        <span
          className={cn(
            'shrink-0 transition-opacity duration-300',
            saveStatus === 'saving' && 'opacity-100',
            saveStatus === 'saved' && (savedVisible ? 'opacity-100' : 'opacity-0'),
            saveStatus === 'unsaved' && 'text-primary opacity-100',
            saveStatus === 'error' && 'text-destructive opacity-100',
          )}
        >
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'error' ? 'Save error' : saveStatus === 'unsaved' ? '●' : 'Saved'}
        </span>
      </div>
    </div>
  )
}
