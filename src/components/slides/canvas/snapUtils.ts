import type { Slide } from '@/types/slides'
import type { HandleType } from './types'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SnapSettings {
  enabled: boolean
  toCanvas: boolean
  toElements: boolean
  equalSpacing: boolean
}

export interface SnapGuide {
  type: 'h' | 'v'
  pos: number    // y% for horizontal, x% for vertical
  start: number  // lesser extent (x% for h, y% for v)
  end: number    // greater extent
}

export interface SpacingIndicator {
  type: 'h' | 'v'
  pos: number    // y% for H spacing line, x% for V spacing line
  start: number  // start of the gap
  end: number    // end of the gap
}

export interface BoundsRect { x: number; y: number; w: number; h: number }

// ─── Internal snap target ─────────────────────────────────────────────────────

interface SnapTarget {
  axis: 'x' | 'y'
  value: number
  source: 'canvas-edge' | 'canvas-center' | 'element-edge' | 'element-center'
  elemBounds?: BoundsRect
}

export type SnapTargetList = SnapTarget[]

const ROTATE_SNAP_DEG = 5
const ROTATE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315, 360]

// ─── Precompute targets (call once on mousedown) ──────────────────────────────

export function computeSnapTargets(
  slide: Slide,
  selectedIds: string[],
  settings: SnapSettings,
): SnapTargetList {
  const targets: SnapTarget[] = []
  if (!settings.enabled) return targets

  if (settings.toCanvas) {
    for (const v of [0, 100] as const) {
      targets.push({ axis: 'x', value: v, source: 'canvas-edge' })
      targets.push({ axis: 'y', value: v, source: 'canvas-edge' })
    }
    targets.push({ axis: 'x', value: 50, source: 'canvas-center' })
    targets.push({ axis: 'y', value: 50, source: 'canvas-center' })
  }

  if (settings.toElements) {
    for (const el of slide.elements) {
      if (selectedIds.includes(el.id) || el.hidden) continue
      const b: BoundsRect = { x: el.x, y: el.y, w: el.width, h: el.height }
      targets.push({ axis: 'x', value: el.x,               source: 'element-edge',   elemBounds: b })
      targets.push({ axis: 'x', value: el.x + el.width,    source: 'element-edge',   elemBounds: b })
      targets.push({ axis: 'x', value: el.x + el.width / 2, source: 'element-center', elemBounds: b })
      targets.push({ axis: 'y', value: el.y,               source: 'element-edge',   elemBounds: b })
      targets.push({ axis: 'y', value: el.y + el.height,   source: 'element-edge',   elemBounds: b })
      targets.push({ axis: 'y', value: el.y + el.height / 2, source: 'element-center', elemBounds: b })
    }
  }

  return targets
}

// ─── Guide line extent calculation ───────────────────────────────────────────

const EXT = 1.5  // % extension past element outer edges

function vExtent(target: SnapTarget, drag: BoundsRect): { start: number; end: number } {
  if (target.source === 'canvas-center' || target.source === 'canvas-edge' && target.value === 0 || target.source === 'canvas-edge' && target.value === 100) {
    // Canvas center vertical: full height
    if (target.source === 'canvas-center') return { start: 0, end: 100 }
    // Canvas edge vertical: span dragged element height
    return { start: drag.y - EXT, end: drag.y + drag.h + EXT }
  }
  if (target.source === 'canvas-edge') return { start: drag.y - EXT, end: drag.y + drag.h + EXT }
  const eb = target.elemBounds!
  return {
    start: Math.min(drag.y, eb.y) - EXT,
    end: Math.max(drag.y + drag.h, eb.y + eb.h) + EXT,
  }
}

function hExtent(target: SnapTarget, drag: BoundsRect): { start: number; end: number } {
  if (target.source === 'canvas-center') return { start: 0, end: 100 }
  if (target.source === 'canvas-edge') return { start: drag.x - EXT, end: drag.x + drag.w + EXT }
  const eb = target.elemBounds!
  return {
    start: Math.min(drag.x, eb.x) - EXT,
    end: Math.max(drag.x + drag.w, eb.x + eb.w) + EXT,
  }
}

// ─── Move snap ────────────────────────────────────────────────────────────────

