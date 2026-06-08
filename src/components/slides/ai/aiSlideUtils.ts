// Shared utilities for Slides AI features.
import type { Slide, SlideElement, PresentationTheme } from '@/types/slides'

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

export interface AiSlideSchema {
  title: string
  layout: 'title' | 'title-content' | 'two-column' | 'section-header' | 'image-caption'
  content: string | string[] | { left: string[]; right: string[] }
  speakerNotes: string
  suggestedImageDescription: string | null
  backgroundColor: string | null
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
    default: // title-content, image-caption
      elements.push(makeTextEl(crypto.randomUUID(), ai.title, 5, 4, 90, 14, 40, theme.textColor))
      elements.push(makeTextEl(crypto.randomUUID(), contentToText(ai.content), 5, 22, 90, 68, 22, theme.textColor))
      break
  }

  return {
    id: crypto.randomUUID(),
    elements,
    notes: ai.speakerNotes ?? '',
    animations: [],
    ...(bg ? { background: bg } : {}),
  }
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
  "backgroundColor": string | null
}

Rules:
- Title slide is always index 0 with layout "title"
- Section headers use layout "section-header" for major topic transitions
- Use "two-column" when comparing two things
- Keep body text concise — maximum 6 bullet points per slide, maximum 10 words per bullet
- Speaker notes should be 2-4 sentences elaborating on the slide content
- suggestedImageDescription should describe a specific, concrete image that would enhance the slide — or null if no image is needed
- backgroundColor is null to use the theme default, or a hex color for accent slides
- Maximum 20 slides`

export const SVG_SYSTEM_PROMPT = `Generate a clean, simple SVG illustration for a presentation slide.
Return ONLY valid SVG markup starting with <svg. No explanation, no preamble.
Style: flat design, minimal, professional.
The SVG should use viewBox="0 0 400 300". Keep it simple — 5-15 shapes maximum.`
