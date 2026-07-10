import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '@/store/appStore'
import type { FileType } from '@/lib/aiConfig'
import type { AttachedImage } from '@/components/editor/imageAttachments'
import { waitForModelWarm } from '@/lib/ai/modelWarmup'

export interface ChatMessageImage {
  id: string
  url: string
  name: string
  width: number
  height: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  images?: ChatMessageImage[]
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
    images?: AttachedImage[],
  ): Promise<void>
  clearMessages(): void
}

export function useAi(): AiChatState & AiChatControls {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const assistantIdRef = useRef('')
  // Ref keeps a fresh copy of messages so sendMessage can read history without
  // needing messages in its dependency array (which would recreate it every chunk).
  const messagesRef = useRef<ChatMessage[]>([])
  // The main process's "took too long to respond" warning doesn't actually
  // abort generation — a slow-but-working model can still send real chunks
  // afterward. Tracks whether the bubble currently holds that stale warning
  // so the next real chunk replaces it instead of appending onto it.
  const staleWarningRef = useRef(false)

  const sendMessage = useCallback(
    async (
      request: string,
      documentContent: string,
      assignmentContext?: string,
      selectionContent?: string,
      fileType?: FileType,
      images?: AttachedImage[],
    ): Promise<void> => {
      if (ollamaStatus !== 'ready') return

      // Capture history before adding the new turn
      const history = messagesRef.current.map(({ role, content }) => ({ role, content }))

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(), role: 'user', content: request,
        images: images && images.length > 0
          ? images.map(({ id, url, name, width, height }) => ({ id, url, name, width, height }))
          : undefined,
      }
      const assistantId = crypto.randomUUID()
      assistantIdRef.current = assistantId
      const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '' }

      messagesRef.current = [...messagesRef.current, userMsg, assistantMsg]
      setMessages(messagesRef.current)
      setStreaming(true)
      setReloading(false)
      setError(null)
      staleWarningRef.current = false

      try {
        // Concrete check (Ollama's /api/ps — models actually resident in
        // memory), not a guess: only shown when we know for certain the model
        // still needs to load, same signal used by Slides Generate and the
        // old Documents Issues analysis loading UI.
        if (!(await window.prose.ai.isModelLoaded())) {
          setReloading(true)
          await waitForModelWarm()
          setReloading(false)
        }

        const imagePayload = images && images.length > 0 ? images.map((i) => i.base64) : undefined
        await window.prose.ai.streamPrompt(
          { documentContent, assignmentContext, request, history, selectionContent, fileType, images: imagePayload },
          (chunk) => {
            const wasStale = staleWarningRef.current
            staleWarningRef.current = false
            setMessages((prev) => {
              const next = prev.map((m) =>
                m.id === assistantIdRef.current
                  ? { ...m, content: (wasStale ? '' : m.content) + chunk }
                  : m
              )
              messagesRef.current = next
              return next
            })
          },
          (errMsg) => {
            // Error signal from main process — show it as the assistant message
            // content. This doesn't necessarily mean generation has stopped
            // (see the "took too long" warning) — a subsequent real chunk will
            // replace this instead of appending onto it.
            setReloading(false)
            staleWarningRef.current = true
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

  return { messages, streaming, reloading, error, sendMessage, clearMessages }
}
