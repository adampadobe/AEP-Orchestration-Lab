# Call Centre Demo — Full Session Changes (Deploy Prompt)

All code changes are already made. This file documents what changed and how to deploy.

---

## Files changed

| File | What changed |
|---|---|
| `web/profile-viewer/call-center-demo-apalmer.js` | Profile load fix; inbound event; journey table; engagement chart; audience names |
| `web/profile-viewer/call-center-demo-apalmer.html` | Journey activity table; engagement chart canvas; Chart.js CDN; channel pills |
| `web/profile-viewer/call-center-demo.css` | Styles for all new components |
| `functions/eventGeneratorService.js` | `body.message` → `_demoemea.message` merge support |

---

## Fix 1 — Profile load was silently broken

**Root cause:** `window.AepProfileDrawer.loadProfileDataForDrawer()` returns a **boolean** (`true`/`false`), not `{ok, found}`. The old code checked `profileResult.ok && profileResult.found` — both are `undefined` on a boolean — so the entire success block never ran. Nothing populated.

**Fix:** Intercept the `onUserMessage` callback. The drawer fires `type='success'` with `"Profile found…"` when a real profile exists.

```js
// OLD (broken — profileResult.ok is undefined on a boolean)
profileResult = await window.AepProfileDrawer.loadProfileDataForDrawer(email, { onUserMessage: setStatus });
if (profileResult && profileResult.ok && profileResult.found) { ... }

// NEW (correct)
let drawerCallOk = false;
let profileFound = false;
drawerCallOk = await window.AepProfileDrawer.loadProfileDataForDrawer(email, {
  onUserMessage: (msg, type) => {
    setStatus(msg, type);
    if (type === 'success' && /profile found/i.test(msg)) profileFound = true;
  },
  addEmailOnSuccess: true,
});
if (drawerCallOk && profileFound) { /* mirror, fetch travel, fetch events */ }
```

---

## Fix 2 — Inbound event on profile load

Replaced `sendApplicationLoginExperienceEvent` (which sent `application.login`) with `sendCcInboundEvent` that sends the correct contact-centre event type based on the selected channel.

### New functions (call-center-demo-apalmer.js)

```js
function ccInboundEventType() {
  if (selectedChannel === 'email') return 'contactCentre.inbound.email';
  if (selectedChannel === 'mobile') return 'contactCentre.inbound.sms';
  return 'contactCentre.inbound.call';
}

function ccInboundChannelLabel() {
  if (selectedChannel === 'email') return 'Email';
  if (selectedChannel === 'mobile') return 'SMS';
  return 'Voice';
}

async function sendCcInboundEvent(email) {
  const target = getSelectedGeneratorTarget();
  const ecid = getEcidForExperienceEvent();
  const body = {
    targetId: target ? target.id : undefined,
    email: String(email || '').trim(),
    eventType: ccInboundEventType(),
    channel: 'cx',                                       // → _demoemea.interactionDetails.core.channel
    message: { channel: ccInboundChannelLabel().toLowerCase() }, // → _demoemea.message.channel
    viewName: 'Contact centre · inbound · ' + ccInboundChannelLabel(),
    viewUrl: window.location.href.split('?')[0],
  };
  if (ecid) body.ecid = ecid;
  const res = await fetch('/api/events/generator', { method: 'POST', ... });
}
```

### XDM shape sent to AEP

```json
{
  "eventType": "contactCentre.inbound.call",
  "_demoemea": {
    "interactionDetails": { "core": { "channel": "cx" } },
    "message": { "channel": "voice" },
    "identification": { "core": { "email": "...", "ecid": "..." } }
  },
  "identityMap": { "ECID": [{ "id": "...", "primary": true }], "Email": [{ "id": "..." }] }
}
```

### eventGeneratorService.js change

Added 4 lines after `mergeGeneratorInteractionDetailsChannel` to support `body.message → _demoemea.message`:

```js
if (body.message && typeof body.message === 'object' && !Array.isArray(body.message)) {
  if (!xdm._demoemea) xdm._demoemea = {};
  xdm._demoemea.message = { ...body.message };
}
```

---

## Feature 3 — "Customer details" tab: real data panels

### "Engagement signals" card (was: 3 hardcoded rows → now: real data + live chart)

- Consent, ECID, Audiences at top as compact `<dl>` (real values from profile drawer)
- Audiences shows first 3 real segment names (dot-separated) with `+N` overflow
- Event activity Chart.js **doughnut** (default) built from live `eventName` counts
- **Doughnut / Bar** toggle wired via `data-cc-chart-type` attribute; re-renders from `window._ccLastEvents`
- Toggle hidden until chart has data; chart section hidden until events load

### "Journey activity" section (was: activity feed bubbles → now: journey table)

Replaces the old "Recent activity" bubble list. Columns: **Journey name** (resolved async), **Touches** (proportional bar + count), **Last seen** (relative timestamp).

---

## Feature 4 — Data flow after profile load

```
queryProfileBtn click
  → loadProfileDataForDrawer()          (profile drawer — /api/profile/consent)
      onUserMessage sets profileFound=true when profile exists
  → mirrorProfileToAgentUi()            (hero bar: name, loyalty, channel)
  → mirrorAboutCardsFromDrawer()        (contact/profile cards + real audience names)
  → fetchAndRenderTravel(email)         → /api/profile/table → booking tab
  → fetchAndRenderCcEvents(email)       → /api/profile/events
      → renderCcRecentEvents()          → #ccEventsTableBody (Experience tab, last 10)
      → renderCcJourneyActivity()       → #ccJourneyTableBody (Experience tab journey section)
      → renderCcDetailsJourneyActivity()→ #ccDetailsJourneyBody (Customer details tab)
      → renderCcEventActivityChart()    → #ccEventActivityChart (Engagement signals card)
      → renderCcActivityFeed()          → feed bubbles (no longer used as main view)
  → sendCcInboundEvent(email)           → /api/events/generator
      eventType: contactCentre.inbound.call/email/sms
      channel: cx → _demoemea.interactionDetails.core.channel
      message.channel: voice/email/sms → _demoemea.message.channel
```

