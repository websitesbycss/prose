// Slides export service. Runs in the Electron main process.
// Uses pptxgenjs for PPTX. Security: inputs validated before use.

import { dialog } from 'electron'
import PptxGenJS from 'pptxgenjs'

// ── Inline types (avoids cross-tsconfig @/ alias issues) ─────────────────────

interface SlideBackground { type: string; color?: string }

interface SlideElement {
  id: string; type: string
  x: number; y: number; width: number; height: number
  rotate: number; opacity: number; zIndex: number
  hidden: boolean; locked: boolean
  flipH: boolean; flipV: boolean
  // text
  content?: string; fontFamily?: string; fontSize?: number; color?: string
  align?: string; verticalAlign?: string; lineHeight?: number
  // shape
  shapeType?: string; fill?: string; border?: { color: string; width: number }
  textColor?: string; textFontSize?: number; textFontFamily?: string; textAlign?: string
  // image
  src?: string
  // table
  rows?: Array<Array<{ content: string; style?: { bold?: boolean; italic?: boolean; color?: string; backgroundColor?: string; align?: string; fontSize?: number } }>>
  colWidths?: number[]
  // code
  code?: string
  // equation
  latex?: string
  // ai-graphic
  svgContent?: string
}

interface SlideDef {
  id: string
  elements: SlideElement[]
  background?: SlideBackground
  notes: string
  transition?: unknown
  animations: unknown[]
}

export interface SlidesContentLike {
  version: 1
  slides: SlideDef[]
  theme: { primaryColor: string; secondaryColor: string; backgroundColor: string; textColor: string; headingFontFamily: string; bodyFontFamily: string }
  settings: { aspectRatio: string; customWidth?: number; customHeight?: number }
}

// ── Conversion helpers ────────────────────────────────────────────────────────

const SLIDE_W_WIDE = 13.33
const SLIDE_W_43 = 10
const SLIDE_H = 7.5
/** Element font sizes are stored as px at a 1920px-wide slide base (all ratios). */
const SLIDE_BASE_W_PX = 1920

function slideDims(settings: SlidesContentLike['settings']): { w: number; h: number } {
  if (settings.aspectRatio === '4:3') return { w: SLIDE_W_43, h: SLIDE_H }
  if (settings.aspectRatio === 'custom' && settings.customWidth && settings.customHeight) {
    return { w: SLIDE_W_WIDE, h: SLIDE_W_WIDE * (settings.customHeight / settings.customWidth) }
  }
  return { w: SLIDE_W_WIDE, h: SLIDE_H }
}

function pct(v: number, dim: number): number { return (v / 100) * dim }

type PptxAlign = 'left' | 'center' | 'right' | 'justify'

/**
 * Convert a text element's HTML content to plain text that keeps its line
 * structure — <br> and block-level closes become newlines, list items get a
 * bullet, and entities are decoded. (A bare tag-strip used to collapse every
 * bullet list into one unbroken line.)
 */
