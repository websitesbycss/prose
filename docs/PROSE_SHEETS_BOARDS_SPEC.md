# Prose — Sheets and Boards Spec
## Phases 13–20

This document extends the existing Prose spec with two new file types: **Sheets** (spreadsheet editor) and **Boards** (infinite canvas workspace). It also specifies global AI system improvements that make the AI assistant work across all file types, not just Documents.

Read the existing `docs/SPEC.md` in full before implementing anything in this document. All code quality rules, security requirements, color/styling rules, and general architecture described there apply here without exception.

---

## Naming conventions — read this first

These conventions apply to every file, component, variable, and UI string in this spec and in all new code going forward.

**File** (generic, lowercase) — any `.prose` file regardless of type. A Document is a file. A Sheet is a file. A Board is a file. Use "file" wherever the statement applies to all three types. Example: "All files", "New file", "Delete file", `ProseFile`, `fileService`, `getFile`.

**Document** (specific type, capital D) — the rich text editor type. Notes, essays, lab reports, cover letters, and any other long-form writing live here. A Document is one kind of file. Example: "New Document", `type: 'document'`, `DocumentEditor`.

**Sheet** (specific type, capital S) — the spreadsheet editor type. Example: "New Sheet", `type: 'sheet'`, `SheetsEditor`.

**Board** (specific type, capital B) — the infinite canvas type. Example: "New Board", `type: 'board'`, `BoardEditor`.

**In the UI:** the dashboard header says "All files." The type filter pills say "Documents · Sheets · Boards." The new file button opens a type picker. File cards and tabs show the specific type name (Document, Sheet, or Board) never the generic word "file."

**In the codebase:** existing IPC handlers and components named with "document" generically (e.g. `documents.ts`, `DocumentCard.tsx`) are not renamed — they predate the suite and renaming them would break working code for no user-facing gain. All new code going forward follows the conventions above. New generic file-level operations use `file` naming. New type-specific operations use `Document`, `Sheet`, or `Board` naming.

**In the `.prose` file format:** the `type` field uses lowercase strings: `'document'`, `'sheet'`, `'board'`.

---

## Suite architecture overview

Prose is a writing and productivity suite with three file types. The Document editor is a general-purpose rich text editor — not an essay-only tool. It handles notes, essays, lab reports, letters, reports, and any other long-form writing. This spec adds Sheets and Boards alongside it.

All three file types share:
- The same `.prose` file format and file service
- The same SQLite index
- The same tab system
- The same music player, pomodoro timer, and session stats
- The same settings system
- The same export pipeline (where applicable)
- The same AI infrastructure (Ollama, prompt construction, IPC)

Each file type has its own:
- Editor component rendered when the file is opened
- Toolbar
- AI panel configuration and chip actions
- Export options

---

## Global AI improvements (implement before Sheets and Boards)

### Phase 13 — AI system refactor: cross-type awareness

The current AI assistant is scoped to Document analysis. Before building Sheets and Boards, the AI system needs to be refactored to be file-type-aware so it can serve all three types well.

**What changes:**

The AI panel component currently assumes it is always working with a Document. Refactor it to accept a `fileType` prop and render the appropriate chip set and system prompt for each type. The Chat tab and free-form input work identically across all types — only the suggestion chips and system prompt change.

**Type-specific chip sets:**

Document chips (existing, keep as-is — these apply to all Documents regardless of whether the content is an essay, notes, a report, or anything else):
- Strengthen thesis
- Check argument
- Suggest transition
- Improve clarity
- Reading level
- Analyze on demand

Sheet chips (new):
- Explain formula — explain the formula in the selected cell in plain English
- Suggest formula — user describes what they want to calculate, AI writes the formula
- Find errors — scan the Sheet for common formula errors, broken references, or logical inconsistencies
- Summarize data — describe what the data in the Sheet shows in plain English
- Generate data — given a description, populate a range with example data

Board chips (new):
- Summarize board — describe all files and notes on the Board and their relationships
- Suggest connections — identify files on the Board that should be connected with arrows based on their content
- Find gaps — identify topics or ideas missing from the Board based on the files present

**Global AI chat:**

Add a global AI chat accessible from the title bar or a keyboard shortcut that is not scoped to any single file. This global chat has access to the index of all files (titles, types, formats, word counts, categories) and can answer questions like "which of my Documents needs the most work," "summarize all my English category files," or "what did I work on last week." It does not read full file content unless the user explicitly asks about a specific file — it uses the index metadata only for performance. The global chat lives in a floating panel that can be opened from anywhere in the app regardless of which file type is open.

