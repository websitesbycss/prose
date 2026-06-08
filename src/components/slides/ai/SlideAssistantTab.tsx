// Phase 31 — Assistant tab with 7 per-slide AI chips.
import { useState, useCallback } from 'react'
import { Loader2, Check, X } from 'lucide-react'
import type { Slide, SlideElement, PresentationTheme } from '@/types/slides'
import { slideToText, presentationToText, parseAiJson } from './aiSlideUtils'
import { cn } from '@/lib/utils'

interface Props {
  slide: Slide
  slides: Slide[]
  activeSlideIndex: number
  theme: PresentationTheme
  onUpdateNotes(notes: string): void
  onUpdateElement(id: string, partial: Partial<SlideElement>): void
  onInsertElement(el: SlideElement): void
}

type ChipState = 'idle' | 'loading' | 'done' | 'error'

interface ChipResult {
  type: string
  data: unknown
}

// ── Prompt helper ─────────────────────────────────────────────────────────────

async function promptAi(request: string, context: string): Promise<string> {
  return window.prose.ai.prompt({
    documentContent: context,
    request,
    fileType: 'slides',
  })
}

// ── Single chip component ────────────────────────────────────────────────────

function Chip({ label, description, onRun, children, state, error }: {
  label: string
  description: string
  onRun(): void
  children?: React.ReactNode
  state: ChipState
  error?: string | null
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground">{label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
        </div>
        <button
          className={cn(
            'flex h-6 shrink-0 items-center gap-1 rounded px-2 text-[11px] font-medium transition-colors',
            state === 'loading' ? 'cursor-not-allowed opacity-60' : 'bg-primary text-primary-foreground hover:opacity-90',
          )}
          onClick={onRun}
          disabled={state === 'loading'}
        >
          {state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Run'}
        </button>
      </div>
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}
      {state === 'done' && children}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function SlideAssistantTab({
  slide, slides, activeSlideIndex, theme,
  onUpdateNotes, onUpdateElement, onInsertElement,
}: Props): JSX.Element {
  const [states, setStates] = useState<Record<string, ChipState>>({})
  const [results, setResults] = useState<Record<string, ChipResult>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setChip = useCallback((id: string, state: ChipState, result?: ChipResult, error?: string) => {
    setStates(s => ({ ...s, [id]: state }))
    if (result) setResults(r => ({ ...r, [id]: result }))
    if (error) setErrors(e => ({ ...e, [id]: error }))
    else setErrors(e => { const n = { ...e }; delete n[id]; return n })
  }, [])

  const ctx = slideToText(slide, activeSlideIndex)
  const allCtx = presentationToText(slides)

  // 1. Write talking points
  async function runTalkingPoints() {
    setChip('tp', 'loading')
    try {
      const resp = await promptAi(
        'Write 4–6 concise bullet-point talking points for this slide that a presenter can use as speaker notes. Return only the bullet points, one per line, starting with •.',
        ctx,
      )
      setChip('tp', 'done', { type: 'talking-points', data: resp.trim() })
    } catch (e) {
      setChip('tp', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 2. Suggest title
  async function runSuggestTitle() {
    setChip('title', 'loading')
    try {
      const resp = await promptAi(
        'Suggest 3 concise, engaging slide titles for this slide based on its content. Return ONLY a JSON array of 3 strings, nothing else.',
        ctx,
      )
      const options = parseAiJson<string[]>(resp)
      setChip('title', 'done', { type: 'titles', data: options.slice(0, 3) })
    } catch (e) {
      setChip('title', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 3. Improve text
  async function runImproveText() {
    setChip('improve', 'loading')
    try {
      const resp = await promptAi(
        'Identify 2–4 weak phrases in this slide and suggest improvements. Return ONLY a JSON array of objects with shape {"original": string, "improved": string}.',
        ctx,
      )
      const suggestions = parseAiJson<Array<{ original: string; improved: string }>>(resp)
      setChip('improve', 'done', { type: 'improvements', data: suggestions })
    } catch (e) {
      setChip('improve', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 4. Simplify slide
  async function runSimplify() {
    setChip('simplify', 'loading')
    try {
      const resp = await promptAi(
        'This slide may have too much text. Suggest a condensed version — keep only the essential points. Return ONLY the revised text content, ready to place on the slide.',
        ctx,
      )
      setChip('simplify', 'done', { type: 'simplified', data: resp.trim() })
    } catch (e) {
      setChip('simplify', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 5. Suggest layout
  async function runSuggestLayout() {
    setChip('layout', 'loading')
    try {
      const resp = await promptAi(
        'Based on this slide\'s content type, suggest the most appropriate layout. Return ONLY a JSON object: {"layout": "title" | "title-content" | "two-column" | "section-header" | "image-caption", "reason": string}.',
        ctx,
      )
      const suggestion = parseAiJson<{ layout: string; reason: string }>(resp)
      setChip('layout', 'done', { type: 'layout', data: suggestion })
    } catch (e) {
      setChip('layout', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 6. Generate image description
  async function runImageDesc() {
    setChip('imgdesc', 'loading')
    try {
      const resp = await promptAi(
        'Describe a specific, concrete image that would enhance this slide visually. Write 1–2 sentences describing what the ideal image should show.',
        ctx,
      )
      setChip('imgdesc', 'done', { type: 'image-desc', data: resp.trim() })
    } catch (e) {
      setChip('imgdesc', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // 7. Check consistency
  async function runConsistency() {
    setChip('consist', 'loading')
    try {
      const resp = await promptAi(
        'Review all slides for: inconsistent font sizes, slides that break the visual theme, text that contradicts earlier slides. Return ONLY a JSON array of issues: [{"slide": number, "issue": string}]. Return an empty array if no issues.',
        allCtx,
      )
      const issues = parseAiJson<Array<{ slide: number; issue: string }>>(resp)
      setChip('consist', 'done', { type: 'issues', data: issues })
    } catch (e) {
      setChip('consist', 'error', undefined, e instanceof Error ? e.message : 'Failed')
    }
  }

  // Insert talking points into notes
  function applyTalkingPoints() {
    const text = results['tp']?.data as string
    if (text) onUpdateNotes(text)
  }

  // Apply title: insert as text element
  function applyTitle(title: string) {
    const el: SlideElement = {
      id: crypto.randomUUID(), type: 'text',
      x: 5, y: 4, width: 90, height: 14,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      content: title, fontFamily: theme.headingFontFamily, fontSize: 40,
      color: theme.textColor, align: 'left', verticalAlign: 'top',
      lineHeight: 1.3, letterSpacing: 0, overflow: 'clip',
    }
    onInsertElement(el)
  }

  // Apply simplified text: update first text element
  function applySimplified() {
    const text = results['simplify']?.data as string
    const firstText = slide.elements.find(e => e.type === 'text')
    if (firstText && text) onUpdateElement(firstText.id, { content: text })
  }

  // Apply improvement
  function applyImprovement(original: string, improved: string) {
    for (const el of slide.elements) {
      if (el.type === 'text' && el.content?.includes(original)) {
        onUpdateElement(el.id, { content: el.content.replace(original, improved) })
        break
      }
    }
  }

  return (
    <div className="flex flex-col gap-2 p-3">

      {/* 1 — Talking points */}
      <Chip
        label="Write talking points"
        description="Generate speaker notes from this slide's content"
        onRun={() => void runTalkingPoints()}
        state={states['tp'] ?? 'idle'}
        error={errors['tp']}
      >
        <div className="mt-2 space-y-1.5">
          <p className="whitespace-pre-wrap text-[11px] text-foreground">{results['tp']?.data as string}</p>
          <button className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20" onClick={applyTalkingPoints}>
            <Check className="h-3 w-3" /> Insert as speaker notes
          </button>
        </div>
      </Chip>

      {/* 2 — Suggest title */}
      <Chip
        label="Suggest title"
        description="Get 3 title options based on slide content"
        onRun={() => void runSuggestTitle()}
        state={states['title'] ?? 'idle'}
        error={errors['title']}
      >
        <div className="mt-2 flex flex-col gap-1">
          {(results['title']?.data as string[] ?? []).map((t, i) => (
            <button
              key={i}
              className="rounded border border-border px-2 py-1.5 text-left text-[11px] text-foreground hover:bg-accent"
              onClick={() => applyTitle(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </Chip>

      {/* 3 — Improve text */}
      <Chip
        label="Improve text"
        description="Identify weak phrases and suggest improvements"
        onRun={() => void runImproveText()}
        state={states['improve'] ?? 'idle'}
        error={errors['improve']}
      >
        <div className="mt-2 flex flex-col gap-2">
          {(results['improve']?.data as Array<{ original: string; improved: string }> ?? []).map((s, i) => (
            <div key={i} className="rounded border border-border p-2 text-[11px]">
              <p className="text-muted-foreground line-through">{s.original}</p>
              <p className="mt-0.5 text-foreground">{s.improved}</p>
              <div className="mt-1.5 flex gap-1">
                <button className="flex items-center gap-0.5 rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20" onClick={() => applyImprovement(s.original, s.improved)}>
                  <Check className="h-2.5 w-2.5" /> Apply
                </button>
              </div>
            </div>
          ))}
        </div>
      </Chip>

      {/* 4 — Simplify slide */}
      <Chip
        label="Simplify slide"
        description="Condense text to the essential points"
        onRun={() => void runSimplify()}
        state={states['simplify'] ?? 'idle'}
        error={errors['simplify']}
      >
        <div className="mt-2 space-y-1.5">
          <p className="whitespace-pre-wrap rounded border border-border p-2 text-[11px] text-foreground">
            {results['simplify']?.data as string}
          </p>
          <button className="flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] text-primary hover:bg-primary/20" onClick={applySimplified}>
            <Check className="h-3 w-3" /> Apply to first text element
          </button>
        </div>
      </Chip>

      {/* 5 — Suggest layout */}
      <Chip
        label="Suggest layout"
        description="Recommend a layout based on content type"
        onRun={() => void runSuggestLayout()}
        state={states['layout'] ?? 'idle'}
        error={errors['layout']}
      >
        {results['layout'] && (() => {
          const s = results['layout']?.data as { layout: string; reason: string }
          return (
            <div className="mt-2 rounded border border-border p-2 text-[11px]">
              <p className="font-medium text-foreground">{s.layout}</p>
              <p className="mt-0.5 text-muted-foreground">{s.reason}</p>
            </div>
          )
        })()}
      </Chip>

      {/* 6 — Generate image description */}
      <Chip
        label="Generate image description"
        description="Describe an image that would enhance this slide"
        onRun={() => void runImageDesc()}
        state={states['imgdesc'] ?? 'idle'}
        error={errors['imgdesc']}
      >
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-foreground">{results['imgdesc']?.data as string}</p>
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => navigator.clipboard.writeText(results['imgdesc']?.data as string ?? '')}
          >
            Copy to clipboard
          </button>
        </div>
      </Chip>

      {/* 7 — Check consistency */}
      <Chip
        label="Check consistency"
        description="Review all slides for conflicts and inconsistencies"
        onRun={() => void runConsistency()}
        state={states['consist'] ?? 'idle'}
        error={errors['consist']}
      >
        <div className="mt-2 flex flex-col gap-1">
          {(results['consist']?.data as Array<{ slide: number; issue: string }> ?? []).length === 0 ? (
            <p className="flex items-center gap-1 text-[11px] text-green-600"><Check className="h-3 w-3" /> No issues found</p>
          ) : (
            (results['consist']?.data as Array<{ slide: number; issue: string }>).map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5 rounded border border-border p-1.5 text-[11px]">
                <X className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                <div>
                  <span className="font-medium">Slide {issue.slide}: </span>
                  <span className="text-muted-foreground">{issue.issue}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Chip>
    </div>
  )
}
