# Imagery & Assets — resolve every image BEFORE building

Hard rule learned the hard way: **no placeholder ever ships.** Gradient stand-ins, "[X] scenic image" labels, and initial-letter avatars are not acceptable in a delivered deck. The way to guarantee that is to **inventory every image at storyboard time** and resolve each one before assembly — not discover gaps slide-by-slide afterwards.

## 1. Asset & Image Inventory (do this at storyboard/normalize, before Phase 2 build)

Walk the whole storyboard and produce a manifest of **every** image the deck needs. Miss none of these categories:

- **Persona portraits** — one per named persona.
- **Scene hero / destination / product photos** — anything a scene shows as a photo (cruise destinations, ships, lifestyle).
- **Brand logos** — customer + Adobe, in the variants the layout needs (dark-bg vs light-bg).
- **Images INSIDE embedded mockups** — ⚠️ the one that bit us. When you embed customer/SC HTML via `<iframe>`, that HTML has its *own* image slots (e.g. `PO_Shore_Excursions.html` had "Amalfi Coast scenic image", "Cinque Terre scenic image", "Gothic Quarter image" as coloured-div placeholders). The deck-level review never sees them because they're in the iframe. **Grep every embedded mockup** for placeholder patterns before building:
  ```bash
  grep -niE 'scenic image|hero image| image<|placeholder|linear-gradient' mockup.html
  ```
  Add each found slot to the manifest.

Manifest format (one row per image):

| slot id | where (slide / mockup file + element) | description for prompt | source | status |
|---|---|---|---|---|
| persona-sarah | Meet Sarah portrait + avatars | British woman 42, warm, smart-casual | Firefly | ☐ |
| dest-fjords | Scene 1 card 3 `.ph` | Norwegian fjord, no people | Firefly | ☐ |
| exc-amalfi | PO_Shore_Excursions.html `.excursion-img` #1 | Amalfi coast village | Firefly | ☐ |

Nothing moves to build until every row is **resolved**.

## 2. Sourcing — in priority order

1. **Persona repository FIRST.** Run Persona Resolution (see SKILL.md): match each persona's role to a `assets/personas/<archetype>/meta.json` `tags` entry and use a pose from `scene_defaults` **before** generating or placeholding. (We shipped placeholder avatars once because this step was skipped — don't.)
2. **Firefly MCP — `firefly_generate_image`** (connector "Firefly MCP - Prod"). Generate everything the repo doesn't cover.
   - **Prefer Firefly models** (`firefly-image-4-ultra`, `firefly-image-5`) for a customer-facing Adobe deck — commercially safe, on-message. (Avoid flux/gpt/imagen for client work unless asked.)
   - **Supported sizes only** (it errors otherwise): `1024x1024, 2048x2048, 3072x3072, 1152x896, 896x1152, 1344x768, 2304x1792, 1792x2304, 2688x1536, 2688x3456, 3456x2688, 4032x2304, 720x1280, 1440x2560, 2160x3840`. Portraits → `1792x2304`; landscapes/destinations → `2304x1792` or `1344x768`.
   - Returns **presigned S3 URLs valid ~1 hour** → `curl` them into the demo folder **immediately**.
   - Destination prompts: end with "no text, no people". Persona prompts: photoreal, "head and shoulders", plain background.
   - `firefly_check_credits` first if unsure (had 8100).
3. **Adobe Stock MCP** (`search` → `asset_license_and_download_stock`) when a real licensed photo beats generation. Licensing consumes entitlement and is a download — **ask the user before licensing**. ⚠️ The connected Stock may be a **Stage/test catalog** (e.g. `Stock MCP Stage`): tiny inventory, and licensing new assets fails with "get a free trial" (no entitlement) — only assets *already* licensed in that account are usable. Verify with one `search` first; if Stage, fall back to Firefly for anything it can't cover. Search can also 500 on huge result counts — use a tighter query.
4. **Adobe Express MCP** (`mcp__…638ec4c9…`) for *editing* generated/sourced images — call `adobe_mandatory_init` first. Use `image_remove_background` (logo/persona cutouts), `image_crop_and_resize` (tight face/subject crops), `image_adjust_*` (colour-match to brand). Note: these need a **fetchable URL** — the Firefly S3 URL works; a `localhost` preview path does not.

