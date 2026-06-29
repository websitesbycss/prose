import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Wand2 } from 'lucide-react'
import { generateBrainstormIdeas } from './aiBoardUtils'

interface Props {
  onInsert(ideas: string[]): void
  onClose(): void
}

export function BoardBrainstormModal({ onInsert, onClose }: Props): JSX.Element {
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
    onClose()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[99991] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">AI brainstorm</h2>
          <button className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-3 text-xs text-muted-foreground">
            Generates a set of short ideas as sticky notes on the board.
          </p>

          <textarea
            className="mb-3 h-16 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="Ways to reduce churn in our onboarding flow"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />

          {ideas && (
            <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted p-2">
              {ideas.map((idea, i) => (
                <li key={i} className="rounded bg-background px-2 py-1 text-xs text-foreground shadow-sm">{idea}</li>
              ))}
            </ul>
          )}

          {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <button className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent" onClick={onClose}>
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
              onClick={() => void handleGenerate()}
              disabled={!topic.trim() || loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {loading ? 'Generating…' : ideas ? 'Regenerate' : 'Generate'}
            </button>
            {ideas && (
              <button
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                onClick={handleInsert}
              >
                Add to board
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
