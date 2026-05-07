# HTML Rules — [client-slug]-journey.html

Full specification for the interactive HTML journey file.

---

## Overview

A single self-contained HTML file with no external dependencies. Three sections:
- **CSS** — styling, brand colours, node animation, data panel, right panel
- **HTML body** — left panel (78%) + right panel (22%)
- **JavaScript** — `slides[]` array + `renderContent()` + `animateOverview()`

Save to `/mnt/user-data/outputs/[client-slug]-journey.html`.

---

## HTML body structure

```html
<div class="slide">
  <!-- LEFT PANEL -->
  <div class="left-panel">
    <div class="header">
      <!-- client logo img + onerror fallback + "Adobe Experience Platform" title -->
    </div>
    <div class="journey-map-container" id="journey-map-container">
      <svg class="journey-svg" viewBox="-20 -10 1040 230" id="journey-svg">
        <!-- base path, active path, 12 nodes -->
      </svg>
    </div>
    <!-- Data panel: hidden on overview, visible on steps -->
    <div class="data-panel">
      <div class="data-panel-title">Adobe Experience Platform — Live Data View</div>
      <div class="data-grid">
        <!-- 6 columns — see Column structure below -->
      </div>
    </div>
  </div>

  <!-- RIGHT PANEL -->
  <div class="right-panel">
    <!-- Adobe wordmark (red), nav dots, slide label, description, persona avatar, prev/next arrows -->
  </div>
</div>
```

**Data panel title CSS — bold and prominent:**
```css
.data-panel-title {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 2.5px;
  color: #1a1a1a;
  padding: 8px 16px;
  border-bottom: 2px solid #1a1a1a;
  flex-shrink: 0;
  background: #ffffff;
}
```

**Adobe wordmark in right panel — always at the top:**
```html
<div style="margin-bottom: 12px; flex-shrink: 0;">
  <span style="font-family: Arial Black, Arial, sans-serif; font-weight: 900; font-size: 22px; color: #FA0F00; letter-spacing: -0.5px;">Adobe</span>
</div>
```

---

## Data panel — 6 columns

```html
<div class="data-grid">

  <!-- Col 1: Data Collected -->
  <div class="data-col">
    <div class="data-col-header">Data Collected</div>
    <div id="col-data"></div>
  </div>

  <!-- Col 2: Data Ingestion + Segments (50/50 vertical split) -->
  <div class="data-col col-ingestion-wrap" style="padding:0;">
    <div class="col-half" style="padding: 8px 10px 4px;">
      <div class="data-col-header">Data Ingestion</div>
      <div id="col-ingestion"></div>
    </div>
    <div class="col-half" style="padding: 6px 10px 4px;">
      <div class="col-sub-header">Segments</div>
      <div id="col-segments"></div>
    </div>
  </div>

  <!-- Col 3: Identities -->
  <div class="data-col">
    <div class="data-col-header">Identities</div>
    <div id="col-identities"></div>
  </div>

  <!-- Col 4: Journey Orchestration (Foundation) OR Journey Orchestration + Decisioning (Advanced) -->

  <!-- FOUNDATION — no decisioning split -->
  <div class="data-col" style="padding: 8px 10px 4px;">
    <div class="data-col-header">Journey Orchestration</div>
    <div id="col-orch"></div>
  </div>

  <!-- ADVANCED — 50/50 split with Decisioning sub-section -->
  <div class="data-col col-orch-wrap" style="padding:0;">
    <div class="col-half" style="padding: 8px 10px 4px;">
      <div class="data-col-header">Journey Orchestration</div>
      <div id="col-orch"></div>
    </div>
    <div class="col-half" style="padding: 6px 10px 4px;">
      <div class="col-sub-header">Decisioning</div>
      <div id="col-decisioning"></div>
    </div>
  </div>

  <!-- Use the Foundation version for Foundation journeys, Advanced version for Advanced.
       Only one of the above should appear in the generated HTML. -->

  <!-- Col 5: Activation / Destinations -->
  <div class="data-col">
    <div class="data-col-header">Activation / Destinations</div>
    <div id="col-activ"></div>
  </div>

  <!-- Col 6: Existing [Client] Technology -->
  <div class="data-col">
    <div class="data-col-header">Existing [Client] Technology</div>
    <div id="col-tech"></div>
  </div>

</div>
```

**CSS for the two split columns (Ingestion+Segments and Orchestration+Decisioning):**

Use CSS grid with `grid-template-rows: 1fr 1fr` so both halves are permanently equal
regardless of how much content accumulates in the top half. This keeps Segments and
Decisioning anchored at the midpoint of the column at all times — they do not move as
items are added above them.

```css
.col-ingestion-wrap,
.col-orch-wrap {
  display: grid;
  grid-template-rows: minmax(80px, 1fr) minmax(80px, 1fr);
  padding: 0;
  overflow: hidden;
}

/* minmax(80px, 1fr) guarantees each half is at least 80px tall so Segments and
   Decisioning always start at the visual midpoint even when the top section is empty */

.col-half {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px 4px;
  min-height: 0;
}

.col-half:first-child {
  border-bottom: 1px solid #eeeeee;
}

/* Push Segments and Decisioning visually down so they don't crowd the top */
.col-half:last-child {
  padding-top: 28px;
}
```

