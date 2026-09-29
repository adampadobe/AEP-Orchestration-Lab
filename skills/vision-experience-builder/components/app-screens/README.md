# app-screens — reskinnable customer-app screens (one system, many industries)

Full phone-app screens the builder DROPS IN and reskins per customer — no rebuild, no Tailwind,
no licence. All driven by `kit.css`, which reads only the deck's role tokens, so a customer
palette swap in `:root` (from `assets/<slug>/brand.json`) recolours every screen at once.
Proven: `demos/_app-screens-reskin.html` renders the same markup under two palettes (teal/gold,
violet/mint) with nothing hand-recoloured.

```
kit.css              the ONE design system (header, cards, list rows, CTA, chips, meter, tab bar,
                     status) — all --brand/--accent/... driven, --*-rgb triplets for alpha.
banking-home.html    balance + proactive nudge + transactions        (retail bank / fintech)
travel-home.html     boarding + trip + lounge + fast-track chips      (airline / airport / travel)
retail-home.html     member edit + rewards tier meter + basket        (retail / commerce / loyalty)
telco-home.html      data usage + next bill + roaming + scam shield   (telco / utility / subscription)
```

## How to use in a deck
1. Set the customer palette once in the deck `:root` (the builder does this from `brand.json` —
   see imagery-and-assets.md §10). **Include the `--brand-rgb` / `--accent-rgb` triplets** so the
   kit's translucent fills recolour too.
2. Paste `kit.css` into the deck `<style>` once.
3. Drop a screen's markup inside the deck phone shell (`<div class="phone"><div class="pscreen">`).
4. Fill the `data-slot="logo"` in `.ak-brand` with the customer `<img>` logo (or leave the
   wordmark text for an early pass). Edit the copy to the storyboard's on-screen copy.

## Rules (why this exists)
- **Never write a raw hex in a screen** — verified zero across all four. Colour comes only from
  tokens; alpha via `rgba(var(--accent-rgb), …)`. This is what makes one-swap reskin real (the
  §10 "one swap re-tints the whole deck" promise that hard-coded hexes were breaking).
- **Icons inline SVG from `../icons/pack.json`**, never emoji.
- **Offline**: no web fonts, no external URLs, no `<img src>` to network. The logo slot is a
  local asset.
- These are HOUSE-built and ship-safe — distinct from `../app-designs/` (Flowbite/shadcn
  *references* you rebuild from). app-screens you use as-is; app-designs you learn from.

## Extending
Add a new industry by composing `kit.css` classes into `<industry>-home.html` (+ optional
`-detail`/`-checkout` screens), then register it in `catalog.json` under `app_screens`. Keep it
hex-free so it inherits reskinnability for free.
