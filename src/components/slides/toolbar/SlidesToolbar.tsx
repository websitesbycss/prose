import {
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  Play, Clapperboard,
} from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'
import { cn } from '@/lib/utils'
import { DefaultToolbar } from './DefaultToolbar'
import { TextFormatToolbar } from './TextFormatToolbar'
import { ShapeStyleToolbar } from './ShapeStyleToolbar'
import { ImageToolbar } from './ImageToolbar'
import { MultiSelectToolbar } from './MultiSelectToolbar'
import { TableEditToolbar } from './TableEditToolbar'
import type { SlideToolMode } from './DefaultToolbar'
import type { Slide, SlideElement, TextElement, ShapeElement, ImageElement, TableElement, ShapeType } from '@/types/slides'

interface AlignUpdate { id: string; x: number; y: number }

interface Props {
  toolMode: SlideToolMode
  onToolMode(mode: SlideToolMode): void
  slide: Slide
  selectedIds: string[]
  documentId: string
  documentTitle: string
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  onBackground(e: React.MouseEvent): void
  onUpdateElement(id: string, partial: Partial<SlideElement>): void
  onBatchUpdateElements(ids: string[], partial: Partial<SlideElement>): void
  onAlignElements(updates: AlignUpdate[]): void
  onInsertShape?(shapeType: ShapeType): void
  onInsertTable?(cols: number, rows: number): void
  onInsertImage?(): void
  onInsertChart?(): void
  onPresent?(): void
  onToggleAnimations?(): void
  animationsPanelOpen?: boolean
  onEditMaster?(): void
  onExport?(): void
  onFind?(): void
  onToggleGrid?(): void
  gridActive?: boolean
  onSettingsOpen?(): void
  pendingShapeType?: ShapeType | null
  pendingTableConfig?: { cols: number; rows: number } | null
  editingElementId?: string | null
  tableSelectedCells?: string[]
  slideBackgroundColor?: string
  onSlideBackground?(color: string): void
}

// Canvas alignment buttons — aligns a single element relative to the slide (0-100 coordinate space).
const CANVAS_ALIGN_BUTTONS = [
  { type: 'left'     as const, icon: AlignStartVertical,    label: 'Align left edge to slide' },
  { type: 'center-h' as const, icon: AlignCenterVertical,   label: 'Center horizontally on slide' },
  { type: 'right'    as const, icon: AlignEndVertical,      label: 'Align right edge to slide' },
  { type: 'top'      as const, icon: AlignStartHorizontal,  label: 'Align top edge to slide' },
  { type: 'center-v' as const, icon: AlignCenterHorizontal, label: 'Center vertically on slide' },
  { type: 'bottom'   as const, icon: AlignEndHorizontal,    label: 'Align bottom edge to slide' },
]

