import { useEffect, useState, useCallback, useRef } from 'react'
import { GalleryHorizontal } from 'lucide-react'
import { DashboardTabBar } from '@/components/editor/DashboardTabBar'
import { useDocument } from '@/hooks/useDocument'
import { useAppStore } from '@/store/appStore'
import type { Slide, SlidesContent, PresentationTheme, PresentationSettings } from '@/types/slides'
import { deserializeSlides, createInitialSlidesContent } from '@/types/slides'

interface SlidesEditorProps {
  documentId: string
}

// ── Placeholder shell — to be built out in Phases 24–32 ──────────────────────

export function SlidesEditor({ documentId }: SlidesEditorProps): JSX.Element {
  const [slides, setSlides] = useState<Slide[]>([])
  const [theme, setTheme] = useState<PresentationTheme>(createInitialSlidesContent().theme)
  const [settings, setSettings] = useState<PresentationSettings>(createInitialSlidesContent().settings)
  const [activeSlideIndex, setActiveSlideIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { document: doc, notifySaveStatus } = useDocument(documentId)

  // ── Load slides from document content ──────────────────────────────────────

  useEffect(() => {
    if (!doc) return
    try {
      const parsed = JSON.parse(doc.content || '{}') as unknown
      const content = deserializeSlides(parsed)
      setSlides(content.slides)
      setTheme(content.theme)
      setSettings(content.settings)
    } catch {
      const initial = createInitialSlidesContent()
      setSlides(initial.slides)
      setTheme(initial.theme)
      setSettings(initial.settings)
    }
    setLoaded(true)
  }, [doc?.id, doc?.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-save ─────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void flushAndSave()
    }, 1000)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const flushAndSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    notifySaveStatus('saving')
    try {
      const content: SlidesContent = { version: 1, slides, theme, settings }
      await window.prose.documents.update(documentId, {
        content: JSON.stringify(content),
      })
      notifySaveStatus('saved')
    } catch {
      notifySaveStatus('error')
    }
  }, [documentId, slides, theme, settings, notifySaveStatus])

  useEffect(() => {
    const setSave = useAppStore.getState().setSaveActiveDocument
    setSave(() => flushAndSave())
    return () => setSave(null)
  }, [flushAndSave])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        void flushAndSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flushAndSave])

  if (!loaded) {
    return (
      <div className="flex h-screen flex-col bg-background">
        <DashboardTabBar />
        <div className="flex flex-1 items-center justify-center">
          <span className="text-xs text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  // ── Temporary placeholder UI ──────────────────────────────────────────────

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <DashboardTabBar />

      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-border/60">
          <GalleryHorizontal className="h-7 w-7 text-muted-foreground/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{doc?.title ?? 'Presentation'}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {slides.length} {slides.length === 1 ? 'slide' : 'slides'} · Slides editor coming in Phase 24
          </p>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => {
              const newSlide: Slide = {
                id: crypto.randomUUID(),
                elements: [],
                notes: '',
                animations: [],
              }
              setSlides((prev) => {
                const next = [...prev, newSlide]
                scheduleSave()
                return next
              })
              setActiveSlideIndex(slides.length)
            }}
          >
            Add slide
          </button>
          {slides.length > 1 && (
            <button
              className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                setSlides((prev) => {
                  const next = prev.filter((_, i) => i !== activeSlideIndex)
                  scheduleSave()
                  return next
                })
                setActiveSlideIndex((i) => Math.max(0, i - 1))
              }}
            >
              Delete slide {activeSlideIndex + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
