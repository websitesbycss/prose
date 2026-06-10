import { useState, useEffect, useRef } from 'react'
import { ZoomIn, ZoomOut, ChevronDown, Music, SlidersVertical } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Slide } from '@/types/slides'

interface Props {
  activeSlideIndex: number
  totalSlides: number
  activeSlide: Slide | null
  zoom: number      // 0 = fit, 25–400 = explicit %
  fitZoom: number   // computed fit % from canvas
  saveStatus: 'saved' | 'saving' | 'error' | 'unsaved'
  onZoomChange(zoom: number): void
  nowPlaying?: string | null
  ambientPlaying?: string | null
  onMusicClick?(): void
  onAmbientClick?(): void
}

const ZOOM_MIN = 25
const ZOOM_MAX = 400
const ZOOM_STEP = 10
const ZOOM_PRESETS = [25, 50, 75, 100, 125, 150, 200, 400]

function ZoomControls({ zoom, fitZoom, onZoomChange }: {
  zoom: number
  fitZoom: number
  onZoomChange(z: number): void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const displayPct = zoom === 0 ? fitZoom : zoom

  function clamp(v: number): number {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v))
  }

  function apply(val: string): void {
    const n = parseInt(val)
    if (!isNaN(n)) onZoomChange(clamp(n))
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        className="text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => onZoomChange(clamp(displayPct - ZOOM_STEP))}
        title="Zoom out (Ctrl+-)"
      >
        <ZoomOut className="h-3 w-3" />
      </button>

      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={1}
        value={displayPct}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="zoom-slider w-20"
        title={`Zoom: ${zoom === 0 ? 'Fit' : `${zoom}%`}`}
      />

      <div className="flex items-center gap-0.5">
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onZoomChange(clamp(displayPct + ZOOM_STEP))}
          title="Zoom in (Ctrl+=)"
        >
          <ZoomIn className="h-3 w-3" />
        </button>

        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) setDraft(String(displayPct))
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-0.5 tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              title="Set zoom level"
            >
              <span className="w-8 text-right">{zoom === 0 ? 'Fit' : `${zoom}%`}</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-20 p-1"
            side="top"
            align="end"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <Input
              className="mb-1 h-7 w-full text-center text-xs focus-visible:ring-1 focus-visible:ring-offset-0"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') apply(draft)
                if (e.key === 'Escape') setOpen(false)
              }}
            />
            <div className="flex flex-col">
              <button
                className={cn(
                  'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                  zoom === 0 && 'bg-accent/50 font-medium',
                )}
                onMouseDown={(e) => { e.preventDefault(); onZoomChange(0); setOpen(false) }}
              >
                Fit
              </button>
              {ZOOM_PRESETS.map((p) => (
                <button
                  key={p}
                  className={cn(
                    'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                    zoom === p && 'bg-accent/50 font-medium',
                  )}
                  onMouseDown={(e) => { e.preventDefault(); onZoomChange(p); setOpen(false) }}
                >
                  {p}%
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

export function SlidesStatusBar({
  activeSlideIndex,
  totalSlides,
  activeSlide,
  zoom,
  fitZoom,
  saveStatus,
  onZoomChange,
  nowPlaying,
  ambientPlaying,
  onMusicClick,
  onAmbientClick,
}: Props): JSX.Element {
  const [savedVisible, setSavedVisible] = useState(false)
  const [savedMounted, setSavedMounted] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (saveStatus === 'saved') {
      setSavedMounted(true)
      setSavedVisible(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
      savedTimerRef.current = setTimeout(() => {
        setSavedVisible(false)
        savedFadeRef.current = setTimeout(() => setSavedMounted(false), 300)
      }, 2000)
    } else {
      setSavedVisible(false)
      setSavedMounted(false)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
    }
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current)
    }
  }, [saveStatus])

  const transitionLabel = activeSlide?.transition?.type && activeSlide.transition.type !== 'none'
    ? activeSlide.transition.type.charAt(0).toUpperCase() + activeSlide.transition.type.slice(1)
    : null

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border bg-background px-4 text-[11px] text-muted-foreground">
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

      {/* Right: zoom, then music / ambient + save */}
      <div className="flex shrink-0 items-center gap-3">
        <ZoomControls zoom={zoom} fitZoom={fitZoom} onZoomChange={onZoomChange} />

        {nowPlaying && (
          <button
            onClick={onMusicClick}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
            title="Open music panel"
          >
            <Music className="h-2.5 w-2.5" />
            {nowPlaying}
          </button>
        )}
        {ambientPlaying && (
          <button
            onClick={onAmbientClick ?? onMusicClick}
            className="flex items-center gap-1 transition-colors hover:text-foreground"
            title="Open ambient mixer"
          >
            <SlidersVertical className="h-2.5 w-2.5" />
            {ambientPlaying}
          </button>
        )}

        {/* Save status — only mounted while visible or fading, so it never reserves phantom space */}
        {(saveStatus === 'saving' || saveStatus === 'error' || saveStatus === 'unsaved' || savedMounted) && (
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
        )}
      </div>
    </div>
  )
}
