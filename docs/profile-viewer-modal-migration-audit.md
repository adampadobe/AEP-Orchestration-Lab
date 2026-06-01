# Profile Viewer modal migration audit

**Date:** 2026-06-01  
**Goal:** Single shared profile drawer shell for all lab demo websites (`ProfileViewerModal` + `DemoProfileDrawer`).

## Master reference selection

| Candidate | Path | Notes |
|-----------|------|-------|
| **Sky (chosen)** | `web/profile-viewer/sky-demo.html` | Full drawer markup with NPS row, em-dash placeholders, identity graph zoom, audiences/messages/events panels; aligned with site-clone BC + canonical env strip (`mod-demo` layout). |
| JLR | *Not present in repo* | No Jaguar Land Rover demo found under `web/profile-viewer/` (grep: jaguar, land-rover, jlr). Closest site-clone peer is `mod-demo.html` (British Army / MOD), which matched Sky structurally. |
| Etihad | `web/profile-viewer/etihad-demo.html` | Canonical env strip reference per skill; drawer used `-` vs `—` placeholders and slightly compressed HTML. Merged into Sky canonical shell. |

**Decision:** **Sky** is the master reference. Etihad’s env-strip patterns remain documented in `.cursor/skills/profile-viewer-lab-demo-strip/SKILL.md`; drawer shell markup is centralized from Sky.

## Variant differences (pre-migration)

| Aspect | Sky / mod / site-clone | Etihad / older copies | FNB family |
|--------|------------------------|----------------------|------------|
| Placeholder dashes | `—` (unicode) | `-` (ASCII) | Same as Sky after migration |
| NPS score row | Present | Present (sometimes hidden by JS) | Present |
| Env strip | Full `AepDemoEnvStrip` | Full | Compact header login bar only |
| Profile open class | `mod-demo-page--profile-open` (Sky) | `{brand}-demo-page--profile-open` | `fnb-demo-page--profile-open` |
| Drawer HTML | ~125 lines duplicated per page | Same structure, formatting drift | Same structure |

Logic (`/api/profile/table`, namespace via `AepIdentityPicker`, Tags via `DemoTagsInjection`) was already shared in `aep-profile-drawer.js`; only **markup** drifted.

## Shared implementation

| File | Role |
|------|------|
| `web/profile-viewer/shared/profile-viewer-modal.js` | `window.ProfileViewerModal` — `mount`, `open`, `close`, `setContext`, `renderProfile` |
| `web/profile-viewer/shared/profile-viewer-modal.css` | Mount host (`display: contents`) |
| `web/profile-viewer/aep-profile-drawer.js` | Profile data fetch/render (`DemoProfileDrawer`) — unchanged API |
| `web/profile-viewer/aep-profile-drawer.css` | Drawer panel styling — unchanged |

## Migration table

| File | Pre-migration type | Variant | Duplicate markup | Action | Status |
|------|-------------------|---------|------------------|--------|--------|
| `sky-demo.html` | Copied HTML | Sky | Yes (~125 lines) | Mount + shared scripts | **Done** |
| `mod-demo.html` | Copied HTML | Sky/mod clone | Yes | Mount | **Done** |
| `etihad-demo.html` | Copied HTML | Etihad | Yes | Mount | **Done** |
| `admiral-demo.html` | Copied HTML | Standard strip | Yes | Mount | **Done** |
| `premier-inn-demo.html` | Copied HTML | Standard strip | Yes | Mount | **Done** |
| `navigator-global-demo.html` | Copied HTML | Standard strip | Yes | Mount | **Done** |
| `donate-demo.html` | Copied HTML | Standard strip | Yes | Mount | **Done** |
| `race-for-life-demo.html` | Copied HTML | Standard strip | Yes | Mount | **Done** |
| `call-center-demo.html` | Copied HTML | Call centre | Yes | Mount | **Done** |
| `call-centre-demo-v1.html` | Copied HTML | Call centre | Yes | Mount | **Done** |
| `oldmutual-demo.html` | Copied HTML | Old Mutual strip | Yes | Mount | **Done** |
| `oldmutual-wealth.html` | Copied HTML | Old Mutual | Yes | Mount | **Done** |
| `oldmutual-insurance-for-business.html` | Copied HTML | Old Mutual | Yes | Mount | **Done** |
| `oldmutual-business-quote-thank-you.html` | Copied HTML | Old Mutual | Yes | Mount | **Done** |
| `fnb-demo.html` | Copied HTML | FNB compact bar | Yes | Mount | **Done** |
| `fnb-business-banking.html` | Copied HTML | FNB | Yes | Mount | **Done** |
| `fnb-business-accounts.html` | Copied HTML | FNB | Yes | Mount | **Done** |
| `fnb-gold-business-thank-you.html` | Copied HTML | FNB | Yes | Mount | **Done** |
| `fnb-platinum-business-thank-you.html` | Copied HTML | FNB | Yes | Mount | **Done** |
| `social/facebook.html` | Copied HTML | Social strip | Yes | Mount | **Done** |
| `social/tiktok.html` | Copied HTML | Social strip | Yes | Mount | **Done** |
| `ferrari-world-abu-dhabi/index.html` | Copied HTML | Miral theme park | Yes | Mount | **Done** |
| `ferrari-world-abu-dhabi/booking.html` | Copied HTML | Miral theme park | Yes | Mount | **Done** |
| `seaworld-abu-dhabi/index.html` | Copied HTML | Miral theme park | Yes | Mount | **Done** |
| `wb-world-abu-dhabi/index.html` | Copied HTML | Miral theme park | Yes | Mount | **Done** |

## Out of scope (different UI pattern)

| File | Type | Notes |
|------|------|-------|
| `index.html` | Main Profile Viewer dashboard | Full-page app + JSON modals — not demo drawer |
| `consent.html` | Standalone consent lab | Inline query UI, no hover drawer |
| `profile-generation.html` | Generator tool | Uses `/api/profile/table` in-editor, not demo drawer |
| `content-decision-live-edge.html` | Decisioning lab | Separate identity UX |

## Compatibility shims

1. **`ProfileViewerModal.mount()`** — no-op if `#profileDrawer` already exists (legacy pages during rollout).
2. **Stable element ids** — `#profileHoverZone`, `#profileDrawer`, `#profileDrawerName`, etc. unchanged so `DemoProfileDrawer.init()` and CSS need no changes.
3. **`DemoProfileDrawer` alias** — `AepProfileDrawer` / `DemoProfileDrawer` remain the data layer; demos keep existing `DemoProfileDrawer.init({...})` calls.

## Validation

- `npm run verify:profile-viewer-routes` — must pass (decisioning routes untouched)
- `npm run sync-profile-viewer-ui` — Express mirror aligned after `web/profile-viewer/` edits

## Follow-up risks

- **Subdirectory relative paths** — nested demos use `../shared/`; broken only if files move without updating script `src`.
- **Cache bust** — bump `?v=20260601-modal-central` on shared modal assets when shell markup changes.
- **JLR demo** — if added later, use mount pattern only; do not inline drawer HTML.
- **Express mirror** — run sync after hosting deploy so local `npm run profile-viewer` matches.
