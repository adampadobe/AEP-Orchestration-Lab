# NOTICE — Chart.js (vendor, PENDING RUNTIME)
Source: github.com/chartjs/Chart.js · License: MIT (LICENSE.md alongside).
The master-branch zip ships NO dist/ — the embeddable runtime (chart.umd.js, ~205KB)
is a release artifact. STATUS: RUNTIME PRESENT — chart.umd.js v4.5.1 (official npm artifact via jsdelivr,
fetched 16 Jul 2026 with Toby's approval; sourceMappingURL stripped, no map bundled).
samples/ holds curated config references (bar/line/area). INLINE the bundle's contents
into the deck <script> when used — never a CDN link (offline rule).
DECISION RULE (size + navigability): CSS/SVG chart animations (barGrow, lineDraw,
graphIn, radial-gauge, kpi-dashboard) remain the DEFAULT for deck charts — they are
lighter, brand-token native, and deck-proven. Chart.js is for data-rich scenes
(multi-series, tooltips, real datasets) only. Nothing is replaced by this intake.
