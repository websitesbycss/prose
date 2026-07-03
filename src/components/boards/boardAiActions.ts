// Executes validated prose-actions against the Excalidraw board. Only called
// after the user clicks Apply on an action card — validation lives in
// src/lib/ai/proseActions.ts.
//
// The model lays nodes out in its own coordinate space; the whole drawing is
// translated so its bounding box lands centered in the user's viewport.
import type { BoardAction, BoardNodeSpec } from '@/lib/ai/proseActions'
import { BOARD_PALETTE } from '@/lib/ai/proseActions'
import type { AiActionHandler, AiActionResult } from '@/components/editor/AiPanel'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyElement = Record<string, any>

export interface BoardActionDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getApi(): any | null
  addFileCard(fileId: string, fileType: string, title: string, wordCount: number, preview: string): void
  scheduleSave(): void
}

const STICKY_COLORS = [BOARD_PALETTE.yellow!, BOARD_PALETTE.orange!, BOARD_PALETTE.green!, BOARD_PALETTE.blue!, BOARD_PALETTE.red!, BOARD_PALETTE.purple!]

const DEFAULT_SIZES: Record<BoardNodeSpec['kind'], { w: number; h: number }> = {
  sticky: { w: 200, h: 140 },
  rect: { w: 220, h: 110 },
  ellipse: { w: 220, h: 120 },
  diamond: { w: 240, h: 140 },
  text: { w: 260, h: 40 },
}

function seed(): number {
  return Math.floor(Math.random() * 2 ** 31)
}

function baseProps(now: number): AnyElement {
  return {
    angle: 0,
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    updated: now,
    isDeleted: false,
    link: null,
    locked: false,
    seed: seed(),
    version: 1,
    versionNonce: seed(),
    index: null,
  }
}

function boundText(
  containerId: string, text: string, x: number, y: number, w: number, h: number,
  now: number, fontSize = 15,
): AnyElement {
  return {
    ...baseProps(now),
    type: 'text',
    id: crypto.randomUUID(),
    x: x + 10, y: y + 10, width: w - 20, height: h - 20,
    strokeColor: '#1e1e1e',
    backgroundColor: 'transparent',
    boundElements: null,
    containerId,
    text,
    fontSize,
    fontFamily: 1,
    textAlign: 'center',
    verticalAlign: 'middle',
    autoResize: true,
    lineHeight: 1.25,
  }
}

interface PlacedNode {
  spec: BoardNodeSpec
  x: number
  y: number
  w: number
  h: number
  shapeId: string
}

function makeNodeElements(node: PlacedNode, index: number, now: number): AnyElement[] {
  const { spec, x, y, w, h, shapeId } = node

  if (spec.kind === 'text') {
    return [{
      ...baseProps(now),
      type: 'text',
      id: shapeId,
      x, y, width: w, height: h,
      strokeColor: '#1e1e1e',
      backgroundColor: 'transparent',
      boundElements: [],
      containerId: null,
      text: spec.text ?? '',
      fontSize: 20,
      fontFamily: 1,
      textAlign: 'left',
      verticalAlign: 'top',
      autoResize: true,
      lineHeight: 1.25,
    }]
  }

  const excalidrawType = spec.kind === 'sticky' ? 'rectangle' : spec.kind === 'rect' ? 'rectangle' : spec.kind
  const isSticky = spec.kind === 'sticky'
  const fill = spec.color ?? (isSticky ? STICKY_COLORS[index % STICKY_COLORS.length]! : 'transparent')

  const elements: AnyElement[] = []
  const textEl = spec.text ? boundText(shapeId, spec.text, x, y, w, h, now) : null

  elements.push({
    ...baseProps(now),
    type: excalidrawType,
    id: shapeId,
    x, y, width: w, height: h,
    strokeColor: isSticky ? 'transparent' : '#1e1e1e',
    backgroundColor: fill,
    boundElements: textEl ? [{ type: 'text', id: textEl.id }] : [],
    roundness: spec.kind === 'diamond' ? null : { type: 3 },
  })
  if (textEl) elements.push(textEl)
  return elements
}

// Point where the segment from a box's center toward `target` exits the box —
// arrows anchor there instead of at centers so they don't start underneath
// the shape.
function edgePoint(box: { x: number; y: number; w: number; h: number }, target: { cx: number; cy: number }): { x: number; y: number } {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = target.cx - cx
  const dy = target.cy - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const scaleX = dx !== 0 ? (box.w / 2) / Math.abs(dx) : Infinity
  const scaleY = dy !== 0 ? (box.h / 2) / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)
  return { x: cx + dx * scale, y: cy + dy * scale }
}

