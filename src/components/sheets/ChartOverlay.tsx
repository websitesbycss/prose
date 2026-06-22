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
}

export function ChartOverlay({
  charts,
  activeSheetId,
  workbookRef,
  onUpdateChart,
  onDeleteChart,
  onEditChart,
}: ChartOverlayProps): JSX.Element {
  const visible = charts.filter(c => c.sheetId === activeSheetId)

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ zIndex: 30 }}
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
          />
        </div>
      ))}
    </div>
  )
}
