import { dialog, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  ExternalHyperlink,
  HeadingLevel,
  AlignmentType,
  UnderlineType,
  LevelFormat,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  PageBreak,
  TabStopType,
  VerticalAlignSection,
} from 'docx'
import type { JSONContent } from '@tiptap/core'
import katex from 'katex'
import { resolveDocument } from './fileService'

// ── ExportOptions ─────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: 'pdf' | 'docx' | 'markdown' | 'plaintext'
  fileName: string
  pageSize: 'Letter' | 'A4' | 'Legal'
  orientation: 'portrait' | 'landscape'
  margins: { top: number; right: number; bottom: number; left: number }
  colorMode?: 'light' | 'dark'
  includeHeader: boolean
  includeFooter: boolean
  openAfterExport: boolean
}

// Page widths in inches per size (portrait; swap for landscape)
const PAGE_WIDTH_IN: Record<string, number> = { Letter: 8.5, A4: 8.27, Legal: 8.5 }
const PAGE_HEIGHT_IN: Record<string, number> = { Letter: 11, A4: 11.69, Legal: 14 }

// ── helpers ──────────────────────────────────────────────────────────────────

type FetchedDocument = {
  content: string
  title: string
  format: string
  header_content: string | null
  footer_content: string | null
  page_margins: { top: number; right: number; bottom: number; left: number } | null
}

async function fetchDocument(id: string): Promise<FetchedDocument | null> {
  const resolved = await resolveDocument(id)
  if (!resolved) return null
  const { doc } = resolved
  return {
    title: doc.title,
    content: JSON.stringify(doc.content),
    format: doc.format,
    header_content: doc.headerContent != null ? JSON.stringify(doc.headerContent) : null,
    footer_content: doc.footerContent != null ? JSON.stringify(doc.footerContent) : null,
    page_margins: doc.pageMargins ?? null,
  }
}

const DEFAULT_MARGINS = { top: 1, right: 1, bottom: 1, left: 1 }

function resolveMargins(m: FetchedDocument['page_margins']) {
  return m ?? DEFAULT_MARGINS
}

function parseContent(raw: string): JSONContent {
  try {
    return JSON.parse(raw) as JSONContent
  } catch {
    return { type: 'doc', content: [] }
  }
}

function extractRunningHead(doc: JSONContent, format: string): string | null {
  const override = doc.attrs?.runningHead as string | null | undefined
  if (override) return override
  const nodes = doc.content ?? []
  if (format === 'mla') {
    const headerNode = nodes.find((n) => n.attrs?.role === 'mla-header')
    const name = (headerNode?.content?.[0] as JSONContent | undefined)?.text ?? ''
    if (!name.trim()) return null
    const parts = name.trim().split(/\s+/)
    return parts[parts.length - 1] ?? null
  }
  if (format === 'apa') {
    const headerNode = nodes.find((n) => n.attrs?.role === 'apa-header')
    const title = (headerNode?.content?.[0] as JSONContent | undefined)?.text ?? ''
    return title ? title.toUpperCase().slice(0, 50) : 'RUNNING HEAD'
  }
  return null
}

function inlineText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(inlineText).join('')
}

// ── Plain text ────────────────────────────────────────────────────────────────

function nodeToPlainText(node: JSONContent, indent = 0): string {
  const pad = '  '.repeat(indent)
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map((n) => nodeToPlainText(n)).join('\n')
    case 'paragraph':
      return pad + inlineText(node)
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      const prefix = '#'.repeat(level) + ' '
      return prefix + inlineText(node)
    }
    case 'bulletList':
    case 'orderedList':
      return (node.content ?? []).map((n) => nodeToPlainText(n, indent)).join('\n')
    case 'listItem':
      return pad + '• ' + (node.content ?? []).map((n) => nodeToPlainText(n, indent + 1)).join(' ').trim()
    case 'blockquote':
      return (node.content ?? [])
        .map((n) => '> ' + nodeToPlainText(n, indent).trim())
        .join('\n')
    case 'horizontalRule':
      return '────────────────────'
    case 'table':
      return (node.content ?? []).map((n) => nodeToPlainText(n)).join('\n')
    case 'tableRow':
      return (node.content ?? []).map((n) => inlineText(n)).join(' | ')
    case 'codeBlock':
      return inlineText(node)
    default:
      return inlineText(node)
  }
}

// Build a simple scrollable HTML page for non-paginated formats (markdown, plaintext).
function buildScrollablePreviewPage(
  title: string,
  bodyHtml: string,
  colorMode: 'light' | 'dark',
): string {
  const isDark = colorMode === 'dark'
  const bg          = isDark ? '#2a2a2a' : '#ffffff'
  const fg          = isDark ? '#e5e5e5' : '#000000'
  const preBg       = isDark ? '#1e1e1e' : '#f0f0f0'
  const borderColor = isDark ? '#444444' : '#cccccc'
  const mutedColor  = isDark ? '#999999' : '#666666'
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)} — Preview</title>
<style>
  html,body{margin:0;padding:1.5rem;background:${bg};font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;overflow-y:auto;}
  .page{background:${bg};color:${fg};max-width:680px;margin:0 auto;padding:2rem 2.5rem;word-break:break-word;min-height:calc(100vh - 3rem);}
  pre{margin:0;white-space:pre-wrap;font-family:'Courier New',monospace;font-size:11pt;background:${preBg};padding:1.5rem;border-radius:4px;}
  p{margin:0 0 1em}ul,ol{margin:.5em 0;padding-left:2em}
  blockquote{margin:.5em 2em;border-left:3px solid ${borderColor};padding-left:1em;color:${mutedColor}}
  code{background:${preBg};padding:.1em .3em;border-radius:2px;font-size:.9em;font-family:'Courier New',monospace}
  h1,h2,h3{margin:.8em 0 .4em}
  hr{border:none;border-top:1px solid ${borderColor};margin:1.5em 0}
  table{width:100%;border-collapse:collapse;margin:1em 0}
  th,td{border:1px solid ${borderColor};padding:6px 10px}
  th{background:${preBg}}
  img{max-width:100%}a{color:inherit}
  ::-webkit-scrollbar{width:8px;height:8px}
  ::-webkit-scrollbar-track{background:transparent}
  ::-webkit-scrollbar-thumb{background:rgba(120,120,120,0.55);border-radius:4px}
  ::-webkit-scrollbar-thumb:hover{background:rgba(120,120,120,0.85)}
