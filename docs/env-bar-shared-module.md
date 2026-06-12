# Shared env bar module (`shared/env-bar.js`)

**Date:** 2026-06-12  
**Baseline:** Sky (`sky-demo.html`) — Spectrum variant  
**Goal:** Single loader + version manifest for all site-clone lab demos. No per-page script/CSS drift.

## Files

| File | Role |
|------|------|
| `web/profile-viewer/shared/env-bar.js` | Unified loader; exposes `window.envBar` API |
| `web/profile-viewer/shared/env-bar-versions.json` | Single cache-bust source for env bar assets |
| `web/profile-viewer/shared/demo-env-bar-bootstrap.js` | Called by env-bar — `initLabDemoEnvBar` (unchanged) |
| `web/profile-viewer/shared/demo-env-strip.js` | Strip DOM mount (unchanged) |
| `web/profile-viewer/demo-tags-injection.js` | Web SDK / Tags inject (unchanged; env-bar loads it) |
| `web/profile-viewer/aep-demo-env-bar.js` | Sandbox + env editor (unchanged; env-bar loads it) |

## Quick integration (Option A — preferred)

Load prerequisites first (Firebase, `aep-global-sandbox.js`, profile drawer, `aep-demo-web-push.js`), then:

```html
<script src="shared/env-bar.js?v=20260612-env-bar"></script>
<script>
  window.envBarConfig = {
    prefix: 'ksia',
    variant: 'spectrum',
    features: { webPush: true, bc: true },
  };
</script>
<!-- Demo lab-core after env bar (must wait for envBar.ready — see below) -->
<script src="demos/ksia/ksia-lab-core.js?v=20260623-env-inline"></script>
```

`env-bar.js` auto-inits on `DOMContentLoaded` when `envBarConfig` is set. Demo JS that calls `DemoTagsInjection.init` **must** defer until `envBar.ready()` resolves (env-bar loads `demo-tags-injection.js` asynchronously).

```js
if (window.envBar && window.envBar.ready) {
  window.envBar.ready().then(function () {
    initMyDemoLab({ iframeIds: ['mySiteFrame'] });
  });
}
```

Register the Tags instance so `setEnvironment` / `reloadSDK` can delegate:

```js
var tags = DemoTagsInjection.init({ /* demo-specific cfg */ hideTagsCompanyUi: true });
window.envBar.registerTagsInjection(tags);
```

## `window.envBar` API

| Method | Description |
|--------|-------------|
| `init(config?)` | Load manifest, CSS, script chain; call `initLabDemoEnvBar`. Returns `Promise`. |
| `ready()` | Promise that resolves when init completes; starts `init()` if autoInit has not run yet (avoids Tags boot race when lab-core runs before `DOMContentLoaded`). |
| `setEnvironment(sandbox)` | Set `AepGlobalSandbox` + `#sandboxSelect`; reapplies Tags/BC state. |
| `reloadSDK()` | Clicks `{prefix}InjectSdkBtn` — existing reload-based inject flow. |
| `getConfig()` | Shallow copy of active config. |
| `onChange(fn)` | Subscribe to init / sandbox / sdk-reload events. Returns unsubscribe. |
| `registerTagsInjection(instance)` | Wire `DemoTagsInjection.init` return for sandbox helpers. |

**Properties:** `envBar.VERSION` (module), `envBar.MANIFEST_VERSION` (embedded fallback).

### Config (`window.envBarConfig` or `init({ … })`)

| Field | Default | Purpose |
|-------|---------|---------|
| `prefix` | — | **Required.** Strip id prefix (`sky`, `ksia`, …) |
| `variant` | `spectrum` | `spectrum` or `classic` |
| `mode` | `shell` | `shell` (full site-clone), `journey` (chrome inject), `minimal` (sandbox + profile only), `compact-fnb` / `sandbox-only` (sandbox row in existing chrome) |
| `defaultSandbox` | — | Initial sandbox technical name |
| `features.webPush` | `true` | Feature flag (mount / demo JS) |
| `features.bc` | `true` | Brand Concierge strip sections |
| `features.decisioning` | `true` | Decisioning toggle on mount; set `false` to hide. When enabled, loads `decisioning-profile-module/*` + `site-clone-decisioning-boot.js` |

