import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'
import type { FileType } from '@/lib/aiConfig'

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
  sendMessage(
    request: string,
    documentContent: string,
    assignmentContext?: string,
    selectionContent?: string,
    fileType?: FileType,
  ): Promise<void>
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
  // Ref keeps a fresh copy of messages so sendMessage can read history without
  // needing messages in its dependency array (which would recreate it every chunk).
  const messagesRef = useRef<ChatMessage[]>([])

  const sendMessage = useCallback(
    async (
      request: string,
      documentContent: string,
      assignmentContext?: string,
      selectionContent?: string,
      fileType?: FileType,
    ): Promise<void> => {
      if (ollamaStatus !== 'ready') return

      // Capture history before adding the new turn
      const history = messagesRef.current.map(({ role, content }) => ({ role, content }))

      const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: request }
      const assistantId = crypto.randomUUID()
      assistantIdRef.current = assistantId
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

      messagesRef.current = [...messagesRef.current, userMsg, assistantMsg]
      setMessages(messagesRef.current)
      setStreaming(true)
      setReloading(false)
      setError(null)
      firstChunkRef.current = false

      reloadTimerRef.current = setTimeout(() => {
        if (!firstChunkRef.current) setReloading(true)
      }, 1500)

      try {
        await window.prose.ai.streamPrompt(
          { documentContent, assignmentContext, request, history, selectionContent, fileType },
          (chunk) => {
            if (!firstChunkRef.current) {
              firstChunkRef.current = true
              setReloading(false)
              if (reloadTimerRef.current) {
                clearTimeout(reloadTimerRef.current)
                reloadTimerRef.current = null
              }
            }
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === assistantIdRef.current ? { ...m, content: m.content + chunk } : m
              )
              messagesRef.current = next
              return next
            })
          },
          (errMsg) => {
            // Error signal from main process — show it as the assistant message content
            setReloading(false)
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === assistantIdRef.current ? { ...m, content: errMsg } : m
              )
              messagesRef.current = next
              return next
            })
          }
        )
      } catch (err) {
        setError('AI request failed. Is Ollama running?')
        console.error('useAi error:', err)
        setMessages((prev) => {
          const next = prev.filter((m) => m.id !== assistantIdRef.current)
          messagesRef.current = next
          return next
        })
      } finally {
        if (reloadTimerRef.current) {
          clearTimeout(reloadTimerRef.current)
          reloadTimerRef.current = null
        }
        // If the assistant message is still empty after streaming ended, show a fallback
        setMessages((prev) => {
          const next = prev.map((m) =>
            m.id === assistantIdRef.current && m.content === ''
              ? { ...m, content: 'No response received. Check that Ollama is running and the model is loaded.' }
              : m
          )
          messagesRef.current = next
          return next
        })
        setStreaming(false)
        setReloading(false)
      }
    },
    [ollamaStatus]
  )

  const clearMessages = useCallback((): void => {
    messagesRef.current = []
    setMessages([])
    setError(null)
  }, [])

  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current)
    }
  }, [])

  return { messages, streaming, reloading, error, sendMessage, clearMessages }
}
