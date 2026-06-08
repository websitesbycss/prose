import { memo, useMemo } from 'react'
import DOMPurify from 'dompurify'
import type { AiGraphicElement } from '@/types/slides'

interface Props {
  element: AiGraphicElement
  scale: number
}

export const AiGraphicElementRenderer = memo(function AiGraphicElementRenderer({ element }: Props): JSX.Element {
  const safe = useMemo(() =>
    DOMPurify.sanitize(element.svgContent, {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['script', 'object', 'embed', 'link'],
    }),
  [element.svgContent])

  return (
    <div
      style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: safe }}
    />
  )
})
