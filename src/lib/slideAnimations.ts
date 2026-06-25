import type {
  AnimationCategory,
  AnimationEffect,
  AnimationTriggerMode,
  ElementAnimation,
  SlideElement,
  TransitionDirection,
  TransitionType,
} from '@/types/slides'
import { clampAnimationDelay, clampAnimationDuration, normalizeAnimation } from '@/types/slides'

export const ANIMATION_EFFECT_LABELS: Record<AnimationEffect, string> = {
  appear: 'Appear',
  'fade-in': 'Fade in',
  'fade-out': 'Fade out',
  'fly-in': 'Fly in',
  'fly-out': 'Fly out',
  'zoom-in': 'Zoom in',
  'zoom-out': 'Zoom out',
  'bounce-in': 'Bounce in',
  'bounce-out': 'Bounce out',
  wipe: 'Wipe',
}

// Lowercase, mid-sentence fragment — only for "<effect> from <here>" phrasing
// inside getAnimationEffectLabel below. Standalone UI (dropdown options, etc.)
// should use TRANSITION_DIRECTION_LABELS instead.
const DIRECTION_LABEL_FRAGMENTS: Record<TransitionDirection, string> = {
  left: 'left',
  right: 'right',
  up: 'top',
  down: 'bottom',
}

export function getAnimationEffectLabel(effect: AnimationEffect, direction?: TransitionDirection): string {
  const base = ANIMATION_EFFECT_LABELS[effect]
  if (!direction || (effect !== 'fly-in' && effect !== 'fly-out' && effect !== 'wipe')) return base
  return `${base} from ${DIRECTION_LABEL_FRAGMENTS[direction]}`
}

export const TRANSITION_TYPE_LABELS: Record<TransitionType, string> = {
  none: 'None',
  fade: 'Fade',
  slide: 'Slide',
  push: 'Push',
  zoom: 'Zoom',
  flip: 'Flip',
  dissolve: 'Dissolve',
}

export const TRANSITION_DIRECTION_LABELS: Record<TransitionDirection, string> = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
}

export const ANIMATION_CATEGORY_LABELS: Record<AnimationCategory, string> = {
  entrance: 'Entrance',
  emphasis: 'Emphasis',
  exit: 'Exit',
}

export const ANIMATION_TRIGGER_LABELS: Record<AnimationTriggerMode, string> = {
  click: 'On click',
  'with-previous': 'With previous',
  'after-previous': 'After previous',
}

export function sanitizeAnimation(animation: unknown): ElementAnimation {
  const normalized = normalizeAnimation(animation)
  return {
    ...normalized,
    duration: clampAnimationDuration(normalized.duration),
    delay: clampAnimationDelay(normalized.delay),
  }
}

export function getAnimationClassName(animation: Pick<ElementAnimation, 'effect' | 'direction'>): string {
  const direction = animation.direction ? `-${animation.direction}` : ''
  return `slide-anim-${animation.effect}${direction}`
}

export function getSlideElementLabel(element: SlideElement): string {
  switch (element.type) {
    case 'text': {
      const plain = element.content.replace(/<[^>]+>/g, '').trim()
      return plain ? `Text: ${plain.slice(0, 28)}` : 'Text box'
    }
    case 'shape':
      return 'Shape'
    case 'image':
      return 'Image'
    case 'table':
      return 'Table'
    case 'equation':
      return 'Equation'
    case 'code':
      return 'Code block'
    case 'video':
      return 'Video'
    case 'ai-graphic':
      return 'AI graphic'
    default:
      return 'Element'
  }
}
