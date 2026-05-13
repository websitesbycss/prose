# Prose — Claude Code Specification

## Project overview

Prose is a fully offline, open source desktop essay writing application for Windows built with Electron. It ships with a local LLM (via Ollama) so every feature — including AI assistance — works without an internet connection after the initial one-time model download. There is no account, no server, no telemetry, and no user data ever leaves the machine. It is free and open source.

The target user is a student who wants a focused, distraction-free writing environment with built-in AI feedback, MLA/APA formatting, a citation engine, focus music, and a Pomodoro timer — all in one app that works on a plane.

---

## Code quality requirements

These requirements apply to every single file in the project without exception. They are not suggestions.

- **No AI tells.** Code must read as if written by a careful, experienced human developer. No filler comments like `// This function handles X`. No obvious variable names like `handleButtonClick`. No unnecessary abstractions. No over-engineered patterns for simple problems.
- **Comments only where genuinely needed.** A comment should explain *why*, never *what*. If the code is readable, it needs no comment.
- **Consistent naming conventions throughout.** camelCase for variables and functions, PascalCase for components and types, SCREAMING_SNAKE_CASE for constants. Never mix conventions.
- **No dead code.** No commented-out blocks, unused imports, or placeholder functions left in.
- **TypeScript strictly.** `strict: true` in tsconfig. No `any` types. Every function has explicit return types. Every prop interface is defined.
- **Small, focused functions.** If a function exceeds ~40 lines, it should be broken up. Single responsibility.
- **No magic numbers or strings.** All constants live in a dedicated `constants.ts` file.
- **Error handling everywhere.** Every async operation has a try/catch. Errors are logged with context, never swallowed silently.
- **Security first in Electron.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` in all BrowserWindow instances. All IPC handlers validate and sanitize inputs before processing. The renderer never has direct Node.js access.
- **No logging of user content.** Logs may include operation names and error codes but never document titles, document content, or any user-authored text.

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Desktop shell | Electron | Latest stable |
| Bundler | electron-vite | Latest stable |
| UI framework | React | 18 |
| Language | TypeScript | 5 |
| Styling | Tailwind CSS | Latest stable |
| UI components | shadcn/ui | Latest stable |
| Animations | Motion (Framer Motion) | Latest stable |
| Global state | Zustand | Latest stable |
| Notifications | Sonner | Latest stable |
| UI font | Geist | Latest stable |
| Rich text editor | Tiptap | 2 |
| Local database | better-sqlite3 | Latest stable |
| Local LLM | Ollama (bundled binary) | Latest stable |
| Export — DOCX | docx | Latest stable |
| Export — PDF | electron-pdf or puppeteer | Latest stable |
| Citation metadata | crossref REST API (online) / local fallback | — |
| Packaging | electron-builder | Latest stable |
| Code quality | ESLint + Prettier | Latest stable |

---

## UI library usage guidelines

These rules tell Claude Code exactly how to use the UI libraries. Follow them in every component without exception.

### shadcn/ui

Use shadcn/ui for all UI components. This means every button, dropdown, modal/dialog, input, select, slider, tooltip, popover, separator, badge, and scroll area in the app must come from shadcn/ui — never hand-rolled from scratch.

Install components individually via the shadcn CLI as they are needed during each phase. Do not install the entire library at once.

The shadcn/ui theme must be customized to match Prose's dark-first aesthetic. In `globals.css`, define a custom theme using CSS variables. The primary accent color throughout the app is purple (`#7F77DD` light, `#AFA9EC` muted). Dark mode is the default. Use the `zinc` base color from shadcn as the neutral foundation.

All shadcn components must use the `new-york` style variant — it has sharper, more editorial aesthetics than the default style which suits a writing app better.

Dark mode is toggled by adding/removing the `dark` class on the `<html>` element. The current theme is stored in Zustand and persisted to SQLite settings. On app launch, the theme class is applied before React renders to prevent a flash of incorrect theme.

### Motion (Framer Motion)

Use Motion for transitions that make the app feel polished. Apply it selectively — not on every element, only where animation genuinely improves the experience.

