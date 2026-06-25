# Prose — Fixes and Animations Spec

This document specifies six items: four fixes and two larger features. Implement them in the order listed since the later items are more complex. Read the existing relevant code thoroughly before implementing each item. All existing code quality, styling (Tailwind + CSS variables, no hardcoded colors), security, and naming conventions from the main spec apply throughout.

---

## Item 1 — Fix Slides left sidebar context menu

**Problem:** The right-click context menu on slide thumbnails in the Slides left sidebar has non-functional items — "Add slide after", "Duplicate slide", and "Delete slide" do nothing when clicked.

**Investigate first:** Read the slide panel component and its context menu implementation. Determine why the handlers are not firing — likely causes are: the menu items have no onClick wired, the handlers reference a slide ID that is not being passed correctly, the IPC calls are failing silently, or the handlers mutate state that is not connected to the rendered slide list.

**Required behavior:**
- **Add slide after** — inserts a new blank slide immediately after the right-clicked slide, not at the end of the deck. The new slide uses the current presentation theme defaults. After insertion, navigate to and select the new slide. Trigger auto-save.
- **Duplicate slide** — creates an exact copy of the right-clicked slide including all elements, background, speaker notes, transitions, and animations, with new unique IDs for the slide and every element on it. Insert the duplicate immediately after the original. Navigate to and select the duplicate. Trigger auto-save.
- **Delete slide** — removes the right-clicked slide. If it is the only slide in the presentation, do not delete it — instead clear its content to a blank slide (a presentation must always have at least one slide). If the deleted slide is the currently active slide, navigate to the nearest remaining slide (the previous one, or the next one if deleting the first slide). Trigger auto-save.

**Implementation requirements:**
- Every handler must operate on the slide ID of the slide that was right-clicked, captured at the time the context menu opens — not the currently active slide, which may differ from the right-clicked slide.
- All three operations must produce new unique IDs where new slides or elements are created. Never reuse IDs.
- All three operations push to the undo stack so Ctrl+Z reverses them.
- All three operations trigger the debounced auto-save.
- After the fix, verify each operation updates the rendered slide list immediately and regenerates the slide thumbnails for affected slides.

---

## Item 2 — Fix ESC key to exit presentation mode

**Problem:** Pressing Escape during presentation mode does not exit presentation mode.

**Investigate first:** Read the presentation mode component and its keyboard handling. Likely causes: the keydown listener is attached to an element that does not have focus in fullscreen, the Escape key is being captured/preventDefault'd by Electron's native fullscreen handling before the app sees it, or the listener is registered but the exit function is not being called.

**Required behavior:**
- Pressing Escape while in presentation mode exits presentation mode, leaves Electron fullscreen, and returns to the editor showing the slide that was being presented when Escape was pressed.
- This must work regardless of where focus is within the presentation view.

**Implementation requirements:**
- Attach the keydown listener at the `window` level during presentation mode, not on a specific element, so it fires regardless of focus.
- Account for Electron's native fullscreen Escape behavior — on some platforms Electron's fullscreen intercepts Escape. If `mainWindow.setFullScreen(true)` was used, calling `mainWindow.setFullScreen(false)` must be part of the exit. Listen for both the app-level Escape and Electron's `leave-full-screen` event so the UI state stays in sync whether the user exits via Escape, F11, or the OS fullscreen control.
- Clean up the keydown listener when presentation mode unmounts to avoid duplicate handlers.
- Verify Escape also exits any sub-states first if present (e.g. if a slide grid overview is open within presentation mode, Escape closes that first, then a second Escape exits presentation mode).

---

## Item 3 — Add music playing status to dashboard

**Problem:** The dashboard has no indicator of whether music is currently playing. The music status only appears inside the editor.

