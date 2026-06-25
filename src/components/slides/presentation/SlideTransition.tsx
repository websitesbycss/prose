import { useEffect, useRef, useState } from 'react'
import type { TransitionType, TransitionDirection } from '@/types/slides'

interface Props {
  slideKey: string
  type: TransitionType
  transitionDirection?: TransitionDirection
  duration: number
  navDirection: 'forward' | 'backward'
  children: React.ReactNode
}

function getAnimationName(
  type: TransitionType,
  transitionDir: TransitionDirection | undefined,
  navDir: 'forward' | 'backward',
): string {
  switch (type) {
    case 'fade': return 'slide-transition-fade'
    case 'dissolve': return 'slide-transition-dissolve'
    case 'zoom': return 'slide-transition-zoom'
    case 'flip': return navDir === 'forward' ? 'slide-transition-flip-in' : 'slide-transition-flip-in-rev'
    case 'slide': {
      const dir = transitionDir ?? (navDir === 'forward' ? 'left' : 'right')
      switch (dir) {
        case 'left':  return 'slide-transition-from-right'
        case 'right': return 'slide-transition-from-left'
        case 'up':    return 'slide-transition-from-bottom'
        case 'down':  return 'slide-transition-from-top'
        default: return ''
      }
    }
    case 'push': {
      const dir = transitionDir ?? (navDir === 'forward' ? 'left' : 'right')
      switch (dir) {
        case 'left': return 'slide-transition-push-from-right'
        case 'right': return 'slide-transition-push-from-left'
        case 'up': return 'slide-transition-push-from-bottom'
        case 'down': return 'slide-transition-push-from-top'
        default: return ''
      }
    }
    // fall through to none
    default: return ''
  }
}

export function SlideTransition({ slideKey, type, transitionDirection, duration, navDirection, children }: Props): JSX.Element {
  const [animKey, setAnimKey] = useState(slideKey)
  const [isAnimating, setIsAnimating] = useState(false)
  const prevKeyRef = useRef(slideKey)

  useEffect(() => {
    if (slideKey === prevKeyRef.current) return
    prevKeyRef.current = slideKey
    if (type === 'none') { setAnimKey(slideKey); return }
    setIsAnimating(true)
    setAnimKey(slideKey)
    const t = setTimeout(() => setIsAnimating(false), duration)
    return () => clearTimeout(t)
  }, [slideKey, type, duration])

  const animName = isAnimating ? getAnimationName(type, transitionDirection, navDirection) : ''

  return (
    <div
      key={animKey}
      style={{
        position: 'absolute',
        inset: 0,
        animation: animName ? `${animName} ${duration}ms ease-out forwards` : undefined,
        ...(type === 'flip' && isAnimating ? { perspective: '1200px' } : {}),
      }}
    >
      {children}
    </div>
  )
}
