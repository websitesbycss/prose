import type { Citation, CitationFields } from '@/types'

type CitationType = Citation['type']

function esc(s: string | undefined): string {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function em(s: string | undefined): string {
  return s ? `<em>${esc(s)}</em>` : ''
}

function q(s: string | undefined): string {
  return s ? `“${esc(s)}.”` : ''
}

// "Last, First; Last, First" → "Last, First, and Last First."
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

export function formatMla(type: CitationType, f: CitationFields): string {
  const a = f.author ? mlAuthors(f.author) + ' ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` vol. ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)},` : ''
      const pp = f.pages ? ` pp. ${esc(f.pages)}.` : '.'
      return `${a}${q(f.title)} ${em(f.journal)},${vol}${iss} ${esc(f.year) || 'n.d.'},${pp}`
    }
    case 'website':
      return `${a}${q(f.title)} ${esc(f.publisher) || esc(f.url)}, ${esc(f.url)}.`
    default:
      return `${a}${q(f.title)} ${esc(f.year)}`.trim()
  }
}

export function formatApa(type: CitationType, f: CitationFields): string {
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

export function formatChicago(type: CitationType, f: CitationFields): string {
  const a = f.author ? esc(f.author) + '. ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)}` : ''
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

export function formatIeee(type: CitationType, f: CitationFields): string {
  const a = f.author ? esc(f.author) + ', ' : ''
  switch (type) {
    case 'book':
      return `${a}${em(f.title)}. ${esc(f.publisher)}, ${esc(f.year) || 'n.d.'}.`
    case 'article':
    case 'journal': {
      const vol = f.volume ? ` vol. ${esc(f.volume)},` : ''
      const iss = f.issue ? ` no. ${esc(f.issue)},` : ''
      const pp = f.pages ? ` pp. ${esc(f.pages)},` : ','
      return `${a}“${esc(f.title)},” ${em(f.journal)},${vol}${iss}${pp} ${esc(f.year) || 'n.d.'}.`
    }
    case 'website':
      return `${a}“${esc(f.title)},” [Online]. Available: ${esc(f.url)}.`
    default:
      return `${a}“${esc(f.title)}” ${esc(f.year)}`.trim()
  }
}

export function formatAll(
  type: CitationType,
  fields: CitationFields
): Citation['formatted'] {
  return {
    mla: formatMla(type, fields),
    apa: formatApa(type, fields),
    chicago: formatChicago(type, fields),
    ieee: formatIeee(type, fields),
  }
}

export function worksSection(format: string): {
  heading: string
  key: keyof Citation['formatted']
} {
  if (format === 'apa') return { heading: 'References', key: 'apa' }
  if (format === 'chicago') return { heading: 'Bibliography', key: 'chicago' }
  if (format === 'ieee') return { heading: 'References', key: 'ieee' }
  return { heading: 'Works Cited', key: 'mla' }
}
