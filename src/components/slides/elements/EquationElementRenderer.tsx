import { memo, useEffect, useRef } from 'react'
import type { EquationElement } from '@/types/slides'

interface Props {
  element: EquationElement
  scale: number
}

export const EquationElementRenderer = memo(function EquationElementRenderer({ element, scale }: Props): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    void import('katex').then(({ default: katex }) => {
      if (!ref.current) return
      try {
        katex.render(element.latex, ref.current, {
          displayMode: true,
          throwOnError: false,
          output: 'html',
        })
      } catch {
        if (ref.current) ref.current.textContent = element.latex
      }
    })
  }, [element.latex])

  return (
    <div
      className="flex h-full w-full items-center justify-center overflow-hidden"
      style={{ fontSize: element.fontSize * scale, color: element.color }}
    >
      <div ref={ref} />
    </div>
  )
})
