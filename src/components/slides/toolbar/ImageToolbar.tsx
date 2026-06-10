import { useState } from 'react'
import { SlidersHorizontal, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ChromeColorPicker } from '@/components/ui/ChromeColorPicker'
import { useAppStore } from '@/store/appStore'
import type { ImageElement, ImageFilters } from '@/types/slides'
import {
  BorderColorIcon, BorderWeightPicker, ColorPickerDropdown,
  CornerRadiusIcon, OpacityIcon,
} from './ToolbarShared'

interface Props {
  element: ImageElement
  onUpdate(partial: Partial<ImageElement>): void
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange(v: number): void
}

function SliderRow({ label, value, min, max, step, unit = '', onChange }: SliderRowProps): JSX.Element {
  return (
    <div className="flex h-6 items-center gap-1.5">
      <span className="w-16 shrink-0 text-[10px] text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-20 accent-primary"
      />
      <span className="w-8 text-right text-[10px] text-muted-foreground tabular-nums">{value}{unit}</span>
    </div>
  )
}

const DEFAULT_FILTERS: ImageFilters = { brightness: 100, contrast: 100, saturation: 100, blur: 0 }

const STROKE_PALETTE = [
  '#000000', '#374151', '#6b7280',
  '#ef4444', '#f97316', '#eab308',
  '#22c55e', '#06b6d4', '#3b82f6',
  '#8b5cf6', '#7F77DD', '#ec4899',
]

export function ImageToolbar({ element, onUpdate }: Props): JSX.Element {
  const theme = useAppStore((s) => s.theme)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filters = element.filters ?? DEFAULT_FILTERS
  const borderWidth = element.border?.width ?? 0
  const borderColor = element.border?.color ?? '#000000'
  const borderStyle = element.border?.style ?? 'solid'
  const opacity = Math.round((element.opacity ?? 1) * 100)

  function updateFilters(partial: Partial<ImageFilters>) {
    onUpdate({ filters: { ...filters, ...partial } })
  }

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

      <Separator orientation="vertical" className="mx-0.5 h-5" />

      {/* Filters popover */}
      <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Image filters</TooltipContent>
        </Tooltip>
        <PopoverContent
          className="w-48 p-2"
          side="bottom"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="flex flex-col gap-0.5">
            <SliderRow label="Brightness" value={filters.brightness} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ brightness: v })} />
            <SliderRow label="Contrast" value={filters.contrast} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ contrast: v })} />
            <SliderRow label="Saturation" value={filters.saturation} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ saturation: v })} />
            <SliderRow label="Blur" value={filters.blur} min={0} max={20} step={0.5} unit="px" onChange={(v) => updateFilters({ blur: v })} />
          </div>
        </PopoverContent>
      </Popover>

      {/* Reset filters */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onUpdate({ filters: DEFAULT_FILTERS })}
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Reset filters</TooltipContent>
      </Tooltip>
    </div>
  )
}
