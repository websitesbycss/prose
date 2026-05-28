import { useState, useRef, useMemo, useCallback } from 'react'
import katex from 'katex'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

interface MathModalProps {
  open: boolean
  onClose(): void
  onInsert(latex: string, displayMode: boolean): void
}

const TEMPLATES: { label: string; latex: string; title: string }[] = [
  { label: 'x=…',        latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',   title: 'Quadratic formula' },
  { label: 'a²+b²',      latex: 'a^2 + b^2 = c^2',                              title: 'Pythagorean theorem' },
  { label: 'a/b',        latex: '\\frac{a}{b}',                                  title: 'Fraction' },
  { label: '√x',         latex: '\\sqrt{x}',                                     title: 'Square root' },
  { label: 'dy/dx',      latex: '\\frac{d}{dx}f(x)',                             title: 'Derivative' },
  { label: '∫',          latex: '\\int_a^b f(x)\\,dx',                          title: 'Definite integral' },
  { label: 'Σ',          latex: '\\sum_{i=1}^{n} x_i',                          title: 'Sum notation' },
  { label: 'lim',        latex: '\\lim_{x \\to \\infty} f(x)',                  title: 'Limit' },
  { label: 'α',          latex: '\\alpha',   title: 'Alpha' },
  { label: 'β',          latex: '\\beta',    title: 'Beta' },
  { label: 'γ',          latex: '\\gamma',   title: 'Gamma' },
  { label: 'Δ',          latex: '\\Delta',   title: 'Delta' },
  { label: 'π',          latex: '\\pi',      title: 'Pi' },
  { label: 'θ',          latex: '\\theta',   title: 'Theta' },
  { label: 'σ',          latex: '\\sigma',   title: 'Sigma' },
  { label: '∞',          latex: '\\infty',   title: 'Infinity' },
]

export default function MathModal({ open, onClose, onInsert }: MathModalProps): JSX.Element {
  const [latex, setLatex] = useState('')
  const [displayMode, setDisplayMode] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [previewHtml, previewError] = useMemo<[string, string | null]>(() => {
    const src = latex.trim()
    if (!src) return ['', null]
    try {
      return [katex.renderToString(src, { throwOnError: true, displayMode, output: 'html' }), null]
    } catch (e) {
      return ['', (e as Error).message.replace(/^KaTeX parse error: /, '')]
    }
  }, [latex, displayMode])

  const insertAtCursor = useCallback((template: string) => {
    const el = inputRef.current
    if (!el) {
      setLatex((v) => v + template)
      return
    }
    const start = el.selectionStart ?? latex.length
    const end = el.selectionEnd ?? latex.length
    const next = latex.slice(0, start) + template + latex.slice(end)
    setLatex(next)
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + template.length, start + template.length)
    }, 0)
  }, [latex])

  function handleClose() {
    setLatex('')
    setDisplayMode(false)
    onClose()
  }

  function handleInsert() {
    if (!latex.trim() || previewError) return
    onInsert(latex.trim(), displayMode)
    setLatex('')
    setDisplayMode(false)
  }

  const canInsert = latex.trim().length > 0 && !previewError

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="flex w-[540px] max-w-[95vw] flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4">
          <DialogTitle className="text-sm font-semibold">Insert equation</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Mode toggle */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Inline</span>
            <Switch
              checked={displayMode}
              onCheckedChange={setDisplayMode}
              className="scale-90"
            />
            <span className="text-xs text-muted-foreground">Display block</span>
          </div>

          {/* LaTeX input */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">LaTeX</span>
            <textarea
              ref={inputRef}
              className="h-20 w-full resize-none rounded-md border border-input bg-background px-3 py-2 font-mono text-xs outline-none placeholder:text-muted-foreground/50 focus:ring-1 focus:ring-ring"
              placeholder="e.g. x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}"
              value={latex}
              onChange={(e) => setLatex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleInsert()
                }
              }}
              spellCheck={false}
              autoFocus
            />
          </div>

          {/* Template chips */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Templates</span>
            <div className="flex flex-wrap gap-1">
              {TEMPLATES.map((t) => (
                <button
                  key={t.title}
                  type="button"
                  title={t.title}
                  onClick={() => insertAtCursor(t.latex)}
                  className="rounded border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Preview</span>
            <div
              className={cn(
                'min-h-[48px] rounded-md border border-border bg-white px-4 py-3 dark:bg-zinc-900',
                displayMode ? 'text-center' : 'text-left',
              )}
            >
              {previewError ? (
                <span className="text-xs text-destructive">{previewError}</span>
              ) : previewHtml ? (
                <span dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <span className="text-xs text-muted-foreground/50">
                  Preview will appear here as you type
                </span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border px-5 py-3">
          <Button variant="outline" size="sm" className="text-xs" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            className="text-xs"
            disabled={!canInsert}
            onClick={handleInsert}
            title={canInsert ? 'Insert (Ctrl+Enter)' : undefined}
          >
            Insert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
