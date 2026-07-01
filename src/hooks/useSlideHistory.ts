import { useRef, useCallback } from 'react'
import type { Slide } from '@/types/slides'

const MAX_STACK = 50

interface Snapshot {
  slides: Slide[]
}

export interface SlideHistory {
  push(slides: Slide[]): void
  undo(slides: Slide[]): Snapshot | null
  redo(slides: Slide[]): Snapshot | null
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

export function useSlideHistory(): SlideHistory {
  const undoStack = useRef<Snapshot[]>([])
  const redoStack = useRef<Snapshot[]>([])

  const push = useCallback((slides: Slide[]): void => {
    undoStack.current = [...undoStack.current, { slides }].slice(-MAX_STACK)
    redoStack.current = []
  }, [])

  const undo = useCallback((slides: Slide[]): Snapshot | null => {
    if (undoStack.current.length === 0) return null
    const prev = undoStack.current[undoStack.current.length - 1]!
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, { slides }].slice(-MAX_STACK)
    return prev
  }, [])

  const redo = useCallback((slides: Slide[]): Snapshot | null => {
    if (redoStack.current.length === 0) return null
    const next = redoStack.current[redoStack.current.length - 1]!
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, { slides }].slice(-MAX_STACK)
    return next
  }, [])

  const canUndo = useCallback((): boolean => undoStack.current.length > 0, [])
  const canRedo = useCallback((): boolean => redoStack.current.length > 0, [])
  const clear = useCallback((): void => {
    undoStack.current = []
    redoStack.current = []
  }, [])

  return { push, undo, redo, canUndo, canRedo, clear }
}