**Implementation rules:**
- The AI panel component must not contain any file-type-specific logic directly — all chip definitions, system prompts, and context builders must live in a dedicated `aiConfig.ts` file with a separate export per type
- The Ollama call parameters (temperature, top_p, repeat_penalty, num_predict, stop sequences) remain identical across all types
- The issue budget calculation (one issue per 70 words, severity split) only applies to Documents — do not apply it to Sheets or Boards
- The global chat uses a separate Ollama conversation history stored in memory for the session, not persisted
- The Document AI chip labels are kept as-is — they apply naturally to any argumentative or structured writing, not just formal essays

---

## Phase 14 — Suite dashboard updates

Before building Sheets or Boards, the dashboard needs updates to support all three file types clearly.

**Dashboard header and labels:**
- The sidebar heading currently says "All documents" — change to "All files"
- The pinned section label stays "Pinned" — this is fine as-is
- The hero card "Continue writing" label stays — it applies to Documents. For Sheets show "Continue editing." For Boards show "Continue mapping."
- Document count labels in the sidebar category list stay as-is — they count files not just Documents

**File type icons:**
Each file type gets a distinct icon used consistently in the file list, cards, tabs, and type picker:
- Document: existing text document icon
- Sheet: a grid/table icon
- Board: a canvas or layout icon

**Type filter:**
Add a type filter row below the sort tabs — small pill buttons for All, Documents, Sheets, Boards. Selecting a type filters the file list to show only that type. "All" is selected by default. These persist as a UI preference in Zustand, not saved to settings.

**New file button:**
The existing "New document" button becomes "New file" and opens a type picker showing the three file types with icons and descriptions:
- **Document** — "Write anything. Notes, essays, reports, letters, or any long-form text."
- **Sheet** — "Organize data, run calculations, and analyze numbers."
- **Board** — "Map your ideas, files, and notes on an infinite canvas."

Selecting a type proceeds to that type's creation flow. Document creation is identical to the existing new document modal. Sheet creation asks only for a title. Board creation asks only for a title.

**File list display:**
The file list and cards currently show word count for all files. Adapt the count label per type:
- Document: "N words" (existing)
- Sheet: "N cells" (total non-empty cells)
- Board: "N elements" (total shapes and cards)

**Dashboard tab bar:**
Tabs for Sheets show the grid icon. Tabs for Boards show the canvas icon. Tabs for Documents show the document icon. All other tab behavior — truncation, close button, middle-click-to-close, unsaved indicator — works identically across all types.

**No other dashboard changes.** The hero card, list view, pinned section, category sidebar, search, and sort all work identically for all file types.

---

## Phase 15 — Sheets: data model and file service

Before building the Sheets UI, define the data model and ensure the file service handles it correctly.

**Sheet data stored in the `content` field of the `.prose` file:**

The content field for a Sheet stores the full spreadsheet state as a JSON object. Design this schema yourself based on what Handsontable requires for serialization. It must support:
- Cell values (strings, numbers, booleans, null)
- Cell formulas (strings starting with `=`)
- Cell formatting per cell: bold, italic, font size, text color, background color, horizontal alignment, text wrap
- Column widths as an array of numbers
- Row heights as an array of numbers
- Merged cell ranges as an array of range objects
- Sheet tab name (the label at the bottom of each tab)
- Multiple sheet tabs — support at least 3 tabs per Sheet file, each with its own data and formatting

The `format` field on Sheet files is always `'none'` — Sheets do not have MLA/APA/Chicago formatting. Do not show the format badge for Sheet files on the dashboard.

**File service:**
The existing file service handles Sheet files identically to Document files — same atomic write, same path resolution, same import/export. No changes needed to the file service itself beyond ensuring it does not assume `content` is Tiptap JSON.

---

## Phase 16 — Sheets: editor implementation

**Library choice:**
Use Handsontable Community Edition with `@handsontable/react`. It has TypeScript support, is MIT licensed for open source projects, and is the most capable spreadsheet library in the JS ecosystem. Install `handsontable`, `@handsontable/react`, and `hyperformula`.

**Editor component:**
Create `src/components/sheets/SheetsEditor.tsx`. When a file of type `sheet` is opened in the tab system, render this component instead of the Document editor. The Sheet editor fills the full content area edge to edge — no page canvas, no page margins, no header/footer zones.

**Handsontable configuration:**
- Formula support via HyperFormula: `formulas: { engine: HyperFormula }`
- Supported formulas at minimum: SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, IFS, AND, OR, NOT, VLOOKUP, HLOOKUP, INDEX, MATCH, CONCATENATE, LEN, LEFT, RIGHT, MID, UPPER, LOWER, TRIM, ROUND, FLOOR, CEILING, ABS, MOD, POWER, SQRT, PI, TODAY, NOW, DATE, YEAR, MONTH, DAY
- Column resize, row resize, merge cells, custom borders, and undo/redo all enabled
- Context menu enabled with standard options plus Prose-specific additions (described below)
- Dark theme: override Handsontable's CSS variables to match Prose's dark background, border colors, and text colors using the app's existing CSS variables. The grid must feel native to Prose's design — not like an embedded foreign widget
- Cell selection uses the primary blue accent color

