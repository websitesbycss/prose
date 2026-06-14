import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { SnapGuide, SpacingIndicator } from './snapUtils'

export interface SnapOverlayHandle {
  update(
    guides: SnapGuide[],
    spacing: SpacingIndicator[],
    rotAngle?: number,
    rotCenterXPct?: number,
    rotCenterYPct?: number,
  ): void
  clear(): void
}

const NS = 'http://www.w3.org/2000/svg'
const GUIDE_COLOR = 'hsl(var(--primary) / 0.8)'

export const SnapOverlay = forwardRef<SnapOverlayHandle>(function SnapOverlay(_, ref) {
  const svgRef = useRef<SVGSVGElement>(null)
  const labelRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    update(guides, spacing, rotAngle, rotCenterXPct, rotCenterYPct) {
      const svg = svgRef.current
      if (!svg) return

      // Measure for pixel-accurate tick marks
      const svgRect = svg.getBoundingClientRect()
      const invW = svgRect.width > 0 ? 100 / svgRect.width : 0
      const invH = svgRect.height > 0 ? 100 / svgRect.height : 0
      const TICK_PX = 4
      const tickW = TICK_PX * invW
      const tickH = TICK_PX * invH

      // Clear
      while (svg.firstChild) svg.removeChild(svg.firstChild)

      // ── Guide lines ────────────────────────────────────────────────────────
      for (const g of guides) {
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('stroke-width', '2')
        line.setAttribute('vector-effect', 'non-scaling-stroke')
        line.style.stroke = GUIDE_COLOR
        if (g.type === 'v') {
          line.setAttribute('x1', `${g.pos}%`)
          line.setAttribute('y1', `${g.start}%`)
          line.setAttribute('x2', `${g.pos}%`)
          line.setAttribute('y2', `${g.end}%`)
        } else {
          line.setAttribute('x1', `${g.start}%`)
          line.setAttribute('y1', `${g.pos}%`)
          line.setAttribute('x2', `${g.end}%`)
          line.setAttribute('y2', `${g.pos}%`)
        }
        svg.appendChild(line)
      }

      // ── Spacing indicators ─────────────────────────────────────────────────
      for (const s of spacing) {
        // Gap line
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('stroke-width', '2')
        line.setAttribute('vector-effect', 'non-scaling-stroke')
        line.style.stroke = GUIDE_COLOR
        if (s.type === 'h') {
          line.setAttribute('x1', `${s.start}%`)
          line.setAttribute('y1', `${s.pos}%`)
          line.setAttribute('x2', `${s.end}%`)
          line.setAttribute('y2', `${s.pos}%`)
        } else {
          line.setAttribute('x1', `${s.pos}%`)
          line.setAttribute('y1', `${s.start}%`)
          line.setAttribute('x2', `${s.pos}%`)
          line.setAttribute('y2', `${s.end}%`)
        }
        svg.appendChild(line)

        // Tick marks at each end of the gap (perpendicular to the gap line)
        for (const endVal of [s.start, s.end]) {
          const tick = document.createElementNS(NS, 'line')
          tick.setAttribute('stroke-width', '2')
          tick.setAttribute('vector-effect', 'non-scaling-stroke')
          tick.style.stroke = GUIDE_COLOR
          if (s.type === 'h') {
            // Horizontal gap line → vertical ticks at x=endVal
            tick.setAttribute('x1', `${endVal}%`)
            tick.setAttribute('y1', `${s.pos - tickH}%`)
            tick.setAttribute('x2', `${endVal}%`)
            tick.setAttribute('y2', `${s.pos + tickH}%`)
          } else {
            // Vertical gap line → horizontal ticks at y=endVal
            tick.setAttribute('x1', `${s.pos - tickW}%`)
            tick.setAttribute('y1', `${endVal}%`)
            tick.setAttribute('x2', `${s.pos + tickW}%`)
            tick.setAttribute('y2', `${endVal}%`)
          }
          svg.appendChild(tick)
        }
      }

      // ── Rotation angle label ───────────────────────────────────────────────
      const label = labelRef.current
      if (label) {
        if (rotAngle !== undefined) {
          // Normalize display angle to [0, 360)
          const display = Math.round(((rotAngle % 360) + 360) % 360)
          label.textContent = `${display}°`
          label.style.display = 'block'
          if (rotCenterXPct !== undefined && rotCenterYPct !== undefined) {
            // Position label 2% to the right of the rotation center
            label.style.left = `${rotCenterXPct + 2}%`
            label.style.top = `${rotCenterYPct}%`
          }
        } else {
          label.style.display = 'none'
        }
      }
    },

    clear() {
      const svg = svgRef.current
      if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild)
      const label = labelRef.current
      if (label) label.style.display = 'none'
    },
  }))

  return (
    <>
      <svg
        ref={svgRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 10002,
        }}
      />
      <div
        ref={labelRef}
        style={{
          display: 'none',
          position: 'absolute',
          pointerEvents: 'none',
          zIndex: 10003,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1,
          color: 'hsl(var(--primary))',
          backgroundColor: 'hsl(var(--background) / 0.92)',
          border: '1px solid hsl(var(--primary) / 0.35)',
          borderRadius: 3,
          padding: '2px 5px',
          whiteSpace: 'nowrap',
          fontFamily: 'system-ui, sans-serif',
          transform: 'translateY(-50%)',
        }}
      />
    </>
  )
})
