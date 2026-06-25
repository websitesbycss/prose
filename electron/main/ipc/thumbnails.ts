import { ipcMain, app, BrowserWindow } from 'electron'
import { mkdir, writeFile, unlink, readFile } from 'fs/promises'
import { join } from 'path'
import { getIndexRow, setHasThumbnail } from '../services/indexDb'

const THUMBNAILS_DIR = 'thumbnails'
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024 // 2MB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const THUMB_WIDTH = 560
const THUMB_HEIGHT = 315
const MAX_CAPTURE_DIMENSION = 4000

function thumbnailsDir(): string {
  return join(app.getPath('userData'), THUMBNAILS_DIR)
}

function thumbnailPath(fileId: string): string {
  return join(thumbnailsDir(), `${fileId}.thumb.png`)
}

async function ensureThumbnailsDir(): Promise<void> {
  await mkdir(thumbnailsDir(), { recursive: true })
}

function isValidPng(buf: Buffer): boolean {
  if (buf.length < PNG_MAGIC.length) return false
  return buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)
}

function isValidRect(rect: unknown): rect is { x: number; y: number; width: number; height: number } {
  if (!rect || typeof rect !== 'object') return false
  const r = rect as Record<string, unknown>
  for (const k of ['x', 'y', 'width', 'height']) {
    const v = r[k]
    if (typeof v !== 'number' || !isFinite(v) || v < 0) return false
  }
  const width = r.width as number
  const height = r.height as number
  if (width <= 0 || height <= 0) return false
  if (width > MAX_CAPTURE_DIMENSION || height > MAX_CAPTURE_DIMENSION) return false
  return true
}

export function registerThumbnailHandlers(): void {
  // Returns the thumbnail as a data: URL rather than a file:// path — the
  // renderer's origin is http://localhost in dev (Vite) and file:// only in
  // production, and Chromium blocks file:// resource loads from a non-file:
  // origin regardless of CSP. Reading the bytes over IPC and handing back a
  // data: URL works identically in both, and the actual file content can
  // still only be reached through this validated handler.
  ipcMain.handle('thumbnails:getDataUrl', async (_, fileId: unknown) => {
    if (typeof fileId !== 'string' || !fileId) throw new Error('Invalid fileId')
    try {
      const buf = await readFile(thumbnailPath(fileId))
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  // Validates everything itself and never throws — the renderer treats a
  // failed generation as a no-op, not an error to surface to the user.
  ipcMain.handle('thumbnails:save', async (_, fileId: unknown, pngBase64: unknown) => {
    if (typeof fileId !== 'string' || !fileId) return { ok: false, error: 'Invalid fileId' }
    if (typeof pngBase64 !== 'string' || !pngBase64) return { ok: false, error: 'Invalid image data' }

    const row = getIndexRow(fileId)
    if (!row) return { ok: false, error: 'File not found' }

    let buf: Buffer
    try {
      buf = Buffer.from(pngBase64, 'base64')
    } catch {
      return { ok: false, error: 'Invalid base64 data' }
    }
    if (!isValidPng(buf)) return { ok: false, error: 'Not a valid PNG' }
    if (buf.length > MAX_THUMBNAIL_BYTES) return { ok: false, error: 'Thumbnail too large' }

    try {
      await ensureThumbnailsDir()
      await writeFile(thumbnailPath(fileId), buf)
      setHasThumbnail(fileId, true)
    } catch {
      return { ok: false, error: 'Failed to write thumbnail' }
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('thumbnail:ready', fileId)
    }

    return { ok: true }
  })

  ipcMain.handle('thumbnails:delete', async (_, fileId: unknown) => {
    if (typeof fileId !== 'string' || !fileId) throw new Error('Invalid fileId')
    try { await unlink(thumbnailPath(fileId)) } catch { /* already gone */ }
    setHasThumbnail(fileId, false)
  })

  ipcMain.handle('thumbnails:captureRegion', async (event, rect: unknown) => {
    if (!isValidRect(rect)) throw new Error('Invalid capture region')

    const image = await event.sender.capturePage({
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    })
    const resized = image.resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT })
    return resized.toPNG().toString('base64')
  })
}
