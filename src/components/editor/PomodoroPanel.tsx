import { useAppStore } from '@/store/appStore'
import type { PomodoroControls } from '@/hooks/usePomodoro'
import { Button } from '@/components/ui/button'
import { Play, Pause, RotateCcw, SkipForward } from 'lucide-react'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

const PHASE_LABELS: Record<string, string> = {
  idle: 'Ready',
  running: 'Focus',
  paused: 'Paused',
  break: 'Break',
}

interface PomodoroPanelProps {
  controls: PomodoroControls
}

export default function PomodoroPanel({ controls }: PomodoroPanelProps): JSX.Element {
  const { phase, timeRemaining, sessionCount } = useAppStore((s) => s.pomodoroState)
  const { start, pause, reset } = controls

  return (
    <div className="flex flex-col items-center gap-3 px-3 py-4">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {PHASE_LABELS[phase]}
      </div>

      <div
        className="text-3xl font-mono font-semibold tabular-nums"
        aria-live="polite"
        aria-label={`${PHASE_LABELS[phase]}: ${formatTime(timeRemaining)}`}
      >
        {formatTime(timeRemaining)}
      </div>

      {sessionCount > 0 && (
        <div className="text-[10px] text-muted-foreground">
          {sessionCount} {sessionCount === 1 ? 'session' : 'sessions'} completed
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-1">
        {phase === 'idle' && (
          <Button size="sm" className="h-7 px-3 text-xs" onClick={start}>
            <Play className="mr-1 h-3 w-3" />
            Start
          </Button>
        )}

        {phase === 'paused' && (
          <Button size="sm" className="h-7 px-3 text-xs" onClick={start}>
            <Play className="mr-1 h-3 w-3" />
            Resume
          </Button>
        )}

        {phase === 'running' && (
          <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={pause}>
            <Pause className="mr-1 h-3 w-3" />
            Pause
          </Button>
        )}

        {phase === 'break' && (
          <Button size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={reset}>
            <SkipForward className="mr-1 h-3 w-3" />
            Skip
          </Button>
        )}

        {phase !== 'idle' && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={reset}
            title="Reset timer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="mt-2 flex gap-1" aria-label="Session dots">
        {Array.from({ length: Math.min(sessionCount, 4) }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-primary"
          />
        ))}
        {Array.from({ length: Math.max(0, 4 - sessionCount) }).map((_, i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-border"
          />
        ))}
      </div>
    </div>
  )
}
