# journey-html-rules.md â€” Customer Journey HTML Specification

The journey is **one screen inside the combined file** â€” it is not a standalone HTML file.
Read `assets/three-customer-journey.html` as a structural reference, but the output lives inside
`[client-slug]-use-case.html` as `<div id="screen-journey" class="screen">`.

**There is no right panel.** Persona information lives in a horizontal strip at the top of the
slide. The full width is given to the SVG journey map.

**Two-phase interaction model:**
- **Phase 1 (auto):** When the journey screen opens, the grey base path draws left-to-right,
  nodes pop in as the line reaches them, and the persona strip fades in simultaneously.
  Presenter uses this time to frame the story.
- **Phase 2 (click-driven):** A nav bar appears after Phase 1. Each click / Next button / right
  arrow activates the next node â€” filling it with brand colour, revealing its label, narrative,
  and device. â† Prev / left arrow reverses a step.

---

## Slide layout (column flex)

```css
#screen-journey .slide {
  display: flex;
  flex-direction: column;      /* column â€” not row */
  width: 1280px;
  height: 740px;
  background: #f7f7f7;
  box-shadow: 0 12px 48px rgba(0,0,0,0.25);
  overflow: hidden;
  border-radius: 3px;
}
```

The slide is fixed at **1280Ã—740px** â€” do not add `max-width` or `max-height` viewport
constraints. These cause the slide to shrink on typical demo laptops, making nodes and
narratives appear zoomed in and misaligned.

**Why `align-items: flex-start` on the container (not `align-items: center`):**
The card screen uses `align-items: center` and appears vertically centred. Using the same on
the journey screen would clip the header (back button) behind `overflow: hidden` on short
viewports â€” the overflow goes equally above and below, hiding the top of the slide.
`margin: auto 0` on the child achieves the same visual result on tall viewports but
gracefully degrades to top-aligned + scrollable on short ones.

Children stacked top-to-bottom inside `.left-panel` (which is the sole child of `.slide`):
1. `.journey-header` â€” back button, logo, title (flex-shrink: 0)
2. `.persona-strip` â€” translucent brand-colour bar with persona + narrative (flex-shrink: 0)
3. `.journey-map-container` â€” SVG journey map (flex: 1, fills remaining height)
4. `#journey-nav-bar` â€” prev/next buttons + step counter (flex-shrink: 0)

```css
#screen-journey .left-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #f7f7f7;
  overflow: hidden;
  min-width: 0;
  min-height: 0;   /* critical â€” allows flex child to shrink below content height */
}
```

---

## Screen container CSS â€” critical

```css
#screen-journey {
  align-items: flex-start;   /* NOT center â€” centering clips the header on laptop viewports */
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
}

```

**Why `flex-start`:** `align-items: center` pushes the 780px slide into a ~750px viewport,
silently clipping the header (and the back button) behind `overflow: hidden`.

---

## What is fixed â€” copy verbatim

- **Laptop foreignObject SVG** â€” the outer `<foreignObject>` dimensions and the full laptop SVG
  shell (bezel, screen mask, keyboard, hinge). Only customise the screen content inside.
- **Phone SVG** â€” the full `<svg class="device-node">` block for device-4
- **SVG viewBox** â€” always `viewBox="-20 -145 1080 640"`
- **Base path** â€” the grey sinusoidal path string with `id="base-path"` (required for Phase 1)
- **journeyPathSegs[] array** â€” cumulative path segments used for node reveal timing
- **Node positions** â€” all 7 cx/cy coordinates
- **Node count** â€” always exactly 7 nodes

---

## SVG coordinate system

```
viewBox="-20 -145 1080 640"
```

The negative y origin (`-145`) creates headroom for top-node devices (laptops at y=âˆ’95)
and top-node narratives (y=âˆ’58 to y=5). Do not reduce this value.

---

## Node positions (fixed for all clients)

| Node | cx  | cy  | Position |
|------|-----|-----|----------|
| 0    | 40  | 265 | Bottom   |
| 1    | 185 | 70  | Top      |
| 2    | 330 | 265 | Bottom   |
| 3    | 490 | 70  | Top      |
| 4    | 645 | 265 | Bottom   |
| 5    | 800 | 70  | Top      |
| 6    | 950 | 265 | Bottom   |

---

## Base path (fixed) â€” must have id="base-path"

```html
<path id="base-path" class="journey-base"
  d="M 40,265 C 88,265 137,70 185,70
     C 233,70 282,265 330,265
     C 383,265 437,70 490,70
     C 542,70 593,265 645,265
     C 697,265 748,70 800,70
     C 850,70 900,265 950,265"/>
```

`id="base-path"` is required â€” Phase 1 animates this element via `getTotalLength()` and
`stroke-dashoffset`. Without the id the animation breaks silently.

---

## Node circles and initial visibility

```css
.node-group {
  opacity: 0;
  transition: opacity 0.45s ease;
}
.node-group.node-revealed,
.node-group.node-active { opacity: 1; }

.node-circle {
  fill: #fff;
  stroke: #ccc;
  stroke-width: 2;
  r: 18;  /* DO NOT REDUCE â€” sized to contain 22px emoji icons */
  transition: fill 0.3s, stroke 0.3s;
  cursor: pointer;
}
.node-active .node-circle {
  fill: var(--brand);
  stroke: var(--brand);
  animation: nodePulse 1.5s ease-in-out infinite;
}
```

**Node groups start invisible.** During Phase 1, each group gets `.node-revealed` via a
timed callback as the line passes that node, creating a coordinated left-to-right reveal.

---

## Emoji icons

```css
.node-emoji {
  width: 32px;
  height: 32px;
  font-size: 22px;
}
```

```html
<foreignObject x="{cx-16}" y="{cy-16}" width="32" height="32" style="pointer-events:none;">
  <div xmlns="http://www.w3.org/1999/xhtml" class="node-emoji">EMOJI</div>
</foreignObject>
```

---

## Node labels â€” hidden until activated

