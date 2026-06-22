import { app } from 'electron'
import { readFile, writeFile, rename, unlink, readdir, stat, mkdir, access } from 'fs/promises'
import { join, basename, extname, dirname } from 'path'
import { randomUUID } from 'crypto'
import { getSettingJson, setSetting } from './settingsDb'
import { upsertIndex, removeFromIndex, getIndexRow, getAllIndexRows, IndexRow } from './indexDb'
import { isSheetContent, countSheetCells, createInitialSheetContent } from '../lib/sheetContent'
import { isBoardContent, countBoardElements, createInitialBoardContent } from '../lib/boardContent'
import { isSlidesContent, countSlidesInContent, createInitialSlidesContent } from '../lib/slidesContent'
import { parseSpreadsheetFile } from '../lib/spreadsheetImport'
import { parsePptxFile } from '../ipc/slidesImport'

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
  fileType: 'document' | 'sheet' | 'board' | 'slides'
  format: string
  content: unknown  // Tiptap JSONContent or Sheet/Board JSON
  headerContent: unknown | null
  footerContent: unknown | null
  pageMargins: { top: number; right: number; bottom: number; left: number } | null
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

async function generateUniqueFilePath(title: string, folder: string): Promise<{ filePath: string; resolvedTitle: string }> {
  const base = sanitizeFilename(title)
  const candidate = join(folder, `${base}.prose`)
  try {
    await access(candidate)
  } catch {
    return { filePath: candidate, resolvedTitle: title }
  }
  // File exists — find next available sequential number
  for (let n = 2; n <= 999; n++) {
    const numberedTitle = `${title} (${n})`
    const numbered = join(folder, `${sanitizeFilename(numberedTitle)}.prose`)
    try {
      await access(numbered)
    } catch {
      return { filePath: numbered, resolvedTitle: numberedTitle }
    }
  }
  // Extreme fallback (should never be reached in practice)
  const fb = `${title} (${randomUUID().slice(0, 8)})`
  return { filePath: join(folder, `${sanitizeFilename(fb)}.prose`), resolvedTitle: fb }
}

// ── Core file I/O ─────────────────────────────────────────────────────────────

export async function readProseFile(filePath: string): Promise<ProseFileDocument> {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw) as ProseFileDocument
}

/** Serializes writes to the same path so concurrent .tmp renames cannot collide. */
const fileWriteQueues = new Map<string, Promise<void>>()

export async function writeProseFile(filePath: string, doc: ProseFileDocument): Promise<void> {
  const prev = fileWriteQueues.get(filePath) ?? Promise.resolve()
  const run = async (): Promise<void> => {
    const dir = dirname(filePath)
    await mkdir(dir, { recursive: true })
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(doc), 'utf8')
    try {
      await rename(tmpPath, filePath)
    } catch (err) {
      try {
        await unlink(tmpPath)
      } catch {
        /* tmp may already be gone after a concurrent rename */
      }
      throw err
    }
  }
  const next = prev.catch(() => {}).then(run)
  fileWriteQueues.set(filePath, next)
  try {
    await next
  } finally {
    if (fileWriteQueues.get(filePath) === next) {
      fileWriteQueues.delete(filePath)
    }
  }
}

/** Serializes read-modify-write updates per document id (body, header, footer, etc.). */
const documentUpdateLocks = new Map<string, Promise<unknown>>()

