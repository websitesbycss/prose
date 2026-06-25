import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ElementAnimation, Slide } from '@/types/slides'
import { sanitizeAnimation, getAnimationClassName } from '@/lib/slideAnimations'

interface PlaybackOptions {
  mode: 'preview' | 'presentation'
}

interface ActiveAnimationState {
  className: string
  duration: number
  delay: number
}

export interface SlideAnimationPlaybackState {
  visibleElementIds: Set<string>
  activeAnimationByElement: Record<string, ActiveAnimationState>
  onElementAnimationEnd: (elementId: string) => void
  advance: () => boolean
  reset: () => void
  isPlaying: boolean
  isComplete: boolean
}

function getEntranceElementIds(animations: ElementAnimation[]): Set<string> {
  return new Set(animations.filter((a) => a.category === 'entrance').map((a) => a.elementId))
}

export function useSlideAnimationPlayback(slide: Slide, options: PlaybackOptions): SlideAnimationPlaybackState {
  const animations = useMemo(() => slide.animations.map(sanitizeAnimation), [slide.animations])
  const [visibleElementIds, setVisibleElementIds] = useState<Set<string>>(() => new Set())
  const [activeAnimationByElement, setActiveAnimationByElement] = useState<Record<string, ActiveAnimationState>>({})
  const [isPlaying, setIsPlaying] = useState(false)
  const [isComplete, setIsComplete] = useState(false)

  const nextIndexRef = useRef(0)
  const runningRef = useRef(false)
  const cycleRef = useRef(0)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const advanceRef = useRef<() => boolean>(() => false)
  const completionRef = useRef<Map<string, () => void>>(new Map())
  const timeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const clearPreviewTimer = useCallback(() => {
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }, [])

  const completeAnimation = useCallback((elementId: string): void => {
    const timeout = timeoutRef.current.get(elementId)
    if (timeout) {
      clearTimeout(timeout)
      timeoutRef.current.delete(elementId)
    }
    const complete = completionRef.current.get(elementId)
    if (complete) {
      completionRef.current.delete(elementId)
      complete()
    }
  }, [])

  const playSingleAnimation = useCallback((animation: ElementAnimation, cycle: number): Promise<void> => {
    return new Promise((resolve) => {
      if (animation.category === 'entrance') {
        setVisibleElementIds((prev) => {
          const next = new Set(prev)
          next.add(animation.elementId)
          return next
        })
      }

      setActiveAnimationByElement((prev) => ({
        ...prev,
        [animation.elementId]: {
          className: getAnimationClassName(animation),
          duration: animation.duration,
          delay: animation.delay,
        },
      }))

      const timeoutMs = animation.duration + animation.delay + 40
      const timeout = setTimeout(() => {
        if (cycleRef.current !== cycle) return
        completeAnimation(animation.elementId)
      }, timeoutMs)
      timeoutRef.current.set(animation.elementId, timeout)

      completionRef.current.set(animation.elementId, () => {
        setActiveAnimationByElement((prev) => {
          const next = { ...prev }
          delete next[animation.elementId]
          return next
        })
        if (animation.category === 'exit') {
          setVisibleElementIds((prev) => {
            const next = new Set(prev)
            next.delete(animation.elementId)
            return next
          })
        }
        resolve()
      })

      // Cleanup timeout when hook resets by cycle invalidation.
      if (cycleRef.current !== cycle) completeAnimation(animation.elementId)
    })
  }, [completeAnimation])

  const maybeSchedulePreviewAdvance = useCallback(() => {
    if (options.mode !== 'preview') return
    if (runningRef.current) return
    const next = animations[nextIndexRef.current]
    if (!next || next.trigger !== 'click') return
    clearPreviewTimer()
    previewTimerRef.current = setTimeout(() => {
      if (!runningRef.current) {
        advanceRef.current()
      }
    }, 400)
  }, [animations, clearPreviewTimer, options.mode])

  const runFromIndex = useCallback(async (startIndex: number): Promise<void> => {
    if (runningRef.current) return
    runningRef.current = true
    setIsPlaying(true)
    clearPreviewTimer()

    const cycle = cycleRef.current
    let index = startIndex
    while (index < animations.length) {
      const current = animations[index]
      if (!current) break
      if (index !== startIndex && current.trigger === 'click') break

      const concurrent: ElementAnimation[] = [current]
      index += 1
      while (index < animations.length && animations[index]?.trigger === 'with-previous') {
        concurrent.push(animations[index]!)
        index += 1
      }
      await Promise.all(concurrent.map((anim) => playSingleAnimation(anim, cycle)))

      if (index < animations.length && animations[index]?.trigger === 'after-previous') {
        continue
      }
      break
    }

    if (cycleRef.current !== cycle) return
    nextIndexRef.current = index
    runningRef.current = false
    setIsPlaying(false)
    const finished = index >= animations.length
    setIsComplete(finished)
    if (!finished) maybeSchedulePreviewAdvance()
  }, [animations, clearPreviewTimer, maybeSchedulePreviewAdvance, playSingleAnimation])

  const reset = useCallback(() => {
    cycleRef.current += 1
    clearPreviewTimer()
    runningRef.current = false
    timeoutRef.current.forEach((timeout) => clearTimeout(timeout))
    timeoutRef.current.clear()
    completionRef.current.clear()
    setIsPlaying(false)
    setIsComplete(false)
    setActiveAnimationByElement({})
    nextIndexRef.current = 0

    const entranceIds = getEntranceElementIds(animations)
    const initialVisible = slide.elements
      .filter((element) => !element.hidden)
      .filter((element) => !entranceIds.has(element.id))
      .map((element) => element.id)
    setVisibleElementIds(new Set(initialVisible))

    if (animations[0] && animations[0].trigger !== 'click') {
      void runFromIndex(0)
      return
    }
    maybeSchedulePreviewAdvance()
  }, [animations, clearPreviewTimer, maybeSchedulePreviewAdvance, runFromIndex, slide.elements])

  const advance = useCallback((): boolean => {
    if (runningRef.current) return true
    if (nextIndexRef.current >= animations.length) {
      setIsComplete(true)
      return false
    }
    void runFromIndex(nextIndexRef.current)
    return true
  }, [animations.length, runFromIndex])

  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  useEffect(() => {
    reset()
    return clearPreviewTimer
  }, [reset, clearPreviewTimer])

  return {
    visibleElementIds,
    activeAnimationByElement,
    onElementAnimationEnd: completeAnimation,
    advance,
    reset,
    isPlaying,
    isComplete,
  }
}
