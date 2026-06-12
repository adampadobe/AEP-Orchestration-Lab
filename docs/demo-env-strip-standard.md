# Demo environment strip standard (JLR / Sky)

**Date:** 2026-06-02 (updated 2026-06-12 — canonical `shared/env-bar.js` loader)  
**Goal:** Single source of truth for the lab **top strip** (sandbox, Tags, event destination, profile lookup, site-clone Brand Concierge controls)—not the profile drawer shell.

## Canonical loader (2026-06-12)

All **site-clone** demos use **`shared/env-bar.js`** as the single entry point. The loader fetches `shared/env-bar-versions.json`, injects CSS, and defers the script chain (`demo-env-strip.js`, bootstrap, Tags, `aep-demo-env-bar.js`, `site-clone-bc-env.js`, etc.). Demo HTML must **not** preload those scripts.

```html
<script src="shared/env-bar.js?v=20260612-env-bar"></script>
<script>
  window.envBarConfig = { prefix: 'sky', variant: 'spectrum' };
</script>
```

Full API and migration guide: [`docs/env-bar-shared-module.md`](env-bar-shared-module.md). Verifiers: `npm run verify:demo-env-strip`, `npm run verify:env-bar-versions`.

## Master reference: **Sky** (`sky-demo.html`)

| Candidate | Notes |
|-----------|--------|
| **Sky (chosen)** | Site-clone strip with compact Tags row, BC style + datastream pickers, profile-column BC mode toggles (Full Screen / Modal / Injected), `AepDemoEnvBar` compact row, `SiteCloneBcEnv` per-sandbox web push. |
| JLR | Structurally identical to Sky; same mount pattern. |
| Etihad (legacy) | Vertical Tags stack, visible web-push hints, BC launcher checkbox, `injectSdkBtn` — **retired** for iframe demos. |

**Why Sky over Etihad:** Etihad matched the older skill template (stacked fields + park launcher). Sky/JLR reflect colleague work on dropdown UX, horizontal Tags layout, and site-clone BC without copy/paste drift.

## Unified bundle + bootstrap (2026-06-02)

All **site-clone** demos load one CSS bundle and one init function — no per-page links to `aep-demo-env-bar.css` / `site-clone-bc-env-strip.css`, no duplicated `initStandardEnvBar` blocks.

| File | Role |
|------|------|
| `web/profile-viewer/shared/demo-env-bar.bundle.css?v=20260602-env-bar-bundle` | `@import` of `aep-demo-env-bar.css` + `site-clone-bc-env-strip.css` (Sky stacked profile lookup + Tags row) |
| `web/profile-viewer/shared/demo-env-bar-bootstrap.js?v=20260602-env-bar-bootstrap` | `window.initLabDemoEnvBar({ prefix, … })` — mount strip, init env bar, optional `SiteCloneDemoEnv` |
| `web/profile-viewer/shared/demo-env-strip.js` | `DemoEnvStrip.autoMount` from `data-demo-env-strip-mount` |
| `web/profile-viewer/site-clone-bc-env.js` | Style URL, datastream, web push by sandbox, BC prefs |
| `web/profile-viewer/site-clone-bc.js` | Modal / injected / full-screen BC |
| `web/profile-viewer/aep-demo-env-bar.js` | `AepDemoEnvStrip.initStandardEnvBar` (called via bootstrap) |

### CSS (site-clone demos)

```html
<!-- Root-level demos -->
<link rel="stylesheet" href="shared/demo-env-bar.bundle.css?v=20260602-env-bar-bundle">
<!-- Nested pages (Miral parks, social/) -->
<link rel="stylesheet" href="../shared/demo-env-bar.bundle.css?v=20260602-env-bar-bundle">
```

Do **not** link `aep-demo-env-bar.css` or `site-clone-bc-env-strip.css` directly on site-clone demo pages.

### Scripts (site-clone demos — env bar slice)

After `aep-demo-web-push.js`:

