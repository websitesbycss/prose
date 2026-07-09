// Executes validated prose-actions against the slides editor. Only ever called
// after the user clicks Apply on an action card — see src/lib/ai/proseActions.ts
// for the validation layer these actions have already passed through.
import type {
  Slide, SlideElement, TextElement, ShapeElement, TableElement, TableCell, ImageElement,
  PresentationTheme, ElementAnimation,
} from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import type {
  SlidesAction, SlideSpec, SlideElementSpec, TextRole,
} from '@/lib/ai/proseActions'
import type { AiActionHandler, AiActionResult } from '@/components/editor/AiPanel'
import { renderAdHocChartSnapshot } from '@/lib/chartSnapshot'
import { useAppStore } from '@/store/appStore'

// ── Context builder ───────────────────────────────────────────────────────────
// What the model sees: theme colors (so generated colors match), a deck
// outline, and the current slide's elements WITH their ids so updateText and
// animate actions can reference them precisely.

// Slide content can end up malformed (partial PPTX import, older save format,
// an element mid-edit) — every caller here treats content as optional so one
// bad element can't crash the whole context builder.
function stripHtml(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/<[^>]+>/g, '').trim()
}

function elementSummary(el: SlideElement): string {
  const pos = `at x=${Math.round(el.x)},y=${Math.round(el.y)},w=${Math.round(el.width)},h=${Math.round(el.height)}`
  switch (el.type) {
    case 'text': return `[id=${el.id}] text "${stripHtml(el.content).slice(0, 120)}" ${pos}`
    case 'shape': return `[id=${el.id}] shape (${el.shapeType})${el.content ? ` "${stripHtml(el.content).slice(0, 60)}"` : ''} ${pos}`
    case 'table': return `[id=${el.id}] table ${el.rows.length}×${el.rows[0]?.length ?? 0} ${pos}`
    case 'image': return `[id=${el.id}] image ${pos}`
    case 'code': return `[id=${el.id}] code block (${el.language}) ${pos}`
    case 'equation': return `[id=${el.id}] equation "${el.latex.slice(0, 60)}" ${pos}`
    case 'video': return `[id=${el.id}] video ${pos}`
    case 'ai-graphic': return `[id=${el.id}] AI graphic "${el.description.slice(0, 60)}" ${pos}`
  }
}

export function buildSlidesChatContext(
  slides: Slide[],
  activeIndex: number,
  theme: PresentationTheme,
): string {
  const parts: string[] = [
    `Theme "${theme.name}": primary ${theme.primaryColor}, secondary ${theme.secondaryColor}, accent ${theme.accentColor}, background ${theme.backgroundColor}, text ${theme.textColor}. Heading font ${theme.headingFontFamily}, body font ${theme.bodyFontFamily}.`,
    '',
    `Deck outline (${slides.length} slide${slides.length !== 1 ? 's' : ''}):`,
  ]
  slides.forEach((s, i) => {
    const firstText = s.elements.find((e): e is TextElement => e.type === 'text')
    const label = firstText ? stripHtml(firstText.content).split('\n')[0]?.slice(0, 60) : '(no text)'
    parts.push(`${i + 1}. ${label}${i === activeIndex ? '   ← CURRENT SLIDE' : ''}`)
  })

  const current = slides[activeIndex]
  if (current) {
    parts.push('', `Current slide (${activeIndex + 1} of ${slides.length}) elements:`)
    if (current.elements.length === 0) parts.push('(empty slide)')
    for (const el of current.elements) parts.push(`- ${elementSummary(el)}`)
    if (current.notes.trim()) parts.push(`Speaker notes: ${current.notes.slice(0, 400)}`)
    if (current.animations.length > 0) {
      parts.push(`Animations: ${current.animations.map((a) => `${a.effect} on ${a.elementId}`).join(', ')}`)
    }
    if (current.transition && current.transition.type !== 'none') {
      parts.push(`Transition: ${current.transition.type}`)
    }
  }
  return parts.join('\n')
}

// ── Element materialization ───────────────────────────────────────────────────

