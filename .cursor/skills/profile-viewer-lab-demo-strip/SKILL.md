---
name: profile-viewer-lab-demo-strip
description: >-
  Implements the canonical Profile Viewer lab strip (Sandbox, Adobe Tags inject,
  Event destination, profile lookup, web push, Brand Concierge launcher) for
  embedded or site-clone demos under web/profile-viewer/. Use when adding a new
  demo page, migrating FNB-style demos, or wiring DemoTagsInjection +
  /api/events/generator + AepDemoEnvStrip.
---

# Profile Viewer — lab demo environment strip

## When to use

- New HTML demo under `web/profile-viewer/` that needs **sandbox selection**, **Tags (Launch) injection**, and **`POST /api/events/generator`** (or profile drawer `application.login`).
- Refactoring an existing demo from a compact header (email + hidden generator) to the **standard strip**.

## Canonical pattern (must match)

1. **Stable DOM ids** (per page load): `aepDemoEnvSection`, `aepDemoEnvEditor`, `aepDemoEnvConfigGrid`, `sandboxSelect`, `aepDemoEnvCompact`, `aepDemoEnvCompactText`, `aepDemoEnvExpandBtn`, `aepDemoProfileSection`, `generatorTarget`.
2. **Tags block** is a **single** element (e.g. `#{prefix}SdkConfigFields`) containing company / property / environment / inject / web push rows / BC toggles — **not** the Event destination select.
3. **`#generatorTarget`** is a **sibling** of that Tags block inside `.aep-demo-env-editor-grid`, so it **stays visible** when Tags fields collapse after inject (`DemoTagsInjection` sets `hidden` on the Tags wrapper only).
4. **SDK summary** row: `hidden` when configuring; `DemoTagsInjection` toggles. **`AepDemoEnvBar`** reads summary + fields `hidden` and drives the compact row.
5. **Selected script** line: a `<code id="…SelectedScript">` — pass its id as `selectedScriptCodeId` to `AepDemoEnvStrip.initStandardEnvBar`.
6. **Two-column layout:** add `aep-demo-id-inner` to the brand-prefixed id-inner `<div>` to inherit the standard two-column grid (env config left `1fr`, profile lookup right `300px`). See `aep-demo-env-bar.css`.

## HTML structure

Use `etihad-demo.html` as the canonical reference. Key sections in order:

```html
<!-- Top anchor: hover-reveal banner pattern -->
<div class="{brand}-demo-top-anchor" id="{brand}DemoTopAnchor">
  <section class="{brand}-demo-id-banner" aria-label="…">
    <!-- Two-column grid: add both brand class AND aep-demo-id-inner -->
    <div class="{brand}-demo-id-inner aep-demo-id-inner">

      <!-- LEFT COLUMN: environment + Tags config -->
      <section class="aep-demo-env-section" id="aepDemoEnvSection" aria-label="AEP environment">
        <div class="aep-demo-env-editor" id="aepDemoEnvEditor">
          <div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">
            <span class="aep-demo-env-kicker">Environment</span>
            <div class="aep-demo-env-editor-grid">
              <!-- Sandbox select -->
              <div class="form-row">
                <label for="sandboxSelect">Sandbox</label>
                <select id="sandboxSelect" class="sandbox-select">…</select>
              </div>

              <!-- Tags config fields wrapper (company, property, environment, inject, toggles) -->
              <div id="{prefix}SdkConfigFields" class="{prefix}-sdk-config-fields mod-sdk-config-fields">
                <div class="form-row"><label>Tags company</label><select id="{prefix}TagsCompany">…</select></div>
                <div class="form-row"><label>Tags property</label><input id="{prefix}TagsProperty" list="{prefix}TagsPropertyList">…</div>
                <div class="form-row"><label>Tags environment</label><select id="{prefix}TagsEnvironment">…</select></div>
                <div class="{brand}-demo-id-actions">
                  <button id="injectSdkBtn" class="btn-lookup">Inject selected script</button>
                </div>

                <!-- Web push -->
                <div class="form-row aep-demo-web-push-row" role="group" aria-label="Web push">
                  <label class="aep-demo-web-push-label">
                    <input type="checkbox" id="{prefix}WebPushOnInjectToggle" />
                    <span>Register web push when injecting Tags
                      <span class="aep-demo-web-push-hint">…hint text…</span>
                    </span>
                  </label>
                </div>
                <div class="aep-demo-web-push-retry">
                  <button id="{prefix}WebPushRetryBtn" class="btn-lookup">Register web push now</button>
                  <span class="aep-demo-web-push-retry-hint">…hint text…</span>
                </div>

                <!-- Brand Concierge on-inject toggle -->
                <div class="form-row aep-bc-toggle-row" role="group" aria-label="Brand Concierge">
                  <label class="aep-demo-web-push-label">
                    <input type="checkbox" id="{prefix}BcOnInjectToggle" />
                    <span>Enable Brand Concierge when injecting Tags</span>
                  </label>
                  <select id="{prefix}BcStyleSelect" class="aep-bc-style-select" aria-label="Brand Concierge style">
                    <option value="miral">Miral</option>
                    <option value="generic">Generic (DemoEfficiency)</option>
                    <option value="army">Army Recruitment</option>
                  </select>
                </div>

                <!-- BC launcher visibility toggle -->
                <div class="form-row aep-bc-launcher-row" role="group" aria-label="BC launcher visibility">
                  <label class="aep-demo-web-push-label">
                    <input type="checkbox" id="{prefix}BcLauncherToggle" />
                    <span>Show Brand Concierge launcher on page</span>
                  </label>
                </div>
              </div><!-- end SdkConfigFields -->

              <!-- Event destination: SIBLING of SdkConfigFields, not inside it -->
              <div class="form-row">
                <label for="generatorTarget">Event destination</label>
                <select id="generatorTarget">…</select>
              </div>
            </div><!-- end aep-demo-env-editor-grid -->

            <!-- SDK summary (hidden until inject) -->
            <div id="{prefix}SdkConfigSummary" class="{prefix}-sdk-summary mod-sdk-summary--below-env-grid" hidden>
              <span id="{prefix}SdkConfigSummaryText"></span>
              <button id="{prefix}ChangeSdkConfigBtn" class="btn-lookup">Change SDK config</button>
            </div>
          </div>
          <div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>
            <span id="aepDemoEnvCompactText"></span>
            <button id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button>
          </div>
        </div>
      </section>

      <!-- RIGHT COLUMN: Profile lookup -->
      <section class="aep-demo-profile-section" id="aepDemoProfileSection" aria-label="Profile lookup">
        <span class="aep-demo-env-kicker">Profile lookup</span>
        <div class="aep-demo-profile-section-grid">
          <div class="form-row"><label>Namespace</label><select id="{prefix}Ns">…</select></div>
          <div class="form-row"><label for="customerEmail">Identifier value</label>
            <input type="text" id="customerEmail" placeholder="Enter identifier">
          </div>
          <div class="{brand}-demo-id-actions">
            <button id="queryProfileBtn" class="btn-lookup">Look up profile</button>
            <span class="{brand}-demo-ecid-hint" id="ecidHint">ECID: <strong id="infoEcid">-</strong></span>
          </div>
        </div>
      </section>
    </div><!-- end id-inner -->

    <p class="{brand}-demo-script-preview">Selected script: <code id="{prefix}SelectedScript">None</code></p>
    <p id="{prefix}Message" class="{brand}-demo-message" role="status" aria-live="polite" hidden></p>
  </section>
</div><!-- end top-anchor -->

<!-- Site iframe (for site-clone demos) -->
<!-- Dashboard shell -->
<div class="dashboard-shell">
  <aside class="dashboard-sidebar" aria-label="Primary"></aside>
  <div class="dashboard-main-wrap">…</div>
</div>

<!-- Profile drawer -->
<div class="aep-profile-drawer-hover-zone" id="profileHoverZone" aria-hidden="true"></div>
<aside class="aep-profile-drawer" id="profileDrawer" …>…</aside>
```

**Scripts (in order, before `</body>`):**

