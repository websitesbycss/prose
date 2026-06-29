import DOMPurify from 'dompurify'

// Shared allowlist for the limited rich text used in slide text/table cells —
// bold/italic/underline/strike, line breaks, and lists. Anything else (script,
// iframe, event handler attributes, javascript: URLs, etc.) is stripped.
// Used both when importing untrusted files (PPTX) and before every render/edit
// of stored HTML, since `innerHTML`/`dangerouslySetInnerHTML` execute embedded
// handlers (e.g. `<img onerror=...>`) the instant the markup is inserted.
const RICH_TEXT_CONFIG = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'del', 'br', 'ul', 'ol', 'li', 'p', 'div', 'span'],
  ALLOWED_ATTR: [],
}

export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, RICH_TEXT_CONFIG)
}