async function withDocumentUpdateLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const prev = documentUpdateLocks.get(id) ?? Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  documentUpdateLocks.set(id, next)
  try {
    return (await next) as T
  } finally {
    if (documentUpdateLocks.get(id) === next) {
      documentUpdateLocks.delete(id)
    }
  }
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
      // Recount in case the stored word_count is stale (e.g. from a past import bug)
      const freshCount = countWordsFromContent(doc.content)
      if (freshCount !== row.word_count) {
        upsertIndex({ ...row, word_count: freshCount, file_type: doc.fileType ?? row.file_type ?? 'document' })
      }
      return { doc, filePath: row.file_path }
    } catch {
      // File not at indexed path — fall through to scan
    }
  }

  // Scan folder for the document by ID
  const found = await scanFolderForId(id)
  if (!found) return null

  upsertIndex({
    id: found.doc.id,
    title: found.doc.title,
    file_path: found.filePath,
    format: found.doc.format,
    word_count: countWordsFromContent(found.doc.content),
    category_id: found.doc.categoryId,
    created_at: found.doc.createdAt,
    updated_at: found.doc.updatedAt,
    file_type: found.doc.fileType ?? 'document',
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
  fileType?: 'document' | 'sheet' | 'board' | 'slides'
  format: string
  content?: unknown
  headerContent?: unknown | null
  footerContent?: unknown | null
  pageMargins?: { top: number; right: number; bottom: number; left: number } | null
  wordCountGoal?: number | null
  categoryId?: string | null
}): Promise<ProseFileDocument> {
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  const id = randomUUID()
  const now = new Date().toISOString()
  const fileType = data.fileType ?? 'document'
  const defaultContent =
    fileType === 'sheet' ? createInitialSheetContent()
    : fileType === 'board' ? createInitialBoardContent()
    : fileType === 'slides' ? createInitialSlidesContent()
    : { type: 'doc', content: [] }
  const content = data.content ?? defaultContent

  const doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: data.title,
    fileType,
    format: data.format ?? 'none',
    content,
    headerContent: data.headerContent ?? null,
    footerContent: data.footerContent ?? null,
    pageMargins: data.pageMargins ?? null,
    wordCountGoal: data.wordCountGoal ?? null,
    categoryId: data.categoryId ?? null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const { filePath } = await generateUniqueFilePath(data.title, folder)
  await writeProseFile(filePath, doc)

  upsertIndex({
    id,
    title: doc.title,
    file_path: filePath,
    format: doc.format,
    word_count: countUnitsFromContent(content, fileType),
    category_id: doc.categoryId,
    created_at: now,
    updated_at: now,
    file_type: fileType,
  })

  return doc
}

export async function updateDocument(
  id: string,
  patch: Partial<Omit<ProseFileDocument, 'id' | 'version' | 'createdAt' | 'citations' | 'snapshots'>>,
  options?: { snapshot?: { force?: boolean; label?: string | null } },
): Promise<ProseFileDocument> {
  return withDocumentUpdateLock(id, async () => {
    const resolved = await resolveDocument(id)
    if (!resolved) throw new Error('Document not found')

    const { doc, filePath } = resolved
    const now = new Date().toISOString()
    let updated: ProseFileDocument = {
      ...doc,
      ...patch,
      id,
      version: PROSE_FILE_VERSION,
      createdAt: doc.createdAt,
      updatedAt: now,
      citations: doc.citations,
      snapshots: doc.snapshots,
    }

    if (options?.snapshot && 'content' in patch && (updated.fileType ?? 'document') === 'document') {
      updated = tryAddSnapshot(updated, updated.content, options.snapshot)
    }

    await writeProseFile(filePath, updated)

    upsertIndex({
      id,
      title: updated.title,
      file_path: filePath,
      format: updated.format,
      word_count: 'content' in patch ? countUnitsFromContent(updated.content, updated.fileType ?? 'document') : getIndexRow(id)?.word_count ?? 0,
      category_id: updated.categoryId,
      created_at: updated.createdAt,
      updated_at: now,
      file_type: updated.fileType ?? 'document',
    })

    return updated
  })
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
  fileType: 'document' | 'sheet' | 'board' | 'slides'
  wordCount: number
  categoryId: string | null
  createdAt: string
  updatedAt: string
}

export function getAllDocumentsFromIndex(): DashboardDocument[] {
  return getAllIndexRows().map(rowToDashboard)
}

