# Demo environment strip standard (JLR / Sky)

**Date:** 2026-06-01  
**Goal:** Single source of truth for the lab **top strip** (sandbox, Tags, event destination, profile lookup, site-clone Brand Concierge controls)—not the profile drawer shell.

## Master reference: **Sky** (`sky-demo.html`)

| Candidate | Notes |
|-----------|--------|
| **Sky (chosen)** | Site-clone strip with compact Tags row, BC style + datastream pickers, profile-column BC mode toggles (Full Screen / Modal / Injected), `AepDemoEnvBar` compact row, `SiteCloneBcEnv` per-sandbox web push. |
| JLR | Structurally identical to Sky; same mount pattern. |
| Etihad (legacy) | Vertical Tags stack, visible web-push hints, BC launcher checkbox, `injectSdkBtn` — **retired** for iframe demos. |

**Why Sky over Etihad:** Etihad matched the older skill template (stacked fields + park launcher). Sky/JLR reflect colleague work on dropdown UX, horizontal Tags layout, and site-clone BC without copy/paste drift.

## JLR/Sky vs Premier Inn (pre-migration)

| Feature | JLR / Sky | Premier Inn (old) |
|---------|-----------|-------------------|
| Tags layout | Horizontal: property+inject \| environment \| BC style + datastream | Vertical company / property / environment |
| Tags company | Hidden row; `hideTagsCompanyUi` in JS | Visible dropdown |
| Inject button id | `{prefix}InjectSdkBtn` | `injectSdkBtn` |
| Web push | `SiteCloneBcEnv` per-sandbox map; legacy toggles `aria-hidden` | Visible checkbox + long hints |
| Brand Concierge | Full Screen / Modal / Injected checkboxes in profile column | On-inject toggle + “Show launcher” checkbox |
| BC shell | `site-clone-bc.js` modal + FAB + frame host | `#brand-concierge-mount-host` + park launcher |
| CSS | `site-clone-bc-env-strip.css`, `site-clone-bc.css` | `aep-demo-env-bar.css` only |
| Compact env row | `AepDemoEnvBar` after inject | Same (already present) |
| `generatorTarget` | Sibling of Tags wrapper | Same (correct) |

## Shared implementation (Option A — JS mount)

| File | Role |
|------|------|
| `web/profile-viewer/shared/demo-env-strip.js` | `DemoEnvStrip.mountSiteCloneTagsFields`, `mountSiteCloneProfileBcPrefs`, `autoMount` from `data-demo-env-strip-mount` |
| `web/profile-viewer/site-clone-bc-env-strip.css` | Compact strip layout |
| `web/profile-viewer/site-clone-bc-env.js` | Style URL, datastream, web push by sandbox, BC prefs |
| `web/profile-viewer/site-clone-bc.js` | Modal / injected / full-screen BC |
| `web/profile-viewer/aep-demo-env-bar.js` | `AepDemoEnvStrip.initStandardEnvBar` — collapse + compact row |

`AepDemoEnvStrip.initStandardEnvBar()` (Option B) remains the **JS contract** for sandbox + collapse; markup comes from **Option A** mount.

### HTML mount contract

```html
<!-- Inside .aep-demo-env-editor-grid after sandbox row -->
<div
  id="{prefix}SdkConfigFieldsMount"
  data-demo-env-strip-mount="site-clone-tags"
  data-demo-env-strip-prefix="{prefix}"
  data-demo-env-strip-default-bc-style="army"
></div>
<!-- optional default BC style for mod-demo -->

<!-- Inside profile actions row -->
<div id="siteCloneBcPrefsMount" data-demo-env-strip-mount="site-clone-bc-prefs"></div>

<script src="shared/demo-env-strip.js?v=20260601-env-strip"></script>
```

Stable ids after mount: `{prefix}SdkConfigFields`, `{prefix}InjectSdkBtn`, `siteCloneBcStyleConfigUrl`, `siteCloneBcDatastreamId`, `siteCloneBc*Toggle`, `sandboxSelect`, `generatorTarget`, `aepDemoEnvCompact`, etc.

### Scripts (iframe site-clone demos)

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
| `sky-demo.html`, `jlr-demo.html`, `mod-demo.html` | **Done** — shared mount |
| `premier-inn-demo.html`, `etihad-demo.html`, `admiral-demo.html` | **Done** — full site-clone strip + BC shell |
| `navigator-global-demo.html` | **Done** — shared mount + site-clone BC |
| `race-for-life-demo.html`, `donate-demo.html` | **Done** — embedded bar + shared mount |
| `oldmutual-*.html` (4 pages) | **Done** — shared mount + `SiteCloneDemoEnv` per page variant |
| `social/facebook.html`, `social/tiktok.html` | **Done** — shared mount |
| `ferrari-world-abu-dhabi/*`, `seaworld-abu-dhabi/*`, `wb-world-abu-dhabi/*` | **Done** — shared mount + site-clone BC |

### Intentionally not migrated (different UX / out of scope)

| Page | Reason |
|------|--------|
| `fnb-*.html`, `fnb-demo.html` | Compact FNB header bar (email + generator only); not a lab env strip demo |
| `call-center-demo.html`, `call-centre-demo-v1.html`, `call-center-demo-apalmer.html` | Agent desktop UI; no Tags/sandbox strip |
| `sky-llm-*.html` | Sandbox + profile lookup only (snapshot viewers); no Tags injection surface |

## Verify + mirror

```bash
npm run verify:profile-viewer-routes
npm run sync-profile-viewer-ui
```

## Related docs

- `.cursor/skills/profile-viewer-lab-demo-strip/SKILL.md` — update canonical reference to Sky + mount
- `docs/profile-viewer-modal-migration-audit.md` — profile **drawer** (separate concern)
- `CONTRIBUTING.md` — Profile Viewer lab demos — environment strip
