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
  HeadingLevel,
  AlignmentType,
  UnderlineType,
  LevelFormat,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
  Header,
  PageNumber,
} from 'docx'
import type { JSONContent } from '@tiptap/core'
import type Database from 'better-sqlite3'

// ── helpers ──────────────────────────────────────────────────────────────────

function fetchDocument(db: Database.Database, id: string): { content: string; title: string; format: string } | null {
  const row = db.prepare('SELECT title, content, format FROM documents WHERE id = ?').get(id) as
    | { title: string; content: string; format: string }
    | undefined
  return row ?? null
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

export async function exportToPlainText(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const text = nodeToPlainText(doc)
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as Plain Text',
    defaultPath: `${row.title}.txt`,
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  })
  if (filePath) await writeFile(filePath, text, 'utf8')
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
      return (node.content ?? []).map((n) => nodeToMarkdown(n)).join('\n\n')
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

export async function exportToMarkdown(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const md = nodeToMarkdown(doc)
  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as Markdown',
    defaultPath: `${row.title}.md`,
    filters: [{ name: 'Markdown Files', extensions: ['md'] }],
  })
  if (filePath) await writeFile(filePath, md, 'utf8')
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
      else if (mark.type === 'strike') text = `<s>${text}</s>`
      else if (mark.type === 'code') text = `<code>${text}</code>`
      else if (mark.type === 'textStyle') {
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
        const titlePage = `<div style="min-height:9in;display:flex;flex-direction:column;align-items:center;justify-content:center;">${headerHtml}</div>`
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
      const styles = [alignStyle, firstLine, pageBreak].filter(Boolean).join(';')
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
    case 'image': {
      const src = escapeHtml((node.attrs?.src as string) ?? '')
      const alt = escapeHtml((node.attrs?.alt as string) ?? '')
      return `<img src="${src}" alt="${alt}" style="max-width:100%">`
    }
    case 'table':
      return `<table border="1" style="border-collapse:collapse;width:100%">${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</table>`
    case 'tableRow':
      return `<tr>${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</tr>`
    case 'tableHeader':
      return `<th style="padding:4px 8px">${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</th>`
    case 'tableCell':
      return `<td style="padding:4px 8px">${(node.content ?? []).map((n) => nodeToHtml(n, format)).join('')}</td>`
    default:
      return (node.content ?? []).map((n) => nodeToHtml(n, format)).join('')
  }
}

