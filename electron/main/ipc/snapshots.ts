import { ipcMain } from 'electron'
import { resolveDocument, writeProseFile, updateDocument, countWordsFromContent } from '../services/fileService'
import { upsertIndex, getIndexRow } from '../services/indexDb'

interface SnapshotOut {
  id: string
  documentId: string
  content: string
  headerContent: string | null
  footerContent: string | null
  wordCount: number
  createdAt: string
  label: string | null
}

export function registerSnapshotHandlers(): void {
  ipcMain.handle('snapshots:getByDocument', async (_, documentId: unknown): Promise<SnapshotOut[]> => {
    if (typeof documentId !== 'string' || !documentId) throw new Error('Invalid documentId')
    const resolved = await resolveDocument(documentId)
    if (!resolved) return []
    return resolved.doc.snapshots
      .slice()
      .reverse()  // newest first
      .map((s) => ({
        id: s.id,
        documentId,
        content: JSON.stringify(s.content),
        headerContent: s.headerContent != null ? JSON.stringify(s.headerContent) : null,
        footerContent: s.footerContent != null ? JSON.stringify(s.footerContent) : null,
        wordCount: s.wordCount,
        createdAt: s.createdAt,
        label: s.label,
      }))
  })

  ipcMain.handle('snapshots:restore', async (_, snapshotId: unknown): Promise<void> => {
    if (typeof snapshotId !== 'string' || !snapshotId) throw new Error('Invalid snapshotId')

    // Find document containing this snapshot
    for (const row of getAllIndexRows()) {
      const resolved = await resolveDocument(row.id)
      if (!resolved) continue
      const snap = resolved.doc.snapshots.find((s) => s.id === snapshotId)
      if (!snap) continue

      const now = new Date().toISOString()
      const updated = {
        ...resolved.doc,
        content: snap.content,
        headerContent: 'headerContent' in snap ? snap.headerContent : resolved.doc.headerContent,
        footerContent: 'footerContent' in snap ? snap.footerContent : resolved.doc.footerContent,
        updatedAt: now,
      }
      await writeProseFile(resolved.filePath, updated)

      const indexRow = getIndexRow(row.id)
      if (indexRow) {
        upsertIndex({ ...indexRow, word_count: countWordsFromContent(snap.content), updated_at: now })
      }
      return
    }
    throw new Error('Snapshot not found')
  })

  ipcMain.handle('snapshots:delete', async (_, snapshotId: unknown): Promise<void> => {
    if (typeof snapshotId !== 'string' || !snapshotId) throw new Error('Invalid snapshotId')

    for (const row of getAllIndexRows()) {
      const resolved = await resolveDocument(row.id)
      if (!resolved) continue
      const idx = resolved.doc.snapshots.findIndex((s) => s.id === snapshotId)
      if (idx === -1) continue
      const snapshots = resolved.doc.snapshots.filter((s) => s.id !== snapshotId)
      await writeProseFile(resolved.filePath, { ...resolved.doc, snapshots })
      return
    }
  })

  ipcMain.handle('snapshots:deleteAll', async (_, documentId: unknown): Promise<void> => {
    if (typeof documentId !== 'string' || !documentId) throw new Error('Invalid documentId')
    const resolved = await resolveDocument(documentId)
    if (!resolved) return
    await writeProseFile(resolved.filePath, { ...resolved.doc, snapshots: [] })
  })
}
