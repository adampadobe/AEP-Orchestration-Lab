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

- **Collection:** `envBarConfigs/{demoId}` on **default Firestore** (`aep-orchestration-lab`)
- **Document id:** lowercased `demoId` / `prefix` (see `docId()` in `functions/envBarConfigStore.js`; e.g. `avivaTarget` → `avivatarget`)
- **API:** `GET /api/env-bar-config?demoId=ksia` (public read, Admin SDK in `functions/envBarConfigStore.js`)
- **Merge:** Remote defaults apply over page config unless `localOverride: true` (page wins for local dev)
- **Listen:** When `firestoreListen !== false`, the loader polls every 60s and emits `envBar.onChange({ type: 'remote-config' })`
- **Fallback:** Missing Firestore doc is fine — page `envBarConfig` and mount attributes are used

### Firestore schema (`envBarConfigs/{demoId}`)

Only fields in the allow-list below are returned by the API (`sanitizeConfig` in `envBarConfigStore.js`). Extra fields are stored but stripped on read.

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `demoId` | string | recommended | Document key after `docId()` normalization; defaults to `prefix` when omitted |
| `prefix` | string | **yes** | Strip id prefix (`sky`, `ksia`, `avivaTarget`, …) |
| `defaultSandbox` | string | no | Initial sandbox technical name (e.g. `apalmer`) |
| `availableSandboxes` | string[] | no | Restrict sandbox dropdown to this list |
| `variant` | string | no | `spectrum` (default) or `classic` |
| `mode` | string | no | `shell`, `journey`, `minimal`, `compact-fnb`, `sandbox-only` |
| `defaultBcStyle` | string | no | Brand Concierge style preset id |
| `disclaimer` | string | no | Strip disclaimer copy |
| `labCoreScript` | string | no | Optional lab-core script path loaded after env bar init |
| `storagePrefix` | string | no | localStorage namespace for demo prefs |
| `features` | object | no | `{ webPush, bc, decisioning }` booleans |
| `decisioning` | object | no | `{ iframeId, useParentDocument, mountLayoutPreset, viewName, … }` |
| `siteCloneDemoEnv` | object | no | Merged into `window.SiteCloneDemoEnv` (toggle ids, storage keys) |
| `envBar` | object | no | Passthrough to `AepDemoEnvStrip.initStandardEnvBar` |
| `iframeIds` | string[] | no | Default iframe ids for Tags inject / decisioning |
| `updatedAt` | timestamp | auto | Server timestamp on seed/write |
| `seededBy` | string | auto | Provenance (seed script name) |

**API response** (`GET /api/env-bar-config?demoId=ksia`):

```json
{
  "ok": true,
  "demoId": "ksia",
  "found": true,
  "config": { "demoId": "ksia", "prefix": "ksia", "variant": "spectrum", "features": { "webPush": true, "bc": true, "decisioning": true } }
}
```

When no document exists: `{ "ok": true, "found": false, "config": null }`.

### Seed script and JSON exports

```bash
# Requires ADC on aep-orchestration-lab (gcloud auth application-default login)
node scripts/seed-env-bar-configs.mjs
node scripts/seed-env-bar-configs.mjs --dry-run
node scripts/seed-env-bar-configs.mjs --only ksia,sky
```

Canonical JSON per demo: `scripts/env-bar-config-seeds/{docId}.json` (ksia, sky, etihad, avivatarget, race).  
**Document id** is lowercased `prefix` (`avivaTarget` → `avivatarget`). Query `?demoId=avivaTarget` resolves to the same doc.  
**Manual import** (no credentials): Firebase console → Firestore → `envBarConfigs` → Add document → id = filename stem → paste JSON (omit `updatedAt` / `seededBy` or set manually).

Example Firestore document (KSIA):

```json
{
  "demoId": "ksia",
  "prefix": "ksia",
  "defaultSandbox": "apalmer",
  "variant": "spectrum",
  "features": { "webPush": true, "bc": true, "decisioning": true },
  "siteCloneDemoEnv": {
    "storagePrefix": "ksia",
    "webPushToggleId": "ksiaWebPushOnInjectToggle",
    "bcOnInjectToggleId": "ksiaBcOnInjectToggle",
    "bcStyleSelectId": "ksiaBcStyleSelect"
  }
}
```

## Version manifest

After editing the manifest, run `npm run sync:env-bar-versions`. This updates all
existing web/mobile loader references, the brand-scraper shell templates and the
loader's offline defaults from the same source. The greenfield scaffold reads
the manifest directly. Run `npm run sync-profile-viewer-ui` afterward.

`npm run verify:env-bar-versions` verifies both offline defaults and every loader
consumer. CI runs it alongside `npm run verify:demo-env-strip`; no demo-specific
forks or captured copies of environment-bar styles should be introduced.