Required animation uses:
- AI panel sliding in/out from the right (`x` transform, `AnimatePresence`)
- Music panel appearing above the status bar (scale + opacity)
- Pomodoro panel and outline panel expanding/collapsing in the sidebar
- Focus mode transition — fade out chrome elements, expand editor canvas
- Document cards on the dashboard — subtle fade-in on mount using `staggerChildren`
- Modal/dialog entrance — shadcn's Dialog can be wrapped with Motion for a scale + fade entrance
- Settings modal slide-up entrance

Rules for Motion usage:
- All animations must use `transform` and `opacity` only — never animate `width`, `height`, `top`, `left`, or `margin` as these trigger layout reflow and cause jank
- Duration for UI micro-interactions: 150–200ms. Panel slides: 250ms. Modal entrances: 200ms. Never exceed 350ms for any UI animation.
- Use `ease: [0.25, 0.1, 0.25, 1]` (ease-in-out cubic) as the default easing curve
- Wrap conditionally rendered animated elements in `AnimatePresence` so exit animations play correctly
- Never use Motion on the editor canvas itself or on Tiptap content — the editor handles its own rendering

### Zustand

One store file: `src/store/appStore.ts`. Do not create multiple store files.

The store manages:
- `currentDocumentId: string | null` — which document is open in the editor
- `theme: 'dark' | 'light'` — current theme
- `sidebarOpen: boolean` — left sidebar expanded or collapsed
- `aiPanelOpen: boolean` — right AI panel visible or hidden
- `musicPanelOpen: boolean` — music panel floating panel visible
- `focusModeActive: boolean` — focus mode state
- `pomodoroState` — current timer state (running, paused, idle, break), time remaining, session count
- `ollamaStatus: 'ready' | 'loading' | 'unavailable'` — AI availability indicator

Do not put document content or document list data in Zustand — those come from IPC calls and are managed with local component state or React Query if needed. Zustand is for UI state only.

### Sonner

Place the `<Toaster />` component once in `App.tsx`. Use the `dark` theme prop on `<Toaster />` that mirrors the current app theme from Zustand.

Use `toast.success()`, `toast.error()`, and `toast.loading()` / `toast.dismiss()` for async operations. Keep toast messages short — maximum 5 words. Examples: "Saved", "Exported to DOCX", "Model ready", "Export failed".

Never show a toast for auto-save — that is communicated silently via the status bar only.

### Geist font

Load Geist Sans and Geist Mono via `@fontsource/geist-sans` and `@fontsource/geist-mono` npm packages — do not load from Google Fonts or any CDN since the app is offline.

Apply Geist Sans as the default UI font via Tailwind's `fontFamily.sans` config. Apply Geist Mono to any monospace contexts.

The essay editor canvas itself uses the document's selected font (Times New Roman, Georgia, etc.) — Geist is for the app UI chrome only, never the editor content area.

---

## Project structure

