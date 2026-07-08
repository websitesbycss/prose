// Auto / Custom slide-count picker — Custom reveals a −/input/+ stepper whose
// number is directly editable (click to select/type an exact count).
import { cn } from '@/lib/utils'

interface Props {
  value: number | null
  onChange(v: number | null): void
}

export function SlideCountPicker({ value, onChange }: Props): JSX.Element {
  const isCustom = value !== null

  function setCount(n: number): void {
    onChange(Math.min(30, Math.max(1, n || 1)))
  }

  return (
    <div>
      <p className="mb-1.5 text-[11px] text-muted-foreground">Number of slides</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={cn(
            'rounded-md border px-3 py-1.5 text-[11px] font-medium',
            !isCustom ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
          )}
          onClick={() => onChange(null)}
        >
          Auto
        </button>
        <button
          type="button"
          className={cn(
            'rounded-md border px-3 py-1.5 text-[11px] font-medium',
            isCustom ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground',
          )}
          onClick={() => { if (!isCustom) onChange(10) }}
        >
          Custom
        </button>
        {isCustom && (
          <div className="flex items-center overflow-hidden rounded-md border border-border">
            <button type="button" className="flex h-7 w-6.5 items-center justify-center text-sm hover:bg-accent" onClick={() => setCount(value - 1)}>−</button>
            <input
              type="number"
              min={1}
              max={30}
              className="h-7 w-8.5 border-x border-border bg-transparent text-center font-mono text-xs font-medium text-foreground outline-none focus:bg-accent/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={value}
              onChange={(e) => setCount(parseInt(e.target.value, 10))}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="flex h-7 w-6.5 items-center justify-center text-sm hover:bg-accent" onClick={() => setCount(value + 1)}>+</button>
          </div>
        )}
      </div>
    </div>
  )
}