```html
<script src="firebase-database-config.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>
<script src="aep-global-sandbox.js"></script>
<script src="aep-lab-sandbox-sync.js?v=…"></script>
<script src="email-cache.js"></script>
<script src="identity-picker.js"></script>
<script src="email-engagement-metrics.js"></script>
<script src="aep-profile-drawer.js?v=…"></script>
<script src="aep-demo-web-push.js?v=…"></script>
<script src="demo-tags-injection.js?v=…"></script>
<script src="aep-demo-env-bar.js?v=…"></script>
<script src="aep-demo-generator-targets.js?v=…"></script>
<script src="brand-concierge-styles-bundle.js?v=…"></script>
<script src="brand-concierge-toggle.js?v=…"></script>
<script src="{brand}-demo.js?v=…"></script>
<script defer src="aep-theme.js?v=…"></script>
<script defer src="aep-theme-prefs.js?v=…"></script>
<script defer src="aep-lab-nav.js?v=…"></script>

<!-- BC mount host + branded launcher + controls (after nav scripts) -->
<div id="brand-concierge-mount-host" aria-live="polite">
  <button type="button" id="aepBcDismissBtn" class="aep-bc-dismiss-btn" aria-label="Close Brand Concierge">×</button>
  <div id="brand-concierge-mount"></div>
</div>
<button type="button" id="{prefix}BcLauncher" class="aep-bc-park-launcher" aria-label="Open Brand Concierge">
  <svg width="16" height="16" viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M22 6l1.2 4.4L28 12l-4.8 1.4L22 18l-1.2-4.6L16 12l4.8-1.6L22 6z" fill="currentColor"/>
    <path d="M10 26l0.6 2 2 0.6-2 0.6L10 31l-0.6-2-2-0.6 2-0.6 0.6-2z" fill="currentColor" opacity=".6"/>
  </svg>
  Ask
</button>
<script src="brand-concierge-controls.js?v=…"></script>
```

## Stylesheets (load order)

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="home.css?v=…">
<link rel="stylesheet" href="{brand}-demo.css?v=…">
<link rel="stylesheet" href="aep-demo-env-bar.css?v=…">
<link rel="stylesheet" href="brand-concierge-controls.css?v=…">
<link rel="stylesheet" href="aep-profile-drawer.css?v=…">
<link rel="stylesheet" href="aep-theme.css?v=…">
<link rel="stylesheet" href="aep-theme-palettes.css?v=…">
```

## Per-demo CSS (`{brand}-demo.css`) — required blocks

```css
/* 1. Overlay shell so lab nav floats over site iframe */
.{brand}-demo-page .dashboard-shell { position: fixed; inset: 0; z-index: 2000; pointer-events: none; display: flex; }
.{brand}-demo-page .dashboard-sidebar { pointer-events: auto; }
.{brand}-demo-page .dashboard-main-wrap { display: none; }

/* 2. Hover-reveal top anchor */
.{brand}-demo-top-anchor { position: fixed; top: 0; left: 0; right: 0; z-index: 6500; pointer-events: none; }
.{brand}-demo-top-anchor::before { content: ""; display: block; height: 14px; pointer-events: auto; }
.{brand}-demo-id-banner { pointer-events: auto; background: var(--dash-surface); border-bottom: 1px solid var(--dash-border);
  box-shadow: var(--dash-shadow); transform: translateY(calc(-100% - 14px)); transition: transform 0.2s ease; }
.{brand}-demo-top-anchor:hover .{brand}-demo-id-banner,
.{brand}-demo-top-anchor:focus-within .{brand}-demo-id-banner { transform: translateY(0); }

/* 3. Config fields flex — compact inline toggles */
.{brand}-demo-id-inner .{prefix}-sdk-config-fields.mod-sdk-config-fields {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem 0.85rem; }
.{brand}-demo-id-inner .aep-demo-web-push-row,
.{brand}-demo-id-inner .aep-bc-toggle-row,
.{brand}-demo-id-inner .aep-bc-launcher-row { flex: 0 0 auto; padding-top: 0; }
.{brand}-demo-id-inner .aep-demo-web-push-retry { flex: 0 0 auto; margin-top: 0; }
.{brand}-demo-id-inner .aep-demo-web-push-retry-hint,
.{brand}-demo-id-inner .aep-demo-web-push-hint { display: none; }
.{brand}-demo-id-inner .mod-sdk-summary--below-env-grid { width: 100%; margin-top: 0.35rem; }