</style>
</head><body><div class="page">${bodyHtml}</div></body></html>`
}

// Generate a real PDF for the preview pane — same as exportToPdf but returns the buffer
// directly without showing a save dialog. Used for accurate paginated preview.
export async function getPreviewPdf(id: string, opts: ExportOptions): Promise<Buffer | null> {
  const row = await fetchDocument(id)
  if (!row) return null
  const doc = parseContent(row.content)
  const margins = opts.margins

  const effectiveHeaderRaw = opts.includeHeader ? row.header_content : null
  const effectiveFooterRaw = opts.includeFooter ? row.footer_content : null
  const legacyRunningHead = effectiveHeaderRaw ? null : (opts.includeHeader ? extractRunningHead(doc, row.format) : null)

  let headerTemplate = '<span></span>'
  if (effectiveHeaderRaw) {
    headerTemplate = zoneToElectronTemplate(effectiveHeaderRaw, 'right', margins.left, margins.right)
  } else if (legacyRunningHead) {
    headerTemplate = legacyRunningHeadTemplate(legacyRunningHead, row.format, margins.left, margins.right)
  }
  let footerTemplate = '<span></span>'
  if (effectiveFooterRaw) {
    footerTemplate = zoneToElectronTemplate(effectiveFooterRaw, 'left', margins.left, margins.right)
  }
  const hasHeaderOrFooter = !!(effectiveHeaderRaw || legacyRunningHead || effectiveFooterRaw)

  const html = buildHtmlPage(row.title, nodeToHtml(doc, row.format), row.format)

  const tmpHtml = join(tmpdir(), `prose-preview-${randomUUID()}.html`)
  await writeFile(tmpHtml, html, 'utf8')

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  try {
    await win.loadFile(tmpHtml)
    const pdfBuffer = await win.webContents.printToPDF({
      margins: {
        marginType: 'custom',
        top: margins.top,
        right: margins.right,
        bottom: margins.bottom,
        left: margins.left,
      },
      pageSize: opts.pageSize,
      landscape: opts.orientation === 'landscape',
      printBackground: true,
      displayHeaderFooter: hasHeaderOrFooter,
      ...(hasHeaderOrFooter ? { headerTemplate, footerTemplate } : {}),
    })
    return pdfBuffer
  } finally {
    win.destroy()
    import('fs').then(({ unlinkSync }) => { try { unlinkSync(tmpHtml) } catch { /* ignore */ } })
  }
}

export async function getPreviewHtml(id: string, opts: ExportOptions): Promise<string | null> {
  const row = await fetchDocument(id)
  if (!row) return null
  const doc = parseContent(row.content)

  // Markdown — show the raw markdown text so the user sees what they'll get
  if (opts.format === 'markdown') {
    const md = nodeToMarkdown(doc)
    return buildScrollablePreviewPage(row.title, `<pre>${escapeHtml(md)}</pre>`, opts.colorMode ?? 'light')
  }

  // Plain text — proportional font, single-spaced (mirrors what a .txt file looks like)
  if (opts.format === 'plaintext') {
    const txt = nodeToPlainText(doc)
    return buildScrollablePreviewPage(row.title, `<div style="white-space:pre-wrap;line-height:1.5;font-size:12pt;">${escapeHtml(txt)}</div>`, opts.colorMode ?? 'light')
  }

  // PDF / DOCX — paginated preview
  const margins = opts.margins
  const effectiveHeaderRaw = opts.includeHeader ? row.header_content : null
  const effectiveFooterRaw = opts.includeFooter ? row.footer_content : null
  const legacyRunningHead = effectiveHeaderRaw ? null : (opts.includeHeader ? extractRunningHead(doc, row.format) : null)

  let headerHtml = ''
  if (effectiveHeaderRaw) {
    // Pass 0,0 for left/right margins — the .ph container already applies margin
    // padding via its CSS, so we avoid double-indenting the header content.
    headerHtml = zoneToPreviewHtml(effectiveHeaderRaw, 'left', 0, 0)
  } else if (legacyRunningHead) {
    if (row.format === 'mla') {
      headerHtml = `<div style="width:100%;text-align:right;font-family:'Times New Roman',serif;font-size:10pt">${escapeHtml(legacyRunningHead)} 1</div>`
    } else {
      headerHtml = `<div style="width:100%;display:flex;justify-content:space-between;font-family:'Times New Roman',serif;font-size:10pt"><span style="text-transform:uppercase">${escapeHtml(legacyRunningHead)}</span><span>1</span></div>`
    }
  }

  let footerHtml = ''
  if (effectiveFooterRaw) {
    // Same 0,0 margin fix; fallback to 'left' (the zone editor's default when no
    // explicit textAlign is stored matches the browser's left-align default).
    footerHtml = zoneToPreviewHtml(effectiveFooterRaw, 'left', 0, 0)
  }

  const bodyHtml = nodeToHtml(doc, row.format)
  return buildPreviewPage(row.title, bodyHtml, opts.colorMode, margins, opts.pageSize, opts.orientation, headerHtml, footerHtml)
}

export async function exportToPlainText(id: string, opts: ExportOptions): Promise<string | null> {
  const row = await fetchDocument(id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const text = nodeToPlainText(doc)
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as Plain Text',
    defaultPath: opts.fileName,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (filePath) { await writeFile(filePath, text, 'utf8'); return filePath }
  return null
}

// ── Markdown ──────────────────────────────────────────────────────────────────

function markToMd(text: string, marks: JSONContent['marks']): string {
  if (!marks || marks.length === 0) return text
  let out = text
  for (const mark of marks) {
    if (mark.type === 'bold') out = `**${out}**`
    else if (mark.type === 'italic') out = `*${out}*`
    else if (mark.type === 'underline') out = `<u>${out}</u>`
    else if (mark.type === 'strike') out = `~~${out}~~`
    else if (mark.type === 'code') out = `\`${out}\``
    else if (mark.type === 'link') {
      const href = (mark.attrs?.href as string) ?? ''
      out = `[${out}](${href})`
    }
  }
  return out
}

function inlineToMd(node: JSONContent): string {
  if (node.type === 'text') return markToMd(node.text ?? '', node.marks)
  if (node.type === 'hardBreak') return '  \n'
  return (node.content ?? []).map(inlineToMd).join('')
}

function nodeToMarkdown(node: JSONContent, listIndex = 0): string {
  switch (node.type) {
    case 'doc':
      return (node.content ?? [])
        .map((n) => nodeToMarkdown(n))
        .filter((s) => s.trim().length > 0)
        .join('\n\n')
    case 'paragraph':
      return (node.content ?? []).map(inlineToMd).join('')
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      return '#'.repeat(level) + ' ' + inlineToMd(node)
    }
    case 'bulletList':
      return (node.content ?? [])
        .map((n) => '- ' + (n.content ?? []).map((c) => nodeToMarkdown(c).trim()).join(' '))
        .join('\n')
    case 'orderedList':
      return (node.content ?? [])
        .map((n, i) => `${i + 1}. ` + (n.content ?? []).map((c) => nodeToMarkdown(c).trim()).join(' '))
        .join('\n')
    case 'blockquote':
      return (node.content ?? [])
        .map((n) => '> ' + nodeToMarkdown(n).trim())
        .join('\n')
    case 'horizontalRule':
      return '---'
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      return `\`\`\`${lang}\n${inlineText(node)}\n\`\`\``
    }
    case 'table': {
      const rows = node.content ?? []
      const lines: string[] = []
      rows.forEach((row, ri) => {
        const cells = (row.content ?? []).map((cell) =>
          (cell.content ?? []).map((n) => nodeToMarkdown(n).trim()).join(' ')
        )
        lines.push('| ' + cells.join(' | ') + ' |')
        if (ri === 0) lines.push('| ' + cells.map(() => '---').join(' | ') + ' |')
      })
      return lines.join('\n')
    }
    default:
      return inlineToMd(node)
  }
}

export async function exportToMarkdown(id: string, opts: ExportOptions): Promise<string | null> {
  const row = await fetchDocument(id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const md = nodeToMarkdown(doc)
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as Markdown',
    defaultPath: opts.fileName,
    filters: [{ name: 'Markdown Files', extensions: ['md'] }],
  })
  if (filePath) { await writeFile(filePath, md, 'utf8'); return filePath }
  return null
}

