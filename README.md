# Prose

A focused, fully offline essay writing app for Windows with a built-in AI assistant.

Works on a plane. No account. No subscription. No data leaves your machine.

> **Note on internet use:** Prose is mostly offline. The features that require a connection are: the one-time Ollama binary download on first launch, the initial AI model download, DOI lookup for citations, and website metadata auto-fill for citations. Everything else (writing, AI feedback, export, formatting) works fully offline.

---

## Features

- Rich text editor with headings, lists, tables, inline formatting, images, and undo/redo
- MLA and APA formatting with running headers, double-spacing, first-line indents, auto-generated citations, and Works Cited pages
- Custom page margins per document, configurable at creation or any time in settings
- Citations manager with in-text citation insertion and a source library
- AI writing assistant powered by a local Ollama model
- Focus mode to hide all chrome while writing (F11 to toggle)
- Typewriter mode that keeps the cursor vertically centered as you type
- Pomodoro timer with configurable work/break intervals
- Built-in music player with lofi, piano, jazz, and layerable ambient sounds
- Session stats with a daily word count goal, writing streak, and average WPM
- Document history with snapshots and one-click restore
- Export to DOCX, PDF, Markdown, or plain text — with a live paginated preview
- Auto-updater via GitHub Releases

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
| Shell | Electron 31 |
| UI | React 18 + TypeScript |
| Editor | Tiptap v2 |
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