```css
.node-label {
  font-size: 11px;
  font-weight: 700;
  fill: #333;
  text-anchor: middle;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.4s ease;
}
.node-active .node-label { fill: var(--brand); font-weight: 700; opacity: 1; }
```

Labels are hidden on reveal (Phase 1) and only appear when the node is activated in Phase 2.
This preserves suspense â€” the presenter can frame the step before it lands.

### Top nodes (cy=70)

```html
<text class="node-label" x="{cx}" y="34">Line 1</text>
<text class="node-label" x="{cx}" y="44">Line 2</text>
```

### Bottom nodes (cy=265)

```html
<text class="node-label" x="{cx}" y="302">Line 1</text>
<text class="node-label" x="{cx}" y="313">Line 2</text>
```

---

## Narrative writing principles

Each node has **three or four lines** of caption text. Every line must be a complete sentence with a subject and a verb — no colon-label format ("Segment: High-LTV", "Yael: 14 months"), no incomplete phrases ("Yael logs into"). The presenter reads these aloud in a demo; every line must land as a spoken thought.

The line structure is:

| Line | Content |
|------|----------|
| 1 | What the **customer** does at this moment |
| 2 | What the **system** does in response |
| 3 | The **outcome** — signal fired, segment qualified, profile updated, message sent |
| 4 *(optional)* | Additional context, consequence, or follow-on action |

Use a 4th line whenever three lines feel too terse to tell the story clearly. It is better to use four lines and read well than squeeze into three and lose meaning.

**No padding phrases** ("in real time", "seamlessly", "instantly" — omit unless they add meaning). No mid-sentence line breaks. Each line is one complete thought, ≤32 chars. The character limit is **per line**, not total.

**Good (4 lines, reads naturally):**
```
Yael has not flown in 14 months.       <- customer context
RT-CDP detects the high-LTV lapse.     <- system response
Lapsed member segment qualified.       <- outcome
Win-back journey queued in AJO.        <- follow-on action
```

**Bad (terse labels, no narrative):**
```
Yael: 14 months                        <- label, no verb
RT-CDP flags lapse                     <- abrupt, incomplete
Segment: High-LTV                      <- colon-label format
```

---

## Narrative caption positions

Three or four lines of story text per node. Font: 9.5px, weight 500, fill #444.
Narratives start hidden (`opacity: 0`, class `node-narrative`) and gain class `visible` on activation.

**≤32 chars per line** (per line, not total). The `clip-path` guard on each narrative group is the mechanical backstop against overflow. When using 4 lines, expand the nar-guard height from 48 to 60 for bottom nodes so the 4th line is not clipped.

---

### Positioning rule

**No-device node** — keep the template default: `text-anchor="middle"`, x = cx. No change needed.

**With-device node** — centre the [text block + gap + device] on cx using the formula:

```
text_x   = cx + (text_width − device_width − 8) / 2
device_x = text_x + 8
```

Where:
- `text_width` = chars in longest line × 4.8 SVG units (e.g. 30 chars → 144)
- `device_width`: laptop = 130, phone = 58
- Gap = 8 SVG units (fixed)

After calculating: change `text-anchor` from `"middle"` to `"end"`, set narrative `x` to `text_x`, and set device SVG `x` to `device_x`.

**`text-anchor` is always `"end"` — never `"start"`.** Using `"start"` (text to the right of the device) appears to avoid clipping at the left edge but pushes the narrative into the adjacent node's lane. Both nodes can be visible simultaneously as the user advances; the overlap is immediate and obvious.

**Edge nodes (first and last node):** The formula still applies. For the **first node** (cx ≈ 40, viewBox left edge = −20), a phone-device node has only ~60 SVG units to the left of the device. Cap lines at **≤12 chars** to avoid clipping past the viewBox edge.

---

### Top node — no device

```html
<text text-anchor="middle" x="{cx}" y="-58">Line 1</text>
<text text-anchor="middle" x="{cx}" y="-47">Line 2</text>
<text text-anchor="middle" x="{cx}" y="-36">Line 3</text>
<!-- optional 4th line: -->
<text text-anchor="middle" x="{cx}" y="-25">Line 4</text>
```

### Top node — with device (laptop or phone)

Apply the centering formula to get `text_x` and `device_x`. Y positions are the same as no-device — all top nodes share the same row:

```html
<text text-anchor="end" x="{text_x}" y="-58">Line 1</text>
<text text-anchor="end" x="{text_x}" y="-47">Line 2</text>
<text text-anchor="end" x="{text_x}" y="-36">Line 3</text>
<!-- optional 4th line: -->
<text text-anchor="end" x="{text_x}" y="-25">Line 4</text>
```

**All top-node text sits at y=−58/−47/−36 (−25 if 4 lines) regardless of whether a device is present.** This keeps narrative text level across all top nodes. The old y=−133/−122/−111 positions are no longer used.

### Bottom node — no device (template default)

```html
<text text-anchor="middle" x="{cx}" y="377">Line 1</text>
<text text-anchor="middle" x="{cx}" y="388">Line 2</text>
<text text-anchor="middle" x="{cx}" y="399">Line 3</text>
<!-- optional 4th line: -->
<text text-anchor="middle" x="{cx}" y="410">Line 4</text>
```

### Bottom node — with device (phone or laptop)

Apply the centering formula to get `text_x` and `device_x`. Keep y the same as no-device — both device types share y=377/388/399 (phone centre: 328+60=388; laptop centre: 340+48=388):

```html
<text text-anchor="end" x="{text_x}" y="377">Line 1</text>
<text text-anchor="end" x="{text_x}" y="388">Line 2</text>
<text text-anchor="end" x="{text_x}" y="399">Line 3</text>
<!-- optional 4th line: -->
<text text-anchor="end" x="{text_x}" y="410">Line 4</text>
```

When using a 4th line on bottom nodes, expand the `nar-guard` height from 48 to 60: `<rect ... height="60"/>`.

---

### Worked example — top laptop node (cx=490, 28-char text)