// ── PDF via hidden BrowserWindow ──────────────────────────────────────────────

const BIBLIOGRAPHY_HEADINGS = /^(works cited|references|bibliography|works consulted|reference list|sources)$/i

function isBibliographyHeading(node: JSONContent): boolean {
  return BIBLIOGRAPHY_HEADINGS.test(inlineText(node).trim())
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inlineToHtml(node: JSONContent): string {
  if (node.type === 'text') {
    let text = escapeHtml(node.text ?? '')
    const marks = node.marks ?? []
    for (const mark of marks) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`
      else if (mark.type === 'italic') text = `<em>${text}</em>`
      else if (mark.type === 'underline') text = `<u>${text}</u>`
      else if (mark.type === 'strike') text = `<span style="text-decoration:line-through">${text}</span>`
      else if (mark.type === 'superscript') text = `<sup>${text}</sup>`
      else if (mark.type === 'subscript') text = `<sub>${text}</sub>`
      else if (mark.type === 'code') text = `<code>${text}</code>`
      else if (mark.type === 'highlight') {
        const color = (mark.attrs?.color as string) ?? 'yellow'
        text = `<mark style="background-color:${color}">${text}</mark>`
      } else if (mark.type === 'textStyle') {
        const attrs = mark.attrs ?? {}
        const styles: string[] = []
        if (attrs.color) styles.push(`color:${attrs.color}`)
        if (attrs.fontSize) styles.push(`font-size:${attrs.fontSize}`)
        if (attrs.fontFamily) styles.push(`font-family:${attrs.fontFamily}`)
        if (styles.length) text = `<span style="${styles.join(';')}">${text}</span>`
      } else if (mark.type === 'link') {
        const href = escapeHtml((mark.attrs?.href as string) ?? '')
        text = `<a href="${href}">${text}</a>`
      }
    }
    return text
  }
  if (node.type === 'hardBreak') return '<br>'
  if (node.type === 'rightTab') return '<span class="right-tab"></span>'
  if (node.type === 'image') {
    const src = (node.attrs?.src as string) ?? ''
    const alt = escapeHtml((node.attrs?.alt as string) ?? '')
    return `<img src="${src}" alt="${alt}" style="max-width:100%">`
  }
  return (node.content ?? []).map(inlineToHtml).join('')
}

function nodeToHtml(node: JSONContent, format = 'none'): string {
  const align = (node.attrs?.textAlign as string) ?? ''
  const alignStyle = align && align !== 'left' ? `text-align:${align}` : ''
  const isFormatted = format === 'mla' || format === 'apa'

  switch (node.type) {
    case 'doc': {
      if (format === 'apa') {
        const nodes = node.content ?? []
        const apaHeaderNodes: JSONContent[] = []
        let inHeaders = true
        let splitIdx = 0
        for (let i = 0; i < nodes.length; i++) {
          if (inHeaders && nodes[i]!.attrs?.role === 'apa-header') {
            apaHeaderNodes.push(nodes[i]!)
            splitIdx = i + 1
          } else {
            inHeaders = false
          }
        }
        const rest = nodes.slice(splitIdx)
        const headerHtml = apaHeaderNodes.map((n) => nodeToHtml(n, format)).join('')
        const restHtml = rest.map((n) => nodeToHtml(n, format)).join('')
        const titlePage = `<div class="apa-title-block">${headerHtml}</div>`
        return titlePage + restHtml
      }
      return (node.content ?? []).map((n) => nodeToHtml(n, format)).join('')
    }
    case 'paragraph': {
      const role = node.attrs?.role as string | undefined
      const noIndent = node.attrs?.noIndent as boolean | undefined
      const hasRole = !!role
      const firstLine =
        isFormatted && !hasRole && !noIndent ? 'text-indent:0.5in' : ''
      const pageBreak = role === 'abstract-heading' ? 'page-break-before:always' : ''
      const hangingIndent = role === 'citation' ? 'text-indent:-0.5in;padding-left:0.5in' : ''
      const hasRightTab = (node.content ?? []).some((n) => n.type === 'rightTab')
      const flexStyle = hasRightTab ? 'display:flex;align-items:baseline' : ''
      const styles = [alignStyle, firstLine, pageBreak, hangingIndent, flexStyle].filter(Boolean).join(';')
      const styleAttr = styles ? ` style="${styles}"` : ''
      return `<p${styleAttr}>${(node.content ?? []).map(inlineToHtml).join('') || '&nbsp;'}</p>`
    }
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      const headingStyles = [
        alignStyle,
        isBibliographyHeading(node) ? 'page-break-before:always' : '',
      ].filter(Boolean).join(';')
      const styleAttr = headingStyles ? ` style="${headingStyles}"` : ''
      return `<h${level}${styleAttr}>${(node.content ?? []).map(inlineToHtml).join('')}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</ol>`
    case 'listItem':
      return `<li>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</li>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</blockquote>`
    case 'horizontalRule':
      return '<hr>'
    case 'codeBlock':
      return `<pre><code>${escapeHtml(inlineText(node))}</code></pre>`
    case 'pageNumber':
      return '<span class="pn"></span>'
    case 'pageBreak':
      return '<div style="page-break-before:always;break-before:page;height:0;margin:0;padding:0;overflow:hidden;"></div>'
    case 'rightTab':
      return '<span class="right-tab"></span>'
    case 'image': {
      const src = escapeHtml((node.attrs?.src as string) ?? '')
      const alt = escapeHtml((node.attrs?.alt as string) ?? '')
      return `<img src="${src}" alt="${alt}" style="max-width:100%">`
    }
    case 'table':
      return `<div style="max-width:100%;overflow:hidden"><table border="1" style="border-collapse:collapse;width:100%;table-layout:fixed">${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</table></div>`
    case 'tableRow':
      return `<tr>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</tr>`
    case 'tableHeader':
    case 'tableCell': {
      const ca = node.attrs ?? {}
      const cellStyles: string[] = ['padding:4px 8px']
      if (ca.backgroundColor) cellStyles.push(`background-color:${ca.backgroundColor as string}`)
      const bColor = ca.borderColor as string | null | undefined
      const bWidth = ca.borderWidth as number | null | undefined
      if (bColor || bWidth) cellStyles.push(`border:${bWidth ?? 1}px solid ${bColor ?? '#000'}`)
      const colwidths = ca.colwidth as number[] | null | undefined
      if (colwidths?.[0]) cellStyles.push(`width:${colwidths[0]}px`)
      const rowspan = ca.rowspan as number | undefined
      const colspan = ca.colspan as number | undefined
      const spanAttrs = [
        rowspan && rowspan > 1 ? `rowspan="${rowspan}"` : '',
        colspan && colspan > 1 ? `colspan="${colspan}"` : '',
      ].filter(Boolean).join(' ')
      const tag = node.type === 'tableHeader' ? 'th' : 'td'
      return `<${tag} style="${cellStyles.join(';')}"${spanAttrs ? ' ' + spanAttrs : ''}>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</${tag}>`
    }
    default:
      return (node.content ?? []).map((n) => nodeToHtml(n, format)).join('')
  }
}

// Build an Electron displayHeaderFooter template string from a header/footer zone JSON.
// Replaces pageNumber nodes with Electron's <span class="pageNumber"></span>.
function zoneToElectronTemplate(raw: string | null, fallbackAlign = 'left', leftIn = 1, rightIn = 1): string {
  if (!raw) return '<span></span>'
  try {
    const doc = JSON.parse(raw) as JSONContent
    const firstPara = doc.content?.[0]
    if (!firstPara) return '<span></span>'
    const nodes = firstPara.content ?? []
    const align = (firstPara.attrs?.textAlign as string) ?? fallbackAlign
    const renderNodes = (ns: JSONContent[]) =>
      ns.map((n) => {
        if (n.type === 'pageNumber') {
          const marks = n.marks ?? []
          const styles: string[] = []
          let isBold = false, isItalic = false
          for (const mark of marks) {
            if (mark.type === 'bold') isBold = true
            if (mark.type === 'italic') isItalic = true
            if (mark.type === 'textStyle') {
              const a = mark.attrs ?? {}
              if (a.color) styles.push(`color:${a.color as string}`)
              if (a.fontSize) styles.push(`font-size:${a.fontSize as string}`)
              if (a.fontFamily) styles.push(`font-family:${a.fontFamily as string}`)
            }
          }
          let result = '<span class="pageNumber"></span>'
          if (styles.length) result = `<span style="${styles.join(';')}">${result}</span>`
          if (isItalic) result = `<em>${result}</em>`
          if (isBold) result = `<strong>${result}</strong>`
          return result
        }
        return inlineToHtml(n)
      }).join('')
    const lPx = Math.round(leftIn * 96)
    const rPx = Math.round(rightIn * 96)
    const base = `font-size:16px;font-family:'Times New Roman',serif;width:100%;box-sizing:border-box;padding-left:${lPx}px;padding-right:${rPx}px;color:#000;`

    // Split content by rightTab nodes into segments
    const segments: JSONContent[][] = []
    let cur: JSONContent[] = []
    for (const n of nodes) {
      if (n.type === 'rightTab') { segments.push(cur); cur = [] }
      else cur.push(n)
    }
    segments.push(cur)

    if (segments.length === 1) {
      return `<div style="${base}text-align:${align};">${renderNodes(segments[0]!)}</div>`
    }
    if (segments.length === 2) {
      const [left, right] = segments
      if (!left!.length) {
        return `<div style="${base}text-align:right;">${renderNodes(right!)}</div>`
      }
      return `<div style="${base}display:flex;justify-content:space-between;">${renderNodes(left!)}<span>${renderNodes(right!)}</span></div>`
    }
    // 3+ segments: equal-width flex columns, first=left, last=right, middle=center
    const cols = segments.map((seg, i) => {
      const ta = i === 0 ? 'left' : i === segments.length - 1 ? 'right' : 'center'
      return `<span style="flex:1;text-align:${ta};">${renderNodes(seg)}</span>`
    })
    return `<div style="${base}display:flex;">${cols.join('')}</div>`
  } catch {
    return '<span></span>'
  }
}

// Build an Electron template for legacy MLA/APA running heads.
function legacyRunningHeadTemplate(runningHead: string, format: string, leftIn = 1, rightIn = 1): string {
  const pn = '<span class="pageNumber"></span>'
  const lPx = Math.round(leftIn * 96)
  const rPx = Math.round(rightIn * 96)
  const base = `font-size:16px;font-family:'Times New Roman',serif;width:100%;box-sizing:border-box;padding-left:${lPx}px;padding-right:${rPx}px;color:#000;`
  if (format === 'mla') {
    return `<div style="${base}text-align:right;">${escapeHtml(runningHead)} ${pn}</div>`
  }
  return `<div style="${base}display:flex;justify-content:space-between;"><span style="text-transform:uppercase">${escapeHtml(runningHead)}</span>${pn}</div>`
}


function buildHtmlPage(title: string, body: string, _format = 'none'): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 0; line-height: 2; color: #000; }
  .right-tab { flex: 1; display: inline-block; }
  h1 { font-size: 14pt; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }
  p { margin: 0; } ul, ol { margin: 0.5em 0; padding-left: 2em; }
  blockquote { margin: 0.5em 2em; } pre { background: #f5f5f5; padding: 0.5em; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0.5em 0; }
  th, td { border: 1px solid #000; padding: 4px 8px; }
  img { max-width: 100%; }
  .apa-title-block { height: 9in; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; page-break-after: always; break-after: page; }
</style>
</head><body>${body}</body></html>`
}

// Reuse zoneToElectronTemplate output for preview by replacing pageNumber spans with "1"
function zoneToPreviewHtml(raw: string | null, fallbackAlign = 'left', leftIn = 1, rightIn = 1): string {
  return zoneToElectronTemplate(raw, fallbackAlign, leftIn, rightIn)
    .replace(/<span class="pageNumber"><\/span>/g, '<span>1</span>')
}

// Build a self-contained HTML page for the in-app preview iframe.
// The iframe viewport == one page; JS uses postMessage to handle navigation.
function buildPreviewPage(
  title: string,
  bodyHtml: string,
  colorMode: 'light' | 'dark',
  margins: typeof DEFAULT_MARGINS,
  pageSize: string,
  orientation: 'portrait' | 'landscape',
  headerHtml: string,
  footerHtml: string,
): string {
  const isDark = colorMode === 'dark'
  const pageBg = isDark ? '#1e1e1e' : '#ffffff'
  const pageColor = isDark ? '#e5e5e5' : '#000000'
  const preBg = isDark ? '#2d2d2d' : '#f5f5f5'
  const borderColor = isDark ? '#555' : '#000'

  const pw = PAGE_WIDTH_IN[pageSize] ?? PAGE_WIDTH_IN.Letter
  const ph = PAGE_HEIGHT_IN[pageSize] ?? PAGE_HEIGHT_IN.Letter
  const wPx = Math.round((orientation === 'landscape' ? ph : pw) * 96)
  const hPx = Math.round((orientation === 'landscape' ? pw : ph) * 96)

  const mT = Math.round(margins.top * 96)
  const mR = Math.round(margins.right * 96)
  const mB = Math.round(margins.bottom * 96)
  const mL = Math.round(margins.left * 96)

  const hasHeader = headerHtml.length > 0
  const hasFooter = footerHtml.length > 0
  const hStrip = hasHeader ? Math.round(mT * 0.8) : 0
  const fStrip = hasFooter ? Math.round(mB * 0.8) : 0
  const bodyPT = hasHeader ? Math.round(mT * 0.2) : mT
  const bodyPB = hasFooter ? Math.round(mB * 0.2) : mB

  // The body IS the page — no outer gray wrapper. The React container provides the gray surround.
  // #content is in normal flow so scrollHeight reflects true content height for page counting.
  // translateY on #content handles page navigation; the iframe viewport clips to one page.
  // applyPageBreaks() runs after layout: finds elements with page-break-before:always and
  // inserts spacers so content snaps to page boundaries, mirroring actual PDF output.
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)} — Preview</title>
<style>
  html{margin:0;padding:0;width:${wPx}px;overflow:hidden;}
  body{margin:0;padding:0;width:${wPx}px;background:${pageBg};color:${pageColor};font-family:'Times New Roman',serif;font-size:12pt;line-height:2}
  #content{width:${wPx}px;will-change:transform}
  .ph{padding:${Math.round(hStrip*0.12)}px ${mR}px ${Math.round(hStrip*0.08)}px ${mL}px;min-height:${hStrip}px;font-size:10pt;line-height:1.4;display:flex;align-items:center}
  .pb{padding:${bodyPT}px ${mR}px ${bodyPB}px ${mL}px}
  .pf{padding:${Math.round(fStrip*0.08)}px ${mR}px ${Math.round(fStrip*0.12)}px ${mL}px;min-height:${fStrip}px;font-size:10pt;line-height:1.4;display:flex;align-items:center}
  p{margin:0}ul,ol{margin:.5em 0;padding-left:2em}blockquote{margin:.5em 2em}
  pre{background:${preBg};padding:.5em;font-size:.9em}
  code{background:${preBg};padding:.1em .3em;border-radius:2px;font-size:.9em}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid ${borderColor};padding:4px 8px;word-wrap:break-word}
  img{max-width:100%}
  h1{font-size:14pt}h2{font-size:13pt}h3{font-size:12pt}
  .apa-title-block{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:5in}
  .right-tab{flex:1;display:inline-block}
  a{color:inherit}
</style>
<script>
  var PAGE_H=${hPx};
  function applyPageBreaks(){
    try{
      var content=document.getElementById('content');
      if(!content)return;
      // Find every element that requests a CSS page break and insert a height-filling
      // spacer before it so the content jumps to the next page boundary.
      var els=content.querySelectorAll('[style*="page-break-before:always"],[style*="break-before:page"]');
      for(var i=0;i<els.length;i++){
        var el=els[i];
        var mod=el.offsetTop%PAGE_H;
        if(mod>0){
          var sp=document.createElement('div');
          sp.style.height=(PAGE_H-mod)+'px';
          el.parentNode.insertBefore(sp,el);
        }
        el.style.removeProperty('page-break-before');
        el.style.removeProperty('break-before');
      }
    }catch(e){}
  }
  function totalPages(){
    var c=document.getElementById('content');
    return c?Math.max(1,Math.ceil(c.scrollHeight/PAGE_H)):1;
  }
  function report(){window.parent.postMessage({type:'page-info',totalPages:totalPages()},'*');}
  function gotoPage(n){
    var c=document.getElementById('content');
    if(c)c.style.transform='translateY(-'+Math.max(0,(n-1)*PAGE_H)+'px)';
    report();
  }
  window.addEventListener('message',function(e){
    if(!e.data)return;
    if(e.data.type==='goto-page')gotoPage(e.data.page);
    if(e.data.type==='request-page-info')setTimeout(report,0);
  });
  // setTimeout(0) after DOMContentLoaded lets the browser finish layout (reflow)
  // before measuring scrollHeight, which is critical after applyPageBreaks inserts spacers.
  function init(){applyPageBreaks();setTimeout(report,0);}
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',init);}else{init();}
</script>
</head><body>
<div id="content">
  ${hasHeader ? `<div class="ph">${headerHtml}</div>` : ''}
  <div class="pb">${bodyHtml}</div>
  ${hasFooter ? `<div class="pf">${footerHtml}</div>` : ''}
</div>
</body></html>`
}

export async function exportToPdf(id: string, opts: ExportOptions): Promise<string | null> {
  const row = await fetchDocument(id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const margins = opts.margins

  const effectiveHeaderRaw = opts.includeHeader ? row.header_content : null
  const effectiveFooterRaw = opts.includeFooter ? row.footer_content : null
  const legacyRunningHead = effectiveHeaderRaw ? null : (opts.includeHeader ? extractRunningHead(doc, row.format) : null)

  let headerTemplate = '<span></span>'
  if (effectiveHeaderRaw) {
    headerTemplate = zoneToElectronTemplate(effectiveHeaderRaw, 'right', margins.left, margins.right)
  } else if (legacyRunningHead) {
    headerTemplate = legacyRunningHeadTemplate(legacyRunningHead, row.format, margins.left, margins.right)
  }
  let footerTemplate = '<span></span>'
  if (effectiveFooterRaw) {
    footerTemplate = zoneToElectronTemplate(effectiveFooterRaw, 'left', margins.left, margins.right)
  }
  const hasHeaderOrFooter = !!(effectiveHeaderRaw || legacyRunningHead || effectiveFooterRaw)

  const html = buildHtmlPage(row.title, nodeToHtml(doc, row.format), row.format)

  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as PDF',
    defaultPath: opts.fileName,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  if (!filePath) return null

  const tmpHtml = join(tmpdir(), `prose-export-${randomUUID()}.html`)
  await writeFile(tmpHtml, html, 'utf8')

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadFile(tmpHtml)
  const pdfBuffer = await win.webContents.printToPDF({
    margins: {
      marginType: 'custom',
      top: margins.top,
      right: margins.right,
      bottom: margins.bottom,
      left: margins.left,
    },
    pageSize: opts.pageSize,
    landscape: opts.orientation === 'landscape',
    printBackground: true,
    displayHeaderFooter: hasHeaderOrFooter,
    ...(hasHeaderOrFooter ? { headerTemplate, footerTemplate } : {}),
  })
  win.destroy()

  await writeFile(filePath, pdfBuffer)
  import('fs').then(({ unlinkSync }) => { try { unlinkSync(tmpHtml) } catch { /* ignore */ } })
  return filePath
}

// ── DOCX ──────────────────────────────────────────────────────────────────────

type DocxChild = Paragraph | DocxTable

interface NumberingDef {
  reference: string
  levels: Array<{
    level: number
    format: LevelFormat
    text: string
    alignment: typeof AlignmentType[keyof typeof AlignmentType]
    style: { paragraph: { indent: { left: number; hanging: number } } }
  }>
}

function marksToRun(text: string, marks: JSONContent['marks']): TextRun {
  const opts: ConstructorParameters<typeof TextRun>[0] = { text }
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') opts.bold = true
    else if (mark.type === 'italic') opts.italics = true
    else if (mark.type === 'underline') opts.underline = { type: UnderlineType.SINGLE }
    else if (mark.type === 'strike') opts.strike = true
    else if (mark.type === 'superscript') opts.superScript = true
    else if (mark.type === 'subscript') opts.subScript = true
    else if (mark.type === 'highlight') {
      const raw = (mark.attrs?.color as string) ?? '#ffff00'
      opts.shading = { type: ShadingType.CLEAR, color: 'auto', fill: raw.replace('#', '') }
    } else if (mark.type === 'textStyle') {
      if (mark.attrs?.color) opts.color = (mark.attrs.color as string).replace('#', '')
      if (mark.attrs?.fontSize) opts.size = Math.round(parseFloat(mark.attrs.fontSize as string) * 2)
      if (mark.attrs?.fontFamily) opts.font = mark.attrs.fontFamily as string
    }
  }
  return new TextRun(opts)
}

function inlineToRuns(node: JSONContent): (TextRun | ImageRun | ExternalHyperlink)[] {
  if (node.type === 'text') {
    const linkMark = node.marks?.find((m) => m.type === 'link')
    const otherMarks = node.marks?.filter((m) => m.type !== 'link')
    const run = marksToRun(node.text ?? '', otherMarks)
    if (linkMark) {
      return [new ExternalHyperlink({ children: [run], link: (linkMark.attrs?.href as string) ?? '' })]
    }
    return [run]
  }
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
  if (node.type === 'pageNumber') return [new TextRun({ children: [PageNumber.CURRENT] })]
  if (node.type === 'inlineMath') {
    const latex = (node.attrs?.latex as string) ?? ''
    const svg = mathToSvgBuffer(latex, false)
    if (svg) {
      return [new ImageRun({ data: svg.data, transformation: { width: svg.width, height: svg.height }, type: 'svg' })]
    }
    return [new TextRun({ text: latex, font: 'Courier New' })]
  }
  if (node.type === 'image') {
    const src = (node.attrs?.src as string) ?? ''
    const match = src.match(/^data:image\/(\w+);base64,(.+)$/)
    if (!match) return []
    const imgType = (match[1] ?? 'png') as 'png' | 'jpg' | 'jpeg' | 'gif' | 'bmp' | 'svg' | 'webp'
    const imgData = Buffer.from(match[2]!, 'base64')
    const dims = getImageDimensions(imgData, imgType)
    const naturalW = dims?.width ?? MAX_IMG_WIDTH_PX
    const naturalH = dims?.height ?? Math.round(MAX_IMG_WIDTH_PX * 0.75)
    const scale = naturalW > MAX_IMG_WIDTH_PX ? MAX_IMG_WIDTH_PX / naturalW : 1
    return [new ImageRun({ data: imgData, transformation: { width: Math.round(naturalW * scale), height: Math.round(naturalH * scale) }, type: imgType })]
  }
  return (node.content ?? []).flatMap(inlineToRuns)
}

function alignToDocx(align: string | undefined): typeof AlignmentType[keyof typeof AlignmentType] {
  if (align === 'center') return AlignmentType.CENTER
  if (align === 'right') return AlignmentType.RIGHT
  if (align === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}

// Letter page is 8.5in wide. These are updated at the start of each DOCX export based on margins.
let CONTENT_WIDTH_TWIPS = 9360  // default: (8.5 - 1 - 1) × 1440
let MAX_IMG_WIDTH_PX = 624       // default: 6.5 × 96

function getImageDimensions(data: Buffer, type: string): { width: number; height: number } | null {
  try {
    if (type === 'png') {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    }
    if (type === 'jpg' || type === 'jpeg') {
      let i = 2
      while (i < data.length - 8) {
        if (data[i] !== 0xFF) break
        const marker = data[i + 1]!
        if (marker >= 0xC0 && marker <= 0xC3) {
          return { height: data.readUInt16BE(i + 5), width: data.readUInt16BE(i + 7) }
        }
        if (marker === 0xD9) break
        i += 2 + data.readUInt16BE(i + 2)
      }
    }
  } catch { /* ignore */ }
  return null
}

// Render a LaTeX string to an SVG Buffer suitable for ImageRun.
// KaTeX's HTML output embeds the formula as nested spans with CSS — it does not
// produce a standalone SVG. We wrap it in a minimal SVG so Word can embed it
// as a vector image. The SVG uses a foreignObject to host the KaTeX HTML.
// Word 2016+ supports SVG images in DOCX.
function mathToSvgBuffer(latex: string, displayMode: boolean): { data: Buffer; width: number; height: number } | null {
  try {
    const html = katex.renderToString(latex, { throwOnError: false, displayMode, output: 'html' })
    // Rough size estimate: display formulas are taller; inline ones are line-height.
    const width = displayMode ? 320 : 200
    const height = displayMode ? 56 : 24
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xhtml="http://www.w3.org/1999/xhtml"`,
      ` width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<foreignObject width="100%" height="100%">`,
      `<div xmlns="http://www.w3.org/1999/xhtml" style="font-size:14px;display:flex;align-items:center;justify-content:${displayMode ? 'center' : 'flex-start'};height:${height}px;">`,
      html,
      `</div></foreignObject></svg>`,
    ].join('')
    return { data: Buffer.from(svg, 'utf-8'), width, height }
  } catch {
    return null
  }
}

// Recursively processes listItem children, threading the same numbering ref at the correct depth.
function processListItemContent(
  item: JSONContent,
  reg: NumberingDef[],
  format: string,
  ref: string,
  level: number,
  isBullet: boolean,
): DocxChild[] {
  return (item.content ?? []).flatMap((child) => {
    if (child.type === 'bulletList' && isBullet) {
      return (child.content ?? []).flatMap((sub) =>
        processListItemContent(sub, reg, format, ref, level + 1, true)
      )
    }
    if (child.type === 'orderedList' && !isBullet) {
      return (child.content ?? []).flatMap((sub) =>
        processListItemContent(sub, reg, format, ref, level + 1, false)
      )
    }
    if (child.type === 'bulletList' || child.type === 'orderedList') {
      // Mixed nesting (bullet inside ordered or vice versa) — new numbering def
      return nodeToParagraphs(child, reg, format)
    }
    return nodeToParagraphs(child, reg, format, ref, level)
  })
}

function nodeToParagraphs(
  node: JSONContent,
  reg: NumberingDef[],
  format = 'none',
  numRef?: string,
  level = 0,
): DocxChild[] {
  const align = node.attrs?.textAlign as string | undefined
  const isFormatted = format === 'mla' || format === 'apa'

  switch (node.type) {
    case 'paragraph': {
      const role = node.attrs?.role as string | undefined
      const noIndent = node.attrs?.noIndent as boolean | undefined
      const applyFirstLine = isFormatted && !role && !noIndent && numRef === undefined
      const runs = (node.content ?? []).flatMap(inlineToRuns)
      const pageBreakBefore = role === 'abstract-heading'
      const indent = applyFirstLine
        ? { firstLine: 720 }
        : role === 'citation'
          ? { left: 720, hanging: 720 }
          : undefined
      const lh = node.attrs?.lineHeight as number | null | undefined
      const spacingLine = lh ? Math.round(lh * 240) : 480
      return [
        new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          alignment: alignToDocx(align),
          spacing: { line: spacingLine, after: 0 },
          ...(indent ? { indent } : {}),
          ...(numRef !== undefined ? { numbering: { reference: numRef, level } } : {}),
          ...(pageBreakBefore ? { pageBreakBefore: true } : {}),
        }),
      ]
    }

    case 'heading': {
      const lvl = (node.attrs?.level as number) ?? 1
      const headingMap: Record<number, HeadingLevel> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      }
      return [
        new Paragraph({
          children: (node.content ?? []).flatMap(inlineToRuns),
          heading: headingMap[lvl] ?? HeadingLevel.HEADING_1,
          alignment: alignToDocx(align),
          pageBreakBefore: isBibliographyHeading(node),
        }),
      ]
    }

    case 'bulletList': {
      const ref = `bullet-${randomUUID()}`
      reg.push({
        reference: ref,
        levels: Array.from({ length: 9 }, (_, i) => {
          const c = i % 3
          return {
            level: i,
            format: LevelFormat.BULLET,
            text: c === 0 ? '•' : c === 1 ? '◦' : '▪',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
          }
        }),
      })
      return (node.content ?? []).flatMap((item) =>
        processListItemContent(item, reg, format, ref, 0, true)
      )
    }

    case 'orderedList': {
      const ref = `ordered-${randomUUID()}`
      reg.push({
        reference: ref,
        levels: Array.from({ length: 9 }, (_, i) => {
          const c = i % 3
          return {
            level: i,
            format: c === 0 ? LevelFormat.DECIMAL : c === 1 ? LevelFormat.LOWER_LETTER : LevelFormat.LOWER_ROMAN,
            text: `%${i + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
          }
        }),
      })
      return (node.content ?? []).flatMap((item) =>
        processListItemContent(item, reg, format, ref, 0, false)
      )
    }

    case 'blockquote':
      return (node.content ?? []).flatMap((n) => [
        new Paragraph({
          children: (n.content ?? []).flatMap(inlineToRuns),
          indent: { left: 720 },
          spacing: { line: 480, after: 0 },
          alignment: alignToDocx(n.attrs?.textAlign as string | undefined),
        }),
      ])

    case 'horizontalRule':
      return [new Paragraph({ children: [new TextRun('─'.repeat(40))], spacing: { after: 0 } })]

    case 'codeBlock':
      return [new Paragraph({ children: [new TextRun({ text: inlineText(node), font: 'Courier New' })], spacing: { after: 0 } })]

    case 'image': {
      const src = (node.attrs?.src as string) ?? ''
      const match = src.match(/^data:image\/(\w+);base64,(.+)$/)
      if (!match) return []
      const imgType = (match[1] ?? 'png') as 'png' | 'jpg' | 'jpeg' | 'gif' | 'bmp' | 'svg' | 'webp'
      const imgData = Buffer.from(match[2]!, 'base64')
      const attrW = node.attrs?.width as number | null | undefined
      const attrH = node.attrs?.height as number | null | undefined
      const dims = getImageDimensions(imgData, imgType)
      const naturalW = dims?.width ?? MAX_IMG_WIDTH_PX
      const naturalH = dims?.height ?? Math.round(MAX_IMG_WIDTH_PX * 0.75)
      let width: number, height: number
      if (attrW && attrH) {
        // User explicitly sized the image; clamp to content width
        const clamp = attrW > MAX_IMG_WIDTH_PX ? MAX_IMG_WIDTH_PX / attrW : 1
        width = Math.round(attrW * clamp)
        height = Math.round(attrH * clamp)
      } else {
        const scale = naturalW > MAX_IMG_WIDTH_PX ? MAX_IMG_WIDTH_PX / naturalW : 1
        width = Math.round(naturalW * scale)
        height = Math.round(naturalH * scale)
      }
      return [
        new Paragraph({
          children: [
            new ImageRun({ data: imgData, transformation: { width, height }, type: imgType }),
          ],
          spacing: { after: 0 },
        }),
      ]
    }

    case 'table': {
      const firstRow = node.content?.[0]
      const colCount = firstRow?.content?.length ?? 1
      // Compute per-column widths from colwidth attrs, scaling down if they exceed content width
      const firstRowCells = firstRow?.content ?? []
      const rawWidthsPx = firstRowCells.map((c) => {
        const cw = (c.attrs?.colwidth as number[] | null | undefined)?.[0]
        return cw && cw > 0 ? cw : null
      })
      const allHaveWidths = rawWidthsPx.length > 0 && rawWidthsPx.every((w) => w !== null)
      const totalPx = allHaveWidths ? rawWidthsPx.reduce((s, w) => s + (w ?? 0), 0) : 0
      const colWidthsTwips: number[] = allHaveWidths && totalPx > 0
        ? (() => {
            const totalTwips = totalPx * 15
            const scale = totalTwips > CONTENT_WIDTH_TWIPS ? CONTENT_WIDTH_TWIPS / totalTwips : 1
            return rawWidthsPx.map((w) => Math.round(w! * 15 * scale))
          })()
        : Array.from({ length: colCount }, () => Math.floor(CONTENT_WIDTH_TWIPS / colCount))
      const tableTotalWidth = colWidthsTwips.reduce((s, w) => s + w, 0)

      const rows = (node.content ?? []).map((row) => {
        const rowHeightPx = row.attrs?.height as number | null | undefined
        return new DocxTableRow({
          ...(rowHeightPx ? { height: { value: Math.round(rowHeightPx * 15), rule: 'atLeast' } } : {}),
          children: (row.content ?? []).map((cell, cellIdx) => {
            const ca = cell.attrs ?? {}
            const bgColor = ca.backgroundColor as string | null | undefined
            const bColor = ca.borderColor as string | null | undefined
            const bWidth = ca.borderWidth as number | null | undefined
            const borderSizeHalfPts = bWidth ? Math.max(2, Math.round(bWidth * 4)) : 8
            const borderColorHex = bColor ? (bColor as string).replace('#', '') : '000000'
            const borderSpec = { style: BorderStyle.SINGLE, size: borderSizeHalfPts, color: borderColorHex }
            return new DocxTableCell({
              children: (cell.content ?? []).flatMap((n) => nodeToParagraphs(n, reg, format)) as Paragraph[],
              width: { size: colWidthsTwips[cellIdx] ?? Math.floor(CONTENT_WIDTH_TWIPS / colCount), type: WidthType.DXA },
              ...(bgColor ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: (bgColor as string).replace('#', '') } } : {}),
              borders: { top: borderSpec, bottom: borderSpec, left: borderSpec, right: borderSpec },
            })
          }),
        })
      })
      return [new DocxTable({ rows, width: { size: tableTotalWidth, type: WidthType.DXA } })]
    }

    case 'blockMath': {
      const latex = (node.attrs?.latex as string) ?? ''
      const svg = mathToSvgBuffer(latex, true)
      if (svg) {
        return [
          new Paragraph({
            children: [new ImageRun({ data: svg.data, transformation: { width: svg.width, height: svg.height }, type: 'svg' })],
            alignment: AlignmentType.CENTER,
            spacing: { before: 120, after: 120 },
          }),
        ]
      }
      return [
        new Paragraph({
          children: [new TextRun({ text: latex, font: 'Courier New' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        }),
      ]
    }

    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()], spacing: { after: 0 } })]

    case 'doc':
      return (node.content ?? []).flatMap((n) => nodeToParagraphs(n, reg, format))

    default:
      return []
  }
}