---

## CSS — key variables to set per client

### Layout

```css
body {
  font-family: 'Segoe UI', Arial, sans-serif;
  background: #f7f7f7;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: stretch;
}

.slide { display: flex; width: 100vw; height: 100vh; }

.left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f7f7f7;
  overflow: hidden;
}

.right-panel {
  flex: 0 0 22%;
  background: BRAND_COLOUR;
  color: #ffffff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;  /* ensures text inside is centred, not just the container */
  padding: 20px;
}
```

### Data grid and journey SVG

```css
/* data-grid: flex NOT grid — equal columns via flex: 1 on each .data-col */
.data-grid {
  display: flex;
  min-height: fit-content;  /* grows to content height — data-panel scrolls it */
  border-top: none;
}

.data-col {
  flex: 1;
  padding: 8px 10px 6px;
  border-right: 1px solid #eeeeee;
  overflow-y: visible;  /* no per-column scroll — data-panel is the single scroll container */
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.data-col:last-child { border-right: none; }

/* journey-svg: height: auto — lets the SVG scale naturally in the container */
.journey-svg { width: 100%; height: auto; overflow: visible; }
```

### Overview mode — data panel collapses, SVG expands

The overview slide hides the data panel and expands the SVG to fill all available space.
This is handled by toggling two CSS classes — transitions handle the animation.

```css
/* Data panel — visible by default, collapses on overview */
.data-panel {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-top: 3px solid BRAND_COLOUR;
  overflow-y: auto;   /* single scroll container for all columns */
  overflow-x: hidden;
  margin: 0 16px 10px;
  border-radius: 0 0 6px 6px;
  opacity: 1;
  max-height: 2000px;
  transform: translateY(0);
  transition: opacity 0.65s ease,
              max-height 0.75s cubic-bezier(0.4, 0, 0.2, 1),
              margin-bottom 0.75s ease,
              transform 0.65s ease;
}

/* Hidden state — collapses smoothly with a slight upward slide */
.data-panel.hidden {
  max-height: 0;
  opacity: 0;
  transform: translateY(18px);
  margin-bottom: 0;
  border-top-width: 0;
  pointer-events: none;
}

/* Journey map container — compact by default, expands on overview */
.journey-map-container {
  padding: 4px 16px 0;
  flex-shrink: 0;
  flex-grow: 0;
  display: flex;           /* always flex — prevents layout jump on transition */
  align-items: center;
  transition: flex-grow 0.7s cubic-bezier(0.4, 0, 0.2, 1), padding 0.7s ease;
}

.journey-map-container.expanded {
  flex-grow: 1;
  padding: 16px 40px 20px;
}

.journey-map-container.expanded .journey-svg {
  height: 100%;
  width: 100%;
}
```

### Colour theme — light background, branded right panel

**Background colours:**
- `body` and `.left-panel`: `#f7f7f7`
- `.header`: `#ffffff` with `border-bottom: 1px solid #e5e5e5`
- `.data-panel`: `#ffffff`
- Column borders: `#eeeeee`

**Brand colour replacements — replace these two values per client:**
- `BRAND_COLOUR` — client's primary brand colour. Apply to:
  - `.data-panel` top border
  - `.journey-active` stroke
  - `.node-active .node-circle` fill and stroke
  - `@keyframes nodePulse` drop-shadow
  - `.data-col-header` and `.col-sub-header` text colour
  - `.right-panel` background
  - Persona avatar circle fill
- `BRAND_COLOUR_DARK` — darker shade for the right panel if primary is too light. If primary is dark (navy, deep red, forest green etc.) use it directly; if light (yellow, cyan etc.) use a darkened version.

**Right panel text colour:** white (`#ffffff`) if brand colour is dark; `#1a1a1a` if light.

### Node styles

```css
.node-circle {
  fill: #fff;
  stroke: #ccc;
  stroke-width: 2;
  transition: fill 0.3s, stroke 0.3s;
  r: 13;
}

.node-active .node-circle {
  fill: BRAND_COLOUR;
  stroke: BRAND_COLOUR;
  animation: nodePulse 1.5s ease-in-out infinite;
}

@keyframes nodePulse {
  0%, 100% { filter: drop-shadow(0 0 0px rgba(0,0,0,0)); }
  50%       { filter: drop-shadow(0 0 6px BRAND_COLOUR_ALPHA); }
}

.node-label {
  font-size: 8.5px;
  fill: #444;
  text-anchor: middle;
}

.node-active .node-label { font-weight: 700; }

/* Emoji wrapper — uses HTML flexbox for reliable centering */
.node-emoji {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  line-height: 1;
  user-select: none;
}
```

### Active path and item styles

