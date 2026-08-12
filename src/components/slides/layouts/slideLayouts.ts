import type { SlideElement, PresentationTheme } from '@/types/slides'
import { SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from '@/types/slides'
import { iconToSvgString } from '../icons/curatedIcons'

export type LayoutId =
  | 'blank'
  | 'title-slide'
  | 'title-content'
  | 'two-column'
  | 'title-only'
  | 'section-header'
  | 'image-caption'
  | 'comparison'
  | 'agenda'
  | 'stat'
  | 'quote'
  | 'three-column'
  | 'icon-list'

export interface SlideLayout {
  id: LayoutId
  name: string
  description: string
  // Returns pre-positioned elements for the layout
  createElement(theme: PresentationTheme): SlideElement[]
}

function uuid(): string { return crypto.randomUUID() }

function textEl(overrides: Partial<import('@/types/slides').TextElement>): SlideElement {
  return {
    id: uuid(), type: 'text',
    x: 10, y: 10, width: 80, height: 15,
    rotate: 0, opacity: 1, zIndex: 1, flipH: false, flipV: false, locked: false, hidden: false,
    content: 'Text', fontFamily: 'Inter', fontSize: 36,
    color: '#1a1a1a', align: 'left', verticalAlign: 'top',
    lineHeight: 1.3, letterSpacing: 0, overflow: 'auto-fit',
    ...overrides,
  } as SlideElement
}

export const SLIDE_LAYOUTS: SlideLayout[] = [
  {
    id: 'blank',
    name: 'Blank',
    description: 'Empty slide',
    createElement: () => [],
  },
  {
    id: 'title-slide',
    name: 'Title slide',
    description: 'Large centered title and subtitle',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Presentation Title', x: 10, y: 28, width: 80, height: 20, fontSize: 72, align: 'center', verticalAlign: 'middle', color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: 'Subtitle or presenter name', x: 15, y: 54, width: 70, height: 12, fontSize: 32, align: 'center', color: theme.textColor, opacity: 0.65, zIndex: 2 }),
    ],
  },
  {
    id: 'title-content',
    name: 'Title + Content',
    description: 'Title at top, content area below',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Slide Title', x: 5, y: 5, width: 90, height: 13, fontSize: 48, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: '• First point\n• Second point\n• Third point', x: 5, y: 22, width: 90, height: 70, fontSize: 28, color: theme.textColor, zIndex: 2 }),
    ],
  },
  {
    id: 'two-column',
    name: 'Two Column',
    description: 'Title and two equal columns',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Slide Title', x: 5, y: 5, width: 90, height: 13, fontSize: 48, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: 'Left column content', x: 3, y: 22, width: 46, height: 70, fontSize: 24, color: theme.textColor, zIndex: 2 }),
      textEl({ id: uuid(), content: 'Right column content', x: 51, y: 22, width: 46, height: 70, fontSize: 24, color: theme.textColor, zIndex: 3 }),
    ],
  },
  {
    id: 'title-only',
    name: 'Title Only',
    description: 'Large title with empty content area',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Slide Title', x: 5, y: 5, width: 90, height: 18, fontSize: 64, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
    ],
  },
  {
    id: 'section-header',
    name: 'Section Header',
    description: 'Full-width colored background with large text',
    createElement: (theme) => [
      {
        id: uuid(), type: 'shape',
        x: 0, y: 0, width: 100, height: 100,
        rotate: 0, opacity: 1, zIndex: 1, flipH: false, flipV: false, locked: false, hidden: false,
        shapeType: 'rect', fill: theme.primaryColor,
      } as SlideElement,
      textEl({ id: uuid(), content: 'Section Title', x: 10, y: 35, width: 80, height: 18, fontSize: 72, align: 'center', color: '#ffffff', fontFamily: theme.headingFontFamily, zIndex: 2 }),
      textEl({ id: uuid(), content: 'Section subtitle', x: 15, y: 58, width: 70, height: 10, fontSize: 28, align: 'center', color: '#ffffff', opacity: 0.75, zIndex: 3 }),
    ],
  },
  {
    id: 'image-caption',
    name: 'Image + Caption',
    description: 'Image with caption text',
    createElement: (theme) => [
      {
        id: uuid(), type: 'image',
        x: 5, y: 5, width: 90, height: 75,
        rotate: 0, opacity: 1, zIndex: 1, flipH: false, flipV: false, locked: false, hidden: false,
        src: '', altText: 'Image', borderRadius: 4,
        filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 },
      } as SlideElement,
      textEl({ id: uuid(), content: 'Image caption', x: 5, y: 83, width: 90, height: 10, fontSize: 22, align: 'center', color: theme.textColor, opacity: 0.7, zIndex: 2 }),
    ],
  },
  {
    id: 'comparison',
    name: 'Comparison',
    description: 'Two side-by-side comparison sections',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Comparison', x: 5, y: 3, width: 90, height: 12, fontSize: 44, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: 'Option A', x: 3, y: 18, width: 46, height: 9, fontSize: 32, color: theme.primaryColor, fontFamily: theme.headingFontFamily, zIndex: 2 }),
      textEl({ id: uuid(), content: '• Detail\n• Detail\n• Detail', x: 3, y: 30, width: 46, height: 60, fontSize: 22, color: theme.textColor, zIndex: 3 }),
      textEl({ id: uuid(), content: 'Option B', x: 51, y: 18, width: 46, height: 9, fontSize: 32, color: theme.secondaryColor, fontFamily: theme.headingFontFamily, zIndex: 4 }),
      textEl({ id: uuid(), content: '• Detail\n• Detail\n• Detail', x: 51, y: 30, width: 46, height: 60, fontSize: 22, color: theme.textColor, zIndex: 5 }),
    ],
  },
  {
    id: 'agenda',
    name: 'Agenda / Outline',
    description: 'Numbered list layout for agendas',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Agenda', x: 5, y: 5, width: 90, height: 13, fontSize: 56, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: '1. Introduction\n2. Main Topic\n3. Discussion\n4. Q&A\n5. Wrap-up', x: 8, y: 23, width: 85, height: 68, fontSize: 30, color: theme.textColor, lineHeight: 1.8, zIndex: 2 }),
    ],
  },
  {
    id: 'stat',
    name: 'Big Stat',
    description: 'One large figure as the focus of the slide',
    createElement: (theme) => [
      textEl({ id: uuid(), content: '40%', x: 10, y: 14, width: 80, height: 32, fontSize: 140, align: 'center', verticalAlign: 'middle', color: theme.primaryColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      {
        id: uuid(), type: 'shape',
        x: 42.5, y: 47, width: 15, height: 1.2,
        rotate: 0, opacity: 1, zIndex: 2, flipH: false, flipV: false, locked: false, hidden: false,
        shapeType: 'rect', fill: theme.accentColor,
      } as SlideElement,
      textEl({ id: uuid(), content: 'Label for this figure', x: 10, y: 52, width: 80, height: 10, fontSize: 32, align: 'center', color: theme.textColor, zIndex: 3 }),
    ],
  },
  {
    id: 'quote',
    name: 'Quote',
    description: 'A centered pull quote with attribution',
    createElement: (theme) => [
      {
        id: uuid(), type: 'shape',
        x: 42.5, y: 22, width: 15, height: 1.2,
        rotate: 0, opacity: 1, zIndex: 1, flipH: false, flipV: false, locked: false, hidden: false,
        shapeType: 'rect', fill: theme.accentColor,
      } as SlideElement,
      textEl({ id: uuid(), content: '"Quote text goes here"', x: 12, y: 28, width: 76, height: 40, fontSize: 40, align: 'center', verticalAlign: 'middle', color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 2 }),
      textEl({ id: uuid(), content: '— Attribution', x: 15, y: 70, width: 70, height: 10, fontSize: 24, align: 'center', color: theme.textColor, opacity: 0.7, zIndex: 3 }),
    ],
  },
  {
    id: 'three-column',
    name: 'Three Column',
    description: 'Title and three equal columns',
    createElement: (theme) => [
      textEl({ id: uuid(), content: 'Slide Title', x: 5, y: 4, width: 90, height: 12, fontSize: 40, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
      textEl({ id: uuid(), content: 'Column one', x: 3, y: 22, width: 30, height: 68, fontSize: 18, color: theme.textColor, zIndex: 2 }),
      textEl({ id: uuid(), content: 'Column two', x: 35, y: 22, width: 30, height: 68, fontSize: 18, color: theme.textColor, zIndex: 3 }),
      textEl({ id: uuid(), content: 'Column three', x: 67, y: 22, width: 30, height: 68, fontSize: 18, color: theme.textColor, zIndex: 4 }),
    ],
  },
  {
    id: 'icon-list',
    name: 'Icon List',
    description: 'A short list of points, each with an icon',
    createElement: (theme) => {
      const ICON_W = 6
      const ICON_H = ICON_W * (SLIDE_BASE_WIDTH / SLIDE_BASE_HEIGHT)
      const rows: [string, string][] = [['star', 'First point'], ['target', 'Second point'], ['rocket', 'Third point']]
      const elements: SlideElement[] = [
        textEl({ id: uuid(), content: 'Slide Title', x: 5, y: 5, width: 90, height: 13, fontSize: 44, color: theme.textColor, fontFamily: theme.headingFontFamily, zIndex: 1 }),
        {
          id: uuid(), type: 'shape',
          x: 5, y: 19, width: 12, height: 1.2,
          rotate: 0, opacity: 1, zIndex: 2, flipH: false, flipV: false, locked: false, hidden: false,
          shapeType: 'rect', fill: theme.accentColor,
        } as SlideElement,
      ]
      rows.forEach(([icon, label], i) => {
        const y = 28 + i * 20
        const svg = iconToSvgString(icon, theme.accentColor)
        if (svg) {
          elements.push({
            id: uuid(), type: 'ai-graphic',
            x: 8, y, width: ICON_W, height: ICON_H,
            rotate: 0, opacity: 1, zIndex: 10 + i, flipH: false, flipV: false, locked: false, hidden: false,
            svgContent: svg, description: `icon: ${icon}`,
          } as SlideElement)
        }
        elements.push(textEl({ id: uuid(), content: label, x: 8 + ICON_W + 2, y, width: 75, height: ICON_H, fontSize: 26, verticalAlign: 'middle', color: theme.textColor, zIndex: 20 + i }))
      })
      return elements
    },
  },
]
