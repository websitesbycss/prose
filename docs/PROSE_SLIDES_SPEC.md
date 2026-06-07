# Prose — Slides Spec
## Phases 21–32

This document specifies the implementation of **Slides**, the fourth file type in the Prose suite. Slides is a full-featured presentation editor comparable to Google Slides and Microsoft PowerPoint, built natively in React, deeply integrated with Prose's local AI system, and consistent with the design, architecture, and code quality of Documents, Sheets, and Boards.

---

## Read this entire document before writing a single line of code.

---

## Code quality requirements

All existing code quality rules from `docs/SPEC.md` apply here without exception. Additionally:

- No AI tells in any code produced for Slides
- No Vue patterns — the PPTist reference is Vue, Prose is React. Translate concepts only, never syntax
- No AGPL code copied from PPTist — study patterns conceptually, implement independently
- Every component under 200 lines where possible — split aggressively into focused sub-components
- Every async operation has try/catch with meaningful error context
- No hardcoded colors — Tailwind classes and CSS variables only
- No hardcoded pixel values for slide dimensions — derive from constants
- TypeScript strict mode — no `any` types anywhere
- All IPC handlers validate and sanitize inputs before processing
- No user content (slide text, notes, AI prompts) ever logged

---

## Phase 21 — Study and implementation planning

**Before writing any code for Slides, do the following:**

Read the PPTist source code located at `docs/references/PPTist Source Code` thoroughly. PPTist is a Vue 3 open source slide editor licensed under AGPL-3.0. It is provided as a conceptual reference only. Do not copy any code from it. Do not use Vue patterns. Do not replicate its architecture directly. Read it to understand how a production-quality slide editor solves the following problems:

- How slide elements are positioned, selected, and manipulated on a canvas
- How drag and resize interactions are implemented for canvas elements
- How slide thumbnails are rendered and lazily loaded
- How the slide panel (left thumbnail list) is structured and navigated
- How presentation/fullscreen mode works
- How speaker notes are stored and displayed
- How keyboard shortcuts are handled for slide editing
- How copy/paste of elements works including cross-slide paste
- How undo/redo is managed for a canvas-based editor
- How element z-ordering (layering) works
- How text editing inside canvas elements works
- How tables inside slides are handled
- How themes and color palettes are applied globally
- How slide transitions are defined and previewed
- How PPTX import and export is handled

After reading the source code, produce a file at `docs/slides-implementation-plan.md` that documents:

1. The specific patterns from PPTist that are worth using conceptually in Prose's Slides implementation (translated to React)
2. Any patterns that should be done differently given Prose's React architecture, Tailwind styling, and existing infrastructure
3. A list of any edge cases or complexity hotspots identified from reading the source
4. Confirmation that no AGPL code will be used — only independently reimplemented concepts

Do not proceed to Phase 22 until this planning document exists and contains substantive notes.

---

## Naming and file type conventions

Following the conventions established in `docs/SPEC.md` and the Sheets/Boards spec:

- The file type value in the `.prose` file is `'slides'`
- The type name shown in the UI is **Slides** (capital S)
- A single Slides file is called a **Presentation**
- Individual pages within a presentation are called **Slides** (capital S)
- The file icon in the dashboard, tabs, and type picker is a presentation/slides icon
- The `.prose` file extension is shared with all other file types — `type: 'slides'` distinguishes it

---

## Data model

Design the TypeScript interfaces yourself based on what the implementation requires. The following are requirements, not prescriptions — you decide the exact shape.

**A Slides file must support:**

- An ordered array of slides, each with a unique ID
- Per-slide background: solid color, linear gradient, radial gradient, or image
- Per-slide elements: text box, image, shape, table, equation, video embed, code block, chart placeholder, AI-generated graphic
- Per-element: position (percentage-based relative to slide dimensions), size (percentage-based), rotation in degrees, z-index, opacity, flip horizontal/vertical, lock toggle, visibility toggle
- Per-text-element: rich text content (multiple runs with independent formatting), font family, font size, font weight, font style, underline, strikethrough, text color, text alignment (horizontal and vertical), line height, letter spacing, list style (bullet or numbered), hyperlinks within text
- Per-shape-element: shape type (rectangle, rounded rectangle, ellipse, triangle, pentagon, hexagon, star, arrow, speech bubble, line, connector arrow), fill color, stroke color, stroke width, stroke style, corner radius where applicable, text content inside shape with same rich text support as text box
- Per-image-element: stored as base64 or file path, alt text, crop settings (top/right/bottom/left as percentages), border radius, border color/width, shadow settings, filters (brightness, contrast, saturation, blur)
- Per-table-element: rows and columns, per-cell content with rich text, per-cell background, per-cell borders, merged cells, header row flag
- Per-equation-element: LaTeX string, font size, color
- Per-code-block-element: code string, language, theme (dark/light), font size
- Speaker notes per slide: plain text string
- Slide transition per slide: type (none, fade, slide, zoom, flip), duration in ms, direction where applicable
- Slide animation per element: entrance animation type, duration, delay, trigger (on click or auto)
- Presentation-level theme: primary color, secondary color, accent color, background color, text color, heading font, body font
- Presentation-level settings: aspect ratio (16:9 or 4:3 or custom), default font, default font size
- Slide size in pixels at 1x: derived from aspect ratio, stored as width/height constants not in the file

