import { useState } from 'react'
import { createPortal } from 'react-dom'
import { X, FileText, Image, Images, Presentation, Download, Loader2 } from 'lucide-react'
import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { cn } from '@/lib/utils'
import { getSlideBaseSize } from '@/types/slides'
import type { SlidesContent } from '@/types/slides'
import { rasterizeSlide, pngDataUrlToBase64 } from './slideRasterizer'

interface Props {
  content: SlidesContent
  title: string
  activeSlideIndex: number
  onClose(): void
}

type ExportFormat = 'pptx' | 'pdf' | 'png-current' | 'png-all'

interface FormatOption {
  id: ExportFormat
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
}

const FORMATS: FormatOption[] = [
  { id: 'pptx',        label: 'PowerPoint (.pptx)',     description: 'Editable presentation for PowerPoint, Keynote, or Google Slides', icon: Presentation },
  { id: 'pdf',         label: 'PDF document',           description: 'All slides as full-resolution pages in one PDF',                  icon: FileText },
  { id: 'png-current', label: 'PNG: current slide',     description: 'Current slide as a full-resolution PNG image',                    icon: Image    },
  { id: 'png-all',     label: 'PNG: all slides (zip)',  description: 'Every slide as a PNG, bundled in a ZIP archive',                  icon: Images   },
]

export function SlidesExportModal({ content, title, activeSlideIndex, onClose }: Props): JSX.Element {
  const [format, setFormat] = useState<ExportFormat>('pptx')
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // Raster size matches the deck's real aspect ratio — 4:3 and custom decks
  // previously rendered at a fixed 1920×1080 and got squished into the page.
  const { baseW: rasterW, baseH: rasterH } = getSlideBaseSize(content.settings)

  async function handleExport(): Promise<void> {
    setExporting(true)
    setError(null)
    setProgress(null)
    try {
      if (format === 'pptx') {
        setProgress('Building PowerPoint file…')
        await window.prose.slides.exportPptx(content, title)
      } else if (format === 'pdf') {
        await exportPdf()
      } else if (format === 'png-current') {
        await exportPngCurrent()
      } else {
        await exportPngAll()
      }
      setDone(true)
      setTimeout(onClose, 1200)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
      setProgress(null)
    }
  }

  async function exportPdf(): Promise<void> {
    const { slides, theme } = content
    const pdfW = 13.33 * (rasterW / 1920)
    const pdfH = pdfW * (rasterH / rasterW)

    const pdf = new jsPDF({ orientation: pdfW >= pdfH ? 'landscape' : 'portrait', unit: 'in', format: [pdfW, pdfH] })
    for (let i = 0; i < slides.length; i++) {
      setProgress(`Rendering slide ${i + 1} of ${slides.length}…`)
      const dataUrl = await rasterizeSlide(slides[i]!, theme, rasterW, rasterH)
      if (i > 0) pdf.addPage([pdfW, pdfH], pdfW >= pdfH ? 'landscape' : 'portrait')
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH)
    }

    const bytes = new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
    const base64 = uint8ToBase64(bytes)
    await window.prose.slides.saveExportBytes(base64, `${title}.pdf`, 'pdf')
  }

  async function exportPngCurrent(): Promise<void> {
    const { slides, theme } = content
    const slide = slides[activeSlideIndex] ?? slides[0]
    if (!slide) throw new Error('No slide')
    setProgress('Rendering slide…')
    const dataUrl = await rasterizeSlide(slide, theme, rasterW, rasterH)
    await window.prose.slides.saveExportBytes(pngDataUrlToBase64(dataUrl), `${title}.png`, 'png')
  }

  async function exportPngAll(): Promise<void> {
    const { slides, theme } = content
    const zip = new JSZip()
    for (let i = 0; i < slides.length; i++) {
      setProgress(`Rendering slide ${i + 1} of ${slides.length}…`)
      const dataUrl = await rasterizeSlide(slides[i]!, theme, rasterW, rasterH)
      const num = String(i + 1).padStart(2, '0')
      zip.file(`${title}_slide${num}.png`, pngDataUrlToBase64(dataUrl), { base64: true })
    }
    setProgress('Building zip…')
    const bytes = await zip.generateAsync({ type: 'uint8array' })
    await window.prose.slides.saveExportBytes(uint8ToBase64(bytes), `${title}.zip`, 'zip')
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[99991] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl">

        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Export presentation</h2>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-4 flex flex-col gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                className={cn(
                  'flex items-center gap-3 rounded-lg border-2 px-4 py-3 text-left transition-all',
                  format === f.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-border/80 hover:bg-accent/20',
                )}
                onClick={() => setFormat(f.id)}
                disabled={exporting}
              >
                <f.icon className={cn('h-5 w-5 shrink-0', format === f.id ? 'text-primary' : 'text-muted-foreground')} />
                <div>
                  <p className="text-sm font-medium text-foreground">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Rasterization note for PDF/PNG formats */}
          {format !== 'pptx' && (
            <p className="mb-3 text-xs text-muted-foreground">
              Slides are rendered at {rasterW}×{rasterH}px. Large presentations may take a moment.
            </p>
          )}

          {progress && (
            <p className="mb-3 text-xs text-muted-foreground">{progress}</p>
          )}
          {error && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
          )}
          {done && (
            <p className="mb-3 text-center text-xs text-green-600">Export complete: file saved!</p>
          )}

          <div className="flex items-center justify-end">
            <div className="flex gap-2">
              <button
                className="rounded-md border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-accent"
                onClick={onClose}
                disabled={exporting}
              >
                Cancel
              </button>
              <button
                className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
                onClick={() => void handleExport()}
                disabled={exporting || done}
              >
                {exporting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                {exporting ? 'Exporting…' : done ? 'Done!' : 'Export'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  )
}



function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return btoa(binary)
}
