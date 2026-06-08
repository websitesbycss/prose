import type { SlideElement } from '@/types/slides'
import { TextElementRenderer } from './TextElementRenderer'
import { ShapeElementRenderer } from './ShapeElementRenderer'
import { ImageElementRenderer } from './ImageElementRenderer'
import { TableElementRenderer } from './TableElementRenderer'
import { EquationElementRenderer } from './EquationElementRenderer'
import { CodeBlockElementRenderer } from './CodeBlockElementRenderer'
import { VideoElementRenderer } from './VideoElementRenderer'
import { AiGraphicElementRenderer } from './AiGraphicElementRenderer'

export function renderSlideElement(element: SlideElement, scale: number): JSX.Element {
  switch (element.type) {
    case 'text':       return <TextElementRenderer element={element} scale={scale} />
    case 'shape':      return <ShapeElementRenderer element={element} scale={scale} />
    case 'image':      return <ImageElementRenderer element={element} scale={scale} />
    case 'table':      return <TableElementRenderer element={element} scale={scale} />
    case 'equation':   return <EquationElementRenderer element={element} scale={scale} />
    case 'code':       return <CodeBlockElementRenderer element={element} scale={scale} />
    case 'video':      return <VideoElementRenderer element={element} scale={scale} />
    case 'ai-graphic': return <AiGraphicElementRenderer element={element} scale={scale} />
    default:           return <div style={{ width: '100%', height: '100%', background: 'rgba(100,100,100,0.1)' }} />
  }
}