export function applyMoveSnap(
  drag: BoundsRect,
  targets: SnapTargetList,
  threshold: number,
  slide: Slide,
  selectedIds: string[],
  settings: SnapSettings,
): { x: number; y: number; guides: SnapGuide[]; spacing: SpacingIndicator[] } {
  const { x, y, w, h } = drag
  const guides: SnapGuide[] = []
  const spacing: SpacingIndicator[] = []

  // X-axis: try snapping left edge, center, right edge of drag to x targets
  const xCands = [
    { v: x,       off: 0 },
    { v: x + w/2, off: w/2 },
    { v: x + w,   off: w },
  ]
  let bestX: { dist: number; value: number; off: number; target: SnapTarget } | null = null
  for (const t of targets) {
    if (t.axis !== 'x') continue
    for (const c of xCands) {
      const d = Math.abs(c.v - t.value)
      if (d < threshold && (!bestX || d < bestX.dist))
        bestX = { dist: d, value: t.value, off: c.off, target: t }
    }
  }
  let snapX = x
  if (bestX) {
    snapX = bestX.value - bestX.off
    const ext = vExtent(bestX.target, { x: snapX, y, w, h })
    guides.push({ type: 'v', pos: bestX.value, start: ext.start, end: ext.end })
  }

  // Y-axis: try snapping top, center, bottom
  const yCands = [
    { v: y,       off: 0 },
    { v: y + h/2, off: h/2 },
    { v: y + h,   off: h },
  ]
  let bestY: { dist: number; value: number; off: number; target: SnapTarget } | null = null
  for (const t of targets) {
    if (t.axis !== 'y') continue
    for (const c of yCands) {
      const d = Math.abs(c.v - t.value)
      if (d < threshold && (!bestY || d < bestY.dist))
        bestY = { dist: d, value: t.value, off: c.off, target: t }
    }
  }
  let snapY = y
  if (bestY) {
    snapY = bestY.value - bestY.off
    const ext = hExtent(bestY.target, { x: snapX, y: snapY, w, h })
    guides.push({ type: 'h', pos: bestY.value, start: ext.start, end: ext.end })
  }

  // Equal spacing (only when no edge/center snap won on that axis)
  if (settings.equalSpacing) {
    const others = slide.elements.filter((el) => !selectedIds.includes(el.id) && !el.hidden)
    if (!bestX) {
      const r = computeEqualSpacingH({ x: snapX, y: snapY, w, h }, others, threshold)
      if (r) { snapX = r.x; spacing.push(...r.indicators) }
    }
    if (!bestY) {
      const r = computeEqualSpacingV({ x: snapX, y: snapY, w, h }, others, threshold)
      if (r) { snapY = r.y; spacing.push(...r.indicators) }
    }
  }

  return { x: snapX, y: snapY, guides, spacing }
}

// ─── Equal spacing helpers ────────────────────────────────────────────────────

function computeEqualSpacingH(
  drag: BoundsRect,
  others: Array<{ x: number; y: number; width: number; height: number }>,
  threshold: number,
): { x: number; indicators: SpacingIndicator[] } | null {
  const sorted = [...others].sort((a, b) => a.x - b.x)
  const midY = drag.y + drag.h / 2

  for (let i = 0; i < sorted.length; i++) {
    const A = sorted[i]!
    for (let j = i + 1; j < sorted.length; j++) {
      const B = sorted[j]!
      const gap = B.x - (A.x + A.width)
      if (gap < 0.5) continue

      // D to the right of B
      const rightX = B.x + B.width + gap
      if (Math.abs(drag.x - rightX) < threshold) {
        return {
          x: rightX,
          indicators: [
            { type: 'h', pos: midY, start: A.x + A.width, end: B.x },
            { type: 'h', pos: midY, start: B.x + B.width, end: rightX },
          ],
        }
      }

      // D to the left of A
      const leftX = A.x - gap - drag.w
      if (Math.abs(drag.x - leftX) < threshold) {
        return {
          x: leftX,
          indicators: [
            { type: 'h', pos: midY, start: leftX + drag.w, end: A.x },
            { type: 'h', pos: midY, start: A.x + A.width, end: B.x },
          ],
        }
      }

      // D between A and B
      const avail = gap - drag.w
      if (avail >= 0) {
        const eachGap = avail / 2
        const betweenX = A.x + A.width + eachGap
        if (Math.abs(drag.x - betweenX) < threshold) {
          return {
            x: betweenX,
            indicators: [
              { type: 'h', pos: midY, start: A.x + A.width, end: betweenX },
              { type: 'h', pos: midY, start: betweenX + drag.w, end: B.x },
            ],
          }
        }
      }
    }
  }
  return null
}

