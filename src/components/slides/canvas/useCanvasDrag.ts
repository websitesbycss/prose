import { useRef, useCallback } from 'react'
import type { Slide } from '@/types/slides'
import type { DragState, HandleType, ElementMove, ElementResize, ElementRotate, MarqueeRect } from './types'

const DRAG_THRESHOLD_PX = 4
const MIN_ELEMENT_PERCENT = 2
const ROTATE_SNAP_THRESHOLD_DEG = 5

function applyResizeHandle(
  bounds: { x: number; y: number; width: number; height: number },
  handle: HandleType,
  dx: number,
  dy: number,
  shiftKey: boolean,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = bounds
  switch (handle) {
    case 'nw': x += dx; y += dy; width -= dx; height -= dy; break
    case 'n':  y += dy; height -= dy; break
    case 'ne': width += dx; y += dy; height -= dy; break
    case 'e':  width += dx; break
    case 'se': width += dx; height += dy; break
    case 's':  height += dy; break
    case 'sw': x += dx; width -= dx; height += dy; break
    case 'w':  x += dx; width -= dx; break
  }
  if (shiftKey && (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw')) {
    const ar = bounds.width / (bounds.height || 1)
    width = Math.max(MIN_ELEMENT_PERCENT, width)
    height = width / ar
  }
  width = Math.max(MIN_ELEMENT_PERCENT, width)
  height = Math.max(MIN_ELEMENT_PERCENT, height)
  return { x, y, width, height }
}

interface Params {
  elementRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  slideRef: React.MutableRefObject<Slide>
  setMarqueeRect(rect: MarqueeRect | null): void
  onMoveElements(moves: ElementMove[]): void
  onResizeElement(resize: ElementResize): void
  onRotateElement(rotate: ElementRotate): void
  onMarqueeSelect(ids: string[]): void
}

export function useCanvasDrag({
  elementRefs,
  slideRef,
  setMarqueeRect,
  onMoveElements,
  onResizeElement,
  onRotateElement,
  onMarqueeSelect,
}: Params) {
  const dragStateRef = useRef<DragState | null>(null)

  // Callbacks stored in ref so closures in startDrag never go stale.
  const cbRef = useRef({ onMoveElements, onResizeElement, onRotateElement, onMarqueeSelect, setMarqueeRect })
  cbRef.current = { onMoveElements, onResizeElement, onRotateElement, onMarqueeSelect, setMarqueeRect }

  const startDrag = useCallback((state: DragState): void => {
    dragStateRef.current = state
    document.body.style.userSelect = 'none'

    function onMove(e: MouseEvent): void {
      const ds = dragStateRef.current
      if (!ds) return

      if (ds.type === 'move') {
        const deltaX = e.clientX - ds.startMouseX
        const deltaY = e.clientY - ds.startMouseY
        for (const id of ds.elementIds) {
          const el = elementRefs.current.get(id)
          const pos = ds.startPositions.get(id)
          if (!el || !pos) continue
          const flip = `scaleX(${pos.flipH ? -1 : 1}) scaleY(${pos.flipV ? -1 : 1})`
          // translate in canvas space, then rotate/flip — keeps drag axis-aligned
          el.style.transform = `translate(${deltaX}px, ${deltaY}px) rotate(${pos.rotate}deg) ${flip}`
        }
        return
      }

      if (ds.type === 'resize') {
        const el = elementRefs.current.get(ds.elementId)
        if (!el) return
        const dx = ((e.clientX - ds.startMouseX) / ds.canvasRect.width) * 100
        const dy = ((e.clientY - ds.startMouseY) / ds.canvasRect.height) * 100
        const nb = applyResizeHandle(ds.startBounds, ds.handle, dx, dy, e.shiftKey)
        el.style.left = `${nb.x}%`
        el.style.top = `${nb.y}%`
        el.style.width = `${nb.width}%`
        el.style.height = `${nb.height}%`
        return
      }

      if (ds.type === 'rotate') {
        const el = elementRefs.current.get(ds.elementId)
        if (!el) return
        let angle = Math.atan2(e.clientY - ds.centerYAbs, e.clientX - ds.centerXAbs) * (180 / Math.PI) + 90
        if (e.shiftKey) {
          const snapped = Math.round(angle / 45) * 45
          if (Math.abs(angle - snapped) < ROTATE_SNAP_THRESHOLD_DEG) angle = snapped
        }
        el.style.transform = `rotate(${angle}deg)`
        dragStateRef.current = { ...ds, currentAngle: angle }
        return
      }

      if (ds.type === 'marquee') {
        const endX = ((e.clientX - ds.canvasRect.left) / ds.canvasRect.width) * 100
        const endY = ((e.clientY - ds.canvasRect.top) / ds.canvasRect.height) * 100
        cbRef.current.setMarqueeRect({ startX: ds.startX, startY: ds.startY, endX, endY })
      }
    }

    function onUp(e: MouseEvent): void {
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)

      const ds = dragStateRef.current
      dragStateRef.current = null

      if (!ds) return

      if (ds.type === 'move') {
        const totalDelta = Math.hypot(e.clientX - ds.startMouseX, e.clientY - ds.startMouseY)
        if (totalDelta < DRAG_THRESHOLD_PX) {
          // Was a click — restore transforms without committing
          for (const id of ds.elementIds) {
            const el = elementRefs.current.get(id)
            const pos = ds.startPositions.get(id)
            if (el && pos) {
              const flip = `scaleX(${pos.flipH ? -1 : 1}) scaleY(${pos.flipV ? -1 : 1})`
              el.style.transform = `rotate(${pos.rotate}deg) ${flip}`
            }
          }
          return
        }
        const moves: ElementMove[] = []
        for (const id of ds.elementIds) {
          const el = elementRefs.current.get(id)
          const pos = ds.startPositions.get(id)
          if (!el || !pos) continue
          const dx = ((e.clientX - ds.startMouseX) / ds.canvasRect.width) * 100
          const dy = ((e.clientY - ds.startMouseY) / ds.canvasRect.height) * 100
          const newX = pos.x + dx
          const newY = pos.y + dy
          // Update DOM first so React re-render is seamless
          const flip = `scaleX(${pos.flipH ? -1 : 1}) scaleY(${pos.flipV ? -1 : 1})`
          el.style.transform = `rotate(${pos.rotate}deg) ${flip}`
          el.style.left = `${newX}%`
          el.style.top = `${newY}%`
          moves.push({ id, x: newX, y: newY })
        }
        if (moves.length > 0) cbRef.current.onMoveElements(moves)
        return
      }

      if (ds.type === 'resize') {
        const dx = ((e.clientX - ds.startMouseX) / ds.canvasRect.width) * 100
        const dy = ((e.clientY - ds.startMouseY) / ds.canvasRect.height) * 100
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
        const nb = applyResizeHandle(ds.startBounds, ds.handle, dx, dy, e.shiftKey)
        cbRef.current.onResizeElement({ id: ds.elementId, ...nb })
        return
      }

      if (ds.type === 'rotate') {
        cbRef.current.onRotateElement({ id: ds.elementId, rotate: ds.currentAngle })
        return
      }

      if (ds.type === 'marquee') {
        cbRef.current.setMarqueeRect(null)
        const endX = ((e.clientX - ds.canvasRect.left) / ds.canvasRect.width) * 100
        const endY = ((e.clientY - ds.canvasRect.top) / ds.canvasRect.height) * 100
        const minX = Math.min(ds.startX, endX)
        const maxX = Math.max(ds.startX, endX)
        const minY = Math.min(ds.startY, endY)
        const maxY = Math.max(ds.startY, endY)
        if (maxX - minX < 0.5 && maxY - minY < 0.5) return  // tiny marquee = click
        const hit = slideRef.current.elements
          .filter((el) => !el.locked && !el.hidden)
          .filter((el) => el.x < maxX && el.x + el.width > minX && el.y < maxY && el.y + el.height > minY)
          .map((el) => el.id)
        cbRef.current.onMarqueeSelect(hit)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [elementRefs, slideRef])

  return { startDrag, dragStateRef }
}
