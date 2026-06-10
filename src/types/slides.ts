// Prose Slides data model.
// All position/size values (x, y, width, height) are percentages (0-100) of slide dimensions.
// Font sizes in element data are at 1x (1920px base width); the canvas renderer scales them.

export const SLIDE_BASE_WIDTH = 1920
export const SLIDE_BASE_HEIGHT = 1080

export type AspectRatio = '16:9' | '4:3' | 'custom'

export interface PresentationSettings {
  aspectRatio: AspectRatio
  customWidth?: number
  customHeight?: number
  defaultFontFamily: string
  defaultFontSize: number
}

export interface PresentationTheme {
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

// ── Shared sub-types ────────────────────────────────────────────────────────

export interface ElementShadow {
  offsetX: number
  offsetY: number
  blur: number
  color: string
}

export type LineStyle = 'solid' | 'dashed' | 'dotted'

export interface ElementBorder {
  color: string
  width: number
  style: LineStyle
}

export type GradientType = 'linear' | 'radial'

export interface GradientStop {
  position: number
  color: string
}

export interface Gradient {
  type: GradientType
  stops: GradientStop[]
  angle?: number
}

// ── Text alignment ───────────────────────────────────────────────────────────

export type TextAlignH = 'left' | 'center' | 'right' | 'justify'
export type TextAlignV = 'top' | 'middle' | 'bottom'
export type TextOverflow = 'clip' | 'resize' | 'auto-fit'

// ── Element base ─────────────────────────────────────────────────────────────

export interface BaseElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotate: number
  opacity: number
  zIndex: number
  flipH: boolean
  flipV: boolean
  locked: boolean
  hidden: boolean
  groupId?: string
}

// ── Text element ─────────────────────────────────────────────────────────────

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
  fontFamily: string
  fontSize: number
  color: string
  align: TextAlignH
  verticalAlign: TextAlignV
  lineHeight: number
  letterSpacing: number
  fill?: string
  border?: ElementBorder
  shadow?: ElementShadow
  overflow: TextOverflow
}

// ── Shape element ────────────────────────────────────────────────────────────

export type ShapeType =
  | 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'rightTriangle'
  | 'parallelogram' | 'trapezoid'
  | 'arrow-right' | 'arrow-left' | 'arrow-up' | 'arrow-down' | 'arrow-double'
  | 'line' | 'connector'
  | 'speech-bubble' | 'thought-bubble'
  | 'star-4' | 'star-5' | 'star-6' | 'banner' | 'wave'
  | 'flowchart-process' | 'flowchart-decision' | 'flowchart-terminal'
  | 'flowchart-data' | 'flowchart-connector'

export interface ShapeElement extends BaseElement {
  type: 'shape'
  shapeType: ShapeType
  fill: string
  gradient?: Gradient
  border?: ElementBorder
  shadow?: ElementShadow
  cornerRadius?: number
  content?: string
  textAlign?: TextAlignH
  textVerticalAlign?: TextAlignV
  textFontFamily?: string
  textFontSize?: number
  textColor?: string
}

// ── Image element ────────────────────────────────────────────────────────────

export interface ImageCrop {
  top: number
  right: number
  bottom: number
  left: number
}

export interface ImageFilters {
  brightness: number
  contrast: number
  saturation: number
  blur: number
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  altText: string
  crop?: ImageCrop
  borderRadius: number
  border?: ElementBorder
  shadow?: ElementShadow
  filters: ImageFilters
}

// ── Table element ────────────────────────────────────────────────────────────

export interface TableCellStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  color?: string
  backgroundColor?: string
  fontSize?: number
  fontFamily?: string
  align?: TextAlignH
  verticalAlign?: TextAlignV
  border?: ElementBorder
}

export interface TableCell {
  id: string
  content: string
  style?: TableCellStyle
  colspan?: number
  rowspan?: number
}

export interface TableElement extends BaseElement {
  type: 'table'
  rows: TableCell[][]
  colWidths: number[]
  rowHeights?: number[]
  border?: ElementBorder
  hasHeaderRow: boolean
  headerColor?: string
}

