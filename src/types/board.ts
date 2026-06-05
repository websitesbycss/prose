/** Serialized Excalidraw scene. */
export interface BoardContent {
  version: 2
  elements: unknown[]
  appState: Record<string, unknown>
}

/** Legacy tldraw format — treated as empty board on load. */
interface LegacyBoardContent {
  version: 1
  snapshot: Record<string, unknown>
}

export function isBoardContent(content: unknown): content is BoardContent {
  if (typeof content !== 'object' || content === null) return false
  const c = content as Record<string, unknown>
  if (c.version === 1 && typeof c.snapshot === 'object' && c.snapshot !== null) {
    // Legacy tldraw content — valid structure but we'll treat as empty
    return true
  }
  return (
    c.version === 2 &&
    Array.isArray(c.elements) &&
    typeof c.appState === 'object' &&
    c.appState !== null
  )
}

export function createInitialBoardContent(): BoardContent {
  return { version: 2, elements: [], appState: {} }
}

/** Migrate legacy tldraw content to Excalidraw format (creates empty board). */
export function migrateBoardContent(content: BoardContent | LegacyBoardContent): BoardContent {
  if (content.version === 1) return { version: 2, elements: [], appState: {} }
  return content as BoardContent
}

/** Count non-deleted elements on the board. */
export function countBoardElements(content: BoardContent): number {
  if (content.version === 2) {
    return content.elements.filter(
      (el) => typeof el === 'object' && el !== null && !(el as Record<string, unknown>).isDeleted,
    ).length
  }
  return 0
}