```
text_width = 28 × 4.8 = 134
text_x   = 490 + (134 − 130 − 8) / 2 = 490 + (−4) / 2 = 488
device_x = 488 + 8 = 496
```

Device SVG at x=496, y=−95. Narrative: text_x=488, y=−58/−47/−36, text-anchor="end".

### ClipPath guards (already in template)

Each narrative group in the template has `clip-path="url(#nar-guard-N)"` applied. These clip rects define the safe horizontal lane for each node and prevent text bleeding into adjacent nodes. No code change needed — the guards are already in the template `<defs>` block. They are a mechanical backstop only; write ≤32-char lines so the narrative looks correct before any clipping occurs.

---

## Device positions â€” all four combinations

**Devices are optional.** Not every node needs one. Choose which nodes get a device based on
what best serves the story â€” typically 2â€“4 nodes out of 7. Good candidates are moments where
the customer is actively on a screen: opening an app, receiving a push notification, viewing
a web page, completing a form. Avoid devices at pure data/backend nodes (profile update,
segment calculation) where there's nothing meaningful to show on screen.

**Match device type to channel â€” this is mandatory:**

| Channel at this node | Device to use |
|----------------------|---------------|
| Mobile app (any action inside an app) | **Phone** |
| Push notification received on phone | **Phone** |
| Desktop website / web portal | **Laptop** |
| Ambiguous / both | Default to **Phone** |

A laptop at a node where the customer is using a mobile app is always wrong.
A phone at a node where the customer is on a desktop browser is always wrong.
When in doubt, use phone â€” it is the more common device in consumer journeys.

| Node position | Device | x (≤32-char text) | y | width | height |
|---|---|---|---|---|---|
| Top (cy=70) | Laptop | `cx + 16` | `-95` | 130 | 96 |
| Top (cy=70) | Phone | `cx + 52` | `-108` | 58 | 120 |
| Bottom (cy=265) | Phone | `cx + 52` | `328` | 58 | 120 |
| Bottom (cy=265) | Laptop | `cx + 16` | `340` | 130 | 96 |

**x is formula-based.** Values above assume 32-char max text (the hard limit). For shorter text: `device_x = cx + (text_width − device_width + 8) / 2` where text_width = chars × 4.8. Set narrative `text_x = device_x − 8`.

**MANDATORY: show the calculation explicitly for every device node before writing a single coordinate.** Copying `cx+16` / `cx+52` from the table without checking actual line lengths causes text/device overlap every time. Work it out in full:

```
longest_line_chars = [count exactly — never estimate]
text_width         = longest_line_chars × 4.8
device_x           = cx + (text_width − device_width + 8) / 2
text_x             = device_x − 8
```

If any narrative line exceeds 32 chars, shorten it first — then run the formula with the corrected text. Narrative text at device nodes must use `text-anchor="end"` at `text_x` — never `text-anchor="middle"` at `cx`.

**Gap guarantee â€” all four combinations clear node labels by â‰¥12px:**

Top nodes have labels at y=34 and y=44 (baselines); first label text top â‰ˆ y=24.
Device bottom must be â‰¤ y=12 to ensure 12px clearance.
- Top laptop: bottom = âˆ’95+96 = **1** â†’ 23px gap âœ“
- Top phone: bottom = âˆ’108+120 = **12** â†’ 12px gap âœ“

Bottom nodes have labels at y=302 and y=313 (baselines); second label baseline = y=313.
Device top must be â‰¥ y=325 to ensure 12px clearance.
- Bottom phone: top = **328** â†’ 15px gap âœ“
- Bottom laptop: top = **340** â†’ 27px gap âœ“ (centred on narrative text at y=388)

### Laptop (any node)

```html
<foreignObject class="device-node" id="device-{n}"
  x="{cx-15}" y="{-95 or 340}" width="130" height="96">
```

Screen content div inside: `left:2.67%; top:2.73%; width:94.67%; height:67.27%`

**Laptop trackpad** — two elements inside the laptop SVG (viewBox `0 0 300 220`). Copy verbatim, never adjust coordinates:

```svg
<rect x="110" y="170" width="80" height="26" rx="5"
      fill="#CBCBCB" stroke="#B8B8B8" stroke-width="0.6"/>
<rect x="111" y="171" width="78" height="3.5" rx="4"
      fill="rgba(255,255,255,0.38)"/>
```

The first rect is the trackpad body (grey rounded rectangle). The second is a subtle white highlight strip along the top edge — gives the surface a slight three-dimensional quality. Both are required; neither coordinate should be changed.

### Phone (any node)

Copy this block verbatim. Change only `id`, `x`, `y`, and the `{PREFIX}` in defs IDs.
Use a unique prefix per phone node (e.g. `j0`, `j3`, `j4`) to avoid ID collisions.

