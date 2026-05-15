import { useState, useEffect, useRef, useCallback } from 'react'

const KEY_GOAL = 'prose-word-count-goal'
const KEY_STREAK = 'prose-streak'
const KEY_WRITING_DAYS = 'prose-writing-days'

export interface SessionStats {
  wordsToday: number
  sessionMinutes: number
  avgWPM: number
  streak: number
  writingDays: string[]
  goal: number | null
  setGoal: (g: number | null) => void
  resetSession: () => void
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadGoal(): number | null {
  try {
    const v = localStorage.getItem(KEY_GOAL)
    return v ? parseInt(v, 10) : null
  } catch { return null }
}

function loadStreak(): { count: number; lastDate: string | null } {
  try {
    const v = localStorage.getItem(KEY_STREAK)
    if (!v) return { count: 0, lastDate: null }
    return JSON.parse(v) as { count: number; lastDate: string | null }
  } catch { return { count: 0, lastDate: null } }
}

function loadWritingDays(): string[] {
  try {
    const v = localStorage.getItem(KEY_WRITING_DAYS)
    return v ? (JSON.parse(v) as string[]) : []
  } catch { return [] }
}

export function useSessionStats(wordCount: number): SessionStats {
  const [sessionStart, setSessionStart] = useState(() => Date.now())
  const [sessionMinutes, setSessionMinutes] = useState(0)
  const [goal, setGoalState] = useState<number | null>(loadGoal)
  const [streak, setStreak] = useState(() => loadStreak().count)
  const [writingDays, setWritingDays] = useState<string[]>(loadWritingDays)

  // Capture word count baseline after editor settles (300ms after first render)
  const wordCountRef = useRef(wordCount)
  wordCountRef.current = wordCount
  const startWordCountRef = useRef<number | null>(null)
  const hasUpdatedStreakRef = useRef(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (startWordCountRef.current === null) {
        startWordCountRef.current = wordCountRef.current
      }
    }, 300)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update session time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSessionMinutes(Math.floor((Date.now() - sessionStart) / 60000))
    }, 30000)
    return () => clearInterval(interval)
  }, [sessionStart])

  const wordsToday =
    startWordCountRef.current !== null
      ? Math.max(0, wordCount - startWordCountRef.current)
      : 0

  // Update streak and writing days once words are written today
  useEffect(() => {
    if (wordsToday === 0 || hasUpdatedStreakRef.current) return
    hasUpdatedStreakRef.current = true

    const today = todayStr()

    // Writing days
    const days = loadWritingDays()
    if (!days.includes(today)) {
      const updated = [...days, today].slice(-60)
      localStorage.setItem(KEY_WRITING_DAYS, JSON.stringify(updated))
      setWritingDays(updated)
    }

    // Streak
    const { count, lastDate } = loadStreak()
    if (lastDate === today) {
      setStreak(count)
      return
    }
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const newCount = lastDate === yesterday.toISOString().slice(0, 10) ? count + 1 : 1
    localStorage.setItem(KEY_STREAK, JSON.stringify({ count: newCount, lastDate: today }))
    setStreak(newCount)
  }, [wordsToday])

  const setGoal = useCallback((g: number | null) => {
    try {
      if (g === null) localStorage.removeItem(KEY_GOAL)
      else localStorage.setItem(KEY_GOAL, String(g))
    } catch { /* noop */ }
    setGoalState(g)
  }, [])

  const resetSession = useCallback(() => {
    startWordCountRef.current = wordCountRef.current
    hasUpdatedStreakRef.current = false
    setSessionStart(Date.now())
    setSessionMinutes(0)
  }, [])

  const avgWPM = sessionMinutes > 0 ? Math.round(wordsToday / sessionMinutes) : 0

  return {
    wordsToday,
    sessionMinutes,
    avgWPM,
    streak,
    writingDays,
    goal,
    setGoal,
    resetSession,
  }
}
