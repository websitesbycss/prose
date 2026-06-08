import { useRef, useCallback } from 'react'
import type { Slide } from '@/types/slides'

const MAX_STACK = 50

export interface SlideHistory {
  push(current: Slide[]): void
  undo(current: Slide[]): Slide[] | null
  redo(current: Slide[]): Slide[] | null
  canUndo(): boolean
  canRedo(): boolean
  clear(): void
}

export function useSlideHistory(): SlideHistory {
  const undoStack = useRef<Slide[][]>([])
  const redoStack = useRef<Slide[][]>([])

  const push = useCallback((current: Slide[]): void => {
    undoStack.current = [...undoStack.current, current].slice(-MAX_STACK)
    redoStack.current = []
  }, [])

  const undo = useCallback((current: Slide[]): Slide[] | null => {
    if (undoStack.current.length === 0) return null
    const prev = undoStack.current[undoStack.current.length - 1]!
    undoStack.current = undoStack.current.slice(0, -1)
    redoStack.current = [...redoStack.current, current].slice(-MAX_STACK)
    return prev
  }, [])

  const redo = useCallback((current: Slide[]): Slide[] | null => {
    if (redoStack.current.length === 0) return null
    const next = redoStack.current[redoStack.current.length - 1]!
    redoStack.current = redoStack.current.slice(0, -1)
    undoStack.current = [...undoStack.current, current].slice(-MAX_STACK)
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