function rowToDashboard(row: IndexRow): DashboardDocument {
  const ft = row.file_type
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    fileType: (ft === 'sheet' || ft === 'board' || ft === 'slides') ? ft : 'document',
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
        file_type: doc.fileType ?? 'document',
      })
    } catch { /* skip bad files */ }
  }
}

// Rename any legacy UUID-suffixed files (e.g. "My Doc (a1b2c3d4).prose") to
// clean sequential names ("My Doc.prose" or "My Doc (2).prose").
export async function renameUuidSuffixedFiles(): Promise<void> {
  const folder = getDocumentsFolder()
  let entries: string[]
  try { entries = await readdir(folder) } catch { return }

  const uuidPattern = /^(.+)\s\([0-9a-f]{8}\)\.prose$/i

  for (const entry of entries) {
    const match = uuidPattern.exec(entry)
    if (!match) continue

    const baseTitle = match[1]!
    const oldPath = join(folder, entry)

    let doc: ProseFileDocument
    try { doc = await readProseFile(oldPath) } catch { continue }

    try {
      const { filePath: newPath, resolvedTitle } = await generateUniqueFilePath(baseTitle, folder)
      await rename(oldPath, newPath)
      const titleChanged = resolvedTitle !== doc.title
      if (titleChanged) await writeProseFile(newPath, { ...doc, title: resolvedTitle })
      upsertIndex({
        id: doc.id,
        title: titleChanged ? resolvedTitle : doc.title,
        file_path: newPath,
        format: doc.format,
        word_count: getIndexRow(doc.id)?.word_count ?? countUnitsFromContent(doc.content, doc.fileType ?? 'document'),
        category_id: doc.categoryId,
        created_at: doc.createdAt,
        updated_at: doc.updatedAt,
        file_type: doc.fileType ?? 'document',
      })
    } catch (err) {
      console.error('[migration] Failed to rename', entry, err)
    }
  }
}

// ── Folder disk usage ─────────────────────────────────────────────────────────

export async function getFolderStats(): Promise<{ folder: string; totalBytes: number; documentCount: number; accessible: boolean }> {
  const folder = getDocumentsFolder()
  let totalBytes = 0
  let documentCount = 0
  let accessible = false
  try {
    await access(folder)
    accessible = true
    const entries = await readdir(folder)
    for (const entry of entries) {
      if (!entry.endsWith('.prose')) continue
      try {
        const info = await stat(join(folder, entry))
        totalBytes += info.size
        documentCount++
      } catch { /* skip */ }
    }
  } catch { /* folder missing or inaccessible */ }
  return { folder, totalBytes, documentCount, accessible }
}

// ── Change documents folder ───────────────────────────────────────────────────

