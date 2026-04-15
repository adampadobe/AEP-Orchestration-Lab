# Diagram editor — architecture note (discovery + integration plan)

This document summarizes how the **animated AEP & Apps architecture diagram** works today in this repo, and where a **Visio-like edit mode** should integrate **without changing playback behavior** when edit mode is off.

**Scope:** The primary in-scope surface is the Profile Viewer page **`web/profile-viewer/aep-architecture-apps.html`** driven by **`web/profile-viewer/aep-architecture-apps.js`**. Other “diagram” UIs in the repo (React tutorials, experimentation visualiser, etc.) use different stacks and are out of scope unless explicitly adopted later.

---

## 1) Renderer entry point and stack

| Piece | Location | Role |
|--------|----------|------|
| Page shell + SVG markup | `web/profile-viewer/aep-architecture-apps.html` | Static SVG scene: node groups, flow `<path>` elements, layers (`#layer-user-lines`, custom boxes, etc.). |
| Behavior | `web/profile-viewer/aep-architecture-apps.js` | State index, `applyState()`, drag/resize, user lines, custom boxes, master JSON save/load, highlight overrides. |
| Shared diagram utilities | `web/profile-viewer/diagram/model.js`, `editor-model.js`, `selection.js`, `undo.js` | **Vanilla JS**, no React. `AEPDiagram.model.migrateLayout` (v8+ scene), **`AEPDiagram.editorModel`** (typed view + `validateDiagramModel` over master JSON), `AEPDiagram.selection.create`, `AEPDiagram.undo.createStack`. |

**Rendering technology:** **SVG in HTML**, animated with **CSS** (stroke dash / visibility classes), not WebGL/canvas. There is **no** XState / `useReducer` / React on this page.

---

## 2) “State machine” (playback)

Playback is **not** a general-purpose graph runtime. It is a **fixed-length array** of presentation states:

- **Definition:** `var STATES = [ ... ]` in `aep-architecture-apps.js` (16 entries).
- **Each state** includes:
  - **`label`**, **`headline`**, **`body`** — HUD copy.
  - **`highlights`** — array of **DOM element `id` strings** for architecture nodes (e.g. `'node-aep'`, `'node-edge'`).
  - **`flows`** — array of `{ id, stroke, kind }` where **`id` is the SVG `<path id="...">`** for a connector; `kind` is `'ingress' | 'intra' | 'egress'` for dash styling via `data-flow-kind`.

- **Current index:** module variable `idx` (0-based).
- **Navigation:** `go(delta)`, `setState(i)`-style helpers (see same file) advance `idx` and call **`applyState()`**.

**Overrides:** Per-state highlight lists can be overridden in the UI and persisted as `archStateHighlightOverrides` (localStorage key `aepArchStateHighlightOverrides`). `archHighlightsForState(stateIndex)` merges overrides with `STATES[stateIndex].highlights`.

---

## 3) Diagram model (as implemented today)

### 3.1 Fixed architecture nodes (“platform diagram”)

- **Layout source of truth:** `NODE_LAYOUT` in `aep-architecture-apps.js` — per logical key (`tags`, `sources`, `aep`, …) a **`base` translate** and **`rect`** `[x, y, w, h]` in world space.
- **User adjustments:** `archDrag.pos[key]` stores **`{ x, y }`** offsets and optional **`w, h`** overrides vs defaults from `NODE_LAYOUT`.
- **DOM:** Nodes are SVG groups/elements with class **`arch-node`** and **stable ids** like `node-<key>` (e.g. `id="node-aep"`).

Playback highlighting targets these **ids** — they must remain stable for `STATES` and overrides to keep working.

### 3.2 Flow edges (animated)

- **Authoring:** Paths are **authored in HTML** with `class="arch-flow"` and ids such as `flow-tags-edge`.
- **Playback:** `applyState()` walks **all** `.arch-flow` elements; for the current state it sets **`is-visible`**, **`data-flow-kind`**, and **`style.stroke`** from the active flow spec; inactive paths lose `is-visible` and clear stroke/kind.

There is **no** separate edge object graph for the built-in flows — the **path geometry is static SVG `d` attributes** unless extended later.

### 3.3 User-authored overlays (already partially “editor-like”)

These are serialized in **master layout JSON** (`archMasterSerialize` / `archMasterApply`, version **8**):

