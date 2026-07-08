// ── Prose AI action protocol ──────────────────────────────────────────────────
// The AI emits a fenced ```prose-actions block containing {"actions":[...]} in
// its chat responses. This module extracts that block and validates every
// action against a strict per-surface whitelist before anything is allowed to
// touch an editor. Nothing in here executes actions — execution lives next to
// each editor (slideActionExecutor, sheetAiActions, boardAiActions) and only
// runs after the user clicks Apply.
//
// Security invariants enforced here:
// - Unknown action types and unknown fields are dropped, never passed through.
// - Every number is clamped to a sane range; every string is length-capped.
// - Colors must be hex (#rgb / #rrggbb) or a named palette entry.
// - Formulas must start with "=" and contain no control characters.
// - SVG content is only carried as a string here; the slide executor runs it
//   through DOMPurify before it can become an element.
// - No URLs, file paths, or ids invented by the model are trusted: file cards
//   are resolved by title against the real library at execution time.

export type ActionSurface = 'slides' | 'sheet' | 'board'

// ── Shared validation helpers ─────────────────────────────────────────────────

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function str(v: unknown, maxLen: number): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/\x00/g, '').trim()
  if (!cleaned) return null
  return cleaned.slice(0, maxLen)
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

function optNum(v: unknown, min: number, max: number): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  if (!Number.isFinite(n)) return undefined
  return Math.max(min, Math.min(max, n))
}

function bool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function color(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const c = v.trim()
  return HEX_COLOR.test(c) ? c : undefined
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | undefined {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : undefined
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// ── A1-notation helpers (sheets) ──────────────────────────────────────────────

export interface CellRef { row: number; col: number }
export interface CellRange { start: CellRef; end: CellRef }

const MAX_ROW = 4999
const MAX_COL = 199

export function parseCellRef(ref: unknown): CellRef | null {
  if (typeof ref !== 'string') return null
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,5})$/.exec(ref.trim())
  if (!m) return null
  let col = 0
  const letters = m[1]!.toUpperCase()
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64)
  const row = parseInt(m[2]!, 10) - 1
  col -= 1
  if (row < 0 || row > MAX_ROW || col < 0 || col > MAX_COL) return null
  return { row, col }
}

export function parseCellRange(range: unknown): CellRange | null {
  if (typeof range !== 'string') return null
  const parts = range.trim().split(':')
  if (parts.length === 1) {
    const single = parseCellRef(parts[0])
    return single ? { start: single, end: single } : null
  }
  if (parts.length !== 2) return null
  const a = parseCellRef(parts[0])
  const b = parseCellRef(parts[1])
  if (!a || !b) return null
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  }
}

export function colToLetter(col: number): string {
  let s = ''
  let c = col + 1
  while (c > 0) {
    const rem = (c - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    c = Math.floor((c - 1) / 26)
  }
  return s
}

export function cellRefToA1(ref: CellRef): string {
  return `${colToLetter(ref.col)}${ref.row + 1}`
}

// Formula safety: must start with "=", no control chars, capped length.
// FortuneSheet formulas evaluate locally with no network/file access, so the
// concern is only garbage input, not exfiltration.
function sanitizeFormula(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const f = v.trim()
  if (!f.startsWith('=') || f.length < 2 || f.length > 500) return null
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(f)) return null
  return f
}

function cellValue(v: unknown): string | number | boolean | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'boolean') return v
  // eslint-disable-next-line no-control-regex
  if (typeof v === 'string') return v.replace(/\x00/g, '').slice(0, 500)
  return null
}

// ── Slides action types ───────────────────────────────────────────────────────

export const SLIDE_SHAPE_TYPES = [
  'rect', 'roundRect', 'ellipse', 'triangle', 'rightTriangle',
  'parallelogram', 'trapezoid',
  'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'arrow-double',
  'line', 'speech-bubble', 'thought-bubble',
  'star-4', 'star-5', 'star-6', 'banner', 'wave',
  'flowchart-process', 'flowchart-decision', 'flowchart-terminal',
  'flowchart-data', 'flowchart-connector',
] as const
export type SlideShapeSpecType = (typeof SLIDE_SHAPE_TYPES)[number]

