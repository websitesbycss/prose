import { useEffect, useState } from 'react'

const PAGE_HEIGHT = 1056
const SEP_HEIGHT = 88   // total height of the separator, centered on the page boundary
const GRAD = 32         // gradient fade size top and bottom
const BAND = SEP_HEIGHT - GRAD * 2  // solid canvas-color band in the middle: 24px

interface PageGuidesProps {
  containerRef: React.RefObject<HTMLDivElement>
}

export default function PageGuides({ containerRef }: PageGuidesProps): JSX.Element | null {
  const [breakCount, setBreakCount] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      const h = entry?.borderBoxSize[0]?.blockSize ?? entry?.contentRect.height ?? 0
      setBreakCount(Math.ceil(h / PAGE_HEIGHT) - 1)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [containerRef])

  if (breakCount <= 0) return null

  return (
    <>
      {Array.from({ length: breakCount }, (_, i) => (
        <div
          key={i}
          className="pointer-events-none absolute z-0"
          style={{
            top: (i + 1) * PAGE_HEIGHT - SEP_HEIGHT / 2,
            height: SEP_HEIGHT,
            left: -2,
            right: -2,
          }}
        >
          {/* Fade from page color to canvas color */}
          <div
            className="absolute inset-x-0 top-0 bg-gradient-to-b from-white to-zinc-100 dark:from-zinc-800 dark:to-zinc-900"
            style={{ height: GRAD }}
          />
          {/* Solid canvas-color band */}
          <div
            className="absolute inset-x-0 bg-zinc-100 dark:bg-zinc-900"
            style={{ top: GRAD, height: BAND }}
          />
          {/* Page number label — inset to align with content edge */}
          <span
            className="absolute text-[10px] text-zinc-400 dark:text-zinc-500 select-none tabular-nums"
            style={{ top: GRAD, lineHeight: `${BAND}px`, right: 2 }}
          >
            page {i + 2}
          </span>
          {/* Fade from canvas color back to page color */}
          <div
            className="absolute inset-x-0 bottom-0 bg-gradient-to-b from-zinc-100 to-white dark:from-zinc-900 dark:to-zinc-800"
            style={{ height: GRAD }}
          />
        </div>
      ))}
    </>
  )
}
