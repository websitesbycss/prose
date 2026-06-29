# Prose

A free, fully offline office suite for Windows. Documents, Sheets, Boards, and Slides, with a local AI assistant built into every one of them.

Works on a plane. No account. No subscription. No data leaves your machine.

> **Note on internet use:** Prose is mostly offline. The features that need a connection are the one-time Ollama binary download on first launch, AI model downloads, DOI lookup for citations, and website metadata auto-fill for citations. Everything else (writing, spreadsheets, whiteboards, presentations, AI feedback, export) works fully offline.

---

## Apps

Prose bundles four editors behind one tab bar, so you can have a document, a spreadsheet, a whiteboard, and a presentation open at the same time and jump between them instantly.

### Documents
A rich text editor with headings, lists, tables, images, and equations, plus one-click MLA and APA page formatting. Citations work in MLA, APA, Chicago, and IEEE style, with auto-generated in-text citations and a Works Cited or References page. Document history keeps snapshots you can restore with one click. Export to DOCX, PDF, Markdown, or plain text.

### Sheets
A spreadsheet editor with formulas, multiple tabs, and full cell formatting. Insert bar, line, and pie charts straight from your data. AI can generate or summarize a table for you, drop new data right into the grid, and explain or write formulas in plain English. Export to XLSX or CSV.

### Boards
An infinite canvas for diagrams, sketches, and freeform notes. Draw freehand, add shapes and sticky notes, embed images, and link in your other Prose files. AI can brainstorm a topic for you and lay the ideas out as sticky notes across the board. Export to PNG or PDF.

### Slides
A presentation editor with slide masters, themes, element animations, and slide transitions, plus a presenter mode with speaker notes. Describe a topic or paste an outline and AI builds a full deck, complete with titles, body text, speaker notes, and AI-generated illustrations placed right on the slides. Import and export PPTX.

## AI, built in

Prose runs entirely on a local Ollama model on your own machine. Nothing you write, no document, no spreadsheet, no slide, ever leaves your computer or touches a server.

The AI isn't just a chat sidebar bolted onto the app. It actually does things:

- **Documents** gets a writing assistant for feedback, rewriting, and tone, plus a grammar and style checker that scans the whole document and flags the same issues every time you run it, not a random subset.
- **Slides** can generate a complete deck from a topic or outline, titles, bullets, speaker notes, and all, and it will design and place real illustrations on slides that call for one instead of leaving you with a wall of text.
- **Sheets** can write or explain a formula, generate sample data, and insert that data straight into your cells.
- **Boards** can take a topic and brainstorm a set of ideas, then place each one as a sticky note on the canvas for you to rearrange.

Every model call happens on your machine through Ollama, so it works without an internet connection once the model is downloaded, and you can swap in any model that Ollama supports.

A focus mode, typewriter mode, Pomodoro timer, ambient music player, and session and streak stats round out the writing environment.

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

MIT. See [LICENSE](LICENSE).
