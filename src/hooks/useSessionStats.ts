import { useState, useEffect, useRef, useCallback } from 'react'

const KEY_GOAL = 'prose-word-count-goal'
const KEY_WRITING_DAYS = 'prose-writing-days'
const KEY_DAILY_WORDS = 'prose-daily-word-counts'
const WRITING_DAYS_LIMIT = 400

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

function loadWritingDays(): string[] {
  try {
    const v = localStorage.getItem(KEY_WRITING_DAYS)
    return v ? (JSON.parse(v) as string[]) : []
  } catch { return [] }
}

function loadDailyWordCounts(): Record<string, number> {
  try {
    const v = localStorage.getItem(KEY_DAILY_WORDS)
    return v ? (JSON.parse(v) as Record<string, number>) : {}
  } catch { return {} }
}

function saveDailyWordCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(KEY_DAILY_WORDS, JSON.stringify(counts))
  } catch { /* noop */ }
}

function calculateStreak(writingDays: string[]): number {
  const daySet = new Set(writingDays)
  const today = todayStr()
  const cursor = new Date()
  if (!daySet.has(today)) cursor.setDate(cursor.getDate() - 1)
  let streak = 0
  while (daySet.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export function useSessionStats(wordCount: number): SessionStats {
  const [sessionStart, setSessionStart] = useState(() => Date.now())
  const [sessionMinutes, setSessionMinutes] = useState(0)
  const [avgWPM, setAvgWPM] = useState(0)
  const [goal, setGoalState] = useState<number | null>(loadGoal)
  const [writingDays, setWritingDays] = useState<string[]>(loadWritingDays)
  const [wordsToday, setWordsToday] = useState(() => loadDailyWordCounts()[todayStr()] ?? 0)

  const wordCountRef = useRef(wordCount)
  wordCountRef.current = wordCount
  const sessionStartWordCountRef = useRef<number | null>(null)
  const sessionWordsPersistedRef = useRef(0)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (sessionStartWordCountRef.current === null) {
        sessionStartWordCountRef.current = wordCountRef.current
      }
    }, 300)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = (): void => {
      const elapsedMinutes = Math.max((Date.now() - sessionStart) / 60000, 0)
      setSessionMinutes(Math.floor(elapsedMinutes))
      const sessionWords =
        sessionStartWordCountRef.current !== null
          ? Math.max(0, wordCountRef.current - sessionStartWordCountRef.current)
          : 0
      setAvgWPM(elapsedMinutes > 0 ? Math.round(sessionWords / elapsedMinutes) : 0)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [sessionStart, wordCount])

  // Persist new words to today's daily total
  useEffect(() => {
    if (sessionStartWordCountRef.current === null) return

    const sessionDelta = Math.max(0, wordCount - sessionStartWordCountRef.current)
    const newWords = sessionDelta - sessionWordsPersistedRef.current
    if (newWords <= 0) return

    const today = todayStr()
    const counts = loadDailyWordCounts()
    const updatedTotal = (counts[today] ?? 0) + newWords
    counts[today] = updatedTotal
    saveDailyWordCounts(counts)
    sessionWordsPersistedRef.current = sessionDelta
    setWordsToday(updatedTotal)

    const days = loadWritingDays()
    if (!days.includes(today)) {
      const updatedDays = [...days, today].slice(-WRITING_DAYS_LIMIT)
      localStorage.setItem(KEY_WRITING_DAYS, JSON.stringify(updatedDays))
      setWritingDays(updatedDays)
    }
  }, [wordCount])

  const setGoal = useCallback((g: number | null) => {
    try {
      if (g === null) localStorage.removeItem(KEY_GOAL)
      else localStorage.setItem(KEY_GOAL, String(g))
    } catch { /* noop */ }
    setGoalState(g)
  }, [])

  const resetSession = useCallback(() => {
    sessionStartWordCountRef.current = wordCountRef.current
    sessionWordsPersistedRef.current = 0
    setSessionStart(Date.now())
    setSessionMinutes(0)
    setAvgWPM(0)
  }, [])

  const streak = calculateStreak(writingDays)

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
