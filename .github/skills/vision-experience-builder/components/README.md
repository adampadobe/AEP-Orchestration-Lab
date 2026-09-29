# Components — reusable building blocks

## Folder map (find things HERE first — `catalog.json` indexes all of it)

```
catalog.json          THE index. catalog_pick.py searches this — every asset below is registered.
animations/           one .css per named animation (@keyframes + .slide.active trigger + usage note)
screens/<type>/       one folder per full-slide screen type (meta.json + sample.html + sample.css)
elements/             sub-slide parts, hand-built (phone frames, email mock, gauges, pills, …)
harvested/            sub-slide parts banked by absorb from finished decks
../templates/harvested/  full-slide templates banked by absorb (skill root, BESIDE components/ — catalog paths use ../)
backgrounds/          phone lockscreen/home wallpapers (CSS gradients now; licensed Stock darks when connected)
structures/           ordered screen-type sequences = reusable deck skeletons
icons/                the labelled Spectrum/Lucide pack (pack.json — lookup by meaning; the ONE icon source)
app-designs/          REFERENCE-ONLY UI patterns (Flowbite/shadcn, MIT) to rebuild as app mocks — see its README
vendor/               third-party libs (GSAP, magic-css, devices-css — see vendor/README.md)
_foundation.css · design-tokens-narrative.css · count-up.js   deck-level foundations (root, always)
../assets/personas/   the persona photo repo (personas.json + one folder per archetype)
```

**Intake procedure for downloaded packs** (magic, devices.css, etc.): drop the zip/folder
into the project `incoming/`, then: 1) verify its LICENSE file — MIT/OFL/Apache in;
commercial-restricted AND ethical-source (Hippocratic etc.) OUT — and check the
**Library-intake rulings** in `asset-licensing.md` first (animate.css v4 is already ruled
out there); 2) harvest only the useful pieces into the right folder above, with
source+license recorded in the `catalog.json` entry and in each file's header; 3) keep the
LICENSE copy in `vendor/<lib>/` when code was taken; 4) delete the rest of the download.
Never bulk-copy an entire library in.

These are the **building blocks** that compose into scenes — distinct from
`../templates/` which holds **full-slide** scene templates (cobrand cover,
persona-hero-splash, etc.).

A *template* is a whole slide. A *component* is a part of a slide (a phone, an
email, a touchpoint chain, a money reveal) that can drop into many slide
layouts. Extracted from the P&O × Adobe customer-journey build (stakeholder
sign-off June 2026) so future decks reuse the same animation timings and
artifact fidelity — not start from scratch.

## How to use

1. Read `_foundation.css` and include it ONCE in the deck `<style>` — it
   provides the shared keyframes (`rise`, `fade`, `pop`, `keypulse`, `livep`,
   `wavebob`, `accept-pulse`, `tapnum`, `toast-in`, `piece-in`, `win-close`,
   `t-rule-in`, `typeurl`, `caretblink`, `sail`, `draw`) and the staggered
   entrance helpers (`.a1`–`.a6`, `.fp`, `.pp`).
2. Include `design-tokens-narrative.css` for the customer-journey palette
   (`--navy`, `--gold`, `--ink`, etc.). For marketer decks use the Adobe-red
   `../templates/design-tokens.css` instead. Both can coexist via `:root`
   overrides per slide.
3. Include `count-up.js` at the bottom of the deck for the `<span class="cu">`
   pattern (`data-to`, `data-pre`, `data-suf`, `data-delay`). It hooks into
   the standard `show(n)` slide controller.
4. For each component you use, paste the CSS block into the deck `<style>`
   and the HTML pattern into the slide. Each file is self-contained and
   commented with usage, slots, and animation timing.

## When to pick which

