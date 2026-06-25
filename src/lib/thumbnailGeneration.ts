// Shared helpers for renderer-side thumbnail generation (Documents, Sheets,
// Boards, Slides). Keeps the per-fileId "only one job at a time" guarantee and
// the final downscale-to-thumbnail-size step in one place instead of
// duplicated per editor.

const inFlight = new Set<string>()

/**
 * Runs `generate` for `fileId` unless a generation job is already queued or
 * in progress for that same fileId — in which case the new request is
 * discarded outright (per spec: never queue a second job, just drop it).
 */
export async function runThumbnailGenerationOnce(fileId: string, generate: () => Promise<void>): Promise<void> {
  if (inFlight.has(fileId)) return
  inFlight.add(fileId)
  try {
    await generate()
  } catch {
    // Generation failures are silent no-ops — a missing/stale thumbnail just
    // falls back to the static placeholder, never surfaced to the user.
  } finally {
    inFlight.delete(fileId)
  }
}

/**
 * Clamps a DOMRect-shaped capture region to the visible viewport. The main
 * process's captureRegion handler rejects negative x/y outright (security
 * bound — never capture outside validated bounds), but a scrolled page
 * legitimately produces a negative rect.top/left for an element whose top
 * has scrolled above the viewport. Rather than let that throw and silently
 * drop the whole generation job, clamp to what's actually visible. Returns
 * null if nothing of the element is currently on-screen.
 */
export function clampRectToViewport(rect: { x: number; y: number; width: number; height: number }):
  { x: number; y: number; width: number; height: number } | null {
  const x = Math.max(0, rect.x)
  const y = Math.max(0, rect.y)
  const right = Math.min(window.innerWidth, rect.x + rect.width)
  const bottom = Math.min(window.innerHeight, rect.y + rect.height)
  const width = right - x
  const height = bottom - y
  if (width <= 0 || height <= 0) return null
  return { x, y, width, height }
}

const THUMB_WIDTH = 560
const THUMB_HEIGHT = 315

/**
 * Downscales an arbitrary-resolution PNG/JPEG data URL (e.g. Excalidraw's
 * exportToBlob output, or a full-resolution html2canvas capture) to the
 * standard 560x315 thumbnail size and returns raw base64 PNG data.
 */
export async function downscaleToThumbnail(srcDataUrl: string): Promise<string> {
  const img = await loadImage(srcDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.drawImage(img, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
  const dataUrl = canvas.toDataURL('image/png')
  return dataUrl.split(',')[1] ?? ''
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for thumbnail downscale'))
    img.src = src
  })
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read blob'))
    reader.readAsDataURL(blob)
  })
}
