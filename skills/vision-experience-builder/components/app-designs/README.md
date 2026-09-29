# app-designs — REFERENCE designs for customer-app mocks

Curated UI patterns to **rebuild from, never ship as-is**. When a scene needs a customer-app
mock (chat, checkout, dashboard, form…), `catalog_pick` will surface the closest pattern here;
you rebuild it in the deck idiom — plain HTML/CSS, brand **role tokens**, house phone/laptop
shells, inline Spectrum icons. Never ship the Tailwind classes, React/TSX, or Flowbite JS —
decks are runtime-free and offline.

```
flowbite/   16 pattern docs with plain-HTML snippets (MIT, (c) Bergside — LICENSE.md here)
            chat-bubble · card · forms · buttons · modal · navbar · bottom-navigation ·
            tables · timeline · toast · progress · avatar · badge · list-group · stepper · rating
shadcn/     16 component sources as structural references (MIT, (c) shadcn — LICENSE.md here)
            card · dialog · form · input · table · tabs · badge · avatar · chart · button ·
            checkbox · dropdown-menu · sidebar · bubble · message · calendar
```

Deliberately NOT harvested: Flowbite `device-mockups` (we ship our own generic frames:
`elements/mobile-phone-frame.html`, `elements/laptop-frame.html`) and the full doc sites
(bulk-copy is banned by the intake procedure). Figma Community files may join this folder
only after per-file CC0/CC-BY vetting; **Mobbin never** (asset-licensing.md).
