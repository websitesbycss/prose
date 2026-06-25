import { Music, Pause, Play, SlidersVertical } from 'lucide-react'
import { useMusicContext } from '@/contexts/MusicContext'
import { AMBIENT_LAYERS } from '@/hooks/useMusic'
import { useAppStore } from '@/store/appStore'
import { cn } from '@/lib/utils'

export function DashboardMusicStatus(): JSX.Element | null {
  const music = useMusicContext()
  const setMusicPanelOpen = useAppStore((s) => s.setMusicPanelOpen)
  const setMusicPanelTab = useAppStore((s) => s.setMusicPanelTab)

  if (!music) return null

  const activeAmbient = AMBIENT_LAYERS.filter((l) => music.ambientEnabled[l.id])
  const ambientLabel =
    activeAmbient.length === 0 ? null
    : activeAmbient.length === 1 ? activeAmbient[0]!.label
    : activeAmbient.length === 2 ? `${activeAmbient[0]!.label} + ${activeAmbient[1]!.label}`
    : `${activeAmbient.length} sounds`

  const trackPlaying = music.playing && !!music.nowPlayingTitle
  const ambientOn = activeAmbient.length > 0
  if (!trackPlaying && !ambientOn) return null

  const label = trackPlaying ? music.nowPlayingTitle! : ambientLabel!

  return (
    <div className="mx-2 mb-1 rounded-lg border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={music.playing ? 'Pause' : 'Play'}
          onClick={() => music.toggle()}
        >
          {music.playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          title="Open music panel"
          onClick={() => { setMusicPanelTab('tracks'); setMusicPanelOpen(true) }}
        >
          {trackPlaying ? (
            <Music className="h-3 w-3 shrink-0 text-primary" />
          ) : (
            <SlidersVertical className="h-3 w-3 shrink-0 text-primary" />
          )}
          <span className={cn('truncate text-[11px] text-foreground')}>{label}</span>
        </button>
      </div>
    </div>
  )
}
