import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Bot, Send, X, Loader2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/appStore'
import { useGlobalAi } from '@/hooks/useGlobalAi'
import { cn } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

// Quick-access suggestion prompts for the global chat.
const GLOBAL_CHIPS = [
  'What should I work on next?',
  'What did I work on this week?',
  'Which files have the most words?',
  'Summarize my library by category',
]

function GlobalAiMarkdown({ children }: { children: string }): JSX.Element {
  return (
    <ReactMarkdown
      allowedElements={['p','strong','em','ul','ol','li','code','pre','blockquote']}
      unwrapDisallowed
      components={{
        p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:     ({ children }) => <em className="italic">{children}</em>,
        ul:     ({ children }) => <ul className="mb-1.5 ml-3 list-disc space-y-0.5">{children}</ul>,
        ol:     ({ children }) => <ol className="mb-1.5 ml-3 list-decimal space-y-0.5">{children}</ol>,
        li:     ({ children }) => <li>{children}</li>,
        code:   ({ children }) => (
          <code className="rounded bg-background/60 px-1 font-mono text-[11px]">{children}</code>
        ),
        pre:    ({ children }) => <pre className="mb-1.5 overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/40 pl-2 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}

export function GlobalAiChat(): JSX.Element {
  const open = useAppStore((s) => s.globalAiOpen)
  const setOpen = useAppStore((s) => s.setGlobalAiOpen)
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const { messages, streaming, reloading, error, sendMessage, clearMessages } = useGlobalAi()

  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const unavailable = ollamaStatus === 'unavailable'
  const busy = streaming || ollamaStatus === 'loading'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  // Ctrl+Shift+Space toggles the panel from anywhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape' && open) setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, setOpen])

  const send = useCallback(async (text: string): Promise<void> => {
    const t = text.trim()
    if (!t || busy || unavailable) return
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = ''
      inputRef.current.style.overflowY = 'hidden'
    }
    await sendMessage(t)
  }, [busy, unavailable, sendMessage])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="global-ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100] bg-background/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <motion.div
            key="global-ai-panel"
            initial={{ opacity: 0, scale: 0.97, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className={cn(
              'fixed left-1/2 top-20 z-[101] flex w-[560px] -translate-x-1/2 flex-col',
              'rounded-xl border border-border bg-background shadow-2xl',
              'max-h-[70vh] overflow-hidden',
            )}
          >
            {/* Header */}
            <div className="flex h-10 shrink-0 items-center gap-2 px-3">
              <Bot className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs font-medium">Global AI chat</span>
              <span className="ml-1 text-[10px] text-muted-foreground">
                Searches your file library
              </span>
              {messages.length > 0 && (
                <button
                  className="ml-auto mr-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={clearMessages}
                >
                  Clear
                </button>
              )}
              <button
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                  'text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  messages.length === 0 && 'ml-auto',
                )}
                onClick={() => setOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <Separator />

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col gap-2 pt-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Suggestions
                  </p>
                  <div className="flex flex-col gap-1">
                    {GLOBAL_CHIPS.map((chip) => (
                      <button
                        key={chip}
                        disabled={busy || unavailable}
                        className={cn(
                          'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                          'border border-border hover:bg-accent hover:text-accent-foreground',
                          (busy || unavailable) && 'cursor-not-allowed opacity-40',
                        )}
                        onClick={() => void send(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {unavailable && (
                    <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
                      Ollama is not running. Install it to enable AI features.
                    </p>
                  )}
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed',
                      msg.role === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-muted text-foreground',
                    )}
                  >
                    {msg.role === 'assistant' && msg.content ? (
                      <GlobalAiMarkdown>{msg.content}</GlobalAiMarkdown>
                    ) : msg.content || (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        {reloading ? (
                          <>
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            Reloading model…
                          </>
                        ) : (
                          <span className="flex gap-0.5">
                            <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {error && (
                <p className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{error}</p>
              )}

              <div ref={messagesEndRef} />
            </div>

            <Separator />

            {/* Input */}
            <div className="shrink-0 p-2">
              <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
                <div className="flex gap-1.5 px-2 py-1.5">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    className="flex-1 resize-none bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
                    style={{ lineHeight: '1.4', overflowY: 'hidden' }}
                    placeholder={unavailable ? 'AI unavailable' : 'Ask about your library…'}
                    value={input}
                    disabled={unavailable || busy}
                    onChange={(e) => {
                      setInput(e.target.value)
                      const el = e.target
                      el.style.height = '0'
                      const full = el.scrollHeight
                      const max = 96
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
                    disabled={!input.trim() || unavailable || busy}
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
              <p className="mt-1 px-1 text-[9px] text-muted-foreground/50">
                Ctrl+Shift+Space to toggle · Escape to close · reads file metadata only
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
