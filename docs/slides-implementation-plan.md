# Slides Implementation Plan

## Source studied

PPTist source code (`docs/references/PPTist Source Code`) was read in full. PPTist is licensed AGPL-3.0. No code from it is used or will be used in this implementation — only conceptual patterns translated independently into React.

---

## 1. PPTist patterns worth using (translated to React)

### Element positioning as absolute percentages
PPTist stores `left`, `top`, `width`, `height` as raw pixel values but then scales the canvas using a CSS transform. Prose will instead store everything as percentages (0–100) of slide dimensions. This is cleaner for responsive rendering and PPTX export (PPTX uses inches, not pixels; conversion from percentages is trivial and lossless).

### Canvas scale factor for text
PPTist computes `canvasScale = canvasPixelWidth / VIEWPORT_SIZE` and multiplies all font sizes, stroke widths, and shadow values by this factor at render time. Prose will do the same: `scale = canvasPixelWidth / SLIDE_BASE_WIDTH` where `SLIDE_BASE_WIDTH = 1920`. Font sizes in the data model are at 1x; the renderer multiplies by `scale` to produce screen-correct text.

### Discriminated union for element types
PPTist uses typed element interfaces (`PPTTextElement`, `PPTShapeElement`, etc.) unified via a `PPTElement` union type. Prose adopts this exact pattern with its own `SlideElement` union. Each renderer component handles exactly one element type, narrowed by the `type` discriminant.

### SVG shapes with path strings
PPTist stores shapes as `{ viewBox, path }` pairs — the shape geometry is an SVG path string, and scaling is done by adjusting the SVG `viewBox`. Prose will use the same approach: shape elements store a `shapeType` key that maps to a static SVG path definition at render time, keeping the data model lean.

### Undo/redo as in-memory stack of snapshots
PPTist uses an IndexedDB-backed snapshot store. Prose's slides undo/redo will be a simpler in-memory array of `SlidesContent` snapshots capped at 50 entries — no IndexedDB overhead, same conceptual model, fits within the Electron app's lifecycle constraints.

### Window-level mouse event attachment for drag/resize/rotation
PPTist attaches `mousemove` and `mouseup` to `document` so that fast mouse movement does not lose the handler when the cursor leaves the element. Prose will attach to `window` for consistency with existing Prose drag implementations (e.g., AI panel resize, sidebar resize in Editor.tsx).

### Per-sheet zoom mapped to a separate canvas zoom state
PPTist has a `canvasPercentage` state that drives a computed `canvasScale`. Prose's SlidesEditor will keep a `zoom` state (25–400%) displayed in the status bar, with the slide canvas sized using a transform or explicit width/height computation, never stored in the data model.

### Thumbnail generation via `html2canvas` with IntersectionObserver gating
PPTist renders each slide at thumbnail scale in a hidden container and captures with `html2canvas`. Prose will do the same, but additionally gate rendering behind `IntersectionObserver` and defer via `requestIdleCallback` so the initial load of a large presentation does not block.

### Rich text inside elements stored as HTML strings
PPTist stores rich text as HTML (`content: string`) processed with a ProseMirror editor. Prose will also store text as HTML strings for slide elements. `contenteditable` + `document.execCommand` (or a lightweight range-based approach) is used for in-place editing — this matches PPTist's architecture and is sufficient for slide text, which is always short relative to a full document.

### Shape text as a secondary property on `ShapeElement`
PPTist supports text inside shapes via a `text: ShapeText` property on `PPTShapeElement`. Prose mirrors this: `ShapeElement` has optional `content: string` (HTML) plus font/color properties.

### Element z-ordering via `zIndex` integer
PPTist maintains z-order by array position (front = higher index). Prose will use an explicit `zIndex` integer on each element to make ordering operations O(1) and serialization order-independent.

### Presentation mode as full-screen overlay
PPTist uses a separate `ScreenSlideList` component for presentation mode. Prose will use an IPC call to `mainWindow.setFullScreen(true)` plus a React overlay that hides all chrome and listens for navigation keys.

---

## 2. Patterns done differently for Prose

### No Pinia store — local React state + useReducer
PPTist uses a Pinia (Vue) store for all editor state: slides, selected elements, toolbar state. In React, this complexity is handled by `useReducer` inside `SlidesEditor` (for slides mutation + undo/redo), plus local `useState` for selection, active slide index, and drag state. The slides array is never put in the global Zustand `appStore` — it belongs to the editor component.

### No ProseMirror for slide text
PPTist uses ProseMirror inside slide text elements for rich editing. Prose already has a full ProseMirror/Tiptap editor for Documents. Slides text editing uses plain `contenteditable` with `document.execCommand` for basic marks and a range-based approach for color/font-size. This avoids shipping two separate ProseMirror instances for a relatively simple use case.