| Concern | In-memory | Serialized fields |
|---------|-----------|---------------------|
| Node offsets/sizes | `archDrag.pos` | `nodes` |
| Floating labels | `archLabel.state` | `labels` |
| User connectors | `userLines.lines` | `userLines` |
| Sources column dividers | `archSourcesDividers` | `sourcesDividers` |
| Custom boxes | `archCustomBoxes` | `customBoxes` |
| Highlight overrides | `archStateHighlightOverrides` | `stateHighlightOverrides` |

`diagram/model.js` also builds a **`scene`** view via `legacyToScene()` (nodes/edges/guides) for forward-looking unified modeling.

---

## 4) How highlights and animations are applied

### Nodes

- **`applyState()`** → **`archRefreshNodeHighlightClasses()`**  
  For each `.arch-node`, toggles class **`is-highlighted`** if `el.id` is in the active highlight list for `idx`.

### Flows

- **`applyState()`**  
  For each `.arch-flow` path: if its `id` is in the current state’s flow list, add **`is-visible`**, set **`data-flow-kind`**, set stroke; otherwise remove visibility and clear attributes.

### CSS / motion

- File header in `aep-architecture-apps.js` documents: **flow animation via CSS** (`stroke-dasharray` + keyframes) on **`.is-visible`**. Playback mode must keep this class contract identical.

### Intro state

- Viewport class **`arch-int-viewport--intro`** toggled when `idx === 0` (static overview, no flow animation for that state).

---

## 5) Tech choice for “Visio-like” editing (decision)

| Option | Fit for this page |
|--------|-------------------|
| **@xyflow/react** | Poor default fit: the scene is a **large hand-authored SVG**, not a React node graph. Adopting React Flow would imply a **parallel renderer** or a full port — high regression risk for animations and layout. |
| **tldraw** | Whiteboard-infinite-canvas; would **not** preserve the fixed AEP diagram as-is without embedding as static background — awkward for tight integration with existing `STATES` / `.arch-flow` IDs. |
| **Extend existing SVG + pointer tooling (recommended)** | Matches current stack: **`archDrag`**, resize handles, user lines, custom boxes, Sources dividers, alignment guides already exist. Add **Edit Mode** as a **global interaction gate**, **selection** via `AEPDiagram.selection`, **history** via `AEPDiagram.undo`, and a **structured DiagramModel** adapter that maps to/from today’s serialized JSON. |

**Decision:** Implement **Visio-lite editing on the existing SVG** (pointer events, handles, inspector), reusing `diagram/selection.js` and `diagram/undo.js`, and only introduce a heavy framework if a future rewrite explicitly targets it.

---

## 6) Integration points for Edit Mode vs Playback Mode

### 6.1 Playback Mode (default — must stay pixel- and behavior-identical)

- State stepping (`go`, dot buttons, keyboard), `applyState()`, HUD updates, flow CSS classes — **unchanged code paths**.
- Optional: centralize “is playback allowed” checks only where new edit handlers would otherwise fire.

### 6.2 Edit Mode (new)

- **Disable / pause** state machine navigation: block `go`, keyboard next/prev, and state dot clicks **or** no-op them with a clear UI hint (“Return to playback”).
- **Pointer routing:** Editing gestures (selection marquee, drag, resize, connector draw) only register when Edit Mode is on; existing `archDrag` toggle may be folded into or governed by this mode.
- **Animated flows in edit:** Default off; optional **per-edge “Preview flow animation”** in inspector toggles `.is-visible` / preview class for **one** path without advancing `STATES` (separate from `applyState()` full pass, or a guarded subset).

### 6.3 Mapping: editable model ↔ playback

- **`STATES`** remains the **source of truth for which ids are highlighted and which flow ids animate** in playback.
- **Editable geometric model** (positions, sizes, optional new shapes) should feed **the same DOM ids** the state machine references:
  - **Prefer forbidding edits to stable ids** for built-in nodes (`node-*`, `flow-*`) or treat renames as a migration transaction that updates `STATES` + overrides + serialized refs (high risk — avoid for MVP).
- **PlaybackViewModel** (conceptual): “current `idx` + resolved highlights + active flow ids + stroke/kind” — today this is just `applyState()` reading `STATES[idx]` and overrides.

---

## 7) Proposed implementation order (aligned with project instructions)