const ROLE_FONT_SIZES: Record<TextRole, number> = {
  title: 44,
  subtitle: 26,
  heading: 32,
  body: 20,
  caption: 14,
}

const ROLE_DEFAULT_RECTS: Record<TextRole, { x: number; y: number; w: number; h: number }> = {
  title:    { x: 5, y: 4,  w: 90, h: 13 },
  subtitle: { x: 5, y: 18, w: 90, h: 10 },
  heading:  { x: 5, y: 20, w: 90, h: 10 },
  body:     { x: 5, y: 24, w: 90, h: 62 },
  caption:  { x: 5, y: 88, w: 90, h: 8 },
}

function baseElement(x: number, y: number, w: number, h: number, zIndex: number): Omit<TextElement, 'type' | 'content' | 'fontFamily' | 'fontSize' | 'color' | 'align' | 'verticalAlign' | 'lineHeight' | 'letterSpacing' | 'overflow'> {
  return {
    id: crypto.randomUUID(),
    x, y, width: w, height: h,
    rotate: 0, opacity: 1, zIndex,
    flipH: false, flipV: false, locked: false, hidden: false,
  }
}

function makeText(
  content: string, theme: PresentationTheme, zIndex: number,
  opts: { x: number; y: number; w: number; h: number; fontSize: number; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean; heading?: boolean },
): TextElement {
  return {
    ...baseElement(opts.x, opts.y, opts.w, opts.h, zIndex),
    type: 'text',
    content: opts.bold ? `<b>${content}</b>` : content,
    fontFamily: opts.heading ? theme.headingFontFamily : theme.bodyFontFamily,
    fontSize: opts.fontSize,
    color: opts.color ?? theme.textColor,
    align: opts.align ?? 'left',
    verticalAlign: 'top',
    lineHeight: 1.4,
    letterSpacing: 0,
    overflow: 'clip',
  }
}

// Luminance check to pick a readable code theme / contrast color.
function isDarkColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex)
  if (!m) return false
  const v = parseInt(m[1]!, 16)
  const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) < 128
}

async function sanitizeSvg(raw: string): Promise<string | null> {
  const DOMPurify = (await import('dompurify')).default
  const safe = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'object', 'embed', 'link', 'foreignObject'],
  })
  return safe.trimStart().startsWith('<svg') ? safe : null
}

