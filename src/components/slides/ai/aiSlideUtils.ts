// Shared utilities for Slides AI features.
import type { Slide, SlideElement, ImageElement, ShapeElement, TableElement, TableCell, PresentationTheme } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import type { ChartType } from '@/types/sheet'
import { renderAdHocChartSnapshot } from '@/lib/chartSnapshot'
import { useAppStore } from '@/store/appStore'

// ── Plain-text extraction ────────────────────────────────────────────────────
// Strips all positional/size data; sends only text to Ollama. Never sends base64.

export function slideToText(slide: Slide, index?: number): string {
  const lines: string[] = []
  if (index !== undefined) lines.push(`Slide ${index + 1}:`)
  for (const el of slide.elements) {
    if (el.type === 'text' && el.content) {
      const stripped = el.content.replace(/<[^>]+>/g, '').trim()
      if (stripped) lines.push(stripped)
    } else if (el.type === 'shape' && 'content' in el && (el as { content?: string }).content) {
      const stripped = ((el as { content?: string }).content ?? '').replace(/<[^>]+>/g, '').trim()
      if (stripped) lines.push(stripped)
    } else if (el.type === 'code' && 'code' in el) {
      const code = (el as { code?: string }).code ?? ''
      if (code.trim()) lines.push(`[Code: ${code.slice(0, 200)}]`)
    } else if (el.type === 'table' && 'rows' in el) {
      const rows = (el as { rows?: Array<Array<{ content: string }>> }).rows ?? []
      for (const row of rows) lines.push(row.map(c => c.content).join(' | '))
    }
  }
  if (slide.notes?.trim()) lines.push(`[Speaker notes: ${slide.notes}]`)
  return lines.join('\n').trim()
}

export function presentationToText(slides: Slide[]): string {
  return slides.map((s, i) => slideToText(s, i)).filter(Boolean).join('\n\n')
}

// ── JSON parsing ─────────────────────────────────────────────────────────────
// Strips markdown code fences before parsing. Throws on invalid JSON.

export function parseAiJson<T>(response: string): T {
  const stripped = response
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()
  return JSON.parse(stripped) as T
}

// ── AI-generated slide schema ─────────────────────────────────────────────────

export interface AiChartSchema {
  chartType: ChartType
  title?: string
  labels: string[]
  datasets: { label: string; data: (number | null)[] }[]
  xAxisLabel?: string
  yAxisLabel?: string
}

export interface AiTableSchema {
  headers: string[]
  rows: string[][]
}

export interface AiSlideSchema {
  title: string
  layout: 'title' | 'title-content' | 'two-column' | 'section-header' | 'image-caption'
  content: string | string[] | { left: string[]; right: string[] }
  speakerNotes: string
  suggestedImageDescription: string | null
  backgroundColor: string | null
  /** Present when the model wants to show a small set of figures verbatim. */
  table?: AiTableSchema | null
  /** Present when a spreadsheet source gives the model real numbers worth charting. */
  chart?: AiChartSchema | null
}

// ── Output sanitization ──────────────────────────────────────────────────────
// Local models routinely emit curly quotes, markdown markers, and bullets
// wrapped in quotation marks — none of which belong on a slide.

