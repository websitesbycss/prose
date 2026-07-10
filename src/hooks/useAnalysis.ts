import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Issue } from '@/types'
import { lintText } from '@/lib/grammar/harperLinter'

export interface AnalysisState {
  issues: Issue[]
  analyzing: boolean
  error: string | null
  hasRun: boolean
}

export interface AnalysisControls {
  analyze(documentText: string): Promise<void>
  clearIssues(): void
}

export function useAnalysis(): AnalysisState & AnalysisControls {
  const setIssueCount = useAppStore((s) => s.setIssueCount)
  const [issues, setIssues] = useState<Issue[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)
  // Guards against a stale run's result landing after a newer one started.
  const requestIdRef = useRef(0)

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
        setIssueCount(result.length)
        setHasRun(true)
      } catch (err) {
        console.error('useAnalysis error:', err)
        if (requestId === requestIdRef.current) setError('Grammar check failed to load.')
      } finally {
        if (requestId === requestIdRef.current) setAnalyzing(false)
      }
    },
    [setIssueCount]
  )

  const clearIssues = useCallback((): void => {
    setIssues([])
    setIssueCount(0)
    setHasRun(false)
    setError(null)
  }, [setIssueCount])

  return { issues, analyzing, error, hasRun, analyze, clearIssues }
}
