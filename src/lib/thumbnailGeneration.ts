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

export const THUMB_WIDTH = 560
export const THUMB_HEIGHT = 315

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

/**
 * Fits an arbitrary-aspect-ratio image into the standard 560x315 thumbnail
 * box by scaling to fully COVER the box (like CSS background-size: cover)
 * and cropping any excess off the right/bottom, anchored to the top-left —
 * never stretched/squished, and never left with blank padding either. Used
 * by Boards, since Excalidraw's exported bounding box can be any shape
 * depending what was drawn. Mirrors the equivalent nativeImage-based crop
 * the main process applies to Sheets' screenshot-based thumbnails.
 */
export async function coverCropToThumbnail(srcDataUrl: string): Promise<string> {
  const img = await loadImage(srcDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT)

  const scale = Math.max(THUMB_WIDTH / img.naturalWidth, THUMB_HEIGHT / img.naturalHeight)
  const scaledW = img.naturalWidth * scale
  const scaledH = img.naturalHeight * scale
  // Anchored top-left: draw at (0,0) so any excess crops off the right/bottom,
  // never the top/left — same "start at the top" convention Documents uses.
  ctx.drawImage(img, 0, 0, scaledW, scaledH)

  return canvas.toDataURL('image/png').split(',')[1] ?? ''
}

const RATIO_MATCH_EPSILON = 0.01

/**
 * Fits an arbitrary-aspect-ratio image (e.g. a rasterized 4:3 or custom-ratio
 * slide) into the standard 560x315 (16:9) thumbnail box. When the source
 * already is 16:9 this is just a plain scale-down, identical to
 * downscaleToThumbnail. When it isn't, the slide would otherwise need
 * distorting or plain letterbox bars — instead this fills the bars with a
 * blurred, cropped-to-cover copy of the same image (the same "blurred edges"
 * treatment YouTube uses for non-16:9 video), with the real slide centered
 * on top at its correct, undistorted aspect ratio. Returns raw base64 PNG
 * data (no "data:" prefix), matching thumbnails:save's expected format.
 */
export async function fitSlideThumbnail(srcDataUrl: string, srcWidth: number, srcHeight: number): Promise<string> {
  const img = await loadImage(srcDataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = THUMB_WIDTH
  canvas.height = THUMB_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')

  const srcRatio = srcWidth / srcHeight
  const targetRatio = THUMB_WIDTH / THUMB_HEIGHT

  if (Math.abs(srcRatio - targetRatio) < RATIO_MATCH_EPSILON) {
    // Already 16:9 (the common case) — no bars needed, plain scale-down.
    ctx.drawImage(img, 0, 0, THUMB_WIDTH, THUMB_HEIGHT)
    return canvas.toDataURL('image/png').split(',')[1] ?? ''
  }

  // Blurred backdrop: scale to COVER the full box (crops overflow), blurred.
  const coverScale = Math.max(THUMB_WIDTH / srcWidth, THUMB_HEIGHT / srcHeight)
  const coverW = srcWidth * coverScale
  const coverH = srcHeight * coverScale
  ctx.filter = 'blur(12px)'
  ctx.drawImage(img, (THUMB_WIDTH - coverW) / 2, (THUMB_HEIGHT - coverH) / 2, coverW, coverH)
  ctx.filter = 'none'
  // Dim slightly so the sharp foreground slide reads clearly against it.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT)

  // Foreground: scale to CONTAIN (fit fully inside, no cropping), centered.
  const containScale = Math.min(THUMB_WIDTH / srcWidth, THUMB_HEIGHT / srcHeight)
  const containW = srcWidth * containScale
  const containH = srcHeight * containScale
  ctx.drawImage(img, (THUMB_WIDTH - containW) / 2, (THUMB_HEIGHT - containH) / 2, containW, containH)

  return canvas.toDataURL('image/png').split(',')[1] ?? ''
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