export function sanitizeSlideText(raw: string): string {
  let s = raw
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/`+/g, '')
    .replace(/\*\*|\*|__/g, '')
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '') // leading list marker — we add our own
    .trim()
  if (s.length > 1 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1).trim()
  }
  return s.replace(/[ \t]+/g, ' ')
}

function sanitizeContent(content: AiSlideSchema['content']): AiSlideSchema['content'] {
  if (typeof content === 'string') return sanitizeSlideText(content)
  if (Array.isArray(content)) return content.map((s) => sanitizeSlideText(String(s))).filter(Boolean)
  if (content && typeof content === 'object' && 'left' in content) {
    const c = content as { left: string[]; right: string[] }
    return {
      left: (Array.isArray(c.left) ? c.left : []).map((s) => sanitizeSlideText(String(s))).filter(Boolean),
      right: (Array.isArray(c.right) ? c.right : []).map((s) => sanitizeSlideText(String(s))).filter(Boolean),
    }
  }
  return ''
}

const TABLE_MAX_ROWS = 7
const TABLE_MAX_COLS = 5

export function normalizeAiTable(t: AiTableSchema | null | undefined): AiTableSchema | null {
  if (!t || typeof t !== 'object') return null
  const headers = Array.isArray(t.headers)
    ? t.headers.slice(0, TABLE_MAX_COLS).map((h) => sanitizeSlideText(String(h ?? '')))
    : []
  const rows = Array.isArray(t.rows)
    ? t.rows
        .filter((r): r is string[] => Array.isArray(r))
        .slice(0, TABLE_MAX_ROWS)
        .map((r) => r.slice(0, TABLE_MAX_COLS).map((c) => sanitizeSlideText(String(c ?? ''))))
        .filter((r) => r.some((c) => c !== ''))
    : []
  if (rows.length === 0) return null
  return { headers, rows }
}

/**
 * Drops degenerate model output: content slides that boil down to a word or
 * two with no table/chart to carry them. Title and section-header slides are
 * short by design and only need a title.
 */
export function isSubstantialSlide(ai: AiSlideSchema): boolean {
  const title = (ai.title ?? '').trim()
  if (ai.layout === 'title' || ai.layout === 'section-header') return title.length > 0
  const text = contentToText(sanitizeContent(ai.content)).replace(/[•\-\s]/g, '')
  return text.length >= 12 || !!ai.chart || !!normalizeAiTable(ai.table)
}

// ── Convert AI-generated JSON to Prose slides ─────────────────────────────────

function makeTextEl(
  id: string, content: string, x: number, y: number, w: number, h: number,
  fontSize: number, color: string, align: 'left' | 'center' | 'right' = 'left',
): SlideElement {
  return {
    id, type: 'text',
    x, y, width: w, height: h,
    rotate: 0, opacity: 1, zIndex: id.charCodeAt(0), flipH: false, flipV: false, locked: false, hidden: false,
    content, fontFamily: 'Inter', fontSize, color, align, verticalAlign: 'top',
    lineHeight: 1.4, letterSpacing: 0, overflow: 'clip',
  }
}

function contentToText(content: AiSlideSchema['content']): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(s => `• ${s}`).join('\n')
  if (content && typeof content === 'object' && 'left' in content) {
    const c = content as { left: string[]; right: string[] }
    return [...c.left.map(s => `• ${s}`), '---', ...c.right.map(s => `• ${s}`)].join('\n')
  }
  return ''
}

// Thin theme-colored bar used as a deterministic design accent (under titles,
// centered on section headers) — polish the local model doesn't have to (and
// couldn't reliably) specify itself.
function makeAccentBar(x: number, y: number, w: number, color: string): ShapeElement {
  return {
    id: crypto.randomUUID(), type: 'shape', shapeType: 'rect',
    x, y, width: w, height: 1.2,
    rotate: 0, opacity: 1, zIndex: 5, flipH: false, flipV: false, locked: false, hidden: false,
    fill: color,
  }
}

// Mirrors the chat executor's table convention (slideActionExecutor.ts):
// bold header row on the theme accent color, equal column widths.
function makeTableEl(
  table: AiTableSchema, theme: PresentationTheme,
  x: number, y: number, w: number, h: number,
): TableElement {
  const allRows = table.headers.length > 0 ? [table.headers, ...table.rows] : table.rows
  const colCount = Math.max(...allRows.map((r) => r.length), 1)
  const headerBg = theme.accentColor
  const rows: TableCell[][] = allRows.map((row, ri) => {
    const cells: TableCell[] = []
    for (let c = 0; c < colCount; c++) {
      const isHeader = table.headers.length > 0 && ri === 0
      cells.push({
        id: crypto.randomUUID(),
        content: row[c] ?? '',
        ...(isHeader ? { style: { bold: true, backgroundColor: headerBg, color: isDarkHex(headerBg) ? '#ffffff' : '#111827' } } : {}),
      })
    }
    return cells
  })
  const colW = Math.floor(100 / colCount)
  const colWidths = Array.from({ length: colCount }, (_, i) => (i < colCount - 1 ? colW : 100 - colW * (colCount - 1)))
  return {
    id: crypto.randomUUID(), type: 'table',
    x, y, width: w, height: h,
    rotate: 0, opacity: 1, zIndex: 500, flipH: false, flipV: false, locked: false, hidden: false,
    rows, colWidths,
  }
}

function isDarkHex(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return false
  const n = parseInt(m[1]!, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b < 140
}

export function aiSlideToProseSlide(rawAi: AiSlideSchema, theme: PresentationTheme): Slide {
  // Sanitize everything the model wrote before it touches a slide — local
  // models routinely emit curly quotes, markdown markers, and quoted bullets.
  const ai: AiSlideSchema = {
    ...rawAi,
    title: sanitizeSlideText(rawAi.title ?? ''),
    content: sanitizeContent(rawAi.content),
    speakerNotes: (rawAi.speakerNotes ?? '').trim(),
  }
  const table = normalizeAiTable(rawAi.table)
  const elements: SlideElement[] = []
  const bg = ai.backgroundColor
    ? { type: 'solid' as const, color: ai.backgroundColor }
    : undefined

  switch (ai.layout) {
    case 'title':
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 10, 30, 80, 20, 64, theme.textColor, 'center'))
      elements.push(makeAccentBar(42.5, 53, 15, theme.accentColor))
      if (typeof ai.content === 'string' && ai.content) {
        elements.push(makeTextEl(crypto.randomUUID(), ai.content, 15, 58, 70, 12, 28, theme.textColor, 'center'))
      }
      break
    case 'section-header':
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 35, 90, 20, 56, theme.textColor, 'center'))
      elements.push(makeAccentBar(40, 57, 20, theme.accentColor))
      break
    case 'two-column': {
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 4, 90, 14, 40, theme.textColor))
      elements.push(makeAccentBar(5, 17.5, 12, theme.accentColor))
      const body = ai.content
      if (body && typeof body === 'object' && 'left' in body) {
        const c = body as { left: string[]; right: string[] }
        elements.push(makeTextEl(crypto.randomUUID(), c.left.map(s => `• ${s}`).join('\n'), 3, 21, 45, 69, 22, theme.textColor))
        elements.push(makeTextEl(crypto.randomUUID(), c.right.map(s => `• ${s}`).join('\n'), 52, 21, 45, 69, 22, theme.textColor))
      } else {
        elements.push(makeTextEl(crypto.randomUUID(), contentToText(ai.content), 3, 21, 94, 69, 22, theme.textColor))
      }
      break
    }
    default: { // title-content, image-caption
      // Reserve the right third of the slide for a generated visual when one
      // was suggested, so the text doesn't need to be reflowed after the
      // (async) graphic comes back. A table instead takes the full width,
      // below whatever body text exists.
      const hasImage = !table && ((ai.layout === 'image-caption' && !!ai.suggestedImageDescription) || !!ai.chart)
      const bodyWidth = hasImage ? 55 : 90
      const bodyText = contentToText(ai.content)
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 4, 90, 14, 40, theme.textColor))
      elements.push(makeAccentBar(5, 17.5, 12, theme.accentColor))
      if (table) {
        const rowCount = table.rows.length + (table.headers.length > 0 ? 1 : 0)
        if (bodyText) {
          elements.push(makeTextEl(crypto.randomUUID(), bodyText, 5, 21, 90, 24, 22, theme.textColor))
          elements.push(makeTableEl(table, theme, 5, 48, 90, Math.min(44, rowCount * 8 + 4)))
        } else {
          elements.push(makeTableEl(table, theme, 5, 22, 90, Math.min(68, rowCount * 9 + 4)))
        }
      } else {
        elements.push(makeTextEl(crypto.randomUUID(), bodyText, 5, 22, bodyWidth, 68, 22, theme.textColor))
      }
      break
    }
  }

  // Chart snapshots render synchronously (no model round-trip), so they're
  // attached here rather than in the async attachGeneratedVisuals pass.
  // A slide carries at most one data visual — table wins if the model
  // (against instructions) emitted both.
  if (ai.chart && !table) {
    const isDark = useAppStore.getState().theme === 'dark'
    const snapshot = renderAdHocChartSnapshot(ai.chart, isDark)
    const imgAspect = snapshot.width / snapshot.height
    const slideAspect = SLIDE_BASE_WIDTH / SLIDE_BASE_HEIGHT
    const el: ImageElement = {
      id: crypto.randomUUID(), type: 'image',
      x: AI_VISUAL_REGION.x, y: AI_VISUAL_REGION.y,
      width: AI_VISUAL_REGION.width, height: (AI_VISUAL_REGION.width * slideAspect) / imgAspect,
      rotate: 0, opacity: 1, zIndex: 1000, flipH: false, flipV: false, locked: false, hidden: false,
      src: snapshot.dataUrl, altText: ai.chart.title ?? 'Chart', borderRadius: 0,
      filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
    }
    elements.push(el)
  }

  return {
    id: crypto.randomUUID(),
    elements,
    notes: ai.speakerNotes ?? '',
    animations: [],
    ...(bg ? { background: bg } : {}),
  }
}

// Region reserved for an AI-generated visual, matching the space the
// "image-caption" layout above leaves empty on the right.
export const AI_VISUAL_REGION = { x: 64, y: 22, width: 31, height: 60 }

// Generates and attaches a visual for every "image-caption" slide that
// suggested one — the rest of the deck builds and previews instantly, then
// the (slower) generated graphics fill in as each one resolves.
export async function attachGeneratedVisuals(
  aiSlides: AiSlideSchema[],
  prosSlides: Slide[],
  theme: PresentationTheme,
): Promise<Slide[]> {
  const withVisuals = await Promise.all(
    aiSlides.map(async (ai, i) => {
      const slide = prosSlides[i]
      if (!slide || ai.layout !== 'image-caption' || !ai.suggestedImageDescription || ai.chart) return slide
      const visual = await generateSlideVisual(ai.suggestedImageDescription, theme)
      if (!visual) return slide
      const graphic: SlideElement = {
        id: crypto.randomUUID(), type: 'ai-graphic',
        x: AI_VISUAL_REGION.x, y: AI_VISUAL_REGION.y, width: AI_VISUAL_REGION.width, height: AI_VISUAL_REGION.height,
        rotate: 0, opacity: 1, zIndex: 1000, flipH: false, flipV: false, locked: false, hidden: false,
        svgContent: visual.svgContent, description: ai.suggestedImageDescription,
      }
      return { ...slide, elements: [...slide.elements, graphic] }
    }),
  )
  return withVisuals.filter((s): s is Slide => !!s)
}

// ── System prompts (from spec) ────────────────────────────────────────────────

export const OUTLINE_SYSTEM_PROMPT = `You are an expert presentation designer. Create a complete, polished slide deck from the provided sources and instructions.
Return ONLY a JSON array with no preamble, no explanation, and no markdown fences. Each object in the array represents one slide.

Schema for each slide object:
{
  "title": string,
  "layout": "title" | "title-content" | "two-column" | "section-header" | "image-caption",
  "content": string | string[] | { left: string[], right: string[] },
  "speakerNotes": string,
  "suggestedImageDescription": string | null,
  "backgroundColor": string | null,
  "table": { "headers": string[], "rows": string[][] } | null,
  "chart": { "chartType": "bar"|"barHorizontal"|"line"|"area"|"pie"|"doughnut"|"scatter"|"radar", "title": string, "labels": string[], "datasets": [{"label": string, "data": (number|null)[]}], "xAxisLabel": string, "yAxisLabel": string } | null
}

Deck structure:
- Slide at index 0 always uses layout "title": a strong presentation title, with a one-sentence subtitle as "content".
- Use "section-header" to introduce each major topic shift.
- Use "two-column" when comparing or contrasting exactly two things ("content" must then be { left, right }).
- End the deck with a closing slide of key takeaways or next steps.
- Maximum 20 slides.

Writing rules (critical):
- Every bullet must be a complete, self-contained statement of 4 to 14 words. Never output a bullet that is a single word, a bare number, or a raw data value.
  Bad bullets: "123,782" / "Revenue" / "Q4". Good bullet: "Q4 revenue reached 123,782, the strongest quarter of the year".
- 3 to 6 bullets per content slide. Every slide must be complete and able to stand on its own.
- Plain text only: no markdown symbols (*, #, backticks), no quotation marks wrapped around bullets or titles, straight apostrophes only.
- Titles are specific and 2 to 8 words, with no trailing punctuation.
- speakerNotes: 2 to 4 full sentences elaborating on the slide.

Spreadsheet sources (critical):
- Never copy spreadsheet rows or cell values directly into bullets. First understand the data: what each column represents, the totals, trends, largest and smallest values, and changes over time or between categories.
- Bullets about data must state insights as sentences with context and units, e.g. "Monthly sales grew 26% between January and June".
- Show the numbers themselves using "table" or "chart", not text. Use "table" for a small set of figures worth reading exactly (at most 6 rows and 5 columns — select the most important rows if the source is larger). Use "chart" for trends, series, or comparisons, restating actual numbers from the source — never invent data. Match chart type to data shape: categories → bar, time series → line/area, parts-of-a-whole with at most 8 slices → pie/doughnut, two numeric variables → scatter.
- Slides with a "table" or "chart" must use layout "title-content". A slide may have at most ONE of "table", "chart", or "suggestedImageDescription" — set the others to null.

Visuals:
- Use layout "image-caption" (with a concrete, specific suggestedImageDescription) for any slide where a diagram, icon, or illustration would genuinely help — a real image will be generated from that description and placed on the slide. Use it generously where visuals add value, not just for literal photos. For all other layouts, set suggestedImageDescription to null.
- backgroundColor is null to use the theme default, or a hex color for occasional accent slides.`

export const SVG_SYSTEM_PROMPT = `Generate a clean, simple SVG illustration for a presentation slide.
Return ONLY valid SVG markup starting with <svg. No explanation, no preamble.
Style: flat design, minimal, professional. Use only these theme colors where color is needed: {themeColors}.
The SVG should use viewBox="0 0 400 300". Keep it simple — 5-15 shapes maximum.
Subject: {description}`

// ── Shared AI-graphic generation ──────────────────────────────────────────────
// Used by both the manual "AI illustration" modal and automatic deck generation
// (when a generated slide's suggestedImageDescription calls for a visual), so
// the prompt/sanitization logic lives in one place instead of two.

export async function generateSlideVisual(
  description: string,
  theme: PresentationTheme,
): Promise<{ svgContent: string } | null> {
  if (!description.trim()) return null
  try {
    const themeColors = [theme.primaryColor, theme.secondaryColor, theme.accentColor, theme.backgroundColor, theme.textColor].join(', ')
    const resp = await window.prose.ai.prompt({
      documentContent: description,
      request: SVG_SYSTEM_PROMPT.replace('{themeColors}', themeColors).replace('{description}', description),
      fileType: 'generate',
    })
    const svgMatch = /<svg[\s\S]*<\/svg>/i.exec(resp)
    const rawSvg = svgMatch ? svgMatch[0] : resp.trim()
    if (!rawSvg.startsWith('<svg')) return null
    // Sanitized again — defense in depth — at render time in AiGraphicElementRenderer.
    const DOMPurify = (await import('dompurify')).default
    const safe = DOMPurify.sanitize(rawSvg, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'object', 'embed', 'link'],
    })
    return { svgContent: safe }
  } catch {
    return null
  }
}
