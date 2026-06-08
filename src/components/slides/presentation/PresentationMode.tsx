import { useEffect, useRef, useState, useCallback } from 'react'
import type { Slide, PresentationTheme, PresentationSettings, SlideMaster } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { SlideBackground } from '../canvas/SlideBackground'
import { renderSlideElement } from '../elements/renderSlideElement'
import { SlideTransition } from './SlideTransition'
import { PresentationToolbar } from './PresentationToolbar'
import { SlideGridOverview } from './SlideGridOverview'
import { SpeakerNotesOverlay } from './SpeakerNotesOverlay'

interface Props {
  slides: Slide[]
  theme: PresentationTheme
  settings: PresentationSettings
  master?: SlideMaster
  startIndex: number
  onExit(currentIndex: number): void
}

function getBaseSize(settings: PresentationSettings): { baseW: number; baseH: number } {
  if (settings.aspectRatio === '4:3') return { baseW: 1920, baseH: 1440 }
  if (settings.aspectRatio === 'custom' && settings.customWidth && settings.customHeight) {
    return { baseW: settings.customWidth, baseH: settings.customHeight }
  }
  return { baseW: SLIDE_BASE_WIDTH, baseH: SLIDE_BASE_HEIGHT }
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

  const { baseW, baseH } = getBaseSize(settings)

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

  // Keyboard handler
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (showGrid) return // handled by grid overlay

      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          goNext()
          break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          goPrev()
          break
        case 'Escape':
          e.preventDefault()
          onExit(currentIndex)
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
          if (numberBufRef.current.length > 0) {
            const n = parseInt(numberBufRef.current, 10)
            numberBufRef.current = ''
            if (!isNaN(n)) goTo(n - 1)
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
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [currentIndex, showGrid, goNext, goPrev, goTo, onExit])

  // Canvas click to advance
  function handleCanvasClick(e: React.MouseEvent): void {
    // Don't advance if toolbar or overlays are visible
    if ((e.target as HTMLElement).closest('[data-pres-controls]')) return
    goNext()
  }

  // Laser pointer tracking
  function handleMouseMove(e: React.MouseEvent): void {
    if (!laserMode) return
    setLaserPos({ x: e.clientX, y: e.clientY })
  }

  const currentSlide = slides[currentIndex]
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
          <SlideBackground background={currentSlide.background} theme={theme} />
          {/* Master elements rendered behind slide content */}
          {master?.elements.map((mel) => (
            <div
              key={mel.id}
              style={{
                position: 'absolute',
                left: `${mel.x}%`, top: `${mel.y}%`,
                width: `${mel.width}%`, height: `${mel.height}%`,
                zIndex: 0, pointerEvents: 'none', overflow: 'hidden',
              }}
            >
              {mel.type === 'logo' && mel.src && (
                <img src={mel.src} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
              {mel.type === 'footer' && (
                <div style={{
                  width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                  fontSize: (mel.fontSize ?? 16) * scale,
                  color: mel.color ?? theme.textColor,
                  fontFamily: 'Inter',
                }}>
                  {mel.content}
                </div>
              )}
            </div>
          ))}
          <div style={{ position: 'absolute', inset: 0 }}>
            {sortedElements.filter((e) => !e.hidden).map((el) => (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  transform: `rotate(${el.rotate}deg) scaleX(${el.flipH ? -1 : 1}) scaleY(${el.flipV ? -1 : 1})`,
                  transformOrigin: 'center center',
                  opacity: el.opacity,
                  zIndex: el.zIndex,
                  overflow: 'hidden',
                }}
              >
                {renderSlideElement(el, scale, true)}
              </div>
            ))}
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
          onNext={goNext}
          onToggleNotes={() => setShowNotes((v) => !v)}
          onExit={() => onExit(currentIndex)}
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
