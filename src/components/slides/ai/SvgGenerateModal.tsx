// Phase 31 — AI SVG graphic generation modal. Sanitizes output with DOMPurify.
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, Wand2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import type { SlideElement, PresentationTheme } from '@/types/slides'
import { SVG_SYSTEM_PROMPT } from './aiSlideUtils'

interface Props {
  initialDescription?: string
  theme: PresentationTheme
  onInsert(el: SlideElement): void
  onClose(): void
}

export function SvgGenerateModal({ initialDescription = '', theme, onInsert, onClose }: Props): JSX.Element {
  const [description, setDescription] = useState(initialDescription)
  const [loading, setLoading] = useState(false)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleGenerate(): Promise<void> {
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setSvg(null)
    try {
      const themeColors = [theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.backgroundColor, theme.textColor].join(', ')
      const resp = await window.prose.ai.prompt({
        documentContent: description,
        request: `${SVG_SYSTEM_PROMPT.replace('{themeColors}', themeColors).replace('{description}', description)}\nSubject: ${description}`,
        fileType: 'slides',
      })
      // Extract SVG from response (Ollama may add explanation text)
      const svgMatch = /<svg[\s\S]*<\/svg>/i.exec(resp)
      const rawSvg = svgMatch ? svgMatch[0] : resp.trim()
      // Sanitize with DOMPurify per spec
      const safe = DOMPurify.sanitize(rawSvg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'object', 'embed', 'link'],
      })
      setSvg(safe)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setLoading(false)
    }
  }

  function handleInsert(): void {
    if (!svg) return
    const el: SlideElement = {
      id: crypto.randomUUID(), type: 'ai-graphic',
      x: 25, y: 20, width: 50, height: 60,
      rotate: 0, opacity: 1, zIndex: Date.now(), flipH: false, flipV: false, locked: false, hidden: false,
      svgContent: svg,
    } as SlideElement
    onInsert(el)
    onClose()
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[99991] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold">AI illustration (experimental)</h2>
          <button className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-5">
          <p className="mb-3 text-xs text-muted-foreground">
            Quality depends on the local model. Generates flat-design SVG vector illustrations.
          </p>

          <textarea
            className="mb-3 h-20 w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="A bar chart showing revenue growth over 4 quarters"
            value={description}
            onChange={e => setDescription(e.target.value)}
          />

          {svg && (
            <div
              className="mb-3 flex h-48 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          )}

          {error && <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <button className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent" onClick={onClose}>
              Cancel
            </button>
            <button
              className="flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent disabled:opacity-60"
              onClick={() => void handleGenerate()}
              disabled={!description.trim() || loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {loading ? 'Generating…' : svg ? 'Regenerate' : 'Generate'}
            </button>
            {svg && (
              <button
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground"
                onClick={handleInsert}
              >
                Insert graphic
              </button>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}
