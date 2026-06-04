import type { ExportOptions } from '../services/exporter'

const VALID_FORMATS = new Set(['pdf', 'docx', 'markdown', 'plaintext'])
const VALID_PAGE_SIZES = new Set(['Letter', 'A4', 'Legal'])
const VALID_ORIENTATIONS = new Set(['portrait', 'landscape'])

function clampMargin(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!isFinite(v)) return 1
  return Math.max(0, Math.min(3, v))
}

export function parseExportOptions(opts: unknown): ExportOptions {
  if (!opts || typeof opts !== 'object') throw new Error('Invalid export options')
  const o = opts as Record<string, unknown>

  const format = typeof o.format === 'string' && VALID_FORMATS.has(o.format)
    ? o.format as ExportOptions['format']
    : 'pdf'

  const fileName = typeof o.fileName === 'string' && o.fileName.trim()
    ? o.fileName.trim().slice(0, 200)
    : 'document'

  const pageSize = typeof o.pageSize === 'string' && VALID_PAGE_SIZES.has(o.pageSize)
    ? o.pageSize as ExportOptions['pageSize']
    : 'Letter'

  const orientation = typeof o.orientation === 'string' && VALID_ORIENTATIONS.has(o.orientation)
    ? o.orientation as ExportOptions['orientation']
    : 'portrait'

  const marginsRaw = o.margins
  const margins = marginsRaw && typeof marginsRaw === 'object'
    ? {
        top: clampMargin((marginsRaw as Record<string, unknown>).top),
        right: clampMargin((marginsRaw as Record<string, unknown>).right),
        bottom: clampMargin((marginsRaw as Record<string, unknown>).bottom),
        left: clampMargin((marginsRaw as Record<string, unknown>).left),
      }
    : { top: 1, right: 1, bottom: 1, left: 1 }

  const colorMode = o.colorMode === 'dark' ? 'dark' as const : o.colorMode === 'light' ? 'light' as const : undefined

  return {
    format,
    fileName,
    pageSize,
    orientation,
    margins,
    colorMode,
    includeHeader: o.includeHeader !== false,
    includeFooter: o.includeFooter !== false,
    openAfterExport: o.openAfterExport === true,
  }
}
