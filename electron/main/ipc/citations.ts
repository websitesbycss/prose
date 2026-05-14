import { ipcMain } from 'electron'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'

interface CitationRow {
  id: string
  document_id: string
  type: string
  fields: string
  formatted: string
  created_at: string
}

interface CitationOut {
  id: string
  documentId: string
  type: string
  fields: Record<string, string>
  formatted: {
    mla: string
    apa: string
    chicago: string
    ieee: string
  }
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

function rowToCitation(row: CitationRow): CitationOut {
  return {
    id: row.id,
    documentId: row.document_id,
    type: row.type,
    fields: JSON.parse(row.fields) as Record<string, string>,
    formatted: JSON.parse(row.formatted) as CitationOut['formatted'],
    createdAt: row.created_at,
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

    const authors = (msg.author ?? [])
      .map((a) => [a.family, a.given].filter(Boolean).join(', '))
      .join('; ')
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
  } catch {
    return null
  }
}

async function fetchUrlMetadata(url: string): Promise<CitationFieldsOut | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Prose/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null

    const html = await res.text()

    const extract = (property: string): string | undefined => {
      const ogMatch = html.match(
        new RegExp(`<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`, 'i')
      )
      if (ogMatch?.[1]) return ogMatch[1]
      const nameMatch = html.match(
        new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
      )
      return nameMatch?.[1]
    }

    const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = extract('title') ?? titleTagMatch?.[1]?.trim()
    const author = extract('author')
    const siteName = extract('site_name')

    if (!title && !author) return null

    return {
      title: title ?? undefined,
      author: author ?? undefined,
      publisher: siteName ?? undefined,
      url,
    }
  } catch {
    return null
  }
}

export function registerCitationHandlers(db: Database): void {
  ipcMain.handle('citations:getByDocument', (_, documentId: unknown): CitationOut[] => {
    if (typeof documentId !== 'string' || !documentId)
      throw new Error('Invalid document id')
    const rows = db
      .prepare('SELECT * FROM citations WHERE document_id = ? ORDER BY created_at ASC')
      .all(documentId) as CitationRow[]
    return rows.map(rowToCitation)
  })

  ipcMain.handle('citations:create', (_, data: unknown): CitationOut => {
    if (!data || typeof data !== 'object') throw new Error('Invalid create payload')
    const d = data as Record<string, unknown>

    if (typeof d.documentId !== 'string' || !d.documentId)
      throw new Error('documentId is required')
    if (typeof d.type !== 'string' || !VALID_CITATION_TYPES.has(d.type))
      throw new Error('Invalid citation type')
    if (!d.fields || typeof d.fields !== 'object') throw new Error('fields is required')
    if (!d.formatted || typeof d.formatted !== 'object') throw new Error('formatted is required')

    const id = randomUUID()
    const now = new Date().toISOString()

    db.prepare(
      'INSERT INTO citations (id, document_id, type, fields, formatted, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, d.documentId, d.type, JSON.stringify(d.fields), JSON.stringify(d.formatted), now)

    return rowToCitation(
      db.prepare('SELECT * FROM citations WHERE id = ?').get(id) as CitationRow
    )
  })

  ipcMain.handle('citations:delete', (_, id: unknown): void => {
    if (typeof id !== 'string' || !id) throw new Error('Invalid citation id')
    db.prepare('DELETE FROM citations WHERE id = ?').run(id)
  })

  ipcMain.handle(
    'citations:fetchByDoi',
    (_, doi: unknown): Promise<CitationFieldsOut | null> => {
      if (typeof doi !== 'string' || !doi) throw new Error('Invalid DOI')
      return fetchDoiMetadata(doi.trim())
    }
  )

  ipcMain.handle(
    'citations:fetchByUrl',
    (_, url: unknown): Promise<CitationFieldsOut | null> => {
      if (typeof url !== 'string' || !url) throw new Error('Invalid URL')
      try {
        new URL(url)
      } catch {
        throw new Error('Malformed URL')
      }
      return fetchUrlMetadata(url)
    }
  )
}