export const TEXT_ROLES = ['title', 'subtitle', 'heading', 'body', 'caption'] as const
export type TextRole = (typeof TEXT_ROLES)[number]

export interface SlideTextElementSpec {
  kind: 'text'
  text: string
  role: TextRole
  x?: number; y?: number; w?: number; h?: number
  align?: 'left' | 'center' | 'right'
  color?: string
  bold?: boolean
  fontSize?: number
}

export interface SlideShapeElementSpec {
  kind: 'shape'
  shape: SlideShapeSpecType
  x: number; y: number; w: number; h: number
  fill?: string
  text?: string
  textColor?: string
  borderColor?: string
  cornerRadius?: number
  opacity?: number
}

export interface SlideTableElementSpec {
  kind: 'table'
  headers?: string[]
  rows: string[][]
  x?: number; y?: number; w?: number; h?: number
  headerColor?: string
}

export interface SlideCodeElementSpec {
  kind: 'code'
  code: string
  language?: string
  x?: number; y?: number; w?: number; h?: number
}

export interface SlideEquationElementSpec {
  kind: 'equation'
  latex: string
  x?: number; y?: number; w?: number; h?: number
  color?: string
}

export interface SlideSvgElementSpec {
  kind: 'svg'
  svg: string
  description?: string
  x?: number; y?: number; w?: number; h?: number
}

export interface SlideChartElementSpec {
  kind: 'chart'
  chartType: (typeof SHEET_CHART_TYPES)[number]
  title?: string
  labels: string[]
  datasets: { label: string; data: (number | null)[] }[]
  xAxisLabel?: string
  yAxisLabel?: string
  x?: number; y?: number; w?: number; h?: number
}

export type SlideElementSpec =
  | SlideTextElementSpec
  | SlideShapeElementSpec
  | SlideTableElementSpec
  | SlideCodeElementSpec
  | SlideEquationElementSpec
  | SlideSvgElementSpec
  | SlideChartElementSpec

export const SLIDE_LAYOUT_SPECS = ['title', 'title-content', 'two-column', 'section-header', 'quote', 'blank'] as const
export type SlideLayoutSpec = (typeof SLIDE_LAYOUT_SPECS)[number]

export interface SlideSpec {
  layout: SlideLayoutSpec
  title?: string
  subtitle?: string
  bullets?: string[]
  body?: string
  left?: string[]
  right?: string[]
  leftTitle?: string
  rightTitle?: string
  quote?: string
  attribution?: string
  notes?: string
  background?: string
  elements?: SlideElementSpec[]
}

export const ANIMATION_EFFECTS = [
  'appear', 'fade-in', 'fade-out', 'fly-in', 'fly-out',
  'zoom-in', 'zoom-out', 'bounce-in', 'bounce-out', 'wipe',
] as const

export const TRANSITION_TYPES = ['none', 'fade', 'slide', 'push', 'zoom', 'flip', 'dissolve'] as const
export const DIRECTIONS = ['left', 'right', 'up', 'down'] as const
export const ANIMATION_TRIGGERS = ['click', 'with-previous', 'after-previous'] as const

export interface SlidesAddSlideAction {
  type: 'addSlide'
  slide: SlideSpec
}

export interface SlidesAddElementAction {
  type: 'addElement'
  element: SlideElementSpec
}

export interface SlidesUpdateTextAction {
  type: 'updateText'
  find: string
  replace: string
}

export interface SlidesSetNotesAction {
  type: 'setNotes'
  notes: string
}

export interface SlidesSetBackgroundAction {
  type: 'setBackground'
  color: string
}

