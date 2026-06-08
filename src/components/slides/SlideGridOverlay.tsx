// Phase 32 — Grid overlay rendered over the slide canvas.
// Grid lines are drawn in SVG scaled to the canvas dimensions.
interface Props {
  canvasWidth: number
  canvasHeight: number
  gridSize?: number   // logical grid size in % of slide width; default 5 (= every 5%)
}

export function SlideGridOverlay({ canvasWidth, canvasHeight, gridSize = 5 }: Props): JSX.Element {
  // Convert % grid size to canvas pixels
  const colStep = (gridSize / 100) * canvasWidth
  const rowStep = (gridSize / 100) * canvasHeight

  const vLines: number[] = []
  for (let x = colStep; x < canvasWidth; x += colStep) vLines.push(x)

  const hLines: number[] = []
  for (let y = rowStep; y < canvasHeight; y += rowStep) hLines.push(y)

  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={canvasWidth}
      height={canvasHeight}
      aria-hidden="true"
    >
      {vLines.map((x, i) => (
        <line
          key={`v${i}`}
          x1={x} y1={0} x2={x} y2={canvasHeight}
          stroke="rgba(99,102,241,0.25)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
      {hLines.map((y, i) => (
        <line
          key={`h${i}`}
          x1={0} y1={y} x2={canvasWidth} y2={y}
          stroke="rgba(99,102,241,0.25)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      ))}
    </svg>
  )
}
