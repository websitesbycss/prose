export interface PageMargins {
  top: number    // inches
  right: number  // inches
  bottom: number // inches
  left: number   // inches
}

export interface Document {
  id: string
  title: string
  content: string
  format: 'none' | 'mla' | 'apa' | 'chicago' | 'ieee'
  wordCountGoal: number | null
  createdAt: string
  updatedAt: string
  categoryId: string | null
  headerContent: string | null
  footerContent: string | null
  pageMargins: PageMargins | null
  // Present on dashboard listing (pre-computed from index)
  wordCount?: number
}

export interface Category {
  id: string
  name: string
  color: string
  createdAt: string
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
}

export type OllamaStatus = 'ready' | 'loading' | 'unavailable'

export type DocumentFormat = Document['format']

export interface CreateDocumentInput {
  title: string
  content?: string
  format?: DocumentFormat
  categoryId?: string | null
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
  categoryId?: string | null
  headerContent?: string | null
  footerContent?: string | null
  pageMargins?: PageMargins | null
}

export interface CreateCategoryInput {
  name: string
  color: string
}

export interface UpdateCategoryInput {
  name?: string
  color?: string
}

export interface AiPromptPayload {
  documentContent: string
  assignmentContext?: string
  request: string
}

export interface Issue {
  id: string
  type: 'error' | 'clarity' | 'style'
  category: string
  quote: string
  message: string
  suggestion: string
}

export interface AnalysisResult {
  issues: Issue[]
  tone: string
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
  categories: {
    getAll(): Promise<Category[]>
    create(data: CreateCategoryInput): Promise<Category>
    update(id: string, data: UpdateCategoryInput): Promise<Category>
    delete(id: string): Promise<void>
  }
  ai: {
    prompt(payload: AiPromptPayload): Promise<string>
    getStatus(): Promise<OllamaStatus>
    streamPrompt(payload: AiPromptPayload, onChunk: (chunk: string) => void): Promise<void>
    analyze(payload: { documentContent: string; assignmentContext?: string }): Promise<AnalysisResult>
  }
  export: {
    toDocx(id: string): Promise<void>
    toPdf(id: string): Promise<void>
    toMarkdown(id: string): Promise<void>
    toPlainText(id: string): Promise<void>
    saveImage(src: string): Promise<void>
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
}

declare global {
  interface Window {
    prose: ProseAPI
  }
}