export interface SlidesAnimateAction {
  type: 'animate'
  /** Element id (from context) or a text snippet contained in the target element. */
  target: string
  effect: (typeof ANIMATION_EFFECTS)[number]
  duration?: number
  delay?: number
  trigger?: (typeof ANIMATION_TRIGGERS)[number]
  direction?: (typeof DIRECTIONS)[number]
}

export interface SlidesSetTransitionAction {
  type: 'setTransition'
  transition: (typeof TRANSITION_TYPES)[number]
  duration?: number
  direction?: (typeof DIRECTIONS)[number]
}

export type SlidesAction =
  | SlidesAddSlideAction
  | SlidesAddElementAction
  | SlidesUpdateTextAction
  | SlidesSetNotesAction
  | SlidesSetBackgroundAction
  | SlidesAnimateAction
  | SlidesSetTransitionAction

// ── Sheet action types ────────────────────────────────────────────────────────

export interface SheetSetCellsAction {
  type: 'setCells'
  cells: Array<{ ref: CellRef; a1: string; value?: string | number | boolean; formula?: string }>
}

export interface SheetSetRangeAction {
  type: 'setRange'
  start: CellRef
  /** Strings starting with "=" are treated as formulas. */
  values: Array<Array<string | number | boolean | null>>
}

export interface SheetFormatAction {
  type: 'format'
  range: CellRange
  a1: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  textColor?: string
  bgColor?: string
  fontSize?: number
  align?: 'left' | 'center' | 'right'
  wrap?: boolean
}

export interface SheetMergeAction {
  type: 'merge'
  range: CellRange
  a1: string
}

export const SHEET_CHART_TYPES = ['bar', 'barHorizontal', 'line', 'area', 'pie', 'doughnut', 'scatter', 'radar'] as const

export interface SheetAddChartAction {
  type: 'addChart'
  chartType: (typeof SHEET_CHART_TYPES)[number]
  dataRange: string
  title: string
  xAxisLabel?: string
  yAxisLabel?: string
}

export type SheetAction =
  | SheetSetCellsAction
  | SheetSetRangeAction
  | SheetFormatAction
  | SheetMergeAction
  | SheetAddChartAction

// ── Board action types ────────────────────────────────────────────────────────

export const BOARD_NODE_KINDS = ['sticky', 'rect', 'ellipse', 'diamond', 'text'] as const
export type BoardNodeKind = (typeof BOARD_NODE_KINDS)[number]

export interface BoardNodeSpec {
  ref: string
  kind: BoardNodeKind
  text?: string
  x: number
  y: number
  w?: number
  h?: number
  color?: string
}

export interface BoardArrowSpec {
  from: string
  to: string
  label?: string
  style: 'arrow' | 'line'
}

export interface BoardAddNodesAction {
  type: 'addNodes'
  nodes: BoardNodeSpec[]
}

export interface BoardConnectAction {
  type: 'connect'
  arrows: BoardArrowSpec[]
}

export interface BoardAddFileCardAction {
  type: 'addFileCard'
  /** File title — resolved against the real library at execution time. */
  title: string
}

export type BoardAction = BoardAddNodesAction | BoardConnectAction | BoardAddFileCardAction

export type ProseAction = SlidesAction | SheetAction | BoardAction

export interface ValidatedActions {
  surface: ActionSurface
  actions: ProseAction[]
  /** Human-readable notes about anything that was dropped during validation. */
  warnings: string[]
}

// ── Block extraction ──────────────────────────────────────────────────────────

const ACTION_FENCE = /```(?:prose-actions|prose_actions)\s*\n([\s\S]*?)```/i
// Fallback: a ```json fence whose body contains an "actions" array.
const JSON_FENCE = /```json\s*\n([\s\S]*?)```/i

interface RawBlock { json: unknown; raw: string }

function tryParse(text: string): unknown {
  try { return JSON.parse(text) } catch { /* fall through */ }
  // Model may have truncated slightly or added trailing commas — try to
  // recover the outermost object.
  const first = text.indexOf('{')
  const last = text.lastIndexOf('}')
  if (first !== -1 && last > first) {
    const slice = text.slice(first, last + 1).replace(/,\s*([\]}])/g, '$1')
    try { return JSON.parse(slice) } catch { /* give up */ }
  }
  return null
}

