// Shared utilities for Slides AI features.
import type { Slide, SlideElement, ImageElement, PresentationTheme } from '@/types/slides'
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

export interface AiSlideSchema {
  title: string
  layout: 'title' | 'title-content' | 'two-column' | 'section-header' | 'image-caption'
  content: string | string[] | { left: string[]; right: string[] }
  speakerNotes: string
  suggestedImageDescription: string | null
  backgroundColor: string | null
  /** Present when a spreadsheet source gives the model real numbers worth charting. */
  chart?: AiChartSchema | null
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

export function aiSlideToProseSlide(ai: AiSlideSchema, theme: PresentationTheme): Slide {
  const elements: SlideElement[] = []
  const bg = ai.backgroundColor
    ? { type: 'solid' as const, color: ai.backgroundColor }
    : undefined

  switch (ai.layout) {
    case 'title':
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 10, 30, 80, 20, 64, theme.textColor, 'center'))
      if (typeof ai.content === 'string' && ai.content) {
        elements.push(makeTextEl(crypto.randomUUID(), ai.content, 15, 58, 70, 12, 28, theme.textColor, 'center'))
      }
      break
    case 'section-header':
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 35, 90, 20, 56, theme.textColor, 'center'))
      break
    case 'two-column': {
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 4, 90, 14, 40, theme.textColor))
      const body = ai.content
      if (body && typeof body === 'object' && 'left' in body) {
        const c = body as { left: string[]; right: string[] }
        elements.push(makeTextEl(crypto.randomUUID(), c.left.map(s => `• ${s}`).join('\n'), 3, 20, 45, 70, 22, theme.textColor))
        elements.push(makeTextEl(crypto.randomUUID(), c.right.map(s => `• ${s}`).join('\n'), 52, 20, 45, 70, 22, theme.textColor))
      } else {
        elements.push(makeTextEl(crypto.randomUUID(), contentToText(ai.content), 3, 20, 94, 70, 22, theme.textColor))
      }
      break
    }
    default: { // title-content, image-caption
      // Reserve the right third of the slide for a generated visual when one
      // was suggested, so the text doesn't need to be reflowed after the
      // (async) graphic comes back.
      const hasImage = (ai.layout === 'image-caption' && !!ai.suggestedImageDescription) || !!ai.chart
      const bodyWidth = hasImage ? 55 : 90
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 4, 90, 14, 40, theme.textColor))
      elements.push(makeTextEl(crypto.randomUUID(), contentToText(ai.content), 5, 22, bodyWidth, 68, 22, theme.textColor))
      break
    }
  }

  // Chart snapshots render synchronously (no model round-trip), so they're
  // attached here rather than in the async attachGeneratedVisuals pass.
  if (ai.chart) {
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

export const OUTLINE_SYSTEM_PROMPT = `You are a presentation designer. Given an outline, generate a complete slide deck.
Return ONLY a JSON array with no preamble or explanation. Each object in the array represents one slide.

Schema for each slide object:
{
  "title": string,
  "layout": "title" | "title-content" | "two-column" | "section-header" | "image-caption",
  "content": string | string[] | { left: string[], right: string[] },
  "speakerNotes": string,
  "suggestedImageDescription": string | null,
  "backgroundColor": string | null,
  "chart": { "chartType": "bar"|"barHorizontal"|"line"|"area"|"pie"|"doughnut"|"scatter"|"radar", "title": string, "labels": string[], "datasets": [{"label": string, "data": (number|null)[]}], "xAxisLabel": string, "yAxisLabel": string } | null
}

Rules:
- Title slide is always index 0 with layout "title"
- Section headers use layout "section-header" for major topic transitions
- Use "two-column" when comparing two things
- Keep body text concise — maximum 6 bullet points per slide, maximum 10 words per bullet
- Speaker notes should be 2-4 sentences elaborating on the slide content
- Use layout "image-caption" (with a concrete, specific suggestedImageDescription) for any slide where a diagram, icon, or illustration would genuinely help — a real image will be generated from that description and placed on the slide. Use it generously where visuals add value, not just for literal photos. For all other layouts, set suggestedImageDescription to null.
- Set "chart" only when a spreadsheet source gives you real numeric data worth visualizing — restate the actual numbers from that source (never invent data). Match chart type to data shape: categories → bar, time series → line/area, parts-of-a-whole ≤8 slices → pie/doughnut, two numeric variables → scatter. A slide should have at most one of "chart" or "suggestedImageDescription", not both. Otherwise set "chart" to null.
- backgroundColor is null to use the theme default, or a hex color for accent slides
- Maximum 20 slides`

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
