import { useState } from 'react'
import { Sparkles, MessageSquare, WandSparkles, X } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
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

type Tab = 'chat' | 'generate'

export function SlidesAIPanel({
  slide, slides, activeSlideIndex, theme, settings,
  onClose, onUpdateNotes, onUpdateElement, onInsertElement,
  onInsertSlides, onReplaceCurrentSlide,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-background">
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
            onClick={() => setTab('generate')}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium transition-colors',
              tab === 'generate'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <WandSparkles className="h-2.5 w-2.5" />
            Generate
          </button>
        </div>

        <button
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Separator />

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'chat' ? (
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