**Required behavior:**
- When music is playing (built-in track or ambient mix), show a music status indicator somewhere appropriate on the dashboard — a small element showing the currently playing track name and a play/pause control.
- Clicking the indicator's control pauses/resumes music. Clicking the track name or an expand affordance opens the full music panel.
- When no music is playing, the indicator either hides entirely or shows a muted state — Claude Code decides which looks cleaner given the existing dashboard layout.

**Implementation requirements:**
- The music playback state already lives in a shared store (the music hook/Zustand slice used by the editor). The dashboard reads the same state — do not create a separate music system. The indicator on the dashboard and the indicator in the editor reflect the same single source of truth.
- Placement should fit the existing dashboard design — consider the sidebar bottom near Settings, or the top bar. Choose the location that is least disruptive to the current layout and most consistent with where music status appears in the editor.
- The indicator updates live as tracks change or playback is toggled from anywhere in the app.

---

## Item 4 — Smooth tab reordering

**Problem:** Dragging tabs to reorder them in the tab bar is buggy and not smooth.

**Investigate first:** Read the current tab bar component and its drag-to-reorder implementation. Identify what makes it janky — common causes: reordering state updates on every mousemove causing layout thrash, no transform-based animation so tabs jump rather than slide, the dragged tab is reordered in the data array mid-drag causing index confusion, or missing pointer capture so fast drags lose the tab.

**Required behavior:**
- Dragging a tab reorders it smoothly. Other tabs slide out of the way with a smooth animation to make room as the dragged tab moves over them.
- The dragged tab follows the cursor precisely with no lag.
- Dropping commits the new order.

**Implementation requirements:**
- Use a transform-based approach: the dragged tab is positioned via `transform: translateX()` following the cursor delta, not by reordering the DOM during drag. Other tabs animate their positions via CSS transitions on `transform`.
- Only commit the actual data array reorder on drop (mouseup), not continuously during drag. During drag, compute the visual insertion index and animate other tabs to their would-be positions, but keep the underlying array stable until drop.
- Use pointer events with `setPointerCapture` so fast mouse movements never lose the drag.
- Disable text selection during drag.
- The animation when tabs slide to make room should be quick (around 150-200ms) and use an ease-out curve.
- This item is a prerequisite for Item 5 — build the reordering cleanly because the tab-tearing system extends it.

---

## Item 5 — Chrome-style tab tearing (drag tabs between and into new windows)

This is the most technically demanding item. The goal is to replicate Google Chrome's tab behavior exactly: drag a tab out of the tab bar to create a new window containing that tab, drag a tab from one Prose window into another window's tab bar to merge it in, and snap back into the original tab bar if released within 50px of it.

**Read this entire section carefully and study how Chrome and VS Code implement this before writing code. This is hard and requires a careful state machine.**

### Conceptual model

A "tab" represents an open file. Tabs live in windows. The operations are:
1. **Reorder** within a window (Item 4 — already built)
2. **Tear out** — drag a tab far enough from the tab bar that it detaches into a new window
3. **Merge in** — drag a torn tab (or a tab being dragged) over another Prose window's tab bar, dropping it there to add it to that window
4. **Snap back** — if a tear-out drag is released within 50px of the origin tab bar, the tab returns to its original position instead of creating a new window

### The core challenge and how to solve it