async function materializeElement(
  spec: SlideElementSpec,
  theme: PresentationTheme,
  zIndex: number,
): Promise<SlideElement | null> {
  switch (spec.kind) {
    case 'text': {
      const rect = ROLE_DEFAULT_RECTS[spec.role]
      return makeText(spec.text, theme, zIndex, {
        x: spec.x ?? rect.x, y: spec.y ?? rect.y, w: spec.w ?? rect.w, h: spec.h ?? rect.h,
        fontSize: spec.fontSize ?? ROLE_FONT_SIZES[spec.role],
        color: spec.color,
        align: spec.align,
        bold: spec.bold || spec.role === 'title' || spec.role === 'heading',
        heading: spec.role === 'title' || spec.role === 'heading' || spec.role === 'subtitle',
      })
    }
    case 'shape': {
      const fill = spec.fill ?? theme.accentColor
      const el: ShapeElement = {
        ...baseElement(spec.x, spec.y, spec.w, spec.h, zIndex),
        type: 'shape',
        shapeType: spec.shape,
        fill,
        opacity: spec.opacity ?? 1,
        ...(spec.borderColor ? { border: { color: spec.borderColor, width: 2, style: 'solid' as const } } : {}),
        ...(spec.cornerRadius !== undefined ? { cornerRadius: spec.cornerRadius } : {}),
        ...(spec.text ? {
          content: spec.text,
          textAlign: 'center' as const,
          textVerticalAlign: 'middle' as const,
          textFontFamily: theme.bodyFontFamily,
          textFontSize: 18,
          textColor: spec.textColor ?? (isDarkColor(fill) ? '#ffffff' : '#111827'),
        } : {}),
      }
      return el
    }
    case 'table': {
      const allRows = spec.headers ? [spec.headers, ...spec.rows] : spec.rows
      const colCount = Math.max(...allRows.map((r) => r.length), 1)
      const headerBg = spec.headerColor ?? theme.accentColor
      const rows: TableCell[][] = allRows.map((row, ri) => {
        const cells: TableCell[] = []
        for (let c = 0; c < colCount; c++) {
          const isHeader = !!spec.headers && ri === 0
          cells.push({
            id: crypto.randomUUID(),
            content: row[c] ?? '',
            ...(isHeader ? {
              style: { bold: true, backgroundColor: headerBg, color: isDarkColor(headerBg) ? '#ffffff' : '#111827' },
            } : {}),
          })
        }
        return cells
      })
      const colW = Math.floor(100 / colCount)
      const colWidths = Array.from({ length: colCount }, (_, i) => i < colCount - 1 ? colW : 100 - colW * (colCount - 1))
      const el: TableElement = {
        ...baseElement(spec.x ?? 5, spec.y ?? 24, spec.w ?? 90, spec.h ?? Math.min(64, allRows.length * 9 + 4), zIndex),
        type: 'table',
        rows,
        colWidths,
      }
      return el
    }
    case 'code':
      return {
        ...baseElement(spec.x ?? 8, spec.y ?? 24, spec.w ?? 84, spec.h ?? 50, zIndex),
        type: 'code',
        code: spec.code,
        language: spec.language ?? 'plaintext',
        theme: isDarkColor(theme.backgroundColor) ? 'light' : 'dark',
        fontSize: 16,
      }
    case 'equation':
      return {
        ...baseElement(spec.x ?? 25, spec.y ?? 38, spec.w ?? 50, spec.h ?? 18, zIndex),
        type: 'equation',
        latex: spec.latex,
        fontSize: 36,
        color: spec.color ?? theme.textColor,
      }
    case 'svg': {
      const safe = await sanitizeSvg(spec.svg)
      if (!safe) return null
      return {
        ...baseElement(spec.x ?? 55, spec.y ?? 22, spec.w ?? 38, spec.h ?? 56, zIndex),
        type: 'ai-graphic',
        svgContent: safe,
        description: spec.description ?? 'AI-generated graphic',
      }
    }
    case 'chart': {
      // Rendered as a frozen PNG snapshot (same approach as the manual "Insert
      // chart" picker) rather than a live element — no Chart.js instance stays
      // mounted per slide, keeping the deck light while editing/scrolling.
      const isDark = useAppStore.getState().theme === 'dark'
      const snapshot = renderAdHocChartSnapshot({
        chartType: spec.chartType,
        title: spec.title,
        labels: spec.labels,
        datasets: spec.datasets,
        xAxisLabel: spec.xAxisLabel,
        yAxisLabel: spec.yAxisLabel,
      }, isDark)

      let w = spec.w
      let h = spec.h
      if (w === undefined || h === undefined) {
        const imgAspect = snapshot.width / snapshot.height
        const slideAspect = SLIDE_BASE_WIDTH / SLIDE_BASE_HEIGHT
        w = 50
        h = (w * slideAspect) / imgAspect
        if (h > 70) { h = 70; w = (h * imgAspect) / slideAspect }
      }
      const x = spec.x ?? Math.max(0, (100 - w) / 2)
      const y = spec.y ?? Math.max(0, (100 - h) / 2)

      const el: ImageElement = {
        ...baseElement(x, y, w, h, zIndex),
        type: 'image',
        src: snapshot.dataUrl, altText: spec.title ?? 'Chart', borderRadius: 0,
        filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
      }
      return el
    }
  }
}

// ── Slide materialization ─────────────────────────────────────────────────────

function bulletsToContent(bullets: string[]): string {
  return bullets.map((b) => `• ${b}`).join('\n')
}

