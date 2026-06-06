import { Music, SlidersVertical } from 'lucide-react'
import type { SaveStatus } from '@/hooks/useDocument'

interface BoardStatusBarProps {
  saveStatus: SaveStatus
  nowPlaying?: string | null
  ambientPlaying?: string | null
  onMusicClick?(): void
  onAmbientClick?(): void
}

export function BoardStatusBar({
  saveStatus,
  nowPlaying,
  ambientPlaying,
  onMusicClick,
  onAmbientClick,
}: BoardStatusBarProps): JSX.Element {
  const saveLabel =
    saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'saved' ? 'Saved'
    : saveStatus === 'error' ? 'Save failed'
    : ''

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border px-4 text-[11px] text-muted-foreground">
      <div className="flex-1" />
      <div className="flex items-center gap-3">
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
          <span className={saveStatus === 'error' ? 'text-destructive' : undefined}>
            {saveLabel}
          </span>
        )}
      </div>
    </div>
  )
}
