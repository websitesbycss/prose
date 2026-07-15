export interface PageMargins {
  top: number    // inches
  right: number  // inches
  bottom: number // inches
  left: number   // inches
}

export type FileType = 'document' | 'sheet' | 'board' | 'slides'

export type { SheetContent, SheetTab, SheetCell, SheetCellFormat, SheetMergedCell } from './sheet'
export { isSheetContent, countSheetCells, createInitialSheetContent } from './sheet'
export type { BoardContent } from './board'
export { isBoardContent, createInitialBoardContent, countBoardElements } from './board'
export type {
  SlidesContent, Slide, SlideElement, SlideBackground, SlideTransition, ElementAnimation,
  PresentationTheme, PresentationSettings,
  TextElement, ShapeElement, ImageElement, TableElement, EquationElement,
  CodeBlockElement, VideoElement, AiGraphicElement,
  ShapeType, TextAlignH, TextAlignV, TextOverflow, AspectRatio,
  TableCell, TableCellStyle, ElementShadow, ElementBorder, Gradient,
  AnimationCategory, AnimationEffect, AnimationTriggerMode, TransitionType, TransitionDirection,
} from './slides'
export { isSlidesContent, createInitialSlidesContent, countSlidesInContent, DEFAULT_THEME, DEFAULT_SETTINGS, SLIDE_BASE_WIDTH, SLIDE_BASE_HEIGHT } from './slides'

export interface Document {
  id: string
  title: string
  content: string
  format: 'none' | 'mla' | 'apa' | 'chicago' | 'ieee'
  fileType?: FileType
  wordCountGoal: number | null
  createdAt: string
  updatedAt: string
  headerContent: string | null
  footerContent: string | null
  pageMargins: PageMargins | null
  // Present on dashboard listing (pre-computed from index)
  wordCount?: number
  hasThumbnail?: boolean
}

export interface Citation {
  id: string
  documentId: string
  type: 'book' | 'article' | 'website' | 'journal'
  fields: Record<string, string>
  formatted: {
    mla: string
    apa: string
    chicago: string
    ieee: string
  }
  createdAt: string
}

export interface AppSettings {
  theme: 'dark' | 'light'
  defaultFormat: Document['format']
  wordCountExcludesHeader: boolean
  defaultWordCountGoal: number | null
  ollamaModel: string
  pomodoroWorkMinutes: number
  pomodoroBreakMinutes: number
  musicVolume: number
  ambientVolumes: Record<string, number>
  typewriterMode: boolean
  editorFontFamily: string
  editorFontSize: number
  headingFontSizes: { h1: number; h2: number; h3: number }
  lightAccentColor?: string
  darkAccentColor?: string
  uiScale?: number
  slidesSnapEnabled?: boolean
  slidesSnapToCanvas?: boolean
  slidesSnapToElements?: boolean
  slidesSnapEqualSpacing?: boolean
  slidesRightPanelWidth?: number
}

export type OllamaStatus = 'ready' | 'loading' | 'unavailable'

export type DocumentFormat = Document['format']

export interface CreateDocumentInput {
  title: string
  content?: string
  fileType?: FileType
  format?: DocumentFormat
  wordCountGoal?: number | null
  headerContent?: string | null
  footerContent?: string | null
  pageMargins?: PageMargins | null
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
  format?: DocumentFormat
  wordCountGoal?: number | null
  headerContent?: string | null
  footerContent?: string | null
  pageMargins?: PageMargins | null
}

export interface AiSelectionAttachment {
  id: string
  text: string
  from: number
  to: number
}

export interface AiPromptPayload {
  documentContent: string
  assignmentContext?: string
  request: string
  selectionContent?: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  fileType?: 'document' | 'sheet' | 'board' | 'slides' | 'sheet-insights' | 'generate'
  /** Base64 image payloads (no `data:` prefix), attached to the current turn only. */
  images?: string[]
}

