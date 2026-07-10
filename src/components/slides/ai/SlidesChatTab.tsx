// Slides-specific chat tab — mirrors the shared editor/AiPanel ChatTab but
// adds image attachments (paperclip composer button + horizontal-scroll pill
// rows, pre-send and inside sent bubbles), gated on the local model's
// multimodal capability. Kept separate from the shared ChatTab rather than
// bolting images onto it, since Slides is the only surface using them.
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Paperclip } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { useAi } from '@/hooks/useAi'
import { cn } from '@/lib/utils'
import {
  AiMarkdown, normaliseMath, ActionCard, splitAssistantContent, AiWaitingIndicator,
} from '@/components/editor/AiPanel'
import type { AiActionHandler, ActionCardState } from '@/components/editor/AiPanel'
import type { ValidatedActions } from '@/lib/ai/proseActions'
import { IMAGE_CAP, openImagePicker, type AttachedImage } from '@/components/editor/imageAttachments'
import { ImagePill, SentImagePill, ImageEnlargeModal, type ImagePreview } from '@/components/editor/ImagePill'

const SLIDES_SUGGESTIONS = [
  'Improve this slide',
  'Add a next slide',
  'Write speaker notes',
  'Add a diagram',
  'Add a chart',
  'Suggest a title',
]

interface Props {
  getDocumentContent(): string
  assignmentContext: string
  actionHandler: AiActionHandler
}

export function SlidesChatTab({ getDocumentContent, assignmentContext, actionHandler }: Props): JSX.Element {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const multimodalCapable = useAppStore((s) => s.multimodalCapable)
  const { messages, streaming, reloading, error, sendMessage, clearMessages } = useAi()

  const [input, setInput] = useState('')
  const [images, setImages] = useState<AttachedImage[]>([])
  const [enlarged, setEnlarged] = useState<ImagePreview | null>(null)
  const [actionStates, setActionStates] = useState<Record<string, ActionCardState>>({})
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const getDocumentContentRef = useRef(getDocumentContent)
  getDocumentContentRef.current = getDocumentContent

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const unavailable = ollamaStatus === 'unavailable'
  const busy = streaming || ollamaStatus === 'loading'

  async function send(text: string): Promise<void> {
    const t = text.trim()
    if ((!t && images.length === 0) || busy || unavailable) return
    const docText = getDocumentContentRef.current()
    const sentImages = images
    setInput('')
    setImages([])
    if (inputRef.current) {
      inputRef.current.style.height = ''
      inputRef.current.style.overflowY = 'hidden'
    }
    await sendMessage(t, docText, assignmentContext || undefined, undefined, 'slides', sentImages)
  }

  const addImages = useCallback((imgs: AttachedImage[]) => {
    setImages((prev) => [...prev, ...imgs].slice(0, IMAGE_CAP))
  }, [])

  async function applyActions(messageId: string, validated: ValidatedActions): Promise<void> {
    setActionStates((s) => ({ ...s, [messageId]: { status: 'applying' } }))
    try {
      const result = await actionHandler.apply(validated.actions)
      setActionStates((s) => ({
        ...s,
        [messageId]: result.ok
          ? { status: 'applied' }
          : { status: 'error', message: result.message ?? 'Could not apply these actions.' },
      }))
    } catch (err) {
      console.error('[SlidesChatTab] action apply error:', err)
      setActionStates((s) => ({ ...s, [messageId]: { status: 'error', message: 'Something went wrong while applying.' } }))
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 pt-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Suggestions
            </p>
            <div className="flex flex-col gap-1">
              {SLIDES_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={busy || unavailable}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    'border border-border hover:bg-accent hover:text-accent-foreground',
                    (busy || unavailable) && 'cursor-not-allowed opacity-40',
                  )}
                  onClick={() => void send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => {
          const { text: displayText, validated, building } = msg.role === 'assistant'
            ? splitAssistantContent(msg.content, actionHandler.surface)
            : { text: msg.content, validated: null, building: false }
          const showBubble = msg.role === 'user' || displayText || (!validated && !building)
          return (
            <div key={msg.id} className={cn('flex flex-col', msg.role === 'user' ? 'items-end' : 'items-start')}>
              {msg.role === 'user' && msg.images && msg.images.length > 0 && (
                <div className="mb-1 flex max-w-[85%] gap-1.5 overflow-x-auto pb-1">
                  {msg.images.map((img) => (
                    <SentImagePill key={img.id} image={img} onOpen={setEnlarged} inverted={false} />
                  ))}
                </div>
              )}
              {showBubble && (
                <div
                  className={cn(
                    'ai-chat-bubble min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                    msg.role === 'user'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted text-foreground',
                  )}
                >
                  {msg.role === 'assistant' && displayText ? (
                    <AiMarkdown>{normaliseMath(displayText)}</AiMarkdown>
                  ) : msg.content || <AiWaitingIndicator reloading={reloading} />}
                </div>
              )}
              {building && (
                <div className="mt-1 flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[10px] text-muted-foreground">
                  <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                  Preparing actions…
                </div>
              )}
              {validated && (
                <ActionCard
                  validated={validated}
                  state={actionStates[msg.id] ?? { status: 'idle' }}
                  onApply={() => void applyActions(msg.id, validated)}
                />
              )}
            </div>
          )
        })}

        {error && (
          <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>
        )}

        {unavailable && messages.length === 0 && (
          <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
            Ollama is not running. Install it and ensure it&apos;s available on your system.
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length > 0 && (
        <div className="shrink-0 flex justify-end px-3 pb-1">
          <button
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setActionStates({}); clearMessages() }}
          >
            Clear chat
          </button>
        </div>
      )}

      <div className="h-px shrink-0 bg-border" />

      {/* Input */}
      <div className="shrink-0 p-2">
        <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
          {images.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto border-b border-border px-2 py-1.5 pb-2">
              {images.map((img) => (
                <ImagePill
                  key={img.id}
                  image={img}
                  onOpen={setEnlarged}
                  onRemove={(id) => setImages((prev) => prev.filter((i) => i.id !== id))}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 px-2 py-1.5">
            {multimodalCapable && (
              <button
                type="button"
                disabled={unavailable || busy || images.length >= IMAGE_CAP}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                onClick={() => openImagePicker(IMAGE_CAP - images.length, addImages)}
                title="Attach images"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              className="flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              style={{ lineHeight: '1.4', overflowY: 'hidden' }}
              placeholder={unavailable ? 'AI unavailable' : 'Ask anything…'}
              value={input}
              disabled={unavailable || busy}
              onChange={(e) => {
                setInput(e.target.value)
                const el = e.target
                el.style.height = '0'
                const full = el.scrollHeight
                const max = 128
                el.style.height = `${Math.min(full, max)}px`
                el.style.overflowY = full > max ? 'auto' : 'hidden'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
            />
            <button
              disabled={(!input.trim() && images.length === 0) || unavailable || busy}
              className="shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-30"
              onClick={() => void send(input)}
            >
              {streaming ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      <ImageEnlargeModal image={enlarged} onClose={() => setEnlarged(null)} />
    </div>
  )
}