```
prose/
├── electron/
│   ├── main/
│   │   ├── index.ts              # App entry, window creation
│   │   ├── ipc/
│   │   │   ├── documents.ts      # Document CRUD handlers
│   │   │   ├── ai.ts             # Ollama prompt handlers
│   │   │   ├── export.ts         # DOCX/PDF/MD export handlers
│   │   │   └── settings.ts       # App settings handlers
│   │   ├── services/
│   │   │   ├── database.ts       # SQLite connection and migrations
│   │   │   ├── ollama.ts         # Ollama process manager
│   │   │   ├── exporter.ts       # Export logic
│   │   │   └── citations.ts      # Citation fetch and format logic
│   │   └── preload/
│   │       └── index.ts          # Secure contextBridge API
├── src/
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DocumentCard.tsx
│   │   │   └── NewDocumentModal.tsx
│   │   ├── editor/
│   │   │   ├── Editor.tsx
│   │   │   ├── Toolbar.tsx
│   │   │   ├── AiPanel.tsx
│   │   │   ├── MusicPanel.tsx
│   │   │   ├── PomodoroPanel.tsx
│   │   │   ├── OutlinePanel.tsx
│   │   │   └── StatusBar.tsx
│   │   └── onboarding/
│   │       ├── Welcome.tsx
│   │       └── ModelDownload.tsx
│   ├── hooks/
│   │   ├── useDocument.ts
│   │   ├── useAi.ts
│   │   ├── usePomodoro.ts
│   │   └── useWordCount.ts
│   ├── store/
│   │   └── appStore.ts           # Zustand global state
│   ├── types/
│   │   └── index.ts              # All shared TypeScript types
│   ├── constants.ts
│   ├── App.tsx
│   └── main.tsx
├── assets/
│   └── sounds/                   # Bundled ambient audio loops
│       ├── rain.mp3
│       ├── fireplace.mp3
│       ├── cafe.mp3
│       ├── whitenoise.mp3
│       ├── brownnoise.mp3
│       └── lofi-jazz-1.mp3
├── resources/
│   └── ollama/                   # Bundled Ollama binary (Windows)
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Data models

### Document

```typescript
interface Document {
  id: string;                      // UUID v4
  title: string;
  content: string;                 // Tiptap JSON serialized as string
  format: 'none' | 'mla' | 'apa' | 'chicago' | 'ieee';
  wordCountGoal: number | null;
  createdAt: string;               // ISO 8601
  updatedAt: string;               // ISO 8601
  categoryId: string | null;
}
```

### Category

```typescript
interface Category {
  id: string;
  name: string;
  color: string;                   // Hex color string
  createdAt: string;
}
```

### Citation

```typescript
interface Citation {
  id: string;
  documentId: string;
  type: 'book' | 'article' | 'website' | 'journal';
  fields: Record<string, string>;  // Author, title, year, URL, etc.
  formatted: {
    mla: string;
    apa: string;
    chicago: string;
    ieee: string;
  };
  createdAt: string;
}
```

### AppSettings

```typescript
interface AppSettings {
  theme: 'dark' | 'light';
  defaultFormat: Document['format'];
  wordCountExcludesHeader: boolean;
  defaultWordCountGoal: number | null;
  ollamaModel: string;
  pomodoroWorkMinutes: number;
  pomodoroBreakMinutes: number;
  musicVolume: number;             // 0–100
  ambientVolumes: Record<string, number>;
  typewriterMode: boolean;
  editorFontFamily: string;
  editorFontSize: number;
}
```

### SQLite schema

```sql
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'none',
  word_count_goal INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#7F77DD',
  created_at TEXT NOT NULL
);

CREATE TABLE citations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  fields TEXT NOT NULL,            -- JSON string
  formatted TEXT NOT NULL,         -- JSON string
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

---

## IPC API (preload → main)

All IPC calls are exposed via `contextBridge` in `preload/index.ts` as `window.prose`. The renderer never calls `ipcRenderer` directly.

### Documents

```typescript
window.prose.documents.getAll(): Promise<Document[]>
window.prose.documents.getById(id: string): Promise<Document | null>
window.prose.documents.create(data: CreateDocumentInput): Promise<Document>
window.prose.documents.update(id: string, data: UpdateDocumentInput): Promise<Document>
window.prose.documents.delete(id: string): Promise<void>
```

### Categories

```typescript
window.prose.categories.getAll(): Promise<Category[]>
window.prose.categories.create(data: CreateCategoryInput): Promise<Category>
window.prose.categories.update(id: string, data: UpdateCategoryInput): Promise<Category>
window.prose.categories.delete(id: string): Promise<void>
```

### AI

```typescript
window.prose.ai.prompt(payload: AiPromptPayload): Promise<string>
window.prose.ai.getStatus(): Promise<OllamaStatus>
window.prose.ai.streamPrompt(payload: AiPromptPayload, onChunk: (chunk: string) => void): Promise<void>
```

### Export

```typescript
window.prose.export.toDocx(id: string): Promise<void>
window.prose.export.toPdf(id: string): Promise<void>
window.prose.export.toMarkdown(id: string): Promise<void>
window.prose.export.toPlainText(id: string): Promise<void>
```

