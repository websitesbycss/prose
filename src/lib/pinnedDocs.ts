const PINNED_KEY = 'prose-pinned-docs'

export function loadPinnedIds(): Set<string> {
  try {
    const v = localStorage.getItem(PINNED_KEY)
    return new Set(v ? (JSON.parse(v) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function savePinnedIds(ids: Set<string>): void {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]))
  } catch {
    /* noop */
  }
}