---

## Key HTML elements (call-center-demo-apalmer.html)

```html
<!-- Chart.js — must load before call-center-demo-apalmer.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>

<!-- Engagement signals card -->
<section class="cc-card cc-card--wide cc-card--engagement">
  <div class="cc-engagement-head">
    <h4 class="cc-card-title">Engagement signals</h4>
    <div class="cc-engagement-toggle" id="ccEngagementToggle" hidden>
      <button data-cc-chart-type="doughnut" class="cc-engagement-toggle-btn cc-engagement-toggle-btn--active">Doughnut</button>
      <button data-cc-chart-type="bar-v" class="cc-engagement-toggle-btn">Bar</button>
    </div>
  </div>
  <dl class="cc-engagement-dl">
    <div><dt>Consent</dt><dd id="ccSigMarket">—</dd></div>
    <div><dt>ECID</dt><dd id="ccSigEcid" class="cc-sig-ecid-val">—</dd></div>
    <div class="cc-engagement-dl-aud"><dt>Audiences</dt><dd id="ccSigAud">—</dd></div>
  </dl>
  <div id="ccEngagementChartSection" hidden>
    <canvas id="ccEventActivityChart"></canvas>
    <div id="ccEventActivityLegend" class="cc-engagement-legend"></div>
  </div>
  <p id="ccEngagementChartEmpty" class="cc-events-placeholder" hidden>No event data available.</p>
</section>

<!-- Journey activity section (replaces old Recent activity) -->
<section class="cc-details-journey-section">
  <div class="cc-details-journey-header">
    <h3 class="cc-activity-feed-title">Journey activity</h3>
    <span class="cc-journey-note" id="ccDetailsJourneyNote">Inferred from journey version IDs in experience events · last 365 days</span>
  </div>
  <p id="ccDetailsJourneyEmpty" class="cc-events-placeholder">Load a customer profile...</p>
  <div id="ccDetailsJourneyWrap" hidden>
    <table class="cc-transactions-table cc-journey-table cc-details-journey-table">
      <thead><tr><th>Journey</th><th>Touches</th><th>Last seen</th></tr></thead>
      <tbody id="ccDetailsJourneyBody"></tbody>
    </table>
  </div>
</section>
```

---

## Verification checklist

- [ ] `<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js">` loads before `call-center-demo-apalmer.js`
- [ ] `#ccDetailsJourneyBody` and `#ccDetailsJourneyWrap` (with `hidden`) exist in DOM
- [ ] `#ccEventActivityChart` canvas inside `#ccEngagementChartSection` (with `hidden`)
- [ ] `#ccEngagementToggle` has `hidden` attribute
- [ ] `#ccSigMarket`, `#ccSigEcid`, `#ccSigAud` exist in engagement card

### Manual smoke test

1. Open `https://aep-orchestration-lab.web.app/profile-viewer/call-center-demo-apalmer.html`
2. Select **Voice** channel (default), enter test email, click **Load profile**
3. Status → `"Profile loaded. Sent contactCentre.inbound.call to AEP"`
4. **Customer details tab:**
   - Contact details + Profile attributes populate from real profile
   - Engagement signals: consent, ECID, real audience names (e.g. `"Loyal Gold · High Value +2"`)
   - Event activity doughnut chart appears with colour legend
   - Doughnut / Bar toggle switches chart type
   - Journey activity table appears with real journey names resolving async
5. **Booking tab** → flight route card (if travel data in sandbox)
6. **Experience tab** → events table + journey section populate
7. Switch to **Email** channel, reload profile → event type becomes `contactCentre.inbound.email`
8. Agent name + accent colour from RTDB `StaffPortal.AgentName` / `StaffPortal.Colour`

---

## Deploy

```bash
# Commit all changed files
git add web/profile-viewer/call-center-demo-apalmer.html \
        web/profile-viewer/call-center-demo-apalmer.js \
        web/profile-viewer/call-center-demo.css \
        functions/eventGeneratorService.js

git commit -m "[apalmer] feat: call-centre AEP wiring, inbound events, journey + chart panels"
git push

# Functions changed — deploy both
npx -y firebase-tools@latest deploy --only functions,hosting
```

---

## Reference files

| File | Role |
|---|---|
| `web/profile-viewer/call-center-demo-apalmer.html` | Main HTML |
| `web/profile-viewer/call-center-demo-apalmer.js` | All JS (single IIFE) |
| `web/profile-viewer/call-center-demo.css` | All styles |
| `web/profile-viewer/aep-profile-drawer.js` | Returns `true`/`false` boolean — not `{ok,found}` |
| `web/profile-viewer/aep-global-sandbox.js` | `AepGlobalSandbox.getSandboxName()` / `getSandboxParam()` |
| `functions/eventGeneratorService.js` | XDM builder — `body.message` → `_demoemea.message` |
| `functions/index.js` | `/api/events/generator`, `/api/profile/events`, `/api/profile/table`, `/api/journey-name` |
