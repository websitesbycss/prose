// PPTX import handler. Best-effort: text boxes and basic shapes are parsed;
// complex features (animations, SmartArt, embedded charts) fall back to simplified forms.
import { ipcMain, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { basename, extname } from 'path'
import JSZip from 'jszip'

// ── Inline minimal types ────────────────────────────────────────────────────

interface SlideEl {
  id: string; type: string
  x: number; y: number; width: number; height: number
  rotate: number; opacity: number; zIndex: number
  hidden: boolean; locked: boolean; flipH: boolean; flipV: boolean
  content?: string; fontFamily?: string; fontSize?: number; color?: string
  align?: string; verticalAlign?: string; lineHeight?: number
  overflow?: string; letterSpacing?: number
  shapeType?: string; fill?: string; border?: { color: string; width: number; style: string }
  src?: string; altText?: string; borderRadius?: number
  filters?: { brightness: number; contrast: number; saturation: number; blur: number }
}

interface SlideResult {
  id: string; elements: SlideEl[]; notes: string; animations: []
  background?: { type: string; color?: string }
}

interface ParseResult {
  title: string
  content: string // JSON-serialised SlidesContent
}

// ── EMU conversion ─────────────────────────────────────────────────────────

const SLIDE_W_EMU_WIDE = 12192000  // 16:9  13.33"
const SLIDE_H_EMU = 6858000        // 7.5"

function emuToXPct(v: number): number { return (v / SLIDE_W_EMU_WIDE) * 100 }
function emuToYPct(v: number): number { return (v / SLIDE_H_EMU) * 100 }

// ── Minimal XML helpers ────────────────────────────────────────────────────

function attr(xml: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(xml)
  return m ? m[1]! : null
}

function innerText(xml: string): string {
  const results: string[] = []
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) results.push(m[1]!)
  return results.join('')
}

// Extract block between an opening tag matching a pattern and its closing tag
function extractBlocks(xml: string, openRe: RegExp, closeTag: string): string[] {
  const blocks: string[] = []
  const open = new RegExp(openRe.source, 'g')
  let m: RegExpExecArray | null
  while ((m = open.exec(xml)) !== null) {
    const start = m.index
    const close = xml.indexOf(closeTag, start)
    if (close !== -1) blocks.push(xml.slice(start, close + closeTag.length))
  }
  return blocks
}

function hexColor(xml: string): string | null {
  const m = /<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/i.exec(xml)
  return m ? `#${m[1]!}` : null
}

// ── Slide XML parser ────────────────────────────────────────────────────────

function parseSlideXml(xml: string): SlideResult {
  const elements: SlideEl[] = []
  let zIdx = 1

  // Background
  let background: SlideResult['background'] | undefined
  const bgMatch = /<p:bg\b[^>]*>([\s\S]*?)<\/p:bg>/.exec(xml)
  if (bgMatch) {
    const bgColor = hexColor(bgMatch[1]!)
    background = bgColor ? { type: 'solid', color: bgColor } : undefined
  }

  // Shape elements (<p:sp>)
  const spBlocks = extractBlocks(xml, /<p:sp[\s>]/, '</p:sp>')
  for (const sp of spBlocks) {
    const xfrmMatch = /<a:xfrm[^>]*>([\s\S]*?)<\/a:xfrm>/.exec(sp)
    if (!xfrmMatch) continue

    const offMatch = /<a:off\s[^>]*x="(-?\d+)"[^>]*y="(-?\d+)"/.exec(xfrmMatch[1]!)
    const extMatch = /<a:ext\s[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(xfrmMatch[1]!)
    if (!offMatch || !extMatch) continue

    const x = emuToXPct(parseInt(offMatch[1]!))
    const y = emuToYPct(parseInt(offMatch[2]!))
    const width = emuToXPct(parseInt(extMatch[1]!))
    const height = emuToYPct(parseInt(extMatch[2]!))
    const rotAttr = attr(xfrmMatch[0]!, 'rot')
    const rotate = rotAttr ? parseInt(rotAttr) / 60000 : 0

    // Text content from txBody
    const txMatch = /<p:txBody[^>]*>([\s\S]*?)<\/p:txBody>/.exec(sp)
    const text = txMatch ? innerText(txMatch[1]!) : ''

    // Font size (hundredths of a point → pixels at 1920px base)
    let fontSize = 24
    const szMatch = /\bsz="(\d+)"/.exec(sp)
    if (szMatch) fontSize = Math.round(parseInt(szMatch[1]!) / 100 * 1.33)

    // Text color
    const rPrMatch = /<a:rPr[^>]*>([\s\S]*?)<\/a:rPr>/.exec(sp)
    const textColor = rPrMatch ? hexColor(rPrMatch[1]!) : null

    // Shape fill
    const fillMatch = /<a:solidFill>([\s\S]*?)<\/a:solidFill>/.exec(sp)
    const fillColor = fillMatch ? hexColor(fillMatch[1]!) : null

    // Preset geometry → shapeType
    const prstMatch = /<a:prstGeom\s[^>]*prst="([^"]+)"/.exec(sp)
    const prst = prstMatch ? prstMatch[1]! : 'rect'

    const prstMap: Record<string, string> = {
      rect: 'rect', roundRect: 'roundRect', ellipse: 'ellipse',
      triangle: 'triangle', rtTriangle: 'rightTriangle',
      parallelogram: 'parallelogram', trapezoid: 'trapezoid',
      rightArrow: 'arrow-right', leftArrow: 'arrow-left',
      upArrow: 'arrow-up', downArrow: 'arrow-down',
      leftRightArrow: 'arrow-double',
      star4: 'star-4', star5: 'star-5', star6: 'star-6',
      flowChartProcess: 'flowchart-process',
      flowChartDecision: 'flowchart-decision',
      flowChartTerminator: 'flowchart-terminal',
    }

    const hasText = text.trim().length > 0
    const isTextOnly = prst === 'rect' && hasText && !fillColor

    if (isTextOnly || hasText) {
      elements.push({
        id: crypto.randomUUID(), type: 'text',
        x, y, width, height, rotate, opacity: 1, zIndex: zIdx++,
        hidden: false, locked: false, flipH: false, flipV: false,
        content: text, fontFamily: 'Inter', fontSize,
        color: textColor ?? '#1a1a1a', align: 'left', verticalAlign: 'top',
        lineHeight: 1.4, letterSpacing: 0, overflow: 'clip',
      })
    } else {
      elements.push({
        id: crypto.randomUUID(), type: 'shape',
        x, y, width, height, rotate, opacity: 1, zIndex: zIdx++,
        hidden: false, locked: false, flipH: false, flipV: false,
        shapeType: prstMap[prst] ?? 'rect',
        fill: fillColor ?? '#94a3b8',
        border: { color: '#64748b', width: 1, style: 'solid' },
      })
    }
  }

  return {
    id: crypto.randomUUID(),
    elements,
    notes: '',
    animations: [],
    background,
  }
}

