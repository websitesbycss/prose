import { Play } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ToolbarRightSection } from '@/components/editor/ToolbarRightSection'
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
  onAlignElements(updates: AlignUpdate[]): void
  onInsertShape?(shapeType: ShapeType): void
  onInsertTable?(cols: number, rows: number): void
  onInsertImage?(): void
  onPresent?(): void
  onEditMaster?(): void
  onExport?(): void
  onFind?(): void
  onToggleGrid?(): void
  gridActive?: boolean
  pendingShapeType?: ShapeType | null
  pendingTableConfig?: { cols: number; rows: number } | null
  editingElementId?: string | null
  tableSelectedCells?: string[]
}

function getSelectionType(slide: Slide, selectedIds: string[]): 'none' | 'multi' | SlideElement['type'] {
  if (selectedIds.length === 0) return 'none'
  if (selectedIds.length > 1) return 'multi'
  const el = slide.elements.find((e) => e.id === selectedIds[0])
  return el?.type ?? 'none'
}

export function SlidesToolbar({
  toolMode, onToolMode, slide, selectedIds, documentId, documentTitle,
  canUndo, canRedo, onUndo, onRedo,
  onBackground, onUpdateElement, onAlignElements,
  onInsertShape, onInsertTable, onInsertImage, onPresent, onEditMaster, onExport, onFind,
  onToggleGrid, gridActive,
  pendingShapeType, pendingTableConfig,
  editingElementId, tableSelectedCells = [],
}: Props): JSX.Element {
  const selType = getSelectionType(slide, selectedIds)
  const singleElement = selType !== 'none' && selType !== 'multi'
    ? slide.elements.find((e) => e.id === selectedIds[0])
    : null

  function updateEl(partial: Partial<SlideElement>) {
    if (selectedIds[0]) onUpdateElement(selectedIds[0], partial)
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border bg-background px-3 gap-2">
      {/* Always-visible default toolbar */}
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
        pendingShapeType={pendingShapeType}
        pendingTableConfig={pendingTableConfig}
      />

      {/* Contextual section */}
      {selType !== 'none' && (
        <>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          {selType === 'multi' && (
            <MultiSelectToolbar
              selectedIds={selectedIds}
              slide={slide}
              onAlignElements={onAlignElements}
            />
          )}
          {selType === 'text' && singleElement && (
            <TextFormatToolbar
              element={singleElement as TextElement}
              onUpdate={(p) => updateEl(p as Partial<SlideElement>)}
            />
          )}
          {selType === 'shape' && singleElement && (
            <ShapeStyleToolbar
              element={singleElement as ShapeElement}
              onUpdate={(p) => updateEl(p as Partial<SlideElement>)}
            />
          )}
          {selType === 'image' && singleElement && (
            <ImageToolbar
              element={singleElement as ImageElement}
              onUpdate={(p) => updateEl(p as Partial<SlideElement>)}
            />
          )}
          {selType === 'table' && singleElement && editingElementId === selectedIds[0] && (
            <TableEditToolbar
              element={singleElement as TableElement}
              selectedCells={tableSelectedCells}
              onUpdateElement={(p) => updateEl(p as Partial<SlideElement>)}
            />
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
      />
    </div>
  )
}
