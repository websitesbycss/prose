import { SlidersHorizontal, RefreshCw } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ColorPickerPopover } from './ColorPickerPopover'
import type { ImageElement, ImageFilters } from '@/types/slides'

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

export function ImageToolbar({ element, onUpdate }: Props): JSX.Element {
  const filters = element.filters ?? DEFAULT_FILTERS
  const borderWidth = element.border?.width ?? 0
  const borderColor = element.border?.color ?? '#000000'

  function updateFilters(partial: Partial<ImageFilters>) {
    onUpdate({ filters: { ...filters, ...partial } })
  }

  function resetFilters() {
    onUpdate({ filters: DEFAULT_FILTERS })
  }

  return (
    <div className="flex items-center gap-2">
      {/* Filters group */}
      <div className="flex flex-col gap-0.5">
        <SliderRow label="Brightness" value={filters.brightness} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ brightness: v })} />
        <SliderRow label="Contrast" value={filters.contrast} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ contrast: v })} />
        <SliderRow label="Saturation" value={filters.saturation} min={0} max={200} step={5} unit="%" onChange={(v) => updateFilters({ saturation: v })} />
        <SliderRow label="Blur" value={filters.blur} min={0} max={20} step={0.5} unit="px" onChange={(v) => updateFilters({ blur: v })} />
      </div>

      <div className="h-16 w-px bg-border/60" />

      <div className="flex flex-col gap-1">
        {/* Border radius */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex h-6 items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Radius</span>
              <input
                type="number"
                min={0}
                max={50}
                step={1}
                value={element.borderRadius}
                onChange={(e) => onUpdate({ borderRadius: Number(e.target.value) })}
                className="h-full w-12 rounded border border-border/50 bg-background px-1 text-[11px] focus:outline-none"
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Border radius</TooltipContent>
        </Tooltip>

        {/* Border */}
        <div className="flex items-center gap-1">
          <ColorPickerPopover value={borderColor} onChange={(c) => onUpdate({ border: { color: c, width: borderWidth || 1, style: 'solid' } })} label="Border color">
            <div className="h-5 w-5 cursor-pointer rounded-sm border-2" style={{ borderColor }} />
          </ColorPickerPopover>
          <select
            className="h-6 w-16 rounded border border-border/50 bg-background px-1 text-[11px] text-foreground focus:outline-none"
            value={borderWidth}
            onChange={(e) => {
              const w = Number(e.target.value)
              onUpdate({ border: w === 0 ? undefined : { color: borderColor, width: w, style: 'solid' } })
            }}
          >
            {[0, 1, 2, 3, 4, 6].map((w) => <option key={w} value={w}>{w === 0 ? 'None' : `${w}px`}</option>)}
          </select>
        </div>

        {/* Reset filters */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-6 items-center gap-1 rounded px-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={resetFilters}
            >
              <RefreshCw className="h-3 w-3" />
              Reset filters
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Reset all filters to default</TooltipContent>
        </Tooltip>
      </div>

      <div className="h-16 w-px bg-border/60" />

      {/* Opacity */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex h-6 items-center gap-1">
            <SlidersHorizontal className="h-3 w-3 text-muted-foreground" />
            <input
              type="number"
              min={0}
              max={100}
              step={5}
              value={Math.round((element.opacity ?? 1) * 100)}
              onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
              className="h-full w-12 rounded border border-border/50 bg-background px-1 text-[11px] focus:outline-none"
            />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">Opacity</TooltipContent>
      </Tooltip>
    </div>
  )
}
