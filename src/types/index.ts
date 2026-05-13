export interface Document {
  id: string
  title: string
  content: string
  format: 'none' | 'mla' | 'apa' | 'chicago' | 'ieee'
  wordCountGoal: number | null
  createdAt: string
  updatedAt: string
  categoryId: string | null
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
}

export type OllamaStatus = 'ready' | 'loading' | 'unavailable'

export type DocumentFormat = Document['format']

export interface CreateDocumentInput {
  title: string
  format?: DocumentFormat
  categoryId?: string | null
  wordCountGoal?: number | null
}

export interface UpdateDocumentInput {
  title?: string
  content?: string
  format?: DocumentFormat
  wordCountGoal?: number | null
  categoryId?: string | null
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

export interface DownloadStatus {
  downloaded: boolean
  model: string
}

export interface DownloadProgress {
  percent: number
  speed: number
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

export interface CreateCitationInput {
  documentId: string
  type: Citation['type']
  fields: CitationFields
  formatted: Citation['formatted']
}

export interface ProseAPI {
  documents: {
    getAll(): Promise<Document[]>
    getById(id: string): Promise<Document | null>
    create(data: CreateDocumentInput): Promise<Document>
    update(id: string, data: UpdateDocumentInput): Promise<Document>
    delete(id: string): Promise<void>
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
  }
  export: {
    toDocx(id: string): Promise<void>
    toPdf(id: string): Promise<void>
    toMarkdown(id: string): Promise<void>
    toPlainText(id: string): Promise<void>
  }
  citations: {
    getByDocument(documentId: string): Promise<Citation[]>
    create(data: CreateCitationInput): Promise<Citation>
    delete(id: string): Promise<void>
    fetchByDoi(doi: string): Promise<CitationFields | null>
    fetchByUrl(url: string): Promise<CitationFields | null>
  }
  settings: {
    get(): Promise<AppSettings>
    set(data: Partial<AppSettings>): Promise<void>
  }
  ollama: {
    getDownloadStatus(): Promise<DownloadStatus>
    startDownload(): Promise<void>
    onDownloadProgress(callback: (progress: DownloadProgress) => void): void
  }
}

declare global {
  interface Window {
    prose: ProseAPI
  }
}
