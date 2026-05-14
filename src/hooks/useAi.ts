import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

export interface AiState {
  response: string
  streaming: boolean
  reloading: boolean
  error: string | null
}

export interface AiControls {
  sendPrompt(request: string, documentContent: string, assignmentContext?: string): Promise<void>
  clearResponse(): void
}

export function useAi(): AiState & AiControls {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const [response, setResponse] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstChunkRef = useRef(false)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sendPrompt = useCallback(
    async (request: string, documentContent: string, assignmentContext?: string): Promise<void> => {
      if (ollamaStatus !== 'ready') return

      setStreaming(true)
      setReloading(false)
      setResponse('')
      setError(null)
      firstChunkRef.current = false

      // Show "reloading" indicator if no chunk arrives within 1.5s (model warming up)
      reloadTimerRef.current = setTimeout(() => {
        if (!firstChunkRef.current) setReloading(true)
      }, 1500)

      try {
        await window.prose.ai.streamPrompt(
          { documentContent, assignmentContext, request },
          (chunk) => {
            if (!firstChunkRef.current) {
              firstChunkRef.current = true
              setReloading(false)
              if (reloadTimerRef.current) {
                clearTimeout(reloadTimerRef.current)
                reloadTimerRef.current = null
              }
            }
            setResponse((prev) => prev + chunk)
          }
        )
      } catch (err) {
        setError('AI request failed. Is Ollama running?')
        console.error('useAi error:', err)
      } finally {
        if (reloadTimerRef.current) {
          clearTimeout(reloadTimerRef.current)
          reloadTimerRef.current = null
        }
        setStreaming(false)
        setReloading(false)
      }
    },
    [ollamaStatus]
  )

  const clearResponse = useCallback((): void => {
    setResponse('')
    setError(null)
  }, [])

  return { response, streaming, reloading, error, sendPrompt, clearResponse }
}
