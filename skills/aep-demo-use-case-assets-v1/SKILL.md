---
name: aep-demo-use-case
description: >
  Generates a single self-contained interactive HTML demo file for Adobe sales conversations.
  Given a client name, runs a short conversation to establish products and use case,
  then produces a combined use case card + animated customer journey in one file.
  Use this skill whenever the user mentions creating a use case card, use case picker,
  demo assets, or customer journey HTML for a client — even if they just say "create a
  use case card for [Client]", "build demo assets for [Client]", "run the use case skill
  for [Client]", or provide a client name and Adobe products. Also triggers for
  "use case card", "journey visualisation", or any mention of building a demo for a client.
---

# AEP Demo Use Case Skill

This skill runs a short guided conversation, then generates a **single self-contained HTML file**
for Adobe sales conversations. The file contains two screens:

1. **Use case card screen** — Business case, value grid, animated device panel (product video + push notification)
2. **Customer journey screen** — Animated 7-node SVG journey map with persona profile and narrative captions

The user switches between screens via on-screen navigation buttons. No page reload, no separate files, no broken relative paths — everything is embedded including the product video.

---

## How the two screens fit together

The file opens on the use case card. Clicking "View Journey →" fades to the journey screen. Clicking "← Back to Card" returns. Navigation is JS-based (`showScreen()`), not `href` links.

```javascript
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'screen-journey') { journeyReset(); journeyAutoAnimate(); }
}
```

The journey animation does **not** fire on page load (the journey screen is hidden). It fires only when `showScreen('screen-journey')` is called.

---

## Skill assets

| Asset file | Used by | How |
|-----------|---------|-----|
| `three-use-case-card.html` | Card template reference | Read only |
| `three-customer-journey.html` | Journey template reference | Read only |
| `AJO-Video.mp4` | Card laptop screen | **Base64-encode and embed** if AJO is hero product |
| `RT-CDP-Video.mp4` | Card laptop screen | **Base64-encode and embed** if RT-CDP is hero product |
| `CJA.mp4` | Card laptop screen | **Base64-encode and embed** if CJA is hero product |

**Adobe logo:** embedded as base64 data URI in the template — no separate file needed.

**Video embedding:** See `references/card-html-rules.md` → "Video embedding" for the full process.
**Video selection:** See `references/card-html-rules.md` → "Video selection" for the decision rule.

---

## Invocation

The user says something like:
> *"Create a use case card for Vodafone Ireland — RT-CDP and AJO"*
> *"Build demo assets for EE using Journey Optimizer"*
> *"Run the use case skill for Admiral"*

**Products in scope:** Real-Time CDP, Journey Optimizer, Customer Journey Analytics, Decision Management, Brand Concierge

---

## Step 1 — Ask about products

When invoked with a client name, immediately ask which Adobe products are in scope.
Do not research the client yet — ask first.

Example:
> Which Adobe products are in scope for this British Airways demo?
> (e.g. Real-Time CDP, Journey Optimizer, Customer Journey Analytics)

Wait for the user's response before continuing.

---

## Step 2 — Ask about use case

Once products are confirmed, ask whether the user has a specific use case in mind
or would like suggestions.

Example:
> Do you have a specific use case in mind for the card and journey,
> or would you like me to suggest the three most relevant ones for British Airways?

Wait for the user's response before continuing.

---

## Step 3a — User has a specific use case

If the user describes a use case, note it and proceed directly to Step 4 (research) then
Step 5 (build). No need to present options.

---

## Step 3b — User wants suggestions

Research the client (see Step 4 research guidance), then present **3 use case options**
as rich markdown — as visual as possible. Use this format:

```
Here are the three most relevant use cases for **[Client Name]** with [products]:

---

**01 — [Use Case Name]** · `[Retention / Upsell / Cross-sell / Acquisition]`

> "[I want to...] statement — first person, as if the CMO is speaking. Specific to this client."

- Bullet one — distinct commercial benefit
- Bullet two — distinct commercial benefit
- Bullet three — distinct commercial benefit

**Products:** [Product] · [Product]

---

**02 — [Use Case Name]** · `[Type]`

> "[Statement]"

- Bullet one
- Bullet two
- Bullet three

**Products:** [Product] · [Product]

---

**03 — [Use Case Name]** · `[Type]`

> "[Statement]"

- Bullet one
- Bullet two
- Bullet three

**Products:** [Product] · [Product]

---

Which would you like to build? Reply with **1**, **2**, or **3**.
```

Rank by strategic fit — lead with the strongest. Wait for the user's selection before building.

---

## Step 4 — Research the client

Before writing any HTML, research the client. You need:

- **Industry / vertical** (e.g. Telecommunications, Retail, Financial Services)
- **Customer base size** (for journey footer metrics and persona stats)
- **Key business challenges** relevant to the selected products
- **2–3 compelling stats or facts** (market share, customer count, revenue) for footer metrics
- **Typical customer profile** — age range, location, device type, usage patterns — for the journey persona

Use WebSearch:
- `"[Client Name]" annual report customers`
- `"[Client Name]" "[industry]" personalisation OR "customer experience"`
- `"[Client Name]" Adobe OR Salesforce OR "customer data"`

If the user asked for suggestions (Step 3b), do this research before presenting the options.
If the user provided a specific use case (Step 3a), do this research before building.

---

## Step 5 — Generate the combined HTML file using the template

**Do not generate HTML from scratch.** Use the template at `assets/use-case-template.html` as the base. Read the template, then replace every `{{PLACEHOLDER}}` token with client-specific content. This guarantees consistent structure — no floating devices, no missing CSS, no broken navigation.

### Workflow

1. Read `assets/use-case-template.html` with `encoding="utf-8-sig"` to strip any BOM, then immediately replace any curly/smart quotes with ASCII straight quotes before doing anything else:
   ```python
   with open("assets/use-case-template.html", "r", encoding="utf-8-sig") as f:
       html = f.read()
   html = html.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
   ```
2. Determine all placeholder values from your research (Step 4)
3. Write the completed file as `[client-slug]-use-case.html` in the working directory
4. Determine the hero product video path:
   - AJO as hero product → `assets/AJO-Video.mp4`
   - RT-CDP as hero product → `assets/RT-CDP-Video.mp4`
   - CJA as hero product → `assets/CJA.mp4`
5. Base64-embed the video and Adobe logo directly into the HTML using the Analysis tool (Python):

```python
import base64, re

# Read the generated HTML (utf-8-sig strips the BOM if present)
with open("[client-slug]-use-case.html", "r", encoding="utf-8-sig") as f:
    html = f.read()

# Embed video (replace the bare filename reference)
with open("[VideoFile].mp4", "rb") as f:
    video_b64 = base64.b64encode(f.read()).decode()
html = re.sub(r'src="[VideoFile]\.mp4"', f'src="data:video/mp4;base64,{video_b64}"', html)

# Embed Adobe logo
with open("adobe-logo.png", "rb") as f:
    logo_b64 = base64.b64encode(f.read()).decode()
html = html.replace('src="adobe-logo.png"', f'src="data:image/png;base64,{logo_b64}"')

# Write back
with open("[client-slug]-use-case.html", "w", encoding="utf-8") as f:
    f.write(html)
```

After this step the HTML is fully self-contained — one file, no external dependencies. The `{{VIDEO_FILE}}` placeholder in the template should be replaced with just the bare filename (e.g. `AJO-Video.mp4`) before running the embed step.

### Placeholder reference

