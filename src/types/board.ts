/** Serialized tldraw store snapshot (opaque object). */
export interface BoardContent {
  version: 1
  /** tldraw TLStoreSnapshot — serialized via editor.store.getSnapshot() */
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

/** Count of non-background shapes on the board (page/document shapes only). */
export function countBoardElements(content: BoardContent): number {
  const snap = content.snapshot
  if (!snap || typeof snap !== 'object') return 0
  // tldraw snapshot has a `store` key containing shape records
  const store = (snap as Record<string, unknown>).store
  if (!store || typeof store !== 'object') return 0
  return Object.values(store as Record<string, unknown>).filter((v) => {
    if (!v || typeof v !== 'object') return false
    const record = v as Record<string, unknown>
    return record.typeName === 'shape'
  }).length
}
