import { useState, useRef, useMemo } from 'react'
import { Sparkles, MessageSquare, WandSparkles, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Separator } from '@/components/ui/separator'
import type { Slide, SlideElement, PresentationTheme, PresentationSettings } from '@/types/slides'
import { ChatTab } from '@/components/editor/AiPanel'
import type { AiActionHandler } from '@/components/editor/AiPanel'
import type { SlidesAction } from '@/lib/ai/proseActions'
import { applySlideActions, buildSlidesChatContext } from './slideActionExecutor'
import { SlideGenerateTab } from './SlideGenerateTab'
import { useAppStore } from '@/store/appStore'
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
  onUpdateCurrentSlide(updater: (s: Slide) => Slide): void
}

type Tab = 'chat' | 'generate'

export function SlidesAIPanel({
  slide, slides, activeSlideIndex, theme, settings,
  onClose, onInsertSlides, onReplaceCurrentSlide, onUpdateCurrentSlide,
}: Props): JSX.Element {
  const [tab, setTab] = useState<Tab>('chat')
  const [contextOpen, setContextOpen] = useState(false)
  const assignmentContext = useAppStore((s) => s.assignmentContext)
  const setAssignmentContext = useAppStore((s) => s.setAssignmentContext)

  // Refs keep the action handler and context getter fresh without recreating
  // them (ChatTab holds them across renders while a reply streams in).
  const slideRef = useRef(slide); slideRef.current = slide
  const slidesRef = useRef(slides); slidesRef.current = slides
  const indexRef = useRef(activeSlideIndex); indexRef.current = activeSlideIndex
  const themeRef = useRef(theme); themeRef.current = theme
  const insertSlidesRef = useRef(onInsertSlides); insertSlidesRef.current = onInsertSlides
  const updateCurrentSlideRef = useRef(onUpdateCurrentSlide); updateCurrentSlideRef.current = onUpdateCurrentSlide

  const actionHandler = useMemo<AiActionHandler>(() => ({
    surface: 'slides',
    apply: (actions) => applySlideActions(actions as SlidesAction[], {
      theme: themeRef.current,
      getCurrentSlide: () => slideRef.current,
      activeSlideIndex: indexRef.current,
      insertSlides: (newSlides, afterIndex) => insertSlidesRef.current(newSlides, afterIndex),
      updateCurrentSlide: (updater) => updateCurrentSlideRef.current(updater),
    }),
  }), [])

  const getSlidesContext = useMemo(() => (): string =>
    buildSlidesChatContext(slidesRef.current, indexRef.current, themeRef.current), [])

  return (
    <div className="flex h-full w-full shrink-0 flex-col border-l border-border bg-background">
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

      {/* Slides context — lives in the shared header so it stays in place and
          keeps its value regardless of which tab (Chat / Generate) is active. */}
      <div className="shrink-0 px-3 pt-2 pb-1">
        <button
          className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setContextOpen((o) => !o)}
        >
          <span className={cn('transition-transform', contextOpen && 'rotate-90')}>›</span>
          Slides context
        </button>
        <AnimatePresence>
          {contextOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <textarea
                className={cn(
                  'mt-1.5 w-full resize-none rounded-md border border-input bg-transparent px-2 py-1.5',
                  'text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring',
                  'min-h-[60px]',
                )}
                placeholder="What's this presentation about? Topic, audience, goals…"
                value={assignmentContext}
                onChange={(e) => setAssignmentContext(e.target.value)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Separator />

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === 'chat' ? (
          <ChatTab
            editor={null}
            fileType="slides"
            assignmentContext={assignmentContext}
            setAssignmentContext={setAssignmentContext}
            getDocumentContent={getSlidesContext}
            actionHandler={actionHandler}
            hideContext
          />
        ) : (
          <div className="h-full overflow-y-auto">
            <SlideGenerateTab
              slides={slides}
              activeSlideIndex={activeSlideIndex}
              theme={theme}
              settings={settings}
              assignmentContext={assignmentContext}
              onInsertSlides={onInsertSlides}
              onReplaceCurrentSlide={onReplaceCurrentSlide}
            />
          </div>
        )}
      </div>
    </div>
  )
}