export function SlidesToolbar({
  toolMode, onToolMode, slide, selectedIds, documentId, documentTitle,
  canUndo, canRedo, onUndo, onRedo,
  onBackground, onUpdateElement, onBatchUpdateElements, onAlignElements,
  onInsertShape, onInsertTable, onInsertImage, onInsertChart, onPresent, onEditMaster, onExport, onFind,
  onToggleAnimations, animationsPanelOpen = false,
  onToggleGrid, gridActive, onSettingsOpen,
  pendingShapeType, pendingTableConfig,
  editingElementId, tableSelectedCells = [],
  slideBackgroundColor, onSlideBackground,
}: Props): JSX.Element {
  const selectedElements = slide.elements.filter((e) => selectedIds.includes(e.id))
  const selCount = selectedIds.length
  const singleElement = selCount === 1 ? selectedElements[0] : undefined

  // For multi-select: detect if all selected elements share the same type.
  // If so, we show the corresponding style toolbar for bulk editing.
  const multiSameType: SlideElement['type'] | null =
    selCount >= 2 && selectedElements.every((e) => e.type === selectedElements[0]?.type)
      ? (selectedElements[0]?.type ?? null)
      : null

  // The representative element drives the displayed values in the style toolbar.
  // For single selection: the element itself. For same-type multi: the first selected.
  const repElement: SlideElement | undefined = singleElement ?? (multiSameType ? selectedElements[0] : undefined)

  // The element type to determine which style toolbar to render.
  const styleType = repElement?.type ?? null

  // Apply a property update to every selected element in one history entry.
  function updateAll(partial: Partial<SlideElement>): void {
    if (selCount === 1 && selectedIds[0]) {
      onUpdateElement(selectedIds[0], partial)
    } else if (selCount > 1) {
      onBatchUpdateElements(selectedIds, partial)
    }
  }

  // Snap a single element to one of six positions on the slide canvas.
  function alignToCanvas(type: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom'): void {
    const el = singleElement
    if (!el) return
    let x = el.x
    let y = el.y
    if      (type === 'left')     x = 0
    else if (type === 'center-h') x = 50 - el.width / 2
    else if (type === 'right')    x = 100 - el.width
    else if (type === 'top')      y = 0
    else if (type === 'center-v') y = 50 - el.height / 2
    else if (type === 'bottom')   y = 100 - el.height
    onAlignElements([{ id: el.id, x, y }])
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-background px-2 gap-0.5">
      {/* Always-visible tool palette */}
      <DefaultToolbar
        toolMode={toolMode}
        onToolMode={onToolMode}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onBackground={onBackground}
        onInsertShape={onInsertShape}
        onInsertTable={onInsertTable}
        onInsertImage={onInsertImage}
        onInsertChart={onInsertChart}
        pendingShapeType={pendingShapeType}
        pendingTableConfig={pendingTableConfig}
        slideBackgroundColor={slideBackgroundColor}
        onSlideBackground={onSlideBackground}
      />

      {selCount > 0 && (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-5" />

          {/* ── Canvas alignment (single element only) ── */}
          {singleElement && (
            <div className="flex items-center gap-0.5">
              {CANVAS_ALIGN_BUTTONS.map(({ type, icon: Icon, label }) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => alignToCanvas(type)}>
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* ── Relative alignment + distribute (multi-select) ── */}
          {selCount >= 2 && (
            <MultiSelectToolbar
              selectedIds={selectedIds}
              slide={slide}
              onAlignElements={onAlignElements}
            />
          )}

          {/* ── Element style toolbar (single OR same-type multi-select) ── */}
          {styleType && repElement && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-5" />
              {styleType === 'text' && (
                <TextFormatToolbar
                  element={repElement as TextElement}
                  onUpdate={(p) => updateAll(p as Partial<SlideElement>)}
                />
              )}
              {styleType === 'shape' && (
                <ShapeStyleToolbar
                  element={repElement as ShapeElement}
                  onUpdate={(p) => updateAll(p as Partial<SlideElement>)}
                />
              )}
              {styleType === 'image' && (
                <ImageToolbar
                  element={repElement as ImageElement}
                  onUpdate={(p) => updateAll(p as Partial<SlideElement>)}
                />
              )}
              {/* Table toolbar only when the table is actively being edited */}
              {styleType === 'table' && singleElement && editingElementId === selectedIds[0] && (
                <TableEditToolbar
                  element={repElement as TableElement}
                  selectedCells={tableSelectedCells}
                  onUpdateElement={(p) => updateAll(p as Partial<SlideElement>)}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Right-side actions */}
      <div className="flex-1" />
      {onPresent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
              onClick={onPresent}
            >
              <Play className="h-3 w-3 fill-current" />
              Present
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Start presentation (F5)</TooltipContent>
        </Tooltip>
      )}

      {onToggleAnimations && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('h-7 w-7', animationsPanelOpen && 'bg-accent text-accent-foreground')}
              onClick={onToggleAnimations}
            >
              <Clapperboard className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            {animationsPanelOpen ? 'Hide animations panel' : 'Show animations panel'}
          </TooltipContent>
        </Tooltip>
      )}

      <ToolbarRightSection
        fileType="slides"
        documentId={documentId}
        documentTitle={documentTitle}
        onSlidesFind={onFind}
        onSlidesExport={onExport}
        onSlidesPresent={onPresent}
        onSlidesMaster={onEditMaster}
        onSlidesToggleGrid={onToggleGrid}
        slidesGridActive={gridActive}
        onSettingsOpen={onSettingsOpen}
      />
    </div>
  )
}
