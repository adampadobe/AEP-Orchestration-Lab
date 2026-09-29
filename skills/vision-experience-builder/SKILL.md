---
name: vision-experience-builder
description: The BUILD STAGE of the experience-story-builder pipeline — assembles the animated HTML for an Adobe experience-story / vision demo from a NORMALIZED storyboard. Invoked by experience-story-builder, or directly when the user explicitly wants only the render step ("assemble the slides", "build the scene HTML", "render the deck", "regenerate this scene"). Takes a customer brief + normalized storyboard; outputs a single self-contained HTML file. For an END-TO-END build from a brief/idea (intake → brand → build → review), use the experience-story-builder orchestrator instead — not this skill.
---

# Vision Experience Builder

Assemble pixel-faithful, animated HTML vision demos from a customer brief and storyboard. Output is a single self-contained HTML file — zero dependencies, runs in any browser.

## Trigger Phrases
`vision demo` · `experience story` · `EBC demo` · `customer demo` · `assemble the slides` · `build the demo`

## Infrastructure

This skill **extends** `frontend-slides`. It:
- **USES** `viewport-base.css`, `html-template.md`, `animation-patterns.md`, the 1920×1080 fixed stage, nav/keyboard JS, deploy and export scripts
- **SKIPS** frontend-slides Phases 1–2 (brief and storyboard come from the upstream skill chain)
- **REPLACES** style discovery with the SB GenAI design system defined in this file
- **ADDS** 8 vision-demo scene templates as the authoring vocabulary

**Before generating, always read:**
- `../frontend-slides/viewport-base.css` — mandatory fixed-stage CSS (include verbatim in `<style>`)
- `../frontend-slides/html-template.md` — HTML architecture, keyboard nav JS, slide counter
- `../frontend-slides/animation-patterns.md` — animation snippets keyed to scene feeling
- `templates/design-tokens.css` — Adobe **marketer-deck** palette (red / purple)
- `components/design-tokens-narrative.css` — **journey-deck** palette (navy / gold, premium-editorial)
- `imagery-and-assets.md` — **read before building any deck with imagery.** How to inventory every image (incl. images *inside embedded mockups*), generate via the Firefly/Stock connectors, handle logos, and the reusable premium components. No placeholder ever ships. Also covers **scene-artifact fidelity** (§7 — emails/calls/screens built to real chrome), **icon discipline** (§8 — inline SVG, never emoji), **interactive deep-linked mocks** (§9), `contain` vs `cover` for content images (§3), and DOM-eval verification when the screenshotter is down (§6).
- `components/README.md` — **the reusable building-block library.** Templates = whole slides; components = parts that compose into slides (mobile email, phone frame, touchpoint chain, big-number reveal, passage-of-time, CJA inset, etc.). Pull from here rather than rebuilding — encodes hard-won animation timing and artifact fidelity from the P&O × Adobe build.

---

## STOP — go/no-go before ANY full build (even when invoked directly)

This is the guard that was missing on the Premier League build (Jul 2026): the agent was told
"build the 5 screens", came straight here, skipped the checks, and silently fell back to a
hand-drawn SVG crest and CSS gradients instead of real assets. The result looked fine but was
structurally a mockup. Do not repeat it.

