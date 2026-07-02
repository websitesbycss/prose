import { useState } from 'react'
import { Sparkles, MessageSquare, Wand2, X, Loader2 } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ChatTab } from '@/components/editor/AiPanel'
import { useAppStore } from '@/store/appStore'
import { generateBrainstormIdeas } from './aiBoardUtils'
import { cn } from '@/lib/utils'

interface Props {
  getBoardContext(): string
  onInsert(ideas: string[]): void
}

type Tab = 'chat' | 'brainstorm'

export function BoardsAIPanel({ getBoardContext, onInsert }: Props): JSX.Element {
  const setAiPanelOpen = useAppStore((s) => s.setAiPanelOpen)
  const assignmentContext = useAppStore((s) => s.assignmentContext)
  const setAssignmentContext = useAppStore((s) => s.setAssignmentContext)

  const [tab, setTab] = useState<Tab>('chat')

  // Brainstorm state
  const [topic, setTopic] = useState('')
  const [loading, setLoading] = useState(false)
  const [ideas, setIdeas] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate(): Promise<void> {
    if (!topic.trim()) return
    setLoading(true)
    setError(null)
    setIdeas(null)
    try {
      const result = await generateBrainstormIdeas(topic)
      if (result.length === 0) setError('No ideas generated — try a more specific topic')
      else setIdeas(result)
    } catch {
      setError('Generation failed — check Ollama is running')
    } finally {
      setLoading(false)
    }
  }

  function handleInsert(): void {
    if (!ideas || ideas.length === 0) return
    onInsert(ideas)
  }

  return (
    <div className="flex h-full flex-col border-l border-border">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 pl-3 pr-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium">AI assistant</span>

        <div className="ml-auto flex items-center rounded-md border border-border bg-muted/40 p-0.5 gap-0.5">
          <button
            onClick={() => setTab('chat')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              tab === 'chat'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <MessageSquare className="h-2.5 w-2.5" />
            Chat
          </button>
          <button
            onClick={() => setTab('brainstorm')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              tab === 'brainstorm'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Wand2 className="h-2.5 w-2.5" />
            Brainstorm
          </button>
        </div>

        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={() => setAiPanelOpen(false)}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Separator />

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'chat' ? (
          <ChatTab
            editor={null}
            fileType="board"
            assignmentContext={assignmentContext}
            setAssignmentContext={setAssignmentContext}
            getDocumentContent={getBoardContext}
          />
        ) : (
          <div className="flex h-full flex-col p-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Generates short ideas as sticky notes on the board.
            </p>

            <textarea
              className="mb-3 h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Ways to reduce churn in our onboarding flow"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleGenerate() }
              }}
            />

            <div className="flex gap-2">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
                onClick={() => void handleGenerate()}
                disabled={!topic.trim() || loading}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                {loading ? 'Generating…' : ideas ? 'Regenerate' : 'Generate'}
              </button>
              {ideas && (
                <button
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                  onClick={handleInsert}
                >
                  Add to board
                </button>
              )}
            </div>

            {error && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
            )}

            {ideas && (
              <ul className="mt-3 flex-1 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted p-2">
                {ideas.map((idea, i) => (
                  <li key={i} className="rounded bg-background px-2 py-1 text-xs text-foreground shadow-sm">
                    {idea}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
