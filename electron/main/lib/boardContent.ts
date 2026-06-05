/** Server-side Board content utilities (mirrors src/types/board.ts without renderer imports). */

interface BoardContent {
  version: 1
  snapshot: Record<string, unknown>
}

export function isBoardContent(content: unknown): content is BoardContent {
  return (
    typeof content === 'object' &&
    content !== null &&
    (content as BoardContent).version === 1 &&
    typeof (content as BoardContent).snapshot === 'object' &&
    (content as BoardContent).snapshot !== null
  )
}

export function createInitialBoardContent(): BoardContent {
  return { version: 1, snapshot: {} }
}

export function countBoardElements(content: BoardContent): number {
  const snap = content.snapshot
  if (!snap || typeof snap !== 'object') return 0
  const store = (snap as Record<string, unknown>).store
  if (!store || typeof store !== 'object') return 0
  return Object.values(store as Record<string, unknown>).filter((v) => {
    if (!v || typeof v !== 'object') return false
    return (v as Record<string, unknown>).typeName === 'shape'
  }).length
}
