# Prose demo video: production plan

Target runtime: **1:50** (110 s). Hard cap 2:00. Machine-readable twin: [shotlist.json](shotlist.json).
Both files must stay in sync. If you change one, change the other.

## 1. How recording works

Prose is an Electron app, and Playwright CLI is browser-first. The documented route is
`playwright-cli attach --cdp=<url>`, whose docs page lists "Electron apps exposing CDP".
`electron-vite dev` has a `--remoteDebuggingPort` flag, so Prose exposes CDP with no code changes.
Opening the Vite URL in a plain browser will NOT work, because the renderer depends on the preload IPC bridge.

```powershell
# terminal 1: start Prose with CDP open (scripts/dev.js does not forward flags, so call electron-vite directly)
$env:ELECTRON_RUN_AS_NODE = $null
npx electron-vite dev --remoteDebuggingPort 9222

# terminal 2 / Claude: attach and check
playwright-cli -s=prose attach --cdp=http://localhost:9222
playwright-cli -s=prose tab-list          # pick the main Prose window, not DevTools/hidden export windows
playwright-cli -s=prose resize 1920 1080
playwright-cli -s=prose snapshot
```

A packaged build works the same way: `Prose.exe --remote-debugging-port=9222`.

### Spike test: PASSED (2026-10-13)
Attaching over CDP works, and so do `video-start`, `video-chapter`, clicks and `video-stop`.
Verified output: VP8 WebM, 1920x1080, 30 fps, with the animated cursor and chapter card visible.

Gotchas found:
- Without `--size`, the video comes out **800x600 at 25 fps** with grey letterbox bars.
  Always `resize 1920 1080` first, then `video-start <file> --size=1920x1080 --fps=30 --cursor`.
  In hero scripts, pass `size: { width: 1920, height: 1080 }, fps: 30` to `page.screencast.start`.
- The attached session sees exactly one page (the Prose window), so no `tab-select` is needed.

Demo profile (isolated, so your real library and settings are untouched):
```powershell
python demo-video\seed_demo.py                 # recreates C:\prose-demo (6 sample files, dark theme)
powershell -File demo-video\launch_demo.ps1    # Prose dev build + CDP :9222 + --user-data-dir=C:\prose-demo\userData
playwright-cli -s=prose attach --cdp=http://localhost:9222
```
Re-run `seed_demo.py` (with Prose closed) to reset the demo state between takes.

Note: the screencast captures only the renderer page. The native window frame is excluded,
which is fine because Prose uses its own custom title bar.

## 2. Recording method: one clip per scene

- Each scene is one `async page => {...}` file run with `playwright-cli run-code --filename=scenes/NN_slug.js`.
  The docs call this the "hero script" approach, with controlled pacing, realistic typing and overlays.
- Typing uses `pressSequentially(text, { delay: 55 })`.
- Pacing uses `page.screencast.showActions({ duration: 800 })`, which paces actions by 800 ms and draws an animated cursor.
- Every scene script keeps a `marks` object (`mark('ai_start')` stores ms since t0) and `return`s it.
  `run-code` prints return values. Save each one as `clips/NN_slug.marks.json`.
  That gives the editor exact in-clip timestamps for every beat, so the voiceover can be lined up without scrubbing.
- Each clip has a 0.5 s lead-in and a 0.5 s tail hold (`waitForTimeout(500)`) so the editor has trim handles.
- Overlays are `pointer-events: none`, so they never block clicks. Use them for:
  - a small section badge (top-left, 2 s), not full-screen chapter cards, which would eat the runtime
  - an "AI · local · offline" badge whenever the AI is on screen
- LLM latency is not deterministic. Record the real wait, then speed-ramp it in Premiere.
  The `ai_wait_start` / `ai_wait_end` marks tell the editor exactly which span to ramp.

### Output format
Playwright writes **WebM**, and Premiere does not import WebM reliably. Convert every clip:
```
ffmpeg -i clips/03_ai_doc.webm -r 30 -c:v libx264 -crf 14 -pix_fmt yuv420p -an clips/03_ai_doc.mp4
```
Use constant 30 fps, with no audio track.

