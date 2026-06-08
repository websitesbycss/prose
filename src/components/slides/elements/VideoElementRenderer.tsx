import { memo } from 'react'
import type { VideoElement } from '@/types/slides'

interface Props {
  element: VideoElement
  scale: number
}

function getEmbedUrl(src: string): string | null {
  const yt = src.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = src.match(/vimeo\.com\/(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

export const VideoElementRenderer = memo(function VideoElementRenderer({ element }: Props): JSX.Element {
  const embedUrl = getEmbedUrl(element.src)

  if (embedUrl) {
    return (
      <iframe
        src={embedUrl}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        title="Embedded video"
      />
    )
  }

  return (
    <video
      src={element.src}
      poster={element.poster}
      autoPlay={element.autoPlay}
      loop={element.loop}
      muted={element.muted}
      controls
      playsInline
      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
    />
  )
})
