# Prose

Prose is an open-source & offline productivity suite for Windows. It contains Documents, Sheets, Boards, and Slides, with a local AI assistant built into each.

![Prose dashboard](docs/screenshots/dashboard.png)
![Document editor with AI panel](docs/screenshots/documents-editor.png)

> **Note on internet use:** Prose is almost entirely offline. The features that need a connection are the one-time Ollama download on first launch, AI model downloads, checking for app updates, DOI lookup for citations, and website metadata auto-fill for citations. Everything else (writing, grammar checking, spreadsheets, whiteboards, presentations, AI feedback, export) works with no connection at all.

## Download

Get the latest installer from the [Releases](https://github.com/websitesbycss/prose/releases) page.

[VirusTotal Link](https://www.virustotal.com/gui/file/cd913948c35eb0864308be8b3a14d37b6d72f0f49a934622ff745968dfa30563)

On first launch Prose offers to download [Ollama](https://ollama.com) (~150 MB) automatically, no admin rights required. Then pull any model you like:

```
ollama pull llama3.2
```

The default model is `llama3.2:3b`. You can switch models in Settings > AI.

### Updates

When a new version is ready you get a small prompt to restart, or you can check manually in Settings > About.

## Current Features

Globally, Prose has a tab bar that can host multiple instances of all four file types, an app-wide light/dark mode toggle, a UI scale slider, an accent color picker, an adjustable storage location for .prose files, and a music player with 8 songs and 6 ambient tracks. Below are specific features per-file type:

### Documents
- Rich text editor (headings, images lists, tables, LaTeX equations)
- One-click MLA and APA templates
- Citation generator for MLA/APA/Chicago/IEEE styles
- Grammar and style checking through [Harper](https://writewithharper.com)
- Document history panel with snapshots and previews
- Built-in outline, pomodoro timer, and session stats
- Import from .docx or .md and export to .pdf, .docx, .md, or .txt

### Sheets
- [Fortune Sheet](https://github.com/ruilisi/fortune-sheet) editor with multiple sheet tabs
- 8 types of charts which can be inserted in your documents, boards, and slides
- Insights tab for key figures and suggested formulas and charts
- Import from and export to .xlsx or .csv

### Boards
- [Excalidraw](https://github.com/excalidraw/excalidraw) canvas for diagrams, sketches, and notes
- AI brainstorming with sticky notes
- Export to .png or .pdf

### Slides
- Custom-built presentation editor with element animations & slide transitions panel
- 8 element types including images, videos, and charts
- Toggleable grid overlay and smart guide lines
- Speaker notes with presenter mode
- AI that generates slides from text instructions, images, or your documents and sheets
- Import from .pptx and export to .pptx, .pdf, or .png

## AI that stays on your machine

Every model call runs through Ollama on your own hardware. Nothing you write ever leaves your computer. Once a model is downloaded, the assistant works with no internet connection, and you can swap in any model Ollama supports.

The AI is wired into each editor rather than bolted on as a chat box. It rewrites and critiques in Documents, writes formulas and analyzes data in Sheets, brainstorms onto the canvas in Boards, and designs whole decks in Slides.

## Development

```bash
git clone https://github.com/websitesbycss/prose.git
cd prose
npm install
npm run dev
```

Build a distributable installer (output lands in `release/`):

```bash
npm run package
```

### Tech stack

| Layer | Library |
|---|---|
| Shell | Electron |
| UI | React 18 + TypeScript |
| Document editor | Tiptap v3 |
| Grammar checking | Harper |
| Sheets editor | Fortune-Sheet |
| Boards | Excalidraw |
| Charts | Chart.js |
| Slides import/export | pptxgenjs |
| State | Zustand |
| Database | better-sqlite3 |
| Components | shadcn/ui + Radix UI |
| Animations | Motion (Framer Motion) |
| AI runtime | Ollama (local) |
| DOCX export | docx |
| PDF preview | pdfjs-dist |
| Packaging | electron-builder |

## License

MIT. See [LICENSE](LICENSE).
