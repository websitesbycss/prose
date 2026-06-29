# Prose

A free, fully offline office suite for Windows — Documents, Sheets, Boards, and Slides — with a local AI assistant built in throughout.

Works on a plane. No account. No subscription. No data leaves your machine.

> **Note on internet use:** Prose is mostly offline. The features that require a connection are: the one-time Ollama binary download on first launch, AI model downloads, DOI lookup for citations, and website metadata auto-fill for citations. Everything else (writing, spreadsheets, whiteboards, presentations, AI feedback, export) works fully offline.

---

## Apps

Prose bundles four editors behind one tab bar, so a document, spreadsheet, whiteboard, and presentation can all be open at once and switched between instantly.

### Documents
A rich text editor (headings, lists, tables, inline formatting, images, equations) with one-click MLA and APA page formatting — running headers, double-spacing, first-line indents — plus MLA, APA, Chicago, and IEEE citation styles with auto-generated in-text citations and a Works Cited/References page. Custom page margins per document. A citations manager with a source library and DOI/URL auto-fill. Document history with snapshots and one-click restore. Export to DOCX, PDF, Markdown, or plain text with a live paginated preview.

### Sheets
A spreadsheet editor with formulas, multiple tabs, cell formatting, and chart insertion (bar/line/pie). Export to XLSX or CSV.

### Boards
An infinite-canvas whiteboard for diagrams, sketches, and freeform notes — shapes, freehand drawing, sticky notes, and image embedding. Export to PNG or PDF.

### Slides
A presentation editor with slide masters, themes, element animations, slide transitions, and a presenter mode with speaker notes. Import/export PPTX. AI-assisted slide generation from a topic or outline.

## AI, built in

Every app talks to the same local Ollama model running on your machine — nothing is sent anywhere:

- **Documents** — a writing assistant for feedback, rewriting, and tone, plus inline grammar/style analysis that flags issues directly in the text.
- **Slides** — generate a full draft deck (titles, body text, speaker notes, and layout) from a topic, and an AI graphic generator for custom SVG visuals.
- **Sheets & Boards** — AI-assisted content generation scoped to each app.

A focus mode, typewriter mode, Pomodoro timer, ambient music player, and session/streak stats round out the writing environment.

## Download

Grab the latest installer from the [Releases](https://github.com/websitesbycss/prose/releases) page.

The first time you open Prose it will offer to download and install [Ollama](https://ollama.com) (~150 MB) automatically. No admin rights required. After that, pull any model you like:

```
ollama pull llama3.2
```

The default model is `llama3.2:3b`. You can switch models in Settings > AI.

## Development

```bash
git clone https://github.com/websitesbycss/prose.git
cd prose
npm install
npm run dev
```

To build a distributable installer:

```bash
npm run package
```

Output lands in `release/`.

### Tech stack

| Layer | Library |
|---|---|
| Shell | Electron |
| UI | React 18 + TypeScript |
| Document editor | Tiptap v3 |
| Sheets editor | Fortune-Sheet |
| Boards (whiteboard) | Excalidraw |
| Slides export/import | pptxgenjs |
| State | Zustand |
| Database | better-sqlite3 |
| Components | shadcn/ui + Radix UI |
| Animations | Motion (Framer Motion) |
| AI runtime | Ollama (local) |
| DOCX export | docx |
| PDF preview | pdfjs-dist |
| Packaging | electron-builder |

## License

MIT — see [LICENSE](LICENSE).