**Position and size convention:**
All x, y, width, height values are stored as percentages (0–100) of the slide dimensions. This ensures correct rendering at any display size and correct PPTX export. Never store pixel values in the data model.

**The content field in the `.prose` file:**
The full slides array, theme, and settings are stored as a JSON object in the `content` field. The file service handles this identically to other file types.

---

## Phase 22 — File type registration and dashboard integration

Before building any Slides UI, register the file type in the existing infrastructure.

- Add `'slides'` to the file type union in `src/types/index.ts`
- Add the Slides icon to the type icon map used by the dashboard, tab bar, and file picker
- Add Slides to the new file type picker modal with description: "Create presentations with slides, shapes, images, and AI-generated content"
- Add `'slides'` to the type filter pills on the dashboard (All · Documents · Sheets · Boards · **Slides**)
- Update the index database to handle `'slides'` type — `word_count` stores the total number of slides as the count metric
- Dashboard shows "N slides" for Slides files instead of "N words" or "N cells"
- Slides files show with the Slides icon in all existing list views, card views, and tab bar
- When a Slides file is opened from the dashboard or tab bar, render the SlidesEditor component instead of any other editor
- The hero "Continue writing" card on the dashboard adapts its label to "Continue presenting" for Slides files
- Do not change any existing file type behavior

---

## Phase 23 — Core data infrastructure and IPC

Before building any UI, establish the data layer.

**Serialization:**
The slides data model serializes to JSON and stores in the `.prose` file `content` field. Write a `serializeSlides` function and a `deserializeSlides` function. Deserialization must be defensive — handle missing fields gracefully with defaults rather than throwing, since files may have been created by older versions of the app.

**IPC handlers:**
Add the following handlers to a new `electron/main/ipc/slides.ts` file and expose via `window.prose.slides` in the preload. Follow the exact same security and validation patterns as existing IPC handlers.

```
window.prose.slides.getSlides(fileId): Promise<Slide[]>
window.prose.slides.updateSlides(fileId, slides): Promise<void>
window.prose.slides.addSlide(fileId, afterIndex): Promise<Slide>
window.prose.slides.deleteSlide(fileId, slideId): Promise<void>
window.prose.slides.duplicateSlide(fileId, slideId): Promise<Slide>
window.prose.slides.reorderSlides(fileId, slideIds): Promise<void>
window.prose.slides.updateTheme(fileId, theme): Promise<void>
window.prose.slides.exportPptx(fileId, outputPath): Promise<void>
window.prose.slides.exportPdf(fileId, outputPath): Promise<void>
window.prose.slides.exportPng(fileId, slideId, outputPath): Promise<void>
window.prose.slides.importPptx(sourcePath): Promise<string> // returns new fileId
```

**Auto-save:**
Wire auto-save to the existing debounced save system. Every mutation to slides state triggers the auto-save debounce at 1 second. The unsaved indicator dot on the tab fires on every mutation. Auto-save serializes the full slides array and writes to the `.prose` file via the existing file service. Never call auto-save more than once per debounce window regardless of how many mutations happened.

**Undo/redo:**
Implement a slides-specific undo/redo stack in the SlidesEditor component state. Every user action that mutates slide data pushes the previous state onto the undo stack. Ctrl+Z pops the undo stack. Ctrl+Shift+Z or Ctrl+Y pops the redo stack. Cap the stack at 50 entries to prevent unbounded memory growth. The undo/redo stack is in-memory only and does not persist across sessions. Wire through the existing ShortcutManager.

---

## Phase 24 — Slide canvas and element rendering

This is the core rendering phase. Build the slide canvas that displays one slide at a time with all its elements.

**SlideCanvas component:**
The slide canvas is a `div` with a fixed aspect ratio container. The outer container fills the available space. The inner canvas maintains the correct aspect ratio (16:9 by default = 1920×1080 at 1x) using a CSS aspect-ratio or padding-bottom technique. All elements inside the canvas are `position: absolute` with their x/y/width/height applied as percentage CSS values derived from the stored percentages.

