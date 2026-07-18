import { useEffect } from 'react'
import type { RefObject } from 'react'

/**
 * Guards the right/AI panel against a stale composited layer when it mounts
 * during the single heaviest frame the app produces: the first mount of a
 * lazy-loaded editor chunk (TipTap / FortuneSheet / Excalidraw / the Slides
 * canvas all initialize in that frame). A panel painted during that frame can
 * be left with a corrupt compositor snapshot that a plain React re-render
 * never fixes — the panel later paints shifted/cut and its resize handle
 * appears displaced from its real hit zone. Only a genuine DOM
 * detach/reflow/reattach discards the bad layer (confirmed empirically:
 * reordering tabs — a keyed DOM move — always fixed it).
 *
 * The primary defense is elsewhere: the panel is `visibility: hidden` while
 * closed (see the editors' right-panel motion.divs), so in the common case
 * nothing is painted at mount and nothing can go stale. This hook covers the
 * remaining case — the panel mounting already OPEN (panel-open state is
 * global across tabs) during that contended frame. There is no reliable
 * signal for "the compositor has settled", so repaint at staggered fixed
 * delays; the toggle happens within one task (no paint in between), so it is
 * invisible even on an open, in-use panel.
 */
const REPAINT_DELAYS_MS = [400, 1500]

export function useForceRepaintOnMount(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const ids = REPAINT_DELAYS_MS.map((delay) =>
      setTimeout(() => {
        const el = ref.current
        if (!el) return
        const prevDisplay = el.style.display
        el.style.display = 'none'
        void el.offsetHeight // force a synchronous reflow between the two writes
        el.style.display = prevDisplay
      }, delay),
    )
    return () => ids.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