### Citations

```typescript
window.prose.citations.getByDocument(documentId: string): Promise<Citation[]>
window.prose.citations.create(data: CreateCitationInput): Promise<Citation>
window.prose.citations.delete(id: string): Promise<void>
window.prose.citations.fetchByDoi(doi: string): Promise<CitationFields | null>
window.prose.citations.fetchByUrl(url: string): Promise<CitationFields | null>
```

### Settings

```typescript
window.prose.settings.get(): Promise<AppSettings>
window.prose.settings.set(data: Partial<AppSettings>): Promise<void>
```

### Ollama

```typescript
window.prose.ollama.getDownloadStatus(): Promise<DownloadStatus>
window.prose.ollama.startDownload(): Promise<void>
window.prose.ollama.onDownloadProgress(callback: (progress: DownloadProgress) => void): void
```

---

## Screens and behavior

### Screen 1 — First launch / onboarding

Shown only once, on first ever launch. Two steps:

**Step 1 — Welcome**
- App name and a single sentence describing what it is
- "Get started" button proceeds to step 2

**Step 2 — Model download**
- Explains the one-time download clearly: model name, size (~4GB), and that it never happens again
- "Download now" button starts the Ollama pull
- Shows a progress bar with percentage and download speed
- Handles errors gracefully: if download fails, shows a retry button with the specific error reason
- On completion, transitions directly to the dashboard
- Do not allow skipping — the AI features are core to the app

### Screen 2 — Dashboard

The home screen. Shows all documents in a grid of cards.

**Header:**
- App logo/name left
- New document button right
- Search input that filters documents by title in real time

**Sidebar:**
- "All documents" default view
- List of user-created categories, each with its color dot
- "Uncategorized" filter
- Settings link at bottom

**Document cards:**
- Title
- Last edited date, formatted as relative time ("2 hours ago")
- Word count
- Format badge (MLA / APA / etc.) if set
- Category color indicator
- On hover: edit, download, delete icon buttons appear
- Click card body to open in editor

**Empty state:**
- When no documents exist, show a centered prompt with a "Create your first document" button
- When search returns nothing, show "No documents match that search"

**New document modal:**
- Title input (required)
- Category selector (optional)
- Format selector: None, MLA, APA, Chicago, IEEE
- If MLA or APA selected, show inputs for: student name, instructor name, course name — these pre-populate the header on creation
- Create button

### Screen 3 — Editor

The main writing screen. Three-column layout: left sidebar, editor canvas, right AI panel.

**Title bar (top):**
- Back arrow to dashboard (auto-saves before navigating)
- Document title — click to rename inline
- Format indicator badge
- Theme toggle: Light / Dark
- Focus mode button

**Toolbar (below title bar):**
- Font family selector (Georgia, Times New Roman, Arial, Helvetica, Courier New)
- Font size selector (10, 11, 12, 14, 16, 18, 24, 36)
- Paragraph style selector (Paragraph, Heading 1, Heading 2, Heading 3)
- Separator
- Bold, Italic, Underline, Strikethrough buttons
- Font color picker
- Separator
- Align left, center, right buttons
- Separator
- Bullet list, Numbered list buttons
- Indent, Outdent buttons
- Separator
- Insert image button (opens file picker, accepts webp/png/jpg/jpeg)
- Insert hyperlink button
- Insert table button
- Separator
- MLA button — applies MLA template to current document
- APA button — applies APA template to current document
- Separator
- Music icon button — opens music panel
- Citation icon button — opens citation manager

**Left sidebar (collapsible, 42px collapsed / 220px expanded):**
- Outline panel: shows H1/H2/H3 headings extracted from document in a tree, click to scroll to heading
- Pomodoro panel: timer display, start/pause/reset, session counter, configurable work and break durations
- Comments panel: reserved for future use, show "Coming soon" placeholder
- Settings icon at bottom: opens app settings modal

