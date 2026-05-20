import { ipcMain } from 'electron'
import {
  createDocument,
  updateDocument,
  deleteDocument,
  resolveDocument,
  getAllDocumentsFromIndex,
  countWordsFromContent,
  tryAddSnapshot,
  writeProseFile,
  getFolderStats,
  changeDocumentsFolder,
  getDocumentsFolder,
  setDocumentsFolder,
  type ProseFileDocument,
} from '../services/fileService'
import { upsertIndex } from '../services/indexDb'
import { shell, dialog, BrowserWindow } from 'electron'
import { extname } from 'path'

const VALID_FORMATS = new Set(['none', 'mla', 'apa', 'chicago', 'ieee'])

// Convert a full .prose file to the shape the renderer expects
function docToOut(doc: ProseFileDocument, filePath?: string) {
  return {
    id: doc.id,
    title: doc.title,
    content: JSON.stringify(doc.content),
    format: doc.format,
    wordCountGoal: doc.wordCountGoal,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    categoryId: doc.categoryId,
    headerContent: doc.headerContent != null ? JSON.stringify(doc.headerContent) : null,
    footerContent: doc.footerContent != null ? JSON.stringify(doc.footerContent) : null,
  }
}

// Convert dashboard index row to the minimum shape Dashboard.tsx needs
// (it only uses: id, title, format, wordCountGoal, createdAt, updatedAt, categoryId, content for word count)
function dashboardDocToOut(doc: ReturnType<typeof getAllDocumentsFromIndex>[0]) {
  return {
    id: doc.id,
    title: doc.title,
    content: '{}',  // not used by the dashboard card (it uses pre-computed wordCount)
    format: doc.format,
    wordCountGoal: null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    categoryId: doc.categoryId,
    headerContent: null,
    footerContent: null,
    // Extra field for dashboard word count display
    wordCount: doc.wordCount,
  }
}

export function registerDocumentHandlers(): void {
  // Dashboard — index only (fast)
  ipcMain.handle('documents:getAll', () => {
    return getAllDocumentsFromIndex().map(dashboardDocToOut)
  })

  // Editor — reads full file
  ipcMain.handle('documents:getById', async (_, id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const resolved = await resolveDocument(id)
    if (!resolved) return null
    return docToOut(resolved.doc, resolved.filePath)
  })

  ipcMain.handle('documents:create', async (_, data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>

    if (typeof d.title !== 'string' || !d.title.trim()) throw new Error('title is required')
    const format = typeof d.format === 'string' && VALID_FORMATS.has(d.format) ? d.format : 'none'
    const wordCountGoal = d.wordCountGoal != null ? Number(d.wordCountGoal) : null
    const categoryId = typeof d.categoryId === 'string' ? d.categoryId : null
    const headerContent = d.headerContent != null ? parseJsonField(d.headerContent) : null
    const footerContent = d.footerContent != null ? parseJsonField(d.footerContent) : null

    let content: unknown = { type: 'doc', content: [] }
    if (typeof d.content === 'string' && d.content !== '{}') {
      try { content = JSON.parse(d.content) } catch { /* use empty */ }
    }

    const doc = await createDocument({
      title: d.title.trim(),
      format,
      content,
      headerContent,
      footerContent,
      wordCountGoal,
      categoryId,
    })

    return docToOut(doc)
  })

  ipcMain.handle('documents:update', async (_, id: unknown, data: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    if (!data || typeof data !== 'object') throw new Error('Invalid update payload')
    const d = data as Record<string, unknown>

    const resolved = await resolveDocument(id)
    if (!resolved) throw new Error('Document not found')
    const { doc, filePath } = resolved

    const patch: Partial<ProseFileDocument> = {}

    if (typeof d.title === 'string' && d.title.trim()) patch.title = d.title.trim()
    if (typeof d.format === 'string' && VALID_FORMATS.has(d.format)) patch.format = d.format
    if ('wordCountGoal' in d) patch.wordCountGoal = d.wordCountGoal != null ? Number(d.wordCountGoal) : null
    if ('categoryId' in d) patch.categoryId = typeof d.categoryId === 'string' ? d.categoryId : null
    if ('headerContent' in d) {
      patch.headerContent = d.headerContent != null ? parseJsonField(d.headerContent) : null
    }
    if ('footerContent' in d) {
      patch.footerContent = d.footerContent != null ? parseJsonField(d.footerContent) : null
    }

    let newContent: unknown | undefined
    if (typeof d.content === 'string') {
      try { newContent = JSON.parse(d.content) } catch { newContent = doc.content }
      patch.content = newContent
    }

    const updatedDoc = await updateDocument(id, patch)

    // Auto-snapshot when content changes
    if (newContent !== undefined) {
      try {
        const withSnapshot = tryAddSnapshot(updatedDoc, updatedDoc.content)
        if (withSnapshot.snapshots.length !== updatedDoc.snapshots.length) {
          await writeProseFile(filePath, withSnapshot)
        }
      } catch (err) {
        console.error('[snapshots] tryAddSnapshot failed:', err)
      }
    }

    return docToOut(updatedDoc)
  })

  ipcMain.handle('documents:delete', async (_, id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    await deleteDocument(id)
  })

  // Storage info
  ipcMain.handle('documents:getStorageInfo', async () => {
    return getFolderStats()
  })

  // Change folder
  ipcMain.handle('documents:changeFolder', async (event, newPath: unknown, moveFiles: unknown) => {
    if (typeof newPath !== 'string' || !newPath) throw new Error('Invalid folder path')
    const shouldMove = moveFiles === true
    await changeDocumentsFolder(newPath, shouldMove)
  })

  // Pick and change folder via dialog
  ipcMain.handle('documents:pickFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Choose documents folder',
      defaultPath: getDocumentsFolder(),
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || !result.filePaths[0]) return null
    return result.filePaths[0]
  })

  // Set folder without moving files (used by onboarding)
  ipcMain.handle('documents:setFolder', async (_, folder: unknown) => {
    if (typeof folder !== 'string' || !folder) throw new Error('Invalid folder')
    setDocumentsFolder(folder)
  })

  // Open folder in File Explorer
  ipcMain.handle('documents:openFolder', async () => {
    shell.openPath(getDocumentsFolder())
  })
}

function parseJsonField(value: unknown): unknown {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return null }
  }
  if (typeof value === 'object') return value
  return null
}