export async function applyBoardActions(actions: BoardAction[], deps: BoardActionDeps): Promise<AiActionResult> {
  const api = deps.getApi()
  if (!api) return { ok: false, message: 'Board is not ready yet.' }

  const failures: string[] = []
  let appliedCount = 0
  const now = Date.now()

  // ── Collect nodes across all addNodes actions ──────────────────────────────
  const specs: BoardNodeSpec[] = []
  for (const action of actions) {
    if (action.type === 'addNodes') specs.push(...action.nodes)
  }

  const placed = new Map<string, PlacedNode>()
  if (specs.length > 0) {
    // Model-space bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    const sized = specs.map((spec) => {
      const def = DEFAULT_SIZES[spec.kind]
      const w = spec.w ?? def.w
      const h = spec.h ?? def.h
      minX = Math.min(minX, spec.x)
      minY = Math.min(minY, spec.y)
      maxX = Math.max(maxX, spec.x + w)
      maxY = Math.max(maxY, spec.y + h)
      return { spec, w, h }
    })

    // Translate so the drawing's center lands on the viewport center.
    const appState = api.getAppState()
    const viewCx = -appState.scrollX + (appState.width ?? 800) / 2 / appState.zoom.value
    const viewCy = -appState.scrollY + (appState.height ?? 600) / 2 / appState.zoom.value
    const offsetX = viewCx - (minX + maxX) / 2
    const offsetY = viewCy - (minY + maxY) / 2

    for (const { spec, w, h } of sized) {
      placed.set(spec.ref, {
        spec,
        x: spec.x + offsetX,
        y: spec.y + offsetY,
        w, h,
        shapeId: crypto.randomUUID(),
      })
    }
  }

  const newElements: AnyElement[] = []
  const nodeElementsByRef = new Map<string, AnyElement>()
  let nodeIndex = 0
  for (const node of placed.values()) {
    const els = makeNodeElements(node, nodeIndex++, now)
    newElements.push(...els)
    nodeElementsByRef.set(node.spec.ref, els[0]!)
  }
  if (placed.size > 0) appliedCount++

  // ── Arrows ──────────────────────────────────────────────────────────────────
  for (const action of actions) {
    if (action.type !== 'connect') continue
    let drewAny = false
    for (const arrow of action.arrows) {
      const from = placed.get(arrow.from)
      const to = placed.get(arrow.to)
      if (!from || !to) {
        failures.push(`Arrow references unknown node "${!from ? arrow.from : arrow.to}"`)
        continue
      }
      const fromCenter = { cx: from.x + from.w / 2, cy: from.y + from.h / 2 }
      const toCenter = { cx: to.x + to.w / 2, cy: to.y + to.h / 2 }
      const start = edgePoint(from, toCenter)
      const end = edgePoint(to, fromCenter)
      const dx = end.x - start.x
      const dy = end.y - start.y

      const arrowId = crypto.randomUUID()
      const labelEl = arrow.label
        ? {
            ...boundText(arrowId, arrow.label, start.x + dx / 2 - 40, start.y + dy / 2 - 12, 80, 24, now, 13),
          }
        : null

      newElements.push({
        ...baseProps(now),
        type: 'arrow',
        id: arrowId,
        x: start.x, y: start.y,
        width: Math.abs(dx), height: Math.abs(dy),
        strokeColor: '#1e1e1e',
        backgroundColor: 'transparent',
        boundElements: labelEl ? [{ type: 'text', id: labelEl.id }] : null,
        points: [[0, 0], [dx, dy]],
        lastCommittedPoint: null,
        startBinding: { elementId: from.shapeId, focus: 0, gap: 4 },
        endBinding: { elementId: to.shapeId, focus: 0, gap: 4 },
        startArrowhead: null,
        endArrowhead: arrow.style === 'arrow' ? 'arrow' : null,
        elbowed: false,
        roundness: { type: 2 },
      })
      if (labelEl) newElements.push(labelEl)

      // Register the arrow on both shapes so Excalidraw keeps the binding
      // alive when the user later moves them.
      for (const ref of [arrow.from, arrow.to]) {
        const shape = nodeElementsByRef.get(ref)
        if (shape && shape.type !== 'text') {
          shape.boundElements = [...(shape.boundElements ?? []), { type: 'arrow', id: arrowId }]
        }
      }
      drewAny = true
    }
    if (drewAny) appliedCount++
  }

  if (newElements.length > 0) {
    const existing = api.getSceneElements()
    api.updateScene({ elements: [...existing, ...newElements] })
    deps.scheduleSave()
  }

  // ── File cards ──────────────────────────────────────────────────────────────
  // Titles are resolved against the real library — the model can only name
  // files, never inject ids or content.
  const fileCardActions = actions.filter((a): a is Extract<BoardAction, { type: 'addFileCard' }> => a.type === 'addFileCard')
  if (fileCardActions.length > 0) {
    try {
      const docs = await window.prose.documents.getAll()
      for (const action of fileCardActions) {
        const wanted = action.title.trim().toLowerCase()
        const match = docs.find((d) => d.title.trim().toLowerCase() === wanted)
          ?? docs.find((d) => d.title.trim().toLowerCase().includes(wanted))
        if (!match) {
          failures.push(`No file named "${action.title}" found`)
          continue
        }
        let preview = ''
        try {
          const full = await window.prose.documents.getById(match.id)
          const content = typeof full?.content === 'string' ? JSON.parse(full.content) : full?.content
          if (content?.content) {
            const texts: string[] = []
            const walk = (node: { text?: string; content?: unknown[] }): void => {
              if (node.text) texts.push(node.text)
              if (node.content) node.content.forEach((n) => walk(n as { text?: string; content?: unknown[] }))
            }
            walk(content)
            preview = texts.join(' ').slice(0, 80)
          }
        } catch { /* preview is best-effort */ }
        deps.addFileCard(
          match.id,
          (match as { fileType?: string }).fileType ?? 'document',
          match.title,
          (match as { wordCount?: number }).wordCount ?? 0,
          preview,
        )
        appliedCount++
      }
    } catch {
      failures.push('Could not read the file library')
    }
  }

  if (appliedCount === 0) {
    return { ok: false, message: failures[0] ?? 'Nothing could be applied.' }
  }
  return {
    ok: true,
    ...(failures.length > 0 ? { message: `Applied with ${failures.length} skipped (${failures[0]})` } : {}),
  }
}

export function createBoardActionHandler(deps: BoardActionDeps): AiActionHandler {
  return {
    surface: 'board',
    apply: (actions) => applyBoardActions(actions as BoardAction[], deps),
  }
}