// ── Equation element ─────────────────────────────────────────────────────────

export interface EquationElement extends BaseElement {
  type: 'equation'
  latex: string
  fontSize: number
  color: string
}

// ── Code block element ───────────────────────────────────────────────────────

export interface CodeBlockElement extends BaseElement {
  type: 'code'
  code: string
  language: string
  theme: 'dark' | 'light'
  fontSize: number
}

// ── Video element ────────────────────────────────────────────────────────────

export interface VideoElement extends BaseElement {
  type: 'video'
  src: string
  autoPlay: boolean
  loop: boolean
  muted: boolean
  poster?: string
}

// ── AI graphic element ───────────────────────────────────────────────────────

export interface AiGraphicElement extends BaseElement {
  type: 'ai-graphic'
  svgContent: string
  description: string
}

// ── Union ────────────────────────────────────────────────────────────────────

export type SlideElement =
  | TextElement
  | ShapeElement
  | ImageElement
  | TableElement
  | EquationElement
  | CodeBlockElement
  | VideoElement
  | AiGraphicElement

// ── Slide background ─────────────────────────────────────────────────────────

export interface SolidBackground {
  type: 'solid'
  color: string
}

export interface GradientBackground {
  type: 'linear-gradient' | 'radial-gradient'
  gradient: Gradient
}

export interface ImageBackground {
  type: 'image'
  src: string
  size: 'cover' | 'contain' | 'repeat'
}

export type SlideBackground = SolidBackground | GradientBackground | ImageBackground

// ── Transitions ──────────────────────────────────────────────────────────────

export type TransitionType = 'none' | 'fade' | 'slide' | 'zoom' | 'flip'
export type TransitionDirection = 'left' | 'right' | 'up' | 'down'

export interface SlideTransition {
  type: TransitionType
  duration: number
  direction?: TransitionDirection
}

// ── Animations ───────────────────────────────────────────────────────────────

export type AnimationTrigger = 'click' | 'auto'

export interface ElementAnimation {
  id: string
  elementId: string
  type: string
  duration: number
  delay: number
  trigger: AnimationTrigger
}

// ── Slide ────────────────────────────────────────────────────────────────────

export interface Slide {
  id: string
  elements: SlideElement[]
  background?: SlideBackground
  notes: string
  transition?: SlideTransition
  animations: ElementAnimation[]
}

// ── Slide master ─────────────────────────────────────────────────────────────

export interface SlideMasterElement {
  id: string
  type: 'logo' | 'footer'
  x: number
  y: number
  width: number
  height: number
  // logo: src is a data URL or file path
  src?: string
  // footer: text content
  content?: string
  fontSize?: number
  color?: string
  align?: TextAlignH
}

export interface SlideMaster {
  background?: SlideBackground
  elements: SlideElement[]
}

// ── Presentation content (stored in .prose file `content` field) ─────────────

export interface SlidesContent {
  version: 1
  slides: Slide[]
  theme: PresentationTheme
  settings: PresentationSettings
  master?: SlideMaster
}

// ── Type guard ───────────────────────────────────────────────────────────────

export function isSlidesContent(content: unknown): content is SlidesContent {
  if (!content || typeof content !== 'object') return false
  const c = content as Record<string, unknown>
  return c.version === 1 && Array.isArray(c.slides)
}

// ── Built-in themes ──────────────────────────────────────────────────────────

