import { useEffect, useRef, useState, useCallback } from 'react'
import type { Slide, PresentationTheme, PresentationSettings, SlideMaster } from '@/types/slides'
import { getSlideBaseSize } from '@/types/slides'
import { SlideBackgroundLayer } from '../canvas/SlideBackground'
import { renderSlideElement } from '../elements/renderSlideElement'
import { SlideTransition } from './SlideTransition'
import { PresentationToolbar } from './PresentationToolbar'
import { SlideGridOverview } from './SlideGridOverview'
import { SpeakerNotesOverlay } from './SpeakerNotesOverlay'
import { AnimatedSlideElements } from '../animations/AnimatedSlideElements'
import { useSlideAnimationPlayback } from '@/lib/slideAnimationPlayback'

interface Props {
  slides: Slide[]
  theme: PresentationTheme
  settings: PresentationSettings
  master?: SlideMaster
  startIndex: number
  onExit(currentIndex: number): void
}

export function PresentationMode({ slides, theme, settings, master, startIndex, onExit }: Props): JSX.Element {
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [navDirection, setNavDirection] = useState<'forward' | 'backward'>('forward')
  const [showGrid, setShowGrid] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [laserPos, setLaserPos] = useState<{ x: number; y: number } | null>(null)
  const [laserMode, setLaserMode] = useState(false)

  // Number-key jump accumulator
  const numberBufRef = useRef<string>('')
  const numberTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)

  const { baseW, baseH } = getSlideBaseSize(settings)

  // Declared early (before the keydown effect below references it) — hooks
  // must run unconditionally on every render regardless of currentSlide.
  const currentSlide = slides[currentIndex] ?? null
  const playback = useSlideAnimationPlayback(currentSlide ?? { id: 'preview-empty', elements: [], notes: '', animations: [] }, { mode: 'presentation' })

  // Fullscreen via IPC on mount, restore on unmount
  useEffect(() => {
    void window.prose.win.setFullscreen(true)
    return () => { void window.prose.win.setFullscreen(false) }
  }, [])

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsedSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const goNext = useCallback((): void => {
    setCurrentIndex((i) => {
      if (i >= slides.length - 1) return i
      setNavDirection('forward')
      return i + 1
    })
  }, [slides.length])

  const goPrev = useCallback((): void => {
    setCurrentIndex((i) => {
      if (i <= 0) return i
      setNavDirection('backward')
      return i - 1
    })
  }, [])

  const goTo = useCallback((idx: number): void => {
    setCurrentIndex((i) => {
      const clamped = Math.max(0, Math.min(slides.length - 1, idx))
      setNavDirection(clamped > i ? 'forward' : 'backward')
      return clamped
    })
  }, [slides.length])

  const exitPresentation = useCallback((): void => {
    void window.prose.win.setFullscreen(false)
    onExit(currentIndex)
  }, [currentIndex, onExit])

  const exitRef = useRef(exitPresentation)
  useEffect(() => { exitRef.current = exitPresentation }, [exitPresentation])
  useEffect(() => {
    return window.prose.win.onLeaveFullscreen?.(() => exitRef.current())
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        if (showGrid) setShowGrid(false)
        else exitPresentation()
        return
      }
      if (showGrid) return

      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          if (!playback.advance()) goNext()
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault()
          goPrev()
          break
        case 'F5':
          e.preventDefault()
          exitPresentation()
          break
        case 'g':
        case 'G':
          e.preventDefault()
          setShowGrid(true)
          break
        case 'n':
        case 'N':
          e.preventDefault()
          setShowNotes((v) => !v)
          break
        case 'l':
        case 'L':
          e.preventDefault()
          setLaserMode((v) => !v)
          break
        case 'Enter': {
          e.preventDefault()
          if (numberBufRef.current.length > 0) {
            const n = parseInt(numberBufRef.current, 10)
            numberBufRef.current = ''
            if (!isNaN(n)) goTo(n - 1)
          } else {
            if (!playback.advance()) goNext()
          }
          break
        }
        default:
          if (/^\d$/.test(e.key)) {
            numberBufRef.current += e.key
            if (numberTimerRef.current) clearTimeout(numberTimerRef.current)
            numberTimerRef.current = setTimeout(() => { numberBufRef.current = '' }, 1500)
          }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [showGrid, goNext, goPrev, goTo, exitPresentation, playback])

  // Canvas click to advance
  function handleCanvasClick(e: React.MouseEvent): void {
    // Don't advance if toolbar or overlays are visible
    if ((e.target as HTMLElement).closest('[data-pres-controls]')) return
    if (!playback.advance()) goNext()
  }

  // Laser pointer tracking
  function handleMouseMove(e: React.MouseEvent): void {
    if (!laserMode) return
    setLaserPos({ x: e.clientX, y: e.clientY })
  }

  if (!currentSlide) return <div className="fixed inset-0 bg-black" />

  const sortedElements = [...currentSlide.elements].sort((a, b) => a.zIndex - b.zIndex)

  // Scale: fit the slide into the viewport
  const vpW = window.screen.width || window.innerWidth
  const vpH = window.screen.height || window.innerHeight
  const ratio = baseW / baseH
  const byW = { w: vpW, h: vpW / ratio }
  const slideW = byW.h <= vpH ? byW.w : vpH * ratio
  const slideH = slideW / ratio
  const scale = slideW / baseW
  const slideTransition = currentSlide.transition

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[99990] flex items-center justify-center bg-black"
      onClick={handleCanvasClick}
      onMouseMove={handleMouseMove}
      style={{ cursor: laserMode ? 'none' : 'default' }}
    >
      {/* Slide canvas */}
      <div
        style={{ position: 'relative', width: slideW, height: slideH, overflow: 'hidden', flexShrink: 0 }}
      >
        <SlideTransition
          slideKey={currentSlide.id}
          type={slideTransition?.type ?? 'none'}
          transitionDirection={slideTransition?.direction}
          duration={slideTransition?.duration ?? 400}
          navDirection={navDirection}
        >
          <SlideBackgroundLayer background={currentSlide.background} theme={theme} />
          {/* Master elements rendered behind slide content */}
          {master?.elements.map((mel) => (
            <div
              key={mel.id}
              style={{
                position: 'absolute',
                left: `${mel.x}%`, top: `${mel.y}%`,
                width: `${mel.width}%`, height: `${mel.height}%`,
                transform: `rotate(${mel.rotate ?? 0}deg) scaleX(${mel.flipH ? -1 : 1}) scaleY(${mel.flipV ? -1 : 1})`,
                transformOrigin: 'center center',
                zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
                opacity: mel.opacity ?? 1,
              }}
            >
              {renderSlideElement(mel, scale, true)}
            </div>
          ))}
          <div style={{ position: 'absolute', inset: 0 }}>
            <AnimatedSlideElements
              elements={sortedElements.filter((e) => !e.hidden)}
              visibleElementIds={playback.visibleElementIds}
              activeAnimationByElement={playback.activeAnimationByElement}
              onElementAnimationEnd={playback.onElementAnimationEnd}
              renderElement={(el) => renderSlideElement(el, scale, true)}
            />
          </div>
        </SlideTransition>
      </div>

      {/* Laser pointer dot */}
      {laserMode && laserPos && (
        <div
          style={{
            position: 'fixed',
            left: laserPos.x - 10,
            top: laserPos.y - 10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,30,30,0.9) 30%, rgba(255,30,30,0.3) 70%, transparent 100%)',
            boxShadow: '0 0 12px 4px rgba(255,60,60,0.5)',
            pointerEvents: 'none',
            zIndex: 99999,
          }}
        />
      )}

      {/* Auto-hide toolbar at bottom */}
      <div data-pres-controls>
        <PresentationToolbar
          currentIndex={currentIndex}
          total={slides.length}
          notesVisible={showNotes}
          onPrev={goPrev}
          onNext={() => { if (!playback.advance()) goNext() }}
          onToggleNotes={() => setShowNotes((v) => !v)}
          onExit={exitPresentation}
        />
      </div>

      {/* Speaker notes overlay (single-screen) */}
      {showNotes && (
        <div data-pres-controls>
          <SpeakerNotesOverlay
            slide={currentSlide}
            currentIndex={currentIndex}
            total={slides.length}
            elapsedSeconds={elapsedSeconds}
          />
        </div>
      )}

      {/* Grid overview */}
      {showGrid && (
        <SlideGridOverview
          slides={slides}
          theme={theme}
          settings={settings}
          currentIndex={currentIndex}
          onSelect={goTo}
          onClose={() => setShowGrid(false)}
        />
      )}
    </div>
  )
}