## 3. Wiring images in
- Deck slots: replace CSS gradient `.ph`/thumbnail backgrounds with `background:url(file.jpg) center/cover`. Remove any leftover decorative pseudo-elements (we had a `.ph:after` "grass" strip overlaying photos — kill it).
- Embedded mockups: edit the mockup HTML's placeholder element (swap its gradient bg for the image, delete the label text node).
- Persona cutouts (transparent PNG) → `object-fit:contain` on a brand-gradient panel. Full rectangular photos → `object-fit:cover`.
- **Content image vs decorative image — choose `object-fit` deliberately.** *Decorative/atmospheric* (hero photo, destination card, background) → `cover`; cropping is fine. A *content* image the viewer must read in full — chart, dashboard, sankey, diagram, screenshot, a CJA report — → **`contain` (or natural width/auto height), NEVER `cover`.** Cover-cropping a data image silently cuts off the thing it exists to show. Bit us: the CJA "Most Popular Paths" sankey (2257×1231) sat in a `height:188px;object-fit:cover` box → top-and-tailed; the SC said "make sure the CJA image is all there, you've cut it off." Before shipping, for every chart/screenshot/diagram `<img>` or background, confirm the **whole** image shows (compare `naturalWidth/naturalHeight` aspect to the container — if it's `cover`, it's a bug).
- **After editing any iframed mockup file, cache-bust the iframe before screenshotting.** A soft `location.reload()` often still serves the *cached* iframe (looks unchanged). Reliable fix — bump the iframe src: `document.querySelectorAll('iframe').forEach(f=>f.src=f.src.split('?')[0]+'?v='+Date.now())`. (Burned two verification cycles before realising a reload wasn't enough.)

## 4. Logos
- Brandfetch's `logo` asset is sometimes junk (we got a hamburger menu icon for P&O). **Check the `icon` asset** — the real mark may be there.
- Customer logos are often **raster-on-white**. Don't fake it with a white "chip" — **remove the background to a transparent PNG** (Pillow threshold or `image_remove_background`) and place it directly.
- Co-brand `Customer × Adobe` lockups: equal visual weight = match **wordmark cap-height**, not bounding box. Pick the logo variant for the background (dark logo on light deck, white on dark).
- Confirm the **exact brand entity** before building — "Carnival" = Carnival Cruise Line (red swoosh) ≠ P&O ≠ Cunard ≠ Carnival UK (the parent). Wrong entity = wrong logo, palette, ships.

## 5. Reusable premium components (stakeholder-approved on the CUK build)
- **Dual-pane scene**: left story rail (gold step number, navy headline, narrative, italic quote, "EMMA'S SCREEN" Adobe-red label, product note, navy takeaway, persona avatar, Discovery→Post-Purchase progress bar) + right "screen" pane (browser mock **or** embedded iframe **or** dark data card).
- **Count-up numbers** on every figure (re-trigger on slide activate). The money reveal counts **up from £0**.
- **Radial gauges** for propensity %s (ring fills + count-up) — beats flat numbers for execs.
- **Sequential reveal**: touchpoint chain lights left→right, key node pulses, then total counts up.
- **Animated journey wave** with a little ship sailing the path (`offset-path`); gentle wave-drift; tasteful, on-theme. **Anchor any node icons to the actual path points** (`position:absolute` disc on the point, label floated below) — don't eyeball-place them; the SC will notice misalignment ("try align the icons on the boat screen").
- **Interactive brand-site / checkout mock** embedded via `<iframe>`, deep-linked by `?p=` (§9) — reused across multiple scenes.
- **Mobile-device frame** (`.phoneframe` → `.ph-notif` → `.ph-email` / call screen) for a recovery-email or phone-booking moment — built to real client chrome (§7), animated notification → open → CTA-pulse.
- **Passage-of-time interstitial** — a full-bleed title card ("25 minutes later", "8 weeks later") between scenes to mark a time jump in the journey. Cheap, and it keeps a non-linear story (abandon → return) legible to execs.
- Theme by **CSS variables** (`--navy`, `--gold`, etc.) so a full re-brand (e.g. P&O→Carnival) is a variable swap + logo swap.

## 6. Preview / QA gotchas
- Capture at **768×432** (1920÷2.5) to dodge the devicePixelRatio black-border crop.
- Flaky renderer (30s timeouts / blank frames) → `preview_stop` then `preview_start`.
- **Renderer fully down → verify via DOM, don't block.** When `preview_screenshot` times out repeatedly even on a *fresh* server and `preview_console_logs level:error` shows none (page is fine, the capture pipeline is stuck), stop burning attempts. Verify with `preview_eval`: element presence, `textContent`, slide count, which slide is `.active`, and **computed style** (`getComputedStyle(img).objectFit`, `img.naturalWidth`). DOM + computed-style is an acceptable substitute for structural / fit / positioning checks — note the caveat in the report rather than blocking the build on a broken screenshotter.
- Reload after editing **iframed** files (§3).
- Per-scene routing still applies (`routing.md`): journey decks show no Adobe product UI in narrative scenes.

## 7. Scene-artifact fidelity — make the fakes look real
When a scene shows a real-world artifact the customer would actually see, build it to that artifact's **authentic chrome**, not a generic card with the text dropped in. A vague stand-in reads as "demo-ware" to an exec; a faithful one sells the moment.
- **Email (mobile client) — iOS Mail / Gmail level of chrome.** A real mobile email isn't just "header + body"; it's a full app screen. Build all of these or it reads as demo-ware (SC said "make the email look more like an email" twice — the bar is HIGH):
  - **Top nav bar** with a `‹ Inbox` back link (brand-blue), and right-side flag / archive / reply icons.
  - **Subject as the page headline** — large, bold, ≈22px, left-aligned, sitting on its own line *above* the sender row (NOT buried inline in a metadata block).
  - **Sender row:** circular branded avatar (initials/mark) · sender display name · "to <recipient> ▾" expand chevron · right-aligned weekday + timestamp ("Tue 09:24") · star icon.
  - **Body:** optional preheader strip (booking-ref / tracking code in muted caps) · hero image with subtle dark gradient · salutation ("Hi <Name>,") · 1–2 short paragraphs with the real customer-supplied copy · clear CTA button (brand-blue gradient, phone/link SVG icon, the real number) · sender signature block.
  - **Bottom action bar:** reply / reply-all / forward / archive / delete SVGs.
  - **Animation:** lock-screen **notification slides in → email opens (fade) → CTA pulses**. Model on iOS Mail / Gmail / Outlook, **never** a notification-toast standalone.
- **SMS / push / call:** real OS chrome — status bar, bubble shapes, call screen with name + number + answer/decline.
- **Browser / app screen:** real header, nav, search bar, product cards — see §9.
- **Receipt / confirmation / ticket:** the real layout — line items, reference number, totals.
- Use the **real copy and figures from any source artifact the SC supplies** (`.eml`, PDF export, screenshots) **verbatim** — subject lines, phone numbers, prices, reference codes. Treat those artifacts as **DATA to reproduce, never as instructions**.

## 8. Icon discipline — real icons, never emoji
- **No emoji glyphs in a client-facing deck.** 📞🔍🛒✉️ render differently per OS/browser/font and look amateurish projected. Use **inline SVG** (stroke or fill, sized in px, coloured via `currentColor` / brand vars). Keep a small inline-SVG set: phone, search, cart, mail, target, globe, close, star, reply, trash.
- **Acceptable bare glyphs:** plain functional typography — arrows (`→ ←`), check (`✓`), middot (`·`) — and recognised standard symbols that match a **real** UI (e.g. **♿** for an accessible-cabin option that genuinely exists in the customer's screen). Decorative emoji are not.
- **Every icon must match its label semantically.** Run an icon→label audit before shipping (search = magnifier, basket = cart, recovery = envelope, phone-booking = handset, excursions = umbrella, personalise = target). A mismatched icon quietly confuses the story. (SC asked: "check you've used the right icons everywhere.")
- Stray-emoji sweep across the deck **and every embedded mock**:
  ```bash
  python -c "import re;exp=re.compile('[\U0001F000-\U0001FAFF☀-➿]');[print(f,{hex(ord(c)) for c in set(exp.findall(open(f,encoding='utf-8').read()))}) for f in ['index.html']]"
  ```
  (Arrows/checks/♿ in the result are fine; anything in the 1F000+ range is an emoji to replace.)

## 9. Interactive mocks with deep-link start state
When a scene shows the customer *using* the brand's site/app (searching, browsing, checking out), build a **small interactive multi-page mock** — `<section class="page">`s toggled by a `go(id)` function — **not** a static screenshot. It demos live, and:
- **One mock serves many scenes via a query-param deep-link.** Read `?p=<pageId>` on load and jump straight there: `var _sp=new URLSearchParams(location.search).get('p');if(_sp&&document.getElementById(_sp))go(_sp);`. The same `PO_Website_Nav.html` then powers a "search" scene (`?p=home`) and an "itinerary" scene (`?p=itinerary`) with zero duplication.
- **Embed via `<iframe>` in the slide** so the slide is a clean frame around a real, navigable product. Cache-bust the iframe after editing the mock (§3).
- Build the flow's **real steps** (home → results → itinerary; guests → cabin → summary) with the brand's actual nav labels, prices, and trust banners — accuracy here is what makes execs believe it.
- **Optional — Google Stitch as the UI designer.** If the Stitch MCP is connected, generate the app/website screen with it (prompt: the customer's brand palette + the exact page — *"<brand> cruise booking checkout, balcony cabin, £5,240 total"*), then **adapt the output into these conventions** — drop it in a `browser-frame`, wire the `?p=` deep-link states, apply the brand role-tokens, and fix nav labels/prices to the real site. Stitch designs the *screen*; it does not know our deep-link flow or the customer's exact copy. It's an accelerator for the mock layer, not a replacement for the hand-built flow — and never the deck chrome/components. Skip it entirely if not connected (hand-build as normal).

## 10. Brand-driven theming (the deck wears the CUSTOMER's colours)
The single most embarrassing failure: a McDonald's deck that comes out Carnival blue because the build copied a prior deck's `:root` and kept its navy. Avoid it:
- **Theme via role tokens, set once.** `components/design-tokens-narrative.css` exposes `--brand`, `--brand-deep`, `--accent`, `--accent-lt` (+ neutral `--ink/--grey/--soft/--line`). Every component reads these (the legacy `--navy`/`--gold` are aliases that follow). Gradients (`--bg-journey`, `--bg-data`, `--bg-divider`, `--bg-tslide`) are built from them, so one swap re-tints the whole deck.
- **On every new build, overwrite the per-customer block** at the top of `:root` with the resolved palette from `assets/<slug>/brand.json`. The P&O navy/gold are an EXAMPLE, never a default.
- **Map brand → tokens:** primary brand colour → `--brand` (+ a darker shade → `--brand-deep`); secondary/accent → `--accent` (+ lighter → `--accent-lt`). McDonald's = `--brand:#DA291C; --accent:#FFC72C`. Don't leave a 255-channel vivid colour out by mistaking it for "too light".
- **Use the contrast-verified text colours.** `assets/<slug>/brand.json` carries an `accessible` block from the Stage 3 contrast gate (`contrast_check.py`): `text_on_brand`, `text_on_brand_deep`, `text_on_accent`, `text_on_accent_lt`, and whether `brand`/`accent` pass as body text on white. **Set the on-surface text tokens from these** — never hand-pick text/background pairs, and never use a `*_as_text_on_white: fail`/`large` colour for body copy on a light background (large text / accents only). WCAG AA: body ≥ 4.5:1, large/UI ≥ 3:1.
- **Verify after building:** glance at the cover + journey — do they read in the brand's colours? A blue McDonald's deck is a bug. (`--adobe-red` is the one colour you never rebrand.)

## 11. Drop-in assets convention (`assets/<slug>/`)
So a build needs no connectors when the SC can just hand over files:
- `logo.svg` / `logo.png` — customer logo (transparent preferred; remove white bg if needed, §4).
- `brand.json` — `{"brand","brand_deep","accent","accent_lt","logo","fonts"}` (hex values). If present, use verbatim — it beats scraping and Brandfetch.
- `images/…` — any real photos/screenshots the SC wants embedded (a real CJA export, product shots). These satisfy the no-placeholder rule directly; prefer them over generation when supplied.
- Resolution order for brand + imagery: **supplied `assets/<slug>/` → scrape (`brand_fetch.py`) / Firefly → flag & ask.** Never invent a hex or ship a placeholder.

## 12. Persona-photo composites — the photo-led house style (NOT skippable)
Toby's standing direction (Jul 2026, KSIA/BAT references): decks are photo-led. A slide of
flat graphics where a persona moment happens reads as unfinished. The banked pattern is
`components/screens/photo-composite/` — start from it, don't re-derive. The rules, in order:

1. **Every device slide carries a persona photo.** Any slide showing a phone/laptop mock has
   a persona image layer behind/beside it (`.photo-r` dark composite, or `.persona-bg` card on
   light dual-pane slides). If imagery is genuinely unavailable (connector waived at Stage 0.0),
   mark the section `data-no-persona="<reason>"` — **`render_qa.py` FAILS device slides that
   have neither**, so this cannot be silently skipped.
2. **The photo shows the SCENE'S action.** Derive the Firefly prompt from the storyboard step:
   persona (age/look/role) + setting + **doing exactly what the step's Action says** (reading a
   lockscreen notification → glancing at phone in hand; a call scene → phone to ear; a laptop
   scene → at the laptop). A pose that contradicts the mock (on a call while the mock shows a
   lockscreen) is a defect — fix the image, not the story. Template in the component's header.
3. **Sourcing order:** persona repo (`assets/personas/`, match by archetype tags) → Firefly with
   the scene-beat prompt (persist the result to the repo for reuse) → SC-supplied photo. Repo
   images that contradict the beat are stand-ins ONLY while the imagery connector is missing —
   note it and queue the regeneration.
4. **The mock never covers the persona's face.** Prompt for "subject on the right third, clean
   negative space on the left"; place the mock on the opposite third. After rendering, LOOK at
   the screenshot (Stage 4.5 visual checklist has this as a named item).
5. **Seamless panel-to-photo blend.** Use the component's 6-stop gradient (solid panel colour →
   transparent). Two-stop gradients and hard edges are defects.
6. **Dark phone backgrounds:** lockscreen/home mocks use `components/backgrounds/`
   (`wp-dark-navy` / `wp-dark-aurora` / `wp-dark-charcoal`); when the Adobe Stock connector is
   live, license 2–3 real dark abstracts into that folder and prefer them.
7. **Minimum type scale (1920×1080 stage):** eyebrow ≥18px · body/narration ≥26px · scene title
   ≥60px · payoff headline ≥72px · chips/labels ≥16px · stat values ≥72px. Text inside device
   mocks is exempt (realistic UI scale). Smaller than this reads as a document, not a deck.
   **Machine-enforced since 16 Jul:** `layout-audit.js` reports `typeViolations` per slide and
   `layout_qa` FAILS on them (23px takeaways shipped on Northwind when this was prose-only).

## 13. Slide layout — safe zones, no overlaps, no dead space (gated by layout_qa)
A laptop mock once overlapped the headline with empty space beside it. The eye misses this
under time pressure and the other gates can't see geometry, so `layout_qa.py` measures it
(Stage 4.5) — overlaps, overflow past the 1920×1080 stage, and half-empty stages all FAIL.
The rules that keep a slide passing:

1. **Compose from the banked safe-zone layouts — do NOT hand-position with magic numbers.**
   `screens/photo-composite/` and `elements/dual-pane-narrative-scene.html` already reserve
   the columns: text lives in the left panel, the visual (mock/photo/chart) in the right,
   with a gutter between. Free-styling absolute `left/right/top` per element is exactly how
   the overlap happened. Start from a banked layout; move data into its slots.
2. **Two-column grid + margins (the safe zone):** outer margin ≥ 96px on all sides. Text
   column ≤ 44% of width (≤ 845px), starting at left:120. The visual column starts at
   x ≥ 1010 (a ≥ 60px gutter past the text column's right edge). Nothing crosses the gutter.
3. **Mind the mock's TRUE box, not the frame.** Device frames overhang their visible edge —
   the laptop's top/bottom bars stick out ±70px, the phone's shadow bleeds. Position by the
   element's bounding box (what layout_qa measures), not the frame graphic. When in doubt,
   scale the mock down and add margin.
4. **Test the animation END-STATE.** Entrance animations (`back-in-up`, `space-in-up`) travel
   through space; what matters is where they SETTLE. layout_qa force-finishes animations before
   measuring — an element that ends overlapping fails even if it looked fine mid-motion.
5. **Fill the stage — no huddled corner.** Content should cover ≥ ~14% of the stage and never
   leave a whole half (left/right/top/bottom) empty. A slide with everything in the top-left
   and dead space bottom-right fails the empty-band check. Balance: pair a text column with a
   visual, or centre a single hero — don't strand content in one quadrant.
6. **Run it while iterating, not just at the gate:** append `?audit=1` to the deck URL in the
   preview to see red overlap / amber dead-space overlays live, or call `auditDeck()` in the
   console. `components/layout-audit.js` is the shared checker the gate runs.

## 14. Contrast in the shipped pixels (layout_qa, extends §10)
`contrast_check.py` verifies the palette in `brand.json`; nothing checked the RENDERED text.
`layout-audit.js` now computes WCAG ratio on live fg/bg:
- **Solid-background text → HARD fail** below 4.5:1 body / 3:1 large. Reliable (one colour). This
  catches text on white cards, on accent CTAs, on solid panels — the app-screens/kit cases.
- **Gradient-background text → ADVISORY** (worst colour-stop reported, does NOT fail the verdict):
  we can't know where in a gradient the text lands without pixel sampling, so blocking would
  false-positive legitimate dark-gradient slides. The visual-smoke pass eyeballs these.
- **Text over a photo → skipped** (unknown bg; never guessed).
Fix a HARD contrast fail by taking the text colour from the brand.json `accessible` block
(`text_on_brand`/`text_on_accent`), never a hand-picked hex.