function computeEqualSpacingV(
  drag: BoundsRect,
  others: Array<{ x: number; y: number; width: number; height: number }>,
  threshold: number,
): { y: number; indicators: SpacingIndicator[] } | null {
  const sorted = [...others].sort((a, b) => a.y - b.y)
  const midX = drag.x + drag.w / 2

  for (let i = 0; i < sorted.length; i++) {
    const A = sorted[i]!
    for (let j = i + 1; j < sorted.length; j++) {
      const B = sorted[j]!
      const gap = B.y - (A.y + A.height)
      if (gap < 0.5) continue

      const bottomY = B.y + B.height + gap
      if (Math.abs(drag.y - bottomY) < threshold) {
        return {
          y: bottomY,
          indicators: [
            { type: 'v', pos: midX, start: A.y + A.height, end: B.y },
            { type: 'v', pos: midX, start: B.y + B.height, end: bottomY },
          ],
        }
      }

      const topY = A.y - gap - drag.h
      if (Math.abs(drag.y - topY) < threshold) {
        return {
          y: topY,
          indicators: [
            { type: 'v', pos: midX, start: topY + drag.h, end: A.y },
            { type: 'v', pos: midX, start: A.y + A.height, end: B.y },
          ],
        }
      }

      const avail = gap - drag.h
      if (avail >= 0) {
        const eachGap = avail / 2
        const betweenY = A.y + A.height + eachGap
        if (Math.abs(drag.y - betweenY) < threshold) {
          return {
            y: betweenY,
            indicators: [
              { type: 'v', pos: midX, start: A.y + A.height, end: betweenY },
              { type: 'v', pos: midX, start: betweenY + drag.h, end: B.y },
            ],
          }
        }
      }
    }
  }
  return null
}

// ─── Resize snap ──────────────────────────────────────────────────────────────

export function applyResizeSnap(
  handle: HandleType,
  bounds: { x: number; y: number; width: number; height: number },
  targets: SnapTargetList,
  threshold: number,
): { bounds: { x: number; y: number; width: number; height: number }; guides: SnapGuide[] } {
  let { x, y, width, height } = bounds
  const guides: SnapGuide[] = []

  const movesLeft   = handle === 'nw' || handle === 'w' || handle === 'sw'
  const movesRight  = handle === 'ne' || handle === 'e' || handle === 'se'
  const movesTop    = handle === 'nw' || handle === 'n' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 's' || handle === 'se'

  if (movesRight) {
    let best: { dist: number; value: number; target: SnapTarget } | null = null
    const edge = x + width
    for (const t of targets) {
      if (t.axis !== 'x') continue
      const d = Math.abs(edge - t.value)
      if (d < threshold && (!best || d < best.dist)) best = { dist: d, value: t.value, target: t }
    }
    if (best) {
      width = best.value - x
      const ext = vExtent(best.target, { x, y, w: width, h: height })
      guides.push({ type: 'v', pos: best.value, start: ext.start, end: ext.end })
    }
  } else if (movesLeft) {
    let best: { dist: number; value: number; target: SnapTarget } | null = null
    for (const t of targets) {
      if (t.axis !== 'x') continue
      const d = Math.abs(x - t.value)
      if (d < threshold && (!best || d < best.dist)) best = { dist: d, value: t.value, target: t }
    }
    if (best) {
      const oldRight = x + width
      x = best.value
      width = oldRight - x
      const ext = vExtent(best.target, { x, y, w: width, h: height })
      guides.push({ type: 'v', pos: best.value, start: ext.start, end: ext.end })
    }
  }

  if (movesBottom) {
    let best: { dist: number; value: number; target: SnapTarget } | null = null
    const edge = y + height
    for (const t of targets) {
      if (t.axis !== 'y') continue
      const d = Math.abs(edge - t.value)
      if (d < threshold && (!best || d < best.dist)) best = { dist: d, value: t.value, target: t }
    }
    if (best) {
      height = best.value - y
      const ext = hExtent(best.target, { x, y, w: width, h: height })
      guides.push({ type: 'h', pos: best.value, start: ext.start, end: ext.end })
    }
  } else if (movesTop) {
    let best: { dist: number; value: number; target: SnapTarget } | null = null
    for (const t of targets) {
      if (t.axis !== 'y') continue
      const d = Math.abs(y - t.value)
      if (d < threshold && (!best || d < best.dist)) best = { dist: d, value: t.value, target: t }
    }
    if (best) {
      const oldBottom = y + height
      y = best.value
      height = oldBottom - y
      const ext = hExtent(best.target, { x, y, w: width, h: height })
      guides.push({ type: 'h', pos: best.value, start: ext.start, end: ext.end })
    }
  }

  return { bounds: { x, y, width, height }, guides }
}

// ─── Rotation snap ────────────────────────────────────────────────────────────

export function applyRotationSnap(angle: number): number {
  // Normalize to [0, 360)
  const norm = ((angle % 360) + 360) % 360
  for (const a of ROTATE_ANGLES) {
    const diff = Math.abs(norm - a)
    const wrapped = Math.min(diff, 360 - diff)
    if (wrapped < ROTATE_SNAP_DEG) return a === 360 ? 0 : a
  }
  return norm
}

// ─── Snap threshold from canvas pixel width ───────────────────────────────────

export const SNAP_THRESHOLD_PX = 8

export function snapThreshold(canvasWidthPx: number): number {
  return (SNAP_THRESHOLD_PX / canvasWidthPx) * 100
}
