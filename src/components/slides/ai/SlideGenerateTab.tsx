// Phase 31 — Generate tab with 3 modes: outline, document, single slide.
import { useState } from 'react'
import { Loader2, ChevronLeft, Check } from 'lucide-react'
import type { Slide, PresentationTheme, PresentationSettings } from '@/types/slides'
import { OUTLINE_SYSTEM_PROMPT, parseAiJson, aiSlideToProseSlide, attachGeneratedVisuals, type AiSlideSchema } from './aiSlideUtils'
import { SlideStaticView } from '../export/SlideStaticView'
import { cn } from '@/lib/utils'

const THUMB_W = 160
const THUMB_H = 90
const THUMB_SCALE = THUMB_W / 1920

interface Props {
  slides: Slide[]
  activeSlideIndex: number
  theme: PresentationTheme
  settings: PresentationSettings
  onInsertSlides(newSlides: Slide[], afterIndex: number): void
  onReplaceCurrentSlide(slide: Slide): void
}

type Mode = 'outline' | 'document' | 'single'
type GenState = 'idle' | 'loading' | 'preview' | 'error'

export function SlideGenerateTab({
  slides: _slides, activeSlideIndex, theme, settings: _settings,
  onInsertSlides, onReplaceCurrentSlide,
}: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('outline')
  const [genState, setGenState] = useState<GenState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [outlineText, setOutlineText] = useState('')
  const [singleDesc, setSingleDesc] = useState('')
  const [generatedSlides, setGeneratedSlides] = useState<Slide[]>([])
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set())

  // ── Prompt helpers ──────────────────────────────────────────────────────────

  async function generateFromOutline(): Promise<void> {
    if (!outlineText.trim()) return
    setGenState('loading')
    setError(null)
    try {
      const prompt = `${OUTLINE_SYSTEM_PROMPT}\n\nOutline:\n${outlineText.trim()}`
      const resp = await window.prose.ai.prompt({
        documentContent: outlineText,
        request: prompt,
        fileType: 'slides',
      })
      const aiSlides = parseAiJson<AiSlideSchema[]>(resp)
      const capped = aiSlides.slice(0, 20)
      const prosSlides = capped.map(ai => aiSlideToProseSlide(ai, theme))
      setGeneratedSlides(prosSlides)
      setSelectedIndices(new Set(prosSlides.map((_, i) => i)))
      setGenState('preview')
      // Deck renders immediately with text; suggested visuals fill in once generated.
      void attachGeneratedVisuals(capped, prosSlides, theme).then(setGeneratedSlides)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed — check Ollama is running')
      setGenState('error')
    }
  }

  async function generateFromDocument(): Promise<void> {
    setGenState('loading')
    setError(null)
    try {
      // Open file picker and read the document
      const docs = await window.prose.documents.getAll()
      // Simple: use first doc as a starting point. Ideally a picker would appear.
      const resp = await window.prose.ai.prompt({
        documentContent: docs.filter(d => d.fileType !== 'slides').slice(0, 3).map(d => `# ${d.title}\n${d.content?.replace(/<[^>]+>/g, '')}`).join('\n\n'),
        request: `${OUTLINE_SYSTEM_PROMPT}\n\nGenerate a presentation summarizing the content of the provided document(s).`,
        fileType: 'slides',
      })
      const aiSlides = parseAiJson<AiSlideSchema[]>(resp)
      const capped = aiSlides.slice(0, 20)
      const prosSlides = capped.map(ai => aiSlideToProseSlide(ai, theme))
      setGeneratedSlides(prosSlides)
      setSelectedIndices(new Set(prosSlides.map((_, i) => i)))
      setGenState('preview')
      void attachGeneratedVisuals(capped, prosSlides, theme).then(setGeneratedSlides)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setGenState('error')
    }
  }

  async function generateSingle(): Promise<void> {
    if (!singleDesc.trim()) return
    setGenState('loading')
    setError(null)
    try {
      const resp = await window.prose.ai.prompt({
        documentContent: singleDesc,
        request: `Generate content for a single presentation slide based on this description. Return ONLY a JSON object matching the schema: {"title": string, "layout": "title" | "title-content" | "two-column" | "section-header" | "image-caption", "content": string | string[], "speakerNotes": string, "suggestedImageDescription": string | null, "backgroundColor": null}`,
        fileType: 'slides',
      })
      const aiSlide = parseAiJson<AiSlideSchema>(resp)
      const prosSlide = aiSlideToProseSlide(aiSlide, theme)
      setGeneratedSlides([prosSlide])
      setSelectedIndices(new Set([0]))
      setGenState('preview')
      void attachGeneratedVisuals([aiSlide], [prosSlide], theme).then(setGeneratedSlides)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setGenState('error')
    }
  }

  function insertSelected(): void {
    if (mode === 'single' && generatedSlides[0]) {
      onReplaceCurrentSlide(generatedSlides[0])
    } else {
      const toInsert = generatedSlides.filter((_, i) => selectedIndices.has(i))
      if (toInsert.length > 0) onInsertSlides(toInsert, activeSlideIndex)
    }
    setGenState('idle')
    setGeneratedSlides([])
  }

  function toggleSelect(i: number): void {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  // ── Preview screen ───────────────────────────────────────────────────────────

  if (genState === 'preview') {
    return (
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setGenState('idle')}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs font-medium text-foreground">{generatedSlides.length} slides generated</span>
          <div className="flex-1" />
          {mode !== 'single' && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedIndices(selectedIndices.size === generatedSlides.length ? new Set() : new Set(generatedSlides.map((_, i) => i)))}
            >
              {selectedIndices.size === generatedSlides.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {generatedSlides.map((slide, i) => (
            <button
              key={slide.id}
              className={cn(
                'relative overflow-hidden rounded border-2 transition-all',
                selectedIndices.has(i) ? 'border-primary' : 'border-border',
              )}
              style={{ height: THUMB_H }}
              onClick={() => mode !== 'single' ? toggleSelect(i) : undefined}
            >
              <div style={{ width: 1920, height: 1080, transform: `scale(${THUMB_SCALE})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                <SlideStaticView slide={slide} theme={theme} width={1920} height={1080} />
              </div>
              {selectedIndices.has(i) && (
                <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </div>
              )}
              <div className="absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white">{i + 1}</div>
            </button>
          ))}
        </div>

        <button
          className="rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
          disabled={selectedIndices.size === 0}
          onClick={insertSelected}
        >
          {mode === 'single' ? 'Replace current slide' : `Insert ${selectedIndices.size} slide${selectedIndices.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    )
  }

  // ── Mode selector + input ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Mode tabs */}
      <div className="flex rounded-lg border border-border bg-muted p-0.5">
        {(['outline', 'document', 'single'] as Mode[]).map(m => (
          <button
            key={m}
            className={cn(
              'flex-1 rounded-md py-1 text-[11px] font-medium transition-all',
              mode === m ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
            onClick={() => { setMode(m); setGenState('idle'); setError(null) }}
          >
            {m === 'outline' ? 'Outline' : m === 'document' ? 'Document' : 'Single slide'}
          </button>
        ))}
      </div>

      {/* Outline mode */}
      {mode === 'outline' && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Paste an outline or bullet list. AI will generate one slide per major point.
          </p>
          <textarea
            className="h-36 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="1. Introduction&#10;2. Problem statement&#10;3. Our solution&#10;   - Key feature A&#10;   - Key feature B&#10;4. Results&#10;5. Conclusion"
            value={outlineText}
            onChange={e => setOutlineText(e.target.value)}
          />
          <button
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            onClick={() => void generateFromOutline()}
            disabled={!outlineText.trim() || genState === 'loading'}
          >
            {genState === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : 'Generate presentation'}
          </button>
        </>
      )}

      {/* Document mode */}
      {mode === 'document' && (
        <>
          <p className="text-[11px] text-muted-foreground">
            AI reads your existing Prose Documents and generates a slide deck summarising them.
          </p>
          <button
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            onClick={() => void generateFromDocument()}
            disabled={genState === 'loading'}
          >
            {genState === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : 'Generate from documents'}
          </button>
        </>
      )}

      {/* Single slide mode */}
      {mode === 'single' && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Describe what you want on this slide. AI generates title, body text, and speaker notes.
          </p>
          <textarea
            className="h-24 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="A slide showing our Q3 revenue growth with key metrics and a summary of what drove the results"
            value={singleDesc}
            onChange={e => setSingleDesc(e.target.value)}
          />
          <button
            className="flex items-center justify-center gap-1.5 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
            onClick={() => void generateSingle()}
            disabled={!singleDesc.trim() || genState === 'loading'}
          >
            {genState === 'loading' ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</> : 'Generate slide'}
          </button>
        </>
      )}

      {error && <p className="rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">{error}</p>}
    </div>
  )
}