// ── Speaker notes parser ────────────────────────────────────────────────────

function parseNotesXml(xml: string): string {
  const runs: string[] = []
  const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    const t = m[1]!.trim()
    if (t) runs.push(t)
  }
  return runs.join(' ')
}

// ── Main parser ─────────────────────────────────────────────────────────────

async function parsePptx(zip: JSZip, filePath: string): Promise<ParseResult> {
  // Find slides ordered by number
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const na = parseInt(/(\d+)\.xml$/.exec(a)?.[1] ?? '0')
      const nb = parseInt(/(\d+)\.xml$/.exec(b)?.[1] ?? '0')
      return na - nb
    })

  const slides: SlideResult[] = []

  for (let i = 0; i < slideFiles.length; i++) {
    const slideFile = slideFiles[i]!
    const xml = await zip.files[slideFile]!.async('string')
    const slide = parseSlideXml(xml)

    // Try to load notes
    const notesFile = slideFile.replace('ppt/slides/', 'ppt/notesSlides/notes').replace('slide', 'notesSlide')
    if (zip.files[notesFile]) {
      try {
        const notesXml = await zip.files[notesFile]!.async('string')
        slide.notes = parseNotesXml(notesXml)
      } catch { /* no notes */ }
    }

    slides.push(slide)
  }

  const title = basename(filePath, extname(filePath))

  const DEFAULT_THEME = {
    id: 'minimal', name: 'Minimal',
    primaryColor: '#3b82f6', secondaryColor: '#1d4ed8', accentColor: '#f59e0b',
    backgroundColor: '#ffffff', textColor: '#1a1a1a',
    headingFontFamily: 'Inter', bodyFontFamily: 'Inter',
  }
  const DEFAULT_SETTINGS = {
    aspectRatio: '16:9' as const,
    defaultFontFamily: 'Inter', defaultFontSize: 24,
  }

  const content = JSON.stringify({ version: 1, slides, theme: DEFAULT_THEME, settings: DEFAULT_SETTINGS })
  return { title, content }
}

// ── IPC handler ─────────────────────────────────────────────────────────────

export function registerSlidesImportHandlers(): void {
  ipcMain.handle('slides:importPptx', async (): Promise<ParseResult | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Import PowerPoint presentation',
      filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]!
    const buf = await readFile(filePath)

    if (buf.length > 50 * 1024 * 1024) throw new Error('File too large (max 50MB)')

    try {
      const zip = await JSZip.loadAsync(buf)
      return await parsePptx(zip, filePath)
    } catch {
      throw new Error('Could not read PPTX file — it may be corrupted or use unsupported features')
    }
  })
}