1. **Types / interfaces** — Add `DiagramModel`, `NodeModel`, `EdgeModel` (TypeScript definitions or JSDoc in a dedicated module) + **adapter** from current `archMasterSerialize` shape; no behavior change.
2. **Edit Mode toggle** — UI + `document` / `window` flag; playback handlers short-circuit when editing.
3. **Selection overlay** — Wire `AEPDiagram.selection.create()`; Shift multi-select; visual selection chrome without moving nodes incorrectly.
4. **Transforms** — Reuse/extend `archDrag` / resize for registered nodes; snap + guides already partially implemented.
5. **Connectors** — Extend `userLines` model or introduce edge records that still render to SVG without breaking `.arch-flow` playback paths.
6. **Inspector + left palette** — Property panel + toolbox (new node **types** likely map to **custom boxes** or new scene nodes in `scene.nodes` with rendering hooks).
7. **Persistence** — Validate import/export against schema; keep `version: 8` migration path via `migrateLayout`.
8. **Undo/redo** — `AEPDiagram.undo.createStack` with snapshots of the editable model subset.
9. **Tests** — Unit tests for validation + undo stack; smoke/e2e for “edit → undo → playback step” (tooling TBD: likely Playwright or lightweight DOM test if present in repo).

---

## 8) File reference (quick)

| Topic | Primary files |
|--------|----------------|
| States & `applyState` | `web/profile-viewer/aep-architecture-apps.js` (`STATES`, `idx`, `applyState`, `archRefreshNodeHighlightClasses`) |
| SVG scene | `web/profile-viewer/aep-architecture-apps.html` (`.arch-node`, `.arch-flow`) |
| Layout / drag | `aep-architecture-apps.js` (`NODE_LAYOUT`, `archDrag`, `archDragApply`, …) |
| Master JSON | `archMasterSerialize`, `archMasterApply`, `LS_MASTER` |
| Scene migration | `web/profile-viewer/diagram/model.js` |
| Selection / undo primitives | `web/profile-viewer/diagram/selection.js`, `undo.js` |

---

## 9) Open questions (to resolve during MVP design)

- Should **new** diagram elements be **only** `customBoxes` + `userLines`, or should **`scene.nodes` / `scene.edges`** become the canonical store with renderers for each `kind`?
- How much **flow path editing** is allowed without recomputing `d` — **MVP: optional**; orthogonal routing listed as polish.
- **E2E** runner: confirm whether the repo already has Playwright/Cypress; if not, add minimal smoke test harness in CI.

---

## 10) Implemented (incremental)

- **`diagram/editor-model.js`:** `AEPDiagram.editorModel` — `fromMasterPayload` (delegates to `migrateLayout`), `toSerializablePayload`, `validateDiagramModel`. **Import JSON** rejects invalid payloads with an alert listing validation errors.
- **Edit diagram toggle (`#archEditModeToggle`):** When on, **playback is paused**: `go` / `goTo` no-op, Arrow Left/Right do not advance states (after Escape-for-reveal-tools handling), Previous/Next and state dots are **disabled**. Visuals for the current state stay as-is until the user turns Edit off. Default (toggle off) matches prior behavior.
- **Undo / redo:** `AEPDiagram.undo.createStack` — snapshots omit `savedAt` so identical layouts dedupe. **Undo / Redo** buttons in the Layout file panel; **⌘/Ctrl+Z** and **⌘/Ctrl+Shift+Z** (redo). Pushes after node drag/resize, Sources divider edits, custom box move/resize/delete, user line add/delete, and successful import.
- **Selection (Edit mode):** `AEPDiagram.selection` — click platform `g.arch-node` (not custom boxes) to select; **Shift+click** multi-select; click empty SVG to clear. **Layout drag** still updates selection to the node you moved. Selection clears when leaving Edit mode.
- **Inspector:** With exactly **one** platform node selected, the Layout panel shows key, title (`ARCH_NODE_LABELS`), and element id plus a tip for label editing.
- **Palette:** **Add shape** — Process, Data store, External system — inserts a **custom box** with preset size/colors near the diagram center (staggered), adds it to the current state’s highlight overrides when needed, and records **undo**. **Text note** adds a wide, low box for annotations.
- **Custom box:** **Duplicate** next to Delete; selection readout lists platform nodes and/or the active custom box; inspector prioritizes the custom box when one is selected.

---

*Last updated: text note preset, duplicate, unified selection/inspector for custom boxes.*
