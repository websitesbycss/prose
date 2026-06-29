import { memo, useRef, useEffect } from 'react'
import type { SlideElement, TextElement, EquationElement, CodeBlockElement, TableElement } from '@/types/slides'
import { SelectionHandles } from './SelectionHandles'
import { renderSlideElement } from '../elements/renderSlideElement'
import { TextElementEditor } from '../elements/TextElementEditor'
import { EquationElementEditor } from '../elements/EquationElementEditor'
import { CodeBlockElementEditor } from '../elements/CodeBlockElementEditor'
import { TableElementEditor } from '../elements/TableElementEditor'
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
  onElementContextMenu(e: React.MouseEvent, id: string): void
  registerRef(id: string, el: HTMLDivElement | null): void
  onCommitText(id: string, content: string): void
  onCommitElement?(id: string, partial: Partial<SlideElement>): void
  onCancelEdit(): void
  onTableCellSelect?: (cellIds: string[]) => void
}

const EDITABLE_TYPES = new Set(['text', 'equation', 'code', 'table'])

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
  onElementContextMenu,
  registerRef,
  onCommitText,
  onCommitElement,
  onCancelEdit,
  onTableCellSelect,
}: Props): JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    registerRef(element.id, ref.current)
    return () => registerRef(element.id, null)
  }, [element.id, registerRef])

  if (element.hidden) return null

  const isEditing = editingElementId === element.id && EDITABLE_TYPES.has(element.type)
  const showHandles = selected && !isMultiSelected && !isEditing && !element.locked
  const flip = `scaleX(${element.flipH ? -1 : 1}) scaleY(${element.flipV ? -1 : 1})`

  function renderEditor(): JSX.Element | null {
    if (!isEditing) return null
    switch (element.type) {
      case 'text':
        return (
          <TextElementEditor
            element={element as TextElement}
            scale={scale}
            onCommit={(content) => onCommitText(element.id, content)}
            onCancel={onCancelEdit}
          />
        )
      case 'equation':
        return (
          <EquationElementEditor
            element={element as EquationElement}
            scale={scale}
            onCommit={(partial) => onCommitElement?.(element.id, partial as Partial<SlideElement>)}
            onCancel={onCancelEdit}
          />
        )
      case 'code':
        return (
          <CodeBlockElementEditor
            element={element as CodeBlockElement}
            scale={scale}
            onCommit={(partial) => onCommitElement?.(element.id, partial as Partial<SlideElement>)}
            onCancel={onCancelEdit}
          />
        )
      case 'table':
        return (
          <TableElementEditor
            element={element as TableElement}
            scale={scale}
            onCommit={(partial) => onCommitElement?.(element.id, partial as Partial<SlideElement>)}
            onCancel={onCancelEdit}
            onCellSelect={onTableCellSelect}
            onStartMove={(e) => onElementMouseDown(e, element.id)}
          />
        )
      default:
        return null
    }
  }

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
        // Explicit longhand props (not the `outline` shorthand) so every render
        // writes a deterministic outline-style value. Mixing the shorthand with
        // a conditionally-present outlineStyle override caused React to skip
        // re-applying the shorthand when its string was unchanged across a
        // locked/selected toggle, leaving outline-style stuck at its CSS
        // default ('none') until something else forced a full style refresh.
        outlineWidth: selected ? 2 : 0,
        outlineColor: 'hsl(var(--primary))',
        outlineStyle: !selected ? 'none' : element.locked ? 'dashed' : 'solid',
        outlineOffset: selected ? 1 : 0,
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return  // only left-click starts a drag; right-click opens the context menu
        if (element.locked) return
        if (isEditing) return  // don't start move drag while editing
        onElementMouseDown(e, element.id)
      }}
      onDoubleClick={(e) => {
        if (element.locked) return
        onElementDoubleClick(e, element.id)
      }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onElementContextMenu(e, element.id) }}
    >
      {isEditing ? renderEditor() : renderSlideElement(element, scale)}

      {/* Transparent overlay for video iframes so mouse events reach the wrapper */}
      {element.type === 'video' && !isEditing && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} />
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
