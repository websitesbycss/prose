import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

interface DocumentRow {
  id: string
  title: string
  content: string
  format: string
  word_count_goal: number | null
  created_at: string
  updated_at: string
  category_id: string | null
}

interface DocumentOut {
  id: string
  title: string
  content: string
  format: string
  wordCountGoal: number | null
  createdAt: string
  updatedAt: string
  categoryId: string | null
}

const VALID_FORMATS = new Set(['none', 'mla', 'apa', 'chicago', 'ieee'])

function rowToDocument(row: DocumentRow): DocumentOut {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    format: row.format,
    wordCountGoal: row.word_count_goal,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id,
  }
}

export function registerDocumentHandlers(db: Database): void {
  ipcMain.handle('documents:getAll', (): DocumentOut[] => {
    const rows = db
      .prepare('SELECT * FROM documents ORDER BY updated_at DESC')
      .all() as DocumentRow[]
    return rows.map(rowToDocument)
  })

  ipcMain.handle('documents:getById', (_, id: unknown): DocumentOut | null => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const row = db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined
    return row ? rowToDocument(row) : null
  })

  ipcMain.handle('documents:create', (_, data: unknown): DocumentOut => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>

    if (typeof d.title !== 'string' || !d.title.trim()) throw new Error('title is required')
    const format = d.format !== undefined ? d.format : 'none'
    if (typeof format !== 'string' || !VALID_FORMATS.has(format)) throw new Error('Invalid format')

    const id = randomUUID()
    const now = new Date().toISOString()
    const content = typeof d.content === 'string' ? d.content : '{}'
    const wordCountGoal =
      d.wordCountGoal !== undefined && d.wordCountGoal !== null ? Number(d.wordCountGoal) : null
    const categoryId = typeof d.categoryId === 'string' ? d.categoryId : null

    db.prepare(
      `INSERT INTO documents (id, title, content, format, word_count_goal, created_at, updated_at, category_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, d.title.trim(), content, format, wordCountGoal, now, now, categoryId)

    return rowToDocument(
      db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow
    )
  })

  ipcMain.handle('documents:update', (_, id: unknown, data: unknown): DocumentOut => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    if (!data || typeof data !== 'object') throw new Error('Invalid update payload')
    const d = data as Record<string, unknown>

    const existing = db
      .prepare('SELECT * FROM documents WHERE id = ?')
      .get(id) as DocumentRow | undefined
    if (!existing) throw new Error('Document not found')

    const title =
      typeof d.title === 'string' && d.title.trim() ? d.title.trim() : existing.title
    const content = typeof d.content === 'string' ? d.content : existing.content
    const format =
      typeof d.format === 'string' && VALID_FORMATS.has(d.format) ? d.format : existing.format
    const wordCountGoal =
      d.wordCountGoal !== undefined
        ? d.wordCountGoal === null
          ? null
          : Number(d.wordCountGoal)
        : existing.word_count_goal
    const categoryId =
      'categoryId' in d
        ? d.categoryId === null
          ? null
          : typeof d.categoryId === 'string'
          ? d.categoryId
          : existing.category_id
        : existing.category_id

    db.prepare(
      `UPDATE documents
       SET title = ?, content = ?, format = ?, word_count_goal = ?, updated_at = ?, category_id = ?
       WHERE id = ?`
    ).run(title, content, format, wordCountGoal, new Date().toISOString(), categoryId, id)

    return rowToDocument(
      db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow
    )
  })

  ipcMain.handle('documents:delete', (_, id: unknown): void => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  })
}