The fundamental difficulty: a drag gesture that starts inside one Electron renderer (window A's tab bar) needs to potentially end in a different window (window B) or in empty space (new window). A single renderer's mouse events do not cross window boundaries. The solution is to coordinate the drag through the main process, which can see all windows.

**Recommended architecture — main-process-coordinated drag:**

When a tab drag begins and moves beyond the reorder threshold (more than ~50px vertically from the tab bar, indicating a tear rather than a reorder), transition from "reorder mode" into "tear mode". In tear mode:

1. The renderer notifies the main process via IPC that a tab tear has started, passing the tab's file ID and metadata, and the current global cursor position.
2. The main process takes over tracking. It creates a small floating frameless "drag preview" window — a borderless always-on-top window showing a thumbnail or title of the tab being dragged — that follows the global cursor. Use `screen.getCursorScreenPoint()` polled via a short interval or driven by the renderer forwarding mousemove coordinates to the main process.
3. As the cursor moves, the main process checks the global cursor position against the bounds of all open Prose windows (`window.getBounds()`) and specifically against each window's tab bar region. The renderer of each window reports its tab bar bounds to the main process so the main process knows the screen-space rectangle of every tab bar.
4. Visual feedback: when the cursor is over another window's tab bar, that window's renderer shows a drop indicator (a gap opening where the tab would insert). The main process tells the relevant renderer to show this indicator via IPC.

On release (mouseup), the main process decides the outcome based on the final cursor position:

- **Over another window's tab bar** → tell window B's renderer to add the tab (open the file as a new tab at the indicated index), tell window A's renderer to remove the tab, destroy the drag preview window.
- **Within 50px of the origin window's tab bar** → snap back: tell window A to restore the tab to its original index, destroy the drag preview. No new window.
- **Anywhere else (empty space, outside all tab bars)** → create a new Prose window, open the torn tab's file in it, position the new window so its tab bar is near the drop point, remove the tab from window A, destroy the drag preview.

### Detailed implementation requirements

**Drag threshold and mode transition:**
- While the tab is being dragged and the cursor remains within the tab bar's vertical band (roughly the tab bar height plus a margin), stay in reorder mode (Item 4 behavior).
- When the cursor moves more than ~50px below the tab bar (or above it), transition to tear mode. At this moment the tab visually detaches — it is removed from the in-bar layout and the drag preview window appears under the cursor.
- If the cursor returns to within 50px of the origin tab bar while still in tear mode (before release), re-show the tab's gap in the origin tab bar at the position it would snap back to, giving the user clear feedback that releasing now will snap it back.

**Drag preview window:**
- A frameless, transparent, always-on-top `BrowserWindow` sized small (e.g. 240×140px) showing the tab's title and file type icon, and ideally the file's thumbnail if one exists.
- It follows the cursor with the cursor positioned at roughly the top-left where the tab was grabbed.
- It is `setIgnoreMouseEvents(true)` so it never intercepts the drag.
- Destroyed on drop regardless of outcome.

**Cross-window cursor tracking:**
- The main process needs the live global cursor position during the tear. Two options — poll `screen.getCursorScreenPoint()` on a `setInterval` of ~16ms during an active tear, or have the originating renderer forward mousemove coordinates. Polling in the main process is more reliable since it works even when the cursor is over a different window. Use polling during tear mode and stop the interval on drop.

**Tab bar bounds registration:**
- Each Prose window's renderer reports its tab bar's screen-space rectangle to the main process whenever the window moves, resizes, or its tab bar layout changes. The main process maintains a map of windowId → tabBarScreenRect. During a tear, the main process uses this map to determine which window's tab bar (if any) the cursor is over.

**Adding a tab to a target window:**
- "Adding a tab" means opening that file as a new tab in the target window at the computed insertion index. The file ID and any unsaved in-memory state must transfer. If the tab has unsaved changes, the unsaved content must move with it — serialize the current editor state and pass it through the main process to the target window so no work is lost. If transferring full unsaved state is too complex initially, at minimum save the file before tearing so the target window opens the saved version. Prefer transferring unsaved state if feasible.

**Creating a new window from a tear:**
- Reuse the existing window creation logic. The new window opens with the single torn tab active. Position the new window so the dropped location feels natural — the tab bar near the cursor's release point.

**Snap-back behavior:**
- The 50px snap-back zone is measured from the origin window's tab bar rectangle, expanded by 50px on all sides. If release happens within that expanded rectangle and not over a different window's tab bar, the tab returns to the origin window at its original index with a smooth animation.

**Edge cases to handle:**
- Tearing the last remaining tab from a window: when the window has only one tab and it is torn out into a new window, the origin window would become empty. Either close the origin window (Chrome behavior when the last tab is torn and dropped elsewhere) or keep it with an empty state. Match Chrome — if the last tab is torn into a new window the origin window closes. If the last tab is snapped back, nothing changes.
- Multiple monitors: cursor tracking and window positioning must work across monitors. `screen.getCursorScreenPoint()` returns global coordinates that span all displays, so this works if window bounds comparisons use the same global coordinate space.
- Releasing over a non-Prose window or the desktop: treated as "empty space" → new window.
- Rapid drags: the polling interval must keep up; if a frame is missed the drop still resolves correctly based on final cursor position.

**Performance and smoothness:**
- The drag preview window must follow the cursor smoothly — update its position on every poll tick.
- Drop indicators in target tab bars must appear/disappear cleanly without flicker as the cursor moves between windows.

**Security:**
- All IPC messages coordinating the tear validate window IDs and file IDs before acting. A window cannot be told to open a file ID that does not exist in the index. Never transfer or eval arbitrary code through the tear coordination messages — only file IDs and serialized editor state that goes through the same validation as normal file loads.

**Suggested incremental build approach for Item 5 (do not attempt all at once):**
1. First: tear-out into a new window only (no merging, no snap-back). Drag tab beyond threshold → on release always create a new window. Verify this works solidly.
2. Then: add snap-back within 50px of the origin tab bar.
3. Then: add the drag preview window following the cursor.
4. Then: add tab bar bounds registration and merging into another existing window's tab bar.
5. Then: handle all edge cases (last tab, multi-monitor, unsaved state transfer).
Verify each step before moving to the next.

---

## Item 6 — Element animations and slide transitions

A robust animation system for Slides with a dedicated, resizable animations panel that shares the right sidebar with the AI panel, full timing customization, drag-based sequencing, and a preview mode.

### Where the animations panel lives

The animations panel occupies the same right sidebar slot as the AI panel. The right sidebar can show either the AI panel or the animations panel, not both at once. Opening the animations panel while the AI panel is open replaces the AI panel; opening the AI panel while the animations panel is open replaces the animations panel. The right sidebar is resizable by dragging its left edge, exactly like the Document editor's right sidebar — the animations panel respects and shares that same resize width.

Add a toggle button (an animation icon) to the Slides toolbar's persistent right section or near the AI panel toggle that opens/closes the animations panel.

### Two animation systems

**Slide transitions** — play when navigating between slides in presentation mode. One transition per slide (the transition that plays when this slide enters).

Transition types to implement:
- **None** — instant
- **Fade** — crossfade between outgoing and incoming slide
- **Slide left / right / up / down** — incoming slide moves in from the specified direction while the outgoing slide moves out the opposite way
- **Push** — incoming slide pushes the outgoing slide off in the direction of travel (the two slides move together as if connected)
- **Zoom** — incoming slide scales up from a smaller size with a fade
- **Dissolve** — pixel/opacity dissolve between slides (distinct from fade — use a noise/stagger mask or a rapid random-block reveal to differentiate it visually from a plain fade)

Each transition has a configurable **duration** (default 500ms, range 100ms–2000ms).

**Element animations** — play on individual elements during a slide. Each element can have entrance, emphasis, and exit animations (start with entrance and exit per the to-do; emphasis can be added but is not required — implement entrance and exit thoroughly first).

Element animation effects to implement:
- **Appear** — instant visibility, no motion (entrance) / instant hide (exit)
- **Fade in / Fade out** — opacity animation
- **Fly in / Fly out (left / right / top / bottom)** — element translates in from / out to the specified edge while fading
- **Zoom in / Zoom out** — element scales from 0/to 0 from its center with a fade
- **Bounce in / Bounce out** — zoom with an overshoot-and-settle easing curve
- **Wipe** — element revealed/hidden progressively from one edge using a clip-path animation

### Animation data model

Design the exact TypeScript interfaces yourself, but the model must support per-element:

- An ordered list of animations on the element (an element can have an entrance, then later an emphasis, then an exit, each as separate entries)
- Per animation: effect type, category (entrance/exit/emphasis), direction where applicable, **duration** (ms), **delay** (ms, the wait after the animation is triggered before it begins)
- A **trigger/start mode** per animation, matching PowerPoint/Keynote semantics:
  - **On click** — the animation waits for a click (or arrow-key advance) to begin
  - **With previous** — the animation begins at the same time as the previous animation in the sequence (simultaneous)
  - **After previous** — the animation begins automatically when the previous animation finishes (no click needed)
- A slide-level ordered animation sequence — the order in which element animations play on that slide. This sequence is the source of truth for playback order and is what the animations panel displays and lets the user reorder.

The "with previous" and "after previous" triggers are what allow some animations to occur simultaneously and others sequentially without manual clicks. This is the core of the customization the system must support.

### The animations panel UI

The panel shows the animation sequence for the current slide as an ordered, reorderable list. Each entry in the list represents one animation on one element and shows:

- A sequence number or index
- The name/identifier of the element it applies to (e.g. "Title", "Text box", "Image" — derive a readable label from the element type and content)
- The effect name (e.g. "Fade in", "Fly in from left")
- The trigger mode shown as a small icon or label (on click / with previous / after previous)
- The duration and delay, editable inline or via a detail view

**Interactions in the panel:**
- **Reorder** by dragging entries up and down — this changes the playback order in the slide's animation sequence. Use a smooth transform-based drag like the tab reordering (Item 4), no janky reordering.
- **Select** an entry to highlight the corresponding element on the canvas and open its animation detail controls.
- **Add animation** — with an element selected on the canvas, an "Add animation" control in the panel opens an effect picker (organized by Entrance / Emphasis / Exit) and adds the chosen effect to that element, appending it to the slide's sequence.
- **Remove animation** — each entry has a remove control.
- **Detail controls** for the selected animation entry: effect type dropdown, direction selector (shown only for effects that have a direction), trigger mode selector (on click / with previous / after previous), duration slider or numeric input (ms), delay slider or numeric input (ms).

**Do not use color-coding by animation category (no green/yellow/red).** Differentiate entries through icons and labels only, keeping the visual style consistent with the rest of Prose's panels — clean, minimal, monochrome with the accent color used sparingly for selection and active states.

**Grouping simultaneous animations:** animations with "with previous" trigger that play together should be visually associated in the list — for example slightly indented under or bracketed with the animation they play alongside, so the user can see at a glance which animations fire simultaneously versus sequentially. Determine the cleanest visual treatment for this that does not rely on color.

### Slide transition controls

Slide transition settings do not need their own panel — they apply per slide and can live either in the animations panel as a section at the top (since the animations panel is slide-scoped) or in the three-dots menu / a small transition control. Recommended: put a "Slide transition" section at the top of the animations panel showing the current slide's transition type (dropdown) and duration (slider), above the element animation sequence list. This keeps everything animation-related in one place.

### Preview mode

A preview mode that plays all animations and the transition on the current slide without entering full presentation mode.

- A "Preview" button in the animations panel.
- Clicking it plays the current slide's entrance — first the slide transition (as if navigating to this slide), then all element animations in sequence, respecting their trigger modes (on-click animations auto-advance during preview with a short pause between them so the full sequence plays automatically, or require clicks — Claude Code decides; auto-advancing with a brief pause is the better preview UX so the user sees everything without clicking).
- The preview plays within the editor canvas area, not fullscreen. A subtle overlay or indicator shows that a preview is playing, with the ability to stop/replay.
- After the preview completes, the slide returns to its normal edited state with all elements visible.

The note about preview mode is kept — it is a genuinely useful feature for tuning animations without launching the whole presentation. Implement it.

### Playback in presentation mode

In actual presentation mode, animations play according to their trigger modes:
- On entering a slide, play the slide transition.
- After the transition, elements with no entrance animation are visible immediately. Elements with an entrance animation are hidden until their animation plays.
- The first advance input (click, spacebar, right arrow) plays the first "on click" animation in the sequence, along with any "with previous" animations chained to it and any "after previous" animations that follow, until the next "on click" animation is reached (which waits for the next advance input).
- When all animations on the slide have played, the next advance input navigates to the next slide (playing that slide's transition).
- Exit animations play in sequence as defined, treated as steps in the same advance sequence.

### Technical implementation notes

- Implement all animations as CSS keyframe animations and transitions, applied by toggling classes or inline animation properties on element wrappers. Avoid JavaScript animation loops for the actual motion — CSS animations are GPU-accelerated and smoother.
- Define a keyframes library — one set of `@keyframes` per effect (fade, fly with directional variants, zoom, bounce with overshoot easing, wipe via clip-path). Parameterize duration and delay via CSS variables or inline style so each instance can have its own timing.
- The playback engine is a small state machine that walks the slide's animation sequence, respecting trigger modes, applying the appropriate animation class to each element at the right time, and waiting for advance input on "on click" steps. Use `animationend` events to detect when an animation completes so "after previous" steps chain correctly.
- Transitions between slides apply animation classes to the slide container(s). For directional transitions both the outgoing and incoming slide need to animate simultaneously — render both briefly during the transition, animate them, then unmount the outgoing slide on `animationend`.
- The same playback engine drives both preview mode and real presentation mode — preview mode is the engine running in the editor canvas with auto-advance; presentation mode is the engine running fullscreen with user advance input. Share the code.
- Store animation state in the slide/element data model, serialized in the `.prose` file content, included in auto-save and undo/redo.

### UX requirements

- Adding a first animation to an element should feel immediate and obvious — when an element is selected and has no animation, the panel makes clear how to add one.
- Changing duration/delay should optionally show a tiny inline preview of just that one animation on the canvas so the user gets immediate feedback without running the whole preview.
- The reorder drag in the panel must be as smooth as the tab reorder — transform-based, animated, no jank.
- The resizable right sidebar shared with the AI panel must remember its width across both panels and across sessions (store in settings).
- Keyboard: with an animation entry selected, Delete removes it; this should not conflict with deleting the element on the canvas (the panel having focus determines which delete applies).

### Security

- Animation configs are simple structured data (enums and numbers) — validate effect types against the known set and clamp duration/delay to sane ranges (e.g. 0–10000ms) on load and save. Never accept arbitrary animation type strings that could be injected into class names without validation.

---

## Implementation order

1. Item 2 — ESC to exit presentation (quick, isolated)
2. Item 1 — Slides context menu fixes (quick, isolated)
3. Item 3 — Music status on dashboard (quick, isolated)
4. Item 4 — Smooth tab reordering (prerequisite for Item 5)
5. Item 6 — Animations and transitions (large, self-contained)
6. Item 5 — Chrome-style tab tearing (largest, hardest, build incrementally per the sub-steps above)

Do Item 5 last because it is the highest risk — if it takes longer than expected, everything else is already done and shippable. Build Item 5 in the five incremental sub-steps listed in its section, verifying each before proceeding.

---

## General requirements for all items

- No hardcoded colors anywhere — Tailwind classes and CSS variables (`hsl(var(--primary))` etc.) only.
- All animations and transitions in the UI itself (panels, drags, sidebars) match the existing app's motion language — quick, ease-out, subtle.
- Every new piece of state that should persist goes through the existing settings or file serialization systems — nothing persisted in localStorage.
- All new IPC handlers follow existing validation and sanitization patterns.
- Maintain tab compatibility and autosave compatibility throughout — every change that mutates file content triggers the existing debounced auto-save and integrates with the existing undo/redo where applicable.
- Do not break or alter any unrelated existing functionality.
