import { useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2, Play, LogIn, Activity, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  ElementAnimation,
  Slide,
  SlideElement,
  TransitionDirection,
  TransitionType,
  AnimationCategory,
  AnimationEffect,
  AnimationTriggerMode,
} from '@/types/slides'
import { getAnimationEffectLabel, getSlideElementLabel } from '@/lib/slideAnimations'

interface Props {
  slide: Slide
  selectedElementId: string | null
  selectedAnimationId: string | null
  onSelectAnimation: (id: string | null) => void
  onAddAnimation: (elementId: string) => void
  onRemoveAnimation: (id: string) => void
  onUpdateAnimation: (id: string, patch: Partial<ElementAnimation>) => void
  onReorderAnimations: (fromIdx: number, toIdx: number) => void
  onUpdateTransition: (patch: { type?: TransitionType; direction?: TransitionDirection; duration?: number }) => void
  onPreview: () => void
}

const EFFECTS: AnimationEffect[] = [
  'appear',
  'fade-in',
  'fade-out',
  'fly-in',
  'fly-out',
  'zoom-in',
  'zoom-out',
  'bounce-in',
  'bounce-out',
  'wipe',
]
const TRIGGERS: AnimationTriggerMode[] = ['click', 'with-previous', 'after-previous']
const CATEGORIES: AnimationCategory[] = ['entrance', 'emphasis', 'exit']
const TRANSITIONS: TransitionType[] = ['none', 'fade', 'slide', 'push', 'zoom', 'flip', 'dissolve']
const DIRECTIONS: TransitionDirection[] = ['left', 'right', 'up', 'down']

function categoryIcon(category: AnimationCategory): JSX.Element {
  if (category === 'entrance') return <LogIn className="h-3.5 w-3.5" />
  if (category === 'exit') return <LogOut className="h-3.5 w-3.5" />
  return <Activity className="h-3.5 w-3.5" />
}

function triggerLabel(trigger: AnimationTriggerMode): string {
  if (trigger === 'with-previous') return 'With previous'
  if (trigger === 'after-previous') return 'After previous'
  return 'On click'
}

function supportsDirection(effect: AnimationEffect): boolean {
  return effect === 'fly-in' || effect === 'fly-out' || effect === 'wipe'
}

