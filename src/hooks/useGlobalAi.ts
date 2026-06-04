import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '@/store/appStore'

export interface GlobalChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface GlobalAiState {
  messages: GlobalChatMessage[]
  streaming: boolean
  reloading: boolean
  error: string | null
}

export interface GlobalAiControls {
  sendMessage(request: string): Promise<void>
  clearMessages(): void
}

export function useGlobalAi(): GlobalAiState & GlobalAiControls {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const [messages, setMessages] = useState<GlobalChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const firstChunkRef = useRef(false)
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const assistantIdRef = useRef('')
  const messagesRef = useRef<GlobalChatMessage[]>([])

  const sendMessage = useCallback(async (request: string): Promise<void> => {
    if (ollamaStatus !== 'ready') return

    const history = messagesRef.current.map(({ role, content }) => ({ role, content }))
    const userMsg: GlobalChatMessage = { id: crypto.randomUUID(), role: 'user', content: request }
    const assistantId = crypto.randomUUID()
    assistantIdRef.current = assistantId
    const assistantMsg: GlobalChatMessage = { id: assistantId, role: 'assistant', content: '' }

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
      await window.prose.ai.globalStreamPrompt(
        request,
        history,
        (chunk) => {
          if (!firstChunkRef.current) {
            firstChunkRef.current = true
            setReloading(false)
            if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null }
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
          setReloading(false)
          setMessages((prev) => {
            const next = prev.map((m) =>
              m.id === assistantIdRef.current ? { ...m, content: errMsg } : m
            )
            messagesRef.current = next
            return next
          })
        },
      )
    } catch (err) {
      setError('AI request failed. Is Ollama running?')
      console.error('useGlobalAi error:', err)
      setMessages((prev) => {
        const next = prev.filter((m) => m.id !== assistantIdRef.current)
        messagesRef.current = next
        return next
      })
    } finally {
      if (reloadTimerRef.current) { clearTimeout(reloadTimerRef.current); reloadTimerRef.current = null }
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
  }, [ollamaStatus])

  const clearMessages = useCallback((): void => {
    messagesRef.current = []
    setMessages([])
    setError(null)
  }, [])

  useEffect(() => {
    return () => { if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current) }
  }, [])

  return { messages, streaming, reloading, error, sendMessage, clearMessages }
}
