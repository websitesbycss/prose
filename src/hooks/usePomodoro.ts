import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import type { AppSettings } from '@/types'
import { POMODORO_DEFAULT_WORK_MINUTES, POMODORO_DEFAULT_BREAK_MINUTES } from '@/constants'

export interface PomodoroControls {
  start(): void
  pause(): void
  reset(): void
}

export function usePomodoro(): PomodoroControls {
  const setPomodoroState = useAppStore((s) => s.setPomodoroState)
  const phase = useAppStore((s) => s.pomodoroState.phase)
  const workSecondsRef = useRef(POMODORO_DEFAULT_WORK_MINUTES * 60)
  const breakSecondsRef = useRef(POMODORO_DEFAULT_BREAK_MINUTES * 60)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const settings = s as AppSettings
      workSecondsRef.current = settings.pomodoroWorkMinutes * 60
      breakSecondsRef.current = settings.pomodoroBreakMinutes * 60
    })
  }, [])

  useEffect(() => {
    if (Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }, [])

  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (phase !== 'running' && phase !== 'break') return

    intervalRef.current = setInterval(() => {
      const current = useAppStore.getState().pomodoroState

      if (current.timeRemaining <= 1) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null

        if (current.phase === 'running') {
          if (Notification.permission === 'granted') {
            new Notification('Break time!', { body: 'Work session complete. Take a breather.' })
          }
          setPomodoroState({
            phase: 'break',
            timeRemaining: breakSecondsRef.current,
            sessionCount: current.sessionCount + 1,
          })
        } else {
          if (Notification.permission === 'granted') {
            new Notification('Break over!', { body: 'Ready to focus again?' })
          }
          setPomodoroState({ phase: 'idle', timeRemaining: workSecondsRef.current })
        }
      } else {
        setPomodoroState({ timeRemaining: current.timeRemaining - 1 })
      }
    }, 1000)

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [phase, setPomodoroState])

  const start = useCallback((): void => {
    const { phase: p } = useAppStore.getState().pomodoroState
    if (p === 'idle') {
      setPomodoroState({ phase: 'running', timeRemaining: workSecondsRef.current })
    } else if (p === 'paused') {
      setPomodoroState({ phase: 'running' })
    }
  }, [setPomodoroState])

  const pause = useCallback((): void => {
    const { phase: p } = useAppStore.getState().pomodoroState
    if (p === 'running') {
      setPomodoroState({ phase: 'paused' })
    }
  }, [setPomodoroState])

  const reset = useCallback((): void => {
    setPomodoroState({ phase: 'idle', timeRemaining: workSecondsRef.current })
  }, [setPomodoroState])

  return { start, pause, reset }
}
