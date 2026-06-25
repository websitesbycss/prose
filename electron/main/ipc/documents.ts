import { ipcMain } from 'electron'
import {
  createDocument,
  updateDocument,
  deleteDocument,
  resolveDocument,
  getAllDocumentsFromIndex,
  getFolderStats,
  changeDocumentsFolder,
  getDocumentsFolder,
  setDocumentsFolder,
  type ProseFileDocument,
} from '../services/fileService'
import { getAllIndexRows } from '../services/indexDb'
import { shell, dialog, BrowserWindow } from 'electron'
import { validateFolderPath } from '../lib/pathValidation'

const VALID_FORMATS = new Set(['none', 'mla', 'apa', 'chicago', 'ieee'])
const VALID_FILE_TYPES = new Set(['document', 'sheet', 'board', 'slides'])

function docToOut(doc: ProseFileDocument) {
  return {
    id: doc.id,
    title: doc.title,
    content: JSON.stringify(doc.content),
    format: doc.format,
    fileType: doc.fileType ?? 'document',
    wordCountGoal: doc.wordCountGoal,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    categoryId: doc.categoryId,
    headerContent: doc.headerContent != null ? JSON.stringify(doc.headerContent) : null,
    footerContent: doc.footerContent != null ? JSON.stringify(doc.footerContent) : null,
    pageMargins: doc.pageMargins ?? null,
  }
}

function dashboardDocToOut(doc: ReturnType<typeof getAllDocumentsFromIndex>[0]) {
  return {
    id: doc.id,
    title: doc.title,
    content: '{}',  // not used by the dashboard card (it uses pre-computed wordCount)
    format: doc.format,
    fileType: doc.fileType,
    wordCountGoal: null,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    categoryId: doc.categoryId,
    headerContent: null,
    footerContent: null,
    wordCount: doc.wordCount,
    hasThumbnail: doc.hasThumbnail,
  }
}

export function registerDocumentHandlers(): void {
  ipcMain.handle('documents:getAll', () => {
    return getAllDocumentsFromIndex().map(dashboardDocToOut)
  })

  ipcMain.handle('documents:getById', async (_, id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const resolved = await resolveDocument(id)
    if (!resolved) return null
    return docToOut(resolved.doc)
  })

  ipcMain.handle('documents:create', async (_, data: unknown) => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>

    if (typeof d.title !== 'string' || !d.title.trim()) throw new Error('title is required')
    const fileType = typeof d.fileType === 'string' && VALID_FILE_TYPES.has(d.fileType) ? (d.fileType as 'document' | 'sheet' | 'board' | 'slides') : 'document'
    const format = typeof d.format === 'string' && VALID_FORMATS.has(d.format) ? d.format : 'none'
    const _wcg = d.wordCountGoal != null ? Number(d.wordCountGoal) : null
    const wordCountGoal = _wcg != null && isFinite(_wcg) ? Math.max(0, Math.min(999_999, Math.round(_wcg))) : null
    const categoryId = typeof d.categoryId === 'string' ? d.categoryId : null
    const headerContent = d.headerContent != null ? parseJsonField(d.headerContent) : null
    const footerContent = d.footerContent != null ? parseJsonField(d.footerContent) : null
    const pageMargins = isValidMargins(d.pageMargins) ? (d.pageMargins as { top: number; right: number; bottom: number; left: number }) : null

    let content: unknown = { type: 'doc', content: [] }
    if (typeof d.content === 'string' && d.content !== '{}') {
      try { content = JSON.parse(d.content) } catch { /* use empty */ }
    }

    const doc = await createDocument({
      title: d.title.trim(),
      fileType,
      format,
      content,
      headerContent,
      footerContent,
      pageMargins,
      wordCountGoal,
      categoryId,
    })

    return docToOut(doc)
  })

  ipcMain.handle('documents:update', async (event, id: unknown, data: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    if (!data || typeof data !== 'object') throw new Error('Invalid update payload')
    const d = data as Record<string, unknown>

    const resolved = await resolveDocument(id)
    if (!resolved) throw new Error('Document not found')
    const { doc } = resolved

    const patch: Partial<ProseFileDocument> = {}

    if (typeof d.title === 'string' && d.title.trim()) {
      const newTitle = d.title.trim()
      const duplicate = getAllIndexRows().find(
        (r) => r.id !== id && r.title.toLowerCase() === newTitle.toLowerCase()
      )
      if (duplicate) throw new Error('DUPLICATE_TITLE')
      patch.title = newTitle
    }
    if (typeof d.format === 'string' && VALID_FORMATS.has(d.format)) patch.format = d.format
    if ('wordCountGoal' in d) {
      const _wcg2 = d.wordCountGoal != null ? Number(d.wordCountGoal) : null
      patch.wordCountGoal = _wcg2 != null && isFinite(_wcg2) ? Math.max(0, Math.min(999_999, Math.round(_wcg2))) : null
    }
    if ('categoryId' in d) patch.categoryId = typeof d.categoryId === 'string' ? d.categoryId : null
    if ('headerContent' in d) {
      patch.headerContent = d.headerContent != null ? parseJsonField(d.headerContent) : null
    }
    if ('footerContent' in d) {
      patch.footerContent = d.footerContent != null ? parseJsonField(d.footerContent) : null
    }
    if ('pageMargins' in d) {
      patch.pageMargins = isValidMargins(d.pageMargins) ? (d.pageMargins as { top: number; right: number; bottom: number; left: number }) : null
    }

    let snapshotOptions: { force?: boolean; label?: string | null } | undefined
    let newContent: unknown | undefined
    if (typeof d.content === 'string') {
      try { newContent = JSON.parse(d.content) } catch { newContent = doc.content }
      patch.content = newContent
      snapshotOptions = {
        force: d.forceSnapshot === true,
        label:
          typeof d.snapshotLabel === 'string' ? d.snapshotLabel :
          d.snapshotLabel === null ? null :
          undefined,
      }
    }

    const updatedDoc = await updateDocument(
      id,
      patch,
      snapshotOptions ? { snapshot: snapshotOptions } : undefined,
    )

    // Only a real content save should regenerate the thumbnail — title/format/
    // margin-only patches leave the rendered content (and its thumbnail) unchanged.
    // Sent back to the same renderer that owns the live editor DOM/canvas needed
    // to capture it, not broadcast to every window.
    if ('content' in patch) {
      event.sender.send('thumbnail:generate', id)
    }

    return docToOut(updatedDoc)
  })

  ipcMain.handle('documents:delete', async (_, id: unknown) => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    await deleteDocument(id)
  })

  ipcMain.handle('documents:getStorageInfo', async () => {
    return getFolderStats()
  })

  ipcMain.handle('documents:changeFolder', async (_event, newPath: unknown, moveFiles: unknown) => {
    if (typeof newPath !== 'string' || !newPath) throw new Error('Invalid folder path')
    validateFolderPath(newPath)
    const shouldMove = moveFiles === true
    await changeDocumentsFolder(newPath, shouldMove)
  })

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

  ipcMain.handle('documents:setFolder', async (_, folder: unknown) => {
    if (typeof folder !== 'string' || !folder) throw new Error('Invalid folder')
    validateFolderPath(folder)
    setDocumentsFolder(folder)
  })

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

function isValidMargins(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return ['top', 'right', 'bottom', 'left'].every((k) => typeof m[k] === 'number' && (m[k] as number) >= 0)
}
