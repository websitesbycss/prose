// ── Quote matching for analysis issues ───────────────────────────────────────
// Models frequently reproduce document text with "smart" punctuation swapped
// for ASCII (or vice versa), so a strict indexOf on the raw quote misses real
// matches and highlights silently fail. All matching goes through a 1:1
// character fold — same string length, so an index into the folded text maps
// directly back to the original.

/** Folds visually-equivalent characters to a canonical form. Length-preserving. */
export function foldChar(ch: string): string {
  switch (ch) {
    case '‘': case '’': case '‚': case 'ʼ': return "'"
    case '“': case '”': case '„': return '"'
    case '–': case '—': case '−': return '-'
    case ' ': case ' ': case ' ': case '\t': case '\n': return ' '
    case '…': return '.'
    default: return ch
  }
}

export function foldText(text: string): string {
  let out = ''
  for (const ch of text) out += foldChar(ch)
  return out
}

/**
 * Finds `quote` in `text`, tolerant of punctuation variants and case.
 * Returns the start index in the ORIGINAL text, or -1.
 */
export function findQuoteIndex(text: string, quote: string): number {
  const q = quote.trim()
  if (!q) return -1
  // Fast path — exact match
  let idx = text.indexOf(q)
  if (idx !== -1) return idx
  // Folded match
  const foldedText = foldText(text)
  const foldedQuote = foldText(q)
  idx = foldedText.indexOf(foldedQuote)
  if (idx !== -1) return idx
  // Case-insensitive folded match
  idx = foldedText.toLowerCase().indexOf(foldedQuote.toLowerCase())
  return idx
}
