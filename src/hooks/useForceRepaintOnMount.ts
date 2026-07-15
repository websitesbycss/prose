import { useEffect } from 'react'
import type { RefObject } from 'react'

/** Consecutive stable frames required before treating the element's size as settled. */
const STABLE_FRAMES_REQUIRED = 6
/** Hard cap so the repaint always eventually fires even if size never quite stops jittering. */
const MAX_FRAMES = 300 // ~5s at 60fps

/**
 * The right/AI panel mounts and does its first paint while its container is
 * still 0-width or mid open-animation, which can leave a stale/incorrectly
 * sized composited layer — especially on a contended cold app boot, where a
 * heavier editor (e.g. Slides' canvas) can still be settling well past the
 * first animation frame. A plain re-render doesn't fix it — what actually
 * fixes it (confirmed empirically, e.g. by reordering a tab) is physically
 * moving the panel's DOM node, which forces the browser to discard and
 * rebuild the compositing layer.
 *
 * Rather than guess a fixed delay (unreliable — too short on a contended
 * boot, wastefully long otherwise), this polls the element's rendered size
 * every animation frame and only performs the detach/reflow/reattach once
 * the size has actually stopped changing for several consecutive frames.
 */
export function useForceRepaintOnMount(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    let rafId = 0
    let frame = 0
    let stableFrames = 0
    let lastWidth = -1
    let lastHeight = -1

    function repaint(el: HTMLElement): void {
      const prevDisplay = el.style.display
      el.style.display = 'none'
      void el.offsetHeight // force a synchronous reflow between the two writes
      el.style.display = prevDisplay
    }

    function tick(): void {
      const el = ref.current
      if (!el) return
      frame++
      const rect = el.getBoundingClientRect()
      if (rect.width === lastWidth && rect.height === lastHeight) {
        stableFrames++
      } else {
        stableFrames = 0
        lastWidth = rect.width
        lastHeight = rect.height
      }
      if (stableFrames >= STABLE_FRAMES_REQUIRED || frame >= MAX_FRAMES) {
        repaint(el)
        return
      }
      rafId = requestAnimationFrame(tick)
    }

    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
