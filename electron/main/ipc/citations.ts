import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import { resolveDocument, writeProseFile, type ProseFileCitation } from '../services/fileService'
import { getAllIndexRows } from '../services/indexDb'
import { formatAll, fieldsFromRecord, type CitationType } from '../lib/citationFormat'

// ── Output types (same shape the renderer expects) ────────────────────────────

interface CitationOut {
  id: string
  documentId: string
  type: string
  fields: Record<string, string>
  formatted: { mla: string; apa: string; chicago: string; ieee: string }
  createdAt: string
}

interface CitationFieldsOut {
  author?: string
  title?: string
  year?: string
  publisher?: string
  journal?: string
  url?: string
  pages?: string
  volume?: string
  issue?: string
}

const VALID_CITATION_TYPES = new Set(['book', 'article', 'website', 'journal'])

function citationToOut(c: ProseFileCitation, documentId: string): CitationOut {
  const type = VALID_CITATION_TYPES.has(c.type) ? c.type as CitationType : 'book'
  const fields = fieldsFromRecord(c.fields as Record<string, unknown>)
  return {
    id: c.id,
    documentId,
    type: c.type,
    fields: fields as Record<string, string>,
    formatted: formatAll(type, fields),
    createdAt: c.createdAt,
  }
}

async function fetchDoiMetadata(doi: string): Promise<CitationFieldsOut | null> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Prose/1.0 (mailto:support@prose.app)' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as {
      message?: {
        title?: string[]
        author?: { given?: string; family?: string }[]
        'published-print'?: { 'date-parts'?: number[][] }
        publisher?: string
        'container-title'?: string[]
        page?: string
        volume?: string
        issue?: string
        URL?: string
      }
    }
    const msg = body.message
    if (!msg) return null
    const authors = (msg.author ?? []).map((a) => [a.family, a.given].filter(Boolean).join(', ')).join('; ')
    const year = msg['published-print']?.['date-parts']?.[0]?.[0]?.toString() ?? ''
    return {
      author: authors || undefined,
      title: msg.title?.[0] ?? undefined,
      year: year || undefined,
      publisher: msg.publisher ?? undefined,
      journal: msg['container-title']?.[0] ?? undefined,
      pages: msg.page ?? undefined,
      volume: msg.volume ?? undefined,
      issue: msg.issue ?? undefined,
      url: msg.URL ?? undefined,
    }
  } catch { return null }
}

// Blocks SSRF: only allows public HTTP(S) URLs; rejects private/loopback/link-local addresses.
function assertSafePublicUrl(raw: string): void {
  let parsed: URL
  try { parsed = new URL(raw) } catch { throw new Error('Malformed URL') }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS URLs are allowed')
  }
  const h = parsed.hostname.toLowerCase()
  // Block decimal IP encodings (e.g. 2130706433 = 127.0.0.1)
  if (/^\d+$/.test(h)) {
    const n = Number(h)
    if (n === 2130706433 || n === 0) throw new Error('Private and loopback addresses are not allowed')
  }
  if (
    h === 'localhost' ||
    h === '0.0.0.0' ||
    h.endsWith('.localhost') ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) ||
    /^::1$/.test(h) ||
    /^\[::1\]$/.test(h) ||
    /^fc00:/i.test(h) ||
    /^fd[0-9a-f]{2}:/i.test(h) ||
    /^::ffff:127\./i.test(h) ||
    h === '0x7f000001'
  ) {
    throw new Error('Private and loopback addresses are not allowed')
  }
}