function buildDocxHeader(runningHead: string | null, format: string): Header | undefined {
  if (!runningHead || (format !== 'mla' && format !== 'apa')) return undefined
  if (format === 'mla') {
    return new Header({
      children: [
        new Paragraph({
          children: [
            new TextRun({ text: `${runningHead} ` }),
            new TextRun({ children: [PageNumber.CURRENT] }),
          ],
          alignment: AlignmentType.RIGHT,
        }),
      ],
    })
  }
  // APA: short title left, page number right (two-column approach via tab stop)
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: runningHead.toUpperCase() }),
          new TextRun({ children: [PageNumber.CURRENT] }),
        ],
        alignment: AlignmentType.RIGHT,
        tabStops: [{ type: 'left', position: 0 }],
      }),
    ],
  })
}

interface ZoneDocxParsed {
  segments: Array<(TextRun | ExternalHyperlink)[]>
  textAlign: string
}

function parseZoneForDocx(raw: string | null): ZoneDocxParsed | null {
  if (!raw) return null
  try {
    const doc = JSON.parse(raw) as JSONContent
    const firstPara = doc.content?.[0]
    if (!firstPara) return null
    const nodes = firstPara.content ?? []
    const textAlign = (firstPara.attrs?.textAlign as string) ?? 'left'

    const nodeSegments: JSONContent[][] = []
    let cur: JSONContent[] = []
    for (const n of nodes) {
      if (n.type === 'rightTab') { nodeSegments.push(cur); cur = [] }
      else cur.push(n)
    }
    nodeSegments.push(cur)

    const segments = nodeSegments.map((seg) =>
      seg.flatMap((n): (TextRun | ExternalHyperlink)[] => {
        if (n.type === 'pageNumber') return [new TextRun({ children: [PageNumber.CURRENT] })]
        return inlineToRuns(n).filter((r): r is TextRun | ExternalHyperlink => !(r instanceof ImageRun))
      })
    )
    return { segments, textAlign }
  } catch {
    return null
  }
}

