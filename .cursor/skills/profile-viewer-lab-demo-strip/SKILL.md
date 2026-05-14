---
name: profile-viewer-lab-demo-strip
description: >-
  Implements the canonical Profile Viewer lab strip (Sandbox, Adobe Tags inject,
  Event destination, profile lookup) for embedded or site-clone demos under
  web/profile-viewer/. Use when adding a new demo page, migrating FNB-style
  demos, or wiring DemoTagsInjection + /api/events/generator + AepDemoEnvStrip.
---

# Profile Viewer — lab demo environment strip

## When to use

- New HTML demo under `web/profile-viewer/` that needs **sandbox selection**, **Tags (Launch) injection**, and **`POST /api/events/generator`** (or profile drawer `application.login`).
- Refactoring an existing demo from a compact header (email + hidden generator) to the **standard strip**.

## Canonical pattern (must match)

1. **Stable DOM ids** (per page load): `aepDemoEnvSection`, `aepDemoEnvEditor`, `aepDemoEnvConfigGrid`, `sandboxSelect`, `aepDemoEnvCompact`, `aepDemoEnvCompactText`, `aepDemoEnvExpandBtn`, `aepDemoProfileSection`, `generatorTarget`.
2. **Tags block** is a **single** element (e.g. `#omSdkConfigFields`, `#modSdkConfigFields`) containing only company / property / environment / inject — **not** the Event destination select.
3. **`#generatorTarget`** is a **sibling** of that Tags block inside `.aep-demo-env-editor-grid`, so it **stays visible** when Tags fields collapse after inject (`DemoTagsInjection` sets `hidden` on the Tags wrapper only).
4. **SDK summary** row: `hidden` when configuring; `DemoTagsInjection` toggles. **`AepDemoEnvBar`** reads summary + fields `hidden` and drives the compact row.
5. **Selected script** line: a `<code id="…SelectedScript">` — pass its id as `selectedScriptCodeId` to `AepDemoEnvStrip.initStandardEnvBar`.

## Scripts (typical order)

After `email-cache.js`:

- `firebase-database-config.js`, Firebase compat **app** + **auth** (Tags API auth).
- `aep-global-sandbox.js`, `aep-lab-sandbox-sync.js` (optional; sandbox + auth headers for generator targets).
- `identity-picker.js` when using namespace + identifier row.
- `aep-profile-drawer.js`
- `demo-tags-injection.js`
- **`aep-demo-env-bar.js`** (exports `AepDemoEnvBar` + **`AepDemoEnvStrip`**)
- **`aep-demo-generator-targets.js`**

## JS wiring

```javascript
AepDemoEnvStrip.initStandardEnvBar({
  summaryId: '…SdkConfigSummary',
  fieldsId: '…SdkConfigFields',
  selectedScriptCodeId: '…SelectedScript',
});

DemoTagsInjection.init({ … configFieldsId, configSummaryId, getEmail: () => (customerEmail && customerEmail.value) || '', … iframeIds: [] }); // parent shell only — see docs/ANONYMOUS_EDGE_DEMO_PATTERN.md (anonymous refresh auto-reinjects Launch when email empty)

DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  messageSetter: …,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true, // if applicable
});
```

Call **`void loadGeneratorTargets()`** (or `AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect`) and register **`AepDemoGeneratorTargets.onSandboxChange`** to reload targets when the sandbox changes.

After profile lookup success, if Tags stitch is required: **`omTagsInjection.stitchAfterProfileLookup(profile, identifier)`**.

## CSS

- Always include **`aep-demo-env-bar.css`** when using the strip markup.
- If the page does **not** load `home.css` (no global `--dash-*` tokens), define **local fallbacks** on a wrapper (see **`oldmutual-demo.css`** → `.om-aep-controls--lab-strip`).

## Cache bust

Bump **`?v=`** on every `<link>` / `<script>` that references a changed asset (see CONTRIBUTING → Profile Viewer cache busting).

## Verify + mirror

- `npm run verify:profile-viewer-routes`
- `npm run sync-profile-viewer-ui` when the Express mirror must match

## References in repo

- `web/profile-viewer/aep-demo-env-bar.js` (file header lists reference pages).
- `web/profile-viewer/mod-demo.html`, `oldmutual-demo.html` (site-clone with OM token overrides).
