# Prose

A focused, fully offline essay writing app for Windows with a built-in AI assistant.

Works on a plane. No account. No subscription. No data leaves your machine.

---

## Features

- **Rich text editor** — headings, lists, tables, inline formatting, undo/redo
- **MLA & APA formatting** — running headers, double-spacing, first-line indents, auto-generated citations and Works Cited page
- **Citations manager** — add and format sources, insert in-text citations with one click
- **AI writing assistant** — powered by a local Ollama model; gives feedback on your draft without sending anything to the cloud
- **Focus mode** — hides all chrome so you can write without distraction (F11 to toggle)
- **Typewriter mode** — keeps the cursor centred on screen as you type
- **Pomodoro timer** — configurable work/break intervals with ambient sound
- **Export** — save as DOCX, PDF, Markdown, or plain text
- **Auto-updater** — silent background updates via GitHub Releases

## Download

Grab the latest installer from the [Releases](https://github.com/websitesbycss/prose/releases) page.

The first time you open Prose it will offer to download and install [Ollama](https://ollama.com) (~150 MB) automatically. No admin rights required. After that, pull any model you like:

```
ollama pull llama3.2
```

## Self-hosting / Development

```bash
git clone https://github.com/websitesbycss/prose.git
cd prose
npm install
npm run dev
```

To package a distributable installer:

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
| Packaging | electron-builder |

## License

MIT — see [LICENSE](LICENSE).