// Build a single Paragraph from a parsed zone, respecting tab structure.
function buildDocxZoneParagraph(parsed: ZoneDocxParsed): Paragraph {
  const { segments, textAlign } = parsed

  if (segments.length === 1) {
    const alignment =
      textAlign === 'center' ? AlignmentType.CENTER :
      textAlign === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT
    return new Paragraph({ children: segments[0]!, alignment })
  }

  if (segments.length === 2) {
    const [left, right] = segments
    if (!left!.length) {
      // MLA-style: tab at start, everything right-aligned
      return new Paragraph({ children: right!, alignment: AlignmentType.RIGHT })
    }
    return new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIPS }],
      children: [...left!, new TextRun({ text: '\t' }), ...right!],
      alignment: AlignmentType.LEFT,
    })
  }

  // 3+ segments: center + right tab stops
  const tabStops = segments.length === 3
    ? [
        { type: TabStopType.CENTER, position: Math.round(CONTENT_WIDTH_TWIPS / 2) },
        { type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIPS },
      ]
    : segments.slice(1).map((_, i) => ({
        type: i === segments.length - 2 ? TabStopType.RIGHT : TabStopType.CENTER,
        position: Math.round(CONTENT_WIDTH_TWIPS * (i + 1) / (segments.length - 1)),
      }))

  const children: (TextRun | ExternalHyperlink)[] = []
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) children.push(new TextRun({ text: '\t' }))
    children.push(...segments[i]!)
  }
  return new Paragraph({ tabStops, children, alignment: AlignmentType.LEFT })
}