The canvas renders at whatever size fits the editor area. Elements scale proportionally because they use percentages. Text sizes are scaled using a `scale` factor calculated as `canvasPixelWidth / SLIDE_BASE_WIDTH` where `SLIDE_BASE_WIDTH` is the constant 1920. Apply this scale factor to all font sizes, stroke widths, border radii, and shadow values so the slide looks correct at any canvas size.

**Element rendering:**
Each element type has its own renderer component:

`TextElement` — renders a div with the rich text content. In view mode shows the formatted text. In edit mode activates a contenteditable or custom rich text input.

`ImageElement` — renders an img tag with crop applied via CSS clip-path or overflow hidden with negative margins. Applies filters via CSS filter property.

`ShapeElement` — renders an SVG element for the shape geometry with the fill and stroke applied. Text content inside the shape renders as a foreignObject or absolutely positioned div centered in the SVG bounds.

`TableElement` — renders an HTML table with per-cell styling. Cell editing activates on double-click.

`EquationElement` — renders KaTeX output. Reuses the existing equation extension logic from Documents.

`CodeBlockElement` — renders syntax-highlighted code using highlight.js or Prism, both MIT licensed.

`VideoElement` — renders an iframe embed for YouTube/Vimeo URLs or a video tag for local files.

**Element selection:**
Clicking an element selects it, showing an 8-point bounding box with resize handles at corners and edge midpoints, and a rotation handle above the top edge. Clicking the canvas background deselects all. Shift+click adds to or removes from multi-selection. Drag on canvas background draws a selection marquee — elements whose bounding boxes intersect the marquee are selected on mouseup.

Selected elements show:
- A 1px border in the primary blue accent color
- 8 resize handles — white squares with blue border, 8×8px at screen size regardless of zoom
- 1 rotation handle — white circle with blue border, connected by a line 24px above the top edge
- For multi-selection: a dashed bounding box around all selected elements with no individual handles

**Drag to move:**
`mousedown` on an element starts drag mode. Track `mousemove` on the window. Apply the delta to element position, clamping to stay within slide bounds (optionally — some apps allow dragging outside). Snap to grid (optional, based on settings) or snap to center/edges of slide and other elements when within 5px. `mouseup` on window ends drag, commits the new position to state, triggers auto-save debounce.

**Resize:**
`mousedown` on a resize handle starts resize mode. Track handle identity (which of the 8 handles). Apply `mousemove` delta to the appropriate dimensions based on handle position. Maintain aspect ratio when Shift is held for corner handles. Enforce minimum element size of 2% width and 2% height. `mouseup` commits.

**Rotation:**
`mousedown` on the rotation handle starts rotation mode. Calculate angle from element center to mouse position. Apply as rotation. Snap to 0°/45°/90°/135°/180° when within 3° if Shift is held. `mouseup` commits.

**All drag/resize/rotation interactions must:**
- Attach mousemove and mouseup listeners to `window` not to the element itself, so fast mouse movement doesn't lose the handler
- Clean up event listeners in the mouseup handler
- Show a cursor appropriate to the operation during drag (`move`, `nwse-resize`, `nesw-resize`, `ns-resize`, `ew-resize`, `grab`)
- Not modify the undo stack during drag — only push to undo stack on mouseup commit

---

## Phase 25 — Slide panel, toolbar, and editor shell

**SlidesEditor shell:**
The overall layout when a Slides file is open:

```
[Tab bar — identical to all file types]
[Toolbar row — slides-specific left, persistent right]
┌─────────────┬──────────────────────────────┬──────────────┐
│ Left sidebar│ Slide canvas (center)        │ AI panel     │
│ (slide list)│                              │ (right)      │
│             │                              │              │
│             ├──────────────────────────────┤              │
│             │ Speaker notes panel          │              │
└─────────────┴──────────────────────────────┴──────────────┘
[Status bar — identical to all file types]
```

**Left sidebar — slide panel:**
The left sidebar contains the slide list panel. It matches the visual design of the Document sidebar exactly — same width, same background color, same Settings and Collapse buttons at the bottom.

The slide list is a vertically scrollable list of slide thumbnails. Each thumbnail:
- Renders a lazy preview of the actual slide — use IntersectionObserver to detect when a thumbnail is visible in the scroll container, then render it. Before rendering show a skeleton placeholder matching the slide aspect ratio.
- Thumbnail rendering: render each slide's content into a hidden offscreen `div` scaled down to thumbnail size via `transform: scale(factor)`, capture using `html2canvas` (MIT licensed) or equivalent, cache the result as a data URL, re-render only when the slide content changes (compare a hash of the slide JSON)
- Shows slide number below the thumbnail
- Click to navigate to that slide
- Right-click opens a context menu: Add slide after, Duplicate, Delete, Move up, Move down, Copy slide, Paste slide, Set as first slide
- Selected/active slide has a primary blue accent border
- Drag to reorder slides — show a drop indicator line between slides during drag

