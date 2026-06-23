// Pure element-array mutation helpers shared between the keyboard shortcuts
// hook and the right-click context menu, so both stay in sync.
import type { SlideElement } from '@/types/slides'

export type OrderDirection = 'forward' | 'back' | 'front' | 'back-all'

export function bumpZIndex(elements: SlideElement[], ids: string[], direction: OrderDirection): SlideElement[] {
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex)
  if (direction === 'front') {
    const maxZ = Math.max(...sorted.map((e) => e.zIndex))
    return elements.map((el) => (ids.includes(el.id) ? { ...el, zIndex: maxZ + 1 } : el))
  }
  if (direction === 'back-all') {
    const minZ = Math.min(...sorted.map((e) => e.zIndex))
    return elements.map((el) => (ids.includes(el.id) ? { ...el, zIndex: minZ - 1 } : el))
  }
  const result = sorted.map((el) => ({ ...el }))
  for (let i = 0; i < result.length; i++) {
    if (!ids.includes(result[i]!.id)) continue
    if (direction === 'forward' && i < result.length - 1) {
      const tmp = result[i]!.zIndex
      result[i]!.zIndex = result[i + 1]!.zIndex
      result[i + 1]!.zIndex = tmp
    } else if (direction === 'back' && i > 0) {
      const tmp = result[i]!.zIndex
      result[i]!.zIndex = result[i - 1]!.zIndex
      result[i - 1]!.zIndex = tmp
    }
  }
  return result
}

export function rotateElementsBy(elements: SlideElement[], ids: string[], deltaDeg: number): SlideElement[] {
  return elements.map((el) =>
    ids.includes(el.id) ? { ...el, rotate: ((el.rotate + deltaDeg) % 360 + 360) % 360 } : el,
  )
}

export function flipElements(elements: SlideElement[], ids: string[], axis: 'h' | 'v'): SlideElement[] {
  return elements.map((el) => {
    if (!ids.includes(el.id)) return el
    return axis === 'h' ? { ...el, flipH: !el.flipH } : { ...el, flipV: !el.flipV }
  })
}

export function setLocked(elements: SlideElement[], ids: string[], locked: boolean): SlideElement[] {
  return elements.map((el) => (ids.includes(el.id) ? { ...el, locked } : el))
}

export function groupElements(elements: SlideElement[], ids: string[]): SlideElement[] {
  const groupId = crypto.randomUUID()
  return elements.map((el) => (ids.includes(el.id) ? { ...el, groupId } : el))
}

export function ungroupElements(elements: SlideElement[], ids: string[]): SlideElement[] {
  return elements.map((el) => (ids.includes(el.id) ? { ...el, groupId: undefined } : el))
}
