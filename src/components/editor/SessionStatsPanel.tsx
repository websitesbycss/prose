import { useState, useRef, useEffect } from 'react'
import { BarChart2, Flame, Pencil, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SessionStats } from '@/hooks/useSessionStats'

// Progress ring geometry
const R = 52
const CX = 65
const CY = 65
const SIZE = 130
const CIRC = 2 * Math.PI * R

interface Props {
  stats: SessionStats
}

export function SessionStatsPanel({ stats }: Props): JSX.Element {
  const { wordsToday, sessionMinutes, avgWPM, streak, writingDays, goal, setGoal, resetSession } =
    stats

  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingGoal) {
      setGoalDraft(goal !== null ? String(goal) : '')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [editingGoal, goal])

  function confirmGoal(): void {
    const n = parseInt(goalDraft, 10)
    if (!isNaN(n) && n > 0) setGoal(n)
    setEditingGoal(false)
  }

  const wordsLeft = goal !== null ? Math.max(0, goal - wordsToday) : null
  const minutesToGoal =
    avgWPM > 0 && wordsLeft !== null && wordsLeft > 0 ? Math.ceil(wordsLeft / avgWPM) : null

  const progress = goal && goal > 0 ? Math.min(wordsToday / goal, 1) : 0
  const dashOffset = CIRC * (1 - progress)

  // Last 7 days for streak dots
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (6 - i))
    return d.toISOString().slice(0, 10)
  })

  const streakMsg =
    streak === 0
      ? 'start your streak'
      : streak < 3
        ? 'building momentum'
        : streak < 7
          ? 'keep it going'
          : streak < 30
            ? 'on a roll!'
            : 'unstoppable'

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <BarChart2 className="h-3.5 w-3.5" />
          Session stats
        </div>
        <button
          className="text-[10px] text-muted-foreground transition-colors hover:text-foreground"
          onClick={resetSession}
        >
          reset
        </button>
      </div>

      {/* Progress ring */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            style={{ transform: 'rotate(-90deg)' }}
          >
            {/* Track */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              strokeWidth={7}
              className="stroke-muted-foreground/20"
            />
            {/* Progress */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              strokeWidth={7}
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={dashOffset}
              className="stroke-primary transition-all duration-500"
            />
          </svg>

          {/* Center content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
            <span className="text-2xl font-bold leading-none tabular-nums">
              {wordsToday.toLocaleString()}
            </span>

            {editingGoal ? (
              <div className="mt-1 flex items-center gap-0.5">
                <input
                  ref={inputRef}
                  type="number"
                  min={1}
                  value={goalDraft}
                  onChange={(e) => setGoalDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmGoal()
                    if (e.key === 'Escape') setEditingGoal(false)
                  }}
                  className="w-14 rounded border border-border bg-background px-1 text-center text-[10px] focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="500"
                />
                <button
                  onClick={confirmGoal}
                  className="text-primary transition-colors hover:text-primary/70"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : goal !== null ? (
              <div className="flex items-center gap-0.5">
                <span className="text-[11px] text-muted-foreground">
                  of {goal.toLocaleString()}
                </span>
                <button
                  onClick={() => setEditingGoal(true)}
                  className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingGoal(true)}
                className="text-[10px] text-muted-foreground/50 underline-offset-2 transition-colors hover:text-primary hover:underline"
              >
                set a goal
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <StatCard value={wordsToday.toLocaleString()} label="words today" />
        <StatCard value={`${sessionMinutes}m`} label="session time" />
        <StatCard value={wordsLeft !== null ? wordsLeft.toLocaleString() : '—'} label="words left" />
        <StatCard
          value={minutesToGoal !== null ? `~${minutesToGoal}m` : '—'}
          label="to goal"
        />
      </div>

      {/* Streak card */}
      <div className="rounded-lg bg-accent/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-1.5">
            <Flame className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
            <div>
              <div className="text-xs font-semibold leading-tight">
                {streak} day{streak !== 1 ? 's' : ''} streak
              </div>
              <div className="text-[10px] text-muted-foreground">{streakMsg}</div>
            </div>
          </div>
          {/* 7-day dot row */}
          <div className="flex shrink-0 items-center gap-[3px] pt-0.5">
            {last7.map((d) => (
              <div
                key={d}
                className={cn(
                  'h-2 w-2 rounded-full transition-colors',
                  writingDays.includes(d) ? 'bg-primary' : 'bg-muted-foreground/25'
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Average speed */}
      <div className="space-y-1.5 pb-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">avg speed</span>
          <span className="tabular-nums text-[11px] font-medium">{avgWPM} wpm</span>
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary/60 transition-all duration-700"
            style={{ width: `${Math.min((avgWPM / 80) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  )
}

function StatCard({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-accent/50 px-3 py-2">
      <div className="text-base font-bold tabular-nums leading-snug">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
