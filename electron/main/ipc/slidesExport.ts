import { ipcMain, BrowserWindow, shell, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { exportToPptx, showSaveDialog, type SlidesContentLike } from '../services/slidesExporter'

const MAX_CONTENT_SIZE = 50 * 1024 * 1024 // 50MB

function validateContent(raw: unknown): raw is { version: 1; slides: unknown[]; theme: unknown; settings: unknown } {
  if (!raw || typeof raw !== 'object') return false
  const c = raw as Record<string, unknown>
  return c.version === 1 && Array.isArray(c.slides)
}

export function registerSlidesExportHandlers(): void {
  // ── PPTX export ────────────────────────────────────────────────────────────

  ipcMain.handle('slides:exportPptx', async (_event, raw: unknown, title: unknown): Promise<void> => {
    if (typeof title !== 'string') throw new Error('Invalid title')
    if (!validateContent(raw)) throw new Error('Invalid slides content')
    const json = JSON.stringify(raw)
    if (json.length > MAX_CONTENT_SIZE) throw new Error('Content too large to export')
    const savePath = await showSaveDialog('pptx', title)
    if (!savePath) return
    await exportToPptx(raw as SlidesContentLike, savePath)
    shell.showItemInFolder(savePath)
  })

  // ── PNG legacy (window capture, kept for compatibility) ────────────────────

  ipcMain.handle('slides:exportPng', async (_event, _raw: unknown, title: unknown): Promise<void> => {
    if (typeof title !== 'string') throw new Error('Invalid title')
    const savePath = await showSaveDialog('png', title)
    if (!savePath) return
    const win = BrowserWindow.getFocusedWindow()
    if (!win) throw new Error('No window')
    const img = await win.webContents.capturePage()
    await writeFile(savePath, img.toPNG())
    shell.showItemInFolder(savePath)
  })

  // ── Save pre-rendered bytes (PDF / PNG / ZIP from renderer-side rasterizer) ─

  ipcMain.handle('slides:saveBytes', async (_event, base64: unknown, filename: unknown, format: unknown): Promise<void> => {
    if (typeof base64 !== 'string') throw new Error('Invalid data')
    if (typeof filename !== 'string') throw new Error('Invalid filename')
    if (typeof format !== 'string') throw new Error('Invalid format')

    const extMap: Record<string, string> = {
      pdf: 'PDF File', png: 'PNG Image', zip: 'ZIP Archive',
      xlsx: 'Excel Workbook', csv: 'CSV File',
    }
    const result = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [{ name: extMap[format] ?? format.toUpperCase(), extensions: [format] }],
    })
    if (result.canceled || !result.filePath) return

    const buf = Buffer.from(base64, 'base64')
    await writeFile(result.filePath, buf)
    shell.showItemInFolder(result.filePath)
  })
}
