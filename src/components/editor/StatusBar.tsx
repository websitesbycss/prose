import { useState } from 'react'
import { Music, SlidersVertical, ZoomIn, ZoomOut, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Document } from '@/types'
import type { SaveStatus } from '@/hooks/useDocument'

interface StatusBarProps {
  document: Document | null
  wordCount: number
  selectionWordCount?: number
  saveStatus: SaveStatus
  nowPlaying?: string | null
  ambientPlaying?: string | null
  onMusicClick?(): void
  onAmbientClick?(): void
  zoom: number
  onZoomChange(zoom: number): void
}

const FORMAT_LABELS: Record<string, string> = {
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
  ieee: 'IEEE',
}

const ZOOM_MIN = 25
const ZOOM_MAX = 175
const ZOOM_STEP = 10
const ZOOM_PRESETS = [25, 50, 75, 90, 100, 110, 125, 150, 175, 200]

function ZoomControls({ zoom, onZoomChange }: { zoom: number; onZoomChange(z: number): void }): JSX.Element {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

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
        onClick={() => onZoomChange(clamp(zoom - ZOOM_STEP))}
        title="Zoom out (Ctrl+-)"
      >
        <ZoomOut className="h-3 w-3" />
      </button>

      <input
        type="range"
        min={ZOOM_MIN}
        max={ZOOM_MAX}
        step={1}
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="zoom-slider w-20"
        title={`Zoom: ${zoom}%`}
      />

      <div className="flex items-center gap-0.5">
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => onZoomChange(clamp(zoom + ZOOM_STEP))}
          title="Zoom in (Ctrl+=)"
        >
          <ZoomIn className="h-3 w-3" />
        </button>

        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (o) setDraft(String(zoom))
          }}
        >
          <PopoverTrigger asChild>
            <button
              className="flex items-center gap-0.5 tabular-nums text-muted-foreground transition-colors hover:text-foreground"
              title="Set zoom level"
            >
              <span className="w-8 text-right">{zoom}%</span>
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
            {ZOOM_PRESETS.map((p) => (
              <button
                key={p}
                className={cn(
                  'rounded px-2 py-0.5 text-left text-xs transition-colors hover:bg-accent',
                  zoom === p && 'bg-accent/50 font-medium'
                )}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onZoomChange(p)
                  setOpen(false)
                }}
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

export default function StatusBar({
  document,
  wordCount,
  selectionWordCount = 0,
  saveStatus,
  nowPlaying,
  ambientPlaying,
  onMusicClick,
  onAmbientClick,
  zoom,
  onZoomChange,
}: StatusBarProps): JSX.Element {
  const goal = document?.wordCountGoal ?? null
  const formatLabel =
    document && document.format !== 'none' ? (FORMAT_LABELS[document.format] ?? '') : ''
  const saveLabel =
    saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Save failed'
    : ''

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border px-4 text-[11px] text-muted-foreground">
      {/* Left: word count */}
      <div className="flex min-w-0 flex-1 items-center">
        <span>
          {selectionWordCount > 0 ? (
            <>
              {selectionWordCount.toLocaleString()}
              <span className="text-muted-foreground/60">/{wordCount.toLocaleString()}</span>
              {' '}{selectionWordCount === 1 ? 'word' : 'words'}
            </>
          ) : (
            <>
              {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
              {goal !== null && (
                <span className="text-muted-foreground/70"> / {goal.toLocaleString()} goal</span>
              )}
            </>
          )}
        </span>
      </div>

      {/* Center: format */}
      <div className="flex shrink-0 items-center justify-center px-4">
        {formatLabel && <span>{formatLabel}</span>}
      </div>

      {/* Right: zoom, then music / ambient / save status */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <ZoomControls zoom={zoom} onZoomChange={onZoomChange} />
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
        {saveLabel && (
          <span className={saveStatus === 'error' ? 'text-destructive' : undefined}>{saveLabel}</span>
        )}
      </div>
    </div>
  )
}
