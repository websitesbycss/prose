import { ipcMain, dialog } from 'electron'
import { readFile } from 'fs/promises'
import { extname } from 'path'

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp']

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:openImage', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: 'Insert image',
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }],
      properties: ['openFile'],
    })

    if (result.canceled || !result.filePaths[0]) return null

    const filePath = result.filePaths[0]
    const ext = extname(filePath).slice(1).toLowerCase()
    const mime = MIME[ext] ?? 'image/png'
    const buffer = await readFile(filePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
  })
}