/** Color group an issue is bucketed into for the Issues panel + highlights. */
export type IssueColorGroup = 'spelling' | 'wordChoice' | 'style' | 'repetition' | 'misc'

export interface Issue {
  id: string
  type: IssueColorGroup
  /** Harper's human-readable lint category, e.g. "Spelling", "Repetition". */
  category: string
  quote: string
  message: string
  suggestion: string
  /** Character offsets into the document's flat text content (see src/lib/issueSpan.ts). */
  span: { start: number; end: number }
}

export interface DownloadStatus {
  downloaded: boolean
  model: string
}

export interface DownloadProgress {
  percent: number
  speed: number
  status: string
}

export interface InstallProgress {
  percent: number
  status: string
}

export interface CitationFields {
  author?: string
  title?: string
  year?: string
  publisher?: string
  journal?: string
  url?: string
  pages?: string
  volume?: string
  issue?: string
}

export interface Snapshot {
  id: string
  documentId: string
  content: string
  headerContent: string | null
  footerContent: string | null
  wordCount: number
  createdAt: string
  label: string | null
}

export interface CreateCitationInput {
  documentId: string
  type: Citation['type']
  fields: CitationFields
  formatted: Citation['formatted']
}

export interface StorageInfo {
  folder: string
  totalBytes: number
  documentCount: number
  accessible: boolean
}

export type MigrationStatus = 'not_needed' | 'needed' | 'running' | 'complete' | 'error'

export interface MigrationProgress {
  status: MigrationStatus
  current: number
  total: number
  label: string
}

export interface ImportResult {
  imported: Document[]
  errors: string[]
}

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'markdown' | 'plaintext'
  fileName: string
  pageSize: 'Letter' | 'A4' | 'Legal'
  orientation: 'portrait' | 'landscape'
  margins: PageMargins
  colorMode?: 'light' | 'dark'
  includeHeader: boolean
  includeFooter: boolean
  openAfterExport: boolean
}