```html
<svg class="device-node" id="device-{n}"
  x="{cx+10}" y="{-108 or 328}" width="58" height="120"
  viewBox="0 0 220 455" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="{PREFIX}-phoneBody" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#0E0E10"/>
      <stop offset="20%"  stop-color="#1C1C1E"/>
      <stop offset="80%"  stop-color="#1C1C1E"/>
      <stop offset="100%" stop-color="#0E0E10"/>
    </linearGradient>
    <linearGradient id="{PREFIX}-sideFrame" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%"   stop-color="#2A2A2C"/>
      <stop offset="25%"  stop-color="#6C6C70"/>
      <stop offset="50%"  stop-color="#9A9A9E"/>
      <stop offset="75%"  stop-color="#6C6C70"/>
      <stop offset="100%" stop-color="#2A2A2C"/>
    </linearGradient>
    <clipPath id="{PREFIX}-screenClip">
      <rect x="9" y="9" width="202" height="437" rx="39"/>
    </clipPath>
  </defs>
  <rect x="2" y="2" width="216" height="451" rx="46" fill="url(#{PREFIX}-phoneBody)"/>
  <rect x="2" y="2" width="216" height="451" rx="46" fill="none" stroke="url(#{PREFIX}-sideFrame)" stroke-width="3.5"/>
  <rect x="9" y="9" width="202" height="437" rx="39" fill="white"/>
  <g clip-path="url(#{PREFIX}-screenClip)">
    <rect x="9" y="9" width="202" height="437" fill="#0a0a14"/>
  </g>
  <rect x="70"  y="16"  width="80" height="28" rx="14" fill="#111"/>
  <circle cx="138" cy="30" r="7"   fill="#0D0D0D"/>
  <circle cx="138" cy="30" r="3.5" fill="#181818"/>
  <circle cx="136" cy="28" r="1.4" fill="rgba(255,255,255,0.10)"/>
  <circle cx="106" cy="30" r="2.5" fill="#1A1A1A"/>
  <rect x="-0.5" y="82"  width="5" height="22" rx="2.5" fill="#252528"/>
  <rect x="-0.5" y="116" width="5" height="42" rx="2.5" fill="#252528"/>
  <rect x="-0.5" y="167" width="5" height="42" rx="2.5" fill="#252528"/>
  <rect x="215.5" y="130" width="5" height="58" rx="2.5" fill="#252528"/>
  <rect x="73" y="440" width="74" height="5" rx="2.5" fill="#666" opacity="0.35"/>
  <rect x="2" y="2" width="216" height="451" rx="46" fill="none"
        stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <!-- Add push notification text elements here if this is a re-engagement node -->
</svg>
```

**CRITICAL: Phone nodes must ALWAYS be a direct `<svg class="device-node">` — never `<g class="device-node">` or `<g><foreignObject>`.**

```html
<!-- CORRECT: direct <svg> carries the class -->
<svg class="device-node" id="device-{n}" x="..." y="..." width="58" height="120"
  viewBox="0 0 220 455" xmlns="http://www.w3.org/2000/svg">
  ...
</svg>

<!-- WRONG: <g><foreignObject> means the inner SVG has no class;
     the CSS .device-node.visible transition never fires — phone is always invisible -->
<g class="device-node">
  <foreignObject x="..." y="..." width="58" height="106">
    <svg viewBox="0 0 220 455">...</svg>
  </foreignObject>
</g>
```

**Phone `height` is always `120`** — never `106`. The device positions table (top phone: y=−108+120=12, bottom phone: y=328+120=448) depends on this exact value.

**Phone wallpaper must be near-black.** Inside `<g clip-path="url(#{PREFIX}-screenClip)">`, always use a near-black fill (e.g. `fill="#0a0a14"` or a very dark tint of the brand colour). Never use the brand colour directly — `fill="#FF6600"` renders as a coloured rectangle, not a screen. White lock screen text must be legible against the background.

### Configurable JS deviceMap

Set this to reflect which nodes actually have devices in the journey:

```javascript
// Example: phone at node 0, laptop at node 1, phone at node 3, phone at node 4, laptop at node 5
var deviceMap = { 0: 'device-0', 1: 'device-1', 3: 'device-3', 4: 'device-4', 5: 'device-5' };
```

Use the same map in both `journeyActivateNode()` and `journeyReset()`. In `journeyReset()`,
replace the hardcoded array with:

```javascript
Object.values(deviceMap).forEach(function(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('visible');
});
```

**Use unique gradient/clipPath IDs per phone.** Each phone SVG contains `<defs>` with
linearGradient and clipPath elements. If two phones share the same id (e.g. `jPhoneBody`),
the second phone will render incorrectly. Prefix each phone's defs with the device id:
`j0PhoneBody`, `j3PhoneBody`, `j4PhoneBody`, etc.

---

## Laptop screen content

**The laptop screen must never be blank.** Fill it with a mini mock-up in the client's brand
colours reflecting what is happening at that node.

**Structure:** screen content div placed first (behind), SVG laptop frame overlaid on top using
`position: absolute`. Both sit inside a `position: relative` wrapper div.

**Prefix rule:** Each laptop's `<defs>` IDs must be unique. Use a short client+node prefix
(e.g. `sn1`, `sn5`, `ba1`) so gradient and mask IDs never clash between nodes.

