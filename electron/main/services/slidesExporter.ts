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
  // image
  src?: string
  // table
  rows?: Array<Array<{ content: string; style?: { bold?: boolean; italic?: boolean; color?: string; backgroundColor?: string; align?: string } }>>
  colWidths?: number[]
  // code
  code?: string
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

function slideW(settings: SlidesContentLike['settings']): number {
  return settings.aspectRatio === '4:3' ? SLIDE_W_43 : SLIDE_W_WIDE
}

function pct(v: number, dim: number): number { return (v / 100) * dim }

type PptxAlign = 'left' | 'center' | 'right' | 'justify'

function stripHtml(html: string): string { return html.replace(/<[^>]+>/g, '') }

function hex(color: string): string { return color.replace('#', '') }

// ── PPTX export ───────────────────────────────────────────────────────────────

export async function exportToPptx(content: SlidesContentLike, savePath: string): Promise<void> {
  const pptx = new PptxGenJS()
  const sW = slideW(content.settings)

  pptx.layout = content.settings.aspectRatio === '4:3' ? 'LAYOUT_4x3' : 'LAYOUT_WIDE'

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
      const y = pct(el.y, SLIDE_H)
      const w = pct(el.width, sW)
      const h = pct(el.height, SLIDE_H)
      const rotate = el.rotate

      if (el.type === 'text' && el.content !== undefined) {
        ps.addText(stripHtml(el.content), {
          x, y, w, h, rotate,
          fontFace: el.fontFamily ?? 'Inter',
          fontSize: Math.round((el.fontSize ?? 24) * 0.75),
          color: hex(el.color ?? content.theme.textColor),
          align: (el.align ?? 'left') as PptxAlign,
          valign: el.verticalAlign === 'middle' ? 'middle' : el.verticalAlign === 'bottom' ? 'bottom' : 'top',
          lineSpacingMultiple: el.lineHeight ?? 1.3,
          transparency: Math.round((1 - el.opacity) * 100),
        })
      } else if (el.type === 'image' && el.src) {
        try {
          if (el.src.startsWith('data:')) {
            ps.addImage({ data: el.src, x, y, w, h, rotate })
          } else {
            ps.addImage({ path: el.src, x, y, w, h, rotate })
          }
        } catch { /* skip invalid image */ }
      } else if (el.type === 'shape' && el.shapeType) {
        const shapeMap: Record<string, string> = {
          rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse',
          triangle: 'triangle', rightTriangle: 'rtTriangle',
          parallelogram: 'parallelogram', trapezoid: 'trapezoid',
          'arrow-right': 'rightArrow', 'arrow-left': 'leftArrow',
          'arrow-up': 'upArrow', 'arrow-down': 'downArrow',
          'arrow-double': 'leftRightArrow',
          'star-4': 'star4', 'star-5': 'star5', 'star-6': 'star6',
          'flowchart-process': 'flowChartProcess',
          'flowchart-decision': 'flowChartDecision',
          'flowchart-terminal': 'flowChartTerminator',
        }
        const shapeName = (shapeMap[el.shapeType] ?? 'rect') as Parameters<typeof ps.addShape>[0]
        ps.addShape(shapeName, {
          x, y, w, h, rotate,
          fill: { color: el.fill ? hex(el.fill) : 'AAAAAA' },
          line: el.border
            ? { color: hex(el.border.color), width: el.border.width }
            : { color: 'FFFFFF', transparency: 100 },
        })
      } else if (el.type === 'table' && el.rows) {
        const tableRows = el.rows.map((row) =>
          row.map((cell) => ({
            text: cell.content,
            options: {
              bold: cell.style?.bold ?? false,
              italic: cell.style?.italic ?? false,
              color: cell.style?.color ? hex(cell.style.color) : hex(content.theme.textColor),
              fill: { color: cell.style?.backgroundColor ? hex(cell.style.backgroundColor) : 'FFFFFF' },
              align: (cell.style?.align ?? 'left') as PptxAlign,
            },
          }))
        )
        ps.addTable(tableRows, { x, y, w, h })
      } else if (el.type === 'code' && el.code !== undefined) {
        ps.addText(el.code, {
          x, y, w, h,
          fontFace: 'Courier New',
          fontSize: Math.round((el.fontSize ?? 14) * 0.75),
          color: 'c9d1d9',
          fill: { color: '0d1117' },
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
