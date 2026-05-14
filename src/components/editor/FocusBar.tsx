import { Minimize2, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/appStore'

interface FocusBarProps {
  nowPlaying?: string | null
}

export default function FocusBar({ nowPlaying }: FocusBarProps): JSX.Element {
  const setFocusModeActive = useAppStore((s) => s.setFocusModeActive)

  return (
    <div className="flex h-9 shrink-0 items-center justify-between px-4 opacity-40 hover:opacity-100 transition-opacity duration-300">
      {nowPlaying ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Music className="h-3 w-3" />
          <span className="max-w-[200px] truncate">{nowPlaying}</span>
        </div>
      ) : (
        <div />
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setFocusModeActive(false)}
        title="Exit focus mode (Esc)"
      >
        <Minimize2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