**Decisioning mount zones:** iframe / parent HTML needs `#TopRibbon`, `#hero-banner` (or `[data-hero-mount]`), and `#ContentCardContainer` — see [CONTRIBUTING.md § Decisioning mount zones](CONTRIBUTING.md#decisioning-mount-zones-site-clone-demos) and `shared/decisioning-mount-zones.fragment.html`.

| `decisioning.iframeId` | auto | Override iframe for mount injection |
| `decisioning.useParentDocument` | auto | Mount on shell page when no iframe |
| `decisioning.mountLayoutPreset` | `generic` (Sky: `sky-home`) | Layout in `decisioning-edge-inject.js` |
| `decisioning.viewName` | strip title | AJO page view name |
| `iframeIds` | `[]` | Passthrough for demo Tags config |
| `labCoreScript` | — | Optional script path loaded after env bar init |
| `basePath` | auto | Profile-viewer root for nested journey pages |
| `debug` | `false` | `[envBar]` console logging |
| `autoInit` | `true` | Auto `init()` on DOMContentLoaded |
| `siteCloneDemoEnv` | — | Merge into `window.SiteCloneDemoEnv` |
| `demoId` | `prefix` | Firestore `envBarConfigs/{demoId}` document id |
| `localOverride` | `false` | When `true`, page `envBarConfig` wins over remote defaults (local dev) |
| `firestoreListen` | `true` | Poll `GET /api/env-bar-config` for remote updates (`onChange` type `remote-config`) |

## Remote config (Firestore via API proxy)

Demos use Firebase **Realtime Database** for sandbox state — not the Firestore client SDK. Remote env bar defaults therefore load through a thin Cloud Function:

- **Collection:** `envBarConfigs/{demoId}`
- **API:** `GET /api/env-bar-config?demoId=ksia` (public read, Admin SDK in `functions/envBarConfigStore.js`)
- **Merge:** Remote defaults apply over page config unless `localOverride: true` (page wins for local dev)
- **Listen:** When `firestoreListen !== false`, the loader polls every 60s and emits `envBar.onChange({ type: 'remote-config' })`
- **Fallback:** Missing Firestore doc is fine — page `envBarConfig` and mount attributes are used

Example Firestore document (optional seed — demos work without it):

```json
{
  "demoId": "ksia",
  "prefix": "ksia",
  "defaultSandbox": "apalmer",
  "variant": "spectrum",
  "features": { "webPush": true, "bc": true, "decisioning": true },
  "defaultBcStyle": "miral"
}
```

## Version manifest

Edit **`shared/env-bar-versions.json`** only when bumping env bar assets:

```json
{
  "manifestVersion": "20260612-env-bar",
  "assets": {
    "bundleCss": "20260623-env-inline",
    "spectrumCss": "20260623-spectrum",
    "demoEnvStrip": "20260623-spectrum",
    "bootstrap": "20260602-env-bar-bootstrap",
    "tagsInjection": "20260605-tags-sandbox-restore",
    "aepDemoEnvBar": "20260601-launch-unset-expand",
    "siteCloneBcEnv": "20260612-strip-dom-defer"
  }
}
```

HTML references `shared/env-bar.js?v={manifestVersion}`. The loader fetches the JSON at runtime (embedded `DEFAULT_VERSIONS` fallback if fetch fails — **must stay in sync**; run `npm run verify:env-bar-versions`).

## SDK duplication avoidance

- **Do not** add a second Tags inject implementation in demo pages.
- `env-bar.js` loads `demo-tags-injection.js` and `aep-demo-env-bar.js` once per page.
- `reloadSDK()` delegates to `{prefix}InjectSdkBtn` click → existing reload/cache-bust path in `demo-tags-injection.js`.
- `setEnvironment()` uses `AepGlobalSandbox.setSelected` + `applySandboxConfigState` on the registered Tags instance.
- Per-demo `DemoTagsInjection.init({ hideTagsCompanyUi: true, … })` stays in lab-core JS; env-bar only loads shared modules.

### Modes (`envBarConfig.mode`)

| Mode | Mount | Loads Tags / BC | Use case |
|------|-------|-----------------|----------|
| `shell` (default) | `site-clone-shell` | Yes | Site-clone demos (Sky, KSIA, …) |
| `journey` | `site-clone-shell` | Yes | Journey URL chrome inject |
| `minimal` | `site-clone-minimal` | No | Sky LLM snapshots, call-centre pinned lookup, LLM demo |
| `compact-fnb` | `site-clone-sandbox-only` | No | Alias for `sandbox-only` — FNB utility row |
| `sandbox-only` | `site-clone-sandbox-only` | No | Sandbox select only (FNB header, call-centre v1 hybrid) |

Minimal / sandbox-only pages set `variant: 'classic'`, skip spectrum CSS, `demo-tags-injection.js`, and `env-bar-compact.js`. Markup mounts via `data-demo-env-strip-mount` on a host div; demo JS waits on `envBar.ready()`.

## Migration status

### Migrated (shared/env-bar.js)

All site-clone demos in `SITE_CLONE_DEMO_HTML` (`scripts/verify-demo-env-strip.mjs`): Sky, KSIA, JLR, MOD, Premier Inn, Etihad, Admiral, Navigator, Race for Life, Donate, Old Mutual (×4), Saga, Aviva Target, social (×2), Miral parks (Ferrari ×2, SeaWorld, WB World).

**Minimal** (`mode: 'minimal'`): Sky LLM snapshot shells (×8), `call-center-demo.html`, `demos/llm-demo/llm-demo.html`.

**Sandbox-only** (`mode: 'compact-fnb'` / `sandbox-only`): FNB demos (×5), `call-centre-demo-v1.html` (hybrid — sandbox via env bar; profile form unchanged).

**Mobile simulator** (`mobile-demo.html`, `mobile-demo-apalmer.html`): no env bar on shell — iframe target demo owns chrome.

Journey chrome via `envBar.init({ mode: 'journey' })`: `demos/ksia/ksia-journey-chrome.js`, `demos/aviva-target/aviva-target-journey-chrome.js`.

## Migrating a remaining demo

1. Remove `<link>` tags for `demo-env-bar.bundle.css` and `demo-env-bar-spectrum.css`.
2. Remove script tags: `demo-env-strip-spectrum.js`, `demo-env-strip.js`, `demo-env-bar-spectrum-sync.js`, `demo-env-bar-bootstrap.js`, `demo-tags-injection.js`, `aep-demo-env-bar.js`.
3. Add `shared/env-bar.js?v={manifestVersion}` + `window.envBarConfig` after `aep-demo-web-push.js`.
4. In demo JS: remove `initLabDemoEnvBar({ prefix })`; wrap lab init in `envBar.ready().then(…)`; call `envBar.registerTagsInjection(tagsInstance)`.
5. Add the HTML file to `MIGRATED_TO_ENV_BAR_HTML` and JS to `MIGRATED_ENV_BAR_JS` in `scripts/verify-demo-env-strip.mjs`.
6. Run `npm run verify:demo-env-strip` and `npm run sync-profile-viewer-ui`.

## Verify

```bash
npm run verify:demo-env-strip
npm run verify:env-bar-versions
npm run verify:profile-viewer-routes
npm run sync-profile-viewer-ui
```

## Related

- `docs/demo-env-strip-standard.md` — strip markup contract and legacy bootstrap docs
- `.cursor/skills/profile-viewer-lab-demo-strip/SKILL.md` — lab strip skill
