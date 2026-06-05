/** Server-side Board content utilities (mirrors src/types/board.ts without renderer imports). */

interface BoardContent {
  version: 2
  elements: unknown[]
  appState: Record<string, unknown>
}

interface LegacyBoardContent {
  version: 1
  snapshot: Record<string, unknown>
}

export function isBoardContent(content: unknown): content is BoardContent | LegacyBoardContent {
  if (typeof content !== 'object' || content === null) return false
  const c = content as Record<string, unknown>
  if (c.version === 1 && typeof c.snapshot === 'object' && c.snapshot !== null) return true
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

export function countBoardElements(content: BoardContent | LegacyBoardContent): number {
  if (content.version === 1) return 0
  return (content as BoardContent).elements.filter(
    (el) => typeof el === 'object' && el !== null && !(el as Record<string, unknown>).isDeleted,
  ).length
}
