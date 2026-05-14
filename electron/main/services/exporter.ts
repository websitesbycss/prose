import { dialog, BrowserWindow, app } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  UnderlineType,
  Table as DocxTable,
  TableRow as DocxTableRow,
  TableCell as DocxTableCell,
  WidthType,
  BorderStyle,
} from 'docx'
import type { JSONContent } from '@tiptap/core'
import type Database from 'better-sqlite3'

// ── helpers ──────────────────────────────────────────────────────────────────

function fetchDocument(db: Database.Database, id: string): { content: string; title: string } | null {
  const row = db.prepare('SELECT title, content FROM documents WHERE id = ?').get(id) as
    | { title: string; content: string }
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

function nodeToHtml(node: JSONContent): string {
  const align = (node.attrs?.textAlign as string) ?? ''
  const alignStyle = align && align !== 'left' ? ` style="text-align:${align}"` : ''
  switch (node.type) {
    case 'doc':
      return (node.content ?? []).map(nodeToHtml).join('')
    case 'paragraph':
      return `<p${alignStyle}>${(node.content ?? []).map(inlineToHtml).join('') || '&nbsp;'}</p>`
    case 'heading': {
      const level = (node.attrs?.level as number) ?? 1
      return `<h${level}${alignStyle}>${(node.content ?? []).map(inlineToHtml).join('')}</h${level}>`
    }
    case 'bulletList':
      return `<ul>${(node.content ?? []).map(nodeToHtml).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map(nodeToHtml).join('')}</ol>`
    case 'listItem':
      return `<li>${(node.content ?? []).map(nodeToHtml).join('')}</li>`
    case 'blockquote':
      return `<blockquote>${(node.content ?? []).map(nodeToHtml).join('')}</blockquote>`
    case 'horizontalRule':
      return '<hr>'
    case 'codeBlock':
      return `<pre><code>${escapeHtml(inlineText(node))}</code></pre>`
    case 'image': {
      const src = escapeHtml((node.attrs?.src as string) ?? '')
      const alt = escapeHtml((node.attrs?.alt as string) ?? '')
      return `<img src="${src}" alt="${alt}" style="max-width:100%">`
    }
    case 'table':
      return `<table border="1" style="border-collapse:collapse;width:100%">${(node.content ?? []).map(nodeToHtml).join('')}</table>`
    case 'tableRow':
      return `<tr>${(node.content ?? []).map(nodeToHtml).join('')}</tr>`
    case 'tableHeader':
      return `<th style="padding:4px 8px">${(node.content ?? []).map(nodeToHtml).join('')}</th>`
    case 'tableCell':
      return `<td style="padding:4px 8px">${(node.content ?? []).map(nodeToHtml).join('')}</td>`
    default:
      return (node.content ?? []).map(nodeToHtml).join('')
  }
}

function buildHtmlPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Times New Roman', serif; font-size: 12pt; margin: 1in; line-height: 2; color: #000; }
  h1 { font-size: 14pt; } h2 { font-size: 13pt; } h3 { font-size: 12pt; }
  p { margin: 0 0 0.5em; } ul, ol { margin: 0.5em 0; padding-left: 2em; }
  blockquote { margin: 0.5em 2em; } pre { background: #f5f5f5; padding: 0.5em; }
  table { width: 100%; border-collapse: collapse; margin: 0.5em 0; }
  th, td { border: 1px solid #000; padding: 4px 8px; }
  img { max-width: 100%; }
</style>
</head><body>${body}</body></html>`
}

export async function exportToPdf(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)
  const html = buildHtmlPage(row.title, nodeToHtml(doc))

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
    margins: { marginType: 'custom', top: 1, bottom: 1, left: 1, right: 1 },
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
  return (node.content ?? []).flatMap(inlineToRuns)
}

function alignToDocx(align: string | undefined): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (align === 'center') return AlignmentType.CENTER
  if (align === 'right') return AlignmentType.RIGHT
  if (align === 'justify') return AlignmentType.JUSTIFIED
  return AlignmentType.LEFT
}

function nodeToParagraphs(node: JSONContent, numId?: number, level = 0): DocxChild[] {
  const align = node.attrs?.textAlign as string | undefined
  switch (node.type) {
    case 'paragraph': {
      const runs = (node.content ?? []).flatMap(inlineToRuns)
      const p = new Paragraph({
        children: runs.length ? runs : [new TextRun('')],
        alignment: alignToDocx(align),
        spacing: { line: 480, after: 0 },
        ...(numId !== undefined
          ? { numbering: { reference: `list-${numId}`, level } }
          : {}),
      })
      return [p]
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
        }),
      ]
    }
    case 'bulletList': {
      const id = Math.floor(Math.random() * 900000) + 100000
      return (node.content ?? []).flatMap((item) =>
        (item.content ?? []).flatMap((child) => nodeToParagraphs(child, id, level))
      )
    }
    case 'orderedList': {
      const id = Math.floor(Math.random() * 900000) + 100000
      return (node.content ?? []).flatMap((item) =>
        (item.content ?? []).flatMap((child) => nodeToParagraphs(child, id + 1, level))
      )
    }
    case 'blockquote':
      return (node.content ?? []).flatMap((n) => {
        const children = nodeToParagraphs(n)
        return children.map((child) => {
          if (child instanceof Paragraph) {
            return new Paragraph({
              children: (child as unknown as { options: { children: TextRun[] } }).options.children,
              indent: { left: 720 },
              spacing: { line: 480, after: 0 },
            })
          }
          return child
        })
      })
    case 'horizontalRule':
      return [new Paragraph({ children: [new TextRun('─'.repeat(40))], spacing: { after: 0 } })]
    case 'codeBlock':
      return [new Paragraph({ children: [new TextRun({ text: inlineText(node), font: 'Courier New' })], spacing: { after: 0 } })]
    case 'table': {
      const rows = (node.content ?? []).map((row) =>
        new DocxTableRow({
          children: (row.content ?? []).map(
            (cell) =>
              new DocxTableCell({
                children: (cell.content ?? []).flatMap((n) => nodeToParagraphs(n)) as Paragraph[],
                width: { size: 2000, type: WidthType.DXA },
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
      return [new DocxTable({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })]
    }
    case 'doc':
      return (node.content ?? []).flatMap((n) => nodeToParagraphs(n))
    default:
      return []
  }
}

export async function exportToDocx(db: Database.Database, id: string): Promise<void> {
  const row = fetchDocument(db, id)
  if (!row) throw new Error('Document not found')
  const doc = parseContent(row.content)

  const children = nodeToParagraphs(doc)

  const docxDoc = new DocxDocument({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: children as Paragraph[],
      },
    ],
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 24 },
        },
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
