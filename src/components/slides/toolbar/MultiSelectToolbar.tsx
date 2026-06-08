import {
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import type { Slide } from '@/types/slides'

interface Props {
  selectedIds: string[]
  slide: Slide
  onAlignElements(updates: { id: string; x: number; y: number }[]): void
}

export function MultiSelectToolbar({ selectedIds, slide, onAlignElements }: Props): JSX.Element {
  const elements = slide.elements.filter((e) => selectedIds.includes(e.id))

  function align(type: 'left' | 'center-h' | 'right' | 'top' | 'center-v' | 'bottom' | 'dist-h' | 'dist-v') {
    if (elements.length < 2) return

    const minX = Math.min(...elements.map((e) => e.x))
    const maxX = Math.max(...elements.map((e) => e.x + e.width))
    const minY = Math.min(...elements.map((e) => e.y))
    const maxY = Math.max(...elements.map((e) => e.y + e.height))

    let updates: { id: string; x: number; y: number }[]

    switch (type) {
      case 'left':
        updates = elements.map((e) => ({ id: e.id, x: minX, y: e.y }))
        break
      case 'center-h':
        updates = elements.map((e) => ({ id: e.id, x: (minX + maxX) / 2 - e.width / 2, y: e.y }))
        break
      case 'right':
        updates = elements.map((e) => ({ id: e.id, x: maxX - e.width, y: e.y }))
        break
      case 'top':
        updates = elements.map((e) => ({ id: e.id, x: e.x, y: minY }))
        break
      case 'center-v':
        updates = elements.map((e) => ({ id: e.id, x: e.x, y: (minY + maxY) / 2 - e.height / 2 }))
        break
      case 'bottom':
        updates = elements.map((e) => ({ id: e.id, x: e.x, y: maxY - e.height }))
        break
      case 'dist-h': {
        const sorted = [...elements].sort((a, b) => a.x - b.x)
        const totalW = sorted.reduce((s, e) => s + e.width, 0)
        const gap = (maxX - minX - totalW) / (sorted.length - 1)
        let cursor = minX
        updates = sorted.map((e) => { const u = { id: e.id, x: cursor, y: e.y }; cursor += e.width + gap; return u })
        break
      }
      case 'dist-v': {
        const sorted = [...elements].sort((a, b) => a.y - b.y)
        const totalH = sorted.reduce((s, e) => s + e.height, 0)
        const gap = (maxY - minY - totalH) / (sorted.length - 1)
        let cursor = minY
        updates = sorted.map((e) => { const u = { id: e.id, x: e.x, y: cursor }; cursor += e.height + gap; return u })
        break
      }
      default:
        return
    }

    onAlignElements(updates)
  }

  const buttons: { type: Parameters<typeof align>[0]; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
    { type: 'left',     icon: AlignStartVertical,             label: 'Align left' },
    { type: 'center-h', icon: AlignCenterVertical,            label: 'Align center (H)' },
    { type: 'right',    icon: AlignEndVertical,               label: 'Align right' },
    { type: 'top',      icon: AlignStartHorizontal,           label: 'Align top' },
    { type: 'center-v', icon: AlignCenterHorizontal,          label: 'Align middle (V)' },
    { type: 'bottom',   icon: AlignEndHorizontal,             label: 'Align bottom' },
    { type: 'dist-h',   icon: AlignHorizontalDistributeCenter, label: 'Distribute horizontally' },
    { type: 'dist-v',   icon: AlignVerticalDistributeCenter,   label: 'Distribute vertically' },
  ]

  return (
    <div className="flex items-center gap-0.5">
      <span className="mr-1 text-[11px] text-muted-foreground">{selectedIds.length} selected</span>
      {buttons.map(({ type, icon: Icon, label }) => (
        <Tooltip key={type}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => align(type)}>
              <Icon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
