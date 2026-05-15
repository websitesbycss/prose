import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

interface SnapshotRow {
  id: string
  document_id: string
  content: string
  word_count: number
  created_at: string
  label: string | null
}

interface SnapshotOut {
  id: string
  documentId: string
  content: string
  wordCount: number
  createdAt: string
  label: string | null
}

function rowToSnapshot(row: SnapshotRow): SnapshotOut {
  return {
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    wordCount: row.word_count,
    createdAt: row.created_at,
    label: row.label,
  }
}

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text' && typeof n.text === 'string') return n.text
  if (Array.isArray(n.content)) {
    return (n.content as unknown[]).map(extractText).join(' ')
  }
  return ''
}

function countWordsFromContent(content: string): number {
  try {
    const json = JSON.parse(content) as unknown
    const text = extractText(json).trim()
    return text ? text.split(/\s+/).length : 0
  } catch {
    return 0
  }
}

const TWO_MINUTES_MS = 2 * 60 * 1000
const MIN_WORD_DELTA = 10
const MAX_SNAPSHOTS = 20

export function tryCreateSnapshot(db: Database, documentId: string, content: string): void {
  const wordCount = countWordsFromContent(content)

  const latest = db
    .prepare(
      'SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY created_at DESC LIMIT 1'
    )
    .get(documentId) as SnapshotRow | undefined

  if (latest) {
    const timeDiff = Date.now() - new Date(latest.created_at).getTime()
    const wordDiff = Math.abs(wordCount - latest.word_count)
    if (timeDiff < TWO_MINUTES_MS || wordDiff < MIN_WORD_DELTA) return
  }
  // No prior snapshot — create the first one with no threshold

  const id = randomUUID()
  const createdAt = new Date().toISOString()
  db.prepare(
    'INSERT INTO document_snapshots (id, document_id, content, word_count, created_at, label) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, documentId, content, wordCount, createdAt, null)

  // Prune oldest snapshots if over the limit
  const { c } = db
    .prepare('SELECT COUNT(*) as c FROM document_snapshots WHERE document_id = ?')
    .get(documentId) as { c: number }
  if (c > MAX_SNAPSHOTS) {
    db.prepare(
      `DELETE FROM document_snapshots WHERE id IN (
         SELECT id FROM document_snapshots WHERE document_id = ? ORDER BY created_at ASC LIMIT ?
       )`
    ).run(documentId, c - MAX_SNAPSHOTS)
  }
}

export function registerSnapshotHandlers(db: Database): void {
  ipcMain.handle('snapshots:getByDocument', (_, documentId: unknown): SnapshotOut[] => {
    if (typeof documentId !== 'string' || !documentId) throw new Error('Invalid documentId')
    const rows = db
      .prepare(
        'SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY created_at DESC'
      )
      .all(documentId) as SnapshotRow[]
    return rows.map(rowToSnapshot)
  })

  ipcMain.handle('snapshots:restore', (_, snapshotId: unknown): void => {
    if (typeof snapshotId !== 'string' || !snapshotId) throw new Error('Invalid snapshotId')
    const snap = db
      .prepare('SELECT * FROM document_snapshots WHERE id = ?')
      .get(snapshotId) as SnapshotRow | undefined
    if (!snap) throw new Error('Snapshot not found')
    db.prepare('UPDATE documents SET content = ?, updated_at = ? WHERE id = ?').run(
      snap.content,
      new Date().toISOString(),
      snap.document_id
    )
  })

  ipcMain.handle('snapshots:delete', (_, snapshotId: unknown): void => {
    if (typeof snapshotId !== 'string' || !snapshotId) throw new Error('Invalid snapshotId')
    db.prepare('DELETE FROM document_snapshots WHERE id = ?').run(snapshotId)
  })

  ipcMain.handle('snapshots:deleteAll', (_, documentId: unknown): void => {
    if (typeof documentId !== 'string' || !documentId) throw new Error('Invalid documentId')
    db.prepare('DELETE FROM document_snapshots WHERE document_id = ?').run(documentId)
  })
}
