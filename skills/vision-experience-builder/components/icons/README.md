# Labelled icon pack

Look up icons by **semantic label** (not raw file name) and inline the SVG. Icons are inline SVG
only — never emoji. See `../../asset-licensing.md`.

## Use
Read `pack.json` → `icons[<label>].svg` and paste it inline. Example labels:
`notification, email, call, chat/concierge, search, location/map, calendar, time, check,
confirmed, payment/checkout, flight/boarding, profile, secure, favorite/loyalty, next, ai,
lock, connectivity, boarding-pass/ticket` (31 labels total; run `build_pack.py` to see all).

## Sources / licensing
- **Adobe Spectrum workflow icons** (Apache-2.0), in `spectrum/` — the **on-brand DEFAULT** (25 of
  34 labels). Keep the `spectrum/LICENSE-Apache-2.0.txt` NOTICE.
- **Lucide** (ISC), in `lucide/` — fills glyphs the Spectrum workflow set lacks (payment, flight,
  shield, qr, wifi).
- To add/replace: drop the SVG into `spectrum/` (preferred) or `lucide/`, point the label at it in
  `build_pack.py`, re-run. Source from the GitHub/npm packages (auditable licenses), never ad-hoc
  Figma exports.

## Regenerate
```
python build_pack.py    # rebuilds pack.json from the SVGs + the LABELS map
```
