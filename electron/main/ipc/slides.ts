import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { resolveDocument, updateDocument, type ProseFileDocument } from '../services/fileService'
import { isSlidesContent } from '../lib/slidesContent'

// ── Type definitions (mirrors src/types/slides.ts) ────────────────────────────

interface Slide {
  id: string
  elements: unknown[]
  background?: unknown
  notes: string
  transition?: unknown
  animations: unknown[]
}

interface SlidesContent {
  version: 1
  slides: Slide[]
  theme: unknown
  settings: unknown
}

interface PresentationTheme {
  id: string
  name: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  backgroundColor: string
  textColor: string
  headingFontFamily: string
  bodyFontFamily: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFileId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid file ID')
  return id
}

function validateSlideId(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid slide ID')
  return id
}

async function readSlidesContent(fileId: string): Promise<{ content: SlidesContent; doc: ProseFileDocument }> {
  const resolved = await resolveDocument(fileId)
  if (!resolved) throw new Error('File not found')
  const { doc } = resolved

  let content: SlidesContent
  if (isSlidesContent(doc.content)) {
    content = doc.content as SlidesContent
  } else {
    content = {
      version: 1,
      slides: [{ id: 'slide-1', elements: [], notes: '', animations: [] }],
      theme: { id: 'minimal', name: 'Minimal', primaryColor: '#111827', secondaryColor: '#374151', accentColor: '#3B82F6', backgroundColor: '#FFFFFF', textColor: '#111827', headingFontFamily: 'Inter', bodyFontFamily: 'Inter' },
      settings: { aspectRatio: '16:9', defaultFontFamily: 'Inter', defaultFontSize: 18 },
    }
  }
  return { content, doc }
}

async function writeSlidesContent(fileId: string, content: SlidesContent): Promise<void> {
  await updateDocument(fileId, { content })
}

function validateSlideArray(slides: unknown): Slide[] {
  if (!Array.isArray(slides)) throw new Error('slides must be an array')
  return slides.map((s) => {
    if (!s || typeof s !== 'object') throw new Error('Invalid slide object')
    const slide = s as Record<string, unknown>
    if (typeof slide.id !== 'string' || !slide.id) throw new Error('Slide must have a string id')
    return {
      id: slide.id,
      elements: Array.isArray(slide.elements) ? slide.elements : [],
      background: slide.background,
      notes: typeof slide.notes === 'string' ? slide.notes : '',
      transition: slide.transition,
      animations: Array.isArray(slide.animations) ? slide.animations : [],
    } as Slide
  })
}

// ── Handler registration ──────────────────────────────────────────────────────

export function registerSlidesHandlers(): void {
  ipcMain.handle('slides:getSlides', async (_, fileId: unknown) => {
    const id = validateFileId(fileId)
    const { content } = await readSlidesContent(id)
    return content.slides
  })

  ipcMain.handle('slides:updateSlides', async (_, fileId: unknown, slides: unknown) => {
    const id = validateFileId(fileId)
    const validated = validateSlideArray(slides)
    const { content } = await readSlidesContent(id)
    await writeSlidesContent(id, { ...content, slides: validated })
  })

  ipcMain.handle('slides:addSlide', async (_, fileId: unknown, afterIndex: unknown) => {
    const id = validateFileId(fileId)
    const idx = typeof afterIndex === 'number' && isFinite(afterIndex) ? Math.max(0, Math.round(afterIndex)) : -1
    const { content } = await readSlidesContent(id)

    const newSlide: Slide = {
      id: randomUUID(),
      elements: [],
      notes: '',
      animations: [],
    }

    const slides = [...content.slides]
    if (idx < 0 || idx >= slides.length) {
      slides.push(newSlide)
    } else {
      slides.splice(idx + 1, 0, newSlide)
    }

    await writeSlidesContent(id, { ...content, slides })
    return newSlide
  })

  ipcMain.handle('slides:deleteSlide', async (_, fileId: unknown, slideId: unknown) => {
    const id = validateFileId(fileId)
    const sid = validateSlideId(slideId)
    const { content } = await readSlidesContent(id)

    const slides = content.slides.filter((s) => s.id !== sid)
    if (slides.length === 0) {
      slides.push({ id: randomUUID(), elements: [], notes: '', animations: [] })
    }
    await writeSlidesContent(id, { ...content, slides })
  })

  ipcMain.handle('slides:duplicateSlide', async (_, fileId: unknown, slideId: unknown) => {
    const id = validateFileId(fileId)
    const sid = validateSlideId(slideId)
    const { content } = await readSlidesContent(id)

    const original = content.slides.find((s) => s.id === sid)
    if (!original) throw new Error('Slide not found')

    const copy: Slide = {
      ...JSON.parse(JSON.stringify(original)) as Slide,
      id: randomUUID(),
    }

    const idx = content.slides.findIndex((s) => s.id === sid)
    const slides = [...content.slides]
    slides.splice(idx + 1, 0, copy)

    await writeSlidesContent(id, { ...content, slides })
    return copy
  })

  ipcMain.handle('slides:reorderSlides', async (_, fileId: unknown, slideIds: unknown) => {
    const id = validateFileId(fileId)
    if (!Array.isArray(slideIds) || slideIds.some((s) => typeof s !== 'string')) {
      throw new Error('slideIds must be a string array')
    }
    const ids = slideIds as string[]
    const { content } = await readSlidesContent(id)

    const slideMap = new Map(content.slides.map((s) => [s.id, s]))
    const reordered = ids.map((sid) => {
      const slide = slideMap.get(sid)
      if (!slide) throw new Error(`Slide not found: ${sid}`)
      return slide
    })

    await writeSlidesContent(id, { ...content, slides: reordered })
  })

  ipcMain.handle('slides:updateTheme', async (_, fileId: unknown, theme: unknown) => {
    const id = validateFileId(fileId)
    if (!theme || typeof theme !== 'object') throw new Error('Invalid theme')
    const t = theme as Record<string, unknown>
    const validated: PresentationTheme = {
      id: typeof t.id === 'string' ? t.id : 'custom',
      name: typeof t.name === 'string' ? t.name : 'Custom',
      primaryColor: typeof t.primaryColor === 'string' ? t.primaryColor : '#111827',
      secondaryColor: typeof t.secondaryColor === 'string' ? t.secondaryColor : '#374151',
      accentColor: typeof t.accentColor === 'string' ? t.accentColor : '#3B82F6',
      backgroundColor: typeof t.backgroundColor === 'string' ? t.backgroundColor : '#FFFFFF',
      textColor: typeof t.textColor === 'string' ? t.textColor : '#111827',
      headingFontFamily: typeof t.headingFontFamily === 'string' ? t.headingFontFamily : 'Inter',
      bodyFontFamily: typeof t.bodyFontFamily === 'string' ? t.bodyFontFamily : 'Inter',
    }
    const { content } = await readSlidesContent(id)
    await writeSlidesContent(id, { ...content, theme: validated })
  })

  // Export/import handlers are registered by registerSlidesExportHandlers() and registerSlidesImportHandlers()
}