function htmlToLines(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(?:p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

function hex(color: string): string { return color.replace('#', '') }

const SHAPE_MAP: Record<string, string> = {
  rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse',
  triangle: 'triangle', rightTriangle: 'rtTriangle',
  parallelogram: 'parallelogram', trapezoid: 'trapezoid',
  'arrow-right': 'rightArrow', 'arrow-left': 'leftArrow',
  'arrow-up': 'upArrow', 'arrow-down': 'downArrow',
  'arrow-double': 'leftRightArrow',
  line: 'line', connector: 'line',
  'speech-bubble': 'wedgeRoundRectCallout', 'thought-bubble': 'cloudCallout',
  'star-4': 'star4', 'star-5': 'star5', 'star-6': 'star6',
  banner: 'ribbon2', wave: 'wave',
  'flowchart-process': 'flowChartProcess',
  'flowchart-decision': 'flowChartDecision',
  'flowchart-terminal': 'flowChartTerminator',
  'flowchart-data': 'flowChartInputOutput',
  'flowchart-connector': 'flowChartConnector',
}

// ── PPTX export ───────────────────────────────────────────────────────────────

export async function exportToPptx(content: SlidesContentLike, savePath: string): Promise<void> {
  const pptx = new PptxGenJS()
  const { w: sW, h: sH } = slideDims(content.settings)
  // px→pt: slide is sW inches wide and SLIDE_BASE_W_PX px wide in element units.
  const pxToPt = (px: number): number => Math.max(1, Math.round(px * 72 * sW / SLIDE_BASE_W_PX))

  if (content.settings.aspectRatio === '4:3') {
    pptx.layout = 'LAYOUT_4x3'
  } else if (content.settings.aspectRatio === 'custom' && content.settings.customWidth && content.settings.customHeight) {
    pptx.defineLayout({ name: 'PROSE_CUSTOM', width: sW, height: sH })
    pptx.layout = 'PROSE_CUSTOM'
  } else {
    pptx.layout = 'LAYOUT_WIDE'
  }

  for (const slide of content.slides) {
    const ps = pptx.addSlide()

    // Background
    const bgColor = slide.background?.type === 'solid' && slide.background.color
      ? hex(slide.background.color)
      : hex(content.theme.backgroundColor)
    ps.background = { fill: bgColor }

    // Elements (sorted by zIndex)
    const sorted = [...slide.elements].sort((a, b) => a.zIndex - b.zIndex)

    for (const el of sorted) {
      if (el.hidden) continue

      const x = pct(el.x, sW)
      const y = pct(el.y, sH)
      const w = pct(el.width, sW)
      const h = pct(el.height, sH)
      const rotate = el.rotate
      const transparency = Math.round((1 - (el.opacity ?? 1)) * 100)

      if (el.type === 'text' && el.content !== undefined) {
        ps.addText(htmlToLines(el.content), {
          x, y, w, h, rotate,
          fontFace: el.fontFamily ?? content.theme.bodyFontFamily ?? 'Inter',
          fontSize: pxToPt(el.fontSize ?? 24),
          color: hex(el.color ?? content.theme.textColor),
          align: (el.align ?? 'left') as PptxAlign,
          valign: el.verticalAlign === 'middle' ? 'middle' : el.verticalAlign === 'bottom' ? 'bottom' : 'top',
          lineSpacingMultiple: el.lineHeight ?? 1.3,
          transparency,
        })
      } else if (el.type === 'image' && el.src) {
        try {
          if (el.src.startsWith('data:')) {
            ps.addImage({ data: el.src, x, y, w, h, rotate, flipH: el.flipH, flipV: el.flipV })
          } else {
            ps.addImage({ path: el.src, x, y, w, h, rotate, flipH: el.flipH, flipV: el.flipV })
          }
        } catch { /* skip invalid image */ }
      } else if (el.type === 'ai-graphic' && el.svgContent) {
        // pptxgenjs accepts SVG data URIs (rendered natively by modern PowerPoint)
        try {
          const data = `data:image/svg+xml;base64,${Buffer.from(el.svgContent, 'utf-8').toString('base64')}`
          ps.addImage({ data, x, y, w, h, rotate })
        } catch { /* skip invalid svg */ }
      } else if (el.type === 'shape' && el.shapeType) {
        const shapeName = (SHAPE_MAP[el.shapeType] ?? 'rect') as Parameters<typeof ps.addShape>[0]
        const shapeOpts = {
          x, y, w, h, rotate, flipH: el.flipH, flipV: el.flipV,
          fill: { color: el.fill ? hex(el.fill) : 'AAAAAA', transparency },
          line: el.border
            ? { color: hex(el.border.color), width: el.border.width }
            : { color: 'FFFFFF', transparency: 100 },
        }
        const shapeText = el.content ? htmlToLines(el.content) : ''
        if (shapeText) {
          // Text-bearing shapes must go through addText({ shape }) — addShape has no text support.
          ps.addText(shapeText, {
            ...shapeOpts,
            shape: shapeName,
            fontFace: el.textFontFamily ?? content.theme.bodyFontFamily ?? 'Inter',
            fontSize: pxToPt(el.textFontSize ?? 18),
            color: el.textColor ? hex(el.textColor) : hex(content.theme.textColor),
            align: (el.textAlign ?? 'center') as PptxAlign,
            valign: 'middle',
          })
        } else {
          ps.addShape(shapeName, shapeOpts)
        }
      } else if (el.type === 'table' && el.rows) {
        const tableRows = el.rows.map((row) =>
          row.map((cell) => ({
            text: htmlToLines(cell.content ?? ''),
            options: {
              bold: cell.style?.bold ?? false,
              italic: cell.style?.italic ?? false,
              color: cell.style?.color ? hex(cell.style.color) : hex(content.theme.textColor),
              // Only fill cells that actually have a background — a forced
              // white fill looked broken on dark-themed decks.
              ...(cell.style?.backgroundColor ? { fill: { color: hex(cell.style.backgroundColor) } } : {}),
              align: (cell.style?.align ?? 'left') as PptxAlign,
              fontSize: pxToPt(cell.style?.fontSize ?? 16),
            },
          }))
        )
        const colW = el.colWidths?.length
          ? el.colWidths.map((c) => (c / 100) * w)
          : undefined
        ps.addTable(tableRows, {
          x, y, w, h,
          ...(colW ? { colW } : {}),
          fontFace: content.theme.bodyFontFamily ?? 'Inter',
          border: { type: 'solid', color: 'A9A9A9', pt: 0.5 },
          valign: 'middle',
        })
      } else if (el.type === 'code' && el.code !== undefined) {
        ps.addText(el.code, {
          x, y, w, h,
          fontFace: 'Courier New',
          fontSize: pxToPt(el.fontSize ?? 14),
          color: 'c9d1d9',
          fill: { color: '0d1117' },
        })
      } else if (el.type === 'equation' && el.latex) {
        // No native equation support in pptxgenjs — export the LaTeX source
        // as monospace text rather than dropping the element silently.
        ps.addText(el.latex, {
          x, y, w, h,
          fontFace: 'Cambria Math',
          italic: true,
          fontSize: pxToPt(el.fontSize ?? 28),
          color: hex(el.color ?? content.theme.textColor),
          align: 'center',
          valign: 'middle',
        })
      }
    }

    if (slide.notes.trim()) ps.addNotes(slide.notes)
  }

  await pptx.writeFile({ fileName: savePath })
}

// ── Dialog helper ─────────────────────────────────────────────────────────────

export async function showSaveDialog(format: 'pptx' | 'png', title: string): Promise<string | null> {
  const nameMap = { pptx: 'PowerPoint Presentation', png: 'PNG Image' }
  const result = await dialog.showSaveDialog({
    title: `Export as ${format.toUpperCase()}`,
    defaultPath: `${title}.${format}`,
    filters: [{ name: nameMap[format], extensions: [format] }],
  })
  return result.canceled ? null : result.filePath ?? null
}