// Page sizes in twips (1 in = 1440 twips). Width × Height in portrait orientation.
const DOCX_PAGE_SIZE: Record<string, { w: number; h: number }> = {
  Letter: { w: 12240, h: 15840 },
  A4:     { w: 11906, h: 16838 },
  Legal:  { w: 12240, h: 20160 },
}

async function buildDocxBuffer(id: string, opts: ExportOptions): Promise<Buffer | null> {
  const row = await fetchDocument(id)
  if (!row) return null
  const doc = parseContent(row.content)

  const effectiveHeaderRaw = opts.includeHeader ? row.header_content : null
  const effectiveFooterRaw = opts.includeFooter ? row.footer_content : null

  // Build DOCX header
  let docxHeader: Header | undefined
  if (effectiveHeaderRaw) {
    const parsed = parseZoneForDocx(effectiveHeaderRaw)
    if (parsed) docxHeader = new Header({ children: [buildDocxZoneParagraph(parsed)] })
  } else if (opts.includeHeader) {
    const runningHead = extractRunningHead(doc, row.format)
    docxHeader = buildDocxHeader(runningHead, row.format)
  }

  // Build DOCX footer
  let docxFooter: Footer | undefined
  if (effectiveFooterRaw) {
    const parsed = parseZoneForDocx(effectiveFooterRaw)
    if (parsed) docxFooter = new Footer({ children: [buildDocxZoneParagraph(parsed)] })
  }

  const docMargins = opts.margins
  const PAGE_MARGIN = {
    top: Math.round(docMargins.top * 1440),
    right: Math.round(docMargins.right * 1440),
    bottom: Math.round(docMargins.bottom * 1440),
    left: Math.round(docMargins.left * 1440),
  }

  // Page size: use landscape dimensions when requested
  const baseSize = DOCX_PAGE_SIZE[opts.pageSize] ?? DOCX_PAGE_SIZE.Letter
  const pageW = opts.orientation === 'landscape' ? baseSize.h : baseSize.w
  const pageH = opts.orientation === 'landscape' ? baseSize.w : baseSize.h
  const pageWidthIn = pageW / 1440
  const contentIn = Math.max(1, pageWidthIn - docMargins.left - docMargins.right)
  CONTENT_WIDTH_TWIPS = Math.round(contentIn * 1440)
  MAX_IMG_WIDTH_PX = Math.round(contentIn * 96)

  const numberingDefs: NumberingDef[] = []

  // For APA: split content into title page (vertically centered) + body sections
  let sections: object[]
  if (row.format === 'apa') {
    const docNodes = (doc.content ?? []) as JSONContent[]
    let splitIdx = 0
    for (let i = 0; i < docNodes.length; i++) {
      if ((docNodes[i].attrs?.role as string | undefined) === 'apa-header') splitIdx = i + 1
      else break
    }
    const titleDoc: JSONContent = { type: 'doc', content: docNodes.slice(0, splitIdx) }
    const bodyDoc: JSONContent = { type: 'doc', content: docNodes.slice(splitIdx) }
    const titleChildren = nodeToParagraphs(titleDoc, numberingDefs, row.format) as (Paragraph | DocxTable)[]
    const bodyChildren = nodeToParagraphs(bodyDoc, numberingDefs, row.format) as (Paragraph | DocxTable)[]
    const pageProps = { margin: PAGE_MARGIN, size: { width: pageW, height: pageH } }
    sections = [
      {
        properties: { page: pageProps, verticalAlign: VerticalAlignSection.CENTER },
        ...(docxHeader ? { headers: { default: docxHeader } } : {}),
        children: titleChildren.length ? titleChildren : [new Paragraph({ children: [] })],
      },
      {
        properties: { page: pageProps },
        ...(docxHeader ? { headers: { default: docxHeader } } : {}),
        ...(docxFooter ? { footers: { default: docxFooter } } : {}),
        children: bodyChildren,
      },
    ]
  } else {
    const children = nodeToParagraphs(doc, numberingDefs, row.format)
    sections = [
      {
        properties: { page: { margin: PAGE_MARGIN, size: { width: pageW, height: pageH } } },
        ...(docxHeader ? { headers: { default: docxHeader } } : {}),
        ...(docxFooter ? { footers: { default: docxFooter } } : {}),
        children: children as (Paragraph | DocxTable)[],
      },
    ]
  }

  const docxDoc = new DocxDocument({
    ...(numberingDefs.length > 0 ? { numbering: { config: numberingDefs } } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sections: sections as any,
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 } },
      },
    },
  })

  return Packer.toBuffer(docxDoc)
}

export async function getPreviewDocx(id: string, opts: ExportOptions): Promise<Buffer | null> {
  return buildDocxBuffer(id, opts)
}

export async function exportToDocx(id: string, opts: ExportOptions): Promise<string | null> {
  const buffer = await buildDocxBuffer(id, opts)
  if (!buffer) throw new Error('Document not found')

  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as DOCX',
    defaultPath: opts.fileName,
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  })
  if (filePath) { await writeFile(filePath, buffer); return filePath }
  return null
}