Full customer demos share the Spectrum shell. Minimal agent/LLM and sandbox-only
FNB modes retain their intentionally reduced controls, rather than gaining
unsupported Tags or decisioning capabilities.

The full shell keeps the Lab sidebar closed on desktop and mobile until the
configuration panel's **Show menu** control is used (`menuButtonOnly` defaults
to `true`). This prevents a mobile sidebar from pushing the customer site below
the fold. Explicit `menuButtonOnly: false` is a legacy opt-out, not the default.

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

## Shared visitor / ECID reset

`shared/demo-visitor-reset.js` owns the reload-and-verify lifecycle for
**New visitor**. The env bar owns its controls and loads the controller, then
`shared/demo-visitor-adapters.js` before initializing the controller, Tags and demo
hydration. The adapters register exact visitor-only storage cleanup across demos,
including journeys not currently open. `init(config)` is synchronous and mounts no UI;
pending SDK verification runs in the background with a bounded timeout (15 seconds
by default, configurable with `timeoutMs`).

Reset first asks for confirmation, then reads the **live configured SDK**
`getIdentity` result. A displayed or persisted ECID is never accepted as proof.
Without a usable live ECID, the operation fails without deleting cookies or
reloading. The controller waits for `beforeReset` adapters, persists a
tab-scoped reload marker, preserves the selected Tags script for automatic
reinjection, invalidates visitor state and accessible identity cookies, then
performs one full reload to discard the SDK's in-memory identity.

On the landing page, only a valid ECID **different from the old ECID** completes
reset. Missing identity, SDK errors, a timeout, or the same ECID produce an
explicit error and keep identity sends/lookups blocked. Failure markers survive
reload; they do not cause reload loops or silently retry. A late old/unavailable
ECID after successful verification is also rejected. Reset does **not** call
`sendEvent`, stitch an email, mint an ECID, invoke a server-side anonymous-ID
fallback, or delete an existing AEP profile.

### Controller API and integration

| API | Contract |
|-----|----------|
| `AepDemoVisitorReset.init(config)` | Merge env config and synchronously invalidate a pending reset before hydration. Returns the controller, not an SDK wait promise. |
| `reset()` | Confirm, capture live identity, invalidate and reload. Returns a promise; cancellation resolves `false`, failure rejects. |
| `availability()` / `canReset()` | SDK availability and reset capability. `availability()` returns `{available, canReset, reason}`; a live `getIdentity` still has to succeed. |
| `isBlocked()` | Gate profile lookup, identity stitching, SDK sends and anonymous-ID fallbacks while resetting, verifying, failed or invalidated. |
| `isPending()` | Verification is outstanding on a reset landing page; false on errors or another-tab invalidation. |
| `isResetPage()` | Fixed true for a page loaded with a reset marker, even after verification. Suppress automatic boot page views/mirrors/push subscriptions for that entire landing page; later explicit demo interactions may proceed after `isBlocked()` becomes false. |
| `acceptEcid(ecid)` | Consume a pending reset identity exactly once; returns `true` for reset-owned sync (including already completed). Rejects old/missing identity or a different identity after completion. Never fall through to automatic send/mirror/stitch for this sync. |
| `registerAdapter({beforeReset?, invalidate?, afterReset?})` | Register hooks; returns unsubscribe. `beforeReset` is awaited before deletion/reload; `invalidate` clears demo visitor state. A late adapter receives invalidation while blocked, or the verified `{ecid}` after completion. Hooks must not send/stitch events. |
| `getState()` | Snapshot `{status, blocked, message}` for controls mounted after initialization. |
| `guardSdkWindow(window)` | Install submission guards in a same-origin SDK window before injecting its Tags/SDK bootstrap. Safe to call again after a supported configurable binding was explicitly redefined. |
| `getGuardWarnings()` | Coverage warnings for inaccessible frames or unsupported SDK global descriptors. These are also emitted as `aep-demo-visitor-reset-guard-warning` with `{message}`. |

Supported config includes `prefix`, `storagePrefix`, `defaultSandbox`,
`selectedScriptId`, `scriptUrl`, `orgId` / `imsOrgId`, and `timeoutMs`.
Nonstandard pages can supply `alloyInstanceName`, an `alloy` function, or a
`getSdk()` resolver. Only the supported browser `getIdentity` command is used;
there is no assumed `resetIdentities` command.

Events:

- `aep-demo-visitor-reset-state`: `{status, blocked, message}` on lifecycle changes.
- `aep-demo-visitor-reset-start`: `{oldEcid}` before local visitor invalidation.
- `aep-demo-visitor-reset-complete`: `{ecid}` only after a different ECID is verified.
- `aep-demo-visitor-invalidated`: `{reason: 'cross-tab'}` in other same-origin
  tabs. These tabs clear stale UI and block sends/lookups; they require an explicit
  reload/reset, never replay prior events automatically. Their next manual reload
  verifies identity against the previous ECID before unblocking.