Below the slide list: an "Add slide" button that appends a new blank slide and navigates to it.

**Speaker notes panel:**
A panel below the slide canvas, collapsible via a drag handle. Default height is 120px. Minimum height 60px, maximum 40% of canvas area height. Contains a plain text textarea for the current slide's speaker notes. Persists notes to the slide data on change, debounced at 500ms. Shows placeholder text "Click to add speaker notes..." when empty. The panel is hidden entirely in presentation mode.

**Toolbar — Slides:**
The left side of the toolbar row when a Slides file is open. The persistent right section (music, AI, theme, three dots) is identical to all other file types.

Default state (no element selected):
```
[Select V] [Text T] [□ Shape] [Image] [Table] [Σ Eq] [</> Code] [▶ Video] [⬛ Bg] | [Theme] | [♫] [✦] [🌙] [⋯]
```

When a text element is selected, show text formatting controls:
```
[Font family] [Size] [B] [I] [U] [S] [A color] [🎨 bg] [≡ align] [↕ valign] [line height] [letter spacing] [bullets] [numbered] | [♫] [✦] [🌙] [⋯]
```

When a shape is selected:
```
[Fill color] [Stroke color] [Stroke width] [Stroke style] [Corner radius] [Opacity] [Shadow] [Flip H] [Flip V] | [♫] [✦] [🌙] [⋯]
```

When an image is selected:
```
[Crop] [Border radius] [Border color] [Border width] [Brightness] [Contrast] [Saturation] [Blur] [Reset filters] [Replace image] | [♫] [✦] [🌙] [⋯]
```

When multiple elements are selected:
```
[Align left] [Align center] [Align right] [Align top] [Align middle] [Align bottom] [Distribute H] [Distribute V] [Group] | [♫] [✦] [🌙] [⋯]
```

**Three dots menu for Slides:**
- Find in presentation (searches all slide text content)
- Export as PPTX
- Export as PDF
- Export as PNG (current slide)
- Export all slides as PNG (zip)
- Separator
- Slide settings (aspect ratio, default font)
- Presentation theme
- Separator
- Enter presentation mode (F5)
- Separator
- Pin/unpin, move to category, duplicate file, show in Explorer, delete file