**Sheets toolbar:**
When a Sheet is open replace the Document toolbar with a Sheet-specific toolbar containing:
- Font family selector
- Font size selector
- Bold, italic, underline buttons
- Text color picker, background color picker
- Separator
- Align left, center, right buttons
- Wrap text toggle
- Separator
- Merge cells toggle button
- Separator
- Insert row above, insert row below, insert column left, insert column right
- Delete row, delete column
- Separator
- Formula bar — a wide input showing the selected cell's address (e.g. "A1") on the left and its formula or value on the right, editable inline, commits on Enter or Tab
- Sheet tab bar at the bottom of the editor (not the main toolbar) — shows tab names, supports double-click to rename, has an add tab button and right-click to delete or rename

**Context menu additions:**
- "Explain this formula" — sends the selected cell's formula to the AI panel
- "Generate formula for this column" — opens a small popover input where the user describes what they want, AI generates and inserts the formula

**Auto-save:**
Wire Handsontable's `afterChange`, `afterCreateRow`, `afterCreateCol`, `afterRemoveRow`, `afterRemoveCol`, `afterMergeCells`, `afterUnmergeCells`, and `afterColumnResize` hooks to trigger the existing auto-save debounce. Serialize using `hotInstance.getData()` combined with formatting and structural metadata. Deserialize on open using `hotInstance.loadData()` then restore formatting.

**Export:**
- XLSX via SheetJS — full Sheet including formulas, formatting, multiple tabs
- CSV — active tab only, no formatting
- PDF — via Puppeteer with a print-optimized grid stylesheet

---

## Phase 17 — Sheets: AI integration

The AI panel works in Sheet mode with the Sheet-specific chips from Phase 13.

**Context construction — never send raw grid JSON:**
- Explain formula: cell address and formula string only
- Suggest formula: column headers (row 1), surrounding data structure description, user's description
- Find errors: cell address + formula + calculated value for all formula cells, max 50 cells
- Summarize data: column headers + up to 20 rows as a markdown table
- Generate data: column headers + description of what to generate

**Formula insertion:**
When AI suggests a formula, render it in the AI panel with monospace font and a subtle background highlight. Show an "Insert" button that inserts the formula into the currently selected cell.

---

## Phase 18 — Boards: data model and infrastructure

**Library choice:**
Use tldraw. It is open source, built in React, and handles infinite canvas, pan/zoom, built-in shapes, sticky notes, arrows, selection, resize, and undo/redo. Install `tldraw` and import its CSS.

**Board data stored in the `content` field of the `.prose` file:**
Store the tldraw snapshot using `editor.store.getSnapshot()` to serialize and `editor.store.loadSnapshot()` to deserialize.

The `format` field on Board files is always `'none'`. Do not show a format badge for Board files on the dashboard.

The index stores Board files with `word_count` equal to the total number of elements on the Board. The dashboard shows "N elements" for Board files.

**Custom shape types:**

`ProseFileCard` — represents any linked Prose file on the Board. Stores a `fileId` and `fileType` reference. Displays the file title, type badge (Document / Sheet / Board), format badge if applicable, element/word/cell count, category color dot, and a 80-character plain text preview for Documents. Has a dark card style matching the dashboard file cards. Double-clicking opens the file in a new tab. Works for all three file types — a Board can contain cards for Documents, Sheets, and other Boards.

`ProseStickyNote` — styled sticky note matching Prose's design system. Available in the app's accent color palette. Supports inline text editing on double-click.

---

## Phase 19 — Boards: editor implementation

**Board editor component:**
Create `src/components/boards/BoardEditor.tsx`. Fills the full content area with no page canvas or margins.

**tldraw configuration:**
- Dark mode with CSS token overrides matching Prose's exact colors
- Dot grid background at low opacity matching the app's dark aesthetic
- Custom shape utils for `ProseFileCard` and `ProseStickyNote`
- tldraw's default toolbar hidden — replaced with the Prose boards toolbar below
- tldraw's default menu bar disabled
- Undo/redo wired through the existing ShortcutManager

