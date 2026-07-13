import type { RefObject } from 'react'
import type { WorkbookInstance } from '@fortune-sheet/react'
import type { ChartDef } from '@/types/sheet'
import { ChartWidget } from './ChartWidget'

interface ChartOverlayProps {
  charts: ChartDef[]
  activeSheetId: string
  workbookRef: RefObject<WorkbookInstance | null>
  onUpdateChart: (chart: ChartDef) => void
  onDeleteChart: (id: string) => void
  onEditChart: (chart: ChartDef) => void
  /** Current FortuneSheet grid scroll offset — charts are stored in unscrolled
   * content coordinates, so this shifts them to track the grid instead of
   * sitting fixed on top of it. */
  scrollX: number
  scrollY: number
  /** Bumped once FortuneSheet's cell data has actually finished hydrating
   * after (re)loading a document — forces every chart to rebuild against
   * real data even if none of its own fields changed. */
  dataReadyTick: number
}

export function ChartOverlay({
  charts,
  activeSheetId,
  workbookRef,
  onUpdateChart,
  onDeleteChart,
  onEditChart,
  scrollX,
  scrollY,
  dataReadyTick,
}: ChartOverlayProps): JSX.Element {
  const visible = charts.filter(c => c.sheetId === activeSheetId)

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 30, transform: `translate(${-scrollX}px, ${-scrollY}px)` }}
    >
      {visible.map((chart) => (
        <div key={chart.id} className="pointer-events-auto">
          <ChartWidget
            chart={chart}
            workbookRef={workbookRef}
            onMove={onUpdateChart}
            onResize={onUpdateChart}
            onEdit={onEditChart}
            onDelete={onDeleteChart}
            dataReadyTick={dataReadyTick}
          />
        </div>
      ))}
    </div>
  )
}
