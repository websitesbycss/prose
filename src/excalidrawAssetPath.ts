// Excalidraw self-hosted fonts so the app works offline.
//
// This must run BEFORE anything imports Excalidraw: the library builds its font URLs when
// its module is first evaluated, and ES imports are hoisted, so setting this in main.tsx's
// body was too late and every font fell back to a CDN the CSP blocks. main.tsx imports this
// file first for that reason.
//
// Excalidraw requests `<assetPath>/fonts/<Family>/<file>`, so the files live in
// public/excalidraw-assets/fonts/. The path must be absolute: Excalidraw resolves a relative
// one against `window.location.origin`, which is the string "null" under file://.
;(window as Window & { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH = new URL(
  './excalidraw-assets/',
  document.baseURI,
).href

export {}