### Preserved state and cookie limitations

Sandbox, Tags company/property/environment/script, datastream, feature settings,
consent and the shared recent-email history are preserved. The selected email,
`aep-demo-session-identifier-v1`, drawer profile/identity graph/events/audiences
and registered demo persona/visitor state are cleared. Cached ECID maps are
cleared with empty-string **tombstones**, including unified
`AepLabEnvBarPrefs.tagsBySandbox`: deleting a map entry alone is insufficient
because preference writes merge entries. Demo-specific visitor-only cleanup
belongs in the shared adapter registry; never broadly clear storage.

Cookie expiration targets the active organization's `kndctr_*_identity` /
`kndctr_*_cluster`, legacy `AMCV_*` / `AMCVS_*`, and legacy `s_ecid`.
The controller attempts host-only, explicit hostname, parent-domain and
current/ancestor-path variants. It preserves Adobe consent cookies and other
organizations' named cookies. Supply `orgId` when multiple visible organizations
make inference ambiguous or no accessible cookie identifies the active org.
JavaScript cannot delete HttpOnly cookies, cookies on another origin, or cookies
outside accessible domain/path scope. Adobe/server-side identity recovery can
also return the old ECID: this is reported as failure, never fabricated success.
Cookie changes affect other tabs sharing the origin/organization; existing
Adobe profiles and their identity links are not erased.

### SDK submission guard and coverage boundary

The controller installs a submission guard **at script evaluation**, before
`init()` and Tags reinjection. It intercepts calls through `window.alloy`,
`config.alloyInstanceName`, and Adobe's registered `window.__alloyNS` instance
names. Configurable global accessors wrap both existing functions and subsequent
ordinary assignments synchronously. Adobe bootstrap namespace-array assignment,
`push` and indexed additions are observed, including a named instance created
after Tags loads. Globals remain configurable; the controller does not lock SDK
bindings or modify global `fetch`/XHR.

While `isBlocked()` is true, `sendEvent` rejects with
`error.code === 'AEP_DEMO_VISITOR_BLOCKED'` before reaching the SDK. It is not
queued for later replay. Existing Adobe bootstrap queue entries
`[resolve, reject, arguments]` for `sendEvent` are removed and rejected when reset
blocks the visitor. `getIdentity`, `configure` and other commands remain available.
Function proxies preserve the original property/queue objects and caller
receiver. Once verification succeeds, explicit later submissions can pass;
the separate `isResetPage()` integration still suppresses automatic boot events.

Existing same-origin iframe windows are guarded, and newly discovered frames are
observed for load. **For a guarantee before a frame's boot scripts run**, the
code injecting Tags/SDK into that frame must call
`AepDemoVisitorReset.guardSdkWindow(frame.contentWindow)` first. Mutation/load
observers cannot retroactively prevent startup code that has already run.
Cross-origin frames cannot be guarded, and a frame navigation destroys its prior
window's SDK context; load-time reinstallation may occur after its own startup.

This is not a universal network firewall: raw SDK function references captured
before installation, in-flight SDK requests, functions returned only through an
opaque custom resolver, direct Edge/API HTTP submissions, workers, unsupported
non-configurable/accessor globals, explicit `defineProperty`/deletion replacing a
guard, and inaccessible iframe scripts remain outside interception. Such
integrations must use the existing lifecycle gates or install a guard before
capturing/creating SDK references. Unsupported binding/frame cases produce
coverage warnings rather than silently claiming protection.

Fixture-only validation (no live Adobe requests):

```bash
node --test scripts/test-demo-visitor-reset.cjs
```

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

## User preferences (cross-demo)

Unified env bar user prefs live in **`localStorage.aepLabEnvBarV1`** via `shared/env-bar-prefs-local.js` (`window.AepLabEnvBarPrefs`). Legacy per-demo `{storagePrefix}*` keys migrate on first read. Firestore sync: `GET/POST /api/lab/env-bar-preferences` → collection `labUserEnvBarPreferences/{uid}` (Admin SDK only).

When a user has a saved sandbox, remote `envBarConfigs.defaultSandbox` from seeds is **not** applied (demo static config vs user prefs). Seed scripts may omit `defaultSandbox` for demos where user prefs should win — see `scripts/seed-env-bar-configs.mjs`.

| Method | Description |
|--------|-------------|
| `whenPrefsReady()` | Resolves when local prefs + optional Firestore pull complete |
| `AepLabEnvBarPrefs.getSelectedSandbox()` | Cross-demo sandbox selection |
| `AepLabEnvBarPrefsSync.pull()` | Re-fetch from Firestore after Adobe sign-in |

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