async function fetchUrlMetadata(url: string): Promise<CitationFieldsOut | null> {
  assertSafePublicUrl(url)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Prose/1.0' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const html = await res.text()
    const extract = (property: string): string | undefined => {
      const ogMatch = html.match(new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
      if (ogMatch?.[1]) return ogMatch[1]
      const nameMatch = html.match(new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
      return nameMatch?.[1]
    }
    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = extract('title') ?? titleTagMatch?.[1]?.trim()
    const author = extract('author')
    const siteName = extract('site_name')
    if (!title && !author) return null
    return { title: title ?? undefined, author: author ?? undefined, publisher: siteName ?? undefined, url }
  } catch { return null }
}

function convertAuthorsToLastFirst(names: string[]): string {
  return names
    .map((name) => {
      const parts = name.trim().split(/\s+/)
      if (parts.length >= 2) {
        const last = parts[parts.length - 1]!
        const first = parts.slice(0, -1).join(' ')
        return `${last}, ${first}`
      }
      return name
    })
    .filter(Boolean)
    .join('; ')
}

async function fetchIsbnGoogle(clean: string): Promise<CitationFieldsOut | null> {
  const res = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(clean)}`,
    { headers: { 'User-Agent': 'Prose/1.0' }, signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const body = (await res.json()) as {
    totalItems?: number
    items?: Array<{ volumeInfo?: { title?: string; authors?: string[]; publishedDate?: string; publisher?: string } }>
  }
  if (!body.totalItems || !body.items?.[0]?.volumeInfo) return null
  const info = body.items[0].volumeInfo!
  const yearMatch = info.publishedDate?.match(/\d{4}/)
  return {
    author: info.authors?.length ? convertAuthorsToLastFirst(info.authors) : undefined,
    title: info.title ?? undefined,
    year: yearMatch?.[0] ?? undefined,
    publisher: info.publisher ?? undefined,
  }
}

async function fetchIsbnOpenLibrary(clean: string): Promise<CitationFieldsOut | null> {
  const res = await fetch(
    `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(clean)}&format=json&jscmd=data`,
    { headers: { 'User-Agent': 'Prose/1.0' }, signal: AbortSignal.timeout(10000) }
  )
  if (!res.ok) return null
  const body = (await res.json()) as Record<string, {
    title?: string; authors?: { name?: string }[]; publish_date?: string; publishers?: { name?: string }[]
  }>
  const data = body[`ISBN:${clean}`]
  if (!data) return null
  const authorNames = (data.authors ?? []).map((a) => a.name ?? '').filter(Boolean)
  const yearMatch = data.publish_date?.match(/\d{4}/)
  return {
    author: authorNames.length ? convertAuthorsToLastFirst(authorNames) : undefined,
    title: data.title ?? undefined,
    year: yearMatch?.[0] ?? undefined,
    publisher: data.publishers?.[0]?.name ?? undefined,
  }
}

async function fetchIsbnMetadata(isbn: string): Promise<CitationFieldsOut | null> {
  const clean = isbn.replace(/[-\s]/g, '')
  try { const r = await fetchIsbnGoogle(clean); if (r) return r } catch (e) { console.error('[ISBN] Google:', e) }
  try { return await fetchIsbnOpenLibrary(clean) } catch (e) { console.error('[ISBN] OpenLibrary:', e); return null }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function registerCitationHandlers(): void {
  ipcMain.handle('citations:getByDocument', async (_, documentId: unknown): Promise<CitationOut[]> => {
    if (typeof documentId !== 'string' || !documentId) throw new Error('Invalid document id')
    const resolved = await resolveDocument(documentId)
    if (!resolved) return []
    return resolved.doc.citations.map((c) => citationToOut(c, documentId))
  })

  ipcMain.handle('citations:create', async (_, data: unknown): Promise<CitationOut> => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>
    if (typeof d.documentId !== 'string' || !d.documentId) throw new Error('documentId is required')
    if (typeof d.type !== 'string' || !VALID_CITATION_TYPES.has(d.type)) throw new Error('Invalid citation type')
    if (!d.fields || typeof d.fields !== 'object') throw new Error('fields is required')

    const resolved = await resolveDocument(d.documentId)
    if (!resolved) throw new Error('Document not found')

    const type = d.type as CitationType
    const fields = fieldsFromRecord(d.fields as Record<string, unknown>)
    const citation: ProseFileCitation = {
      id: randomUUID(),
      type: d.type,
      fields: d.fields as Record<string, unknown>,
      formatted: formatAll(type, fields),
      createdAt: new Date().toISOString(),
    }

    const updatedDoc = { ...resolved.doc, citations: [...resolved.doc.citations, citation] }
    await writeProseFile(resolved.filePath, updatedDoc)

    return citationToOut(citation, d.documentId)
  })

  ipcMain.handle('citations:update', async (_, id: unknown, data: unknown): Promise<CitationOut> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid citation id')
    if (!data || typeof data !== 'object') throw new Error('Invalid update payload')
    const d = data as Record<string, unknown>
    if (typeof d.type !== 'string' || !VALID_CITATION_TYPES.has(d.type)) throw new Error('Invalid citation type')
    if (!d.fields || typeof d.fields !== 'object') throw new Error('fields is required')

    for (const row of getAllIndexRows()) {
      const resolved = await resolveDocument(row.id)
      if (!resolved) continue
      const idx = resolved.doc.citations.findIndex((c) => c.id === id)
      if (idx === -1) continue

      const type = d.type as CitationType
      const fields = fieldsFromRecord(d.fields as Record<string, unknown>)
      const updated = {
        ...resolved.doc.citations[idx]!,
        type: d.type,
        fields: d.fields as Record<string, unknown>,
        formatted: formatAll(type, fields),
      }
      const citations = [...resolved.doc.citations]
      citations[idx] = updated
      await writeProseFile(resolved.filePath, { ...resolved.doc, citations })
      return citationToOut(updated, row.id)
    }
    throw new Error('Citation not found')
  })

  ipcMain.handle('citations:delete', async (_, id: unknown): Promise<void> => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid citation id')

    for (const row of getAllIndexRows()) {
      const resolved = await resolveDocument(row.id)
      if (!resolved) continue
      const idx = resolved.doc.citations.findIndex((c) => c.id === id)
      if (idx === -1) continue
      const citations = resolved.doc.citations.filter((c) => c.id !== id)
      await writeProseFile(resolved.filePath, { ...resolved.doc, citations })
      return
    }
  })

  ipcMain.handle('citations:fetchByDoi', (_, doi: unknown) => {
    if (typeof doi !== 'string' || !doi) throw new Error('Invalid DOI')
    return fetchDoiMetadata(doi.trim())
  })

  ipcMain.handle('citations:fetchByUrl', (_, url: unknown) => {
    if (typeof url !== 'string' || !url) throw new Error('Invalid URL')
    assertSafePublicUrl(url)  // validates protocol + blocks private IPs
    return fetchUrlMetadata(url)
  })

  ipcMain.handle('citations:fetchByIsbn', (_, isbn: unknown) => {
    if (typeof isbn !== 'string' || !isbn) throw new Error('Invalid ISBN')
    return fetchIsbnMetadata(isbn.trim())
  })
}