## 3. Demo content to seed before recording (this decides how good the video looks)
- Fresh profile, dark theme, one pleasant accent colour, UI scale at 100 %. Record at 1920x1080.
- Dashboard: 4-6 sample files across all four types, with sensible names. No personal data.
- A Doc "Climate Policy Essay" with 3 paragraphs, one deliberately wordy for the AI rewrite and a typo or two for grammar.
- A Sheet "Q3 Sales" with about 20 rows (month, region, units, revenue).
- Model `llama3.2:3b` already pulled and warmed up (run one prompt first so the first token is fast).
- Optional but strong: turn Wi-Fi off during scenes 3-6, so "offline" is literally true.

## 4. Timeline and voiceover

Voiceover is paced at about 1.6-2.2 words/s, which sits below natural speech rate on purpose so each line has air.
"Clip len" includes the 1 s of handles. Programme time is what lands on the final timeline.

| # | Programme time | Len | Scene | Clip | Words | Voiceover |
|---|---|---|---|---|---|---|
| 1 | 0:00-0:08 | 8 s | Intro / dashboard | 01_intro | 17 | Meet Prose: a free, open-source office suite that runs completely offline, with AI built into every app. |
| 2 | 0:08-0:22 | 14 s | Documents | 02_docs | 24 | Documents give you a rich editor with one-click MLA and APA templates, a built-in citation generator, and grammar checking that never leaves your machine. |
| 3 | 0:22-0:42 | 20 s | **AI in Documents** | 03_ai_doc | 36 | Now the star: the AI assistant. Ask it to strengthen your thesis, improve clarity, or check your argument. It runs on a model on your own computer through Ollama, so your words never touch the cloud. |
| 4 | 0:42-0:58 | 16 s | Sheets + AI | 04_sheets | 29 | In Sheets, ask the AI to write a formula or analyze your data. The Insights tab suggests key figures and charts you can drop straight into documents and slides. |
| 5 | 0:58-1:10 | 12 s | Boards + AI | 05_boards | 20 | Boards pairs an Excalidraw canvas with AI brainstorming. Give it a topic and it fills the canvas with sticky notes. |
| 6 | 1:10-1:32 | 22 s | **AI in Slides** | 06_slides | 31 | And in Slides, pick a document or a spreadsheet and the AI builds a whole deck from it, speaker notes included. Add animations and transitions, then export to PowerPoint or PDF. |
| 7 | 1:32-1:42 | 10 s | Quick-fire: tabs, themes, focus | 07_extras | 18 | Open everything in tabs, switch themes and accents, and focus with the built-in pomodoro timer and music player. |
| 8 | 1:42-1:50 | 8 s | Outro | 08_outro | 14 | Prose is free, open source, and private by design. Download it today on GitHub. |

Total: 110 s, 192 words (about 1.75 words/s).
AI scenes (3, 4, 5, 6) are 69 s, which is 63 % of the video, as requested.

## 5. Beat sheet per scene
Times are relative to the start of the programme segment. Exact locators are filled in during the rehearsal pass (step 6).

**1 Intro (8 s).** Dashboard fades in with the tab bar visible, cursor drifts across the four file-type cards,
hover on one doc. Title badge "Prose" at 0:00-0:03. Ends hovering the New button.

**2 Documents (14 s).**
- 0:00 open the essay doc.
- 0:02 open the template picker and apply MLA (the page reflows).
- 0:05 insert a citation, with the citation panel visible.
- 0:09 a grammar underline appears and the cursor hovers it to show the Harper suggestion.
- 0:12 quick open of the outline panel.

**3 AI in Documents (20 s).** The money scene, with the AI panel open.
- 0:00 select the wordy paragraph.
- 0:02 click the sparkle button / open the AI panel, and the "local · offline" badge shows.
- 0:04 type the prompt "Make this tighter and more persuasive" (pressSequentially).
- 0:08-0:15 streaming response (`ai_wait_start`/`ai_wait_end`; speed-ramp if it runs longer than the 7 s budget).
- 0:15 accept / apply, and the paragraph changes.
- 0:18 hold on the final text.