```html
<foreignObject class="device-node" id="device-{n}" x="{cx-15}" y="{-95 or 340}" width="130" height="96">
  <div xmlns="http://www.w3.org/1999/xhtml" style="width:130px;height:96px;position:relative;overflow:hidden;">

    <!-- Screen content â€” sits behind the SVG frame, visible through the masked cutout -->
    <div style="position:absolute;left:2.67%;top:2.73%;width:94.67%;height:67.27%;
                overflow:hidden;border-radius:2px;background:var(--brand);
                display:flex;flex-direction:column;align-items:center;justify-content:center;
                gap:3px;padding:4px;">
      <div style="color:#fff;font-size:7px;font-weight:800;text-align:center;opacity:0.65;letter-spacing:1px;">[CLIENT NAME]</div>
      <div style="color:#fff;font-size:9px;font-weight:800;text-align:center;">[HEADLINE]</div>
      <div style="background:rgba(255,255,255,0.18);border-radius:3px;padding:2px 6px;margin-top:1px;">
        <div style="color:#fff;font-size:6px;font-weight:600;">[SUB-LINE]</div>
      </div>
      <div style="background:#fff;color:var(--brand);font-size:5.5px;font-weight:700;padding:2px 6px;border-radius:3px;margin-top:2px;">[CTA]</div>
    </div>

    <!-- SVG laptop frame â€” aluminium bezel, hinge, trackpad overlaid on screen content -->
    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;" viewBox="0 0 300 220">
      <defs>
        <linearGradient id="[PREFIX]-lgLidAl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#EBEBEB"/><stop offset="18%" stop-color="#D8D8D8"/>
          <stop offset="60%" stop-color="#CCCCCC"/><stop offset="100%" stop-color="#C0C0C0"/>
        </linearGradient>
        <linearGradient id="[PREFIX]-lgLidSheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="rgba(255,255,255,0.22)"/><stop offset="10%" stop-color="rgba(255,255,255,0)"/>
          <stop offset="90%" stop-color="rgba(255,255,255,0)"/><stop offset="100%" stop-color="rgba(255,255,255,0.14)"/>
        </linearGradient>
        <linearGradient id="[PREFIX]-lgHingeCyl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#888888"/><stop offset="38%" stop-color="#CECECE"/>
          <stop offset="62%" stop-color="#B8B8B8"/><stop offset="100%" stop-color="#848484"/>
        </linearGradient>
        <!-- Mask cuts the screen opening out of the aluminium lid -->
        <mask id="[PREFIX]-lid-mask">
          <rect x="0" y="0" width="300" height="162" fill="white"/>
          <rect x="8" y="6" width="284" height="148" rx="2" fill="black"/>
        </mask>
      </defs>
      <!-- Trackpad -->
      <rect x="110" y="170" width="80" height="26" rx="5" fill="#CBCBCB" stroke="#B8B8B8" stroke-width="0.6"/>
      <rect x="111" y="171" width="78" height="3.5" rx="4" fill="rgba(255,255,255,0.38)"/>
      <!-- Hinge -->
      <rect x="12" y="159" width="276" height="5" rx="1.5" fill="url(#[PREFIX]-lgHingeCyl)"/>
      <rect x="12" y="159" width="276" height="1.2" fill="rgba(255,255,255,0.48)"/>
      <!-- Lid (aluminium, with screen cutout via mask) -->
      <rect x="0" y="0" width="300" height="162" rx="6" fill="url(#[PREFIX]-lgLidAl)" mask="url(#[PREFIX]-lid-mask)"/>
      <rect x="0" y="0" width="300" height="162" rx="6" fill="url(#[PREFIX]-lgLidSheen)" mask="url(#[PREFIX]-lid-mask)"/>
      <rect x="0.4" y="0.4" width="299.2" height="161.2" rx="6" fill="none" stroke="#C4C4C4" stroke-width="0.7"/>
      <rect x="2" y="0.5" width="296" height="2.5" rx="6" fill="rgba(255,255,255,0.78)"/>
      <!-- Screen bezel inner shadow -->
      <rect x="8" y="6" width="284" height="148" rx="2" fill="none" stroke="rgba(0,0,0,0.30)" stroke-width="1.5"/>
      <!-- Webcam -->
      <rect x="133" y="0" width="34" height="8" rx="4" fill="#1A1A1A"/>
      <circle cx="150" cy="4" r="2" fill="#222222"/>
      <circle cx="149.3" cy="3.3" r="0.8" fill="rgba(255,255,255,0.14)"/>
    </svg>
  </div>
</foreignObject>
```

**CRITICAL: Journey laptop nodes must ALWAYS use the two-layer structure — never a simplified plain SVG.**

```html
<!-- CORRECT: screen content div behind + aluminium SVG frame in front -->
<foreignObject class="device-node" id="device-{n}" x="..." y="..." width="130" height="96">
  <div xmlns="http://www.w3.org/1999/xhtml"
       style="width:130px;height:96px;position:relative;overflow:hidden;">
    <!-- Layer 1: screen content (behind) -->
    <div style="position:absolute;left:2.67%;top:2.73%;width:94.67%;height:67.27%;...">
      [screen content]
    </div>
    <!-- Layer 2: aluminium frame SVG (in front, viewBox="0 0 300 220") -->
    <svg style="position:absolute;top:0;left:0;width:100%;height:100%;"
         viewBox="0 0 300 220">
      [gradients, lid-mask, trackpad, hinge, webcam]
    </svg>
  </div>
</foreignObject>

<!-- WRONG: simplified SVG — renders as a plain dark box, no aluminium frame visible -->
<svg class="device-node" viewBox="0 0 750 480" ...>
  <rect fill="#1a1a1a" .../>
</svg>
```

**Laptop `foreignObject height` is always `96`** — never `90` or any other value.

**Each laptop's `<defs>` IDs must carry a unique prefix** (e.g. `sn1-lgLidAl`, `sn5-lgLidAl`). If two laptops share the same gradient or mask ID, the browser applies the first definition to both — the second laptop renders with the wrong colours or no screen cutout.

Screen content area is approx **123px Ã— 64px** (the masked cutout). Keep fonts â‰¥ 6px. Bold and minimal. The screen content div percentages (`2.67% / 2.73% / 94.67% / 67.27%`) are fixed â€” do not change them.

---

## Persona strip

Replaces the old right panel. A horizontal bar below the journey header, fades in during Phase 1.

**Two rows â€” both are mandatory:**
- `ps-main` â€” avatar, name, stats, behavioural tags â€” translucent brand colour at ~68% opacity
- `ps-narrative` â€” **required** â€” one sentence explaining who this person is and what the journey will show. Written so the presenter can read it aloud to frame the story before clicking through. Never omit this row.

**`ps-narrative` formula:** `[Who the persona is] â€” [what signal/behaviour triggers the journey] â€” [what the journey will demonstrate].`
Example: *"A returning Ikos guest with strong in-stay upsell signals â€” follow how RT-CDP and AJO convert her behaviour into a confirmed Deluxe Collection upgrade."*

```html
<div class="persona-strip" id="persona-strip">
  <div class="ps-main">
    <div class="ps-avatar">J</div>
    <div class="ps-identity">
      <div class="ps-name">Full Name</div>
      <div class="ps-sub">Age &middot; City, Country &middot; Customer Segment</div>
    </div>
    <div class="ps-divider"></div>
    <div class="ps-stats">
      <div class="ps-stat">
        <div class="ps-stat-label">Device</div>
        <div class="ps-stat-value">Device model</div>
      </div>
      <div class="ps-stat">
        <div class="ps-stat-label">Account / Plan</div>
        <div class="ps-stat-value">Plan name</div>
      </div>
      <div class="ps-stat">
        <div class="ps-stat-label">Usage</div>
        <div class="ps-stat-value">Frequency</div>
      </div>
      <div class="ps-stat">
        <div class="ps-stat-label">Tenure</div>
        <div class="ps-stat-value">X days &middot; new</div>
      </div>
    </div>
    <div class="ps-tags">
      <span class="ps-tag">Trait one</span>
      <span class="ps-tag">Trait two</span>
      <span class="ps-tag">Trait three</span>
    </div>
  </div>
  <div class="ps-narrative">
    One sentence framing the journey â€” who this person is, what they just did, and what
    the next N steps will show. Written in plain language the presenter can read aloud.
  </div>
</div>
```