export async function changeDocumentsFolder(newFolder: string, moveFiles: boolean): Promise<void> {
  const oldFolder = getDocumentsFolder()
  await mkdir(newFolder, { recursive: true })

  if (moveFiles) {
    let entries: string[] = []
    try { entries = await readdir(oldFolder) } catch { /* no old folder */ }

    const moved: Array<{ oldPath: string; newPath: string }> = []
    for (const entry of entries) {
      if (!entry.endsWith('.prose')) continue
      const oldPath = join(oldFolder, entry)
      const newPath = join(newFolder, entry)
      const content = await readFile(oldPath)
      await writeFile(newPath, content)
      moved.push({ oldPath, newPath })
    }

    for (const { oldPath } of moved) {
      try { await unlink(oldPath) } catch { /* best-effort */ }
    }

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
  let newDoc: ProseFileDocument = {
    ...doc,
    id,
    version: PROSE_FILE_VERSION,
    createdAt: doc.createdAt ?? now,
    updatedAt: now,
    citations: (doc.citations ?? []).map((c) => ({ ...c, id: randomUUID() })),
    snapshots: [],
  }

  const { filePath: destPath, resolvedTitle } = await generateUniqueFilePath(newDoc.title, folder)
  if (resolvedTitle !== newDoc.title) newDoc = { ...newDoc, title: resolvedTitle }
  await writeProseFile(destPath, newDoc)
  upsertIndex({
    id,
    title: newDoc.title,
    file_path: destPath,
    format: newDoc.format,
    word_count: countUnitsFromContent(newDoc.content, newDoc.fileType ?? 'document'),
    category_id: newDoc.categoryId,
    created_at: newDoc.createdAt,
    updated_at: newDoc.updatedAt,
    file_type: newDoc.fileType ?? 'document',
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

  let doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: titleFromFilename,
    fileType: 'document',
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    pageMargins: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const { filePath: destPath, resolvedTitle } = await generateUniqueFilePath(doc.title, folder)
  if (resolvedTitle !== doc.title) doc = { ...doc, title: resolvedTitle }
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
    file_type: 'document',
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

  let doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: titleFromFilename,
    fileType: 'document',
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    pageMargins: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const { filePath: destPath, resolvedTitle } = await generateUniqueFilePath(doc.title, folder)
  if (resolvedTitle !== doc.title) doc = { ...doc, title: resolvedTitle }
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
    file_type: 'document',
  })
  return doc
}

export async function importSpreadsheetFile(filePath: string): Promise<ProseFileDocument> {
  const content = await parseSpreadsheetFile(filePath)
  const titleFromFilename = basename(filePath, extname(filePath))
  const id = randomUUID()
  const now = new Date().toISOString()
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  let doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: titleFromFilename,
    fileType: 'sheet',
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    pageMargins: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const { filePath: destPath, resolvedTitle } = await generateUniqueFilePath(doc.title, folder)
  if (resolvedTitle !== doc.title) doc = { ...doc, title: resolvedTitle }
  await writeProseFile(destPath, doc)
  upsertIndex({
    id,
    title: doc.title,
    file_path: destPath,
    format: doc.format,
    word_count: countSheetCells(content),
    category_id: null,
    created_at: now,
    updated_at: now,
    file_type: 'sheet',
  })
  return doc
}

export async function importPptxFile(filePath: string): Promise<ProseFileDocument> {
  const parsed = await parsePptxFile(filePath)
  const content = JSON.parse(parsed.content) as unknown
  const id = randomUUID()
  const now = new Date().toISOString()
  const folder = getDocumentsFolder()
  await mkdir(folder, { recursive: true })

  let doc: ProseFileDocument = {
    version: PROSE_FILE_VERSION,
    id,
    title: parsed.title,
    fileType: 'slides',
    format: 'none',
    content,
    headerContent: null,
    footerContent: null,
    pageMargins: null,
    wordCountGoal: null,
    categoryId: null,
    createdAt: now,
    updatedAt: now,
    citations: [],
    snapshots: [],
  }

  const { filePath: destPath, resolvedTitle } = await generateUniqueFilePath(doc.title, folder)
  if (resolvedTitle !== doc.title) doc = { ...doc, title: resolvedTitle }
  await writeProseFile(destPath, doc)
  upsertIndex({
    id,
    title: doc.title,
    file_path: destPath,
    format: doc.format,
    word_count: isSlidesContent(content) ? countSlidesInContent(content) : 0,
    category_id: null,
    created_at: now,
    updated_at: now,
    file_type: 'slides',
  })
  return doc
}

// ── Word count ─────────────────────────────────────────────────────────────────

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    const children = n.content as unknown[]
    // If every direct child is a text node, join with '' so that
    // character-level text nodes (from old markdown imports) concatenate
    // into "hello world" instead of "h e l l o   w o r l d".
    const allInline = children.every((c) => (c as { type?: string }).type === 'text')
    return children.map(extractText).join(allInline ? '' : ' ')
  }
  return ''
}

export function countWordsFromContent(content: unknown): number {
  const text = extractText(content).trim()
  return text ? text.split(/\s+/).length : 0
}

