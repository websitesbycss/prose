/**
 * FortuneSheet and Excalidraw both implement undo/redo purely via a React
 * `onKeyDown` prop on one specific internal element (FortuneSheet's hidden cell
 * editor, Excalidraw's root container) — there is no public undo()/redo() API.
 * To trigger them from a toolbar button we have to dispatch a real keydown
 * event directly on that element so it bubbles through React's synthetic event
 * system, and the event must carry `code` (not just `key`) since both libraries
 * check `event.code === "KeyZ"`.
 */
export function dispatchUndoRedoKey(target: Element | null | undefined, action: 'undo' | 'redo'): void {
  if (!target) return
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'z',
    code: 'KeyZ',
    ctrlKey: true,
    shiftKey: action === 'redo',
    bubbles: true,
    cancelable: true,
  }))
}
