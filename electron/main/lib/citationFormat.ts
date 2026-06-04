/** Server-side citation formatting — mirrors src/lib/citations.ts (HTML is escaped). */

export type CitationType = 'book' | 'article' | 'website' | 'journal'

export interface CitationFields {
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

export interface FormattedCitation {
  mla: string
  apa: string
  chicago: string
  ieee: string
}

function esc(s: string | undefined): string {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function em(s: string | undefined): string {
  return s ? `<em>${esc(s)}</em>` : ''
}

function q(s: string | undefined): string {
  return s ? `“${esc(s)}.”` : ''
}

function mlAuthors(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 1) return esc(parts[0]) + '.'
  if (parts.length === 2) return `${esc(parts[0])}, and ${esc(parts[1])}.`
  return parts.slice(0, -1).map(esc).join(', ') + ', and ' + esc(parts[parts.length - 1]) + '.'
}

function apaAuthors(raw: string | undefined): string {
  if (!raw) return ''
  const parts = raw.split(';').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 1) return esc(parts[0])
  return parts.slice(0, -1).map(esc).join(', ') + ', &amp; ' + esc(parts[parts.length - 1])
}

function formatMla(type: CitationType, f: CitationFields): string {
  const a = f.author ? mlAuthors(f.author) + ' ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` vol. ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)},` : ''
      const pp = f.pages ? ` pp. ${esc(f.pages)}.` : '.'
      return `${a}${q(f.title)} ${em(f.journal)},${vol}${iss} ${esc(f.year) || 'n.d.'},${pp}`
    }
    case 'website':
      return `${a}${q(f.title)} ${esc(f.publisher) || esc(f.url)}, ${esc(f.url)}.`
    default:
      return `${a}${q(f.title)} ${esc(f.year)}`.trim()
  }
}

function formatApa(type: CitationType, f: CitationFields): string {
  const a = f.author ? apaAuthors(f.author) + ' ' : ''
  const y = f.year ? `(${esc(f.year)}). ` : '(n.d.). '
  switch (type) {
    case 'book':
      return `${a}${y}${em(f.title)}. ${esc(f.publisher)}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? `, ${em(f.volume)}` : ''
      const iss = f.issue ? `(${esc(f.issue)})` : ''
      const pp = f.pages ? `, ${esc(f.pages)}` : ''
      return `${a}${y}${esc(f.title)}. ${em(f.journal)}${vol}${iss}${pp}.`
    }
    case 'website':
      return `${a}${y}${esc(f.title)}. ${esc(f.url)}`
    default:
      return `${a}${y}${esc(f.title)}`.trim()
  }
}

function formatChicago(type: CitationType, f: CitationFields): string {
  const a = f.author ? esc(f.author) + '. ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)}` : ''
      const yr = f.year ? ` (${esc(f.year)}):` : ''
      const pp = f.pages ? ` ${esc(f.pages)}.` : '.'
      return `${a}${q(f.title)} ${em(f.journal)},${vol}${iss}${yr}${pp}`
    }
    case 'website':
      return `${a}${q(f.title)} ${esc(f.publisher) || esc(f.url)}. ${esc(f.url)}.`
    default:
      return `${a}${q(f.title)} ${esc(f.year)}`.trim()
  }
}

function formatIeee(type: CitationType, f: CitationFields): string {
  const a = f.author ? esc(f.author) + ', ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` vol. ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)},` : ''
      const pp = f.pages ? ` pp. ${esc(f.pages)},` : ','
      return `${a}“${esc(f.title)},” ${em(f.journal)},${vol}${iss}${pp} ${esc(f.year) || 'n.d.'}.`
    }
    case 'website':
      return `${a}“${esc(f.title)},” [Online]. Available: ${esc(f.url)}.`
    default:
      return `${a}“${esc(f.title)}” ${esc(f.year)}`.trim()
  }
}

export function formatAll(type: CitationType, fields: CitationFields): FormattedCitation {
  return {
    mla: formatMla(type, fields),
    apa: formatApa(type, fields),
    chicago: formatChicago(type, fields),
    ieee: formatIeee(type, fields),
  }
}

export function fieldsFromRecord(raw: Record<string, unknown>): CitationFields {
  const str = (k: string): string | undefined => {
    const v = raw[k]
    return typeof v === 'string' ? v : undefined
  }
  return {
    author: str('author'),
    title: str('title'),
    year: str('year'),
    publisher: str('publisher'),
    journal: str('journal'),
    url: str('url'),
    pages: str('pages'),
    volume: str('volume'),
    issue: str('issue'),
  }
}