```html
<script src="shared/demo-env-strip.js?v=20260601-env-strip-mount-sync"></script>
<script src="shared/demo-env-bar-bootstrap.js?v=20260602-env-bar-bootstrap"></script>
<script src="demo-tags-injection.js?v=20260601-tags-property-boot"></script>
<script src="aep-demo-env-bar.js?v=20260601-launch-unset-expand"></script>
```

Demo JS ends with:

```js
window.initLabDemoEnvBar && window.initLabDemoEnvBar({ prefix: 'sky' });
```

`DemoTagsInjection.init` stays in demo JS (BC, web push, iframe hooks) and **must** pass `hideTagsCompanyUi: true`.

### `initLabDemoEnvBar` options

| Option | Default | Purpose |
|--------|---------|---------|
| `prefix` | — | Derives `{prefix}SdkConfigSummary`, `{prefix}SdkConfigFields`, `{prefix}SelectedScript`; builds `SiteCloneDemoEnv` when not set inline |
| `storagePrefix` | from `DemoEnvStrip.siteCloneDemoEnvObject` | localStorage prefix for web push / BC prefs |
| `summaryId`, `fieldsId`, `selectedScriptCodeId` | from `prefix` | Override when ids are non-standard |
| `defaultBcStyle` | — | Remount Tags block with army/miral/generic default |
| `siteCloneDemoEnv` | — | Merge into `window.SiteCloneDemoEnv` |
| `envBar` | — | Extra passthrough to `AepDemoEnvStrip.initStandardEnvBar` |
| `refreshSiteCloneBcEnv` | `true` | Call `SiteCloneBcEnv.applyForCurrentSandbox()` after init |

## Shared implementation (Option A — JS mount)

| File | Role |
|------|------|
| `web/profile-viewer/shared/demo-env-strip.js` | **`mountSiteCloneEnvShell`** — full env bar from `site-clone-shell`; Tags, Target, BC, Decisioning sub-mounts |
| `web/profile-viewer/shared/demo-env-bar.bundle.css` | Unified env bar CSS (imports Sky master + strip) |
| `web/profile-viewer/site-clone-bc-env.js` | Style URL, datastream, web push by sandbox, BC prefs |
| `web/profile-viewer/site-clone-bc.js` | Modal / injected / full-screen BC |

### HTML mount contract (site-clone-shell — required for new demos)

```html
<div class="{brand}-demo-id-inner aep-demo-id-inner"
  data-demo-env-strip-mount="site-clone-shell"
  data-demo-env-strip-prefix="{prefix}"
  data-demo-env-strip-selected-script-id="{prefix}SelectedScript"
  data-demo-env-strip-message-id="{prefix}Message"
  data-demo-env-strip-profile-btn-label="Look up profile"
  data-demo-env-strip-disclaimer="…optional HTML…"></div>
```

Optional attributes: `data-demo-env-strip-default-bc-style`, `data-demo-env-strip-bc-bottom="1"`, `data-demo-env-strip-decisioning="0"` (hide Decisioning toggle).

`DemoEnvStrip.autoMount()` injects **Adobe Target** (datastream), **Brand Concierge** (style + display toggles), and **Decisioning** (enable toggle, on by default). Migrate legacy pages: `node scripts/migrate-demo-env-shell.mjs`.

Stable ids after mount: `{prefix}SdkConfigFields`, `{prefix}InjectSdkBtn`, `siteCloneBcStyleConfigUrl`, `siteCloneBcDatastreamId`, `siteCloneBc*Toggle`, `siteCloneDecisioningEnabledToggle`, `sandboxSelect`, `generatorTarget`, `aepDemoEnvCompact`, etc.

### Scripts (iframe site-clone demos — full page)

After `brand-concierge-toggle.js`:

```html
<script>
  window.SiteCloneDemoEnv = { storagePrefix: '…', … };
  window.SiteCloneBcPage = { iframeId: '…', statusMessageId: '…' };
</script>
<script src="site-clone-bc-env.js"></script>
<script src="{brand}-demo.js"></script>
<script src="site-clone-bc.js"></script>
```

