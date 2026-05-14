import { Music } from 'lucide-react'
import type { Document } from '@/types'
import type { SaveStatus } from '@/hooks/useDocument'

interface StatusBarProps {
  document: Document | null
  wordCount: number
  saveStatus: SaveStatus
  nowPlaying?: string | null
  onMusicClick?(): void
}

const FORMAT_LABELS: Record<string, string> = {
  none: 'No format',
  mla: 'MLA',
  apa: 'APA',
  chicago: 'Chicago',
  ieee: 'IEEE',
}

export default function StatusBar({
  document,
  wordCount,
  saveStatus,
  nowPlaying,
  onMusicClick,
}: StatusBarProps): JSX.Element {
  const goal = document?.wordCountGoal ?? null
  const formatLabel = document ? (FORMAT_LABELS[document.format] ?? 'No format') : ''
  const saveLabel = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border px-4 text-[11px] text-muted-foreground">
      <div className="flex flex-1 items-center gap-2">
        <span>
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          {goal !== null && (
            <span className="text-muted-foreground/70"> / {goal.toLocaleString()} goal</span>
          )}
        </span>
      </div>

      <div className="flex items-center">
        <span>{formatLabel}</span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        {nowPlaying && (
          <button
            onClick={onMusicClick}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
            title="Open music panel"
          >
            <Music className="h-2.5 w-2.5" />
            {nowPlaying}
          </button>
        )}
        {saveLabel && <span>{saveLabel}</span>}
      </div>
    </div>
  )
}
