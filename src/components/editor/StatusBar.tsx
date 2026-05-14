import { Music } from 'lucide-react'
import type { Document } from '@/types'
import type { SaveStatus } from '@/hooks/useDocument'

interface StatusBarProps {
  document: Document | null
  wordCount: number
  saveStatus: SaveStatus
  nowPlaying?: string | null
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
}: StatusBarProps): JSX.Element {
  const goal = document?.wordCountGoal ?? null
  const formatLabel = document ? (FORMAT_LABELS[document.format] ?? 'No format') : ''

  const saveLabel =
    saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : ''

  return (
    <div className="flex h-7 shrink-0 items-center border-t border-border px-4 text-[11px] text-muted-foreground">
      {/* Left: word count */}
      <div className="flex flex-1 items-center gap-2">
        <span>
          {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          {goal !== null && (
            <span className="text-muted-foreground/70"> / {goal.toLocaleString()} goal</span>
          )}
        </span>
      </div>

      {/* Center: format */}
      <div className="flex items-center">
        <span>{formatLabel}</span>
      </div>

      {/* Right: music + save */}
      <div className="flex flex-1 items-center justify-end gap-3">
        {nowPlaying && (
          <span className="flex items-center gap-1">
            <Music className="h-2.5 w-2.5" />
            {nowPlaying}
          </span>
        )}
        {saveLabel && <span>{saveLabel}</span>}
      </div>
    </div>
  )
}
