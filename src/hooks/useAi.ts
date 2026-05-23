import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/appStore'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface AiChatState {
  messages: ChatMessage[]
  streaming: boolean
  reloading: boolean
  error: string | null
}

export interface AiChatControls {
  sendMessage(request: string, documentContent: string, assignmentContext?: string): Promise<void>
  clearMessages(): void
}

export function useAi(): AiChatState & AiChatControls {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstChunkRef = useRef(false)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assistantIdRef = useRef('')

  const sendMessage = useCallback(
    async (request: string, documentContent: string, assignmentContext?: string): Promise<void> => {
      if (ollamaStatus !== 'ready') return

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: request }
      const assistantId = crypto.randomUUID()
      assistantIdRef.current = assistantId
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setStreaming(true)
      setReloading(false)
      setError(null)
      firstChunkRef.current = false

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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantIdRef.current ? { ...m, content: m.content + chunk } : m
              )
            )
          }
        )
      } catch (err) {
        setError('AI request failed. Is Ollama running?')
        console.error('useAi error:', err)
        setMessages((prev) => prev.filter((m) => m.id !== assistantIdRef.current))
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

  const clearMessages = useCallback((): void => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, streaming, reloading, error, sendMessage, clearMessages }
}