async function materializeSlide(spec: SlideSpec, theme: PresentationTheme): Promise<Slide> {
  const elements: SlideElement[] = []
  let z = Date.now()
  const next = (): number => z++

  const bodyContent = spec.bullets ? bulletsToContent(spec.bullets) : (spec.body ?? '')

  switch (spec.layout) {
    case 'title':
      if (spec.title) elements.push(makeText(spec.title, theme, next(), { x: 10, y: 32, w: 80, h: 18, fontSize: 60, align: 'center', bold: true, heading: true }))
      if (spec.subtitle) elements.push(makeText(spec.subtitle, theme, next(), { x: 15, y: 56, w: 70, h: 10, fontSize: 26, align: 'center', color: theme.secondaryColor }))
      break

    case 'section-header': {
      if (spec.title) elements.push(makeText(spec.title, theme, next(), { x: 8, y: 36, w: 84, h: 16, fontSize: 52, align: 'center', bold: true, heading: true }))
      // Thin accent underline gives section breaks a designed feel.
      const bar: ShapeElement = {
        ...baseElement(42, 56, 16, 1.2, next()),
        type: 'shape', shapeType: 'rect', fill: theme.accentColor,
      }
      elements.push(bar)
      if (spec.subtitle) elements.push(makeText(spec.subtitle, theme, next(), { x: 15, y: 62, w: 70, h: 8, fontSize: 22, align: 'center', color: theme.secondaryColor }))
      break
    }

    case 'two-column': {
      if (spec.title) elements.push(makeText(spec.title, theme, next(), { x: 5, y: 5, w: 90, h: 12, fontSize: 40, bold: true, heading: true }))
      const colTop = (spec.leftTitle || spec.rightTitle) ? 32 : 24
      if (spec.leftTitle) elements.push(makeText(spec.leftTitle, theme, next(), { x: 4, y: 22, w: 44, h: 8, fontSize: 24, bold: true, heading: true, color: theme.accentColor }))
      if (spec.rightTitle) elements.push(makeText(spec.rightTitle, theme, next(), { x: 52, y: 22, w: 44, h: 8, fontSize: 24, bold: true, heading: true, color: theme.accentColor }))
      if (spec.left) elements.push(makeText(bulletsToContent(spec.left), theme, next(), { x: 4, y: colTop, w: 44, h: 92 - colTop, fontSize: 20 }))
      if (spec.right) elements.push(makeText(bulletsToContent(spec.right), theme, next(), { x: 52, y: colTop, w: 44, h: 92 - colTop, fontSize: 20 }))
      break
    }

    case 'quote': {
      if (spec.quote ?? spec.body) {
        elements.push(makeText(`“${spec.quote ?? spec.body}”`, theme, next(), { x: 10, y: 28, w: 80, h: 34, fontSize: 38, align: 'center', heading: true }))
      }
      if (spec.attribution) {
        elements.push(makeText(`— ${spec.attribution}`, theme, next(), { x: 20, y: 66, w: 60, h: 8, fontSize: 20, align: 'center', color: theme.secondaryColor }))
      }
      break
    }

    case 'blank':
      break

    default: { // title-content
      if (spec.title) elements.push(makeText(spec.title, theme, next(), { x: 5, y: 5, w: 90, h: 12, fontSize: 40, bold: true, heading: true }))
      if (bodyContent) elements.push(makeText(bodyContent, theme, next(), { x: 5, y: 22, w: 90, h: 68, fontSize: 22 }))
      break
    }
  }

  // Extra explicit elements after layout scaffolding.
  for (const elSpec of spec.elements ?? []) {
    const el = await materializeElement(elSpec, theme, next())
    if (el) elements.push(el)
  }

  return {
    id: crypto.randomUUID(),
    elements,
    notes: spec.notes ?? '',
    animations: [],
    ...(spec.background ? { background: { type: 'solid' as const, color: spec.background } } : {}),
  }
}

// ── Target resolution (animate / updateText) ─────────────────────────────────

function findElementByTarget(slide: Slide, target: string): SlideElement | null {
  const byId = slide.elements.find((e) => e.id === target)
  if (byId) return byId
  const needle = target.toLowerCase()
  return slide.elements.find((e) => {
    if (e.type === 'text') return stripHtml(e.content).toLowerCase().includes(needle)
    if (e.type === 'shape' && e.content) return stripHtml(e.content).toLowerCase().includes(needle)
    return false
  }) ?? null
}