export const BUILT_IN_THEMES: PresentationTheme[] = [
  {
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
  {
    id: 'prose-dark',
    name: 'Prose Dark',
    primaryColor: '#F9FAFB',
    secondaryColor: '#E5E7EB',
    accentColor: '#60A5FA',
    backgroundColor: '#111827',
    textColor: '#F9FAFB',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
  },
  {
    id: 'academic',
    name: 'Academic',
    primaryColor: '#1E3A5F',
    secondaryColor: '#7B1E1E',
    accentColor: '#1E3A5F',
    backgroundColor: '#FFFFFF',
    textColor: '#1A1A1A',
    headingFontFamily: 'Georgia',
    bodyFontFamily: 'Times New Roman',
  },
  {
    id: 'bold',
    name: 'Bold',
    primaryColor: '#FBBF24',
    secondaryColor: '#F59E0B',
    accentColor: '#FBBF24',
    backgroundColor: '#000000',
    textColor: '#FFFFFF',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
  },
  {
    id: 'soft',
    name: 'Soft',
    primaryColor: '#6B7280',
    secondaryColor: '#9CA3AF',
    accentColor: '#A78BFA',
    backgroundColor: '#F9FAFB',
    textColor: '#374151',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
  },
  {
    id: 'tech',
    name: 'Tech',
    primaryColor: '#10B981',
    secondaryColor: '#34D399',
    accentColor: '#10B981',
    backgroundColor: '#0F172A',
    textColor: '#E2E8F0',
    headingFontFamily: 'JetBrains Mono',
    bodyFontFamily: 'JetBrains Mono',
  },
]

export const DEFAULT_THEME: PresentationTheme = BUILT_IN_THEMES[0]!

export const DEFAULT_SETTINGS: PresentationSettings = {
  aspectRatio: '16:9',
  defaultFontFamily: 'Inter',
  defaultFontSize: 18,
}

// ── Defaults ─────────────────────────────────────────────────────────────────

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
    theme: { ...DEFAULT_THEME },
    settings: { ...DEFAULT_SETTINGS },
  }
}

export function countSlidesInContent(content: SlidesContent): number {
  return content.slides.length
}

// ── Deserialization ──────────────────────────────────────────────────────────

export function deserializeSlides(raw: unknown): SlidesContent {
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw) } catch { return createInitialSlidesContent() }
  }
  if (!parsed || typeof parsed !== 'object') return createInitialSlidesContent()
  const c = parsed as Record<string, unknown>
  if (c.version !== 1 || !Array.isArray(c.slides)) return createInitialSlidesContent()

  const slides: Slide[] = (c.slides as unknown[]).map(deserializeSlide)
  const theme = deserializeTheme(c.theme)
  const settings = deserializeSettings(c.settings)

  const master: SlideMaster | undefined = c.master && typeof c.master === 'object'
    ? migrateMaster(c.master as Record<string, unknown>)
    : undefined
  return { version: 1, slides: slides.length > 0 ? slides : createInitialSlidesContent().slides, theme, settings, master }
}

function deserializeSlide(raw: unknown): Slide {
  if (!raw || typeof raw !== 'object') {
    return { id: crypto.randomUUID(), elements: [], notes: '', animations: [] }
  }
  const s = raw as Record<string, unknown>
  return {
    id: typeof s.id === 'string' && s.id ? s.id : crypto.randomUUID(),
    elements: Array.isArray(s.elements) ? (s.elements as unknown[]).filter(isValidElement) as SlideElement[] : [],
    background: isValidBackground(s.background) ? (s.background as SlideBackground) : undefined,
    notes: typeof s.notes === 'string' ? s.notes : '',
    transition: isValidTransition(s.transition) ? (s.transition as SlideTransition) : undefined,
    animations: Array.isArray(s.animations) ? s.animations as ElementAnimation[] : [],
  }
}

function migrateMaster(raw: Record<string, unknown>): SlideMaster {
  const background = isValidBackground(raw.background) ? (raw.background as SlideBackground) : undefined
  const elements: SlideElement[] = Array.isArray(raw.elements)
    ? (raw.elements as unknown[]).map(migrateMasterEl).filter((e): e is SlideElement => e !== null)
    : []
  return { background, elements }
}

