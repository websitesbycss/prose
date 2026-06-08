export type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface ElementMove {
  id: string
  x: number
  y: number
}

export interface ElementResize {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface ElementRotate {
  id: string
  rotate: number
}

export interface MarqueeRect {
  startX: number
  startY: number
  endX: number
  endY: number
}

// All positions in this type are canvas-percentage (0-100), except absolute coords noted.
export type DragState =
  | {
      type: 'move'
      elementIds: string[]
      startMouseX: number  // abs px
      startMouseY: number  // abs px
      startPositions: Map<string, { x: number; y: number; rotate: number; flipH: boolean; flipV: boolean }>
      canvasRect: DOMRect
    }
  | {
      type: 'resize'
      elementId: string
      handle: HandleType
      startMouseX: number  // abs px
      startMouseY: number  // abs px
      startBounds: { x: number; y: number; width: number; height: number }
      canvasRect: DOMRect
    }
  | {
      type: 'rotate'
      elementId: string
      centerXAbs: number  // abs px — center of element in viewport
      centerYAbs: number  // abs px
      currentAngle: number  // degrees
    }
  | {
      type: 'marquee'
      canvasRect: DOMRect
      startX: number  // percentage
      startY: number  // percentage
    }
