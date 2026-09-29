---
name: adobe-brand-fetcher
description: |
  Install and serve official Adobe corporate brand assets (wordmark, symbol,
  brand colours, font references) into any project's local assets/adobe/ folder.
  Use whenever an Adobe-branded customer demo needs the real Adobe logo,
  Adobe corporate typography reference, or brand colours — vision decks, sizzle
  reels, partner co-brand lockups, EBC demos, any Adobe-customer composite.
  Also triggers for explicit asks like "pull the Adobe logo", "real Adobe
  SVG", "add Adobe corporate branding", "refresh Adobe assets", or "what's
  the Adobe font/colour".
---

# adobe-brand-fetcher

Serves the official Adobe corporate brand assets — bundled directly with this skill — into project-local folders. Every Adobe-branded demo references the same canonical files. No re-downloading, no recreation, no approximation.

## Assets bundled with the skill

Located in `assets/` next to this SKILL.md:

| Filename | Format | Use case |
|---|---|---|
| `wordmark-red.svg` | SVG | Default Adobe mark on light backgrounds |
| `wordmark-white.svg` | SVG | Adobe mark on dark/colour backgrounds — most common in vision demos |
| `wordmark-black.svg` | SVG | Adobe mark on light photography or when red unavailable |
| `adobe-icon.svg` | SVG | **The modern Adobe mark** — self-contained app-icon tile (red rounded square + white glyph). Any compact/icon-only context: app headers, favicons, footer chips, nav bars. |
| `symbol-red.svg` / `symbol-white.svg` / `symbol-black.svg` | SVG | Aliases of `adobe-icon.svg`, kept under the legacy filenames so existing `{{adobe_symbol_path}}` references keep resolving. **Identical content** — the tile is not recoloured per background. |
| `symbol-red.png` | PNG (2048px) | High-res fallback when SVG isn't supported |
| `symbol-white.png` | PNG (2048px) | Same |
| `wordmark-red.png` | PNG | High-res fallback for the wordmark |

SVG is preferred everywhere — sharper at all sizes, smaller files, recolorable. PNGs ship for safety when an environment can't render SVG.

**Never use the old bare/untiled "A" glyph** (a red/white/black triangular shape with no rounded-square container, floating directly on the background). That presentation is retired. `symbol-*.svg` used to render exactly that and was fixed on 2026-07-17 — if you see it reappear anywhere (a stray hand-embedded `<svg>` in a template, a per-demo local copy, an inline glyph in a component), replace it with `adobe-icon.svg`'s markup, don't recolor/recreate it.

## Adobe trademark policy — non-negotiable

Adobe's official guidelines (`adobe.com/legal/permissions/trademarks.html`):

- **Use the official mark.** Never recreate, redraw, or approximate the logo. Hand-drawn triangle paths are out.
- **The icon tile (`adobe-icon.svg`) is used as-is on any background** — it carries its own red fill, so it is never recoloured. Only the **wordmark** has red/white/black variants: **apply the right variant for the background**: red on white; white on colour or dark; black on light photography.
- **Maintain clear space** equal to the mark's height on all sides.
- **Equal visual weight** for co-brand lockups (`Adobe × Customer`), joined by a thin × symbol with consistent spacing. Match by **wordmark cap-height**, not SVG bounding box: a customer logo with a strapline beneath the wordmark (e.g. "Carnival is calling") only fills the top of its viewBox, so size it UP — `height ≈ adobe_height × (svg_total / wordmark_portion)` — so the wordmarks read at the same size. See `vision-experience-builder/templates/cover-cobrand-lockup.html`.
- **Never modify, distort, animate, recolor outside approved variants, or composite onto patterned backgrounds.**

These rules are restated in the `_README.md` written into every project's `assets/adobe/` folder.

## Adobe Clean font — important context

> **Offline / distributed decks (the default for experience stories): embed Source Sans 3 (SIL
> OFL) as a base64 WOFF2 `@font-face`, and do NOT ship a Typekit kit link.** The Typekit CDN kit
> below is valid only for an **online-guaranteed internal preview** — it needs a network call at
> view time (breaks offline) and must never be the sole font path of a shipped file. Keep
> `'Adobe Clean'` first in the stack so internal viewers with it installed still get it.
> (Canonical rules: `vision-experience-builder/asset-licensing.md`.) *(Roadmap: this script will
> install a Source Sans 3 WOFF2 + `fonts.css` into `assets/adobe/` so embedding is automatic.)*

**Adobe Clean is licensed software, not a redistributable file.** Adobe employees have it installed locally but CAN'T bundle the `.woff2`/`.otf` files into a demo for redistribution. The right approach:

1. **Adobe employee creates a Web Project at `fonts.adobe.com`** — adds Adobe Clean + Adobe Clean Serif + Source Sans 3 (fallback)
2. **Copy the kit URL** (e.g. `https://use.typekit.net/XXXXXXX.css`) — this kit serves fonts via Adobe's CDN to anyone who loads the page
3. **Store the kit URL** in `references/typography.md` of the parent project (e.g. `vision-demo-skill`)
4. **Demos reference the kit URL** via `<link rel="stylesheet" href="...">` in `<head>`
5. **CSS uses the family stack**: `font-family: "adobe-clean", "Source Sans 3", system-ui, sans-serif;`

The Adobe Fonts CDN serves the font to viewers without requiring viewer authentication. The kit owner's licence covers serving.

**Fallback when no kit URL is available**: Use Source Sans 3 (open-source, hosted on Google Fonts):
```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@200..900&display=swap">
```
```css
font-family: "Source Sans 3", system-ui, sans-serif;
```

Source Sans 3 is the open-source ancestor of Adobe Clean's design language — close enough for development, not for an EBC-grade deliverable. Always upgrade to the licensed Adobe Clean kit before customer-facing delivery.

## When to invoke

- **Automatically** at the start of any `vision-experience-builder` run that involves Adobe branding
- **Manually** when starting a new project that needs Adobe assets
- **On refresh** when Adobe releases an updated mark (rare; annual review)

If a project's `assets/adobe/` folder already exists and contains the requested asset, skip the install. Only re-install on explicit refresh.

## Workflow

1. Resolve project root (walk up CWD for `.claude/` folder, or use `--project-root` flag, or fall back to CWD)
2. For each asset in `manifest.json`, copy from `<skill-dir>/assets/<filename>` to `<project>/assets/adobe/<filename>`
3. Write `_README.md` with trademark rules + font setup instructions
4. Write `_manifest-snapshot.json` recording what was installed and when
5. If invoked by another skill, return a dict of asset paths and brand tokens

## CLI usage

```bash
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py --refresh
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py --only wordmark-white
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py --list
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py --project-root /path/to/project
```

## Brand colours (use directly in CSS, no install needed)

```css
:root {
  --adobe-red: #FA0F00;
  --adobe-red-hover: #D70F00;
  --adobe-black: #000000;
  --adobe-white: #FFFFFF;
  --adobe-neutral-canvas: #FAFAFA;
  --adobe-spectrum-blue: #0265DC;
}
```

## What this skill is NOT

- Not a Workfront client. Internal customer-specific assets come through the Workfront ask path.
- Not a brand-compliance checker. Visual review of the final demo is still the ID's responsibility.
- Not an Adobe Fonts CDN proxy. The fonts come from `fonts.adobe.com` via a kit URL the user creates once.

## Handoff to downstream skills

When invoked by `vision-experience-builder`, returns asset paths, brand colors, and the font family stack. The caller inlines the SVGs into the demo HTML, applies the colour tokens to CSS variables, and references the font family in the stylesheet.
