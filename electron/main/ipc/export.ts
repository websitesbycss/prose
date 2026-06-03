import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { writeFile } from 'fs/promises'
import {
  exportToDocx,
  exportToPdf,
  exportToMarkdown,
  exportToPlainText,
  getPreviewHtml,
  getPreviewPdf,
  getPreviewDocx,
  type ExportOptions,
} from '../services/exporter'

export function registerExportHandlers(): void {
  ipcMain.handle('export:getPreviewHtml', async (_event, id: unknown, opts: unknown): Promise<string | null> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    return getPreviewHtml(id, opts as ExportOptions)
  })

  ipcMain.handle('export:getPreviewDocx', async (_event, id: unknown, opts: unknown): Promise<string | null> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const buffer = await getPreviewDocx(id, opts as ExportOptions)
    return buffer ? buffer.toString('base64') : null
  })

  // Returns the PDF as a base64 string so it can be converted to a blob URL in the renderer.
  ipcMain.handle('export:getPreviewPdf', async (_event, id: unknown, opts: unknown): Promise<string | null> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const buffer = await getPreviewPdf(id, opts as ExportOptions)
    return buffer ? buffer.toString('base64') : null
  })

  ipcMain.handle('export:run', async (_event, id: unknown, opts: unknown): Promise<void> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid document id')
    const o = opts as ExportOptions
    let filePath: string | null = null

    switch (o.format) {
      case 'pdf':       filePath = await exportToPdf(id, o);       break
      case 'docx':      filePath = await exportToDocx(id, o);      break
      case 'markdown':  filePath = await exportToMarkdown(id, o);  break
      case 'plaintext': filePath = await exportToPlainText(id, o); break
      default: throw new Error(`Unknown format: ${o.format as string}`)
    }

    if (filePath && o.openAfterExport) {
      await shell.openPath(filePath)
    }
  })

  ipcMain.handle('export:saveImage', async (event, src: unknown): Promise<void> => {
    if (typeof src !== 'string') throw new Error('Invalid image src')

    const match = src.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!match) throw new Error('src must be a base64 data URL')
    const ext = match[1] ?? 'png'
    const base64Data = match[2] ?? ''

    const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Save Image',
      defaultPath: `image.${ext}`,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
    })

    if (result.canceled || !result.filePath) return
    await writeFile(result.filePath, Buffer.from(base64Data, 'base64'))
  })
}
