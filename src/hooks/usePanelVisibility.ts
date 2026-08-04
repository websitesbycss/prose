import { useEffect, useState } from 'react'

/**
 * Inline `visibility` value for a right panel that must never punch through a
 * hidden ancestor.
 *
 * Background tabs are hidden with `visibility: hidden` (EditorTabHost's
 * HiddenTabPane) — and in CSS, an explicit `visibility: visible` on a
 * descendant OVERRIDES a hidden ancestor. Animating visibility to 'visible'
 * via framer-motion did exactly that, making a background tab's open panel
 * render on top of the active tab.
 *
 * So: while open, set NO inline visibility (undefined) — the panel simply
 * inherits the tab pane's visibility, staying hidden on background tabs and
 * visible on the active one. After the close animation has had time to play,
 * pin it to 'hidden' so a closed panel is never painted and can't retain a
 * stale compositor layer (see useForceRepaintOnMount for the history there).
 */
export function usePanelVisibility(open: boolean, closeAnimMs = 160): 'hidden' | undefined {
  const [vis, setVis] = useState<'hidden' | undefined>(open ? undefined : 'hidden')
  useEffect(() => {
    if (open) {
      setVis(undefined)
      return
    }
    const id = setTimeout(() => setVis('hidden'), closeAnimMs)
    return () => clearTimeout(id)
  }, [open, closeAnimMs])
  return vis
}
