import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { ChartDef } from '@/types/sheet'
import { ChartWidget } from './ChartWidget'
import { SHEET_ROW_HEADER_WIDTH, SHEET_COL_HEADER_HEIGHT, SHEET_SCROLLBAR_THICKNESS } from './chartUtils'

interface ChartOverlayProps {
  charts: ChartDef[]
  activeSheetId: string
  workbookRef: RefObject<WorkbookInstance | null>
  /** The grid's own scrollable wrapper — used to measure the content
   * viewport's real pixel bounds so drag/resize can be clamped to it. */
  containerRef: RefObject<HTMLDivElement | null>
  onUpdateChart: (chart: ChartDef) => void
  onDeleteChart: (id: string) => void
  onEditChart: (chart: ChartDef) => void
  /** Current FortuneSheet grid scroll offset — charts are stored in unscrolled
   * content coordinates, so this shifts them to track the grid instead of
   * sitting fixed on top of it. */
  scrollX: number
  scrollY: number
  /** Current zoom percentage (10-400) — charts are stored at the 100% zoom
   * baseline and scaled to match, exactly like cells. */
  zoom: number
  /** Bumped once FortuneSheet's cell data has actually finished hydrating
   * after (re)loading a document — forces every chart to rebuild against
   * real data even if none of its own fields changed. */
  dataReadyTick: number
}

export function ChartOverlay({
  charts,
  activeSheetId,
  workbookRef,
  containerRef,
  onUpdateChart,
  onDeleteChart,
  onEditChart,
  scrollX,
  scrollY,
  zoom,
  dataReadyTick,
}: ChartOverlayProps): JSX.Element {
  const visible = charts.filter(c => c.sheetId === activeSheetId)
  const zoomFraction = zoom / 100

  return (
    // Clipped to the actual scrollable content area — excludes the row-number
    // column, column-letter row, and both scrollbar strips, so a chart can
    // never paint over that chrome (drag/resize is also clamped to the same
    // bounds, in ChartWidget). The middle div keeps chart x/y in the same
    // wrapper-relative coordinate space as before (undoing this div's own
    // inset via matching negative offsets) so stored positions and scroll
    // tracking don't need to change. The innermost div scales chart position
    // and size together with zoom, exactly like cells — charts are stored at
    // the 100% zoom baseline.
    <div
      className="pointer-events-none absolute overflow-hidden"
      style={{
        top: SHEET_COL_HEADER_HEIGHT,
        left: SHEET_ROW_HEADER_WIDTH,
        right: SHEET_SCROLLBAR_THICKNESS,
        bottom: SHEET_SCROLLBAR_THICKNESS,
        zIndex: 30,
      }}
    >
      <div
        className="absolute"
        style={{
          top: -SHEET_COL_HEADER_HEIGHT,
          left: -SHEET_ROW_HEADER_WIDTH,
          right: -SHEET_SCROLLBAR_THICKNESS,
          bottom: -SHEET_SCROLLBAR_THICKNESS,
          transform: `translate(${-scrollX}px, ${-scrollY}px)`,
        }}
      >
        <div style={{ transform: `scale(${zoomFraction})`, transformOrigin: '0 0' }}>
          {visible.map((chart) => (
            <div key={chart.id} className="pointer-events-auto">
              <ChartWidget
                chart={chart}
                workbookRef={workbookRef}
                containerRef={containerRef}
                onMove={onUpdateChart}
                onResize={onUpdateChart}
                onEdit={onEditChart}
                onDelete={onDeleteChart}
                scrollX={scrollX}
                scrollY={scrollY}
                zoom={zoom}
                dataReadyTick={dataReadyTick}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
