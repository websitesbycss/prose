import { MousePointer2, Type, Shapes, Image, Table2, Sigma, Code2, Video, Palette, Undo2, Redo2, RectangleHorizontal, BarChart3 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { ShapePickerPopover } from './ShapePickerPopover'
import { TablePickerPopover } from './TablePickerPopover'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { ColorPickerDropdown } from './ToolbarShared'
import { cn } from '@/lib/utils'
import type { ShapeType } from '@/types/slides'

export type SlideToolMode = 'select' | 'text' | 'shape' | 'image' | 'table' | 'equation' | 'code' | 'video'

interface Props {
  toolMode: SlideToolMode
  onToolMode(mode: SlideToolMode): void
  canUndo: boolean
  canRedo: boolean
  onUndo(): void
  onRedo(): void
  onBackground(e: React.MouseEvent): void
  onInsertShape?(shapeType: ShapeType): void
  onInsertTable?(cols: number, rows: number): void
  onInsertImage?(): void
  onInsertChart?(): void
  pendingShapeType?: ShapeType | null
  pendingTableConfig?: { cols: number; rows: number } | null
  slideBackgroundColor?: string
  onSlideBackground?(color: string): void
}

const BG_PALETTE = [
  '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0',
  '#1e293b', '#0f172a', '#18181b', '#09090b',
  '#fef9c3', '#fce7f3', '#ede9fe', '#dcfce7',
]

function SlideBackgroundButton({ color, onChange }: { color: string; onChange: (c: string) => void }): JSX.Element {
  return (
    <ColorPickerDropdown
      tooltip="Slide background"
      trigger={
        <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
          <RectangleHorizontal className="h-3.5 w-3.5 leading-none" />
          <span
            className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
            style={{ backgroundColor: color }}
          />
        </Button>
      }
    >
      {(close) => (
        <ChromeColorPicker
          color={color}
          current={color}
          palette={BG_PALETTE}
          onChange={onChange}
          onPaletteSelect={onChange}
          onReset={() => { onChange('#ffffff'); close() }}
          resetLabel="Reset background"
        />
      )}
    </ColorPickerDropdown>
  )
}

export function DefaultToolbar({ toolMode, onToolMode, canUndo, canRedo, onUndo, onRedo, onBackground, onInsertShape, onInsertTable, onInsertImage, onInsertChart, pendingShapeType, pendingTableConfig, slideBackgroundColor, onSlideBackground }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-0.5">
      {/* Undo / Redo */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canUndo} onClick={onUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" disabled={!canRedo} onClick={onRedo}>
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Redo (Ctrl+Y)</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      {/* Select */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'select' && '!text-primary')} onClick={() => onToolMode('select')}>
            <MousePointer2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Select (V)</TooltipContent>
      </Tooltip>

      {/* Text */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'text' && '!text-primary')} onClick={() => onToolMode('text')}>
            <Type className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Text (T)</TooltipContent>
      </Tooltip>

      {/* Shape with picker */}
      <ShapePickerPopover selectedShapeType={pendingShapeType} onSelect={(s) => { onInsertShape?.(s) }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'shape' && '!text-primary')}>
              <Shapes className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Shape (S)</TooltipContent>
        </Tooltip>
      </ShapePickerPopover>

      {/* Image */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'image' && '!text-primary')} onClick={() => onInsertImage ? onInsertImage() : onToolMode('image')}>
            <Image className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Image (I)</TooltipContent>
      </Tooltip>

      {/* Table with picker */}
      <TablePickerPopover pendingConfig={pendingTableConfig} onSelect={(cols, rows) => { onInsertTable?.(cols, rows) }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'table' && '!text-primary')}>
              <Table2 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Table</TooltipContent>
        </Tooltip>
      </TablePickerPopover>

      {/* Equation */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'equation' && '!text-primary')} onClick={() => onToolMode('equation')}>
            <Sigma className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Equation</TooltipContent>
      </Tooltip>

      {/* Code */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'code' && '!text-primary')} onClick={() => onToolMode('code')}>
            <Code2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Code block</TooltipContent>
      </Tooltip>

      {/* Video */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', toolMode === 'video' && '!text-primary')} onClick={() => onToolMode('video')}>
            <Video className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Video</TooltipContent>
      </Tooltip>

      {/* Chart */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onInsertChart?.()}>
            <BarChart3 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Insert chart</TooltipContent>
      </Tooltip>

      <div className="mx-0.5 h-5 w-px bg-border/60" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => onBackground(e)}>
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Presentation theme</TooltipContent>
      </Tooltip>

      {onSlideBackground && (
        <SlideBackgroundButton
          color={slideBackgroundColor ?? '#ffffff'}
          onChange={onSlideBackground}
        />
      )}
    </div>
  )
}