**Boards toolbar:**
- Tool selector: Select (V), Hand (H), Draw (P), Rectangle (R), Ellipse (O), Arrow (A), Text (T), Sticky note (S)
- Separator
- Style controls when an element is selected: fill color, stroke color, stroke width, opacity, font size
- Separator
- "Add file" button — opens a searchable popover listing all Prose files from the index (Documents, Sheets, and Boards), clicking one adds a `ProseFileCard` to the center of the current viewport
- Separator
- Zoom controls: zoom in, zoom out, fit to screen, zoom percentage — also controllable via Ctrl+scroll

**Adding files to the Board:**
Three methods:
1. Toolbar "Add file" button
2. Dragging a file from the dashboard sidebar onto an open Board tab
3. Right-clicking the canvas and choosing "Add file"

When a `ProseFileCard` is added, fetch the file's title, type, format, count metric, and preview text via IPC and store as shape props. Props are not live-synced. A "Refresh" context menu option updates them to the current file state.

**Board context menu — canvas background:**
- Add file
- Add sticky note
- Add text
- Separator
- Paste, Select all
- Separator
- Fit to screen

**Board context menu — ProseFileCard:**
- Open file (new tab)
- Refresh card
- Duplicate
- Delete
- Separator
- Bring to front, Send to back

**Board context menu — ProseStickyNote:**
- Edit text
- Change color
- Duplicate
- Delete

**Auto-save:**
Debounce tldraw's `change` event at 1 second and call the existing auto-save IPC handler with the serialized snapshot.

**Export:**
- PNG — full board or current viewport via tldraw's `exportToBlob`
- PDF — PNG embedded in PDF via Puppeteer
- No DOCX or Markdown — not applicable

---

## Phase 20 — Boards: AI integration

**Context construction:**
Collect all `ProseFileCard` shapes on the Board and send their titles, types, formats, categories, and preview text as a structured list. Never send full file content — 80-character previews only.

**Summarize board:**
Sends: file count by type, category breakdown, 80-character previews of all cards. Returns: a 3-4 sentence description of what the Board represents and what stage of work it appears to be at.

**Suggest connections:**
Sends: titles and previews of all `ProseFileCard` elements. Returns: pairs of files whose content appears related with a brief explanation. Display as a list in the AI panel with an "Add arrow" button per pair that programmatically creates a tldraw arrow between the two cards using their positions from the shape store.

**Find gaps:**
Sends: titles, types, previews of all file cards plus text content of all sticky notes. Returns: a short bulleted list of topics or material that appear to be missing based on what is present.

**Implementation rules:**
- Board AI is always triggered manually — never automatically on save
- The "Add arrow" button uses tldraw's arrow shape API, finding cards by matching `fileId` in shape props, not by title string matching

---

## UX improvements across all file types

**Status bar:**
- Document open: word count, format badge, music, session timer, save status (existing)
- Sheet open: cell count ("N cells"), no format badge, music, session timer, save status
- Board open: element count ("N elements"), no format badge, music, session timer, save status

**Session stats panel:**
- Document: tracks words written (existing)
- Sheet: tracks cells edited
- Board: tracks elements added
- Pomodoro, streak, and session duration work identically on all types

**Keyboard switcher:**
Ctrl+K shows all files regardless of type, with type icons distinguishing Documents, Sheets, and Boards in the list.

**Tab unsaved indicator:**
- Document: fires on Tiptap `update` (existing)
- Sheet: fires on Handsontable `afterChange`
- Board: fires on tldraw `change`

**Settings modal:**

Add a **Sheets** section:
- Default font family for new Sheets
- Default font size for new Sheets
- Show formula bar (toggle, default on)
- Show grid lines (toggle, default on)

Add a **Boards** section:
- Default background: dot grid or plain dark
- Snap to grid (toggle, default off)
- Default sticky note color

---

## Implementation order

Implement strictly in this order. Do not start a phase until the previous is verified working.

1. Phase 13 — AI system refactor
2. Phase 14 — Dashboard and naming updates
3. Phase 15 — Sheets data model
4. Phase 16 — Sheets editor
5. Phase 17 — Sheets AI
6. Phase 18 — Boards data model
7. Phase 19 — Boards editor
8. Phase 20 — Boards AI
9. UX improvements — implement incrementally as each phase is built

---

## Security checklist additions

All existing security requirements from the main spec apply. Additionally:

- HyperFormula formula evaluation runs entirely client-side — no formula values are sent to any external service
- tldraw snapshots may contain arbitrary user text from sticky notes — never log snapshot content
- File preview text in `ProseFileCard` props must be sanitized before rendering in the custom shape component to prevent XSS
- All new IPC handlers validate and sanitize inputs before processing — follow the same pattern as existing handlers

---

## Dependency additions

```
handsontable
@handsontable/react
hyperformula
tldraw
```

SheetJS (`xlsx`) and Puppeteer are already in the project.
