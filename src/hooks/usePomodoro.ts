import { useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import type { AppSettings } from '@/types'
import { POMODORO_DEFAULT_WORK_MINUTES, POMODORO_DEFAULT_BREAK_MINUTES } from '@/constants'

export interface PomodoroControls {
  start(): void
  pause(): void
  reset(): void
}

/**
 * Owns the actual countdown interval for the WHOLE APP — call this exactly
 * once, from App.tsx (mounted once for the app's lifetime), same as
 * useMusic(). Never call it from a per-tab component: Editor.tsx mounts one
 * instance per open Document tab (EditorTabHost keeps every tab mounted,
 * just hidden), while pomodoroState is a single value shared across all of
 * them. This hook used to live inside Editor.tsx, so N open tabs ran N
 * independent setIntervals against that same shared timeRemaining — each
 * firing once a second and decrementing it, so with 2 tabs open the display
 * dropped 2 seconds per real second (the exact bug reported).
 */
export function usePomodoroTicker(): void {
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
      if (useAppStore.getState().pomodoroState.phase === 'idle') {
        setPomodoroState({ timeRemaining: workSecondsRef.current })
      }
    })
  }, [setPomodoroState])

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
}

/**
 * Start/pause/reset controls — safe to call from any number of components
 * (each open tab's Pomodoro panel calls this), since it only ever dispatches
 * to the shared store and owns no interval of its own. The actual ticking
 * lives in usePomodoroTicker() above.
 */
export function usePomodoro(): PomodoroControls {
  const setPomodoroState = useAppStore((s) => s.setPomodoroState)
  const workSecondsRef = useRef(POMODORO_DEFAULT_WORK_MINUTES * 60)

  useEffect(() => {
    void window.prose.settings.get().then((s) => {
      const settings = s as AppSettings
      workSecondsRef.current = settings.pomodoroWorkMinutes * 60
    })
  }, [])

  // Keep in sync whenever the idle display is updated (by a settings change,
  // or by the ticker resetting to idle) so Start picks up the correct
  // duration without needing a full remount.
  const idleTimeRemaining = useAppStore((s) =>
    s.pomodoroState.phase === 'idle' ? s.pomodoroState.timeRemaining : null
  )
  useEffect(() => {
    if (idleTimeRemaining !== null) workSecondsRef.current = idleTimeRemaining
  }, [idleTimeRemaining])

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
