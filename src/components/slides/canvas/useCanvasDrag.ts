import { useRef, useCallback } from 'react'
import type { Slide } from '@/types/slides'
import type { DragState, HandleType, ElementMove, ElementResize, ElementRotate, MarqueeRect } from './types'
import {
  computeSnapTargets, applyMoveSnap, applyResizeSnap, applyRotationSnap, snapThreshold,
  type SnapSettings, type SnapTargetList, type SnapGuide, type SpacingIndicator, type BoundsRect,
} from './snapUtils'
import type { SnapOverlayHandle } from './SnapOverlay'

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

export interface SnapHook {
  getSettings(): SnapSettings
  getSlide(): Slide
  getSelectedIds(): string[]
  getOverlay(): SnapOverlayHandle | null
}

interface Params {
  elementRefs: React.MutableRefObject<Map<string, HTMLDivElement>>
  slideRef: React.MutableRefObject<Slide>
  setMarqueeRect(rect: MarqueeRect | null): void
  onMoveElements(moves: ElementMove[]): void
  onResizeElement(resize: ElementResize): void
  onRotateElement(rotate: ElementRotate): void
  onMarqueeSelect(ids: string[]): void
  snapHookRef?: React.MutableRefObject<SnapHook>
}

export function useCanvasDrag({
  elementRefs,
  slideRef,
  setMarqueeRect,
  onMoveElements,
  onResizeElement,
  onRotateElement,
  onMarqueeSelect,
  snapHookRef,
}: Params) {
  const dragStateRef = useRef<DragState | null>(null)

  // Callbacks stored in ref so closures in startDrag never go stale.
  const cbRef = useRef({ onMoveElements, onResizeElement, onRotateElement, onMarqueeSelect, setMarqueeRect })
  cbRef.current = { onMoveElements, onResizeElement, onRotateElement, onMarqueeSelect, setMarqueeRect }

  // Snap state — precomputed at drag start, consumed during mousemove
  const snapRef = useRef<{
    targets: SnapTargetList
    // For move: bounding box of all dragged elements at start position
    moveBBox?: BoundsRect
  } | null>(null)

  const startDrag = useCallback((state: DragState): void => {
    dragStateRef.current = state
    document.body.style.userSelect = 'none'

    // Precompute snap targets once on drag start
    snapRef.current = null
    const hook = snapHookRef?.current
    if (hook && hook.getSettings().enabled && (state.type === 'move' || state.type === 'resize')) {
      const targets = computeSnapTargets(hook.getSlide(), hook.getSelectedIds(), hook.getSettings())
      let moveBBox: BoundsRect | undefined

      if (state.type === 'move') {
        // Compute bounding box of all dragged elements
        const slide = hook.getSlide()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const [id, pos] of state.startPositions) {
          const el = slide.elements.find((e) => e.id === id)
          if (!el) continue
          minX = Math.min(minX, pos.x)
          minY = Math.min(minY, pos.y)
          maxX = Math.max(maxX, pos.x + el.width)
          maxY = Math.max(maxY, pos.y + el.height)
        }
        if (isFinite(minX)) {
          moveBBox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
        }
      }

      snapRef.current = { targets, moveBBox }
    }

    function onMove(e: MouseEvent): void {
      const ds = dragStateRef.current
      if (!ds) return

      if (ds.type === 'move') {
        const rawDeltaXPx = e.clientX - ds.startMouseX
        const rawDeltaYPx = e.clientY - ds.startMouseY

        let appliedDeltaXPx = rawDeltaXPx
        let appliedDeltaYPx = rawDeltaYPx

        const snap = snapRef.current
        const hook = snapHookRef?.current
        if (snap && hook && !e.altKey) {
          const settings = hook.getSettings()
          if (settings.enabled && snap.moveBBox) {
            const threshold = snapThreshold(ds.canvasRect.width)
            const rawDxPct = (rawDeltaXPx / ds.canvasRect.width) * 100
            const rawDyPct = (rawDeltaYPx / ds.canvasRect.height) * 100
            const rawBBox: BoundsRect = {
              x: snap.moveBBox.x + rawDxPct,
              y: snap.moveBBox.y + rawDyPct,
              w: snap.moveBBox.w,
              h: snap.moveBBox.h,
            }
            const result = applyMoveSnap(
              rawBBox, snap.targets, threshold,
              hook.getSlide(), hook.getSelectedIds(), settings,
            )
            const corrXPct = result.x - rawBBox.x
            const corrYPct = result.y - rawBBox.y
            appliedDeltaXPx = rawDeltaXPx + (corrXPct / 100) * ds.canvasRect.width
            appliedDeltaYPx = rawDeltaYPx + (corrYPct / 100) * ds.canvasRect.height
            hook.getOverlay()?.update(result.guides, result.spacing)
          }
        } else if (!snap && hook) {
          hook.getOverlay()?.clear()
        }

        for (const id of ds.elementIds) {
          const el = elementRefs.current.get(id)
          const pos = ds.startPositions.get(id)
          if (!el || !pos) continue
          const flip = `scaleX(${pos.flipH ? -1 : 1}) scaleY(${pos.flipV ? -1 : 1})`
          el.style.transform = `translate(${appliedDeltaXPx}px, ${appliedDeltaYPx}px) rotate(${pos.rotate}deg) ${flip}`
        }
        return
      }

      if (ds.type === 'resize') {
        const el = elementRefs.current.get(ds.elementId)
        if (!el) return
        const dx = ((e.clientX - ds.startMouseX) / ds.canvasRect.width) * 100
        const dy = ((e.clientY - ds.startMouseY) / ds.canvasRect.height) * 100
        let nb = applyResizeHandle(ds.startBounds, ds.handle, dx, dy, e.shiftKey)

        const snap = snapRef.current
        const hook = snapHookRef?.current
        if (snap && hook && !e.altKey && hook.getSettings().enabled) {
          const threshold = snapThreshold(ds.canvasRect.width)
          const { bounds: snappedBounds, guides } = applyResizeSnap(
            ds.handle, nb, snap.targets, threshold,
          )
          nb = snappedBounds
          hook.getOverlay()?.update(guides, [])
        }

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

        const hook = snapHookRef?.current
        const settings = hook?.getSettings()
        if (settings?.enabled && !e.altKey) {
          angle = applyRotationSnap(angle)
        } else if (e.shiftKey) {
          // Legacy Shift-key snap when master snap disabled
          const snapped = Math.round(angle / 45) * 45
          if (Math.abs(angle - snapped) < ROTATE_SNAP_THRESHOLD_DEG) angle = snapped
        }

        el.style.transform = `rotate(${angle}deg)`
        dragStateRef.current = { ...ds, currentAngle: angle }

        // Show angle label
        if (hook && ds.canvasRect) {
          const cx = ((ds.centerXAbs - ds.canvasRect.left) / ds.canvasRect.width) * 100
          const cy = ((ds.centerYAbs - ds.canvasRect.top) / ds.canvasRect.height) * 100
          hook.getOverlay()?.update([], [], angle, cx, cy)
        }
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

      // Clear overlay
      snapHookRef?.current?.getOverlay()?.clear()
      snapRef.current = null

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

        // Recompute final positions with snap applied
        const hook = snapHookRef?.current
        let corrXPct = 0
        let corrYPct = 0

        const rawDxPx = e.clientX - ds.startMouseX
        const rawDyPx = e.clientY - ds.startMouseY
        const rawDxPct = (rawDxPx / ds.canvasRect.width) * 100
        const rawDyPct = (rawDyPx / ds.canvasRect.height) * 100

        // Recompute snap correction using same logic as onMove
        const snapState = (() => {
          if (!hook || !hook.getSettings().enabled || e.altKey) return null
          const slide = hook.getSlide()
          const selectedIds = hook.getSelectedIds()
          const targets = computeSnapTargets(slide, selectedIds, hook.getSettings())
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
          for (const [id, pos] of ds.startPositions) {
            const el = slide.elements.find((x) => x.id === id)
            if (!el) continue
            minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y)
            maxX = Math.max(maxX, pos.x + el.width); maxY = Math.max(maxY, pos.y + el.height)
          }
          if (!isFinite(minX)) return null
          const rawBBox: BoundsRect = { x: minX + rawDxPct, y: minY + rawDyPct, w: maxX - minX, h: maxY - minY }
          return applyMoveSnap(rawBBox, targets, snapThreshold(ds.canvasRect.width), slide, selectedIds, hook.getSettings())
        })()

        if (snapState) {
          // snapState.x/.y is the snapped bbox origin; original bbox origin was (minX + rawDxPct)
          // We need correction relative to the raw delta
          let minX = Infinity, minY = Infinity
          for (const [, pos] of ds.startPositions) { minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y) }
          corrXPct = snapState.x - (minX + rawDxPct)
          corrYPct = snapState.y - (minY + rawDyPct)
        }

        const moves: ElementMove[] = []
        for (const id of ds.elementIds) {
          const el = elementRefs.current.get(id)
          const pos = ds.startPositions.get(id)
          if (!el || !pos) continue
          const newX = pos.x + rawDxPct + corrXPct
          const newY = pos.y + rawDyPct + corrYPct
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
        let nb = applyResizeHandle(ds.startBounds, ds.handle, dx, dy, e.shiftKey)

        // Apply snap on commit
        const hook = snapHookRef?.current
        if (hook && hook.getSettings().enabled && !e.altKey) {
          const targets = computeSnapTargets(hook.getSlide(), hook.getSelectedIds(), hook.getSettings())
          const { bounds: snapped } = applyResizeSnap(ds.handle, nb, targets, snapThreshold(ds.canvasRect.width))
          nb = snapped
        }

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
        if (maxX - minX < 0.5 && maxY - minY < 0.5) return
        const hit = slideRef.current.elements
          .filter((el) => !el.locked && !el.hidden)
          .filter((el) => el.x < maxX && el.x + el.width > minX && el.y < maxY && el.y + el.height > minY)
          .map((el) => el.id)
        cbRef.current.onMarqueeSelect(hit)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [elementRefs, slideRef, snapHookRef])

  return { startDrag, dragStateRef }
}
