import { memo, useRef, useEffect } from 'react'
import type { SlideElement, TextElement } from '@/types/slides'
import { SelectionHandles } from './SelectionHandles'
import { renderSlideElement } from '../elements/renderSlideElement'
import { TextElementEditor } from '../elements/TextElementEditor'
import type { HandleType } from './types'

interface Props {
  element: SlideElement
  scale: number
  selected: boolean
  isMultiSelected: boolean
  editingElementId: string | null
  onElementMouseDown(e: React.MouseEvent, id: string): void
  onElementDoubleClick(e: React.MouseEvent, id: string): void
  onResizeMouseDown(e: React.MouseEvent, id: string, handle: HandleType): void
  onRotateMouseDown(e: React.MouseEvent, id: string): void
  registerRef(id: string, el: HTMLDivElement | null): void
  onCommitText(id: string, content: string): void
  onCancelEdit(): void
}


export const SlideElementWrapper = memo(function SlideElementWrapper({
  element,
  scale,
  selected,
  isMultiSelected,
  editingElementId,
  onElementMouseDown,
  onElementDoubleClick,
  onResizeMouseDown,
  onRotateMouseDown,
  registerRef,
  onCommitText,
  onCancelEdit,
}: Props): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerRef(element.id, ref.current)
    return () => registerRef(element.id, null)
  }, [element.id, registerRef])

  if (element.hidden) return null

  const isEditing = editingElementId === element.id && element.type === 'text'
  const showHandles = selected && !isMultiSelected && !isEditing
  const flip = `scaleX(${element.flipH ? -1 : 1}) scaleY(${element.flipV ? -1 : 1})`

  return (
    <div
      ref={ref}
      data-element-id={element.id}
      style={{
        position: 'absolute',
        left: `${element.x}%`,
        top: `${element.y}%`,
        width: `${element.width}%`,
        height: `${element.height}%`,
        transform: `rotate(${element.rotate}deg) ${flip}`,
        transformOrigin: 'center center',
        opacity: element.opacity,
        zIndex: element.zIndex,
        cursor: element.locked ? 'default' : 'move',
        outline: selected ? '2px solid #3B82F6' : 'none',
        outlineOffset: selected ? '1px' : '0',
        // Locked indicator: dashed outline
        ...(element.locked && selected ? { outlineStyle: 'dashed' } : {}),
      }}
      onMouseDown={(e) => {
        if (element.locked) return
        onElementMouseDown(e, element.id)
      }}
      onDoubleClick={(e) => {
        if (element.locked) return
        onElementDoubleClick(e, element.id)
      }}
    >
      {isEditing ? (
        <TextElementEditor
          element={element as TextElement}
          scale={scale}
          onCommit={(content) => onCommitText(element.id, content)}
          onCancel={onCancelEdit}
        />
      ) : (
        renderSlideElement(element, scale)
      )}

      {showHandles && (
        <SelectionHandles
          onResizeMouseDown={(e, handle) => onResizeMouseDown(e, element.id, handle)}
          onRotateMouseDown={(e) => onRotateMouseDown(e, element.id)}
        />
      )}

      {element.locked && (
        <div
          title="Element locked"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 12 * scale,
            height: 12 * scale,
            pointerEvents: 'none',
            opacity: 0.6,
          }}
        >
          🔒
        </div>
      )}
    </div>
  )
})