/* 4. BC launcher visibility — hide unless body has .aep-bc-launcher-on */
.{brand}-demo-page:not(.aep-bc-launcher-on) #brand-concierge-mount-host,
.{brand}-demo-page:not(.aep-bc-launcher-on) .aep-bc-reopen-btn { display: none !important; }

/* 5. Branded Ask button colour */
.{brand}-demo-page .aep-bc-park-launcher { background: var(--brand-color); box-shadow: 0 4px 20px rgba(r,g,b,0.35); }
.{brand}-demo-page .aep-bc-park-launcher:hover { background: <darker-shade>; }

/* 6. Flyout sidebar — desktop */
@media (min-width: 769px) {
  body.{brand}-demo-page .dashboard-sidebar {
    position: fixed; left: 0; top: 0; bottom: 0; width: 238px; z-index: 7000;
    transform: translateX(-100%); transition: transform 0.2s ease, box-shadow 0.2s ease; box-shadow: none; }
  body.{brand}-demo-page--nav-open .dashboard-sidebar,
  body.{brand}-demo-page .dashboard-sidebar:focus-within {
    transform: translateX(0); box-shadow: 8px 0 32px rgba(15,23,42,0.14); }
}

/* 7. Mobile */
@media (max-width: 768px) {
  body.{brand}-demo-page .dashboard-sidebar { position: relative; left: auto; top: auto; bottom: auto; transform: none; z-index: auto; box-shadow: none; }
  body.{brand}-demo-page--nav-open .dashboard-sidebar { transform: none; }
}
/* Note: .aep-demo-id-inner mobile breakpoint (grid-template-columns: 1fr; padding: 0.6rem 12px)
   is already handled by aep-demo-env-bar.css — no need to repeat here. */
```

## JS wiring (`{brand}-demo.js`)

```javascript
// 1. Web push toggle (localStorage persist)
const {prefix}WebPushOnInjectToggle = document.getElementById('{prefix}WebPushOnInjectToggle');
// … localStorage restore + change listener …
function {prefix}WebPushOnInjectDesired() {
  return !!({prefix}WebPushOnInjectToggle && {prefix}WebPushOnInjectToggle.checked);
}

// 2. BC launcher visibility toggle
const {prefix}BcLauncherToggle = document.getElementById('{prefix}BcLauncherToggle');
const {prefix}BcLauncher = document.getElementById('{prefix}BcLauncher');
(function init{Prefix}BcLauncher() {
  const LAUNCHER_KEY = '{prefix}BcLauncherVisible';
  if (!{prefix}BcLauncherToggle) return;
  try { if (localStorage.getItem(LAUNCHER_KEY) === '1') {
    {prefix}BcLauncherToggle.checked = true; document.body.classList.add('aep-bc-launcher-on'); } } catch {}
  {prefix}BcLauncherToggle.addEventListener('change', function () {
    const on = {prefix}BcLauncherToggle.checked;
    document.body.classList.toggle('aep-bc-launcher-on', on);
    try { localStorage.setItem(LAUNCHER_KEY, on ? '1' : '0'); } catch {} });
  if ({prefix}BcLauncher) {
    {prefix}BcLauncher.addEventListener('click', function () {
      document.body.classList.remove('aep-bc-panel-dismissed'); }); }
})();

// 3. BC on-inject toggle
const {prefix}BcOnInjectToggle = document.getElementById('{prefix}BcOnInjectToggle');
const {prefix}BcStyleSelect = document.getElementById('{prefix}BcStyleSelect');
(function init{Prefix}BcToggle() {
  if (!{prefix}BcOnInjectToggle) return;
  const prefs = typeof AepBcToggle !== 'undefined'
    ? AepBcToggle.loadPrefs('{prefix}') : { enabled: false, styleKey: 'miral' };
  {prefix}BcOnInjectToggle.checked = !!prefs.enabled;
  if ({prefix}BcStyleSelect && prefs.styleKey) {prefix}BcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs('{prefix}', !!({prefix}BcOnInjectToggle && {prefix}BcOnInjectToggle.checked),
      {prefix}BcStyleSelect ? {prefix}BcStyleSelect.value : 'miral'); }
  {prefix}BcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if ({prefix}BcStyleSelect) {prefix}BcStyleSelect.addEventListener('change', saveBcPrefs);
})();

