import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/appStore'
import { TRACKS, AMBIENT_LAYERS } from '@/hooks/useMusic'
import type { MusicHook } from '@/hooks/useMusic'
import { cn } from '@/lib/utils'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, X,
} from 'lucide-react'

type Tab = 'tracks' | 'mixer'

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function Equalizer(): JSX.Element {
  return (
    <div className="flex items-end gap-px" style={{ height: 12, width: 12 }}>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={{ height: ['3px', '10px', '5px', '12px', '3px'] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.18,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

function RangeSlider({
  value,
  min = 0,
  max = 100,
  onChange,
  className,
}: {
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
  className?: string
}): JSX.Element {
  return (
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(parseInt(e.target.value))}
      className={cn(
        'h-1 w-full cursor-pointer appearance-none rounded-full bg-secondary',
        '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3',
        '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full',
        '[&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer',
        className
      )}
    />
  )
}

interface MusicPanelProps {
  music: MusicHook
}

export default function MusicPanel({ music }: MusicPanelProps): JSX.Element {
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const [tab, setTab] = useState<Tab>('tracks')

  const {
    trackIndex, playing, currentTime, duration, volume,
    ambientEnabled, ambientVolumes,
    play, pause, toggle, next, prev, seek, switchTrack, setVolume,
    setAmbientEnabled, setAmbientVolume,
  } = music

  return (
    <motion.div
      className="fixed bottom-8 right-4 z-50 flex w-72 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium">Focus Music</span>
        <div className="flex items-center gap-1">
          <button
            className={cn(
              'rounded px-2 py-0.5 text-[11px] transition-colors',
              tab === 'tracks'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setTab('tracks')}
          >
            Tracks
          </button>
          <button
            className={cn(
              'rounded px-2 py-0.5 text-[11px] transition-colors',
              tab === 'mixer'
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setTab('mixer')}
          >
            Mixer
          </button>
          <Button
            variant="ghost"
            size="icon"
            className="ml-1 h-6 w-6"
            onClick={() => setMusicPanelOpen(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {tab === 'tracks' ? (
          <motion.div
            key="tracks"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.12 }}
          >
            {/* Track list */}
            <div className="max-h-44 overflow-y-auto">
              {TRACKS.map((track, i) => (
                <button
                  key={track.id}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left transition-colors',
                    'hover:bg-accent/50',
                    i === trackIndex && 'bg-accent/30'
                  )}
                  onClick={() => {
                    if (i === trackIndex) toggle()
                    else switchTrack(i)
                  }}
                >
                  <div className="flex w-4 shrink-0 items-center justify-center">
                    {i === trackIndex && playing ? (
                      <Equalizer />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">{i + 1}</span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-xs font-medium">{track.title}</span>
                    <span className="text-[10px] text-muted-foreground">{track.category}</span>
                  </div>
                </button>
              ))}
            </div>

            <Separator />

            {/* Playback controls */}
            <div className="flex flex-col gap-2 px-3 py-2.5">
              {/* Progress scrubber */}
              <div className="flex items-center gap-2">
                <span className="w-8 text-right text-[10px] tabular-nums text-muted-foreground">
                  {formatTime(currentTime)}
                </span>
                <RangeSlider
                  value={duration > 0 ? currentTime : 0}
                  min={0}
                  max={duration || 100}
                  onChange={seek}
                  className="flex-1"
                />
                <span className="w-8 text-[10px] tabular-nums text-muted-foreground">
                  {formatTime(duration)}
                </span>
              </div>

              {/* Controls row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prev}>
                    <SkipBack className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    className="h-8 w-8"
                    onClick={playing ? pause : play}
                  >
                    {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={next}>
                    <SkipForward className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Volume */}
                <div className="flex w-28 items-center gap-1.5">
                  <Volume2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <RangeSlider value={volume} onChange={setVolume} />
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="mixer"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.12 }}
          >
            <div className="flex flex-col gap-0 px-3 py-2.5">
              <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Ambient layers
              </p>
              {AMBIENT_LAYERS.map((layer) => {
                const enabled = !!ambientEnabled[layer.id]
                const layerVol = ambientVolumes[layer.id] ?? 30
                return (
                  <div key={layer.id} className="flex items-center gap-2 py-1.5">
                    <button
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                        enabled
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/40 bg-transparent'
                      )}
                      onClick={() => setAmbientEnabled(layer.id, !enabled)}
                      title={enabled ? 'Disable' : 'Enable'}
                    >
                      {enabled && (
                        <svg viewBox="0 0 8 8" className="h-4 w-4 p-0.5 text-primary-foreground">
                          <path
                            d="M1.5 4l2 2L6.5 2"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </button>
                    <span
                      className={cn(
                        'w-20 shrink-0 text-xs',
                        enabled ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {layer.label}
                    </span>
                    <RangeSlider
                      value={layerVol}
                      onChange={(v) => setAmbientVolume(layer.id, v)}
                      className={cn('flex-1', !enabled && 'opacity-40')}
                    />
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