export function AnimationsPanel({
  slide,
  selectedElementId,
  selectedAnimationId,
  onSelectAnimation,
  onAddAnimation,
  onRemoveAnimation,
  onUpdateAnimation,
  onReorderAnimations,
  onUpdateTransition,
  onPreview,
}: Props): JSX.Element {
  const elementsById = useMemo(
    () => new Map<string, SlideElement>(slide.elements.map((element) => [element.id, element])),
    [slide.elements],
  )
  const [drag, setDrag] = useState<{
    fromIndex: number
    toIndex: number
    pointerId: number
    startY: number
    currentY: number
    height: number
  } | null>(null)

  const selectedAnimation = slide.animations.find((item) => item.id === selectedAnimationId) ?? null

  const transition = slide.transition ?? { type: 'none' as const, duration: 500 }
  const canAdd = Boolean(selectedElementId)

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-background">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">Slide transition</h3>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onPreview}>
            <Play className="mr-1 h-3.5 w-3.5" />
            Preview
          </Button>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 text-muted-foreground">Type</span>
            <select
              className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
              value={transition.type}
              onChange={(e) => onUpdateTransition({ type: e.target.value as TransitionType })}
            >
              {TRANSITIONS.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          {(transition.type === 'slide' || transition.type === 'push') && (
            <label className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">Direction</span>
              <select
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                value={transition.direction ?? 'left'}
                onChange={(e) => onUpdateTransition({ direction: e.target.value as TransitionDirection })}
              >
                {DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}
              </select>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs">
            <span className="w-16 text-muted-foreground">Duration</span>
            <input
              type="range"
              min={100}
              max={2000}
              value={transition.duration}
              className="flex-1"
              onChange={(e) => onUpdateTransition({ duration: Number(e.target.value) })}
            />
            <span className="w-12 tabular-nums text-right text-muted-foreground">{transition.duration}ms</span>
          </label>
        </div>
      </div>

      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-foreground">Element animations</h3>
          <Button size="sm" className="h-7 text-xs" disabled={!canAdd} onClick={() => selectedElementId && onAddAnimation(selectedElementId)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add animation
          </Button>
        </div>
        {!canAdd && (
          <p className="text-[11px] text-muted-foreground">Select an element on the canvas to add an animation.</p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {slide.animations.length === 0 && (
          <div className="rounded-md border border-dashed border-border p-3 text-[11px] text-muted-foreground">
            No animations yet.
          </div>
        )}

        <div className="space-y-1">
          {slide.animations.map((animation, index) => {
            const dragged = drag?.fromIndex === index
            const element = elementsById.get(animation.elementId)
            const label = element ? getSlideElementLabel(element) : 'Missing element'
            let transform = 'translateY(0px)'
            if (drag) {
              if (drag.fromIndex === index) {
                transform = `translateY(${drag.currentY - drag.startY}px)`
              } else if (drag.fromIndex < drag.toIndex && index > drag.fromIndex && index <= drag.toIndex) {
                transform = `translateY(${-drag.height}px)`
              } else if (drag.fromIndex > drag.toIndex && index >= drag.toIndex && index < drag.fromIndex) {
                transform = `translateY(${drag.height}px)`
              }
            }
            return (
              <button
                key={animation.id}
                type="button"
                className={cn(
                  'relative flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left transition-colors',
                  animation.trigger === 'with-previous' && 'ml-4 w-[calc(100%-1rem)]',
                  selectedAnimationId === animation.id ? 'border-primary/50 bg-accent/50' : 'hover:bg-accent/30',
                )}
                style={{
                  transform,
                  transition: dragged ? 'none' : 'transform 170ms ease-out',
                  zIndex: dragged ? 20 : 1,
                }}
                onClick={() => onSelectAnimation(animation.id)}
                onPointerDown={(event) => {
                  if (event.button !== 0) return
                  const target = event.currentTarget
                  const rect = target.getBoundingClientRect()
                  target.setPointerCapture(event.pointerId)
                  setDrag({
                    fromIndex: index,
                    toIndex: index,
                    pointerId: event.pointerId,
                    startY: event.clientY,
                    currentY: event.clientY,
                    height: rect.height + 4,
                  })
                  document.body.style.userSelect = 'none'
                }}
                onPointerMove={(event) => {
                  if (!drag || drag.pointerId !== event.pointerId) return
                  const delta = event.clientY - drag.startY
                  const offset = Math.round(delta / drag.height)
                  const toIndex = Math.max(0, Math.min(slide.animations.length - 1, drag.fromIndex + offset))
                  setDrag({ ...drag, currentY: event.clientY, toIndex })
                }}
                onPointerUp={(event) => {
                  if (!drag || drag.pointerId !== event.pointerId) return
                  if (drag.toIndex !== drag.fromIndex) onReorderAnimations(drag.fromIndex, drag.toIndex)
                  setDrag(null)
                  document.body.style.userSelect = ''
                }}
              >
                <span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                <GripVertical className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                <span className="mt-0.5 text-muted-foreground">{categoryIcon(animation.category)}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{label}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {getAnimationEffectLabel(animation.effect, animation.direction)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {triggerLabel(animation.trigger)} · {animation.duration}ms + {animation.delay}ms
                  </div>
                </div>
                <Trash2
                  className="mt-0.5 h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveAnimation(animation.id)
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-border p-3">
        {selectedAnimation ? (
          <div className="space-y-2 text-xs">
            <h4 className="text-xs font-semibold text-foreground">Animation details</h4>
            <label className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">Category</span>
              <select
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                value={selectedAnimation.category}
                onChange={(e) => onUpdateAnimation(selectedAnimation.id, { category: e.target.value as AnimationCategory })}
              >
                {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">Effect</span>
              <select
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                value={selectedAnimation.effect}
                onChange={(e) => onUpdateAnimation(selectedAnimation.id, { effect: e.target.value as AnimationEffect })}
              >
                {EFFECTS.map((effect) => <option key={effect} value={effect}>{getAnimationEffectLabel(effect)}</option>)}
              </select>
            </label>
            {supportsDirection(selectedAnimation.effect) && (
              <label className="flex items-center gap-2">
                <span className="w-16 text-muted-foreground">Direction</span>
                <select
                  className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                  value={selectedAnimation.direction ?? 'left'}
                  onChange={(e) => onUpdateAnimation(selectedAnimation.id, { direction: e.target.value as TransitionDirection })}
                >
                  {DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">Trigger</span>
              <select
                className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs"
                value={selectedAnimation.trigger}
                onChange={(e) => onUpdateAnimation(selectedAnimation.id, { trigger: e.target.value as AnimationTriggerMode })}
              >
                {TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{triggerLabel(trigger)}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">Duration</span>
              <input
                type="range"
                min={0}
                max={10000}
                value={selectedAnimation.duration}
                className="flex-1"
                onChange={(e) => onUpdateAnimation(selectedAnimation.id, { duration: Number(e.target.value) })}
              />
              <span className="w-14 tabular-nums text-right text-muted-foreground">{selectedAnimation.duration}ms</span>
            </label>
            <label className="flex items-center gap-2">
              <span className="w-16 text-muted-foreground">Delay</span>
              <input
                type="range"
                min={0}
                max={10000}
                value={selectedAnimation.delay}
                className="flex-1"
                onChange={(e) => onUpdateAnimation(selectedAnimation.id, { delay: Number(e.target.value) })}
              />
              <span className="w-14 tabular-nums text-right text-muted-foreground">{selectedAnimation.delay}ms</span>
            </label>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">Select an animation to edit details.</p>
        )}
      </div>
    </aside>
  )
}