**4 Sheets (16 s).**
- 0:00 open Q3 Sales.
- 0:02 open the AI panel and ask "Total revenue by region" (or a formula).
- 0:06 the result or formula is written into a cell.
- 0:10 switch to the Insights tab (key figures, suggested charts).
- 0:13 insert a chart.

**5 Boards (12 s).**
- 0:00 open a blank board.
- 0:02 open the brainstorm modal, type the topic "Launch plan for a coffee shop".
- 0:06 sticky notes populate the canvas.
- 0:10 hold.

**6 Slides (22 s).**
- 0:00 new deck.
- 0:02 open the AI generator and type "5-slide pitch for a local coffee roaster".
- 0:07-0:15 generation (speed-ramp as needed).
- 0:15 flip through two or three generated slides.
- 0:18 open the animations/transitions panel and apply one.
- 0:20 show the export menu (PPTX/PDF).

**7 Extras (10 s).** Tab bar with 3-4 open files and a tab switch, light/dark toggle, accent colour change,
pomodoro and music panel opened for 1.5 s each.

**8 Outro (8 s).** Dashboard again, slowly settling. The editor adds a title card with the logo,
`github.com/websitesbycss/prose` and "Free for Windows". (Premiere work, not recorded.)

## 6. Workflow
1. **Spike**: attach to Prose via CDP and record a 5 s video (section 1).
2. **Seed** the demo data (section 3). Prefer a dedicated storage location, so the real library is untouched.
3. **Rehearse** each scene with plain CLI commands (`snapshot`, `find`, `generate-locator`) and write down the locators.
   Take scenes 3, 4, 5 and 6 first. They carry the most risk, because of AI latency and quality.
4. **Script**: write `demo-video/scenes/NN_slug.js` per scene. Each one starts `screencast.start`, runs the beats,
   returns `marks`, and ends with `screencast.stop`.
5. **Record**: run scenes one at a time and re-run any scene that looks off. Scenes are independent.
6. **Convert** with ffmpeg, then check the clip durations against `shotlist.json`.
7. **Voiceover**: you record against the script in section 4, one file per scene
   (`vo/NN_slug.wav`) so it can be nudged per clip.
8. **Edit**: hand `shotlist.json` plus the clips and VO files to Claude for the Premiere MCP assembly.

## 7. Known risks
- CDP + screencast is undocumented (spike test covers it).
- Electron may expose extra pages (hidden export windows, preview windows). Always `tab-list` and select the main window.
- Small local models can give mediocre output. Pre-test the prompts, and pick the ones that reliably look good.
  You can re-record scenes until the output looks right.
- Fixed `waitForTimeout` pacing means clip lengths are predictable, but AI scenes vary. Use the marks.
- Prose's dev build may differ slightly from a packaged one (fonts, update toast). Dismiss any update toast first.
- I have not yet seen the live UI. Button names and flows in section 5 come from the README and the file tree, and are to be verified in rehearsal.

## 8. Verified UI flows and measured timings (2026-10-13)

All driven live over CDP. The authoritative per-beat version is `shotlist.json`; this is the summary.

| Scene | Real flow in the app | Measured (CPU, llama3.2:3b) |
|---|---|---|
| 3 Docs AI | Sparkle button, then a suggestion chip ("Improve clarity") or a typed prompt. The Chat tab gives advice, it does not rewrite in place. | ~24 s for a 5-point reply |
| 4 Sheets AI | Sparkle, **Insights** tab, **Analyze sheet**, then **Insert formula** and **Insert chart** buttons per result | 11-45 s |
| 5 Boards AI | Sparkle, **Brainstorm** tab, type topic, **Generate**, **Add to board** | 12-30 s for 12 ideas |
| 6 Slides AI | Sparkle, **Generate** tab, **Add a source** (Documents or Spreadsheets only, no free text), slide count Auto/Custom, **Generate slides**, **Insert N slides** | 15 slides: 6 m 27 s. Use Custom = 5 |

