// Thumbnail pill for an attached image — used both pre-send (removable, in the
// composer / source picker) and post-send (read-only, inside a chat bubble).
// Click any pill to enlarge; horizontal-scroll rows of these are what let a
// message or source list carry several images without growing tall.
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { AttachedImage } from './imageAttachments'
import { cn } from '@/lib/utils'

/** Minimal shape needed to show/enlarge an image pill — shared by pre-send AttachedImage and post-send ChatMessageImage. */
export type ImagePreview = Pick<AttachedImage, 'id' | 'url' | 'name' | 'width' | 'height'>

interface PillProps {
  image: ImagePreview
  onOpen(image: ImagePreview): void
}

function PillBody({ image }: { image: PillProps['image'] }): JSX.Element {
  return (
    <>
      <div className="h-7 w-7 shrink-0 overflow-hidden rounded bg-muted">
        <img src={image.url} alt="" draggable={false} className="h-full w-full object-cover" />
      </div>
      <div className="flex min-w-0 max-w-[110px] flex-col leading-tight">
        <span className="truncate text-[11px] font-medium">{image.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{image.width}×{image.height}</span>
      </div>
    </>
  )
}

/** Removable pill — pre-send composer / source picker. */
export function ImagePill({ image, onOpen, onRemove }: PillProps & { onRemove(id: string): void }): JSX.Element {
  return (
    <div
      className="group relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background py-1 pl-1 pr-2.5 hover:border-muted-foreground/40"
      onClick={() => onOpen(image)}
    >
      <button
        type="button"
        className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-accent text-foreground opacity-0 transition-opacity hover:bg-primary hover:text-primary-foreground hover:border-primary group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onRemove(image.id) }}
      >
        <X className="h-2.5 w-2.5" />
      </button>
      <PillBody image={image} />
    </div>
  )
}

/** Read-only pill — already sent, shown inside a chat bubble. */
export function SentImagePill({ image, onOpen, inverted }: PillProps & { inverted?: boolean }): JSX.Element {
  return (
    <div
      className={cn(
        'flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border py-1 pl-1 pr-2.5',
        inverted ? 'border-primary-foreground/30 bg-primary-foreground/10' : 'border-border bg-background',
      )}
      onClick={() => onOpen(image)}
    >
      <PillBody image={image} />
    </div>
  )
}

export function ImageEnlargeModal({ image, onClose }: { image: ImagePreview | null; onClose(): void }): JSX.Element | null {
  if (!image) return null
  return createPortal(
    <div className="fixed inset-0 z-[99995] flex items-center justify-center bg-black/75" onClick={onClose}>
      <div className="relative max-h-[80vh] max-w-[80vw]" onClick={(e) => e.stopPropagation()}>
        <img src={image.url} alt="" draggable={false} className="block max-h-[80vh] max-w-[80vw] rounded-lg" />
        <button
          className="absolute -right-3.5 -top-3.5 flex h-7 w-7 items-center justify-center rounded-full border border-white/40 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