### Percentage-based positions from day one
PPTist uses pixel positions and scales the canvas. Prose stores percentages from day one. This makes PPTX export straightforward (pptxgenjs uses inches; `xInches = (xPct / 100) * slideWidthInches`) and avoids any coordinate system conversion in the UI.

### Auto-save wired to existing debounced save infrastructure
PPTist has no auto-save (it's a web app). Prose wires slides mutations through the same `scheduleSave` / `flushAndSave` pattern used by Documents and Sheets. The `useDocument` hook already abstracts save status, unsaved dot, and debounce logic.

### IPC-based slides operations follow existing document IPC patterns
Slides content is stored in the `.prose` file `content` field as `JSON.stringify(SlidesContent)`, identical to how Sheet and Board content is stored. The `window.prose.slides.*` IPC namespace follows the exact structure of `window.prose.documents.*`.

### Themes defined in TypeScript constants, not a database
PPTist's themes are loaded from the server. Prose defines built-in themes as constants in `src/types/slides.ts`. The active theme is stored in the `SlidesContent.theme` field. There is no separate theme database or API.

---

## 3. Edge cases and complexity hotspots

### Immer-frozen data after IPC round-trips
Immer-frozen objects from FortuneSheet caused crashes (as seen in the Sheets implementation). For Slides, all state mutations go through React's `useReducer` with structural immutability (spread operators), never direct mutation. The IPC round-trip through `JSON.parse(JSON.stringify(...))` in the preload layer ensures all data arriving from the main process is plain unfrozen objects.

### Drag/resize race between React re-renders and `mousemove` frequency
During a drag, if `setState` is called on every `mousemove` event, React re-renders 60fps+ which can cause layout thrash. The solution: use a `ref` to accumulate the in-progress drag position, and only call `setState` once on `mouseup`. The element visually follows the cursor via a CSS `transform` applied directly to the DOM node during drag (bypassing React), then state is committed on mouseup. PPTist uses a similar "scale the whole canvas, not individual elements during drag" trick.

### Text scaling and font size display
Element font sizes are stored in points at 1x scale. At a canvas width of 960px (half of 1920), `scale = 0.5`, so a 36pt heading renders at 18pt on screen. The zoom control in the status bar controls the canvas container size, not individual font sizes. Users see "100%" as "fit to window" not "1:1 pixel."

### PPTX import fidelity
pptxgenjs is primarily a write library. PPTX import will use a dedicated parsing approach. Complex PPTX features (SmartArt, WordArt, embedded charts, master-slide inheritance) cannot be perfectly represented in Prose's element model. The import will make a best-effort pass and show a "some formatting may differ" notice.

### html2canvas and CSS variables
html2canvas does not resolve CSS custom properties. Slide elements must use computed color values (hex/rgb strings) in their data model, not CSS variable references. The theme colors stored in `PresentationTheme` are plain hex strings; the renderer passes them as inline style values.

### SVG AI graphic sanitization
AI-generated SVG must be passed through DOMPurify before insertion. If DOMPurify removes all content (e.g., the SVG contained only `<script>` tags), show an error state rather than inserting an empty element.

### Undo/redo stack memory
At 50 slides with complex elements, a single `SlidesContent` snapshot can be 200KB+. The 50-entry cap limits total memory to ~10MB worst-case. `structuredClone` is used to copy state into the undo stack to ensure deep immutability.

### Thumbnail cache invalidation
Each slide's thumbnail is keyed on a JSON hash of the slide's `elements` + `background` fields. Mutations that don't affect visual content (e.g., updating speaker notes) do not trigger thumbnail re-render. The hash is computed with a lightweight djb2 or cyrb53 function to avoid expensive `JSON.stringify` on every render pass.

---

## 4. Confirmation: no AGPL code used

This implementation is built entirely from scratch using Prose's existing React/TypeScript/Tailwind patterns. The PPTist source was read as a conceptual reference only. The following were independently designed without copying PPTist code:

- The `SlideElement` discriminated union (inspired by PPTist's `PPTElement` but with different field names, percentage coordinates, and omitted Vue-specific patterns)
- The SVG shape path definitions (will be written independently; Prose uses a different subset of shapes than PPTist)
- The drag/resize interaction logic (uses Prose's existing `window.addEventListener` pattern, different state structure than PPTist)
- The undo/redo stack (in-memory array vs PPTist's IndexedDB; different API)
- The IPC layer (Prose-specific; PPTist has no IPC layer at all)

No files from `docs/references/PPTist Source Code` will be copied, adapted, or translated verbatim into the Prose codebase.
