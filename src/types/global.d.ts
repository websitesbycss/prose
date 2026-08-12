// Ambient global augmentations for browser APIs TypeScript's built-in DOM lib
// doesn't know about yet.

// Window Controls Overlay API (Chromium/Electron) — used by
// useTitleBarOverlayInset.ts to size around the native window controls in a
// custom title bar. Not yet part of TypeScript's standard DOM lib.
interface WindowControlsOverlayGeometryChangeEvent extends Event {
  readonly titlebarAreaRect: DOMRect
  readonly visible: boolean
}

interface WindowControlsOverlay extends EventTarget {
  readonly visible: boolean
  getTitlebarAreaRect(): DOMRect
  addEventListener(type: 'geometrychange', listener: (ev: WindowControlsOverlayGeometryChangeEvent) => void): void
  removeEventListener(type: 'geometrychange', listener: (ev: WindowControlsOverlayGeometryChangeEvent) => void): void
}

interface Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlay
}
