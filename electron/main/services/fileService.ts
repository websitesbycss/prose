import { app } from 'electron'
import { readFile, writeFile, rename, unlink, readdir, stat, mkdir, access } from 'fs/promises'
import { join, basename, extname, dirname } from 'path'
import { randomUUID } from 'crypto'
import { getSettingJson, setSetting } from './settingsDb'
import { upsertIndex, removeFromIndex, getIndexRow, getAllIndexRows, IndexRow } from './indexDb'

// ── .prose file schema ────────────────────────────────────────────────────────

export const PROSE_FILE_VERSION = 1

export interface ProseFileCitation {
  id: string
  type: string
  fields: Record<string, unknown>
  formatted: { mla: string; apa: string; chicago: string; ieee: string }
  createdAt: string
}

export interface ProseFileSnapshot {
  id: string
  content: unknown  // Tiptap JSONContent object
  headerContent: unknown | null
  footerContent: unknown | null
  wordCount: number
  createdAt: string
  label: string | null
}

export interface ProseFileDocument {
  version: typeof PROSE_FILE_VERSION
  id: string
  title: string
  format: string
  content: unknown  // Tiptap JSONContent object
  headerContent: unknown | null
  footerContent: unknown | null
  wordCountGoal: number | null
  categoryId: string | null
  createdAt: string
  updatedAt: string
  citations: ProseFileCitation[]
  snapshots: ProseFileSnapshot[]
}

// ── Folder resolution ─────────────────────────────────────────────────────────

export function getDocumentsFolder(): string {
  const configured = getSettingJson<string | null>('documentsFolder', null)
  if (configured) return configured
  return join(app.getPath('documents'), 'Prose')
}

export function setDocumentsFolder(folder: string): void {
  setSetting('documentsFolder', JSON.stringify(folder))
}

export async function ensureDocumentsFolderExists(): Promise<void> {
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })
}

export async function isDocumentsFolderAccessible(): Promise<boolean> {
  try {
    await access(getDocumentsFolder())
    return true
  } catch {
    return false
  }
}

// ── Filename helpers ──────────────────────────────────────────────────────────

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'Untitled'
}

async function generateFilePath(title: string, folder: string): Promise<string> {
  const base = sanitizeFilename(title)
  const candidate = join(folder, `${base}.prose`)
  try {
    await access(candidate)
    // File exists — append a short ID suffix
    return join(folder, `${base} (${randomUUID().slice(0, 8)}).prose`)
  } catch {
    return candidate
  }
}

// ── Core file I/O ─────────────────────────────────────────────────────────────

export async function readProseFile(filePath: string): Promise<ProseFileDocument> {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as ProseFileDocument
}

