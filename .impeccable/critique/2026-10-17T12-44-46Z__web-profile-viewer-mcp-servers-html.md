---
score: 27
max: 40
p0: 0
p1: 1
p2: 2
p3: 0
method: dual-agent
timestamp: 2026-10-17T12-44-46Z
slug: web-profile-viewer-mcp-servers-html
---
Method: dual-agent (A: 717bb08d-7c81-4014-9766-9d74adbf0832 · B: c8890549-41e6-4933-8fd8-d890fb869a50)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|------:|-----------|
| 1 | Visibility of System Status | 3 | Search count and copy feedback are helpful; this page has no connection health status. |
| 2 | Match System / Real World | 3 | Task examples help, but MCP, sandbox enrollment, and Portal-key terminology assume experience. |
| 3 | User Control and Freedom | 3 | Search and native disclosures are easy to exit; browsing controls are limited. |
| 4 | Consistency and Standards | 3 | The card and disclosure patterns are consistent; the page hierarchy is improved. |
| 5 | Error Prevention | 3 | Key-safety guidance and confirmation-gated operation descriptions help prevent mistakes. |
| 6 | Recognition Rather Than Recall | 3 | Summaries and use cases aid recognition; setup detail remains behind disclosures. |
| 7 | Flexibility and Efficiency | 2 | Search is available, but no task or connection-type filters. |
| 8 | Aesthetic and Minimalist Design | 2 | Progressive disclosure reduces clutter, though the page remains long and panel-heavy. |
| 9 | Error Recovery | 2 | Copy failure has a manual fallback; connection troubleshooting is not represented. |
| 10 | Help and Documentation | 3 | Setup guides and references exist, but the path is not yet task-led. |
| **Total** | | **27/40 — Acceptable** | A strong reference page; reduce effort to find the right connection. |

## Design Specificity Verdict

**LLM assessment:** The copy is specific to AEP Lab: it distinguishes Adobe sign-in from Portal-key clients, explains sandbox enrollment, and describes focused integrations. The catalog and bordered panels remain conventional technical-reference patterns rather than a distinctive guided experience.

**Deterministic scan:** The HTML detector exited 2 with three advisories: `overused-font` (Inter, line 10), `single-font` (line 10), and `em-dash-overuse` (28 instances, file-level). Inter is an intentional shared dashboard font, so changing it here would reduce consistency. The single-font warning is a false positive because heading, body, labels, and metadata use distinct size and weight steps. The em-dash count is an advisory in a technical reference with many compact descriptions, not a functional defect.

**Browser evidence:** In fresh local browser views, the page had no horizontal overflow at 1440px desktop or 390px mobile. All 44 disclosures were closed initially. Mobile card details remained within the viewport when expanded. Searching for “snowflake” returned three relevant cards, including hidden connection details. No detector overlay was injected; no user-visible overlay is available.

## Overall Impression

The page is substantially easier to scan: client setup instructions and technical server details are available without dominating the initial view. Search and concise card summaries make the inventory more approachable. The main remaining opportunity is to guide users by task and bring the page content above the shared mobile navigation.

## What’s Working

- Client setup, marketplace contents, overview topics, and individual connection details all use native disclosures and begin collapsed.
- The key warning distinguishes Coworker’s Adobe sign-in from key-based clients and explicitly says never to paste the Portal key into Coworker.
- The catalog now uses compact cards at every width; long endpoints wrap, and desktop/mobile browser checks found no horizontal overflow.

## Priority Issues

1. **[P1] Mobile navigation pushes the page below a tall shared shell**
   **Why it matters:** At 390px, the shared navigation occupies roughly 834px vertically before page content begins. This makes setup and browsing feel much longer.
   **Fix:** Review the shared mobile navigation behavior, such as making it collapsible. Keep this change in the shared shell rather than adding page-specific navigation overrides.
   **Suggested command:** `/impeccable adapt web/profile-viewer/mcp-servers.html`

2. **[P2] Finding a server still depends on interpreting a large catalog**
   **Why it matters:** Search helps, but users still choose among 35 servers (18 Lab, 10 Adobe, 7 third party) without a task-first route.
   **Fix:** Add a small set of task or connection-type filters and a recommended starting point while keeping the full catalog searchable.
   **Suggested command:** `/impeccable shape web/profile-viewer/mcp-servers.html`

3. **[P2] First-time setup still uses technical terms without a quick path**
   **Why it matters:** “Sandbox-scoped,” “Portal key,” and marketplace-versus-individual setup can still make newcomers pause.
   **Fix:** Add a short “Choose your client” path with a one-sentence authentication explanation and a link to the matching guide.
   **Suggested command:** `/impeccable clarify web/profile-viewer/mcp-servers.html`

## Persona Red Flags

- **Jordan, first-timer:** The Adobe-sign-in versus Portal-key distinction is visible, but “sandbox enrollment” and “sandbox-scoped” still require prior knowledge. A direct task-oriented start would help.
- **Alex, power user:** Search is the main shortcut across 35 entries; there are no task filters or quick favorites.
- **Mobile user:** The catalog cards fit a 390px viewport, but the shared navigation delays access to the content and increases scroll distance.

## Minor Observations

- The browser console still reports local-preview 404s and Firebase authentication/configuration errors in the signed-out environment. These are not generated by the updated catalog.
- Review exposed an undefined `MCP_SERVER_ID` in the signed-out key panel. The reference was removed and the signed-out message now names the selected sandbox; after reload, the key panel rendered and no uncaught page-script error remained.
- The full integration list remains available under “What the marketplace installs,” preserving detail without adding it to the default view.

## Questions to Consider

- Could the first choice be “What are you trying to do?” rather than which MCP to install?
- Should the default view confidently recommend a small starting set while leaving every integration accessible?
- Can the shared mobile menu collapse without making the navigation harder to discover?