```css
.journey-base {
  fill: none;
  stroke: #ddd;
  stroke-width: 2;
}

.journey-active {
  fill: none;
  stroke: BRAND_COLOUR;
  stroke-width: 3;
  stroke-linecap: round;
  opacity: 0;
}

.journey-active.visible {
  opacity: 1;
  transition: opacity 0.6s ease;
}

/* Active — soft mint wash highlight for newly captured items */
.data-item.active, .seg.active {
  color: #1a1a1a;
  background: rgba(80, 200, 120, 0.18);
  border-left: 2px solid rgba(80, 200, 120, 0.7);
  font-weight: 600;
}

/* Past — dimmed but readable */
.data-item.past, .seg.past { opacity: 0.38; }
```

---

## SVG journey map

**ViewBox:** `-20 -10 1040 230`

The `-20 -10` offset gives breathing room on the left (for node 1) and top (for top-node
labels that sit above the SVG path area). Always use this exact viewBox.

**12 node positions** — alternating top (y ≈ 52–70) and bottom (y ≈ 158–168):

| Node | cx  | cy  | Position | foreignObject x | foreignObject y |
|------|-----|-----|----------|-----------------|-----------------|
| 0    | 25  | 168 | bottom   | 12              | 155             |
| 1    | 113 | 65  | top      | 100             | 52              |
| 2    | 200 | 158 | bottom   | 187             | 145             |
| 3    | 288 | 58  | top      | 275             | 45              |
| 4    | 376 | 168 | bottom   | 363             | 155             |
| 5    | 464 | 62  | top      | 451             | 49              |
| 6    | 552 | 158 | bottom   | 539             | 145             |
| 7    | 640 | 55  | top      | 627             | 42              |
| 8    | 726 | 165 | bottom   | 713             | 152             |
| 9    | 814 | 52  | top      | 801             | 39              |
| 10   | 900 | 168 | bottom   | 887             | 155             |
| 11   | 982 | 70  | top      | 969             | 57              |

foreignObject x = cx − 13, foreignObject y = cy − 13 (circle radius is 13).

**Base path** (copy verbatim):
```
M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158
C 228,158 260,58 288,58 C 316,58 348,168 376,168
C 404,168 436,62 464,62 C 492,62 524,158 552,158
C 580,158 612,55 640,55 C 668,55 698,165 726,165
C 754,165 786,52 814,52 C 842,52 872,168 900,168
C 922,168 958,70 982,70
```

**Node structure — use `foreignObject` for emoji, not SVG `<text>`:**

SVG `dominant-baseline` is unreliable for emoji across browsers. Always use a `foreignObject`
containing a flexbox div to center emoji perfectly:

```html
<g class="node-group" id="node-N" onclick="goTo(N+1)">
  <circle class="node-circle" cx="CX" cy="CY"/>
  <foreignObject x="CX-13" y="CY-13" width="26" height="26" style="pointer-events:none;">
    <div xmlns="http://www.w3.org/1999/xhtml" class="node-emoji">EMOJI</div>
  </foreignObject>
  <!-- Top node: labels sit ABOVE -->
  <text class="node-label" x="CX" y="CY-26">Line 1</text>
  <text class="node-label" x="CX" y="CY-36">Line 2</text>
  <!-- Bottom node: labels sit BELOW -->
  <text class="node-label" x="CX" y="CY+26">Line 1</text>
  <text class="node-label" x="CX" y="CY+36">Line 2</text>
</g>
```

**Node label positioning:**
- Top node (cy < 110): line1 at `cy − 26`, line2 at `cy − 36`
- Bottom node (cy ≥ 110): line1 at `cy + 26`, line2 at `cy + 36`

**`pathSegs[]` — cumulative active trail (12 entries, indices 0–11):**
```javascript
const pathSegs = [
  '',                                                    // [0] overview — no trail
  'M 25,168 C 55,168 85,65 113,65',                    // [1] through node 1
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158',  // [2] through node 2
  // ... each entry extends the previous by one segment
  // [11] = full path through all 12 nodes
];
```

Index N = cumulative path from node 0 through node N. The array has 12 entries (0–11).

**The active trail must stop exactly at the current node — never extend toward the next.**
Use `pathSegs[s.activeNode]` directly. Using `s.activeNode + 1` causes the trail to
overshoot and visually bleed into the next step:

```javascript
const pi = s.activeNode;  // NOT activeNode + 1
if (s.activeNode >= 0 && pi > 0) {
  seg.setAttribute('d', pathSegs[pi]);
  seg.classList.add('visible');
} else {
  seg.removeAttribute('d');
  seg.classList.remove('visible');
}
```

Step 1 (activeNode=0) correctly shows no trail — just the highlighted node. From step 2
onward the trail grows one segment at a time, ending precisely at the active node.

---

## Customer Journey Analytics in the HTML

CJA insights and CJA-created segments belong in the **Segments box** (`segs`/`segActive`). Journey Orchestration and Activation reference the segment name only — they do not repeat CJA.

```javascript
// CJA-derived segment appears in segs
segs: [
  {i: '📊', l: 'CJA: Pricing\nPage Exit'},
  {i: '💡', l: 'High-Propensity\nTrial-to-Paid'},
],
segActive: ['CJA: Pricing\nPage Exit'],

// AJO references the segment — does not name CJA again
orch: ['AJO: Re-engagement journey — pricing page exit cohort'],
```

Only include CJA segments where they genuinely add to the story. Use `📊` as the segment icon for CJA-derived entries.

