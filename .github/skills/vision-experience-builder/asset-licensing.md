# Asset licensing — ship-safe rules for distributed / offline decks

An experience-story deck is a **self-contained file that ships externally** (enterprise sales
audiences, exported to PDF). That means every embedded asset must be **commercial-safe** and
**offline** (no required network call at view time). This file is the canonical rule set;
`SKILL.md` points here. Sourced from the deep-research brief (Jul 2026) — verify terms before
relying on them for a specific engagement.

## Fonts — the biggest risk we were shipping
- **Adobe Clean / Adobe Fonts (Typekit): do NOT ship the font files or a Typekit kit in a
  distributed HTML file.** Adobe's license allows delivery only via Adobe's CDN embed code, not
  self-hosting/embedding — and a CDN link also breaks the offline guarantee. (helpx.adobe.com/fonts/using/webfont-licensing.html)
- **Ship Source Sans 3 (SIL OFL 1.1)** — Adobe's own open UI typeface, the closest freely-
  embeddable match to Adobe Clean. OFL permits bundling/embedding/self-hosting. Inline as base64
  WOFF2. (github.com/adobe-fonts/source-sans)
- **Stack:** `"Adobe Clean","Source Sans 3","Inter",system-ui,sans-serif`. Adobe Clean resolves
  for internal viewers who have it installed locally; **Source Sans 3 is the face that actually
  ships**. Adobe Clean is fine internally and in the exported (rasterized) PDF.

## Animation engine
- **GSAP** — now free incl. all plugins + commercial use (Webflow "No Charge" license, Apr 2025).
  Plain JS, inline `gsap.min.js` (+ plugins) via `<script>`. **Keep the license banner comment;**
  don't build a competing no-code animation builder. Not MIT — it's proprietary-but-free.
- **MIT fallbacks:** Motion (motion.dev), anime.js, or the native Web Animations API (0 KB).
- **Lottie** (lottie-web player MIT); animation JSON files carry the share-alike **Lottie Simple
  License** — track per file. **Rive** runtime MIT (heavy/WASM).
- CSS keyframes: baseline, 0 KB, most offline-robust.

## Icons
- **Adobe Spectrum workflow icons (Apache-2.0)** — on-brand default; keep the NOTICE.
  (github.com/adobe/spectrum-css-workflow-icons)
- **Lucide (ISC)**, **Phosphor / Tabler / Heroicons (MIT)** — fill gaps.
- Build a `semantic_name → inline_SVG` labelled pack from these npm packages (auditable
  licenses), **not ad-hoc Figma exports**. Icons are inline SVG only, never emoji.

## Device frames & mockups
- **Ship only generic, brandless frames** (rounded-rect phone/tablet/laptop, neutral browser
  chrome with traffic-light dots + address bar). Draw our own or use CC0 (freesvg.org).
- **Trademark landmine:** a CC0/MIT *file* license does NOT grant the right to depict recognizable
  Apple/Samsung/Google hardware. Avoid recognizable branded industrial designs. Do not redistribute
  Apple/Meta device-resource art in a commercial demo.

## Imagery — people & stock
- **Prefer Adobe Firefly-generated persona faces** — commercial IP indemnification, no real-person
  likeness / model-release / publicity-rights exposure.
- **Unsplash / Pexels:** free commercial for copyright, **but grant NO model release** and carry
  $0 indemnification — use only for **non-person / decorative** imagery, never recognizable people.

## Logos
- **Customer's own logo in a deck for/about that customer** = generally acceptable nominative use.
  **Never modify it**, never imply endorsement beyond the engagement, follow their brand guidelines,
  and confirm per-deck permission. Source from the customer, Brandfetch, or Simple Icons (CC0 covers
  the SVG path, NOT the trademark — monochrome silhouettes only).

## Interactive / maps / charts (offline)
- **Chart.js (MIT)** default; **uPlot (MIT)** for dense time-series; **D3 (ISC)** for bespoke.
- **Maps need bundled local tiles** to work offline (Leaflet BSD-2 + local PNG tiles, or MapLibre
  BSD-3 + local PMTiles); live OSM tiles need network + ODbL attribution. Flag map tiles as the one
  element that may require a network call, or pre-render the view as a static image.

## The three risks to never trip
1. Embedding Adobe Clean / a Typekit kit in a distributed file → use Source Sans 3 (OFL).
2. Shipping a recognizable device frame or unmodified third-party logo without clearance.
3. Stock photo of a recognizable person without a model release → use Firefly personas.

## Library-intake rulings (precedents — check here before re-vetting)
- **animate.css v4.x — NOT intaken.** Relicensed from MIT to **Hippocratic 2.1** during v4
  (field-of-use restrictions + indemnity + mandatory arbitration; not OSI-approved). Fails the
  MIT/OFL/Apache bar without legal sign-off. The useful motions were **independently
  implemented** in `components/animations/` (house values/easing; taxonomy names kept for
  findability; zero code copied). If exact animate.css behaviour is ever needed, v3.7.2 and
  earlier are MIT — intake from that tag only.
- **magic (miniMAC/magic) — MIT, intaken selectively** (8 tasteful effects, all tagged `showy`).
  LICENSE copy: `components/vendor/magic-css/`.
- **devices.css (Marvelapp) — MIT, intaken.** Full lib is REFERENCE ONLY in
  `components/vendor/devices-css/` (see NOTICE.md: iphone*/ipad/macbook are Apple trade dress).
  Ship-safe derivative: `components/elements/laptop-frame.html` (genericized, renamed namespace).
- **Ethical-source licenses (Hippocratic, ACSL, …) are OUT by default** — same lane as
  commercial-restricted (Hover.css). Route to Toby/legal if a library seems worth an exception.
- **Chart.js — MIT, intake PREPPED (16 Jul).** Master zip has no dist/; the runtime
  (`chart.umd.js`) is a release artifact — see `components/vendor/chart-js/NOTICE.md`.
  CSS/SVG charts remain the deck default; Chart.js only for data-rich scenes.
- **MJML — NOT intaken (16 Jul).** The repo is the Node email compiler: nothing usable in a
  static offline deck. Our email chrome is already deck-proven (`elements/mobile-email-ios.html`,
  `screens/email-mock/`). If richer email layouts are ever needed, the right source is the
  separate `mjmlio/email-templates` repo (vet per-file).
- **mjmlio/email-templates — REFUSED (16 Jul).** No LICENSE file, no package.json license
  field, nothing in the README: community-submitted templates with NO license grant = all
  rights reserved by each contributor. Unlicensed is an automatic refusal — worse than a
  restrictive license. Email layouts stay house-built (mobile-email-ios / email-mock).
- **Chart.js runtime — COMPLETED (16 Jul).** chart.umd.js v4.5.1 official npm artifact
  in `components/vendor/chart-js/` (MIT). Inline into the deck when used, never CDN-link.
