import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { Slide, PresentationTheme, PresentationSettings, SlideMaster } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { SlideBackground } from './SlideBackground'
import { SlideElementWrapper } from './SlideElementWrapper'
import { MarqueeSelection } from './MarqueeSelection'
import { SlideGridOverlay } from '../SlideGridOverlay'
import { useCanvasDrag } from './useCanvasDrag'
import type { HandleType, ElementMove, ElementResize, ElementRotate, MarqueeRect } from './types'

export type CanvasToolMode = 'select' | 'text' | 'shape' | 'image' | 'table' | 'equation' | 'code' | 'video'

interface Props {
  slide: Slide
  theme: PresentationTheme
  settings: PresentationSettings
  selectedIds: string[]
  toolMode?: CanvasToolMode
  onSelectElement(id: string, addToSelection: boolean): void
  onDeselectAll(): void
  onDoubleClickElement(id: string): void
  onCommitText?(id: string, content: string): void
  editingElementId?: string | null
  onMoveElements(moves: ElementMove[]): void
  onResizeElement(resize: ElementResize): void
  onRotateElement(rotate: ElementRotate): void
  onMarqueeSelect(ids: string[]): void
  onDrawElement?(type: CanvasToolMode, x: number, y: number, width: number, height: number): void
  master?: SlideMaster
  showGrid?: boolean
  zoom?: number  // 0 = fit, 25–400 = explicit %
  onFitZoomChange?(pct: number): void
}

function getBaseSize(settings: PresentationSettings): { baseW: number; baseH: number } {
  if (settings.aspectRatio === '4:3') return { baseW: 1920, baseH: 1440 }
  if (settings.aspectRatio === 'custom' && settings.customWidth && settings.customHeight) {
    return { baseW: settings.customWidth, baseH: settings.customHeight }
  }
  return { baseW: SLIDE_BASE_WIDTH, baseH: SLIDE_BASE_HEIGHT }
}