/** Finds the action block in an assistant message. Returns null if none. */
export function extractActionBlock(markdown: string): RawBlock | null {
  const fence = ACTION_FENCE.exec(markdown)
  if (fence?.[1]) {
    const json = tryParse(fence[1])
    if (isRecord(json) && Array.isArray(json.actions)) return { json, raw: fence[0] }
  }
  const jsonFence = JSON_FENCE.exec(markdown)
  if (jsonFence?.[1]) {
    const json = tryParse(jsonFence[1])
    if (isRecord(json) && Array.isArray(json.actions)) return { json, raw: jsonFence[0] }
  }
  // Whole-message JSON (model skipped the fence entirely)
  const trimmed = markdown.trim()
  if (trimmed.startsWith('{')) {
    const json = tryParse(trimmed)
    if (isRecord(json) && Array.isArray(json.actions)) return { json, raw: trimmed }
  }
  return null
}

/** Removes the action block from the display text (the card renders instead). */
export function stripActionBlock(markdown: string, raw: string): string {
  return markdown.replace(raw, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** True while a fenced action block has been opened but not yet closed (streaming). */
export function hasOpenActionFence(markdown: string): boolean {
  const openings = markdown.match(/```(?:prose-actions|prose_actions|json)/gi)?.length ?? 0
  const fences = markdown.match(/```/g)?.length ?? 0
  return openings > 0 && fences % 2 === 1
}

// ── Slides validation ─────────────────────────────────────────────────────────

const MAX_ACTIONS = 40
const MAX_ELEMENTS_PER_SLIDE = 15
const MAX_SLIDES_PER_BATCH = 20

function validateSlideElementSpec(raw: unknown, warnings: string[]): SlideElementSpec | null {
  if (!isRecord(raw)) return null
  const kind = oneOf(raw.kind ?? raw.type, ['text', 'shape', 'table', 'code', 'equation', 'svg', 'chart'] as const)
  if (!kind) { warnings.push('Dropped element with unknown kind'); return null }

  const x = optNum(raw.x, 0, 98)
  const y = optNum(raw.y, 0, 98)
  const w = optNum(raw.w ?? raw.width, 2, 100)
  const h = optNum(raw.h ?? raw.height, 2, 100)

  switch (kind) {
    case 'text': {
      const text = str(raw.text ?? raw.content, 2000)
      if (!text) return null
      return {
        kind, text,
        role: oneOf(raw.role, TEXT_ROLES) ?? 'body',
        x, y, w, h,
        align: oneOf(raw.align, ['left', 'center', 'right'] as const),
        color: color(raw.color),
        bold: bool(raw.bold),
        fontSize: optNum(raw.fontSize, 8, 120),
      }
    }
    case 'shape': {
      const shape = oneOf(raw.shape ?? raw.shapeType, SLIDE_SHAPE_TYPES)
      if (!shape) { warnings.push('Dropped shape with unknown type'); return null }
      return {
        kind, shape,
        x: x ?? 10, y: y ?? 10, w: w ?? 20, h: h ?? 20,
        fill: color(raw.fill),
        text: str(raw.text ?? raw.content, 500) ?? undefined,
        textColor: color(raw.textColor),
        borderColor: color(raw.borderColor ?? raw.border),
        cornerRadius: optNum(raw.cornerRadius, 0, 50),
        opacity: optNum(raw.opacity, 0.05, 1),
      }
    }
    case 'table': {
      if (!Array.isArray(raw.rows)) return null
      const rows: string[][] = []
      for (const r of raw.rows.slice(0, 20)) {
        if (!Array.isArray(r)) continue
        rows.push(r.slice(0, 8).map((c) => (typeof c === 'string' || typeof c === 'number') ? String(c).slice(0, 200) : ''))
      }
      if (rows.length === 0) return null
      const headers = Array.isArray(raw.headers)
        ? raw.headers.slice(0, 8).map((c: unknown) => (typeof c === 'string' || typeof c === 'number') ? String(c).slice(0, 200) : '')
        : undefined
      return { kind, rows, headers, x, y, w, h, headerColor: color(raw.headerColor) }
    }
    case 'code': {
      const code = str(raw.code ?? raw.text, 4000)
      if (!code) return null
      return { kind, code, language: str(raw.language, 30) ?? 'plaintext', x, y, w, h }
    }
    case 'equation': {
      const latex = str(raw.latex ?? raw.text, 1000)
      if (!latex) return null
      return { kind, latex, x, y, w, h, color: color(raw.color) }
    }
    case 'svg': {
      const svg = str(raw.svg ?? raw.content, 20000)
      if (!svg || !svg.trimStart().startsWith('<svg')) { warnings.push('Dropped invalid SVG element'); return null }
      return { kind, svg, description: str(raw.description, 300) ?? undefined, x, y, w, h }
    }
    case 'chart': {
      const chartType = oneOf(raw.chartType ?? raw.type, SHEET_CHART_TYPES)
      if (!chartType) { warnings.push('Dropped chart with unknown type'); return null }
      const labels = strArray(raw.labels, 50, 100) ?? []
      const datasets = validateChartDatasets(raw.datasets)
      if (datasets.length === 0) { warnings.push('Dropped chart with no valid data'); return null }
      return {
        kind, chartType, labels, datasets,
        title: str(raw.title, 150) ?? undefined,
        xAxisLabel: str(raw.xAxisLabel, 60) ?? undefined,
        yAxisLabel: str(raw.yAxisLabel, 60) ?? undefined,
        x, y, w, h,
      }
    }
  }
}

function validateChartDatasets(raw: unknown): { label: string; data: (number | null)[] }[] {
  if (!Array.isArray(raw)) return []
  const out: { label: string; data: (number | null)[] }[] = []
  for (const d of raw.slice(0, 8)) {
    if (!isRecord(d) || !Array.isArray(d.data)) continue
    const label = str(d.label, 60) ?? `Series ${out.length + 1}`
    const data = d.data
      .slice(0, 50)
      .map((v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null))
    out.push({ label, data })
  }
  return out
}

function strArray(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out = v
    .filter((s): s is string | number => typeof s === 'string' || typeof s === 'number')
    .map((s) => String(s).slice(0, maxLen))
    .filter((s) => s.trim())
    .slice(0, maxItems)
  return out.length > 0 ? out : undefined
}

function validateSlideSpec(raw: unknown, warnings: string[]): SlideSpec | null {
  if (!isRecord(raw)) return null
  const layout = oneOf(raw.layout, SLIDE_LAYOUT_SPECS) ?? 'title-content'
  const elementsRaw = Array.isArray(raw.elements) ? raw.elements.slice(0, MAX_ELEMENTS_PER_SLIDE) : []
  const elements: SlideElementSpec[] = []
  for (const el of elementsRaw) {
    const spec = validateSlideElementSpec(el, warnings)
    if (spec) elements.push(spec)
  }
  return {
    layout,
    title: str(raw.title, 300) ?? undefined,
    subtitle: str(raw.subtitle, 300) ?? undefined,
    bullets: strArray(raw.bullets ?? raw.content, 8, 300),
    body: str(raw.body, 3000) ?? undefined,
    left: strArray(raw.left, 8, 300),
    right: strArray(raw.right, 8, 300),
    leftTitle: str(raw.leftTitle, 120) ?? undefined,
    rightTitle: str(raw.rightTitle, 120) ?? undefined,
    quote: str(raw.quote, 600) ?? undefined,
    attribution: str(raw.attribution, 150) ?? undefined,
    notes: str(raw.notes ?? raw.speakerNotes, 2000) ?? undefined,
    background: color(raw.background ?? raw.backgroundColor),
    elements: elements.length > 0 ? elements : undefined,
  }
}

function validateSlidesAction(raw: Record<string, unknown>, warnings: string[]): SlidesAction | null {
  switch (raw.type) {
    case 'addSlide': {
      const slide = validateSlideSpec(raw.slide ?? raw, warnings)
      return slide ? { type: 'addSlide', slide } : null
    }
    case 'addElement': {
      const element = validateSlideElementSpec(raw.element ?? raw, warnings)
      return element ? { type: 'addElement', element } : null
    }
    case 'updateText': {
      const find = str(raw.find ?? raw.original, 1000)
      const replace = typeof (raw.replace ?? raw.improved) === 'string' ? String(raw.replace ?? raw.improved).slice(0, 2000) : null
      if (!find || replace === null) return null
      return { type: 'updateText', find, replace }
    }
    case 'setNotes': {
      const notes = str(raw.notes ?? raw.text, 4000)
      return notes !== null ? { type: 'setNotes', notes } : null
    }
    case 'setBackground': {
      const c = color(raw.color ?? raw.background)
      return c ? { type: 'setBackground', color: c } : null
    }
    case 'animate': {
      const target = str(raw.target ?? raw.elementId, 300)
      const effect = oneOf(raw.effect, ANIMATION_EFFECTS)
      if (!target || !effect) return null
      return {
        type: 'animate', target, effect,
        duration: optNum(raw.duration, 100, 5000),
        delay: optNum(raw.delay, 0, 5000),
        trigger: oneOf(raw.trigger, ANIMATION_TRIGGERS),
        direction: oneOf(raw.direction, DIRECTIONS),
      }
    }
    case 'setTransition': {
      const t = oneOf(raw.transition ?? raw.transitionType, TRANSITION_TYPES)
      if (!t) return null
      return {
        type: 'setTransition', transition: t,
        duration: optNum(raw.duration, 100, 2000),
        direction: oneOf(raw.direction, DIRECTIONS),
      }
    }
    default:
      warnings.push(`Dropped unknown slides action "${String(raw.type)}"`)
      return null
  }
}

// ── Sheet validation ──────────────────────────────────────────────────────────

function validateSheetAction(raw: Record<string, unknown>, warnings: string[]): SheetAction | null {
  switch (raw.type) {
    case 'setCells': {
      if (!Array.isArray(raw.cells)) return null
      const cells: SheetSetCellsAction['cells'] = []
      for (const c of raw.cells.slice(0, 500)) {
        if (!isRecord(c)) continue
        const ref = parseCellRef(c.ref ?? c.cell)
        if (!ref) { warnings.push(`Dropped cell with invalid ref "${String(c.ref ?? c.cell)}"`); continue }
        const formula = sanitizeFormula(c.formula)
        const rawValue = c.value
        // A "value" that looks like a formula is treated as one.
        const valueAsFormula = !formula && typeof rawValue === 'string' ? sanitizeFormula(rawValue) : null
        if (formula || valueAsFormula) {
          cells.push({ ref, a1: cellRefToA1(ref), formula: (formula ?? valueAsFormula)! })
        } else {
          const value = cellValue(rawValue)
          if (value === null) continue
          cells.push({ ref, a1: cellRefToA1(ref), value })
        }
      }
      return cells.length > 0 ? { type: 'setCells', cells } : null
    }
    case 'setRange': {
      const start = parseCellRef(raw.start ?? raw.ref ?? 'A1')
      if (!start || !Array.isArray(raw.values)) return null
      const values: SheetSetRangeAction['values'] = []
      for (const row of raw.values.slice(0, 200)) {
        if (!Array.isArray(row)) continue
        values.push(row.slice(0, 50).map((v) => {
          if (typeof v === 'string' && v.startsWith('=')) return sanitizeFormula(v) ?? ''
          return cellValue(v)
        }))
      }
      return values.length > 0 ? { type: 'setRange', start, values } : null
    }
    case 'format': {
      const range = parseCellRange(raw.range ?? raw.ref)
      if (!range) return null
      const a1 = typeof (raw.range ?? raw.ref) === 'string' ? String(raw.range ?? raw.ref) : cellRefToA1(range.start)
      return {
        type: 'format', range, a1,
        bold: bool(raw.bold),
        italic: bool(raw.italic),
        underline: bool(raw.underline),
        textColor: color(raw.textColor),
        bgColor: color(raw.bgColor ?? raw.backgroundColor ?? raw.fill),
        fontSize: optNum(raw.fontSize, 6, 96),
        align: oneOf(raw.align, ['left', 'center', 'right'] as const),
        wrap: bool(raw.wrap),
      }
    }
    case 'merge': {
      const range = parseCellRange(raw.range)
      if (!range || (range.start.row === range.end.row && range.start.col === range.end.col)) return null
      return { type: 'merge', range, a1: String(raw.range) }
    }
    case 'addChart': {
      const chartType = oneOf(raw.chartType ?? raw.chart, SHEET_CHART_TYPES)
      const rangeStr = str(raw.dataRange ?? raw.range, 30)
      if (!chartType || !rangeStr || !parseCellRange(rangeStr)) {
        warnings.push('Dropped chart with invalid type or data range')
        return null
      }
      return {
        type: 'addChart', chartType,
        dataRange: rangeStr,
        title: str(raw.title, 120) ?? '',
        xAxisLabel: str(raw.xAxisLabel, 60) ?? undefined,
        yAxisLabel: str(raw.yAxisLabel, 60) ?? undefined,
      }
    }
    default:
      warnings.push(`Dropped unknown sheet action "${String(raw.type)}"`)
      return null
  }
}

// ── Board validation ──────────────────────────────────────────────────────────

// Named palette the model can use instead of hex — friendlier for small models.
export const BOARD_PALETTE: Record<string, string> = {
  yellow: '#fff3a0',
  orange: '#ffd6a5',
  green: '#caffbf',
  blue: '#a0c4ff',
  red: '#ffadad',
  purple: '#bdb2ff',
  pink: '#ffc6ff',
  teal: '#9bf6e3',
  gray: '#e5e7eb',
  white: '#ffffff',
}

function boardColor(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const named = BOARD_PALETTE[v.trim().toLowerCase()]
  if (named) return named
  return color(v)
}

const BOARD_COORD_MAX = 4000

function validateBoardAction(raw: Record<string, unknown>, warnings: string[]): BoardAction | null {
  switch (raw.type) {
    case 'addNodes': {
      if (!Array.isArray(raw.nodes)) return null
      const nodes: BoardNodeSpec[] = []
      const seenRefs = new Set<string>()
      for (const n of raw.nodes.slice(0, 60)) {
        if (!isRecord(n)) continue
        const kind = oneOf(n.kind ?? n.shape, BOARD_NODE_KINDS) ?? 'sticky'
        let ref = str(n.ref ?? n.id, 40) ?? `n${nodes.length + 1}`
        while (seenRefs.has(ref)) ref = `${ref}_`
        seenRefs.add(ref)
        nodes.push({
          ref, kind,
          text: str(n.text ?? n.label ?? n.content, 600) ?? undefined,
          x: num(n.x, -BOARD_COORD_MAX, BOARD_COORD_MAX, 0),
          y: num(n.y, -BOARD_COORD_MAX, BOARD_COORD_MAX, 0),
          w: optNum(n.w ?? n.width, 20, 1200),
          h: optNum(n.h ?? n.height, 20, 1200),
          color: boardColor(n.color ?? n.fill),
        })
      }
      return nodes.length > 0 ? { type: 'addNodes', nodes } : null
    }
    case 'connect': {
      const rawArrows = Array.isArray(raw.arrows) ? raw.arrows : isRecord(raw.arrow) ? [raw.arrow] : null
      if (!rawArrows) return null
      const arrows: BoardArrowSpec[] = []
      for (const a of rawArrows.slice(0, 80)) {
        if (!isRecord(a)) continue
        const from = str(a.from ?? a.start, 40)
        const to = str(a.to ?? a.end, 40)
        if (!from || !to || from === to) continue
        arrows.push({
          from, to,
          label: str(a.label ?? a.text, 120) ?? undefined,
          style: oneOf(a.style, ['arrow', 'line'] as const) ?? 'arrow',
        })
      }
      return arrows.length > 0 ? { type: 'connect', arrows } : null
    }
    case 'addFileCard': {
      const title = str(raw.title ?? raw.file, 200)
      return title ? { type: 'addFileCard', title } : null
    }
    default:
      warnings.push(`Dropped unknown board action "${String(raw.type)}"`)
      return null
  }
}

// ── Top-level validation ──────────────────────────────────────────────────────

export function validateActions(json: unknown, surface: ActionSurface): ValidatedActions | null {
  if (!isRecord(json) || !Array.isArray(json.actions)) return null
  const warnings: string[] = []
  const actions: ProseAction[] = []
  let slideCount = 0

  for (const raw of json.actions.slice(0, MAX_ACTIONS)) {
    if (!isRecord(raw)) continue
    let validated: ProseAction | null = null
    if (surface === 'slides') {
      validated = validateSlidesAction(raw, warnings)
      if (validated?.type === 'addSlide') {
        slideCount++
        if (slideCount > MAX_SLIDES_PER_BATCH) { warnings.push('Slide limit reached'); continue }
      }
    } else if (surface === 'sheet') {
      validated = validateSheetAction(raw, warnings)
    } else {
      validated = validateBoardAction(raw, warnings)
    }
    if (validated) actions.push(validated)
  }

  if (actions.length === 0) return null
  return { surface, actions, warnings }
}

// ── Human-readable action summaries (for the Apply card) ─────────────────────

export function describeAction(action: ProseAction): string {
  switch (action.type) {
    // Slides
    case 'addSlide': {
      const title = action.slide.title ? ` — "${action.slide.title}"` : ''
      return `Add ${action.slide.layout} slide${title}`
    }
    case 'addElement': {
      const el = action.element
      if (el.kind === 'text') return `Add text: "${el.text.slice(0, 40)}${el.text.length > 40 ? '…' : ''}"`
      if (el.kind === 'shape') return `Add ${el.shape} shape${el.text ? ` ("${el.text.slice(0, 30)}")` : ''}`
      if (el.kind === 'table') return `Add ${el.rows.length}×${el.rows[0]?.length ?? 0} table`
      if (el.kind === 'code') return `Add ${el.language ?? ''} code block`
      if (el.kind === 'equation') return 'Add equation'
      return 'Add SVG graphic'
    }
    case 'updateText': return `Replace "${action.find.slice(0, 30)}${action.find.length > 30 ? '…' : ''}"`
    case 'setNotes': return 'Set speaker notes'
    case 'setBackground': return `Set slide background to ${action.color}`
    case 'animate': return `Animate "${action.target.slice(0, 25)}" with ${action.effect}`
    case 'setTransition': return `Set slide transition: ${action.transition}`
    // Sheets
    case 'setCells': return `Write ${action.cells.length} cell${action.cells.length !== 1 ? 's' : ''}`
    case 'setRange': {
      const rows = action.values.length
      const cols = action.values[0]?.length ?? 0
      return `Fill ${rows}×${cols} range from ${cellRefToA1(action.start)}`
    }
    case 'format': return `Format ${action.a1}`
    case 'merge': return `Merge ${action.a1}`
    case 'addChart': return `Insert ${action.chartType} chart (${action.dataRange})${action.title ? ` — "${action.title}"` : ''}`
    // Boards
    case 'addNodes': return `Add ${action.nodes.length} node${action.nodes.length !== 1 ? 's' : ''} to board`
    case 'connect': return `Draw ${action.arrows.length} connection${action.arrows.length !== 1 ? 's' : ''}`
    case 'addFileCard': return `Add file card: "${action.title}"`
  }
}