// 4. DemoTagsInjection — include webPush + brandConcierge
const {prefix}TagsInjection = typeof window.DemoTagsInjection !== 'undefined'
  ? window.DemoTagsInjection.init({
      storagePrefix: '{prefix}',
      identityEventType: '{prefix}.identity.stitch',
      messageSetter: set{Prefix}Message,
      infoEcidId: 'infoEcid',
      tagsCompanyId: '{prefix}TagsCompany',
      tagsPropertyInputId: '{prefix}TagsProperty',
      tagsPropertyListId: '{prefix}TagsPropertyList',
      tagsEnvironmentId: '{prefix}TagsEnvironment',
      injectButtonId: 'injectSdkBtn',
      selectedScriptId: '{prefix}SelectedScript',
      configFieldsId: '{prefix}SdkConfigFields',
      configSummaryId: '{prefix}SdkConfigSummary',
      configSummaryTextId: '{prefix}SdkConfigSummaryText',
      changeConfigButtonId: '{prefix}ChangeSdkConfigBtn',
      getSelectedGeneratorTarget: getSelectedGeneratorTarget,
      getEmail: () => (customerEmail && customerEmail.value) || '',
      iframeIds: [],
      webPush: {
        enabled: true,
        subscribeAfterInject: {prefix}WebPushOnInjectDesired,
        requestPermissionOnInject: {prefix}WebPushOnInjectDesired,
      },
      brandConcierge: {
        enabled: function () { return !!({prefix}BcOnInjectToggle && {prefix}BcOnInjectToggle.checked); },
        styleKey: function () { return {prefix}BcStyleSelect ? {prefix}BcStyleSelect.value : 'miral'; },
      },
    })
  : null;

// 5. Web push retry button
const {prefix}WebPushRetryBtn = document.getElementById('{prefix}WebPushRetryBtn');
if ({prefix}WebPushRetryBtn && typeof window.AepDemoWebPush !== 'undefined') {
  {prefix}WebPushRetryBtn.addEventListener('click', function () {
    void window.AepDemoWebPush.promptAndSubscribe({ storagePrefix: '{prefix}' }).then(function (ok) {
      set{Prefix}Message(ok ? 'Web push subscription sent.'
        : 'Web push did not complete. Allow notifications, ensure push is enabled on your datastream, and that Tags is injected on this page.',
        ok ? 'success' : 'error'); }); }); }

// 6. AepDemoEnvStrip
(function init{Prefix}SandboxAndEnvBar() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: '{prefix}SdkConfigSummary',
    fieldsId: '{prefix}SdkConfigFields',
    selectedScriptCodeId: '{prefix}SelectedScript',
  });
})();

// 7. DemoProfileDrawer
DemoProfileDrawer.init({
  emailInputId: 'customerEmail',
  profileOpenClass: '{brand}-demo-page--profile-open',
  viewName: '{Brand} demo',
  emailGetter: getEmail,
  messageSetter: set{Prefix}Message,
  getSelectedGeneratorTarget: getSelectedGeneratorTarget,
  fetchBrowserEcidOnInit: true,
});
```

## CSS

- Always include **`aep-demo-env-bar.css`** (provides `.aep-demo-id-inner` two-column grid utility).
- Always include **`brand-concierge-controls.css`** (positions `#brand-concierge-mount-host` fixed bottom-right and styles the dismiss ×).
- If the page does **not** load `home.css`, define `--dash-*` fallbacks on a local wrapper.

## Cache bust

Bump **`?v=YYYYMMDD-…`** on every `<link>` / `<script>` that references a changed asset.

## Verify + mirror

- `npm run verify:profile-viewer-routes`
- `npm run sync-profile-viewer-ui` when the Express mirror must match

## References in repo

- `web/profile-viewer/etihad-demo.html` + `etihad-demo.css` + `etihad-demo.js` — canonical reference implementation.
- `web/profile-viewer/aep-demo-env-bar.css` — `.aep-demo-id-inner` shared grid utility.
- `web/profile-viewer/brand-concierge-controls.css` / `brand-concierge-controls.js` — BC dismiss + reopen wiring.
- `web/profile-viewer/mod-demo.html`, `oldmutual-demo.html` — site-clone variants with custom token overrides.