Hand-built element samples live in **`elements/`** (the table's filenames are inside it).

| Need | Component |
|---|---|
| Show a **mobile email arriving / opening** (recovery, confirmation) | `mobile-phone-frame.html` + `mobile-lockscreen-notification.html` + `mobile-email-ios.html` |
| Show **an incoming phone call** the persona takes | `mobile-phone-frame.html` + `mobile-call-screen.html` |
| Persona **on the brand's website / app** (live or static) | `browser-frame.html` (+ `browser-url-typing-animation.html` for "she types the URL"; + `close-tab-animation.html` when she abandons) |
| Reveal **attributed revenue / a money figure** | `big-number-money-reveal.html` (uses `count-up.js`) |
| Show **channels stitched into one identity** | `touchpoint-chain.html` (sequential reveal + gold key node) |
| Show **CJA / Analytics data behind the story** | `cja-data-inset.html` (live-data bar + image, dark card) |
| Show **multiple data sources stitched into one profile** | `stitch-data-sources.html` (4 sources → unified pill) |
| Mark a **time jump** in the journey ("25 minutes later", "8 weeks later") | `passage-of-time.html` |
| Show a **propensity / score %** | `radial-gauge.html` |
| The **standard narrative scene layout** (story rail + screen) | `dual-pane-narrative-scene.html` — this is the workhorse |
| Top-right **MVP / POST-MVP** tag per scene | `mvp-pill.html` |
| Animated journey overview with **a ship sailing the wave** + icon nodes | `journey-wave-anchored-icons.html` |
| The shared inline-SVG icon set (lookup by meaning: alert, payment, flight, …) | `icons/pack.json` (components root — the ONE icon source; the old icons.svg.md was retired) |
| A customer-app UI pattern to rebuild (chat, checkout, dashboard, form, …) | `app-designs/` — reference-only Flowbite/shadcn patterns; see its README |

## Rules these encode (don't break them)

- **Slide visibility is `.active`, never `display:none`.** Components rely on
  `.slide.active .x` selectors to fire entrance animations.
- **Icons are inline SVG, never emoji.** Every icon in every component is
  inline SVG. See `imagery-and-assets.md` §8.
- **Email is iOS-Mail-grade chrome** (`mobile-email-ios.html`): top nav with
  ‹ Inbox + flag/archive/reply icons, subject as the page headline above the
  sender row, sender row with avatar + "to ▾" + weekday + star, optional
  preheader (ref/code), hero image, real body copy, brand-blue SVG-icon CTA,
  signature, bottom action bar (reply/reply-all/forward/archive/delete).
  See `imagery-and-assets.md` §7. Anything less reads as demo-ware.
- **Content images: `object-fit:contain`, never `cover`.** `cja-data-inset`
  uses `width:100%` + auto height for that reason — the sankey must show
  in full. See `imagery-and-assets.md` §3.
- **Persona consistency.** One name and one face across every slide.
- **Animation timing is calibrated** — don't shorten arbitrarily. Sequential
  reveals are designed to land on the talk-track.

## Why these are in `components/` not `templates/`

`templates/` holds **scene templates** that the storyboard maps to (Phase 1
mapping table in `SKILL.md`): each one is a whole slide layout that an SC
recognises by name (`cobrand-cover`, `persona-hero-splash`, etc.).

`components/` holds **parts that compose into scenes**: a single slide might
use the dual-pane layout + a phone frame + an email + an MVP pill at once. A
scene template references a *set* of components plus its own arrangement.

## The harvested library (grows with every deck — like the persona repo)

`absorb.py` (the `absorb` skill — `skills/absorb/scripts/absorb.py`) reads a finished deck and banks
its reusable pieces here, so each build makes the next one faster:

```
catalog.json            the index of everything (read this first)
animations/<name>.css   every @keyframes + the selectors that trigger it
screens/<type>/         a sample of each screen TYPE seen:
    meta.json           type · key_classes · source · description (when to use)
    sample.html         the slide markup
    sample.css          the CSS for the classes it uses
structures/<src>.json   the ordered screen-type sequence = a reusable deck skeleton
```

**Use it on every build:** before authoring a scene, check `catalog.json` —
reuse a banked **animation** (don't re-invent a keyframe), start a scene from the
closest **screen** sample, and start the deck from a matching **structure**
skeleton. Seeded from `po-cruises` (17 animations, 14 screen types).

**Persistence (learned library survives plugin updates):** the ACTIVE library root is
resolved by `experience-story-builder/scripts/lib_root.py` — `$EXPERIENCE_STORY_LIBRARY`
override → `$CLAUDE_PLUGIN_DATA` mirror (lazy-seeded from this bundle on first use; ideally
a clone of `OneAdobe/experience-story-library`) → this bundled folder as fallback.
`catalog_pick.py` and `absorb.py --skills-root $CLAUDE_PLUGIN_DATA` both use the durable
root, so banked learning outlives updates. `py lib_root.py --status` shows what's active.

**Grow it after every build:**
`python ${CLAUDE_PLUGIN_ROOT}/skills/absorb/scripts/absorb.py demos/<slug>/index.html --source <slug>`
— idempotent (merges, de-dupes). Then fill any new `screens/<type>/meta.json`
`description`. New animations/screens/structures accrue automatically.