---

## slides[] array

One object per slide. Index 0 = overview. Indices 1–12 = journey steps.

```javascript
{
  label: 'Journey',          // 'Overview' for slide 0, 'NN  Step Name' for steps
  activeNode: 2,             // 0-indexed node to highlight; -1 for overview
  desc: '...',               // right panel story beat

  data: ['item', ...],           // Data Collected
  dataActive: ['item', ...],     // newly captured this step → green highlight

  ingestion: ['item', ...],
  ingestionActive: ['item', ...],

  segs: [{i:'🔍', l:'Segment\nName'}, ...],
  segActive: ['Segment\nName', ...],  // must match l exactly — no emoji prefix

  ids: [['ECID (anon)', true], ...],  // [label, isNewThisStep]

  orch: ['item', ...],           // Journey Orchestration
  orchActive: ['item', ...],

  decisioning: ['item', ...],    // Decision Management — Advanced only. Omit entirely on Foundation journeys.
  decisioningActive: ['item', ...],

  activ: ['item', ...],          // Activation / Destinations
  activActive: ['item', ...],

  tech: [{t:'item', a:false}, ...],  // Existing Technology
}
```

**Slide 0 (Overview):** all data arrays empty, `activeNode: -1`, `label: 'Overview'`.

**Mapping from Python script variables:**

| Python source | HTML field | Notes |
|--------------|-----------|-------|
| `STEP_LABELS[n][0]` | Node label text in SVG | Strip `"NN  "` prefix |
| `DESCRIPTIONS[n]` | `desc` | Skip index 2 (empty merge cell) |
| `DATA[n]` bullets | `data` | First arg = status line |
| `ADOBE[n]` ingestion bullets | `ingestion` | |
| `ADOBE[n]` segmentation bullets | `segs` | Convert to `{i, l}` — pick emoji from icon guide |
| `ADOBE[n]` Journey Optimizer bullets | `orch` | |
| `ADOBE[n]` Brand Concierge bullets | `orch` | Advanced only — include alongside AJO bullets |
| `ADOBE[n]` Decision Management bullets | `decisioning` | Advanced only — omit field entirely on Foundation |
| `ADOBE[n]` activation bullets | `activ` | |
| `TECH[n]` bullets | `tech` | Strip `[confirmed]`/`[assumed]` for display |

`*Active` fields: only items that are **new or triggered at this specific step**.

**Critical rule — every data item must be activated at the step it first appears.**
If an item is in a `data` array but never appears in any `dataActive` array, it will
never be highlighted green — making it look like dead, unexplained data. For each item
added to a `data` array, ensure it is also in the `dataActive` of the same slide.

**Tech column — two-level filter:**
1. **Journey level:** only include technologies that are relevant to this specific journey.
   If a platform plays no part in the journey being described, exclude it from every step.
2. **Step level:** of the journey-relevant tech, only include it in a given step's `tech`
   array when it is actively touched at that moment.

Past entries accumulate and remain visible in a dimmed state as the user navigates forward,
so there is no need to repeat a technology once it has appeared.

---

## JavaScript

### State variables and overview timer

```javascript
let current = 0;
let overviewTimers = [];

function clearOverviewTimers() {
  overviewTimers.forEach(t => clearTimeout(t));
  overviewTimers = [];
}

function resetNodes() {
  for (let n = 0; n < 12; n++) {
    document.getElementById('node-' + n).classList.remove('node-active');
  }
}
```

### animateOverview()

Draws the full journey path smoothly from left to right. Called when navigating to
slide 0. Runs once — no looping.

```javascript
function animateOverview() {
  clearOverviewTimers();
  resetNodes();

  const seg = document.getElementById('active-seg');
  seg.setAttribute('d', pathSegs[11]);  // full path (last index)
  seg.style.transition = 'none';
  seg.style.opacity = '1';
  seg.classList.remove('visible');

  const totalLength = seg.getTotalLength();
  seg.style.strokeDasharray = totalLength + ' ' + totalLength;
  seg.style.strokeDashoffset = totalLength;

  seg.getBoundingClientRect();  // force reflow before animating

  const duration = 7000;  // 7s — slow, cinematic draw
  seg.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.35, 0, 0.45, 1)`;
  seg.style.strokeDashoffset = '0';
}
```

### goTo() — navigation with overview transition

```javascript
function goTo(idx) {
  clearOverviewTimers();
  current = Math.max(0, Math.min(slides.length - 1, idx));

  // Always reset the active segment before rendering
  const seg = document.getElementById('active-seg');
  seg.style.transition = 'none';
  seg.style.strokeDasharray = '';
  seg.style.strokeDashoffset = '';
  seg.style.opacity = '';
  seg.classList.remove('visible');
  seg.removeAttribute('d');
  resetNodes();

  renderContent();

  if (current === 0) animateOverview();
}

