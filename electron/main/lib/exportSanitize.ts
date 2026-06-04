/** Sanitize URLs and CSS values embedded in export HTML. */

const NAMED_COLORS = new Set([
  'black', 'white', 'red', 'green', 'blue', 'yellow', 'orange', 'purple', 'gray', 'grey',
  'transparent', 'inherit', 'currentcolor',
])

export function sanitizeUrl(raw: string | undefined | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const u = new URL(trimmed, 'https://example.invalid/')
    const protocol = u.protocol.toLowerCase()
    if (protocol === 'https:' || protocol === 'http:') return trimmed.replace(/"/g, '&quot;')
    if (protocol === 'data:') {
      if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(trimmed)) {
        return trimmed.replace(/"/g, '&quot;')
      }
      return ''
    }
  } catch {
    // relative URLs are not allowed in export
  }
  return ''
}

export function sanitizeCssColor(raw: string | undefined | null): string {
  if (!raw) return ''
  const v = raw.trim().toLowerCase()
  if (!v || v.includes(';') || v.includes('"') || v.includes("'") || v.includes('url(')) return ''
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v
  if (/^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i.test(v)) return v
  if (NAMED_COLORS.has(v)) return v
  return ''
}

export function sanitizeCssLength(raw: string | undefined | null): string {
  if (!raw) return ''
  const v = raw.trim()
  if (/^\d+(\.\d+)?(px|pt|em|rem|%)?$/i.test(v)) return v
  return ''
}