**Keyboard shortcuts for Slides (register through ShortcutManager):**
- Ctrl+Z / Ctrl+Shift+Z — undo/redo
- Ctrl+C / Ctrl+X / Ctrl+V — copy/cut/paste elements
- Ctrl+D — duplicate selected elements
- Delete / Backspace — delete selected elements
- Arrow keys — nudge selected elements by 1% of slide dimension
- Shift+Arrow — nudge by 0.1%
- Ctrl+A — select all elements on current slide
- Ctrl+G — group selected elements
- Ctrl+Shift+G — ungroup
- Ctrl+] / Ctrl+[ — bring forward / send backward
- Ctrl+Shift+] / Ctrl+Shift+[ — bring to front / send to back
- Escape — deselect all / exit text edit mode / exit presentation mode
- Enter — enter text edit mode on selected text/shape element
- F5 — enter presentation mode
- Page Down / Page Up or arrow right / left (in presentation mode) — next/previous slide

---

## Phase 26 — Text editing inside elements

Text editing inside slide elements is different from the main Document editor. It is not Tiptap — it is a custom in-place editing experience.

**Text edit mode:**
Double-clicking a text element or shape element (when shape has text content) enters text edit mode. The element shows a cursor and accepts keyboard input. Clicking outside exits text edit mode and commits the content.

**Text editing implementation:**
Use a `contenteditable` div absolutely positioned over the element, sized to match the element exactly. Apply the element's text styles to the contenteditable. On blur or Escape, read the contenteditable's content, convert to the rich text data model, commit to state, and remove the contenteditable.

**Rich text support inside elements:**
Within a text element, support these formatting marks applied to text ranges:
- Bold, italic, underline, strikethrough
- Font family, font size, text color, highlight color
- Hyperlinks (Ctrl+K opens a URL input popover)
- Superscript, subscript

Implement a minimal selection-based formatting system: when text is selected inside the contenteditable and a formatting button is clicked in the toolbar, apply the mark to the selection using `document.execCommand` for simple cases or a custom range-based approach for complex marks. This does not need to be as sophisticated as Tiptap — slides typically have short text content and the full document editor is available in Documents.

**Text overflow:**
Text elements have an overflow mode setting: clip (text hidden beyond element bounds), resize (element grows to fit text), or auto-fit (font size shrinks to fit). Default is clip. Show a small indicator on the element border when text is overflowing in clip mode.

---

## Phase 27 — Shape library and element insertion

**Shape insertion:**
Clicking the Shape tool in the toolbar opens a shape picker popover showing all available shapes in a grid. Clicking a shape sets the active tool to that shape type. Then clicking and dragging on the canvas draws the shape — mousedown sets the start corner, mousemove updates the opposite corner, mouseup commits the element with default fill/stroke matching the current theme.

**Available shapes:**
Basic: rectangle, rounded rectangle, ellipse/circle, triangle, right triangle, parallelogram, trapezoid
Arrows: right arrow, left arrow, up arrow, down arrow, double arrow, bent arrow, circular arrow
Lines: straight line, curved line, connector (snaps endpoints to element edges)
Callouts: speech bubble, thought bubble, rectangular callout
Stars and banners: 4-point star, 5-point star, 6-point star, banner, wave
Flowchart: process (rectangle), decision (diamond), terminal (rounded rectangle), data (parallelogram), connector (circle)

**Image insertion:**
Clicking the Image button opens a file picker filtered to image types (png, jpg, jpeg, webp, gif, svg). Selected image is embedded as base64 in the element data. Also support drag-and-drop images directly onto the canvas. Also support paste from clipboard (Ctrl+V when no element is selected and clipboard contains an image).

**Table insertion:**
Clicking the Table button shows a grid picker (up to 8×8) to select dimensions. Inserts a table element at the center of the slide with equal column widths and equal row heights. Default styling uses theme colors for header row.

**Copy/paste elements:**
Copy selected elements to a clipboard store in memory (not the system clipboard — keep it internal to avoid security issues with serializing complex element data). Paste inserts copies of the elements offset by 20px/20px from the originals. Cross-slide paste works — copy elements on one slide, navigate to another, paste.

Also support system clipboard paste of plain text (creates a text element) and images (creates an image element) via the `paste` event on the canvas.

---

## Phase 28 — Presentation mode

Presentation mode is a fullscreen, distraction-free view of the slides in sequence.

**Entering presentation mode:**
F5 or the three dots menu. Use Electron's `mainWindow.setFullScreen(true)` via an IPC call. Hide all application chrome — tab bar, toolbar, sidebar, speaker notes panel, status bar. Show only the slide canvas filling the entire screen with a black background.

**Navigation in presentation mode:**
- Right arrow, Page Down, Space, or click anywhere — advance to next slide
- Left arrow, Page Up — go to previous slide
- Escape — exit presentation mode, return to editor at the current slide
- Number keys + Enter — jump to specific slide number
- G — open a slide grid overview showing all slides as thumbnails for quick navigation

**Slide transitions:**
When navigating between slides, apply the transition defined on the incoming slide. Implement transitions as CSS animations:
- None: instant switch
- Fade: opacity 0→1 on the incoming slide over the transition duration
- Slide left/right/up/down: translate the incoming slide in from the specified direction
- Zoom: scale 0.8→1 with opacity 0→1 on incoming slide
- Flip: CSS perspective + rotateY animation

Transitions should use `requestAnimationFrame` and CSS transitions rather than JavaScript animation loops for performance.

**Speaker notes window:**
If the user has a second monitor, offer to open speaker notes in a second window. Detect via `window.screen.width` vs `window.outerWidth`. The second window shows: current slide number and total, speaker notes text for the current slide, a small preview of the current slide, a preview of the next slide, and an elapsed time timer. Use `BroadcastChannel` or Electron IPC to sync slide navigation between the main window and the notes window.

If no second monitor, show speaker notes in a small overlay at the bottom of the presentation window that can be toggled with N.

**Presentation toolbar overlay:**
A thin toolbar that appears at the bottom of the screen when the mouse moves toward it (within 80px of bottom edge) and hides after 2 seconds of no movement. Contains: previous slide, slide counter (3/12), next slide, toggle notes, exit fullscreen. Uses a semi-transparent dark background.

**Laser pointer mode:**
Press L in presentation mode to toggle laser pointer. The mouse cursor becomes a red dot with a glow effect. `mousemove` on the canvas updates a red circle element following the cursor. This is cosmetic only — it helps when presenting on a projected screen.

---

## Phase 29 — Themes, templates, and slide layouts

**Presentation themes:**
A theme defines: primary color, secondary color, accent color, background color, text color (on background), heading font family, body font family. Themes apply globally to the entire presentation.

Built-in themes — design these carefully to match Prose's aesthetic quality:
- **Prose Dark** — dark backgrounds, blue accents, Geist/Inter fonts. Matches Prose's own dark UI.
- **Academic** — white background, navy/maroon accents, Times New Roman/Georgia. Classic essay presentation look.
- **Minimal** — white background, black text, thin gray accents, Inter font. Clean and professional.
- **Bold** — black background, vivid amber accents, heavy sans-serif. High contrast, modern.
- **Soft** — light gray background, muted pastels, rounded shapes. Friendly and approachable.
- **Tech** — dark background, green terminal-style accents, monospace fonts. CS/engineering presentations.

Applying a theme updates all slides' background colors and default text colors. Elements that were using theme defaults update automatically. Elements with manually overridden colors keep their overrides.

**Slide layouts:**
When adding a new slide, offer a layout picker with common starting layouts:
- Blank
- Title slide (large centered title + subtitle)
- Title and content (title at top, content area below)
- Two column (title at top, two equal content columns)
- Title only (large title, empty content area)
- Section header (full-width colored background with large text)
- Image with caption (full-bleed image + caption text)
- Comparison (two side-by-side sections with headers)
- Agenda/outline (numbered list layout)

Each layout is a set of pre-positioned placeholder elements. When a layout is applied to an existing slide the user is asked whether to replace existing content or add layout elements on top.

**Slide masters (simplified):**
Support a single slide master — a background template applied to all slides. The slide master can contain: background color/image, a logo element (appears on every slide), a footer text element (appears on every slide). Elements on the slide master are not selectable in the normal editor — they appear behind all slide content. Access the slide master via a "Edit master" option in the three dots menu, which opens a special editing mode where only master elements are selectable.

---

## Phase 30 — Export pipeline

**PPTX export:**
Use `pptxgenjs` (MIT licensed) to generate PPTX files. Map the Prose slides data model to pptxgenjs API calls:

- Each Prose Slide becomes a `pptx.addSlide()`
- Text elements: `slide.addText()` with position/size in inches (convert from percentages using slide dimensions)
- Image elements: `slide.addImage()` with base64 data
- Shape elements: `slide.addShape()` mapping Prose shape types to pptxgenjs shape type constants
- Table elements: `slide.addTable()`
- Equation elements: render KaTeX to SVG, embed as image
- Code blocks: render as styled text with monospace font and background color
- Speaker notes: `slide.addNotes()`
- Slide backgrounds: `slide.background`
- Slide transitions: map to pptxgenjs transition options where available

Position conversion: pptxgenjs uses inches with a default slide size of 10×7.5 inches (4:3) or 13.33×7.5 inches (16:9). Convert percentage positions: `xInches = (xPercent / 100) * slideWidthInches`.

**PDF export:**
Use Puppeteer. For each slide: navigate a hidden Puppeteer page to a local renderer that renders the slide at full 1920×1080 resolution, screenshot it as a PNG, then compile all PNGs into a PDF using pdf-lib (MIT licensed) or embed via Puppeteer's PDF generation.

**PNG export:**
Single slide: render via Puppeteer screenshot at 1920×1080 (or 2x for retina quality). All slides: generate each PNG and bundle into a zip file using jszip (MIT licensed).

**PPTX import:**
Use `pptxgenjs` or a separate PPTX reading library to import existing `.pptx` files. Parse text boxes, images, and shapes into Prose's element format. Fidelity will not be 100% — complex PowerPoint features (animations, SmartArt, embedded charts) fall back to simplified representations. Show a "some elements may not have imported perfectly" notice after import. This feature is best-effort — do not promise perfect fidelity.

---

## Phase 31 — AI integration

AI for Slides is the most differentiated feature and must be implemented robustly. The AI panel for Slides has two tabs: **Assistant** (per-slide help) and **Generate** (bulk AI generation).

### Assistant tab — per-slide AI chips

These chips operate on the current slide's content:

**Write talking points** — reads all text content from the current slide, sends to Ollama, returns 4-6 bullet points suitable as speaker notes. Inserts the result directly into the speaker notes panel for the current slide with a confirmation prompt.

**Suggest title** — reads the body content of the current slide (excluding any element already identified as a title by position/size), suggests 3 title options. User clicks one to insert it into the title element or as a new text element.

**Improve text** — reads all text elements on the current slide, identifies wordiness or weak phrasing, suggests improvements. Displays in a diff-style view in the AI panel — old text vs suggested text — with accept/reject buttons per suggestion.

**Simplify slide** — if a slide has too much text, AI suggests which content to cut or condense to improve clarity. Returns a revised version of the slide text content.

**Suggest layout** — based on the content type of the current slide (text-heavy, image + caption, comparison, data), AI suggests a more appropriate layout and offers to apply it.

**Generate image description** — for slides that need a visual, AI describes what image would best complement the slide content. The description can be copied to use in an external image generator.

**Check consistency** — reads all slides and checks for: inconsistent font sizes across slides, slides that break the visual theme, text that contradicts earlier slides. Returns a list of issues with slide numbers.

### Generate tab — bulk AI generation

This is the high-impact, differentiated feature. The Generate tab has three modes:

**Mode 1 — Generate from outline:**
The user types or pastes an outline (bulleted list, numbered list, or free text). AI generates a complete presentation — one slide per major point, with title, body text, and speaker notes. The generation prompt instructs Ollama to return a structured JSON array of slide objects rather than prose, which Prose parses and converts to actual slides.

The system prompt for outline generation:
```
You are a presentation designer. Given an outline, generate a complete slide deck.
Return ONLY a JSON array with no preamble or explanation. Each object in the array represents one slide.

Schema for each slide object:
{
  "title": string,
  "layout": "title" | "title-content" | "two-column" | "section-header" | "image-caption",
  "content": string | string[] | { left: string[], right: string[] },
  "speakerNotes": string,
  "suggestedImageDescription": string | null,
  "backgroundColor": string | null
}

Rules:
- Title slide is always index 0 with layout "title"
- Section headers use layout "section-header" for major topic transitions
- Use "two-column" when comparing two things
- Keep body text concise — maximum 6 bullet points per slide, maximum 10 words per bullet
- Speaker notes should be 2-4 sentences elaborating on the slide content
- suggestedImageDescription should describe a specific, concrete image that would enhance the slide — or null if no image is needed
- backgroundColor is null to use the theme default, or a hex color for accent slides
```

After generation, show a preview of all generated slides in the AI panel before inserting. The user can regenerate, insert all, or select individual slides to insert.

**Mode 2 — Generate from document:**
The user picks any existing Prose Document from a file picker. AI reads the document's plain text content, identifies the main topics and structure, and generates a slide deck summarizing the document. Useful for turning an essay or report into a presentation. Uses the same JSON output format as Mode 1.

**Mode 3 — Generate single slide:**
The user types a description of what they want on the current slide. AI generates the content for that single slide — title, body text, layout suggestion, and speaker notes. Inserts directly into the current slide, replacing existing content after confirmation.

### AI graphic generation (advanced):

When a slide has a `suggestedImageDescription` from AI generation, show a small "Generate graphic" button on the slide in the panel. Clicking it opens a modal showing the suggested description (editable) and a "Generate" button. This calls Ollama with a prompt to generate an SVG illustration — not a raster image, but a clean vector graphic as SVG markup — that represents the description. Ollama returns SVG markup which Prose inserts as an SVG element on the slide.

SVG generation system prompt:
```
Generate a clean, simple SVG illustration for a presentation slide.
Return ONLY valid SVG markup starting with <svg. No explanation, no preamble.
Style: flat design, minimal, professional. Use these colors: {themeColors}.
The SVG should be 400x300 viewBox. Keep it simple — 5-15 shapes maximum.
Subject: {description}
```

Note: SVG generation quality depends heavily on the local model. Mistral 7B will produce basic geometric illustrations rather than complex graphics. Set user expectations clearly in the UI with a label like "AI illustration (experimental)" and show the raw SVG as editable text so users can refine it.

### AI implementation rules for Slides:

- All AI calls use the same Ollama infrastructure as other file types
- JSON parsing of AI responses must be wrapped in try/catch — if the response is not valid JSON, show an error state in the AI panel with a retry button, never crash
- Strip markdown code fences from AI responses before JSON parsing — Ollama sometimes wraps JSON in ```json blocks
- Cap generated presentations at 20 slides maximum to prevent context window overflow
- The full slide content sent to Ollama for per-slide analysis is constructed from plain text only — strip all element position/size data, send only title + body text + notes as a readable string
- Never send image base64 data to Ollama — images are not analyzed by the AI
- All AI-generated content is insertable but never automatically applied without user confirmation

---

## Phase 32 — Polish, accessibility, and edge cases

**Zoom:**
The slide canvas supports zoom from 25% to 400%. Ctrl+scroll changes zoom. Ctrl+0 resets to fit. Ctrl+1 sets to 100%. Show the current zoom percentage in the status bar. At zoom levels above 100%, the canvas becomes scrollable. Thumbnails in the slide panel always show at thumbnail size regardless of zoom.

**Grid and guides:**
An optional grid overlay on the canvas (toggle in three dots menu). Configurable grid size (default 20px at 100% zoom). Snap to grid when dragging if enabled. Smart guides: temporary alignment lines that appear during drag when an element's edge or center aligns with another element's edge or center — show these as thin blue lines.

**Find in presentation:**
Ctrl+F opens the same floating find widget as Documents but searches across all slides' text content. Each match highlights the element containing it and navigates to that slide. The match counter shows "3 of 12 across 4 slides."

**Slide duplication and reordering:**
Drag thumbnails in the slide panel to reorder. The drag uses the same drag-and-drop interaction as the existing system — show a ghost thumbnail at the cursor position and a blue line drop indicator between slides.

**Element alignment tools:**
When multiple elements are selected, the toolbar shows alignment buttons. Align left/center/right aligns relative to the leftmost/center/rightmost element. Align top/middle/bottom aligns relative to the top/middle/bottom element. Distribute horizontally/vertically spaces elements evenly between the outermost elements.

**Element grouping:**
Ctrl+G groups selected elements. A group behaves as a single element — it can be moved, resized, and rotated as a unit. Double-clicking a group enters the group and allows editing individual elements within it. Escape exits the group.

**Lock and visibility:**
Right-clicking an element shows "Lock element" (prevents selection and editing until unlocked) and "Hide element" (invisible in editor but hidden from presentation mode too — use for speaker-reference content). Locked elements show a lock icon when hovered. Hidden elements show as transparent outlines in the editor.

**Accessibility:**
- All interactive elements have appropriate ARIA labels
- Keyboard navigation through the slide panel (arrow keys to move between slides, Enter to select)
- Tab key cycles through elements on the current slide when in select mode
- High contrast mode respects the system's prefers-contrast media query

**Status bar for Slides:**
- Left: slide counter "Slide 3 of 12"
- Center: current slide's transition type if not none
- Right: music, session timer, save status (identical to all file types)

**Performance requirements:**
- The slide canvas must render at 60fps during drag operations — no layout recalculations during drag, use transform for position updates
- Thumbnail generation must not block the main thread — use requestIdleCallback or a Web Worker for html2canvas rendering
- Opening a Slides file with 50+ slides must complete initial render in under 2 seconds — lazy-load all thumbnails, only render the active slide immediately
- Undo/redo must be instantaneous — state replacement, not recomputation

**Security:**
- SVG content generated by AI must be sanitized before insertion — use DOMPurify (MIT licensed) to strip any script tags, event handlers, or external resource references from AI-generated SVG before rendering
- PPTX import: validate file size (reject files over 50MB), validate MIME type, extract content in a try/catch, never eval any content from imported files
- Speaker notes and slide text are user content — never log them
- AI prompts containing slide content are assembled in the renderer and sent to Ollama locally — no content leaves the machine

---

## Implementation order

Implement strictly in this order. Do not start a phase until the previous is verified working on actual Slides files.

1. Phase 21 — Study PPTist source, produce implementation plan
2. Phase 22 — File type registration and dashboard
3. Phase 23 — Data infrastructure, IPC, auto-save, undo/redo
4. Phase 24 — Slide canvas and element rendering
5. Phase 25 — Slide panel, toolbar, editor shell, speaker notes
6. Phase 26 — Text editing inside elements
7. Phase 27 — Shape library and element insertion
8. Phase 28 — Presentation mode
9. Phase 29 — Themes, templates, slide layouts
10. Phase 30 — Export pipeline (PPTX, PDF, PNG)
11. Phase 31 — AI integration (assistant chips, then generate tab, then SVG generation)
12. Phase 32 — Polish, zoom, grid, alignment, grouping, accessibility, performance

---

## Dependency additions

```
pptxgenjs          — PPTX export (MIT)
html2canvas        — slide thumbnail rendering (MIT)
jszip              — PNG export as zip (MIT)
dompurify          — SVG sanitization (MIT)
highlight.js       — code block syntax highlighting (BSD-3, compatible)
```

pdf-lib is already in the project. KaTeX is already in the project. Puppeteer is already in the project.

Do not add any other dependencies without explicit approval. If a feature can be implemented without a new dependency, do so.

---

## What Slides must feel like when complete

A student should be able to open Prose, create a new Slides file, paste their essay outline into the AI Generate tab, get a complete 10-slide presentation in 30 seconds, refine individual slides using the assistant chips, enter presentation mode to rehearse with speaker notes on a second screen, and export to PPTX to submit or present in class — all without internet, all from one app. That is the experience this spec is building toward.