export async function writeProseFile(filePath: string, doc: ProseFileDocument): Promise<void> {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp`
  await writeFile(tmpPath, JSON.stringify(doc, null, 2), 'utf8')
  await rename(tmpPath, filePath)
}

export async function deleteProseFile(filePath: string): Promise<void> {
  try { await unlink(filePath) } catch { /* already gone */ }
}

// ── Index-backed document access ──────────────────────────────────────────────

export async function resolveDocument(id: string): Promise<{ doc: ProseFileDocument; filePath: string } | null> {
  const row = getIndexRow(id)
  if (row) {
    try {
      const doc = await readProseFile(row.file_path)
      return { doc, filePath: row.file_path }
    } catch {
      // File not at indexed path — fall through to scan
    }
  }

  // Scan folder for the document by ID
  const found = await scanFolderForId(id)
  if (!found) return null

  // Update index with recovered path
  upsertIndex({
    id: found.doc.id,
    title: found.doc.title,
    file_path: found.filePath,
    format: found.doc.format,
    word_count: countWordsFromContent(found.doc.content),
    category_id: found.doc.categoryId,
    created_at: found.doc.createdAt,
    updated_at: found.doc.updatedAt,
  })
  return found
}

async function scanFolderForId(id: string): Promise<{ doc: ProseFileDocument; filePath: string } | null> {
  const folder = getDocumentsFolder()
  try {
    const entries = await readdir(folder)
    for (const entry of entries) {
      if (!entry.endsWith('.prose')) continue
      const filePath = join(folder, entry)
      try {
        const doc = await readProseFile(filePath)
        if (doc.id === id) return { doc, filePath }
      } catch { /* skip unreadable files */ }
    }
  } catch { /* folder inaccessible */ }
  return null
}

// ── Document creation / update ────────────────────────────────────────────────

export async function createDocument(data: {
  title: string
  format: string
  content?: unknown
  headerContent?: unknown | null
  footerContent?: unknown | null
  wordCountGoal?: number | null
  categoryId?: string | null
}): Promise<ProseFileDocument> {
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  const id = randomUUID()
  const now = new Date().toISOString()
  const emptyDoc = { type: 'doc', content: [] }
  const content = data.content ?? emptyDoc

  const doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: data.title,
    format: data.format ?? 'none',
    content,
    headerContent: data.headerContent ?? null,
    footerContent: data.footerContent ?? null,
    wordCountGoal: data.wordCountGoal ?? null,
    categoryId: data.categoryId ?? null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const filePath = await generateFilePath(data.title, folder)
  await writeProseFile(filePath, doc)

  upsertIndex({
    id,
    title: doc.title,
    file_path: filePath,
    format: doc.format,
    word_count: countWordsFromContent(content),
    category_id: doc.categoryId,
    created_at: now,
    updated_at: now,
  })

  return doc
}

export async function updateDocument(
  id: string,
  patch: Partial<Omit<ProseFileDocument, 'id' | 'version' | 'createdAt' | 'citations' | 'snapshots'>>
): Promise<ProseFileDocument> {
  const resolved = await resolveDocument(id)
  if (!resolved) throw new Error('Document not found')

  const { doc, filePath } = resolved
  const now = new Date().toISOString()
  const updated: ProseFileDocument = {
    ...doc,
    ...patch,
    id,
    version: PROSE_FILE_VERSION,
    createdAt: doc.createdAt,
    updatedAt: now,
    citations: doc.citations,
    snapshots: doc.snapshots,
  }

  await writeProseFile(filePath, updated)

  upsertIndex({
    id,
    title: updated.title,
    file_path: filePath,
    format: updated.format,
    word_count: 'content' in patch ? countWordsFromContent(updated.content) : getIndexRow(id)?.word_count ?? 0,
    category_id: updated.categoryId,
    created_at: updated.createdAt,
    updated_at: now,
  })

  return updated
}

export async function deleteDocument(id: string): Promise<void> {
  const resolved = await resolveDocument(id)
  if (resolved) await deleteProseFile(resolved.filePath)
  removeFromIndex(id)
}

// ── Dashboard listing (index only) ───────────────────────────────────────────

export interface DashboardDocument {
  id: string
  title: string
  format: string
  wordCount: number
  categoryId: string | null
  createdAt: string
  updatedAt: string
}

export function getAllDocumentsFromIndex(): DashboardDocument[] {
  return getAllIndexRows().map(rowToDashboard)
}

function rowToDashboard(row: IndexRow): DashboardDocument {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    wordCount: row.word_count,
    categoryId: row.category_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// ── Folder scan / index rebuild ───────────────────────────────────────────────

export async function rebuildIndexFromFolder(): Promise<void> {
  const folder = getDocumentsFolder()
  let entries: string[] = []
  try { entries = await readdir(folder) } catch { return }

  for (const entry of entries) {
    if (!entry.endsWith('.prose')) continue
    const filePath = join(folder, entry)
    try {
      const doc = await readProseFile(filePath)
      upsertIndex({
        id: doc.id,
        title: doc.title,
        file_path: filePath,
        format: doc.format,
        word_count: countWordsFromContent(doc.content),
        category_id: doc.categoryId,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt,
      })
    } catch { /* skip bad files */ }
  }
}

// ── Folder disk usage ─────────────────────────────────────────────────────────

export async function getFolderStats(): Promise<{ folder: string; totalSize: number; documentCount: number }> {
  const folder = getDocumentsFolder()
  let totalSize = 0
  let documentCount = 0
  try {
    const entries = await readdir(folder)
    for (const entry of entries) {
      if (!entry.endsWith('.prose')) continue
      try {
        const info = await stat(join(folder, entry))
        totalSize += info.size
        documentCount++
      } catch { /* skip */ }
    }
  } catch { /* folder missing */ }
  return { folder, totalSize, documentCount }
}

// ── Change documents folder ───────────────────────────────────────────────────

export async function changeDocumentsFolder(newFolder: string, moveFiles: boolean): Promise<void> {
  const oldFolder = getDocumentsFolder()
  await mkdir(newFolder, { recursive: true })

  if (moveFiles) {
    let entries: string[] = []
    try { entries = await readdir(oldFolder) } catch { /* no old folder */ }

    const moved: Array<{ oldPath: string; newPath: string }> = []
    // First pass: copy all .prose files and verify
    for (const entry of entries) {
      if (!entry.endsWith('.prose')) continue
      const oldPath = join(oldFolder, entry)
      const newPath = join(newFolder, entry)
      const content = await readFile(oldPath)
      await writeFile(newPath, content)
      moved.push({ oldPath, newPath })
    }

    // Second pass: delete originals only after all copies succeed
    for (const { oldPath } of moved) {
      try { await unlink(oldPath) } catch { /* best-effort */ }
    }

    // Update index paths
    for (const { newPath } of moved) {
      try {
        const doc = await readProseFile(newPath)
        const row = getIndexRow(doc.id)
        if (row) {
          upsertIndex({ ...row, file_path: newPath })
        }
      } catch { /* skip */ }
    }
  }

  setDocumentsFolder(newFolder)
}

// ── Import ─────────────────────────────────────────────────────────────────────

export async function importProseFile(filePath: string): Promise<ProseFileDocument> {
  const doc = await readProseFile(filePath)
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  // Assign a new ID to avoid conflicts, preserving content
  const id = randomUUID()
  const now = new Date().toISOString()
  const newDoc: ProseFileDocument = {
    ...doc,
    id,
    version: PROSE_FILE_VERSION,
    createdAt: doc.createdAt ?? now,
    updatedAt: now,
    citations: (doc.citations ?? []).map((c) => ({ ...c, id: randomUUID() })),
    snapshots: [],
  }

  const destPath = await generateFilePath(newDoc.title, folder)
  await writeProseFile(destPath, newDoc)
  upsertIndex({
    id,
    title: newDoc.title,
    file_path: destPath,
    format: newDoc.format,
    word_count: countWordsFromContent(newDoc.content),
    category_id: newDoc.categoryId,
    created_at: newDoc.createdAt,
    updated_at: newDoc.updatedAt,
  })
  return newDoc
}

export async function importMarkdownFile(filePath: string): Promise<ProseFileDocument> {
  const raw = await readFile(filePath, 'utf8')
  const titleFromFilename = basename(filePath, extname(filePath))
  const content = markdownToTiptap(raw)

  const id = randomUUID()
  const now = new Date().toISOString()
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  const doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: titleFromFilename,
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const destPath = await generateFilePath(doc.title, folder)
  await writeProseFile(destPath, doc)
  upsertIndex({
    id,
    title: doc.title,
    file_path: destPath,
    format: doc.format,
    word_count: countWordsFromContent(content),
    category_id: null,
    created_at: now,
    updated_at: now,
  })
  return doc
}

export async function importDocxFile(filePath: string): Promise<ProseFileDocument> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require('mammoth') as { convertToHtml(input: { path: string }): Promise<{ value: string }> }
  const result = await mammoth.convertToHtml({ path: filePath })
  const content = htmlToTiptap(result.value)

  const titleFromFilename = basename(filePath, extname(filePath))
  const id = randomUUID()
  const now = new Date().toISOString()
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  const doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: titleFromFilename,
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const destPath = await generateFilePath(doc.title, folder)
  await writeProseFile(destPath, doc)
  upsertIndex({
    id,
    title: doc.title,
    file_path: destPath,
    format: doc.format,
    word_count: countWordsFromContent(content),
    category_id: null,
    created_at: now,
    updated_at: now,
  })
  return doc
}

// ── Word count ─────────────────────────────────────────────────────────────────

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) return (n.content as unknown[]).map(extractText).join(' ')
  return ''
}

export function countWordsFromContent(content: unknown): number {
  const text = extractText(content).trim()
  return text ? text.split(/\s+/).length : 0
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

const TWO_MINUTES_MS = 2 * 60 * 1000
const MIN_WORD_DELTA = 10
const MAX_SNAPSHOTS = 20

export function tryAddSnapshot(doc: ProseFileDocument, content: unknown): ProseFileDocument {
  const wordCount = countWordsFromContent(content)
  const latest = doc.snapshots[doc.snapshots.length - 1]

  if (latest) {
    const timeDiff = Date.now() - new Date(latest.createdAt).getTime()
    const wordDiff = Math.abs(wordCount - latest.wordCount)
    if (timeDiff < TWO_MINUTES_MS || wordDiff < MIN_WORD_DELTA) return doc
  }

  const newSnapshot: ProseFileSnapshot = {
    id: randomUUID(),
    content,
    headerContent: doc.headerContent ?? null,
    footerContent: doc.footerContent ?? null,
    wordCount,
    createdAt: new Date().toISOString(),
    label: null,
  }

  let snapshots = [...doc.snapshots, newSnapshot]
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(snapshots.length - MAX_SNAPSHOTS)
  }

  return { ...doc, snapshots }
}

// ── Markdown → Tiptap ─────────────────────────────────────────────────────────

function markdownToTiptap(md: string): unknown {
  const lines = md.split('\n')
  const nodes: unknown[] = []

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1]!.length },
        content: inlineMarkdownToTiptap(headingMatch[2]!),
      })
      continue
    }

    if (line.startsWith('---') || line.startsWith('===')) continue

    nodes.push({
      type: 'paragraph',
      content: inlineMarkdownToTiptap(line),
    })
  }

  return { type: 'doc', content: nodes }
}

function inlineMarkdownToTiptap(text: string): unknown[] {
  const nodes: unknown[] = []
  // Process bold, italic, inline code
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(.+?))/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[2]) nodes.push({ type: 'text', text: match[2], marks: [{ type: 'bold' }] })
    else if (match[3]) nodes.push({ type: 'text', text: match[3], marks: [{ type: 'italic' }] })
    else if (match[4]) nodes.push({ type: 'text', text: match[4], marks: [{ type: 'code' }] })
    else if (match[5]) nodes.push({ type: 'text', text: match[5] })
    if (!match[0]) break
  }
  return nodes.length ? nodes : [{ type: 'text', text: '' }]
}

// ── HTML → Tiptap (for DOCX import via mammoth) ──────────────────────────────

function htmlToTiptap(html: string): unknown {
  const nodes: unknown[] = []
  // Split on block-level tags
  const blockRe = /<(p|h[1-6]|ul|ol|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  while ((match = blockRe.exec(html)) !== null) {
    const tag = match[1]!.toLowerCase()
    const inner = match[2]!.replace(/<[^>]+>/g, '').trim()
    if (!inner) continue

    if (/^h[1-6]$/.test(tag)) {
      nodes.push({
        type: 'heading',
        attrs: { level: parseInt(tag[1]!) },
        content: [{ type: 'text', text: decodeHtmlEntities(inner) }],
      })
    } else {
      nodes.push({
        type: 'paragraph',
        content: [{ type: 'text', text: decodeHtmlEntities(inner) }],
      })
    }
  }

  if (!nodes.length) {
    // Fallback: split by line
    for (const line of html.replace(/<[^>]+>/g, '\n').split('\n')) {
      const t = decodeHtmlEntities(line.trim())
      if (t) nodes.push({ type: 'paragraph', content: [{ type: 'text', text: t }] })
    }
  }

  return { type: 'doc', content: nodes }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}
