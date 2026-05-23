import { useState, useCallback } from 'react'
import { useAppStore } from '@/store/appStore'
import type { Issue, AnalysisResult } from '@/types'

export interface AnalysisState {
  issues: Issue[]
  tone: string
  analyzing: boolean
  error: string | null
  hasRun: boolean
}

export interface AnalysisControls {
  analyze(documentText: string, assignmentContext?: string): Promise<void>
  clearIssues(): void
}

export function useAnalysis(): AnalysisState & AnalysisControls {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const setIssueCount = useAppStore((s) => s.setIssueCount)
  const [issues, setIssues] = useState<Issue[]>([])
  const [tone, setTone] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasRun, setHasRun] = useState(false)

  const analyze = useCallback(
    async (documentText: string, assignmentContext?: string): Promise<void> => {
      if (ollamaStatus !== 'ready' || analyzing) return
      const text = documentText.trim()
      if (!text) return

      setAnalyzing(true)
      setError(null)

      try {
        const result: AnalysisResult = await window.prose.ai.analyze({
          documentContent: text,
          assignmentContext: assignmentContext?.trim() || undefined,
        })
        setIssues(result.issues)
        setTone(result.tone)
        setIssueCount(result.issues.length)
        setHasRun(true)
      } catch (err) {
        console.error('useAnalysis error:', err)
        setError('Analysis failed. Is Ollama running?')
      } finally {
        setAnalyzing(false)
      }
    },
    [ollamaStatus, analyzing, setIssueCount]
  )

  const clearIssues = useCallback((): void => {
    setIssues([])
    setTone('')
    setIssueCount(0)
    setHasRun(false)
    setError(null)
  }, [setIssueCount])

  return { issues, tone, analyzing, error, hasRun, analyze, clearIssues }
}
