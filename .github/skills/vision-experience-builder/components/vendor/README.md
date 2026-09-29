# Vendor libraries (bundled, offline, ship-safe)

Inline these into the deck `<script>` so the deck stays a self-contained offline file — no CDN.

## GSAP 3.13 — `gsap.min.js` (+ `ScrollTrigger.min.js`)
- **License:** free incl. all plugins + commercial use (Webflow "No Charge" GSAP license, Apr 2025).
  **Proprietary-but-free — NOT MIT.** Two rules: keep the license banner comment at the top of the
  file, and don't build a competing no-code animation builder. (asset-licensing.md)
- **Use:** inline `gsap.min.js` (and `ScrollTrigger.min.js` only if a scene scrolls) into a
  `<script>` block. Prefer GSAP for timeline-sequenced / emphasis / data-reveal motion; keep simple
  entrances as CSS keyframes (0 KB). MIT alternatives if ever needed: Motion, anime.js, WAAPI.
- **Sizes:** gsap ≈72 KB min, ScrollTrigger ≈44 KB min.

Do not delete the banner. Update by re-downloading the same version from cdnjs/gsap.com.

## magic-css/
MIT (c) Christian Pucci — attribution + harvested-file list in `magic-css/NOTICE.md`.
Keyframes live as individual files in `../animations/` (tagged `showy`).

## devices-css/
MIT (c) 2014 Marvelapp — REFERENCE ONLY (Apple trade dress; see `devices-css/NOTICE.md`).
Ship-safe derivative: `../elements/laptop-frame.html` (genericized).