// Compute multi-selection bounding box in percentages.
function multiSelectBounds(slide: Slide, ids: string[]): { x: number; y: number; w: number; h: number } | null {
  if (ids.length < 2) return null
  const els = slide.elements.filter((e) => ids.includes(e.id))
  if (els.length === 0) return null
  const minX = Math.min(...els.map((e) => e.x))
  const minY = Math.min(...els.map((e) => e.y))
  const maxX = Math.max(...els.map((e) => e.x + e.width))
  const maxY = Math.max(...els.map((e) => e.y + e.height))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function SlideCanvas({
  slide,
  theme,
  settings,
  selectedIds,
  toolMode = 'select',
  onSelectElement,
  onDeselectAll,
  onDoubleClickElement,
  editingElementId = null,
  onCommitText,
  onMoveElements,
  onResizeElement,
  onRotateElement,
  onMarqueeSelect,
  onDrawElement,
  master,
  showGrid = false,
  zoom = 0,
  onFitZoomChange,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const elementRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const slideRef = useRef(slide)
  useEffect(() => { slideRef.current = slide }, [slide])

  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 })
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)

  const { baseW, baseH } = getBaseSize(settings)
  const scale = canvasSize.width / baseW

  const onFitZoomChangeRef = useRef(onFitZoomChange)
  useEffect(() => { onFitZoomChangeRef.current = onFitZoomChange }, [onFitZoomChange])

  // Fit canvas to container while maintaining aspect ratio. Zoom overrides fit.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function update(): void {
      if (!el) return
      if (zoom > 0) {
        // Explicit zoom: canvas is zoom% of base dimensions
        const factor = zoom / 100
        setCanvasSize({ width: baseW * factor, height: baseH * factor })
        return
      }
      // Fit mode
      const { width, height } = el.getBoundingClientRect()
      const pad = 40
      const availW = Math.max(1, width - pad * 2)
      const availH = Math.max(1, height - pad * 2)
      const ratio = baseW / baseH
      const byWidth = { width: availW, height: availW / ratio }
      let fitW: number
      if (byWidth.height <= availH) {
        setCanvasSize(byWidth)
        fitW = byWidth.width
      } else {
        const size = { width: availH * ratio, height: availH }
        setCanvasSize(size)
        fitW = size.width
      }
      onFitZoomChangeRef.current?.(Math.round((fitW / baseW) * 100))
    }
    update()
    if (zoom > 0) return  // no ResizeObserver needed when explicit zoom
    const obs = new ResizeObserver(update)
    obs.observe(el)
    return () => obs.disconnect()
  }, [baseW, baseH, zoom])

  const registerRef = useCallback((id: string, el: HTMLDivElement | null): void => {
    if (el) elementRefs.current.set(id, el)
    else elementRefs.current.delete(id)
  }, [])

  const { startDrag } = useCanvasDrag({
    elementRefs,
    slideRef,
    setMarqueeRect,
    onMoveElements,
    onResizeElement,
    onRotateElement,
    onMarqueeSelect,
  })

  const handleElementMouseDown = useCallback((e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const addToSelection = e.shiftKey

    // Select first, then prepare drag
    onSelectElement(id, addToSelection)

    const element = slideRef.current.elements.find((el) => el.id === id)
    if (!element) return

    const canvasRect = canvasRef.current!.getBoundingClientRect()

    // Build start positions for all elements that will be dragged.
    // If shift-clicking to deselect, we won't drag. Drag only if element was already selected
    // or becomes the sole selection.
    const dragIds = addToSelection
      ? [id]  // only drag the newly added element on shift-click
      : selectedIds.includes(id)
        ? selectedIds  // drag the whole multi-selection
        : [id]         // drag just this newly selected element

    const startPositions = new Map<string, { x: number; y: number; rotate: number; flipH: boolean; flipV: boolean }>()
    for (const eid of dragIds) {
      const el = slideRef.current.elements.find((x) => x.id === eid)
      if (el) startPositions.set(eid, { x: el.x, y: el.y, rotate: el.rotate, flipH: el.flipH, flipV: el.flipV })
    }

    startDrag({
      type: 'move',
      elementIds: dragIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startPositions,
      canvasRect,
    })
  }, [onSelectElement, selectedIds, startDrag])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, id: string, handle: HandleType): void => {
    e.stopPropagation()
    const element = slideRef.current.elements.find((el) => el.id === id)
    if (!element) return
    const canvasRect = canvasRef.current!.getBoundingClientRect()
    startDrag({
      type: 'resize',
      elementId: id,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBounds: { x: element.x, y: element.y, width: element.width, height: element.height },
      canvasRect,
    })
  }, [startDrag])

  const handleRotateMouseDown = useCallback((e: React.MouseEvent, id: string): void => {
    e.stopPropagation()
    const el = elementRefs.current.get(id)
    if (!el) return
    const rect = el.getBoundingClientRect()
    const centerXAbs = rect.left + rect.width / 2
    const centerYAbs = rect.top + rect.height / 2
    const element = slideRef.current.elements.find((x) => x.id === id)
    const startAngle = element?.rotate ?? 0
    startDrag({ type: 'rotate', elementId: id, centerXAbs, centerYAbs, currentAngle: startAngle })
  }, [startDrag])

  const drawStartRef = useRef<{ x: number; y: number } | null>(null)

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent): void => {
    if (e.target !== canvasRef.current && !(e.target as HTMLElement).closest('[data-canvas-bg]')) return

    if (toolMode !== 'select' && onDrawElement) {
      const canvasRect = canvasRef.current!.getBoundingClientRect()
      const startX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100
      const startY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100
      drawStartRef.current = { x: startX, y: startY }

      function onMove() { /* ghost handled in Phase 27 */ }

      function onUp(ev: MouseEvent) {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (!drawStartRef.current || !canvasRef.current) return
        const rect = canvasRef.current.getBoundingClientRect()
        const endX = ((ev.clientX - rect.left) / rect.width) * 100
        const endY = ((ev.clientY - rect.top) / rect.height) * 100
        const x = Math.min(drawStartRef.current.x, endX)
        const y = Math.min(drawStartRef.current.y, endY)
        const width = Math.abs(endX - drawStartRef.current.x)
        const height = Math.abs(endY - drawStartRef.current.y)
        // Minimum 2% in each dimension to count as intentional draw vs click
        if (width > 2 && height > 2) {
          onDrawElement(toolMode, x, y, width, height)
        } else {
          // Treat as click: place element at cursor with default size
          onDrawElement(toolMode, drawStartRef.current.x - 15, drawStartRef.current.y - 5, 30, 10)
        }
        drawStartRef.current = null
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    onDeselectAll()
    const canvasRect = canvasRef.current!.getBoundingClientRect()
    const startX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100
    const startY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100
    startDrag({ type: 'marquee', canvasRect, startX, startY })
  }, [toolMode, onDrawElement, onDeselectAll, startDrag])

  const sortedElements = useMemo(
    () => [...slide.elements].sort((a, b) => a.zIndex - b.zIndex),
    [slide.elements],
  )

  const multiBounds = useMemo(
    () => (selectedIds.length >= 2 ? multiSelectBounds(slide, selectedIds) : null),
    [slide, selectedIds],
  )

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: zoom > 0 ? 'flex-start' : 'center',
        justifyContent: zoom > 0 ? 'flex-start' : 'center',
        overflow: zoom > 0 ? 'auto' : 'hidden',
        padding: zoom > 0 ? 24 : 0,
      }}
    >
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          flexShrink: 0,
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
          overflow: 'hidden',
          cursor: toolMode !== 'select' ? 'crosshair' : 'default',
          userSelect: 'none',
        }}
        onMouseDown={handleCanvasMouseDown}
      >
        <SlideBackground background={slide.background} theme={theme} />

        {/* Master elements (non-interactive, rendered at z=0) */}
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
                textAlign: mel.align ?? 'left',
                fontFamily: 'Inter',
              }}>
                {mel.content}
              </div>
            )}
          </div>
        ))}

        <div data-canvas-bg style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          {sortedElements.map((element) => (
            <SlideElementWrapper
              key={element.id}
              element={element}
              scale={scale}
              selected={selectedIds.includes(element.id)}
              isMultiSelected={selectedIds.length >= 2 && selectedIds.includes(element.id)}
              editingElementId={editingElementId}
              onElementMouseDown={handleElementMouseDown}
              onElementDoubleClick={(e, id) => { e.stopPropagation(); onDoubleClickElement(id) }}
              onResizeMouseDown={handleResizeMouseDown}
              onRotateMouseDown={handleRotateMouseDown}
              registerRef={registerRef}
              onCommitText={(id, content) => onCommitText?.(id, content)}
              onCancelEdit={() => onDoubleClickElement('')}
            />
          ))}
        </div>

        {/* Multi-selection bounding box */}
        {multiBounds && (
          <div
            style={{
              position: 'absolute',
              left: `${multiBounds.x}%`,
              top: `${multiBounds.y}%`,
              width: `${multiBounds.w}%`,
              height: `${multiBounds.h}%`,
              border: '1.5px dashed #3B82F6',
              pointerEvents: 'none',
              zIndex: 9998,
            }}
          />
        )}

        {marqueeRect && <MarqueeSelection rect={marqueeRect} />}

        {showGrid && (
          <SlideGridOverlay canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />
        )}
      </div>
    </div>
  )
}
