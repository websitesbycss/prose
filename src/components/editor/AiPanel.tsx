import { useState, useRef, useEffect } from 'react'
import type { Editor } from '@tiptap/react'
import { motion } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useAppStore } from '@/store/appStore'
import { useAi } from '@/hooks/useAi'
import { cn } from '@/lib/utils'
import { Send, ChevronDown, ChevronRight, Loader2, Sparkles } from 'lucide-react'

const CHIPS = [
  'Strengthen thesis',
  'Check paragraph focus',
  'Suggest transition',
  'Improve clarity',
  'Check argument',
  'Reading level',
] as const

interface AiPanelProps {
  editor: Editor | null
}

export default function AiPanel({ editor }: AiPanelProps): JSX.Element {
  const ollamaStatus = useAppStore((s) => s.ollamaStatus)
  const pendingAiPrompt = useAppStore((s) => s.pendingAiPrompt)
  const setPendingAiPrompt = useAppStore((s) => s.setPendingAiPrompt)
  const { response, streaming, reloading, error, sendPrompt, clearResponse } = useAi()

  const [contextOpen, setContextOpen] = useState(false)
  const [assignmentContext, setAssignmentContext] = useState('')
  const [freeInput, setFreeInput] = useState('')
  const responseEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [response])

  useEffect(() => {
    if (pendingAiPrompt !== null) {
      setFreeInput(pendingAiPrompt)
      setPendingAiPrompt(null)
    }
  }, [pendingAiPrompt, setPendingAiPrompt])

  function getDocumentText(): string {
    return editor ? editor.getText() : ''
  }

  async function handleChip(chip: string): Promise<void> {
    clearResponse()
    await sendPrompt(chip, getDocumentText(), assignmentContext || undefined)
  }

  async function handleFreeInput(): Promise<void> {
    if (!freeInput.trim()) return
    const q = freeInput.trim()
    setFreeInput('')
    clearResponse()
    await sendPrompt(q, getDocumentText(), assignmentContext || undefined)
  }

  const unavailable = ollamaStatus === 'unavailable'
  const loading = ollamaStatus === 'loading'

  return (
    <div className="flex h-full flex-col border-l border-border">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-medium">AI Assistant</span>
        <div className="ml-auto flex items-center gap-1.5">
          {loading && (
            <span className="text-[10px] text-muted-foreground">Starting…</span>
          )}
          {reloading && (
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              Reloading model…
            </span>
          )}
          <div
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              ollamaStatus === 'ready'
                ? 'bg-green-500'
                : ollamaStatus === 'loading'
                ? 'bg-yellow-500 animate-pulse'
                : 'bg-muted-foreground/40'
            )}
          />
        </div>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          {/* Assignment context */}
          <div className="flex flex-col gap-1">
            <button
              className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setContextOpen((o) => !o)}
            >
              {contextOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Assignment context
            </button>
            {contextOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
              >
                <textarea
                  className={cn(
                    'mt-1 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5',
                    'text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
                    'min-h-[72px]'
                  )}
                  placeholder="Paste your assignment prompt…"
                  value={assignmentContext}
                  onChange={(e) => setAssignmentContext(e.target.value)}
                />
              </motion.div>
            )}
          </div>

          <Separator />

          {/* Chips */}
          <div className="flex flex-col gap-1">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Suggestions
            </p>
            <div className="flex flex-col gap-1">
              {CHIPS.map((chip) => (
                <button
                  key={chip}
                  disabled={unavailable || loading || streaming}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
                    'border border-border hover:bg-accent hover:text-accent-foreground',
                    (unavailable || loading || streaming) &&
                      'cursor-not-allowed opacity-40'
                  )}
                  onClick={() => void handleChip(chip)}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Response area */}
          {(response || streaming || error) && (
            <>
              <Separator />
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Response
                  </p>
                  {!streaming && (
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                      onClick={clearResponse}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="rounded-md bg-muted/40 p-2.5 text-xs leading-relaxed text-foreground">
                  {error ? (
                    <span className="text-destructive">{error}</span>
                  ) : (
                    <>
                      {response}
                      {streaming && !response && (
                        <span className="text-muted-foreground">
                          {reloading ? 'Reloading model…' : 'Thinking…'}
                        </span>
                      )}
                      {streaming && (
                        <span className="ml-0.5 inline-block h-3 w-0.5 animate-pulse bg-primary align-middle" />
                      )}
                    </>
                  )}
                  <div ref={responseEndRef} />
                </div>
              </div>
            </>
          )}

          {unavailable && (
            <p className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
              Ollama is not running. Install Ollama and ensure it&apos;s available on your system.
            </p>
          )}
        </div>
      </ScrollArea>

      {/* Free-form input */}
      <div className="shrink-0 border-t border-border p-2">
        <div className="flex gap-1.5">
          <Input
            className="h-7 text-xs"
            placeholder={unavailable ? 'AI unavailable' : 'Ask anything about your document…'}
            value={freeInput}
            disabled={unavailable || loading || streaming}
            onChange={(e) => setFreeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void handleFreeInput()
              }
            }}
          />
          <Button
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={!freeInput.trim() || unavailable || loading || streaming}
            onClick={() => void handleFreeInput()}
          >
            {streaming ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