## Migration status

| Page | Status |
|------|--------|
| All 22 site-clone HTML pages (Sky, JLR, MOD, Premier Inn, Etihad, KSIA, Admiral, Navigator, Race, Donate, Old Mutual ×4, Saga, Aviva Target, social ×2, Miral ×4) | **Done** — `site-clone-shell` + bundle CSS + `initLabDemoEnvBar` |

### Exceptions (redirect / iframe passthrough only) {#exceptions-not-site-clone}

Former FNB, call-centre, and Sky LLM pages now use **`shared/env-bar.js`** (see `docs/env-bar-shared-module.md` modes). The verifier only exempts:

| Page | Why exempt |
|------|------------|
| `mobile-demo.html`, `mobile-demo-apalmer.html` | Resizable phone shell — env controls live in the iframe target demo |
| `call-center-demo-apalmer.html` | Redirect stub → `call-centre-demo-v1.html` |
| `sky-llm-referral-traffic.html`, `sky-llm-llm-response.html` | Redirect stubs → `sky-llm-optimizer.html` hash routes |

**PR rule:** `npm run verify:demo-env-strip` **must pass** before merge on any PR that touches `web/profile-viewer/`.

## Verify + mirror

```bash
npm run verify:profile-viewer-routes
npm run verify:demo-env-strip
npm run sync-profile-viewer-ui
```

### Drift guard (`verify:demo-env-strip`)

CI/local script `scripts/verify-demo-env-strip.mjs` fails when:

| Pattern | Why forbidden |
|---------|----------------|
| Site-clone demo missing `shared/demo-env-bar.bundle.css` | Must use unified CSS bundle |
| Direct `aep-demo-env-bar.css` or `site-clone-bc-env-strip.css` on site-clone HTML | Causes version / layout drift |
| Demo JS calling `AepDemoEnvStrip.initStandardEnvBar` directly | Use `initLabDemoEnvBar({ prefix })` |
| `grid-template-columns: 1fr 300px` in demo CSS | Legacy side-by-side env + profile layout |
| `.aep-demo-env-*`, `#aepDemoProfileSection`, `.site-clone-bc-env-strip` in demo CSS | Belongs in shared bundle only |
| Inline `{prefix}SdkConfigFields` HTML | Markup must come from `shared/demo-env-strip.js` mount only |
| `om-aep-env-editor-grid` | Old Mutual legacy grid class |
| `injectSdkBtn` without prefix | Must be `{prefix}InjectSdkBtn` |
| Site-clone demo JS without `hideTagsCompanyUi: true` | Tags company row stays hidden (CSS + JS) |
| HTML with `data-demo-env-strip-mount="site-clone-tags"` not in site-clone list or [exception allowlist](#exceptions-not-site-clone) | Prevents orphan site-clone mounts |

**Allowlisted exceptions** (FNB, call centre, Sky LLM, mobile simulator) skip bundle/bootstrap/mount checks — see [Exceptions (not site-clone)](#exceptions-not-site-clone). **`npm run verify:demo-env-strip` must pass on every Profile Viewer PR** before merge.

**Tags company visibility:** row remains in DOM (`hidden` + `.mod-demo-tags-company-row { display: none !important }` in bundle); `demo-tags-injection.js` auto-picks company when `hideTagsCompanyUi: true`.

**Layout master:** `aep-demo-env-bar.css` `.aep-demo-id-inner` — flex column stack (Environment above Profile lookup). No per-demo env-strip CSS overrides.

## Related docs

- `.cursor/skills/profile-viewer-lab-demo-strip/SKILL.md` — update canonical reference to Sky + mount + bundle
- `docs/profile-viewer-modal-migration-audit.md` — profile **drawer** (separate concern)
- `CONTRIBUTING.md` — Profile Viewer lab demos — environment strip