```css
#screen-journey .persona-strip {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.8s ease 0.3s;
}
#screen-journey .persona-strip.visible { opacity: 1; }

#screen-journey .ps-main {
  display: flex;
  align-items: center;
  padding: 11px 28px;
  gap: 14px;
  background: rgba(R, G, B, 0.68);   /* brand colour hex â†’ RGB, 68% opacity */
  color: #fff;
}
#screen-journey .ps-avatar {
  width: 36px; height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.92);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 800;
  color: var(--brand-dark);
  flex-shrink: 0;
  border: 2px solid rgba(255,255,255,0.55);
}
#screen-journey .ps-identity { flex-shrink: 0; }
#screen-journey .ps-name { font-size: 13px; font-weight: 700; color: #fff; }
#screen-journey .ps-sub { font-size: 10px; color: rgba(255,255,255,0.72); margin-top: 1px; }
#screen-journey .ps-divider { width: 1px; height: 26px; background: rgba(255,255,255,0.28); flex-shrink: 0; }
#screen-journey .ps-stats { display: flex; gap: 20px; }
#screen-journey .ps-stat { flex-shrink: 0; }
#screen-journey .ps-stat-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.58); }
#screen-journey .ps-stat-value { font-size: 11px; font-weight: 600; color: #fff; margin-top: 1px; }
#screen-journey .ps-tags { display: flex; gap: 5px; margin-left: auto; }
#screen-journey .ps-tag { background: rgba(255,255,255,0.18); border-radius: 10px; padding: 2px 8px; font-size: 8px; font-weight: 600; color: #fff; }

#screen-journey .ps-narrative {
  background: rgba(R, G, B, 0.44);   /* same RGB, 44% opacity */
  padding: 7px 28px;
  font-size: 11px;
  color: rgba(255,255,255,0.85);
  line-height: 1.55;
  font-style: italic;
  border-top: 1px solid rgba(255,255,255,0.14);
}
```

**Translucency values:** Convert `--brand` hex to RGB. Use `rgba(R, G, B, 0.68)` for `ps-main`
and `rgba(R, G, B, 0.44)` for `ps-narrative`. The slide's light grey background bleeds through,
softening the brand colour. Do not use solid `background: var(--brand)` â€” it is too aggressive.

---

## Journey map container â€” SVG sizing

```css
#screen-journey .journey-map-container {
  flex: 1;
  min-height: 0;           /* allows container to shrink within fixed-height slide */
  padding: 16px 48px;
  display: flex;
  align-items: center;
  justify-content: center;
}

#screen-journey .journey-svg {
  width: 100%;
  height: auto;
  max-height: 100%;        /* CRITICAL â€” without this, SVG overflows container and journey appears zoomed in */
  overflow: visible;
}
```

**Why `max-height: 100%`:** At full slide width (1280px), the SVG's proportional height
(width Ã— 640/1080 â‰ˆ 700px) exceeds the available container height (~500â€“550px). Without
`max-height: 100%`, the SVG overflows and the slide's `overflow: hidden` clips the bottom
nodes and narratives. With `max-height: 100%`, the browser scales the SVG down proportionally
until it fits within the container height.

---

## Animation engine â€” two-phase model

All function and variable names must carry a `journey` prefix to avoid collisions with the
card animation in the combined file.

### Phase 1 â€” auto (fires when journey screen opens)

