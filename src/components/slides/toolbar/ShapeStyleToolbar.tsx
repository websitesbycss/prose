import { FlipHorizontal2, FlipVertical2, PaintBucket } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/appStore'
import type { ShapeElement } from '@/types/slides'
import {
  BorderColorIcon, BorderWeightPicker, ColorPickerDropdown,
  CornerRadiusIcon, OpacityIcon,
} from './ToolbarShared'

const FILL_PALETTE = [
  '#fef08a', '#fde68a', '#fed7aa',
  '#fca5a5', '#f9a8d4', '#d8b4fe',
  '#a5f3fc', '#86efac', '#bfdbfe',
  '#f3f4f6', '#e5e7eb', '#d1d5db',
]

const STROKE_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

interface Props {
  element: ShapeElement
  onUpdate(partial: Partial<ShapeElement>): void
}

export function ShapeStyleToolbar({ element, onUpdate }: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const borderWidth = element.border?.width ?? 0
  const borderColor = element.border?.color ?? '#000000'
  const borderStyle = element.border?.style ?? 'solid'
  const opacity = Math.round((element.opacity ?? 1) * 100)

  const themedStrokePalette = STROKE_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  const hasCornerRadius = element.shapeType === 'rect' || element.shapeType === 'roundRect'

  return (
    <div className="flex items-center gap-0.5">
      {/* Fill color */}
      <ColorPickerDropdown
        tooltip="Fill color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <PaintBucket className="h-3.5 w-3.5 leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
              style={{ backgroundColor: element.fill ?? 'transparent' }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={element.fill || '#ffffff'}
            current={element.fill ?? ''}
            palette={FILL_PALETTE}
            onChange={(c) => onUpdate({ fill: c })}
            onPaletteSelect={(c) => onUpdate({ fill: c })}
            onReset={() => { onUpdate({ fill: '#ffffff' }); close() }}
            resetLabel="Reset fill"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke color */}
      <ColorPickerDropdown
        tooltip="Stroke color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <BorderColorIcon className="leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-border/40"
              style={{ backgroundColor: borderWidth > 0 ? borderColor : 'transparent' }} />
          </Button>
        }
      >
        {(close) => (
          <ChromeColorPicker
            color={borderColor}
            current={borderWidth > 0 ? borderColor : ''}
            palette={themedStrokePalette}
            onChange={(c) => onUpdate({ border: { color: c, width: borderWidth || 1, style: borderStyle } })}
            onPaletteSelect={(c) => onUpdate({ border: { color: c, width: borderWidth || 1, style: borderStyle } })}
            onReset={() => { onUpdate({ border: undefined }); close() }}
            resetLabel="Remove stroke"
          />
        )}
      </ColorPickerDropdown>

      {/* Stroke weight */}
      <BorderWeightPicker
        currentWidth={borderWidth}
        onApply={(w) => onUpdate({ border: w === undefined ? undefined : { color: borderColor, width: w, style: borderStyle } })}
      />

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Corner radius */}
      {hasCornerRadius && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-6 items-center gap-0.5">
              <CornerRadiusIcon />
              <div className="flex h-6 overflow-hidden rounded border border-border/50">
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  value={element.cornerRadius ?? 0}
                  onChange={(e) => onUpdate({ cornerRadius: Number(e.target.value) })}
                  className="h-full w-10 bg-background px-1 text-[11px] focus:outline-none"
                />
                <div className="flex h-full items-center bg-muted px-1 text-[10px] text-muted-foreground select-none">
                  px
                </div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Corner radius</TooltipContent>
        </Tooltip>
      )}

      {/* Opacity */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex h-6 items-center gap-0.5', hasCornerRadius && 'ml-1')}>
            <OpacityIcon />
            <div className="flex h-6 overflow-hidden rounded border border-border/50">
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={opacity}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
                className="h-full w-10 bg-background px-1 text-[11px] focus:outline-none"
              />
              <div className="flex h-full items-center bg-muted px-1 text-[10px] text-muted-foreground select-none">
                %
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Opacity</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Flip H/V */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', element.flipH && '!text-primary')} onClick={() => onUpdate({ flipH: !element.flipH })}>
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Flip horizontal</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', element.flipV && '!text-primary')} onClick={() => onUpdate({ flipV: !element.flipV })}>
            <FlipVertical2 className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Flip vertical</TooltipContent>
      </Tooltip>
    </div>
  )
}