function migrateMasterEl(raw: unknown): SlideElement | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  // Already a proper SlideElement (has rotate/opacity from new format)
  if (typeof e.rotate === 'number' && typeof e.opacity === 'number' && isValidElement(raw)) {
    return raw as SlideElement
  }
  // Old SlideMasterElement format migration
  const id = typeof e.id === 'string' && e.id ? e.id : crypto.randomUUID()
  const x = typeof e.x === 'number' ? e.x : 0
  const y = typeof e.y === 'number' ? e.y : 0
  const width = typeof e.width === 'number' ? e.width : 10
  const height = typeof e.height === 'number' ? e.height : 10
  const base = { id, x, y, width, height, rotate: 0, opacity: 1, zIndex: 0, flipH: false, flipV: false, locked: false, hidden: false }
  if (e.type === 'logo' && typeof e.src === 'string') {
    return { ...base, type: 'image' as const, src: e.src, altText: 'Logo', borderRadius: 0, filters: { brightness: 100, contrast: 100, saturation: 100, blur: 0 } }
  }
  if (e.type === 'footer') {
    return {
      ...base, type: 'text' as const,
      content: typeof e.content === 'string' ? e.content : '',
      fontFamily: 'Inter', fontSize: typeof e.fontSize === 'number' ? e.fontSize : 16,
      color: typeof e.color === 'string' ? e.color : '#1a1a1a',
      align: (['left','center','right','justify'].includes(e.align as string) ? e.align : 'left') as TextAlignH,
      verticalAlign: 'middle' as TextAlignV, lineHeight: 1.4, letterSpacing: 0, overflow: 'auto-fit' as TextOverflow,
    }
  }
  return null
}

function isValidElement(raw: unknown): raw is SlideElement {
  if (!raw || typeof raw !== 'object') return false
  const e = raw as Record<string, unknown>
  return typeof e.type === 'string' && typeof e.id === 'string'
}

function isValidBackground(raw: unknown): raw is SlideBackground {
  if (!raw || typeof raw !== 'object') return false
  const b = raw as Record<string, unknown>
  return typeof b.type === 'string'
}

function isValidTransition(raw: unknown): raw is SlideTransition {
  if (!raw || typeof raw !== 'object') return false
  const t = raw as Record<string, unknown>
  return typeof t.type === 'string'
}

function deserializeTheme(raw: unknown): PresentationTheme {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THEME }
  const t = raw as Record<string, unknown>
  return {
    id: typeof t.id === 'string' ? t.id : DEFAULT_THEME.id,
    name: typeof t.name === 'string' ? t.name : DEFAULT_THEME.name,
    primaryColor: typeof t.primaryColor === 'string' ? t.primaryColor : DEFAULT_THEME.primaryColor,
    secondaryColor: typeof t.secondaryColor === 'string' ? t.secondaryColor : DEFAULT_THEME.secondaryColor,
    accentColor: typeof t.accentColor === 'string' ? t.accentColor : DEFAULT_THEME.accentColor,
    backgroundColor: typeof t.backgroundColor === 'string' ? t.backgroundColor : DEFAULT_THEME.backgroundColor,
    textColor: typeof t.textColor === 'string' ? t.textColor : DEFAULT_THEME.textColor,
    headingFontFamily: typeof t.headingFontFamily === 'string' ? t.headingFontFamily : DEFAULT_THEME.headingFontFamily,
    bodyFontFamily: typeof t.bodyFontFamily === 'string' ? t.bodyFontFamily : DEFAULT_THEME.bodyFontFamily,
  }
}

function deserializeSettings(raw: unknown): PresentationSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const s = raw as Record<string, unknown>
  const validRatios: AspectRatio[] = ['16:9', '4:3', 'custom']
  return {
    aspectRatio: validRatios.includes(s.aspectRatio as AspectRatio) ? (s.aspectRatio as AspectRatio) : DEFAULT_SETTINGS.aspectRatio,
    customWidth: typeof s.customWidth === 'number' ? s.customWidth : undefined,
    customHeight: typeof s.customHeight === 'number' ? s.customHeight : undefined,
    defaultFontFamily: typeof s.defaultFontFamily === 'string' ? s.defaultFontFamily : DEFAULT_SETTINGS.defaultFontFamily,
    defaultFontSize: typeof s.defaultFontSize === 'number' ? s.defaultFontSize : DEFAULT_SETTINGS.defaultFontSize,
  }
}