Consequences for the edit:
- Every AI wait needs a speed ramp or a jump cut. Slides is the extreme: show ~4 s of the "Reading sources / Designing your slides" progress UI, then jump cut.
- The Slides Generate tab cannot take a typed description, so the voiceover now says "pick a document or a spreadsheet".
- Auto slide count over-generates (15 slides from a 165-word essay, with repeats). Always set Custom.

## 9. Bugs found and fixed while testing

Found with playwright-cli across Documents, Sheets, Boards, Slides, Settings and light mode. Type-check and lint pass. Changes are uncommitted.

| Area | Problem | Fix |
|---|---|---|
| Docs | Word count showed 0 and the outline was empty until the first keystroke (content loads with `emitUpdate: false`) | `useWordCount` and `OutlinePanel` listen to doc-changing transactions |
| Boards | **Every Excalidraw font was blocked by the CSP** (187+ console errors): files were at the wrong path and the path was relative, so Excalidraw fell back to a CDN. Offline-first violated. | Fonts moved to `public/excalidraw-assets/fonts/`, absolute asset path set in `theme-init.js` and `src/excalidrawAssetPath.ts` |
| Boards | Brainstorm sticky-note text was clipped and top-aligned | Use Excalidraw's `convertToExcalidrawElements`; wrapped text in the chat-action builder too |
| Sheets AI | Insights stats were wrong (summed a text column, invented totals) and a prompt placeholder leaked into the UI | Column letters and data range added to the model context; key stats are computed in code; model stats kept only if their formula verifies; placeholder filtered |
| Sheets AI | Re-running analysis after inserting a total double-counted it | Data block ends at the first blank row |
| Sheets | Chart was dropped on top of the data it plotted, and a text column plotted as an all-zero series | Chart placed beside (or below) the data; leading text columns merged into labels |
| Sheets | Cells rendered in Times New Roman while the toolbar said Calibri; typed numbers saved as strings (text in .xlsx) | Engine default font aligned; clean numeric strings saved as numbers |
| AI (all) | `num_predict: -1` with no cancel: a looping model generated 8,000+ tokens and blocked every other request | 4096 cap, tighter cap for structured JSON, stream cancelled when the consumer stops |
| Slides | Generated body text was tiny and clustered at the top; inserting into a blank deck left the blank slide first and jumped to the last slide | Length-adaptive body size; blank deck replaced; focus lands on the first inserted slide |
| A11y | ~70 icon-only toolbar buttons had no accessible name; a Radix dialog warning on every modal | `aria-label` added from each tooltip; dialog description warning suppressed |

Not fixed (judgement calls, or model quality):
- A 3B model still invents content in generated slides (e.g. a "40%" figure) and can repeat titles. A larger model through Settings > AI is the real fix.
- History shows 181 words and Stats 182 while the status bar shows 165 for an MLA doc: they include the MLA header, the status bar excludes it.
- Numbers are left-aligned in Sheets (FortuneSheet default).
- Dashboard thumbnails are placeholders until a file has been opened and saved in-app.
- Leftover console noise: Chrome still reports the unused CDN fallback font source, and `ERR_CACHE_OPERATION_NOT_SUPPORTED` on the music files in dev.

## 10. Recording gotchas

- **Minimized or covered window:** Chromium stops painting and `screenshot`/`video` hang. `launch_demo.ps1` passes the occlusion-disable flags, but a *minimized* window still won't paint. Restore it before recording.
- **App state persists:** the demo profile keeps MLA, charts and inserted formulas. Re-run `seed_demo.py` (Prose closed) before every full take.
- **Main-process edits restart the app** and drop the CDP session; re-attach with `playwright-cli -s=prose attach --cdp=http://localhost:9222`.
- **Duplicate names:** "Insert chart", "Brainstorm" and "Documents" each match more than one element. Use `exact: true` or `.last()`.
- **Model:** warm it first (`keep_alive: 60m`). It is on CPU here, so record AI waits in real time and cut them in Premiere.
