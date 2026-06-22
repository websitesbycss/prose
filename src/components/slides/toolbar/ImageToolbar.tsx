import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { useAppStore } from '@/store/appStore'
import type { ImageElement } from '@/types/slides'
import {
  BorderColorIcon, BorderWeightPicker, ColorPickerDropdown,
  CornerRadiusIcon, OpacityIcon,
} from './ToolbarShared'

interface Props {
  element: ImageElement
  onUpdate(partial: Partial<ImageElement>): void
}

const STROKE_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

export function ImageToolbar({ element, onUpdate }: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const borderWidth = element.border?.width ?? 0
  const borderColor = element.border?.color ?? '#000000'
  const borderStyle = element.border?.style ?? 'solid'
  const opacity = Math.round((element.opacity ?? 1) * 100)

  const themedStrokePalette = STROKE_PALETTE.map((c) =>
    theme === 'dark' && c === '#000000' ? '#ffffff' : c
  )

  return (
    <div className="flex items-center gap-0.5">
      {/* Stroke color */}
      <ColorPickerDropdown
        tooltip="Stroke color"
        trigger={
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-col gap-0 px-1">
            <BorderColorIcon className="leading-none" />
            <span className="mt-0.5 h-1 w-4 rounded-sm border border-neutral-300 dark:border-neutral-600"
              style={{ backgroundColor: borderWidth > 0 ? borderColor : 'transparent', borderColor: borderWidth > 0 ? borderColor : undefined }} />
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
                value={element.borderRadius}
                onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
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

      {/* Opacity */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-6 items-center gap-0.5">
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
    </div>
  )
}