```javascript
const JOURNEY_TOTAL_NODES = 7;
let journeyCurrentNode = -1;
let journeyPhase = 0;   // 0=idle, 1=phase1, 2=phase2
let journeyTimers = [];

const journeyPathSegs = [
  'M 40,265',
  'M 40,265 C 88,265 137,70 185,70',
  'M 40,265 C 88,265 137,70 185,70 C 233,70 282,265 330,265',
  'M 40,265 C 88,265 137,70 185,70 C 233,70 282,265 330,265 C 383,265 437,70 490,70',
  'M 40,265 C 88,265 137,70 185,70 C 233,70 282,265 330,265 C 383,265 437,70 490,70 C 542,70 593,265 645,265',
  'M 40,265 C 88,265 137,70 185,70 C 233,70 282,265 330,265 C 383,265 437,70 490,70 C 542,70 593,265 645,265 C 697,265 748,70 800,70',
  'M 40,265 C 88,265 137,70 185,70 C 233,70 282,265 330,265 C 383,265 437,70 490,70 C 542,70 593,265 645,265 C 697,265 748,70 800,70 C 850,70 900,265 950,265',
];

function journeyClearTimers() {
  journeyTimers.forEach(clearTimeout);
  journeyTimers = [];
}

function journeyReset() {
  journeyClearTimers();
  journeyPhase = 0;
  journeyCurrentNode = -1;

  var ps = document.getElementById('persona-strip');
  if (ps) ps.classList.remove('visible');

  var nav = document.getElementById('journey-nav-bar');
  if (nav) nav.classList.remove('visible');
  var counter = document.getElementById('journey-counter');
  if (counter) counter.textContent = 'Click to begin';
  var prevBtn = document.getElementById('journey-prev');
  if (prevBtn) prevBtn.disabled = true;
  var nextBtn = document.getElementById('journey-next');
  if (nextBtn) nextBtn.disabled = false;

  for (var n = 0; n < JOURNEY_TOTAL_NODES; n++) {
    document.getElementById('node-' + n).classList.remove('node-active');
    document.getElementById('node-' + n).classList.remove('node-revealed');
    var narr = document.getElementById('narrative-' + n);
    if (narr) narr.classList.remove('visible');
  }
  ['device-1','device-4','device-5'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('visible');
  });

  var seg = document.getElementById('active-seg');
  seg.style.transition = 'none';
  seg.style.strokeDasharray = '';
  seg.style.strokeDashoffset = '';
  seg.style.opacity = '0';
  seg.setAttribute('d', '');

  var base = document.getElementById('base-path');
  if (base) {
    base.style.transition = 'none';
    base.style.strokeDasharray = '';
    base.style.strokeDashoffset = '';
  }
}

function journeyAutoAnimate() {
  journeyClearTimers();
  journeyPhase = 1;

  var base = document.getElementById('base-path');
  if (!base) return;

  base.style.transition = 'none';
  var totalLen = base.getTotalLength();
  base.style.strokeDasharray = totalLen + ' ' + totalLen;
  base.style.strokeDashoffset = String(totalLen);
  base.getBoundingClientRect();

  // Pre-calculate cumulative path lengths for each node (for reveal timing)
  var tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  var cumLens = [0];
  for (var n = 1; n < JOURNEY_TOTAL_NODES; n++) {
    tmp.setAttribute('d', journeyPathSegs[n]);
    cumLens.push(tmp.getTotalLength());
  }

  var drawDelay = 200;
  var drawDuration = 2500;

  journeyTimers.push(setTimeout(function() {
    // Fade in persona strip simultaneously with path draw
    var ps = document.getElementById('persona-strip');
    if (ps) ps.classList.add('visible');

    base.style.transition = 'stroke-dashoffset ' + drawDuration + 'ms ease-in-out';
    base.style.strokeDashoffset = '0';

    // Reveal each node circle+emoji as the line reaches it
    for (var i = 0; i < JOURNEY_TOTAL_NODES; i++) {
      (function(idx) {
        var revealAt = (cumLens[idx] / totalLen) * drawDuration + 80;
        journeyTimers.push(setTimeout(function() {
          document.getElementById('node-' + idx).classList.add('node-revealed');
        }, revealAt));
      })(i);
    }

    // Show nav bar after draw completes, enter Phase 2
    journeyTimers.push(setTimeout(function() {
      var nav = document.getElementById('journey-nav-bar');
      if (nav) nav.classList.add('visible');
      journeyPhase = 2;
    }, drawDuration + 300));
  }, drawDelay));
}
```

**Timing summary:**
- `drawDelay` 200ms â€” brief pause before draw starts
- `drawDuration` 2500ms â€” time for full path to draw
- `+80ms` per node â€” slight offset so node pops just after line arrives
- `+300ms` after draw â€” nav bar fades in, Phase 2 begins

### Phase 2 â€” click-driven navigation

```javascript
function journeyActivateNode(n) {
  document.getElementById('node-' + n).classList.add('node-active');
  journeyTimers.push(setTimeout(function() {
    var narr = document.getElementById('narrative-' + n);
    if (narr) narr.classList.add('visible');
    var deviceMap = { 1: 'device-1', 4: 'device-4', 5: 'device-5' };
    if (n in deviceMap) {
      var dev = document.getElementById(deviceMap[n]);
      if (dev) dev.classList.add('visible');
    }
  }, 200));
  var seg = document.getElementById('active-seg');
  seg.setAttribute('d', journeyPathSegs[n]);
  seg.style.opacity = '1';
}

function journeyUpdateNav() {
  var counter = document.getElementById('journey-counter');
  var prevBtn = document.getElementById('journey-prev');
  var nextBtn = document.getElementById('journey-next');
  if (counter) counter.textContent = journeyCurrentNode < 0 ? 'Click to begin' : 'Step ' + (journeyCurrentNode + 1) + ' of ' + JOURNEY_TOTAL_NODES;
  if (prevBtn) prevBtn.disabled = (journeyCurrentNode <= -1);
  if (nextBtn) nextBtn.disabled = (journeyCurrentNode >= JOURNEY_TOTAL_NODES - 1);
}

function journeyHandleAdvance() {
  if (journeyPhase !== 2) return;
  if (journeyCurrentNode >= JOURNEY_TOTAL_NODES - 1) return;
  journeyCurrentNode++;
  journeyActivateNode(journeyCurrentNode);
  journeyUpdateNav();
}

function journeyHandleBack() {
  if (journeyPhase !== 2) return;
  if (journeyCurrentNode <= -1) return;

  var n = journeyCurrentNode;
  document.getElementById('node-' + n).classList.remove('node-active');
  var narr = document.getElementById('narrative-' + n);
  if (narr) narr.classList.remove('visible');
  var deviceMap = { 1: 'device-1', 4: 'device-4', 5: 'device-5' };
  if (n in deviceMap) {
    var dev = document.getElementById(deviceMap[n]);
    if (dev) dev.classList.remove('visible');
  }

  journeyCurrentNode--;

  var seg = document.getElementById('active-seg');
  if (journeyCurrentNode < 0) {
    seg.style.opacity = '0';
    seg.setAttribute('d', '');
  } else {
    seg.setAttribute('d', journeyPathSegs[journeyCurrentNode]);
    seg.style.opacity = '1';
  }
  journeyUpdateNav();
}

// Click anywhere on journey screen = advance (exclude nav buttons)
document.getElementById('screen-journey').addEventListener('click', function(e) {
  if (e.target.closest && (e.target.closest('.journey-nav-btn') || e.target.closest('.journey-step-btn'))) return;
  journeyHandleAdvance();
});

// Keyboard: right/space = advance, left = back
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('screen-journey').classList.contains('active')) return;
  if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); journeyHandleAdvance(); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); journeyHandleBack(); }
});
```

---

## Navigation

### Journey header structure

The journey header mirrors the card header: **client logo far left, Adobe logo far right**.
Do not include "Adobe Experience Platform" as a text label â€” the Adobe logo alone is sufficient.