export interface ProseAPI {
  dialog: {
    openImage(): Promise<string | null>
  }
  documents: {
    getAll(): Promise<Document[]>
    getById(id: string): Promise<Document | null>
    create(data: CreateDocumentInput): Promise<Document>
    update(id: string, data: UpdateDocumentInput): Promise<Document>
    delete(id: string): Promise<void>
    getStorageInfo(): Promise<StorageInfo>
    changeFolder(newPath: string, moveFiles: boolean): Promise<void>
    pickFolder(): Promise<string | null>
    setFolder(folder: string): Promise<void>
    openFolder(): Promise<void>
    importFiles(filePaths?: string[]): Promise<ImportResult>
    openByPath(filePath: string): Promise<Document>
    folderAccessible(): Promise<boolean>
  }
  ai: {
    prompt(payload: AiPromptPayload): Promise<string>
    getStatus(): Promise<OllamaStatus>
    getModelCapabilities(): Promise<{ model: string; multimodal: boolean }>
    isModelLoaded(): Promise<boolean>
    streamPrompt(payload: AiPromptPayload, onChunk: (chunk: string) => void, onError: (msg: string) => void): Promise<void>
  }
  export: {
    getPreviewHtml(id: string, opts: ExportOptions): Promise<string | null>
    getPreviewPdf(id: string, opts: ExportOptions): Promise<string | null>
    getPreviewDocx(id: string, opts: ExportOptions): Promise<string | null>
    run(id: string, opts: ExportOptions): Promise<void>
    saveImage(src: string): Promise<void>
  }
  win: {
    minimize(): void
    maximize(): void
    unmaximize(): void
    close(): void
    isMaximized(): Promise<boolean>
    subscribeMaximize(cb: (isMaximized: boolean) => void): () => void
    startMove(offset: { offsetX: number; offsetY: number }): void
    stopMove(): void
    setFullscreen(fullscreen: boolean): void
    isFullscreen(): Promise<boolean>
    setSnapLayout(layout: string): Promise<void>
    setTitleBarOverlay(theme: 'dark' | 'light'): Promise<void>
    usesNativeControls(): Promise<boolean>
    getContentScreenOffset(): Promise<{ x: number; y: number }>
    onLeaveFullscreen(cb: () => void): () => void
  }
  tabdrag: {
    detach(docId: string): void
    cancel(): void
    finalize(pos?: { screenX: number; screenY: number }): void
    registerTabBarBounds(rect: { x: number; y: number; width: number; height: number }): void
    onDetached(cb: (data: { docId: string }) => void): () => void
    onReturn(cb: (data: { screenX: number }) => void): () => void
    onMerge(cb: (data: { docId: string; screenX: number }) => void): () => void
    onDropHover(cb: (data: { active: boolean; screenX?: number }) => void): () => void
  }
  citations: {
    getByDocument(documentId: string): Promise<Citation[]>
    create(data: CreateCitationInput): Promise<Citation>
    update(id: string, data: Record<string, unknown>): Promise<Citation>
    delete(id: string): Promise<void>
    fetchByDoi(doi: string): Promise<CitationFields | null>
    fetchByUrl(url: string): Promise<CitationFields | null>
    fetchByIsbn(isbn: string): Promise<CitationFields | null>
  }
  settings: {
    get(): Promise<AppSettings>
    set(data: Partial<AppSettings>): Promise<void>
  }
  snapshots: {
    getByDocument(documentId: string): Promise<Snapshot[]>
    restore(snapshotId: string): Promise<void>
    delete(snapshotId: string): Promise<void>
    deleteAll(documentId: string): Promise<void>
  }
  ollama: {
    checkInstalled(): Promise<boolean>
    installOllama(): Promise<void>
    onInstallProgress(callback: (progress: InstallProgress) => void): () => void
    listModels(): Promise<string[]>
    getDownloadStatus(): Promise<DownloadStatus>
    startDownload(): Promise<void>
    onDownloadProgress(callback: (progress: DownloadProgress) => void): () => void
  }
  migration: {
    getStatus(): Promise<MigrationProgress>
    onProgress(callback: (progress: MigrationProgress) => void): () => void
  }
  app: {
    onOpenFile(callback: (filePath: string) => void): () => void
  }
  thumbnails: {
    getDataUrl(fileId: string): Promise<string | null>
    save(fileId: string, pngBase64: string): Promise<{ ok: boolean; error?: string }>
    delete(fileId: string): Promise<void>
    captureRegion(rect: { x: number; y: number; width: number; height: number }): Promise<string>
    onGenerate(callback: (fileId: string) => void): () => void
    onReady(callback: (fileId: string) => void): () => void
  }
  spell: {
    check(word: string): Promise<{ correct: boolean; suggestions: string[] }>
    checkBatch(words: string[]): Promise<Record<string, { correct: boolean; suggestions: string[] }>>
    getWords(documentId: string): Promise<string[]>
    addWord(documentId: string, word: string): Promise<string[]>
    removeWord(documentId: string, word: string): Promise<string[]>
  }
  slides: {
    getSlides(fileId: string): Promise<import('./slides').Slide[]>
    updateSlides(fileId: string, slides: import('./slides').Slide[]): Promise<void>
    addSlide(fileId: string, afterIndex: number): Promise<import('./slides').Slide>
    deleteSlide(fileId: string, slideId: string): Promise<void>
    duplicateSlide(fileId: string, slideId: string): Promise<import('./slides').Slide>
    reorderSlides(fileId: string, slideIds: string[]): Promise<void>
    updateTheme(fileId: string, theme: import('./slides').PresentationTheme): Promise<void>
    exportPptx(content: import('./slides').SlidesContent, title: string): Promise<void>
    exportPng(content: import('./slides').SlidesContent, title: string): Promise<void>
    saveExportBytes(base64: string, filename: string, format: string): Promise<void>
    importPptx(): Promise<{ title: string; content: string } | null>
  }
  platform: NodeJS.Platform
}

declare global {
  interface Window {
    prose: ProseAPI
  }
}