**Editor canvas:**
- White page (dark gray in dark mode) centered with realistic page margins
- MLA header pre-populated when MLA format is active: student name, instructor, course, date — each on its own line, double spaced, Times New Roman 12pt
- Page header showing "LastName PageNumber" top right when MLA is active
- Essay title centered below header when MLA is active
- First paragraph auto-indented
- All text double spaced when MLA or APA format is active
- Typewriter mode: when enabled, the viewport scrolls so the active line always sits at vertical center
- Auto-list formatting: typing `1.` + space converts to numbered list, `-` + space converts to bullet list, Backspace on empty list item exits the list
- Images render inline, resizable by dragging corners
- Hyperlinks render as styled anchor text, Ctrl+click to open in system browser
- Tables render with visible borders, cells are editable, right-click on table shows context menu for adding/removing rows and columns
- Auto-save: debounced 1 second after last keystroke, saves to SQLite silently
- Manual save: Ctrl+S, shows brief "Saved" confirmation in status bar

**Right AI panel (220px, collapsible):**
- Header: "AI assistant" with a subtle active indicator dot when Ollama is running
- Context input: a small collapsed section labeled "Assignment context" — user can paste their assignment prompt here, it is included in every AI request for this document but never logged or stored beyond the session
- Suggestion chips (always visible, contextual):
  - Strengthen thesis
  - Check paragraph focus
  - Suggest transition
  - Improve clarity
  - Check argument
  - Reading level analysis
- Each chip sends the full document content + chip action as a prompt to Ollama
- Responses stream token by token into a response area below the chips
- Free-form input at bottom: user can type any question about their document
- All AI requests include the full current document content as context
- Thesis awareness: the AI automatically identifies the thesis from the document without the user needing to flag it

**Status bar (bottom):**
- Left: word count (excluding MLA/APA header and title when `wordCountExcludesHeader` is true), word count goal progress ring if goal is set
- Center: document format label
- Right: music status ("Lo-fi Jazz · playing" or "No music"), session timer, auto-save status

**Music panel (opens as floating panel above status bar, anchored bottom-right):**

Two tabs: Tracks and Mixer.

Tracks tab:
- Curated track list organized by category (Lo-fi Jazz, Ambient, Classical Focus)
- Currently playing track shows animated equalizer bars
- Play/pause, skip forward, skip back controls
- Progress scrubber
- Volume slider

Mixer tab:
- Independent ambient sound layers: Rain, Fireplace, Café noise, White noise, Brown noise
- Each layer has a toggle (on/off) and a volume slider
- Layers mix on top of whichever track is playing
- Settings persist in AppSettings

**Focus mode:**
- Triggered by toolbar button or F11
- Hides title bar, toolbar, left sidebar, right AI panel, and status bar
- Shows only the editor canvas centered on screen
- Thin top bar remains with just the exit focus mode button and music controls
- Pressing Escape exits focus mode

**Citation manager (opens as slide-in panel from right, replaces AI panel):**
- List of citations added to this document
- "Add citation" button opens a modal with:
  - Citation type selector: Book, Journal article, Website, Other
  - URL input with "Auto-fill" button that fetches metadata and populates fields
  - DOI input with "Look up" button that queries crossref.org API
  - Manual fields: Author(s), Title, Year, Publisher/Journal, URL, Pages, Volume, Issue
  - Preview showing formatted citation in MLA, APA, Chicago, IEEE simultaneously
  - Save button adds to document citations list
- "Insert Works Cited" button appends a formatted Works Cited / References section to the end of the document in the active format
- Individual citations can be deleted

### Settings modal

Accessible from sidebar settings icon. Sections:

- **Appearance:** theme toggle, editor font family default, editor font size default
- **Writing:** default format, word count excludes header toggle, default word count goal input
- **AI:** Ollama model selector (shows available downloaded models), re-download model button
- **Focus music:** default music track, default ambient mix
- **Pomodoro:** work duration (minutes), break duration (minutes), auto-start break toggle
- **About:** app version, GitHub link, open source license info

---

## Ollama integration

The main process manages the Ollama subprocess entirely. The renderer knows nothing about Ollama directly.