```html
<div class="journey-header">
  <!-- Left: client logo with text fallback -->
  <img class="client-logo" src="https://logo.clearbit.com/[clientdomain]" alt="[Client]"
       onerror="this.style.display='none';document.getElementById('j-logo-fb').style.display='block'">
  <span id="j-logo-fb" style="display:none;font-size:20px;font-weight:800;color:var(--brand)">[Client]</span>

  <!-- Centre: use case title â€” absolutely positioned so it doesn't affect flex spacing -->
  <div style="position:absolute;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;">
    <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#BABABA;margin-bottom:3px;">Customer Journey</div>
    <div style="font-size:14px;font-weight:700;color:#111;">[Use Case Title]</div>
  </div>

  <!-- Right: back button, fullscreen toggle, Adobe logo -->
  <button class="journey-nav-btn" onclick="showScreen('screen-card')" style="margin-left:auto">&larr; Back to Card</button>
  <button class="fullscreen-btn" onclick="toggleFullscreen()" title="Toggle full screen" id="fs-btn-journey">
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 5V1h4M9 1h4v4M13 9v4h-4M5 13H1V9"/>
    </svg>
  </button>
  <img style="height:28px;width:auto;" src="data:image/png;base64,[ADOBE_LOGO_BASE64]">
</div>
```

**Header CSS â€” add `position: relative`** so the absolutely-centred title is anchored to the header:

```css
#screen-journey .journey-header {
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  padding: 14px 28px;
  gap: 16px;
  flex-shrink: 0;
  position: relative;   /* anchors the centred use case title */
}
```

**Adobe logo:** Copy the base64 `<img>` tag from the card header â€” the logo is already embedded
there. Add `style="height:28px;width:auto;"` to size it correctly in the journey header.

**Client logo fallback:** If the Clearbit URL fails, the `onerror` handler shows a branded text
fallback (`id="j-logo-fb"`). Always include both â€” the image and the fallback span.

### Fullscreen toggle (both screens)

Both the card and journey screens have a browser-level fullscreen button. Use a shared CSS
class `.fullscreen-btn` and a shared JS function `toggleFullscreen()`. The icon updates on
the `fullscreenchange` event.

```css
.fullscreen-btn {
  background: none;
  border: 1px solid rgba(0,0,0,0.13);
  border-radius: 4px;
  cursor: pointer;
  padding: 5px 7px;
  color: #888;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.fullscreen-btn:hover { background: rgba(0,0,0,0.06); color: #333; }
```

```javascript
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function(){});
  } else {
    document.exitFullscreen();
  }
}
document.addEventListener('fullscreenchange', function() {
  var expandPath = '<path d="M1 5V1h4M9 1h4v4M13 9v4h-4M5 13H1V9"/>';
  var contractPath = '<path d="M5 1v4H1M13 5H9V1M9 13V9h4M1 9h4v4"/>';
  var isFs = !!document.fullscreenElement;
  document.querySelectorAll('.fullscreen-btn svg').forEach(function(svg) {
    svg.innerHTML = isFs ? contractPath : expandPath;
  });
});
```

Place `id="fs-btn-card"` on the card screen button and `id="fs-btn-journey"` on the journey
screen button. The `fullscreenchange` listener updates all `.fullscreen-btn` icons at once.

### Journey nav bar (bottom of slide)

```html
<div id="journey-nav-bar">
  <button id="journey-prev" class="journey-step-btn" onclick="journeyHandleBack()" disabled>&larr; Prev</button>
  <span id="journey-counter">Click to begin</span>
  <button id="journey-next" class="journey-step-btn" onclick="journeyHandleAdvance()">Next &rarr;</button>
</div>
```

```css
#screen-journey #journey-nav-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 6px 0 8px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.6s ease;
}
#screen-journey #journey-nav-bar.visible { opacity: 1; }
#screen-journey .journey-step-btn {
  font-size: 11px;
  font-weight: 700;
  color: var(--brand);
  background: transparent;
  border: 1.5px solid var(--brand);
  border-radius: 20px;
  padding: 4px 14px;
  cursor: pointer;
  transition: opacity 0.15s, background 0.15s;
  opacity: 0.85;
}
#screen-journey .journey-step-btn:hover:not(:disabled) { opacity: 1; background: var(--brand-light); }
#screen-journey .journey-step-btn:disabled { opacity: 0.25; cursor: default; }
#screen-journey #journey-counter {
  font-size: 11px;
  color: #888;
  min-width: 72px;
  text-align: center;
}
```

The nav bar is hidden (opacity 0) until Phase 1 completes. `â† Prev` starts disabled and
enables once node 0 is activated. `Next â†’` disables at node 6.

---

## Brand colour variables

```css
:root {
  --brand:       #HEXCODE;   /* active node fill, active trail, persona strip background */
  --brand-dark:  #HEXCODE;   /* ~15% darker â€” avatar text, footer */
  --brand-light: #HEXCODE;   /* very light tint â€” button hover backgrounds */
  --brand-mid:   #HEXCODE;   /* mid tint â€” borders, dividers */
}
```

---

## HTML entities â€” mandatory

Always use HTML entities for arrows and symbols â€” never literal Unicode characters.
Bash heredocs and Python string writes silently corrupt multibyte Unicode.

| Symbol | Entity   |
|--------|----------|
| â†      | `&larr;` |
| â†’      | `&rarr;` |
| Â·      | `&middot;` |
| â€”      | `&mdash;` |
| "      | `&ldquo;` / `&rdquo;` |
| '      | `&apos;` |

---

## Emoji icon guide

| Journey moment | Emoji |
|---------------|-------|
| Signal / trigger / profiling | ðŸ“¡ ðŸ“Š |
| Website visit / digital touchpoint | ðŸŒ ðŸ’» |
| Browsing / comparison / research | ðŸ“± ðŸ” |
| Abandonment / friction | â¸ï¸ â˜• âš ï¸ |
| Push notification / re-engagement | ðŸ”” ðŸ“§ ðŸ’¬ |
| Return / conversion / purchase | âœ… ðŸ›’ ðŸ’³ |
| Welcome / analytics / reporting | ðŸŽ‰ ðŸ“Š |