function inferCategory(effect: string): 'entrance' | 'exit' | 'emphasis' {
  return effect.endsWith('-out') ? 'exit' : 'entrance'
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface SlideActionContext {
  theme: PresentationTheme
  getCurrentSlide(): Slide | undefined
  activeSlideIndex: number
  insertSlides(slides: Slide[], afterIndex: number): void
  updateCurrentSlide(updater: (s: Slide) => Slide): void
}

export async function applySlideActions(actions: SlidesAction[], ctx: SlideActionContext): Promise<AiActionResult> {
  const newSlides: Slide[] = []
  const failures: string[] = []
  let appliedCount = 0

  // All current-slide mutations are simulated against a local copy first, then
  // committed in a single update — so an action can reference an element added
  // by an earlier action in the same batch (e.g. addElement → animate it).
  let sim = ctx.getCurrentSlide()
  let simChanged = false

  for (const action of actions) {
    switch (action.type) {
      case 'addSlide': {
        newSlides.push(await materializeSlide(action.slide, ctx.theme))
        appliedCount++
        break
      }
      case 'addElement': {
        if (!sim) break
        const el = await materializeElement(action.element, ctx.theme, Date.now())
        if (!el) { failures.push('One element could not be created safely'); break }
        sim = { ...sim, elements: [...sim.elements, el] }
        simChanged = true
        appliedCount++
        break
      }
      case 'updateText': {
        if (!sim) break
        const target = sim.elements.find((e) =>
          (e.type === 'text' && ((e.content ?? '').includes(action.find) || stripHtml(e.content).includes(action.find))) ||
          (e.type === 'shape' && !!e.content && e.content.includes(action.find)),
        )
        if (!target) { failures.push(`Text "${action.find.slice(0, 30)}…" not found on this slide`); break }
        sim = {
          ...sim,
          elements: sim.elements.map((e) => {
            if (e.id !== target.id) return e
            if (e.type === 'text') {
              const content = (e.content ?? '').includes(action.find)
                ? (e.content ?? '').replace(action.find, action.replace)
                : stripHtml(e.content).replace(action.find, action.replace)
              return { ...e, content }
            }
            if (e.type === 'shape' && e.content) return { ...e, content: e.content.replace(action.find, action.replace) }
            return e
          }),
        }
        simChanged = true
        appliedCount++
        break
      }
      case 'setNotes':
        if (!sim) break
        sim = { ...sim, notes: action.notes }
        simChanged = true
        appliedCount++
        break
      case 'setBackground':
        if (!sim) break
        sim = { ...sim, background: { type: 'solid', color: action.color } }
        simChanged = true
        appliedCount++
        break
      case 'animate': {
        if (!sim) break
        const target = findElementByTarget(sim, action.target)
        if (!target) { failures.push(`Animation target "${action.target.slice(0, 30)}" not found`); break }
        const animation: ElementAnimation = {
          id: crypto.randomUUID(),
          elementId: target.id,
          category: inferCategory(action.effect),
          effect: action.effect,
          direction: action.direction,
          duration: action.duration ?? 500,
          delay: action.delay ?? 0,
          trigger: action.trigger ?? 'click',
        }
        sim = { ...sim, animations: [...sim.animations, animation] }
        simChanged = true
        appliedCount++
        break
      }
      case 'setTransition':
        if (!sim) break
        sim = {
          ...sim,
          transition: {
            type: action.transition,
            duration: action.duration ?? 500,
            direction: action.direction,
          },
        }
        simChanged = true
        appliedCount++
        break
    }
  }

  if (simChanged && sim) {
    const finalSlide = sim
    ctx.updateCurrentSlide(() => finalSlide)
  }
  if (newSlides.length > 0) {
    ctx.insertSlides(newSlides, ctx.activeSlideIndex)
  }

  if (appliedCount === 0) {
    return { ok: false, message: failures[0] ?? 'Nothing could be applied.' }
  }
  return {
    ok: true,
    ...(failures.length > 0 ? { message: `Applied with ${failures.length} skipped: ${failures[0]}` } : {}),
  }
}

export function createSlideActionHandler(ctx: SlideActionContext): AiActionHandler {
  return {
    surface: 'slides',
    apply: (actions) => applySlideActions(actions as SlidesAction[], ctx),
  }
}
