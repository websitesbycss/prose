import { useEffect, useRef } from 'react'
import type { Slide, SlideElement } from '@/types/slides'
import type { SlideHistory } from './useSlideHistory'
import { bumpZIndex } from '@/components/slides/slideElementOps'

interface Params {
  slides: Slide[]
  activeSlideIndex: number
  selectedIds: string[]
  history: SlideHistory
  elementClipboard: React.MutableRefObject<SlideElement[]>
  setSlides(slides: Slide[]): void
  setSelectedIds(ids: string[]): void
  scheduleSave(): void
  onSave(): void
  /** Suppresses every shortcut below — e.g. while the animation preview overlay
   * is open and arrow keys/space/enter should drive the preview instead of
   * nudging or mutating the (still-selected) element underneath. */
  disabled?: boolean
}

function updateActiveSlide(slides: Slide[], idx: number, updater: (s: Slide) => Slide): Slide[] {
  return slides.map((s, i) => (i === idx ? updater(s) : s))
}

function nudgeElements(elements: SlideElement[], ids: string[], dx: number, dy: number): SlideElement[] {
  return elements.map((el) => {
    if (!ids.includes(el.id)) return el
    return { ...el, x: el.x + dx, y: el.y + dy }
  })
}

export function useSlideKeyboardShortcuts({
  slides,
  activeSlideIndex,
  selectedIds,
  history,
  elementClipboard,
  setSlides,
  setSelectedIds,
  scheduleSave,
  onSave,
  disabled,
}: Params): void {
  const paramsRef = useRef({
    slides, activeSlideIndex, selectedIds, history,
    elementClipboard, setSlides, setSelectedIds, scheduleSave, onSave, disabled,
  })
  useEffect(() => {
    paramsRef.current = {
      slides, activeSlideIndex, selectedIds, history,
      elementClipboard, setSlides, setSelectedIds, scheduleSave, onSave, disabled,
    }
  })

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      const p = paramsRef.current
      if (p.disabled) return
      const slide = p.slides[p.activeSlideIndex]
      if (!slide) return

      const changeSlide = (updater: (s: Slide) => Slide): void => {
        p.history.push(p.slides)
        p.setSlides(updateActiveSlide(p.slides, p.activeSlideIndex, updater))
        p.scheduleSave()
      }

      if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        const prev = p.history.undo(p.slides)
        if (prev) { p.setSlides(prev.slides); p.setSelectedIds([]); p.scheduleSave() }
        return
      }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault()
        const next = p.history.redo(p.slides)
        if (next) { p.setSlides(next.slides); p.setSelectedIds([]); p.scheduleSave() }
        return
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        void p.onSave()
        return
      }
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault()
        p.setSelectedIds(slide.elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id))
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && p.selectedIds.length > 0) {
        e.preventDefault()
        changeSlide((s) => ({ ...s, elements: s.elements.filter((el) => !p.selectedIds.includes(el.id)) }))
        p.setSelectedIds([])
        return
      }
      if (e.ctrlKey && e.key === 'c' && p.selectedIds.length > 0) {
        p.elementClipboard.current = slide.elements.filter((el) => p.selectedIds.includes(el.id)).map((el) => ({ ...el }))
        return
      }
      if (e.ctrlKey && e.key === 'x' && p.selectedIds.length > 0) {
        e.preventDefault()
        p.elementClipboard.current = slide.elements.filter((el) => p.selectedIds.includes(el.id)).map((el) => ({ ...el }))
        changeSlide((s) => ({ ...s, elements: s.elements.filter((el) => !p.selectedIds.includes(el.id)) }))
        p.setSelectedIds([])
        return
      }
      if (e.ctrlKey && e.key === 'v' && p.elementClipboard.current.length > 0) {
        e.preventDefault()
        const pasted = p.elementClipboard.current.map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + 2, y: el.y + 2, zIndex: el.zIndex + 1 }))
        changeSlide((s) => ({ ...s, elements: [...s.elements, ...pasted] }))
        p.setSelectedIds(pasted.map((el) => el.id))
        return
      }
      if (e.ctrlKey && e.key === 'd' && p.selectedIds.length > 0) {
        e.preventDefault()
        const duped = slide.elements
          .filter((el) => p.selectedIds.includes(el.id))
          .map((el) => ({ ...el, id: crypto.randomUUID(), x: el.x + 2, y: el.y + 2, zIndex: el.zIndex + 1 }))
        changeSlide((s) => ({ ...s, elements: [...s.elements, ...duped] }))
        p.setSelectedIds(duped.map((el) => el.id))
        return
      }
      // Grouping: Ctrl+G group, Ctrl+Shift+G ungroup
      if (e.ctrlKey && !e.shiftKey && e.key === 'g' && p.selectedIds.length > 1) {
        e.preventDefault()
        const groupId = crypto.randomUUID()
        changeSlide((s) => ({
          ...s,
          elements: s.elements.map((el) =>
            p.selectedIds.includes(el.id) ? { ...el, groupId } : el,
          ),
        }))
        return
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'g' && p.selectedIds.length > 0) {
        e.preventDefault()
        changeSlide((s) => ({
          ...s,
          elements: s.elements.map((el) =>
            p.selectedIds.includes(el.id) ? { ...el, groupId: undefined } : el,
          ),
        }))
        return
      }
      // z-order
      if (e.ctrlKey && e.key === ']' && p.selectedIds.length > 0) {
        e.preventDefault()
        const dir = e.shiftKey ? 'front' : 'forward'
        changeSlide((s) => ({ ...s, elements: bumpZIndex(s.elements, p.selectedIds, dir) }))
        return
      }
      if (e.ctrlKey && e.key === '[' && p.selectedIds.length > 0) {
        e.preventDefault()
        const dir = e.shiftKey ? 'back-all' : 'back'
        changeSlide((s) => ({ ...s, elements: bumpZIndex(s.elements, p.selectedIds, dir) }))
        return
      }
      // Nudge
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && p.selectedIds.length > 0) {
        e.preventDefault()
        const step = e.shiftKey ? 0.1 : 1
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        changeSlide((s) => ({ ...s, elements: nudgeElements(s.elements, p.selectedIds, dx, dy) }))
        return
      }
      if (e.key === 'Escape') {
        p.setSelectedIds([])
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
