import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { SLIDE_LAYOUTS } from './slideLayouts'
import type { LayoutId } from './slideLayouts'
import type { PresentationTheme } from '@/types/slides'

interface Props {
  theme: PresentationTheme
  onSelect(layoutId: LayoutId): void
  onClose(): void
}

// Simple SVG thumbnails representing each layout
function LayoutPreview({ layoutId }: { layoutId: LayoutId }): JSX.Element {
  const bg = '#f8fafc'
  const line = '#cbd5e1'
  const accent = '#3b82f6'

  switch (layoutId) {
    case 'blank':
      return <rect x="1" y="1" width="70" height="44" fill={bg} rx="1" />
    case 'title-slide':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="10" y="14" width="52" height="7" fill={line} rx="1" /><rect x="20" y="25" width="32" height="3" fill={line} rx="1" /></>
    case 'title-content':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="4" width="40" height="5" fill={accent} rx="1" /><rect x="4" y="13" width="64" height="3" fill={line} rx="1" /><rect x="4" y="18" width="55" height="3" fill={line} rx="1" /><rect x="4" y="23" width="60" height="3" fill={line} rx="1" /></>
    case 'two-column':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="4" width="40" height="5" fill={accent} rx="1" /><rect x="4" y="13" width="30" height="3" fill={line} rx="1" /><rect x="4" y="18" width="28" height="3" fill={line} rx="1" /><rect x="38" y="13" width="30" height="3" fill={line} rx="1" /><rect x="38" y="18" width="26" height="3" fill={line} rx="1" /></>
    case 'title-only':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="10" width="55" height="9" fill={accent} rx="1" /></>
    case 'section-header':
      return <><rect x="1" y="1" width="70" height="44" fill={accent} rx="1" /><rect x="10" y="16" width="52" height="7" fill="white" opacity="0.9" rx="1" /><rect x="22" y="27" width="28" height="3" fill="white" opacity="0.6" rx="1" /></>
    case 'image-caption':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="4" width="64" height="30" fill={line} rx="2" /><rect x="15" y="37" width="42" height="3" fill={line} rx="1" /></>
    case 'comparison':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="4" width="30" height="5" fill={accent} rx="1" /><rect x="4" y="13" width="28" height="3" fill={line} rx="1" /><rect x="4" y="18" width="25" height="3" fill={line} rx="1" /><rect x="38" y="4" width="30" height="5" fill={line} rx="1" /><rect x="38" y="13" width="28" height="3" fill={line} rx="1" /><rect x="38" y="18" width="25" height="3" fill={line} rx="1" /></>
    case 'agenda':
      return <><rect x="1" y="1" width="70" height="44" fill={bg} rx="1" /><rect x="4" y="4" width="35" height="6" fill={accent} rx="1" />{[13,19,25,31,37].map((y, i) => <><rect key={`n${i}`} x="8" y={y} width="4" height="3" fill={accent} rx="0.5" /><rect key={`t${i}`} x="15" y={y} width="45" height="3" fill={line} rx="1" /></>)}</>
    default:
      return <rect x="1" y="1" width="70" height="44" fill={bg} rx="1" />
  }
}

export function LayoutPicker({ onSelect, onClose }: Props): JSX.Element {
  return createPortal(
    <>
      <div className="fixed inset-0 z-[99990] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[99991] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-sm font-semibold text-foreground">Choose a layout</h2>
          <button
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 p-5">
          {SLIDE_LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              className="group flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-left transition-all hover:border-primary hover:bg-accent/30"
              onClick={() => { onSelect(layout.id); onClose() }}
            >
              <svg viewBox="0 0 72 46" className="h-[46px] w-[72px] overflow-hidden rounded border border-border/50">
                <LayoutPreview layoutId={layout.id} />
              </svg>
              <div>
                <p className="text-center text-[12px] font-medium text-foreground">{layout.name}</p>
                <p className="text-center text-[10px] text-muted-foreground">{layout.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}