**Startup sequence:**
1. App launches
2. Main process checks if Ollama binary exists in resources
3. If model is downloaded, spawns Ollama as a child process on `localhost:11434`
4. Waits for Ollama to be ready before enabling AI features in the renderer
5. If model is not downloaded, AI features show a "Download model to enable AI" state

**Prompt construction for AI features:**

Every AI request includes:
```
System: You are a writing assistant embedded in an essay editor. You give concise, 
specific, actionable feedback. You never write the essay for the user. You respond 
in 2-4 sentences unless a longer response is clearly needed. You do not use 
bullet points unless the user explicitly asks for a list.

Document content:
{full document text, plain text stripped of formatting}

Assignment context (if provided by user):
{assignment context text}

User request:
{chip action or free-form question}
```

**Model:** `llama3.2:3b` as default — good balance of quality and size (~2GB). User can switch to `llama3:8b` in settings for better quality at the cost of more RAM.

---

## Export behavior

**DOCX export:**
- Reconstructs document formatting using the `docx` library
- MLA/APA formatting applied correctly including header, page numbers, double spacing
- Images embedded
- Saves to user-chosen location via system save dialog

**PDF export:**
- Renders the editor canvas via Puppeteer/Chromium to PDF
- Preserves exact visual appearance including fonts and formatting
- Saves to user-chosen location via system save dialog

**Markdown export:**
- Converts Tiptap JSON to clean Markdown
- MLA/APA header exported as plain text block at top
- Saves to user-chosen location via system save dialog

**Plain text export:**
- Strips all formatting
- Saves to user-chosen location via system save dialog

---

## MLA and APA templates

### MLA template applied to document:

```
[Student Name]
[Instructor Name]
[Course Name]
[Date: auto-filled as current date in "DD Month YYYY" format]

[Essay Title — centered]

[Body — double spaced, Times New Roman 12pt, first line indent 0.5in]

Works Cited
[citations if any]
```

Page header: `[LastName] [PageNumber]` right-aligned, Times New Roman 12pt.

### APA template applied to document:

```
[Title Page]
[Essay Title — centered, bold]
[Student Name]
[Institution Name]
[Course Name and Number]
[Instructor Name]
[Date]

Abstract (optional placeholder)

[Body — double spaced, 12pt, first line indent 0.5in]

References
[citations if any]
```

Running head: `[SHORTENED TITLE]` left, page number right.

---

## Build and packaging

**Development:**
```bash
npm run dev        # Starts electron-vite dev server with hot reload
```

**Production build:**
```bash
npm run build      # Compiles TypeScript, bundles with Vite
npm run package    # Produces Windows installer via electron-builder
```

**electron-builder.yml configuration:**
- Target: NSIS installer for Windows (`.exe`)
- App ID: `com.prose.app`
- Include Ollama binary from `resources/ollama/`
- Include ambient sound files from `assets/sounds/`
- Auto-updater: electron-updater configured for GitHub releases
- Icon: `assets/icon.ico`

---

## Implementation phases

Build in this exact order. Do not skip ahead. Each phase should be fully working before moving to the next.

