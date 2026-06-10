import { X } from 'lucide-react'
import { SlideCanvas } from '../canvas/SlideCanvas'
import type { CanvasToolMode } from '../canvas/SlideCanvas'
import type { SlideMaster, PresentationTheme, PresentationSettings, SlideElement, ShapeType } from '@/types/slides'
import type { SlideToolMode } from '../toolbar/DefaultToolbar'
import type { ElementMove, ElementResize, ElementRotate } from '../canvas/types'

interface Props {
  master: SlideMaster
  theme: PresentationTheme
  settings: PresentationSettings
  toolMode: SlideToolMode
  selectedIds: string[]
  editingElementId: string | null
  onSelectElement(id: string, add: boolean): void
  onDeselectAll(): void
  onDoubleClickElement(id: string): void
  onCommitText(id: string, content: string): void
  onCommitElement(id: string, partial: Partial<SlideElement>): void
  onMoveElements(moves: ElementMove[]): void
  onResizeElement(resize: ElementResize): void
  onRotateElement(rotate: ElementRotate): void
  onMarqueeSelect(ids: string[]): void
  onDrawElement(type: CanvasToolMode, x: number, y: number, w: number, h: number): void
  onClose(): void
  showGrid?: boolean
  zoom?: number
  onFitZoomChange?(pct: number): void
  pendingShapeType?: ShapeType | null
  pendingTableConfig?: { cols: number; rows: number } | null
  onTableCellSelect?(cellIds: string[]): void
}

export function SlideMasterEditor({
  master, theme, settings,
  toolMode, selectedIds, editingElementId,
  onSelectElement, onDeselectAll, onDoubleClickElement,
  onCommitText, onCommitElement,
  onMoveElements, onResizeElement, onRotateElement,
  onMarqueeSelect, onDrawElement,
  onClose, showGrid, zoom, onFitZoomChange,
  pendingShapeType, pendingTableConfig, onTableCellSelect,
}: Props): JSX.Element {
  // Create a fake Slide from master data so SlideCanvas can render it
  const masterSlide = {
    id: 'master',
    elements: master.elements,
    background: master.background,
    notes: '',
    animations: [] as never[],
  }

  return (
    <div className="absolute inset-0 z-50 flex flex-col">
      {/* Info bar */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-amber-200/60 bg-amber-50/90 px-3 dark:border-amber-700/30 dark:bg-amber-950/25">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">Slide Master</span>
          <span className="text-xs text-amber-600/70 dark:text-amber-400/60">· Changes apply to all slides</span>
        </div>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Canvas — fills remaining space */}
      <div className="min-h-0 flex-1 bg-background">
        <SlideCanvas
          slide={masterSlide as never}
          theme={theme}
          settings={settings}
          selectedIds={selectedIds}
          toolMode={toolMode as never}
          onSelectElement={onSelectElement}
          onDeselectAll={onDeselectAll}
          onDoubleClickElement={onDoubleClickElement}
          editingElementId={editingElementId}
          onCommitText={onCommitText}
          onCommitElement={onCommitElement}
          onMoveElements={onMoveElements}
          onResizeElement={onResizeElement}
          onRotateElement={onRotateElement}
          onMarqueeSelect={onMarqueeSelect}
          onDrawElement={onDrawElement}
          showGrid={showGrid}
          zoom={zoom}
          onFitZoomChange={onFitZoomChange}
          pendingShapeType={pendingShapeType}
          pendingTableConfig={pendingTableConfig}
          onTableCellSelect={onTableCellSelect}
        />
      </div>
    </div>
  )
}
