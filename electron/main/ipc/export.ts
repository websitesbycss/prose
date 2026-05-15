import { ipcMain, dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import type Database from 'better-sqlite3'
import { exportToDocx, exportToPdf, exportToMarkdown, exportToPlainText } from '../services/exporter'

export function registerExportHandlers(db: Database.Database): void {
  ipcMain.handle('export:toDocx', async (_event, id: string) => {
    await exportToDocx(db, id)
  })

  ipcMain.handle('export:toPdf', async (_event, id: string) => {
    await exportToPdf(db, id)
  })

  ipcMain.handle('export:toMarkdown', async (_event, id: string) => {
    await exportToMarkdown(db, id)
  })

  ipcMain.handle('export:toPlainText', async (_event, id: string) => {
    await exportToPlainText(db, id)
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
