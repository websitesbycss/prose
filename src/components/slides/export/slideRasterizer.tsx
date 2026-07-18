// Rasterizes a slide to a PNG data URL using html2canvas.
// The slide is rendered off-screen at full resolution (1920px-wide base).
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import html2canvas from 'html2canvas'
import { SlideStaticView } from './SlideStaticView'
import type { Slide, PresentationTheme } from '@/types/slides'

export const RASTER_W = 1920
export const RASTER_H = 1080

export async function rasterizeSlide(
  slide: Slide,
  theme: PresentationTheme,
  width = RASTER_W,
  height = RASTER_H,
): Promise<string> {
  const container = document.createElement('div')
  // Position well outside viewport so it doesn't flicker on screen
  container.style.cssText = `position:fixed;left:${-(width + 200)}px;top:0;width:${width}px;height:${height}px;overflow:hidden;pointer-events:none;z-index:-9999;`
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    flushSync(() => {
      root.render(
        <SlideStaticView
          slide={slide}
          theme={theme}
          width={width}
          height={height}
        />
      )
    })

    // Wait for all images to finish loading before capturing
    const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img'))
    await Promise.all(
      imgs.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res() })
      )
    )

    const canvas = await html2canvas(container, {
      width,
      height,
      scale: 1,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    })

    return canvas.toDataURL('image/png')
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}

// Strip the data:image/png;base64, prefix and return raw base64
export function pngDataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(',')[1] ?? ''
}
