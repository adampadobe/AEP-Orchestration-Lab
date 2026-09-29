# Inline-SVG icon set

Paste these directly into HTML — **never emoji** (`imagery-and-assets.md` §8).
Colour via `stroke:currentColor` / `fill:currentColor` and size in px on the parent.
All viewBoxes are 24×24 unless noted.

```html
<!-- search / magnifier (touchpoint: Browse / Search) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>

<!-- globe / browse -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>

<!-- target / personalise -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>

<!-- shopping bag / basket -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 7h14l-1 13H6L5 7z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/></svg>

<!-- cart -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11h11l2-8H6"/><circle cx="9" cy="20" r="1.6"/><circle cx="18" cy="20" r="1.6"/></svg>

<!-- envelope / mail (touchpoint: Email / Recovery) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></svg>

<!-- phone handset (touchpoint: Phone / Call) -->
<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3c2 0 3 4 3 6l-2 2c1 2 4 5 6 6l2-2c2 0 6 1 6 3v3c0 1-1 2-3 2C9 23 1 15 1 6 1 4 2 3 3 3z"/></svg>

<!-- umbrella / excursions / onboard extras -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12a9 9 0 0 1 18 0H3z"/><path d="M12 3v9M12 21a2 2 0 0 1-2-2"/></svg>

<!-- instagram (touchpoint: Paid Social) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>

<!-- chevron back (iOS mail "‹ Inbox") -->
<svg viewBox="0 0 11 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 1L2 9l7 8"/></svg>

<!-- chevron down -->
<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 4l3 3 3-3"/></svg>

<!-- flag -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4v17l7-5 7 5V4z"/></svg>

<!-- trash -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>

<!-- archive box -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11h14V8M10 12h4"/></svg>

<!-- reply (single arrow back-left) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 5 5v3"/></svg>

<!-- reply all -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 5 5v3M14 14L9 9l5-5"/></svg>

<!-- forward -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14l5-5-5-5M20 9H9a5 5 0 0 0-5 5v3"/></svg>

<!-- star outline -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z"/></svg>

<!-- close / X (close-tab moment) -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6l-12 12"/></svg>

<!-- check / confirmed -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12l4 4 10-10"/></svg>

<!-- ship (journey wave + cover) -->
<svg viewBox="0 0 50 50" fill="#fff"><path d="M5 32 L25 22 L45 32 L42 38 L25 33 L8 38 Z"/><rect x="22" y="14" width="6" height="8" fill="#fff"/><rect x="20" y="22" width="10" height="2" fill="#fff"/></svg>
```

## Acceptable bare glyphs (NOT emoji)
- Arrows `→ ←` — plain functional typography
- Check `✓`, middot `·`, en/em dash `– —`
- Accessibility `♿` — only when matching a real UI element (e.g. an accessible-cabin option in a customer's actual screen)