**CSS variables (`:root` block):**
| Placeholder | Example |
|------------|---------|
| `{{BRAND_COLOR}}` | `#DB0011` |
| `{{BRAND_DARK}}` | `#9A000B` |
| `{{BRAND_LIGHT}}` | `#FDE8EA` |
| `{{BRAND_MID}}` | `#F5B3BB` |
| `{{BRAND_RGB}}` | `219,0,17` (R,G,B of BRAND_COLOR — no spaces, no #) |

**Title and card screen:**
| Placeholder | Description |
|------------|-------------|
| `{{CLIENT_NAME}}` | Display name, e.g. `HSBC` |
| `{{JOURNEY_TITLE}}` | Journey subtitle, e.g. `Personalised Onboarding · Customer Journey` |
| `{{CLIENT_LOGO_URL}}` | Clearbit URL, e.g. `https://logo.clearbit.com/hsbc.com` |
| `{{USE_CASE_TYPE}}` | `Retention` / `Acquisition` / `Upsell` / `Cross-sell` |
| `{{PRODUCTS_LIST_HTML}}` | `<span class="tech-pill">Real-Time CDP</span><span class="tech-pill">Journey Optimizer</span>` |
| `{{UC_STATEMENT_HTML}}` | Use case statement. Wrap client name: `I want every <span class="client-name">HSBC</span> customer...` |
| `{{VALUE_GRID_HTML}}` | Four `.value-grid-item` divs. Icons: `&#8599;` `&#9889;` `&#9677;` `&rarr;` or similar. |
| `{{VIDEO_FILE}}` | `AJO-Video.mp4` / `RT-CDP-Video.mp4` / `CJA.mp4` |
| `{{CARD_NOTIF_APP_LETTER}}` | Single character for notification icon, e.g. `H` |
| `{{CARD_NOTIF_APP_NAME}}` | App name in notification, e.g. `HSBC BANK` |
| `{{CARD_NOTIF_TITLE}}` | Notification headline, e.g. `Set up your savings goal` |
| `{{CARD_NOTIF_LINE_1}}` | Notification line 1 |
| `{{CARD_NOTIF_LINE_2}}` | Notification line 2 |
| `{{METRIC_1_VALUE}}` / `{{METRIC_1_LABEL}}` | Footer metric 1 (use real researched numbers) |
| `{{METRIC_2_VALUE}}` / `{{METRIC_2_LABEL}}` | Footer metric 2 |
| `{{METRIC_3_VALUE}}` / `{{METRIC_3_LABEL}}` | Footer metric 3 |

**Journey persona strip:**
| Placeholder | Example |
|------------|---------|
| `{{PERSONA_INITIAL}}` | `J` |
| `{{PERSONA_NAME}}` | `James Thornton` |
| `{{PERSONA_SUB}}` | `29 · London, UK · New Customer` |
| `{{PERSONA_DEVICE}}` | `iPhone 15` |
| `{{PERSONA_STAT2_LABEL}}` / `{{PERSONA_STAT2_VALUE}}` | e.g. `Account` / `HSBC Advance` |
| `{{PERSONA_STAT3_LABEL}}` / `{{PERSONA_STAT3_VALUE}}` | e.g. `App Usage` / `4x / week` |
| `{{PERSONA_TENURE}}` | `14 days · new` |
| `{{PERSONA_TAG_1}}` `{{PERSONA_TAG_2}}` `{{PERSONA_TAG_3}}` | Persona tags |
| `{{PERSONA_NARRATIVE}}` | 2–3 sentence overview of the journey story |

**Journey nodes (n = 0–6):**

For each node, replace:
- `{{N{n}_EMOJI}}` — HTML entity, e.g. `&#127968;`
- `{{N{n}_LABEL_1}}` / `{{N{n}_LABEL_2}}` — two-line node label
- `{{N{n}_NAR_1}}` / `{{N{n}_NAR_2}}` / `{{N{n}_NAR_3}}` — three narrative lines (≤32 chars each — hard limit)

**Devices — inserted at optional comment markers (not template placeholders):**

Devices are not pre-filled in the template. To add a device at a chosen node, replace its `<!-- ~~~ OPTIONAL DEVICE n ... ~~~ -->` comment with the full SVG block from `references/journey-html-rules.md`. The reference file contains ready-to-paste SVG structures for:
- **Lock-screen phone** (notification) — use for push notification moments
- **App UI phone** — use for in-app actions (form, purchase, abandonment)
- **Laptop** — use for desktop web personalisation or analytics dashboard views

Laptop screen content uses dark backgrounds (`#0f1b2e`, `#1a1a2e`) with light text. Phone notification content must use the client's real app name, a specific offer headline, and 2 body lines matching the journey moment.

### Devices — choose 3–4

**Place devices at exactly 3–4 nodes** where a device meaningfully shows the customer's channel interaction. Not every node needs one. Nodes that represent background data processing, profile updates, or segment qualification rarely warrant a device.

**How to insert a device:** Find the `<!-- ~~~ OPTIONAL DEVICE n ... ~~~ -->` comment in the template and replace it with the actual device SVG block. See `references/journey-html-rules.md` → "Device positions" for the complete SVG structure. Leave remaining `OPTIONAL DEVICE` comments in place — they are invisible and won't affect rendering.

**Inner element must NOT have `class="device-node"`** — this is a common generation mistake that causes the device to never appear. The JS adds `visible` to the outer `<g>` wrapper only. If the inner `<svg>` also carries `class="device-node"`, it keeps its own `opacity: 0` and the device stays invisible even when the node is active.

```html
<!-- ✅ Correct — class only on the outer <g> -->
<g class="device-node" id="device-4">
  <svg x="687" y="328" width="58" height="110" viewBox="0 0 220 455" ...>

<!-- ❌ Wrong — inner <svg> has class="device-node", device will never appear -->
<g class="device-node" id="device-4">
  <svg class="device-node" x="687" y="328" width="58" height="110" ...>
```

**Match device type to channel (mandatory):**

| Channel at this node | Device to use |
|---------------------|--------------|
| Mobile app (any in-app action) | **Phone** |
| Push notification received | **Phone** |
| Desktop website or web portal | **Laptop** |
| When in doubt | **Phone** |

**Available positions — y values are fixed; x is calculated from the centering formula (values below assume ≤32-char text):**

| Node | Position | cx | Phone x, y | Laptop x, y |
|------|----------|----|-----------|------------|
| 0 | Bottom | 40 | 92, 328 | 56, 340 |
| 1 | Top | 185 | 237, -108 | 201, -95 |
| 2 | Bottom | 330 | 382, 328 | 346, 340 |
| 3 | Top | 490 | 542, -108 | 506, -95 |
| 4 | Bottom | 645 | 697, 328 | 661, 340 |
| 5 | Top | 800 | 852, -108 | 816, -95 |
| 6 | Bottom | 950 | 1002, 328 | 966, 340 |

**Narrative centering rules — mandatory for all nodes with devices:**

The template sets all narratives to `text-anchor="middle"` centred on `cx` — correct as-is for no-device nodes. When a device is added, both the narrative x and the device x must shift to **centre the pair on cx**:

```
text_x   = cx + (text_width − device_width − 8) / 2
device_x = text_x + 8
```

- `text_width` = longest line chars × 4.8 SVG units (e.g. 30 chars → 144)
- `device_width`: laptop = 130, phone = 58
- Gap = 8 SVG units (fixed)

Change `text-anchor` to `"end"` and set `x` to `text_x`.

**`text-anchor` is always `"end"` — never `"start"`.** Text to the right of the device overlaps the next node's narrative when both are visible simultaneously.

**Edge nodes (first and last):** Formula still applies. For the first node (cx ≈ 40), cap narrative lines at **≤20 chars** — at cx=40 with `text-anchor="middle"`, a 20-char line has its left edge at x≈16, safely inside the viewBox (x=−20). Even within this tighter limit, lines must still be **complete sentences** (subject + verb + object). Never write fragments like "Jamie books" or "RT-CDP logs" — these violate the narrative quality rule. Write shorter complete thoughts instead: "Jamie books his seat." or "RT-CDP logs the booking."

### Narrative y-coordinates — copy these exactly, never calculate them

| Node position | Line 1 | Line 2 | Line 3 | Line 4 (optional) |
|--------------|--------|--------|--------|-------------------|
| **Top** (nodes 1, 3, 5) | `y="-58"` | `y="-47"` | `y="-36"` | `y="-25"` |
| **Bottom** (nodes 0, 2, 4, 6) | `y="377"` | `y="388"` | `y="399"` | `y="410"` |

Do not use any other values. Values like y=−133/−122/−111 are wrong — they push narrative text near the top of the viewport, visually detached from the node. This has caused bugs in multiple generated files. When using 4 lines on a bottom node, also expand its `nar-guard` clipPath height from 48 to 60.

**After writing all 7 narrative groups, scan the HTML for `y="-`** — any value more negative than `-58` on a narrative `<text>` element is a bug. Fix it before saving.

**3 or 4 lines per node.** Use 4 lines when 3 feel too terse. Each line ≤32 chars — this is **per line**, not total.

**Node 0 hard limit — ≤20 chars per line.** Node 0 sits at cx=40. With `text-anchor="middle"`, a 30-char line extends to x=−32 — past the viewBox left edge (x=−20) — and is visibly clipped. The maths: left edge = 40 − (chars × 2.4). At 20 chars: left edge = −8 (safe). At 30 chars: left edge = −32 (clipped). Count every character including spaces before writing. Do not give node 0 a device — the centering formula pushes text even further left. Examples of acceptable node-0 lines: "Carlos opens the app." (21 → trim to "Carlos opens app." = 18 ✓), "RT-CDP logs the start." (22 → "RT-CDP logs session." = 20 ✓), "Identity resolves now." (22 → "Identity resolved." = 18 ✓).

**Write in complete sentences** — subject + verb on every line. No colon-label format ("Segment: High-LTV"). No incomplete phrases ("Yael logs into"). The presenter reads these aloud; every line must land cleanly as a spoken thought.

**Laptop trackpad** — two elements inside the laptop SVG (viewBox `0 0 300 220`), copied verbatim:

```svg
<rect x="110" y="170" width="80" height="26" rx="5"
      fill="#CBCBCB" stroke="#B8B8B8" stroke-width="0.6"/>
<rect x="111" y="171" width="78" height="3.5" rx="4"
      fill="rgba(255,255,255,0.38)"/>
```

Never adjust these coordinates. See `references/journey-html-rules.md` → "Device positions" for full device specs and the worked example.

---

### REQUIRED PRE-FLIGHT — device coordinate calculations

**Before writing a single `<svg>`, `<foreignObject>`, or `<text>` element for any device node, output this block in full.** This is not optional and cannot be skipped silently. The calculated values must match exactly what appears in the HTML.

For every node that will have a device, write:

```
Node N (cx=XXX | top/bottom | phone/laptop):
  Lines: "[line 1]" (N chars) · "[line 2]" (N chars) · "[line 3]" (N chars)
  Longest = N chars → text_width = N × 4.8 = X.X
  device_x = XXX + (X.X − [130 or 58] + 8) / 2 = XXX
  text_x   = device_x − 8 = XXX
  ✓ text-anchor="end" on all narrative <text> elements
```

Example for a bottom phone node at cx=645 with 30-char longest line:
```
Node 4 (cx=645 | bottom | phone):
  Lines: "Nour gets a push notification." (30) · "AJO sends a milestone offer." (28) · "Silver is one flight away." (26)
  Longest = 30 chars → text_width = 30 × 4.8 = 144
  device_x = 645 + (144 − 58 + 8) / 2 = 645 + 47 = 692
  text_x   = 692 − 8 = 684
  ✓ text-anchor="end"
```

If the calculated `device_x` differs from the value in the device positions table above, **use the calculated value** — the table assumes 32-char max lines. For shorter lines the device moves left.

---

**Save as:** `[client-slug]-use-case.html`

---

## Designing the 7-step journey arc

Map the selected use case to exactly 7 steps. A typical arc:

| Node | Position | Typical moment |
|------|----------|---------------|
| 0 | Bottom | Signal / trigger — RT-CDP identifies the customer |
| 1 | Top | First digital touchpoint — website visit, personalised experience |
| 2 | Bottom | Deeper engagement — browsing, comparison, intent signal |
| 3 | Top | Abandonment or friction point |
| 4 | Bottom | Re-engagement — push, email, or SMS |
| 5 | Top | Return and conversion |
| 6 | Bottom | Post-conversion — welcome, analytics, profile updated |

Adapt freely to the use case type. The arc should feel like a complete story.

---

## Narrative caption quality

Each node has exactly three lines of caption text. The three lines follow a strict structure — do not deviate:

| Line | Content |
|------|---------|
| 1 | What the **customer** does at this moment |
| 2 | What the **system** (RT-CDP / AJO / CJA) does in response |
| 3 | The **outcome** — signal fired, segment qualified, message queued, profile updated |

**Rules:**
- Use the persona's first name in at least one line per node
- Name the Adobe product explicitly (RT-CDP, AJO, CJA) — never "the platform" or "the system"
- Each line is one complete, self-contained thought (~6–10 words). No padding: "in real time", "seamlessly", "instantly" — cut unless they add meaning
- No sentence split across two lines. Every line must land cleanly when read aloud

**Good:**
```
Sophie closes the app without confirming the upgrade.
RT-CDP fires an abandonment event to AJO.
AJO queues a personalised push — ready to send.
```

**Bad (vague, no product named, incomplete sentences):**
```
Sophie exits the app without upgrading
The platform captures the signal
Journey triggered in real time
```

See `references/journey-html-rules.md` → "Narrative writing principles" for the full guidance.

---

## Brand colour guide

Find brand colours via WebSearch: `"[Client Name]" brand colours hex` or check their website CSS.

If exact hex values cannot be found, use these fallbacks:

| Industry | Primary | Dark | Light | Mid |
|----------|---------|------|-------|-----|
| Telco (generic) | `#0072CE` | `#004F8B` | `#E6F2FB` | `#B3D4F0` |
| Retail (generic) | `#E4002B` | `#A80020` | `#FDE8EC` | `#F7B3BF` |
| Financial (generic) | `#003087` | `#001F5B` | `#E6EBF5` | `#B3C0DC` |
| Aviation (generic) | `#003087` | `#001F5B` | `#E6EBF5` | `#B3C0DC` |

---

## File naming convention

| Output | Filename pattern |
|--------|-----------------|
| Combined file | `[client-slug]-use-case.html` |

Slugs are lowercase, hyphenated (e.g. `vodafone-ireland`, `el-al`, `british-airways`).

---

## Quality checklist

Before delivering the file:

- [ ] **`<title>` tag uses `&mdash;` not a literal `—`** — a literal em dash encodes as UTF-8 bytes `\xE2\x80\x94` which re-encodes to `â€"`, visible in the browser tab. Use `&mdash;` always.
- [ ] File encoding: saved as plain UTF-8, **no BOM** — use `encoding="utf-8"` (not `utf-8-sig`) on the final write. Read the template with `encoding="utf-8-sig"` to strip any BOM that may be present. All HTML/SVG attributes use ASCII straight quotes (`"`) — never curly/smart quotes (`"` `"`). Curly quotes in attribute positions break SVG rendering: the browser ignores `class`, `viewBox`, and `xmlns`, the SVG defaults to 300×150px, and most journey nodes become invisible.
- [ ] Started from `assets/use-case-template.html` — no structural HTML was regenerated
- [ ] No `{{PLACEHOLDER}}` tokens remain in the output file
- [ ] Brand colours applied to all 5 CSS vars including `--brand-rgb` (R,G,B format)
- [ ] Client logo loads (test Clearbit URL; fallback text in place)
- [ ] Use case is specific to this client — not generic AEP copy
- [ ] Video filename matches selected hero product (`AJO-Video.mp4` / `RT-CDP-Video.mp4` / `CJA.mp4`)
- [ ] Video and Adobe logo base64-embedded into HTML (no external files needed)
- [ ] Footer metrics are real numbers from research (not invented)
- [ ] Journey arc tells a coherent 7-step story for the selected use case
- [ ] Exactly 3–4 nodes have devices — not every node, only where a device illustrates the channel
- [ ] Each device type matches the channel: phone for app/push, laptop for desktop web
- [ ] Device content is client- and use-case-specific — never placeholder copy
- [ ] **Device inner elements have NO `class="device-node"`** — only the outer `<g>` wrapper carries this class. If the inner `<svg>` has it, the device will never appear even when the node is active. Search the HTML for `class="device-node"` and confirm it appears only on `<g>` elements, never on `<svg>` or `<foreignObject>`.
- [ ] All narrative lines are ≤32 chars each (counted — not estimated); **node 0 lines are ≤20 chars** (left-clip check: 40 − chars×2.4 must be ≥ −20). Node 0 has no device.
- [ ] **Narrative y-coordinates match the fixed table exactly** — top nodes: `y="-58"`/`"-47"`/`"-36"`; bottom nodes: `y="377"`/`"388"`/`"399"`. Search the HTML for `y="-` and confirm nothing is more negative than `-58`. Any `y="-133"` or similar is wrong and will float text near the top of the viewport.
- [ ] Persona profile populated from real research — device type, plan/product, usage, tenure
- [ ] Persona name used in narrative captions — at least once per node
- [ ] Each narrative caption follows the 3-line structure: customer action → system response → outcome
- [ ] Adobe product named explicitly in each narrative (RT-CDP / AJO / CJA) — never "the platform"
- [ ] Journey animation does NOT fire on page load — only when journey screen opens
- [ ] "View Journey →" on card transitions to journey screen and triggers animation
- [ ] "← Back to Card" on journey returns to card screen
- [ ] File saved with correct slug naming convention
- [ ] **Card laptop frame uses `viewBox="0 0 300 220"`** — never `viewBox="0 0 750 480"` or any other value. A wrong viewBox renders the frame as a plain dark rectangle with no aluminium, no bezel, no hinge. Grep for `viewBox="0 0 750` to confirm it is absent.
- [ ] **Phone wallpaper is near-black** — the `<rect fill="url(#...wallpaper)">` inside `<g clip-path>` must use a very dark gradient. If the brand colour is bright (orange, red, green), derive near-black tints from it (e.g. for orange `#FF6600` use stops `#1a0800 → #0f0500 → #050200`). A bright wallpaper renders as a coloured rectangle, not a device screen.
- [ ] **Journey phone nodes are direct `<svg class="device-node">`** — never `<g class="device-node"><foreignObject>`. A `<g><foreignObject>` wrapper means the CSS `.device-node.visible` opacity transition never fires (the inner SVG has no class), so the phone stays invisible on every node. Also verify `height="120"` on every phone `device-node` — never `height="106"`.
- [ ] **Notification body lines ≤29 chars each** — SVG `<text>` never wraps. Count exact characters for every line of the notification (title, body 1, body 2) before writing. Panel usable width ≈ 170px at 10.5px font = 29 chars max. Never estimate.
- [ ] **Every device node: centering formula worked out explicitly** — show `text_width = chars × 4.8`, `device_x = cx + (text_width − device_width + 8) / 2`, `text_x = device_x − 8` for each device node. Never copy `cx+16`/`cx+52` from the table without recalculating for actual line lengths.
- [ ] **Narrative text at device nodes uses `text-anchor="end"` at `text_x`** — never `text-anchor="middle"` at `cx`. Search the HTML for `text-anchor="middle"` in narrative groups and confirm none appear at device nodes.
- [ ] **Journey laptop nodes use the two-layer structure** — screen content div (behind) + aluminium SVG overlay (`viewBox="0 0 300 220"`, `position:absolute`), both inside a `position:relative` wrapper div inside `<foreignObject class="device-node" height="96">`. Never replace this with a simplified standalone `<svg>`. Each laptop's `<defs>` IDs must carry a unique prefix (e.g. `sn1-`, `sn5-`) — shared IDs silently break all laptops after the first.
