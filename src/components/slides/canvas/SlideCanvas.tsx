import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import type { Slide, PresentationTheme, PresentationSettings, SlideMaster, SlideElement, ShapeElement, ShapeType } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { SlideBackground } from './SlideBackground'
import { SlideElementWrapper } from './SlideElementWrapper'
import { MarqueeSelection } from './MarqueeSelection'
import { SlideGridOverlay } from '../SlideGridOverlay'
import { useCanvasDrag } from './useCanvasDrag'
import { SnapOverlay } from './SnapOverlay'
import type { SnapOverlayHandle } from './SnapOverlay'
import type { SnapHook } from './useCanvasDrag'
import type { SnapSettings } from './snapUtils'
import { ShapeElementRenderer } from '../elements/ShapeElementRenderer'
import { renderSlideElement } from '../elements/renderSlideElement'
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
  onCommitElement?(id: string, partial: Partial<SlideElement>): void
  onElementContextMenu?(e: React.MouseEvent, id: string): void
  onCanvasContextMenu?(e: React.MouseEvent): void
  master?: SlideMaster
  showGrid?: boolean
  zoom?: number  // 0 = fit, 25–400 = explicit %
  onFitZoomChange?(pct: number): void
  pendingShapeType?: ShapeType | null
  pendingTableConfig?: { cols: number; rows: number } | null
  onTableCellSelect?: (cellIds: string[]) => void
  snapSettings?: SnapSettings
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
  onCommitElement,
  onMoveElements,
  onResizeElement,
  onRotateElement,
  onMarqueeSelect,
  onDrawElement,
  onElementContextMenu,
  onCanvasContextMenu,
  master,
  showGrid = false,
  zoom = 0,
  onFitZoomChange,
  pendingShapeType,
  pendingTableConfig,
  onTableCellSelect,
  snapSettings,
}: Props): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const elementRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const slideRef = useRef(slide)
  useEffect(() => { slideRef.current = slide }, [slide])

  // ── Snap engine ─────────────────────────────────────────────────────────────
  const overlayRef = useRef<SnapOverlayHandle>(null)
  const snapSelectedIdsRef = useRef(selectedIds)
  useEffect(() => { snapSelectedIdsRef.current = selectedIds }, [selectedIds])
  const snapSettingsRef = useRef<SnapSettings>(snapSettings ?? { enabled: true, toCanvas: true, toElements: true, equalSpacing: true })
  useEffect(() => { snapSettingsRef.current = snapSettings ?? { enabled: true, toCanvas: true, toElements: true, equalSpacing: true } }, [snapSettings])

  const snapHookRef = useRef<SnapHook>({
    getSettings: () => snapSettingsRef.current,
    getSlide: () => slideRef.current,
    getSelectedIds: () => snapSelectedIdsRef.current,
    getOverlay: () => overlayRef.current,
  })

  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 540 })
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null)
  const [ghostRect, setGhostRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

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
    snapHookRef,
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
    const dragIds = addToSelection
      ? [id]
      : selectedIds.includes(id)
        ? selectedIds
        : [id]

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
    const canvasRect = canvasRef.current!.getBoundingClientRect()
    const centerXAbs = rect.left + rect.width / 2
    const centerYAbs = rect.top + rect.height / 2
    const element = slideRef.current.elements.find((x) => x.id === id)
    const startAngle = element?.rotate ?? 0
    startDrag({ type: 'rotate', elementId: id, centerXAbs, centerYAbs, currentAngle: startAngle, canvasRect })
  }, [startDrag])

  const drawStartRef = useRef<{ x: number; y: number } | null>(null)

  // Handles mousedown on the entire interaction area (canvas + surrounding whitespace).
  // Element mousedowns call stopPropagation, so this only fires for background/whitespace clicks.
  const handleContainerMouseDown = useCallback((e: React.MouseEvent): void => {
    if (e.button !== 0) return  // only left-click draws/marquee-selects; right-click opens the context menu
    if (!canvasRef.current) return

    if (toolMode !== 'select' && onDrawElement) {
      const canvasRect = canvasRef.current.getBoundingClientRect()
      const startX = ((e.clientX - canvasRect.left) / canvasRect.width) * 100
      const startY = ((e.clientY - canvasRect.top) / canvasRect.height) * 100
      drawStartRef.current = { x: startX, y: startY }

      function onMove(ev: MouseEvent) {
        if (!drawStartRef.current || !canvasRef.current) return
        const rect = canvasRef.current.getBoundingClientRect()
        const endX = ((ev.clientX - rect.left) / rect.width) * 100
        const endY = ((ev.clientY - rect.top) / rect.height) * 100
        setGhostRect({
          x: Math.min(drawStartRef.current.x, endX),
          y: Math.min(drawStartRef.current.y, endY),
          w: Math.abs(endX - drawStartRef.current.x),
          h: Math.abs(endY - drawStartRef.current.y),
        })
      }

      function onUp(ev: MouseEvent) {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        setGhostRect(null)
        if (!drawStartRef.current || !canvasRef.current) return
        const rect = canvasRef.current.getBoundingClientRect()
        const endX = ((ev.clientX - rect.left) / rect.width) * 100
        const endY = ((ev.clientY - rect.top) / rect.height) * 100
        const x = Math.min(drawStartRef.current.x, endX)
        const y = Math.min(drawStartRef.current.y, endY)
        const width = Math.abs(endX - drawStartRef.current.x)
        const height = Math.abs(endY - drawStartRef.current.y)
        if (width > 2 && height > 2) {
          onDrawElement(toolMode, x, y, width, height)
        } else {
          const cx = drawStartRef.current.x
          const cy = drawStartRef.current.y
          if (toolMode === 'text') {
            onDrawElement(toolMode, cx, cy - 2, 30, 10)
          } else if (toolMode === 'shape') {
            onDrawElement(toolMode, cx, cy, 15, 15)
          } else if (toolMode === 'table') {
            onDrawElement(toolMode, cx, cy, 35, 20)
          } else if (toolMode === 'equation') {
            onDrawElement(toolMode, cx, cy, 25, 12)
          } else if (toolMode === 'code') {
            onDrawElement(toolMode, cx, cy, 35, 20)
          } else {
            onDrawElement(toolMode, cx, cy, 30, 20)
          }
        }
        drawStartRef.current = null
      }

      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return
    }

    onDeselectAll()
    const canvasRect = canvasRef.current.getBoundingClientRect()
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
        alignItems: 'center',
        justifyContent: 'center',
        overflow: zoom > 0 ? 'auto' : 'hidden',
        padding: zoom > 0 ? 24 : 0,
        backgroundColor: 'hsl(var(--editor-canvas))',
        cursor: toolMode !== 'select' ? 'crosshair' : 'default',
      }}
      onMouseDown={handleContainerMouseDown}
      onContextMenu={(e) => { e.preventDefault(); onCanvasContextMenu?.(e) }}
    >
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: canvasSize.width,
          height: canvasSize.height,
          flexShrink: 0,
          boxShadow: '0 4px 32px rgba(0,0,0,0.18)',
          // overflow: visible so elements dragged outside the slide remain visible in the
          // surrounding grey area. The background and master layers use their own clip div.
          overflow: 'visible',
          userSelect: 'none',
        }}
      >
        {/* Slide background + master elements — clipped to canvas bounds */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0, pointerEvents: 'none' }}>
          <SlideBackground background={slide.background ?? master?.background} theme={theme} />

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
        </div>

        {/* Slide elements — overflow: visible so they render in surrounding whitespace */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
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
              onElementContextMenu={(e, id) => onElementContextMenu?.(e, id)}
              registerRef={registerRef}
              onCommitText={(id, content) => onCommitText?.(id, content)}
              onCommitElement={(id, partial) => onCommitElement?.(id, partial)}
              onCancelEdit={() => onDoubleClickElement('')}
              onTableCellSelect={onTableCellSelect}
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

        {ghostRect && ghostRect.w > 0.5 && ghostRect.h > 0.5 && (() => {
          const ghostStyle: React.CSSProperties = {
            position: 'absolute',
            left: `${ghostRect.x}%`,
            top: `${ghostRect.y}%`,
            width: `${ghostRect.w}%`,
            height: `${ghostRect.h}%`,
            pointerEvents: 'none',
            zIndex: 9999,
          }
          if (toolMode === 'shape' && pendingShapeType) {
            const ghostEl: ShapeElement = {
              id: 'ghost', type: 'shape', shapeType: pendingShapeType,
              fill: 'rgba(59,130,246,0.12)',
              border: { color: '#3B82F6', width: 2, style: 'solid' },
              x: 0, y: 0, width: 100, height: 100,
              rotate: 0, opacity: 1, zIndex: 0, flipH: false, flipV: false, locked: false, hidden: false,
            }
            return (
              <div style={ghostStyle}>
                <ShapeElementRenderer element={ghostEl} scale={scale} />
              </div>
            )
          }
          if (toolMode === 'table' && pendingTableConfig) {
            const { cols, rows } = pendingTableConfig
            return (
              <div style={{ ...ghostStyle, border: '1.5px solid #3B82F6', backgroundColor: 'rgba(59,130,246,0.04)' }}>
                <svg width="100%" height="100%" style={{ display: 'block' }}>
                  {Array.from({ length: cols - 1 }, (_, i) => {
                    const x = ((i + 1) / cols) * 100
                    return <line key={`c${i}`} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#3B82F6" strokeWidth="1" />
                  })}
                  {Array.from({ length: rows - 1 }, (_, i) => {
                    const y = ((i + 1) / rows) * 100
                    return <line key={`r${i}`} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#3B82F6" strokeWidth="1" />
                  })}
                </svg>
              </div>
            )
          }
          return (
            <div
              style={{
                ...ghostStyle,
                border: '1.5px dashed #3B82F6',
                backgroundColor: 'rgba(59, 130, 246, 0.06)',
              }}
            />
          )
        })()}

        {marqueeRect && <MarqueeSelection rect={marqueeRect} />}

        {/* Snap guides overlay — pointer-events:none, above elements */}
        <SnapOverlay ref={overlayRef} />

        {/* Grid overlay — clipped to canvas bounds */}
        {showGrid && (
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 10000, pointerEvents: 'none' }}>
            <SlideGridOverlay canvasWidth={canvasSize.width} canvasHeight={canvasSize.height} />
          </div>
        )}
      </div>
    </div>
  )
}
