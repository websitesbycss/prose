import type * as PdfJs from 'pdfjs-dist'

let pdfjsPromise: Promise<typeof PdfJs> | null = null

export async function loadPdfJs(): Promise<typeof PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href
      return lib
    })
  }
  return pdfjsPromise
}

export async function renderPdfPreviewPages(b64: string): Promise<string[]> {
  const pdfjsLib = await loadPdfJs()
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const images: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = globalThis.document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    await page.render({ canvasContext: ctx, viewport }).promise
    images.push(canvas.toDataURL('image/png'))
  }
  return images
}

/**
 * Renders page 1 of a PDF to a thumbnail of exactly targetWidth x targetHeight
 * — fit to width, then crop from the top (never squished, never vertically
 * centered). Renders at 2x for crispness before the final downscale-crop.
 * Returns raw base64 PNG data (no "data:" prefix), matching thumbnails:save's
 * expected format.
 */
export async function renderFirstPageThumbnail(
  b64: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> {
  const pdfjsLib = await loadPdfJs()
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const page = await pdf.getPage(1)

  const SUPERSAMPLE = 2
  const baseViewport = page.getViewport({ scale: 1 })
  const fitScale = (targetWidth * SUPERSAMPLE) / baseViewport.width
  const viewport = page.getViewport({ scale: fitScale })

  const renderCanvas = globalThis.document.createElement('canvas')
  renderCanvas.width = Math.ceil(viewport.width)
  renderCanvas.height = Math.ceil(viewport.height)
  const renderCtx = renderCanvas.getContext('2d')
  if (!renderCtx) throw new Error('Failed to get canvas context')
  // PDF pages render transparent where nothing is painted — fill white first
  // so a short page (or one with a transparent background) never leaves the
  // thumbnail with a dark/transparent gap at the bottom.
  renderCtx.fillStyle = '#ffffff'
  renderCtx.fillRect(0, 0, renderCanvas.width, renderCanvas.height)
  await page.render({ canvasContext: renderCtx, viewport }).promise

  const outCanvas = globalThis.document.createElement('canvas')
  outCanvas.width = targetWidth
  outCanvas.height = targetHeight
  const outCtx = outCanvas.getContext('2d')
  if (!outCtx) throw new Error('Failed to get canvas context')
  outCtx.fillStyle = '#ffffff'
  outCtx.fillRect(0, 0, targetWidth, targetHeight)
  // Top-left crop of the full-width render — fit width, anchor to top, never squish.
  outCtx.drawImage(
    renderCanvas,
    0, 0, targetWidth * SUPERSAMPLE, targetHeight * SUPERSAMPLE,
    0, 0, targetWidth, targetHeight,
  )

  const dataUrl = outCanvas.toDataURL('image/png')
  return dataUrl.split(',')[1] ?? ''
}
