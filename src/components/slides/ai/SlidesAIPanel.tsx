// Phase 31 — Slides AI panel. Shown in the right sidebar when ✦ is toggled.
import { useState } from 'react'
import { X } from 'lucide-react'
import type { Slide, SlideElement, PresentationTheme, PresentationSettings } from '@/types/slides'
import { SlideAssistantTab } from './SlideAssistantTab'
import { SlideGenerateTab } from './SlideGenerateTab'
import { cn } from '@/lib/utils'

interface Props {
  slide: Slide
  slides: Slide[]
  activeSlideIndex: number
  theme: PresentationTheme
  settings: PresentationSettings
  onClose(): void
  onUpdateNotes(notes: string): void
  onUpdateElement(id: string, partial: Partial<SlideElement>): void
  onInsertElement(el: SlideElement): void
  onInsertSlides(newSlides: Slide[], afterIndex: number): void
  onReplaceCurrentSlide(slide: Slide): void
}

type Tab = 'assistant' | 'generate'

export function SlidesAIPanel({
  slide, slides, activeSlideIndex, theme, settings,
  onClose, onUpdateNotes, onUpdateElement, onInsertElement,
  onInsertSlides, onReplaceCurrentSlide,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('assistant')

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex gap-0.5 rounded-lg border border-border bg-muted p-0.5">
          {(['assistant', 'generate'] as Tab[]).map(t => (
            <button
              key={t}
              className={cn(
                'rounded px-2.5 py-1 text-[11px] font-medium transition-all',
                tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setTab(t)}
            >
              {t === 'assistant' ? 'Assistant' : 'Generate'}
            </button>
          ))}
        </div>
        <button
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'assistant' ? (
          <SlideAssistantTab
            slide={slide}
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            theme={theme}
            onUpdateNotes={onUpdateNotes}
            onUpdateElement={onUpdateElement}
            onInsertElement={onInsertElement}
          />
        ) : (
          <SlideGenerateTab
            slides={slides}
            activeSlideIndex={activeSlideIndex}
            theme={theme}
            settings={settings}
            onInsertSlides={onInsertSlides}
            onReplaceCurrentSlide={onReplaceCurrentSlide}
          />
        )}
      </div>
    </div>
  )
}