function nextSlide() { goTo(current + 1); }
function prevSlide() { goTo(current - 1); }
```

### renderContent()

```javascript
function renderContent() {
  const s = slides[current];
  const isOverview = current === 0;

  // Overview mode: collapse data panel, expand SVG container
  const panel = document.querySelector('.data-panel');
  if (isOverview) {
    panel.classList.add('hidden');
  } else {
    panel.classList.remove('hidden');
  }
  document.querySelector('.journey-map-container').classList.toggle('expanded', isOverview);

  // Right panel
  document.getElementById('slide-label').textContent = s.label;
  document.getElementById('slide-desc').textContent = s.desc;

  // Nav dots
  const dotsEl = document.getElementById('nav-dots');
  dotsEl.innerHTML = slides.map((_, i) =>
    `<div class="nav-dot${i === current ? ' active' : ''}" onclick="goTo(${i})"></div>`
  ).join('');

  // Nodes and active path (skip on overview — animateOverview handles it)
  if (!isOverview) {
    for (let n = 0; n < 12; n++) {
      document.getElementById('node-' + n).classList.toggle('node-active', s.activeNode === n);
    }
    const seg = document.getElementById('active-seg');
    const pi = s.activeNode;
    if (s.activeNode >= 0 && pi > 0) {
      seg.setAttribute('d', pathSegs[pi]);
      seg.classList.add('visible');
    } else {
      seg.removeAttribute('d');
      seg.classList.remove('visible');
    }
  }

  // Data columns
  function accumulate(field, activeField) {
    const seen = new Map();
    for (let i = 0; i <= current; i++) {
      const items = slides[i][field] || [];
      const active = slides[i][activeField] || [];
      items.forEach(t => {
        if (i === current && active.includes(t)) seen.set(t, 'active');
        else if (!seen.has(t)) seen.set(t, 'past');
      });
    }
    return seen;
  }

  // Data Collected
  const dataMap = accumulate('data', 'dataActive');
  document.getElementById('col-data').innerHTML =
    [...dataMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');

  // Data Ingestion
  const ingMap = accumulate('ingestion', 'ingestionActive');
  document.getElementById('col-ingestion').innerHTML =
    [...ingMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');

  // Segments
  function accumulateSegs() {
    const seen = new Map();
    for (let i = 0; i <= current; i++) {
      const segs = slides[i].segs || [];
      const active = slides[i].segActive || [];
      segs.forEach(sg => {
        if (i === current && active.includes(sg.l)) seen.set(sg.l, {i: sg.i, state: 'active'});
        else if (!seen.has(sg.l)) seen.set(sg.l, {i: sg.i, state: 'past'});
      });
    }
    return seen;
  }
  const segMap = accumulateSegs();
  document.getElementById('col-segments').innerHTML =
    [...segMap.entries()].map(([label, {i, state}]) =>
      `<div class="seg${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">
        <span class="seg-icon">${i}</span>
        <span>${label.replace('\n', ' ')}</span>
      </div>`
    ).join('');

  // Identities
  function accumulateIds() {
    const seen = new Map();
    for (let i = 0; i <= current; i++) {
      (slides[i].ids || []).forEach(([label, active]) => {
        if (i === current && active) seen.set(label, 'active');
        else if (!seen.has(label)) seen.set(label, active ? 'active' : 'past');
      });
    }
    return seen;
  }
  const idMap = accumulateIds();
  document.getElementById('col-identities').innerHTML =
    [...idMap.entries()].map(([label, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">
        <span style="font-weight:600">${label}</span>
      </div>`
    ).join('');

  // Journey Orchestration
  const orchMap = accumulate('orch', 'orchActive');
  document.getElementById('col-orch').innerHTML =
    [...orchMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');

  // Decisioning
  const decMap = accumulate('decisioning', 'decisioningActive');
  document.getElementById('col-decisioning').innerHTML =
    [...decMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');

  // Activation / Destinations
  const activMap = accumulate('activ', 'activActive');
  document.getElementById('col-activ').innerHTML =
    [...activMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');

  // Existing Technology
  function accumulateTech() {
    const seen = new Map();
    for (let i = 0; i <= current; i++) {
      (slides[i].tech || []).forEach(({ t, a }) => {
        if (i === current && a) seen.set(t, 'active');
        else if (!seen.has(t)) seen.set(t, 'past');
      });
    }
    return seen;
  }
  const techMap = accumulateTech();
  document.getElementById('col-tech').innerHTML =
    [...techMap.entries()].map(([t, state]) =>
      `<div class="data-item${state === 'active' ? ' active' : state === 'past' ? ' past' : ''}">${t}</div>`
    ).join('');
}
```

### desc length — right panel character limit

Keep each `desc` to **2–3 sentences, maximum ~300 characters**. The right panel is narrow and the text must sit comfortably alongside the persona avatar and nav controls without overflow or wrapping badly.

- Lead with what the customer does
- Close with what the platform triggers in response (if orchActive is non-empty)
- Cut any background context that belongs in the DESCRIPTION row of the PPTX instead

If you find yourself writing more than 3 sentences, split the information: keep the action and trigger in `desc`, and let the data panel columns carry the detail.

---

### orch must be empty when AJO has not fired

Never populate `orch` with placeholder or explanatory text. If AJO has not triggered at a step, `orch` is simply empty.

```javascript
// Wrong
orch: ['AJO: No journey triggered — anonymous visitor']
orch: ['AJO: Checkout intent journey queued — awaiting trigger']

// Correct
orch: []
```

AJO only appears in `orch` when it has actually fired — a journey triggered, an email sent, a web personalisation served.

---

### orchActive must include all new items at the step

Every item in a slide's `orch` array that is genuinely new at that step (i.e. does not appear in any earlier slide's `orch`) must be in `orchActive`. Do not selectively mark only some new items as active.

```javascript
// Wrong — two new items at step 4 but only one marked active
orch: ['AJO: Size-filtered product tiles', 'AJO: Conscious badge on sustainable items'],
orchActive: ['AJO: Size-filtered product tiles'],

// Correct — both are new, both are active
orchActive: ['AJO: Size-filtered product tiles', 'AJO: Conscious badge on sustainable items'],
```

---

### Do not repeat orch items across slides

The `accumulate()` function carries `orch` items forward automatically — items from earlier slides appear as past entries in the panel without you listing them again. **Do not copy orch items from a previous slide into a later slide's `orch` array.** Duplicate entries are noise and do not change what the panel displays.

```javascript
// Wrong — step 4 items unnecessarily repeated in step 5
slides[4].orch = ['AJO: Size-filtered tiles', 'AJO: Conscious badge']
slides[5].orch = ['AJO: Size-filtered tiles', 'AJO: Conscious badge', 'Brand Concierge: ...']

// Correct — step 5 only lists what is new at step 5
slides[5].orch = ['Brand Concierge: asked about outfit — guided to coordinating workwear set']
```

---

### Data write-backs do not belong in orch

Profile enrichment events — such as conversation intent being written back to AEP, or a profile attribute being updated — are data ingestion events, not orchestration actions. **Do not put "X written to AEP profile" or "Y attribute updated" in `orch`.** These belong in `ingestion` or `data`, or can be omitted if they are implied by the step.

```javascript
// Wrong — data write-back in orch
orch: [
  'Brand Concierge: asked about outfit — guided to workwear set',
  'Concierge intent + workwear affinity written to AEP profile'
]

// Correct — orch contains only the customer interaction; write-back is ingestion
orch: ['Brand Concierge: asked about outfit — guided to workwear set']
ingestion: [..., 'Concierge conversation events via XDM']
```

---

### Identities = persistent person-level identifiers only

The `ids` array represents the AEP identity namespace — persistent identifiers that link a person across interactions and sessions. **Valid identities:** ECID, Email, Member ID, CRMID, Loyalty ID, Phone ID, Account ID.

**Not identities:**
- Order ID — this is a transaction reference, not a person identifier. Include in `data` if relevant.
- Session token / authenticated session token — ephemeral, expires, not a person identifier. Omit entirely.
- Any identifier that cannot be used to recognise the same person in a future session.

```javascript
// Wrong — transaction and session IDs in ids
ids: [['Email', false], ['Member ID', false], ['Order ID', true], ['Authenticated session token', true]]

// Correct — only persistent person-level identifiers
ids: [['Email', false], ['Member ID', false]]
```

---

### Paid media impression data is not available in AEP

Meta, Google, and other paid platforms do not send individual-level impression events to the brand. The brand knows they pushed a segment to Meta Custom Audience; they do not know that a specific customer saw a specific ad. **Never add paid ad impressions to `data` or `ingestion`.** Remove entries like `'Meta ad impression: basket items carousel'` from `data`/`dataActive`.

---

### DM operates on Adobe-owned surfaces only

Decision Management delivers decisions through Journey Optimizer on brand-owned channels: web, app, email, push, SMS. **DM does not control paid media creative selection.** When a segment is pushed to Meta or Google, the ad platform does its own creative selection and delivery. Never attribute Meta/Google ad creative choices to `decisioning`.

```javascript
// Wrong — DM credited with selecting paid media creative
decisioning: ['DM: Outfit bundle carousel creative — abandoned basket items signal']

// Correct — DM covers the AJO push offer; Meta creative is Meta's logic
decisioning: ['DM: 10% Plus discount selected for push notification — loyalty tier signal']
```

---

### Brand Concierge conversational recommendations are not DM

When a customer asks Brand Concierge a question (outfit coordination, product comparison, sizing advice), the answer is generated by BC's LLM using the brand's knowledge base and the customer's AEP profile. This is BC's native capability — **not a Decision Management call.** DM can appear within a BC interaction only if a specific promotional offer from the offer catalogue is being surfaced (e.g. a loyalty discount applied to a recommended product). Never add a DM item for general conversational guidance.

---

### CJA narration — the marketer configures, the segment surfaces

Never write "CJA detects..." or "CJA builds a propensity score" in `desc`. CJA is a tool the marketer uses in CJA Workspace to analyse behaviour and create segments. The segment surfaces as a result of that analysis; CJA does not act autonomously in real time.

```javascript
// Wrong — CJA described as autonomous
desc: 'CJA detects high-affinity browse depth and builds a purchase intent propensity score.'

// Correct — segment surfaces from marketer-configured CJA analysis
desc: 'Deep browse signals feed into a CJA-derived purchase intent segment configured by the marketing team.'
```

CJA segments are listed in `segs`/`segActive`. CJA attribution reports belong in `segs` if they produce a segment, or are omitted from the data panel if purely reporting.

---

### Email or identifier capture = identity must update immediately

If an email or identifier is captured at a step (checkout form, registration, partial email capture), the `ids` array and customer status must reflect this **at that same step** — not carried forward to a later step.

```javascript
// Wrong — email captured at step 5 but ids still shows anonymous
ids: [['ECID (anon)', false]]

// Correct — email captured at step 5, identity updates immediately
ids: [['ECID (anon)', false], ['Email (partial capture)', true]]
// and data[0] changes from 'Anonymous Customer' to 'Known Customer'
```

If the email is what enables an outbound message at the next step, it must be resolved at the capture step — not the delivery step.

---

### SMS requires a Phone ID

If an SMS is sent at any step (in `orch` or `desc`), a Phone ID **must already exist** in `ids` at or before that step. Do not send SMS without a resolved phone identity in the profile.

```javascript
// Wrong — SMS sent at step 9 but no Phone ID in ids
ids: [['ECID (anon)', false], ['Email', false]]
orch: ['AJO: Re-engagement SMS — 15% offer']

// Correct — Phone ID captured at opt-in step (e.g. step 8), present by step 9
ids: [['ECID (anon)', false], ['Email', false], ['Phone ID', false]]
orch: ['AJO: Re-engagement SMS — 15% offer']
```

If marketing opt-in at a step includes SMS, add `Phone ID` to `ids` at that step (marked active if it's the capture moment).

---

### Brand Concierge must have a clear narrative reason

Include Brand Concierge only when the story clearly shows the customer opening the widget and asking something specific. **Do not include it just because the customer is on the website and it technically could be there.** A forced Brand Concierge bullet adds noise without a story payoff.

Ask: what did the customer ask? What did they get? If you cannot answer both, remove it.

---

### desc must reflect orchActive

If `orchActive` is non-empty at a step, the `desc` **must reference what was triggered** — the narrative and the data panel must tell the same story. The `desc` is written from the customer's perspective, but it must close the loop on what the platform did in response.

**Wrong** — AJO fires a welcome journey but desc only describes what the customer did:
```javascript
desc: 'Marcus registers and generates his first API key.',
orchActive: ['AJO: Welcome developer journey triggered', 'AJO: Onboarding email series enrolled'],
```

**Correct:**
```javascript
desc: 'Marcus registers and generates his first API key. Registration triggers an AJO welcome journey and SDK onboarding email series.',
orchActive: ['AJO: Welcome developer journey triggered', 'AJO: Onboarding email series enrolled'],
```

The same principle applies to `activActive` — if a segment is pushed to a paid media destination, the desc should say so.

---

### Tech entries — clean names only, no [confirmed] or [assumed]

`[confirmed]` and `[assumed]` labels are for the PPTX one-pager only — they are audit markers for the user to review before presenting to a client. **Never include them in HTML tech entries.** The HTML is a client-facing artefact.

```javascript
// Wrong
{t: 'Salesforce CRM [confirmed]', a: true}

// Correct
{t: 'Salesforce CRM', a: true}
```

---

### segActive must match the l field exactly — no emoji prefix

The `accumulateSegs()` function matches `segActive` entries against the `l` (label) field of each segment object. The `i` (icon/emoji) field is stored separately and never part of the key. **Never include the emoji in a `segActive` entry** — it will fail to match and the segment will never highlight.

```javascript
// Wrong — emoji prefix breaks the match
segs: [{i: '📩', l: 'Email\nEngaged'}]
segActive: ['📩\nEmail\nEngaged']   // won't match — segment stays dimmed forever

// Correct — segActive matches l exactly
segs: [{i: '📩', l: 'Email\nEngaged'}]
segActive: ['Email\nEngaged']
```

This applies to every slide. If any `segActive` entry does not exactly match an `l` value in the same slide's `segs` array, that segment will never highlight.

---

### Email events use AJO tracking — not Web SDK

Web SDK captures events from a browser session on a brand-owned domain. Email open and click events are captured through AJO's own email tracking — they are not Web SDK events.

```javascript
// Wrong
ingestion: ['Email engagement events via AEP Web SDK']

// Correct
ingestion: ['AJO email open/click events → ExperienceEvent']
```

---

### CJA belongs in segs — not in orch

CJA is an analytics layer. Its outputs are insights and segments. **Never put CJA items in `orch` or `orchActive`.** CJA attribution reports, funnel analyses, and cohort insights belong in `segs`/`segActive` if they produce a segment, or are omitted from the data panel entirely if they are purely reporting.

```javascript
// Wrong
orch: ['CJA: Full journey attribution report — 7-touch path to conversion']

// Correct — if it produced an insight-driven segment
segs: [{i: '📊', l: 'CJA: 7-Touch\nAttribution'}]
```

---

### AEM Assets belongs inside AJO bullets — not as a standalone orch entry

AEM Assets is a content repository, not an orchestration tool. It has no dedicated column in the HTML data panel. **Never list it as a standalone item in `orch`.** Instead, reference it within the AJO bullet that uses it.

```javascript
// Wrong — AEM Assets listed as if it orchestrates something
orch: [
  'AJO: Welcome journey triggered',
  'AEM Assets: SDK quickstart email template'
]

// Correct — AEM Assets referenced inside the AJO bullet
orch: [
  'AJO: Welcome journey triggered',
  'AJO: Onboarding email using AEM Assets SDK quickstart template'
]
```

---

### Apostrophes in string literals

All `slides[]` string values use single-quoted JS strings. Any apostrophe in content
(it's, she's, don't, customer's, etc.) **must be escaped as `\'`** — unescaped apostrophes
break the string and cause a runtime `SyntaxError: Unexpected identifier`.

```javascript
// WRONG — breaks the JS parser
desc: 'She's comparing mortgage rates...',

// CORRECT
desc: 'She\'s comparing mortgage rates...',
```

Scan every `desc`, `data`, `ingestion`, `orch`, `decisioning`, `activ`, and `tech` string
before writing the file.

### Initialisation and keyboard nav

```javascript
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft')  prevSlide();
});

renderContent();
animateOverview();
```

---

## Icon guide — one emoji per node

| Journey moment | Emoji options |
|---------------|--------------|
| Existing customer / awareness trigger | 🚗 🏠 👤 📱 ⚡ |
| Research / comparison | ⚖️ 🔍 💻 |
| First website / app visit | 🌐 🏠 📲 |
| Product browse / interest | 🛒 📦 🐕 💡 |
| Quote / application / intent | 📋 📝 ✍️ |
| First abandonment / not ready | ☕ ⏸️ ⚠️ |
| Paid retargeting / social | 📱 🎯 📣 |
| Return visit / login / identity | 🔐 🔄 👤 |
| Personalised offer | 💰 🎁 ⭐ |
| Checkout / order start | 🛒 📝 💳 |
| Second abandonment / delay | ☕ ⏸️ 💬 |
| Re-engagement email/SMS | 📧 💬 🔔 |
| Call centre / human contact | 📞 🎧 |
| Conversion / purchase / sign-up | ✅ 🎉 🏆 |
| Analytics / attribution | 📊 📈 |
| Loyalty / rewards | ⭐ 🎖️ 💎 |
| Sustainability | 🌱 ♻️ |

---

## Persona avatar

Include a flat illustrated SVG avatar in the right panel. Use **female** or **male**
version to match the persona. Replace `BRAND_COLOUR` with the client's primary brand colour.

**Female avatar:**
```html
<svg class="persona-avatar" width="90" height="90" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="40" fill="BRAND_COLOUR"/>
  <ellipse cx="40" cy="72" rx="24" ry="14" fill="#2a2a2a"/>
  <rect x="35" y="52" width="10" height="8" rx="2" fill="#e8c9a0"/>
  <ellipse cx="40" cy="44" rx="16" ry="17" fill="#e8c9a0"/>
  <ellipse cx="40" cy="30" rx="16" ry="8" fill="#3d2b1f"/>
  <ellipse cx="24" cy="40" rx="4" ry="10" fill="#3d2b1f"/>
  <ellipse cx="56" cy="40" rx="4" ry="10" fill="#3d2b1f"/>
  <circle cx="34" cy="43" r="2.5" fill="#2a2a2a"/>
  <circle cx="46" cy="43" r="2.5" fill="#2a2a2a"/>
  <circle cx="35" cy="42" r="1" fill="white"/>
  <circle cx="47" cy="42" r="1" fill="white"/>
  <path d="M31 40 Q33 38 36 40" stroke="#2a2a2a" stroke-width="1" fill="none" stroke-linecap="round"/>
  <path d="M43 40 Q45 38 48 40" stroke="#2a2a2a" stroke-width="1" fill="none" stroke-linecap="round"/>
  <path d="M34 51 Q40 56 46 51" stroke="#c87941" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>
```

**Male avatar:**
```html
<svg class="persona-avatar" width="90" height="90" viewBox="0 0 80 80">
  <circle cx="40" cy="40" r="40" fill="BRAND_COLOUR"/>
  <ellipse cx="40" cy="72" rx="24" ry="14" fill="#2a2a2a"/>
  <rect x="35" y="52" width="10" height="8" rx="2" fill="#e8c9a0"/>
  <ellipse cx="40" cy="44" rx="16" ry="17" fill="#e8c9a0"/>
  <ellipse cx="40" cy="29" rx="16" ry="7" fill="#3d2b1f"/>
  <circle cx="34" cy="43" r="2.5" fill="#2a2a2a"/>
  <circle cx="46" cy="43" r="2.5" fill="#2a2a2a"/>
  <circle cx="35" cy="42" r="1" fill="white"/>
  <circle cx="47" cy="42" r="1" fill="white"/>
  <path d="M31 39 Q34 37 37 39" stroke="#3d2b1f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M43 39 Q46 37 49 39" stroke="#3d2b1f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
  <path d="M34 51 Q40 56 46 51" stroke="#c87941" stroke-width="1.5" fill="none" stroke-linecap="round"/>
</svg>
```

```css
.persona-avatar { margin-top: 14px; flex-shrink: 0; }
```
