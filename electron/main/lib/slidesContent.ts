// Server-side Slides content utilities.
// Mirrors src/types/slides.ts — kept separate to avoid importing renderer-side modules.

interface SlidesContent {
  version: 1
  slides: { id: string; elements: unknown[]; notes: string; animations: unknown[] }[]
  theme: unknown
  settings: unknown
}

export function isSlidesContent(content: unknown): content is SlidesContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  return c.version === 1 && Array.isArray(c.slides)
}

export function countSlidesInContent(content: SlidesContent): number {
  return content.slides.length
}

export function createInitialSlidesContent(): SlidesContent {
  return {
    version: 1,
    slides: [
      {
        id: 'slide-1',
        elements: [],
        notes: '',
        animations: [],
      },
    ],
    theme: {
      id: 'minimal',
      name: 'Minimal',
      primaryColor: '#111827',
      secondaryColor: '#374151',
      accentColor: '#3B82F6',
      backgroundColor: '#FFFFFF',
      textColor: '#111827',
      headingFontFamily: 'Inter',
      bodyFontFamily: 'Inter',
    },
    settings: {
      aspectRatio: '16:9',
      defaultFontFamily: 'Inter',
      defaultFontSize: 18,
    },
  }
}