/** Unified content unit counter — words for documents, cells for sheets, elements for boards, slide count for slides. */
export function countUnitsFromContent(content: unknown, fileType: string): number {
  if (fileType === 'sheet') {
    return isSheetContent(content) ? countSheetCells(content) : 0
  }
  if (fileType === 'board') {
    return isBoardContent(content) ? countBoardElements(content) : 0
  }
  if (fileType === 'slides') {
    return isSlidesContent(content) ? countSlidesInContent(content) : 0
  }
  return countWordsFromContent(content)
}

// ── Snapshot helpers ──────────────────────────────────────────────────────────

const TWO_MINUTES_MS = 2 * 60 * 1000
const MIN_WORD_DELTA = 10
const MAX_SNAPSHOTS = 20

export function tryAddSnapshot(
  doc: ProseFileDocument,
  content: unknown,
  options?: { label?: string | null; force?: boolean },
): ProseFileDocument {
  const wordCount = countWordsFromContent(content)
  const latest = doc.snapshots[doc.snapshots.length - 1]
  const force = options?.force === true

  if (!force && latest) {
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
    label: options?.label ?? null,
  }

  let snapshots = [...doc.snapshots, newSnapshot]
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots = snapshots.slice(snapshots.length - MAX_SNAPSHOTS)
  }

  return { ...doc, snapshots }
}

export async function restoreDocumentSnapshot(snapshotId: string): Promise<{ documentId: string }> {
  if (typeof snapshotId !== 'string' || !snapshotId) throw new Error('Invalid snapshotId')

  for (const row of getAllIndexRows()) {
    const resolved = await resolveDocument(row.id)
    if (!resolved) continue
    if (!resolved.doc.snapshots.some((s) => s.id === snapshotId)) continue

    await withDocumentUpdateLock(row.id, async () => {
      const fresh = await resolveDocument(row.id)
      if (!fresh) throw new Error('Document not found')
      const snap = fresh.doc.snapshots.find((s) => s.id === snapshotId)
      if (!snap) throw new Error('Snapshot not found')

      const now = new Date().toISOString()
      const updated: ProseFileDocument = {
        ...fresh.doc,
        content: snap.content,
        headerContent: 'headerContent' in snap ? snap.headerContent : fresh.doc.headerContent,
        footerContent: 'footerContent' in snap ? snap.footerContent : fresh.doc.footerContent,
        updatedAt: now,
      }
      await writeProseFile(fresh.filePath, updated)

      const indexRow = getIndexRow(row.id)
      if (indexRow) {
        upsertIndex({
          ...indexRow,
          word_count: countUnitsFromContent(snap.content, fresh.doc.fileType ?? 'document'),
          updated_at: now,
        })
      }
    })

    return { documentId: row.id }
  }

  throw new Error('Snapshot not found')
}

// ── Markdown → Tiptap ─────────────────────────────────────────────────────────

function markdownToTiptap(md: string): unknown {
  const lines = md.split('\n')
  const nodes: unknown[] = []

  for (const line of lines) {
    // Blank lines are paragraph separators in markdown — skip them
    if (!line.trim()) continue

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

    const inline = inlineMarkdownToTiptap(line)
    nodes.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' })
  }

  // Always return at least one empty paragraph so Tiptap has a valid document
  return { type: 'doc', content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }] }
}

function inlineMarkdownToTiptap(text: string): unknown[] {
  if (!text) return []
  const nodes: unknown[] = []
  // Match bold, italic, inline code, then greedily consume plain text runs.
  // The plain-text alternative [^*`]+ is greedy so "hello world" becomes one
  // node instead of one node per character (which would inflate word counts).
  // A stray * or ` that didn't open a pattern is also captured as plain text.
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+|[*`])/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[1]) nodes.push({ type: 'text', text: match[1], marks: [{ type: 'bold' }] })
    else if (match[2]) nodes.push({ type: 'text', text: match[2], marks: [{ type: 'italic' }] })
    else if (match[3]) nodes.push({ type: 'text', text: match[3], marks: [{ type: 'code' }] })
    else if (match[4]) nodes.push({ type: 'text', text: match[4] })
    if (!match[0]) break
  }
  return nodes
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