**If you are invoked directly** (e.g. "build the screens", "assemble the slides", "make the
deck") rather than by the `experience-story-builder` orchestrator, you MUST run this go/no-go
first and get a conscious decision from the user — you may not silently degrade:

0. **Run the deterministic gate FIRST — it is the code backstop for steps 1–3:**
   ```
   python ${CLAUDE_PLUGIN_ROOT}/skills/experience-story-builder/scripts/pipeline_state.py <slug> --require
   ```
   Bare `--require` checks ALL six build gates: `preflight`, `connectors_confirmed`,
   `storyboard_validated`, `brand_resolved`, `assets_inventoried`, `library_retrieved`.
   If it exits non-zero (`[GATE FAIL]`), **STOP — do not generate any HTML.** Each stage records
   its gate as it completes (`validate_storyboard.py` auto-records `storyboard_validated`;
   `catalog_pick.py` records `library_retrieved`; the orchestrator records the rest with
   `pipeline_state.py <slug> --set <gate>=passed` once each is genuinely done). A missing gate
   means that stage didn't run — go do it, don't narrate past it. **This makes a full-deck
   build orchestrator-only in practice: the gates only exist if the orchestrator's stages ran.**
   The ONE direct-entry exception that needs no gate check: regenerating a single existing
   scene of an already-`built` deck ("regenerate slide 4") — everything else goes through
   the orchestrator.

1. **Connector check.** Probe for **Claude_Preview** + **Firefly** + **Adobe for Creativity**
   via ToolSearch (Stock, Express and Brandfetch are optional). If **Firefly is not connected, STOP**
   and say, in plain terms: *"Firefly is not connected, so I can't generate real photos/screens.
   Connect Firefly via /mcp and I'll build it properly, or say 'build without
   images' and I'll use plain visuals — which do you want?"* Never decide this silently.
2. **Real brand assets.** Resolve the **real** customer logo + palette — keyless scrape
   (`scripts/brand_fetch.py`) → Brandfetch → ask the user. **Never hand-draw or stylise a
   stand-in logo/crest.** If you can't get the real mark, STOP and ask for it.
3. **Asset inventory (Phase 1.5) is mandatory** — list every image slot and resolve each
   (real generated/sourced image or supplied asset) before Phase 2. No gradient/emoji/SVG
   stand-in ships.
4. **Confirm the scene→template mapping** with the user before generating HTML.

Prefer entering through the `experience-story-builder` orchestrator, which runs its Stage 0.0
preflight for you. This block is the fallback so a direct entry can't skip the checks.

## Phase 0: Input Detection

Check what exists before proceeding:

| Input | Where to look | Fallback |
|---|---|---|
| Customer brief | `briefs/{{customer_slug}}-brief.json` or `.md` | Ask for customer name + URL |
| Storyboard | `demos/{{customer_slug}}-storyboard.json` (validated typed contract; `.md` is the readable view) | Generate 5-scene outline from brief |
| Customer logo | `assets/{{customer_slug}}/` | Brandfetch lookup |
| Adobe brand assets | `assets/adobe/` | Run `adobe-brand-fetcher` skill |
| Adobe Fonts kit ID | Ask user, or check existing demo HTML | Fallback to Source Sans 3 |
| Persona assets | `assets/personas/personas.json` | Adobe Stock → Firefly (see below) |

---

## Persona Resolution

Run this before scene assembly. Personas are stored in `assets/personas/` alongside the skill.

### Step 1 — Match archetype from storyboard tags

Read `assets/personas/personas.json`. Match the storyboard's persona description against the `tags` array:

```
marketing, female, 30s, content-marketer, b2b, qsr  →  modern-marketer-female-30s/
```

If matched, load `assets/personas/{folder}/meta.json` for the full pose inventory.

### Step 2 — Select pose by scene type

Each persona has 8 poses. Use `meta.json → scene_defaults` as the primary lookup, or apply these rules:

| Scene template | Default pose | Rationale |
|---|---|---|
| `persona-hero-splash` | `pose-7.png` | Both fingers pointing up — celebratory, most dynamic |
| `cobrand-hero-persona` | `pose-8.png` | Warm direct smile, holding laptop — approachable cover |
| `chat-notification` | `pose-4.png` | Looking down at open laptop — naturally reads as device interaction |
| `section-title` / `section-title-gradient` | `pose-7.png` | High energy chapter opener |
| `ai-response-with-chart` | `pose-5.png` | "Wow" hands-raised reaction — matches AI insight reveal moment |
| `journey-canvas` | `pose-4.png` | Focused/engaged, laptop open |
| `brand-sting` | `pose-6.png` | No laptop, stylish — clean brand moment |

The storyboard may override any pose with an explicit `pose_number` field (1–8).

**Persona consistency & crops.** Use **one name and one face** across every scene — if the SC renames the persona, rename everywhere (story rail, avatars, quotes, screens). When the SC supplies a **real photo**, use it over the repo/generated option. Cut avatars **head-and-shoulders, not a tight face zoom** (SC feedback: "she's too zoomed in her profile pics") — a wider crop (e.g. full-width square from a portrait) reads better at avatar size. **Cache-bust persona image edits** with `?v=N` — the preview serves the old crop otherwise.

### Step 3 — Reference path in HTML

```html
<!-- Persona image path relative to the output HTML file -->
<img src="../assets/personas/modern-marketer-female-30s/pose-7.png" alt="Jessica" class="persona-img">
```

Adjust the relative path based on where the demo HTML is saved (typically `demos/`).

### Step 4 — Fallback order if no repository match

A persona only auto-matches if it has real `tags` in `personas.json`. Personas with `tags: []`
(freshly harvested, muted on purpose) will NOT match — treat the library as "matchable tags only."

1. **Repository** — check `personas.json` for an archetype tag match (above).
2. **Adobe Stock** — search for a matching persona cutout; license via the `adobe-brand-fetcher`
   workflow (ask before licensing).
3. **Firefly → Express → bank (mint a new persona).** When nothing matches, generate one AND add
   it back to the library so the next build reuses it (the repo grows every build, like animations):
   1. **Generate (Firefly)** — `firefly_generate_image`, a Firefly model, portrait size `1792x2304`.
      Prompt shape: `"[age] [gender] [ethnicity if in brief], [role], [wardrobe], head and shoulders,
      photorealistic, plain neutral background, soft studio light, no text"`. Generate **1–2 poses**
      (a calm camera-facing primary + optionally a looking-down-at-device pose) so hero AND
      notification scenes are covered. `curl` the presigned S3 URLs to disk immediately (they expire ~1h).
   2. **Cut out (Adobe Express)** — `adobe_mandatory_init` first, then `image_remove_background` on
      each pose → transparent PNG (the components sit the persona on a brand-gradient panel with
      `object-fit:contain`; a white rectangle looks broken). Then `image_crop_and_resize` for a
      **head-and-shoulders** avatar crop (not a tight face zoom). Download each result to disk.
   3. **Bank it** — run the minter so it lands in the library with real tags + a `personas.json` entry:
      ```
      python ${CLAUDE_PLUGIN_ROOT}/skills/vision-experience-builder/scripts/persona_mint.py \
        --name "<Name>" --role "<role>" \
        --tags <gender>,<age>,<ethnicity>,<industry>,<story-type>,customer \
        --pose <cutout-1.png> [--pose <cutout-2.png>] --avatar <avatar.png> \
        --source firefly-<slug>
      ```
      It writes `assets/personas/firefly-<slug>/` (poses + avatar + `meta.json` with `scene_defaults`)
      **and registers the entry in `personas.json`** so tag-matching finds it next time. Derive the
      `--tags` from the storyboard PERSONA block — they're what future matches key on, so be generous.
   4. Use the returned `<img>` path in the deck. **Never ship an initial-letter avatar or a
      white-box "cutout" that wasn't background-removed.**

---

## Templates vs Components

Two libraries:

- **`templates/`** — full-SCENE templates that the storyboard maps to in Phase 1
  (`brand-sting`, `cobrand-hero-persona`, `cobrand-cover`, `persona-hero-splash`,
  `journey-canvas-*`, `section-title-gradient`, `ai-response-with-chart`).
  An SC recognises these by name.

- **`components/`** — reusable building blocks that drop INSIDE scenes:
  `dual-pane-narrative-scene` (the workhorse layout), `mobile-phone-frame`,
  `mobile-email-ios` (iOS-Mail-grade chrome), `mobile-lockscreen-notification`,
  `mobile-call-screen`, `touchpoint-chain`, `big-number-money-reveal`,
  `cja-data-inset`, `passage-of-time`, `browser-frame`,
  `browser-url-typing-animation`, `close-tab-animation`,
  `journey-wave-anchored-icons`, `radial-gauge`, `stitch-data-sources`,
  `persona-profile-bar`, `mvp-pill`.

  Plus three shared files every deck includes ONCE:
  `_foundation.css` (shared keyframes + entrance helpers + viewport),
  `design-tokens-narrative.css` (journey palette),
  `count-up.js` (number animator + show/scaleStage controller),
  `icons/pack.json` (the labelled Spectrum/Lucide icon set — look up by meaning, paste
  inline SVG, never emoji).

  Browse `components/README.md` for the picker table ("I need a mobile
  email arriving → use these three").

## Phase 1: Scene Assembly

Map each storyboard scene to a scene template **and** the components it
composes. Present the mapping table before writing any HTML. Example:

| Slide | Template / layout | Components used | Filled slots |
|---|---|---|---|
| 1 | `cobrand-cover` | — | customer_logo, accent_color, tagline |
| 2 | `journey-wave-anchored-icons` | (component is the whole slide) | 5–7 nodes, key node, ship path |
| 3 | `dual-pane-narrative-scene` | `browser-frame` (interactive) + `mvp-pill` | persona, headline, narrative, takeaway |
| 4 | `dual-pane-narrative-scene` | `browser-frame` + `close-tab-animation` + `mvp-pill` | abandon line £0, persona quote |
| 5 | `passage-of-time` | — | "25 minutes later" |
| 6 | `dual-pane-narrative-scene` | `mobile-phone-frame` + `mobile-lockscreen-notification` + `mobile-email-ios` + `mvp-pill` | recovery email subject/body/CTA from `.eml`, ref code, hero img |
| 7 | `dual-pane-narrative-scene` | `mobile-call-screen` (variant A) + `mvp-pill` | caller, booking-confirmed total |
| 8 | `dual-pane-narrative-scene` | `big-number-money-reveal` + `touchpoint-chain` + `cja-data-inset` + `mvp-pill post` | big total, breakdown, sankey image |

**Confirm mapping with user before generating HTML.**

---

## Phase 1.5: Asset & Image Inventory  (MANDATORY — do before Phase 2)

Before writing any HTML, inventory **every image the deck needs** and resolve each one. This is the step that prevents shipping placeholders. Full method: `imagery-and-assets.md`. In short:

1. Walk the storyboard and list every image: persona portraits, scene hero/destination/product photos, logos (per background), **and every image slot *inside* any embedded mockup** — `grep -niE 'scenic image|hero image| image<|placeholder|linear-gradient' mockup.html` (iframes hide their own placeholders from slide-level review — this is the gap that bit us).
2. Resolve each: **persona repo first** (Persona Resolution — never default to a placeholder avatar when an archetype matches), then **Firefly** (`firefly_generate_image`, Firefly models, supported sizes, download presigned URLs immediately), or **Adobe Stock** (ask before licensing).
3. Track a manifest (slot → source → status). **Nothing proceeds to build until every slot is resolved** — gradient stand-ins, "[X] scenic image" labels, and initial-letter avatars are not acceptable in delivery.
4. After editing any embedded mockup file, **reload the preview before screenshotting** (the iframe caches).

---

## Phase 2: Generate HTML Deck

Single-file output structure:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>{{customer_name}} × Adobe — Vision Demo</title>
  <!-- FONTS (ship-safe + offline — see asset-licensing.md):
       Default = EMBED Source Sans 3 (SIL OFL) as the Adobe Clean stand-in via @font-face with a
       base64 WOFF2 (installed by adobe-brand-fetcher). Keep "Adobe Clean" FIRST in the stack so
       it resolves for internal viewers who have it locally.
       NEVER inline/self-host Adobe Clean or a Typekit kit in a distributed file — Adobe's font
       license forbids it AND a CDN link breaks the offline guarantee.
       Interim ONLY (embedded WOFF2 not present AND online guaranteed): you may uncomment the
       Google Fonts Source Sans 3 link. Embedding is the shippable default. -->
  <style>/* @font-face: Source Sans 3 (base64 WOFF2) — from adobe-brand-fetcher */</style>
  <!-- <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700;900&display=swap" rel="stylesheet"> -->
  <style>
    /* 1. viewport-base.css — verbatim */
    /* 2. design-tokens.css — verbatim */
    /* 3. Deck chrome (slide counter only — NO on-screen keyboard/nav hint; see design rules) */
    /* 4. Per-slide template CSS */
  </style>
</head>
<body>
  <div class="deck-viewport">
    <div class="deck-stage">
      <!-- <section class="slide"> for each scene -->
    </div>
  </div>
  <script>/* deck navigation JS from html-template.md */</script>
</body>
</html>
```

**Rules:**
- Slide visibility via `.active` class (`visibility`/`opacity`/`pointer-events`) — **never `display:none`**
- Substitute ALL `{{handlebars}}` from brief/storyboard. Zero `{{` in output.
- Customer brand colours: override `--customer-primary` and `--customer-secondary` on `:root`
- **Font (ship-safe):** `font-family: 'Adobe Clean','Source Sans 3','Inter',system-ui,sans-serif`
  everywhere. Adobe Clean resolves internally; **Source Sans 3 (OFL) is the embedded face that
  actually ships** externally. **Never ship Adobe Clean font files or a Typekit kit** (`asset-licensing.md`).
- **Asset licensing (ship-safe) — see `asset-licensing.md`.** Icons: Spectrum (Apache-2.0) +
  Lucide (ISC), labelled `name→SVG` lookup. Device frames: generic/brandless only (trademark).
  Personas: Firefly, never un-released stock faces. Customer logo: nominative use, unmodified.
  Animation: GSAP (free — keep its license banner) or MIT Motion/anime.js; maps need bundled
  local tiles or a static image to stay offline.
- **Icons: inline SVG only, never emoji** (`imagery-and-assets.md` §8); each icon matches its label.
  Look them up by **semantic label** from `components/icons/pack.json` (Lucide ISC / Spectrum
  Apache-2.0) — don't hand-draw ad-hoc paths.
- **Rich animation: inline `components/vendor/gsap.min.js`** (+ `ScrollTrigger.min.js` if a scene
  scrolls) for timeline/emphasis/data-reveal motion — **keep GSAP's license banner**. Simple
  entrances stay CSS keyframes (0 KB). (`asset-licensing.md`)
- **Content images (charts/screens/diagrams): `object-fit:contain`, never `cover`** — show them in full (§3).
- **Real-world artifacts** (email/call/screen/receipt) built to authentic chrome (§7); **customer-app
  moments** built as interactive deep-linked iframe mocks (§9), not static images.
- **Build scenes in the SC's exact order** — including non-linear beats (abandon → return) and
  passage-of-time interstitials — and honour MVP / POST-MVP tags as on-screen pills. Re-verify the
  slide counter and nav after any re-order.

### Design rules — make it look authored, not generated (from SC feedback, Jul 2026)

These are not optional polish; they're what stops a deck reading as machine output.

- **No on-screen navigation hint.** Never render "← → to advance" / "space to navigate" /
  "USE KEYS" or any keyboard-hint chrome on the stage. Keyboard + click nav still work via JS —
  just don't show the affordance. (A tiny slide counter is fine; a nav instruction is not.)
- **Editorial story rail, NOT boxed prompt-output.** The left rail must read as a designed
  editorial column, not a stack of uniform boxes. Avoid the tell-tale "numbered disc → headline
  → narrative → boxed labelled card → takeaway" ladder where every element is a bordered box.
  Lead with typographic hierarchy and whitespace; use at most ONE boxed element (e.g. a single
  pull-quote or profile inset), not three. A small step number as a quiet eyebrow beats a big
  filled disc.
- **Open with context, never cold.** After the cover, include an **intro sequence**: a
  **persona-card** slide and a **premise / background** slide (the story format's PERSONA /
  BACKGROUND sections). Build from `templates/persona-hero-splash.html` + a background/section
  slide. A cover alone is not enough setup.
- **Considered spacing; no bottom-left crowding.** Keep the persona footer, stage-progress bar,
  and slide counter from colliding. Give the slide generous, deliberate margins — err toward more
  whitespace than feels necessary.
- **Real assets only** (restating the STOP block): real customer logo, photoreal persona,
  real hero/product imagery. A stylised SVG stand-in or gradient "photo" is a placeholder and
  must not ship.

---

## Phase 3: Deliver

1. Save to `demos/{{customer_slug}}-vision-demo.html`
2. Open in browser for immediate review
3. Tell the user:
   - File path, slide count, Adobe Fonts kit status
   - Navigation: `←` `→` or `Space` to advance, `Home`/`End` for first/last
   - Share: `bash ../frontend-slides/scripts/deploy.sh demos/{{customer_slug}}-vision-demo.html`
   - PDF export: `bash ../frontend-slides/scripts/export-pdf.sh demos/{{customer_slug}}-vision-demo.html`

### Preview / QA notes (Claude_Preview MCP)
- Serve via `.claude/launch.json` (`python -m http.server <port> --directory <demo folder>`), then `preview_start` → `preview_screenshot`.
- **Black-border / cropped screenshots** come from a high `devicePixelRatio` (e.g. 2.5). Capture at the stage size divided by the dpr — for 1920×1080 at dpr 2.5 use **768×432** — to get the full frame.
- The screenshot renderer is intermittently flaky (30s timeouts and occasional blank-white frames mid-reload). Fix: retry once, and if still stuck `preview_stop` + `preview_start` a fresh server.
- After `location.reload()` the deck resets to slide 1; to capture a later slide, dispatch `new KeyboardEvent('keydown',{key:'ArrowRight'})` (or toggle `.active`) before the screenshot.

---

## Scene Templates

Eight scene types. HTML templates in `templates/`. Read before assembling.

### 1. `brand-sting`
**File:** `templates/cover-adobe-brand.html`
**Background:** Solid `#EB1000`
**Use for:** Opening brand moment, chapter zero
**Slots:** `{{product_name}}`, `{{tagline}}`, `{{adobe_symbol_path}}`
**Nav dots:** white variant, dot 1 active

### 2. `cobrand-hero-persona`
**File:** *(build inline — no separate template file)*
**Background:** bg-light gradient
**Use for:** Demo cover, co-brand entry
**Slots:** `{{customer_name}}`, `{{headline_line2}}`, `{{product_name}}`, `{{persona_photo}}`, `{{customer_logo}}`, `{{context_label}}`
**Nav dots:** dark variant, dot 1 active

### 2b. `cobrand-cover` (two-logo lockup)
**File:** `templates/cover-cobrand-lockup.html`
**Background:** customer brand gradient (dark/colour) — `{{bg_gradient}}`
**Use for:** Deck cover where two logos meet — `{{Customer}} × Adobe` — no persona, clean brand moment. Use `cobrand-hero-persona` instead when the cover needs a person.
**Slots:** `{{bg_gradient}}`, `{{customer_logo_path}}` (WHITE variant), `{{customer_name}}`, `{{adobe_wordmark_path}}`, `{{adobe_symbol_path}}`, `{{nav_label}}`, `{{tagline}}`, `{{accent_color}}`, `{{customer_logo_height}}`
**Pattern:** Centred flex lockup joined by a thin `×`; customer + Adobe wordmarks at **equal visual weight** (size by wordmark cap-height — see template note); accent rule + uppercase tagline beneath; bloom + vignette. Staggered entrance animations keyed to `.active`.
**Learned from:** Carnival × Adobe cover (`demos/carnival-example/index.html` slide 1, 2 Jun 2026)
**Nav dots:** white variant, dot 1 active

### 3. `chat-notification`
**File:** *(build inline)*
**Background:** bg-light
**Use for:** Customer pain point as notification stream
**Slots:** `{{persona_name}}`, `{{persona_avatar}}`, `{{notification_N}}` (blue/yellow/white variants)
**Pattern:** Cards stacked vertically at left:357px; slight horizontal stagger; yellow `#FFF799` highlight on key phrase

### 4. `chaos-scattered-ui`
**File:** *(build inline)*
**Background:** bg-light
**Use for:** "Before" state — fragmented tools, information overload
**Slots:** `{{chaos_cards[]}}`, `{{chaos_caption}}`
**Pattern:** 6–10 `<div>` cards `position:absolute`, `transform:rotate(±N deg)`, overlapping z-order

### 5. `persona-hero-splash`
**File:** `templates/persona-hero-splash.html`
**Background:** `#EB1000` → navy gradient
**Use for:** Chapter transition, section opener with persona
**Slots:** `{{title_line1–3}}`, `{{persona_photo}}`, `{{kpi_value}}`, `{{kpi_label}}`, `{{kpi_colour}}`, `{{chapter_title}}`, `{{product_context}}`
**Nav dots:** white variant

### 6. `capability-overview`
**File:** *(build inline)*
**Background:** bg-light
**Use for:** 2–3 column feature/product overview
**Slots:** `{{headline}}`, `{{highlight_phrase}}`, `{{cards[]}}` (icon, title, body), `{{product_context}}`
**Pattern:** Yellow `#FFF799` highlight block behind key phrase; cards with shadow, 26px radius

### 7. `journey-canvas`
**File:** `templates/journey-canvas-4-stage.html`
**Background:** White
**Use for:** Customer journey flow, product integration map
**Slots:** `{{stage_N_name}}`, `{{stage_N_desc}}`, `{{stage_N_product}}`, `{{active_stage}}`, `{{persona_name}}`, `{{chapter_title}}`
**Pattern:** 4-stage horizontal flex; cyan `#00F3FE` product chips; `#EB1000` on active stage

### 7b. `journey-canvas-editorial`
**File:** `templates/journey-canvas-editorial.html`
**Background:** Ice-blue gradient `linear-gradient(155deg, #E8EEFF 0%, #F2F5FF 50%, #EEF4FF 100%)`
**Use for:** Editorial/premium journey map — when the standard horizontal layout feels flat. Best for demos with a strong AI-activation moment (stage 2 highlighted).
**Slots:** `{{persona_name}}`, `{{chapter_title}}`, `{{product_context}}`, `{{adobe_symbol_path}}`, `{{stage_N_name/desc/product}}`, `{{stage_2_active_class}}`, `{{brief_label}}`, `{{plan_card_roas}}`, `{{push_notif_title}}`, `{{push_notif_body}}`, `{{ctr_value}}`, `{{brand_primary}}`, `{{brand_accent}}`, `{{customer_logo_path}}`, `{{customer_name}}`
**Pattern:** Zigzag absolute-positioned gradient pill nodes; red SVG cubic bezier arrows; 5 floating white UI mock cards (analytics, phone mockup, push notification, funnel bars, CTR badge + metrics). Staggered entrance animations. CSS vars `--brand-primary` / `--brand-accent` for per-customer theming.
**Learned from:** Subway demo (`demos/subway-test/index.html`, slide 3)

### 8. `section-title-gradient`
**File:** `templates/section-title-gradient.html`
**Background:** `#EB1000` → purple gradient
**Use for:** Chapter opener with data stat badges
**Slots:** `{{title_line1–3}}`, `{{persona_photo}}`, `{{stat_value}}`, `{{stat_label}}`, `{{stat_colour}}`, `{{budget_value}}`, `{{chapter_number}}`, `{{chapter_title}}`
**Nav dots:** white variant

### 9. `ai-response-with-chart`
**File:** `templates/scene-ai-response-with-chart.html`
**Background:** Red→purple gradient (`#EB1000` → `#4C50CC` → `#6349E0`)
**Use for:** AI insight reveal, progressive data response (2 slides in sequence)
**Slots:** `{{ai_finding_N}}`, `{{chart_N_title}}`, `{{chart_N_bar_N_label}}`, `{{chart_N_bar_N_height}}`, `{{product_context}}`
**Pattern:** Two separate `<section>` elements (step 1 + step 2). Charts enter from below at rotation ±7°.

---

## Design Tokens (Quick Reference)

Full set: `templates/design-tokens.css`

```css
/* Backgrounds */
--bg-red:         linear-gradient(135deg, #EB1000 0%, #C50D00 100%);
--bg-red-purple:  linear-gradient(90deg, #EB1000 0%, #4C50CC 60%, #6349E0 100%);
--bg-red-violet:  linear-gradient(135deg, #EB1000 40%, #6D5FEB 80%, #96A3F9 100%);
--bg-light:       linear-gradient(135deg, #F5F8FF 0%, #FFFFFF 60%, #EEF0FA 100%);

/* Core colours */
--color-adobe-red:       #EB1000;
--color-primary-purple:  #4C50CC;
--color-blue:            #6349E0;
--color-blue-light:      #6D5FEB;
--color-lavender:        #96A3F9;
--color-cyan:            #00F3FE;
--color-navy:            #0B2B93;
--color-highlight:       #FFF799;
--color-orange-stat:     #E9740A;

/* Type scale */
--text-h1: 208px; --text-message: 58px;
--text-body: 28px; --text-label: 16px;

/* Font */
--font-primary: 'Adobe Clean', 'Source Sans 3', sans-serif;
```

## Customer Brand

Override per customer on `:root`:
```css
--customer-primary:   #0033A1;  /* Standard Bank: royal blue */
--customer-secondary: #D0021B;  /* Standard Bank: crimson red */
```
Source verified hex from `assets/{{customer_slug}}/` (Brandfetch).

### Fetching customer assets via the Brandfetch MCP

`mcp__brandfetch__get_brand` (domain in, brand record out) is the source of truth. Save the full JSON to `assets/{{customer_slug}}/brand-kit.json` and pull colours/fonts/logos from it.

1. **Disambiguate the brand FIRST.** Confirm the exact legal entity against the customer's own mockup/brief before building — same-name brands diverge hard. Real example: "Carnival" = **Carnival Cruise Line** (carnival.com, red-swoosh master brand) which is a *different brand with a different logo* from "Carnival UK" (= P&O Cruises + Cunard, Southampton). Building the wrong one wastes the whole deck. If ambiguous, surface the candidates and ask.
2. **Download the real SVG via the `get_brand` `src` URL** — those URLs carry a per-request credential (`?c=…`) and ARE fetchable programmatically:
   ```bash
   curl -sSL -A "Mozilla/5.0" -o assets/{{customer_slug}}/logo.svg "<get_brand logos[].src URL with ?c=…>"
   ```
   Pitfalls: `build_logo_urls` returns **hotlink-only** URLs (not for download). `get_asset_base64` on a `.svg` endpoint can return **WebP** bytes (not usable as SVG). Prefer curl of the `get_brand` src.
3. **Recolour for dark backgrounds.** Most brand SVGs ship dark-on-light. For a white-on-colour cover, map the dark fills to white but KEEP the accent (e.g. a coloured swoosh). Inspect actual `fill="…"` values first — wordmark glyphs are often literal `fill="black"` separate from the brand-colour shapes:
   ```bash
   sed -e 's/fill="black"/fill="#FFFFFF"/g' -e 's/fill="#10559A"/fill="#FFFFFF"/g' logo.svg > logo-white.svg
   ```
4. **Trim taglines / tighten the viewBox** only if you need a wordmark-only lockup; otherwise keep the full logo. Delete the unwanted `<path>`s and shrink the `viewBox` to the remaining art:
   ```bash
   sed -e '/<unwanted path d=…>/d' logo-white.svg > wordmark-white.svg
   sed -i 's/viewBox="0 0 137 52"/viewBox="0 0 133 34"/' wordmark-white.svg
   ```
   Keep the trimmed and full variants side by side — stakeholders flip-flop ("trim it" → "go back to the original"). Cost of keeping both is one file.
5. **Equal visual weight in co-brand lockups** — see the sizing note in `templates/cover-cobrand-lockup.html`: match the customer **wordmark cap-height** to the Adobe wordmark, not the SVG box (logos with a strapline beneath need sizing UP).

## Adobe Fonts (ship-safe — see `asset-licensing.md`)

**Do NOT put a Typekit kit `<link>` in a distributed/offline deck** — Adobe's license doesn't
permit self-hosting/embedding the font files, and a CDN link breaks the offline guarantee.

- **Shippable default:** embed **Source Sans 3 (SIL OFL)** as a base64 WOFF2 `@font-face`
  (installed by `adobe-brand-fetcher`). Keep `'Adobe Clean'` first in the stack so it resolves for
  internal viewers who have it installed; Source Sans 3 is what actually ships to everyone else.
- **Adobe Clean is fine** for internal authoring and in the exported (rasterized) PDF — just not as
  a font file inside the live HTML.
- A Typekit kit link is acceptable ONLY for an online-guaranteed internal preview, never as the
  sole font path of a shipped file.
