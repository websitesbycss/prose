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
