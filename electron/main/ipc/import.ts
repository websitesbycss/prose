import { ipcMain, dialog, BrowserWindow } from 'electron'
import { extname } from 'path'
import {
  importProseFile,
  importMarkdownFile,
  importDocxFile,
  importSpreadsheetFile,
  importPptxFile,
  resolveDocument,
  type ProseFileDocument,
} from '../services/fileService'
import { getAllIndexRows } from '../services/indexDb'
import { validateImportFilePath } from '../lib/pathValidation'

const IMPORT_EXTS = [
  '.prose',
  '.md',
  '.markdown',
  '.docx',
  '.xlsx',
  '.xls',
  '.csv',
  '.pptx',
  '.ppt',
]

const IMPORT_DIALOG_FILTERS: Electron.FileFilter[] = [
  {
    name: 'All supported',
    extensions: ['prose', 'md', 'markdown', 'docx', 'xlsx', 'xls', 'csv', 'pptx', 'ppt'],
  },
  { name: 'Prose files', extensions: ['prose'] },
  { name: 'Documents', extensions: ['md', 'markdown', 'docx'] },
  { name: 'Spreadsheets', extensions: ['xlsx', 'xls', 'csv'] },
  { name: 'Presentations', extensions: ['pptx', 'ppt'] },
]

function docToOut(doc: ProseFileDocument): {
  id: string
  title: string
  content: string
  format: string
  fileType: string
  wordCountGoal: number | null
  createdAt: string
  updatedAt: string
  headerContent: string | null
  footerContent: string | null
} {
  return {
    id: doc.id,
    title: doc.title,
    content: JSON.stringify(doc.content),
    format: doc.format,
    fileType: doc.fileType ?? 'document',
    wordCountGoal: doc.wordCountGoal,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    headerContent: doc.headerContent != null ? JSON.stringify(doc.headerContent) : null,
    footerContent: doc.footerContent != null ? JSON.stringify(doc.footerContent) : null,
  }
}

async function importOneFile(filePath: string): Promise<ProseFileDocument> {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.prose') return importProseFile(filePath)
  if (ext === '.md' || ext === '.markdown') return importMarkdownFile(filePath)
  if (ext === '.docx') return importDocxFile(filePath)
  if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') return importSpreadsheetFile(filePath)
  if (ext === '.pptx' || ext === '.ppt') return importPptxFile(filePath)
  throw new Error(`Unsupported file type: ${ext}`)
}

export function registerImportHandlers(): void {
  // Called with explicit file paths (drag-and-drop) or no args (opens picker)
  ipcMain.handle('documents:importFiles', async (event, filePaths: unknown) => {
    let paths: string[]

    if (Array.isArray(filePaths) && filePaths.every((p) => typeof p === 'string')) {
      paths = (filePaths as string[]).map((p) => {
        validateImportFilePath(p, IMPORT_EXTS)
        return p
      })
    } else {
      const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
      const result = await dialog.showOpenDialog(win!, {
        title: 'Import files',
        filters: IMPORT_DIALOG_FILTERS,
        properties: ['openFile', 'multiSelections'],
      })
      if (result.canceled || !result.filePaths.length) return { imported: [], errors: [] }
      paths = result.filePaths
    }

    const results: ReturnType<typeof docToOut>[] = []
    const errors: string[] = []

    for (const filePath of paths) {
      try {
        const doc = await importOneFile(filePath)
        results.push(docToOut(doc))
      } catch (err) {
        errors.push(`${filePath}: ${(err as Error).message}`)
        console.error('[import] Failed to import', filePath, err)
      }
    }

    return { imported: results, errors }
  })

  // Open a .prose file by path (used by file association handler in main/index.ts)
  ipcMain.handle('documents:openByPath', async (_, filePath: unknown) => {
    if (typeof filePath !== 'string') throw new Error('Invalid path')
    validateImportFilePath(filePath, ['.prose'])

    // If already in index, return existing doc
    for (const row of getAllIndexRows()) {
      if (row.file_path === filePath) {
        const resolved = await resolveDocument(row.id)
        if (resolved) return docToOut(resolved.doc)
      }
    }

    // Not in index — import it
    const doc = await importProseFile(filePath)
    return docToOut(doc)
  })
}
