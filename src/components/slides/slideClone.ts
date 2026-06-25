import type { Slide, SlideElement, ElementAnimation } from '@/types/slides'

function cloneElement(el: SlideElement): SlideElement {
  const clone = JSON.parse(JSON.stringify(el)) as SlideElement
  clone.id = crypto.randomUUID()
  if (clone.type === 'table') {
    clone.rows = clone.rows.map((row) =>
      row.map((cell) => ({ ...cell, id: crypto.randomUUID() })),
    )
  }
  return clone
}

/** Deep-clone a slide with new IDs for the slide, elements, and animation entries. */
export function cloneSlide(slide: Slide): Slide {
  const idMap = new Map<string, string>()
  const elements = slide.elements.map((el) => {
    const next = cloneElement(el)
    idMap.set(el.id, next.id)
    return next
  })
  const animations: ElementAnimation[] = slide.animations.map((a) => ({
    ...a,
    id: crypto.randomUUID(),
    elementId: idMap.get(a.elementId) ?? a.elementId,
  }))
  return {
    ...slide,
    id: crypto.randomUUID(),
    elements,
    notes: slide.notes,
    background: slide.background ? JSON.parse(JSON.stringify(slide.background)) : undefined,
    transition: slide.transition ? { ...slide.transition } : undefined,
    animations,
  }
}
