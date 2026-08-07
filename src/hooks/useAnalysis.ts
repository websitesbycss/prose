import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Issue } from '@/types'
import { lintText } from '@/lib/grammar/harperLinter'
import { shiftIssueSpansAfterEdit } from '@/lib/issueSpan'

export interface AnalysisState {
  issues: Issue[]
  analyzing: boolean
  error: string | null
  hasRun: boolean
}

export interface AnalysisControls {
  analyze(documentText: string): Promise<void>
  clearIssues(): void
  dismissIssue(id: string): void
  /** Call after applying an issue's suggestion — see shiftIssueSpansAfterEdit. */
  applyEdit(editStart: number, editEnd: number, delta: number): void
}

export function useAnalysis(): AnalysisState & AnalysisControls {
  const setIssueCount = useAppStore((s) => s.setIssueCount)
  const [issues, setIssues] = useState<Issue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  // Guards against a stale run's result landing after a newer one started.
  const requestIdRef = useRef(0)

  // The toolbar badge always mirrors the live issue list — one sync point
  // instead of remembering to update the count at every mutation site.
  useEffect(() => {
    setIssueCount(issues.length)
  }, [issues, setIssueCount])

  const analyze = useCallback(
    async (documentText: string): Promise<void> => {
      const text = documentText.trim()
      if (!text) return
      const requestId = ++requestIdRef.current

      setAnalyzing(true)
      setError(null)

      try {
        const result = await lintText(documentText)
        if (requestId !== requestIdRef.current) return
        setIssues(result)
        setHasRun(true)
      } catch (err) {
        console.error('useAnalysis error:', err)
        if (requestId === requestIdRef.current) setError('Grammar check failed to load.')
      } finally {
        if (requestId === requestIdRef.current) setAnalyzing(false)
      }
    },
    []
  )

  const clearIssues = useCallback((): void => {
    setIssues([])
    setHasRun(false)
    setError(null)
  }, [])

  const dismissIssue = useCallback((id: string): void => {
    setIssues((prev) => prev.filter((i) => i.id !== id))
  }, [])

  const applyEdit = useCallback((editStart: number, editEnd: number, delta: number): void => {
    setIssues((prev) => shiftIssueSpansAfterEdit(prev, editStart, editEnd, delta))
  }, [])

  return { issues, analyzing, error, hasRun, analyze, clearIssues, dismissIssue, applyEdit }
}