function buildHtmlPage(
  title: string,
  body: string,
  format = 'none',
  runningHead: string | null = null,
): string {
  const pageNumSpan = '<span style="font-variant-numeric:normal" class="pn"></span>'

  let headerHtml = ''
  if (runningHead && (format === 'mla' || format === 'apa')) {
    const hStyle = 'position:fixed;top:0.5in;font-family:"Times New Roman",serif;font-size:12pt;line-height:1;'
    if (format === 'mla') {
      headerHtml = `<div style="${hStyle}right:1in;">${escapeHtml(runningHead)} ${pageNumSpan}</div>`
    } else {
      headerHtml = `<div style="${hStyle}left:1in;right:1in;display:flex;justify-content:space-between;"><span style="text-transform:uppercase">${escapeHtml(runningHead)}</span>${pageNumSpan}</div>`
    }
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 1in; }
  body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 0; line-height: 2; color: #000; }
  .pn::before { content: counter(page); }
  h1 { font-size: 14pt; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }
  p { margin: 0; } ul, ol { margin: 0.5em 0; padding-left: 2em; }
  blockquote { margin: 0.5em 2em; } pre { background: #f5f5f5; padding: 0.5em; }
  table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  th, td { border: 1px solid #000; padding: 4px 8px; }
  img { max-width: 100%; }
</style>
</head><body>${headerHtml}${body}</body></html>`
}

export async function exportToPdf(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const runningHead = extractRunningHead(doc, row.format)
  const html = buildHtmlPage(row.title, nodeToHtml(doc, row.format), row.format, runningHead)

  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as PDF',
    defaultPath: `${row.title}.pdf`,
    filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
  })
  if (!filePath) return

  // Write HTML to temp file, load it in a hidden window, print to PDF
  const tmpHtml = join(tmpdir(), `prose-export-${randomUUID()}.html`)
  await writeFile(tmpHtml, html, 'utf8')

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await win.loadFile(tmpHtml)
  const pdfBuffer = await win.webContents.printToPDF({
    margins: { marginType: 'none' },
    pageSize: 'Letter',
    printBackground: false,
  })
  win.destroy()

  await writeFile(filePath, pdfBuffer)
  // Clean up temp file (best-effort)
  import('fs').then(({ unlinkSync }) => { try { unlinkSync(tmpHtml) } catch { /* ignore */ } })
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
    else if (mark.type === 'textStyle') {
      if (mark.attrs?.color) opts.color = (mark.attrs.color as string).replace('#', '')
      if (mark.attrs?.fontSize) opts.size = Math.round(parseFloat(mark.attrs.fontSize as string) * 2)
      if (mark.attrs?.fontFamily) opts.font = mark.attrs.fontFamily as string
    }
  }
  return new TextRun(opts)
}

function inlineToRuns(node: JSONContent): TextRun[] {
  if (node.type === 'text') return [marksToRun(node.text ?? '', node.marks)]
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
  if (node.type === 'pageNumber') return [new TextRun({ children: [PageNumber.CURRENT] })]
  return (node.content ?? []).flatMap(inlineToRuns)
}

function alignToDocx(align: string | undefined): typeof AlignmentType[keyof typeof AlignmentType] {
  if (align === 'center') return AlignmentType.CENTER
  if (align === 'right') return AlignmentType.RIGHT
  if (align === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}

// Content width for a letter page with 1in margins on each side: 6.5in × 1440 twips/in
const CONTENT_WIDTH_TWIPS = 9360

// Max image width in pixels (6.5in × 96dpi). Height is derived to preserve aspect ratio.
const MAX_IMG_WIDTH_PX = 624

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
      return [
        new Paragraph({
          children: runs.length ? runs : [new TextRun('')],
          alignment: alignToDocx(align),
          spacing: { line: 480, after: 0 },
          ...(applyFirstLine ? { indent: { firstLine: 720 } } : {}),
          ...(numRef !== undefined ? { numbering: { reference: numRef, level } } : {}),
          ...(role === 'abstract-heading' ? { pageBreakBefore: true } : {}),
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
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: '◦', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          { level: 2, format: LevelFormat.BULLET, text: '▪', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
        ],
      })
      return (node.content ?? []).flatMap((item) =>
        (item.content ?? []).flatMap((child) => nodeToParagraphs(child, reg, format, ref, level))
      )
    }

    case 'orderedList': {
      const ref = `ordered-${randomUUID()}`
      reg.push({
        reference: ref,
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.LOWER_LETTER, text: '%2.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
          { level: 2, format: LevelFormat.LOWER_ROMAN, text: '%3.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 2160, hanging: 360 } } } },
        ],
      })
      return (node.content ?? []).flatMap((item) =>
        (item.content ?? []).flatMap((child) => nodeToParagraphs(child, reg, format, ref, level))
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
      const dims = getImageDimensions(imgData, imgType)
      const naturalW = dims?.width ?? MAX_IMG_WIDTH_PX
      const naturalH = dims?.height ?? Math.round(MAX_IMG_WIDTH_PX * 0.75)
      const scale = naturalW > MAX_IMG_WIDTH_PX ? MAX_IMG_WIDTH_PX / naturalW : 1
      const width = Math.round(naturalW * scale)
      const height = Math.round(naturalH * scale)
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
      const cellWidth = Math.floor(CONTENT_WIDTH_TWIPS / colCount)
      const rows = (node.content ?? []).map((row) =>
        new DocxTableRow({
          children: (row.content ?? []).map(
            (cell) =>
              new DocxTableCell({
                children: (cell.content ?? []).flatMap((n) => nodeToParagraphs(n, reg, format)) as Paragraph[],
                width: { size: cellWidth, type: WidthType.DXA },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 1 },
                  bottom: { style: BorderStyle.SINGLE, size: 1 },
                  left: { style: BorderStyle.SINGLE, size: 1 },
                  right: { style: BorderStyle.SINGLE, size: 1 },
                },
              })
          ),
        })
      )
      return [new DocxTable({ rows, width: { size: CONTENT_WIDTH_TWIPS, type: WidthType.DXA } })]
    }

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

export async function exportToDocx(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)

  const runningHead = extractRunningHead(doc, row.format)
  const docxHeader = buildDocxHeader(runningHead, row.format)

  const numberingDefs: NumberingDef[] = []
  const children = nodeToParagraphs(doc, numberingDefs, row.format)

  const docxDoc = new DocxDocument({
    ...(numberingDefs.length > 0 ? { numbering: { config: numberingDefs } } : {}),
    sections: [
      {
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        ...(docxHeader ? { headers: { default: docxHeader } } : {}),
        children: children as (Paragraph | DocxTable)[],
      },
    ],
    styles: {
      default: {
        document: { run: { font: 'Times New Roman', size: 24 } },
      },
    },
  })

  const buffer = await Packer.toBuffer(docxDoc)

  const { filePath } = await dialog.showSaveDialog({
    title: 'Export as DOCX',
    defaultPath: `${row.title}.docx`,
    filters: [{ name: 'Word Document', extensions: ['docx'] }],
  })
  if (filePath) await writeFile(filePath, buffer)
}