### Phase 1 — Project scaffold and shell
- Initialize with electron-vite + React + TypeScript template
- Configure Tailwind CSS
- Install and configure shadcn/ui with the `new-york` style, `zinc` base color, and custom purple accent CSS variables for both light and dark themes
- Install Motion, Zustand, Sonner, and Geist font packages (`@fontsource/geist-sans`, `@fontsource/geist-mono`)
- Configure Geist Sans as the default Tailwind sans font
- Place `<Toaster />` from Sonner in `App.tsx`
- Initialize the Zustand store in `src/store/appStore.ts` with all fields defined
- Configure ESLint and Prettier with the rules described in code quality section
- Set up tsconfig with `strict: true`
- Create the main window with correct security settings (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`)
- Set up the preload script with contextBridge
- Create the SQLite database connection and run initial migrations
- Apply dark mode class to `<html>` on launch before React renders to prevent theme flash
- Verify the app opens a window, renders a blank React root in dark mode with correct font, and a shadcn Button component renders correctly as a smoke test

### Phase 2 — Database and IPC layer
- Implement all SQLite operations for documents, categories, citations, settings
- Implement all IPC handlers with input validation
- Expose full `window.prose` API via preload
- Write the complete TypeScript types in `types/index.ts`
- Verify each IPC handler works correctly with manual test calls from renderer console

### Phase 3 — Dashboard
- Build the dashboard layout with sidebar and document grid
- Document cards with all metadata
- New document modal with format selection and MLA/APA pre-fill inputs
- Category creation and filtering
- Search
- Delete with confirmation
- Verify full CRUD flow works end to end

### Phase 4 — Editor core
- Integrate Tiptap with all required extensions: bold, italic, underline, strikethrough, headings, bullet list, ordered list, indent, link, image, table, font family, font size, text color, text align, history
- Build the toolbar wired to Tiptap commands
- Auto-list formatting (typing `1.` and `-`)
- Auto-save with debounce
- Word count hook (with header exclusion logic)
- Basic dark/light theme on editor canvas
- Verify all formatting controls work correctly

### Phase 5 — MLA and APA formatting
- Implement MLA template application: header, title, body structure, page header
- Implement APA template application
- Word count correctly excludes header/title nodes when setting is enabled
- MLA/APA toolbar buttons apply templates
- Verify formatting looks correct and matches actual MLA/APA standards

### Phase 6 — Left sidebar panels
- Outline panel: extract headings from Tiptap document, render tree, click to scroll
- Pomodoro timer: work/break cycle, session counter, configurable durations, desktop notification on timer end
- Collapsible sidebar behavior

### Phase 7 — Ollama integration and AI panel
- Bundle Ollama binary into resources
- Implement Ollama process manager in main process: spawn, health check, graceful shutdown
- Implement streaming prompt handler via IPC
- Build onboarding model download screen with progress tracking
- Build AI panel with suggestion chips and free-form input
- Wire all suggestion chips to appropriate prompts
- Assignment context input
- Verify AI responses stream correctly and feel responsive

### Phase 8 — Music and ambient sounds
- Bundle ambient audio files
- Build music panel with track list and mixer
- Web Audio API implementation for mixing multiple audio layers simultaneously
- Persist volume and mixer settings
- Music status in status bar

### Phase 9 — Citation manager
- Build citation manager panel
- Manual citation entry for all types
- DOI lookup via crossref.org API (graceful offline fallback)
- URL metadata fetch
- Format citations in MLA, APA, Chicago, IEEE
- Insert Works Cited / References section into document

### Phase 10 — Export
- DOCX export via `docx` library
- PDF export via Puppeteer
- Markdown export
- Plain text export
- System save dialog for all exports

### Phase 11 — Focus mode and typewriter mode
- Focus mode: hide all chrome, center canvas, Escape to exit
- Typewriter mode: active line stays vertically centered via scroll

### Phase 12 — Settings, polish, and packaging
- Settings modal with all sections
- App-wide dark/light theme toggle
- electron-builder packaging configuration
- Windows installer generation
- Auto-updater setup via GitHub releases
- README with install instructions, feature list, and screenshot

---

## README structure (to be written last)

```markdown
# Prose

A focused, fully offline essay writing app for Windows with a built-in AI assistant.
Works on a plane. No account. No subscription. No data leaves your machine.

## Features
...

## Download
...

## Self-hosting / contributing
...

## Tech stack
...

## License
MIT
```

---

## Security checklist

Before any phase is considered complete, verify:

- [ ] No user document content appears in any log output
- [ ] All IPC handlers validate input types and reject malformed data
- [ ] `contextIsolation: true` and `nodeIntegration: false` on all windows
- [ ] No external network requests made without user-initiated action (citation lookup, model download)
- [ ] Ollama only bound to localhost, never exposed to network
- [ ] No hardcoded paths — all paths constructed via `path.join` and `app.getPath()`
- [ ] File picker dialogs restrict to expected file types
- [ ] SQL queries use parameterized statements, never string concatenation
