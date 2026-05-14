# Cursor Task: iPad Gate-Agent Portal — Etihad Demo

## What you are building

`web/profile-viewer/etihad-ipad.html` — a realistic Etihad Airways staff iPad app for gate agents and cabin crew. The app has two modes:

1. **Passenger lookup** — search by email, get AEP profile data across 5 tabs (Personal · Travel · Loyalty · Offers · Boarding), then assign a seat which fires an AEP streaming event
2. **Flight operations panel** — flight info, crew manifest, and staff broadcast buttons (prepare doors, final call, boarding complete) that each log AEP events

The visual style references the Etihad website aesthetic: dark teal/navy header (`#003C5F` or close), gold accents for premium tier, clean two-column card layout, colourful CTA buttons (teal, orange, purple). The screen **must scroll** — content is taller than the visible viewport and that is intentional.

**Do NOT use the Firebase SDK** on this page. RTDB reads use plain `fetch()` REST. Rules allow public reads on `/ajoLookups/{workspace}`.

---

## Files to create/edit

| # | Action | Path |
|---|---|---|
| 1 | CREATE | `web/profile-viewer/etihad-ipad.html` |
| 2 | CREATE | `web/profile-viewer/etihad-ipad.css` |
| 3 | CREATE | `web/profile-viewer/etihad-ipad.js` |
| 4 | CREATE | `functions/ipadEventProxy.js` |
| 5 | EDIT | `functions/index.js` — export `ipadEventProxy` |
| 6 | EDIT | `firebase.json` — add `/api/ipad/event` rewrite |
| 7 | EDIT | `web/profile-viewer/aep-lab-nav.js` — activate placeholder nav entry |

**Profile lookup (existing — no changes):** `profileTableProxy` at `/api/profile/table?identifier={email}&namespace=email&sandbox={sandbox}` — already handles IMS auth.

---

## Mandatory repo conventions

**Colours:** Every colour must use `var(--dash-*)` CSS custom properties. Allowed hardcoded hex:
- Bezel gradient stops (device hardware only) — use `color-mix()` built from `--dash-*` tokens
- Dynamic `StaffPortal.Colour` applied as inline style (JS only, never CSS)
- Tier badge colours (brand identity: Bronze `#cd7f32`, Silver `#9aa0aa`, Gold `#c9a227`, Platinum `#4a5568`)
- Offer card accent stripe colours (brand: teal `#009CA6`, gold `#C9A227`)

Key tokens: `--dash-bg`, `--dash-surface`, `--dash-surface-alt`, `--dash-border`, `--dash-text`, `--dash-text-secondary`, `--dash-muted`, `--dash-blue`, `--dash-input-bg`, `--dash-input-border`, `--dash-hover`, `--dash-shadow`, `--dash-radius` (16px), `--dash-radius-sm` (12px).

**Theme:** Controlled by `html[data-aep-theme="dark"]`. Never use `prefers-color-scheme`.

**Every page head must start with this IIFE** (before any `<link>`):
```html
<script>(function(){try{var d=document.documentElement;if(localStorage.getItem('aepTheme')==='dark')d.setAttribute('data-aep-theme','dark');if(localStorage.getItem('aepSidebarCollapsed')==='1')d.setAttribute('data-sidebar-collapsed','');}catch(e){}})();</script>
```

**Stylesheet load order** (`aep-theme.css` must be last):
```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="mobile-demo.css">
<link rel="stylesheet" href="etihad-ipad.css">
<link rel="stylesheet" href="home.css?v=YYYYMMDD">
<link rel="stylesheet" href="aep-theme.css?v=YYYYMMDD">
```

**Body class:** `<body class="etihad-ipad-page home-dashboard-concierge">`

**Dashboard shell** (copy structure from `web/profile-viewer/consent.html`):
```html
<div class="dashboard-shell">
  <aside class="dashboard-sidebar"></aside>
  <div class="dashboard-main-wrap">
    <header class="dashboard-topbar">…</header>
    <main class="dashboard-main"><!-- iPad stage --></main>
  </div>
</div>
```

**End of body:**
```html
<script src="firebase-database-config.js"></script>
<script src="etihad-ipad.js"></script>
<script src="aep-lab-nav.js" defer></script>
<script src="aep-theme.js" defer></script>
```

---

## iPad emulator — visual design (read this entire section)

This is the centrepiece of the page. The iPad frame must look like a real iPad Pro sitting on the desk, not a box with a grey border. The existing codebase already has a complete device-emulator system — reuse it exactly.

### Existing system to build on

**`mobile-demo.css`** already defines the iPad bezel class:
```css
/* Already in mobile-demo.css — DO NOT redefine */
.mobile-demo-bezel--ipad {
  border-radius: 36px;
  background: linear-gradient(145deg, #6b7280 0%, var(--mobile-demo-bezel) 40%, #0f1116 100%);
}
.mobile-demo-bezel--ipad::after {
  inset: 10px;
  border-radius: 28px;
}
.mobile-demo-bezel--ipad .mobile-demo-viewport {
  --mobile-demo-screen-radius: 18px;
  --mobile-demo-safe-top: 0;
  box-shadow: inset 0 0 0 2px #3f4450, inset 0 0 0 6px #0a0c10;
}
```

The `--mobile-demo-bezel` CSS custom property is what changes the mid-tone of the bezel gradient. Set it via inline style on the bezel element to change colour.

**`content-decision-channel-emulator.css`** already defines the dark/light bezel colour pattern using `color-mix()` — match this approach for the iPad colour presets.

### iPad Pro colour presets

Provide a colour-picker row with 4 iPad Pro colour options (matching Apple's current lineup). Each sets `--mobile-demo-bezel` and adjusts the gradient to the correct tone:

| Label | `--mobile-demo-bezel` | Gradient highlight | CSS class modifier |
|---|---|---|---|
| Space Black | `#1a1d24` | dark charcoal | `ipad-bezel--space-black` |
| Silver | `#b0b5bf` | bright silver | `ipad-bezel--silver` |
| Natural Titanium | `#8a8680` | warm sand | `ipad-bezel--natural-titanium` |
| Blue Titanium | `#4f6372` | cool slate | `ipad-bezel--blue-titanium` |

In `etihad-ipad.css`, each modifier overrides the bezel background gradient:
```css
/* Space Black (default) */
.mobile-demo-bezel--ipad.ipad-bezel--space-black {
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dash-text) 35%, var(--dash-border)) 0%,
    #1a1d24 40%,
    #0a0c10 100%
  );
}

/* Silver */
.mobile-demo-bezel--ipad.ipad-bezel--silver {
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dash-text) 8%, var(--dash-surface)) 0%,
    #b0b5bf 40%,
    #8a8e96 100%
  );
}
.mobile-demo-bezel--ipad.ipad-bezel--silver .mobile-demo-viewport {
  box-shadow: inset 0 0 0 2px #9aa0aa, inset 0 0 0 6px #c8cbd0;
}

/* Natural Titanium */
.mobile-demo-bezel--ipad.ipad-bezel--natural-titanium {
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dash-text) 12%, #9e9690) 0%,
    #8a8680 40%,
    #6e6a66 100%
  );
}
.mobile-demo-bezel--ipad.ipad-bezel--natural-titanium .mobile-demo-viewport {
  box-shadow: inset 0 0 0 2px #9a9590, inset 0 0 0 6px #7a7672;
}

/* Blue Titanium */
.mobile-demo-bezel--ipad.ipad-bezel--blue-titanium {
  background: linear-gradient(145deg,
    color-mix(in srgb, var(--dash-blue) 22%, var(--dash-text)) 0%,
    #4f6372 40%,
    #38505e 100%
  );
}
.mobile-demo-bezel--ipad.ipad-bezel--blue-titanium .mobile-demo-viewport {
  box-shadow: inset 0 0 0 2px #5a7282, inset 0 0 0 6px #3a5060;
}
```

### iPad size options

Two sizes, selectable via a toggle above the frame:

| Model | Viewport (CSS px) | Frame outer size | Scale to fit |
|---|---|---|---|
| iPad Pro 11" | 834 × 1194 | 870 × 1242 | 0.75 on ≤1400px screens |
| iPad Pro 13" | 1024 × 1366 | 1062 × 1416 | 0.65 on ≤1400px screens |

Use `transform: scale(var(--ipad-scale, 0.75))` on the bezel wrapper with `transform-origin: top center` to fit the frame inside the dashboard viewport without scrolling. Drive `--ipad-scale` from JS based on viewport width and selected model.

### Physical hardware chrome

Add all of these to make it look like a real iPad — they are decorative HTML elements positioned absolute on the bezel:

**1. Face ID pill (top centre, inside the screen)**
```html
<div class="ipad-faceid-pill" aria-hidden="true"></div>
```
```css
.ipad-faceid-pill {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #0a0c10;
  border: 1.5px solid rgba(255,255,255,0.08);
  z-index: 4;
}
```

**2. Volume buttons (left side of bezel, outside the screen)**
```html
<div class="ipad-hw-btns ipad-hw-btns--left" aria-hidden="true">
  <div class="ipad-hw-btn ipad-hw-btn--vol-up"></div>
  <div class="ipad-hw-btn ipad-hw-btn--vol-down"></div>
</div>
```
```css
.ipad-hw-btns--left {
  position: absolute;
  left: -4px;
  top: 180px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ipad-hw-btn {
  width: 4px;
  height: 38px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%);
  box-shadow: -1px 0 2px rgba(0,0,0,0.5);
}
```

**3. Power / top button (right side, upper)**
```html
<div class="ipad-hw-btns ipad-hw-btns--right" aria-hidden="true">
  <div class="ipad-hw-btn ipad-hw-btn--power"></div>
</div>
```
```css
.ipad-hw-btns--right {
  position: absolute;
  right: -4px;
  top: 120px;
}
.ipad-hw-btn--power {
  width: 4px;
  height: 52px;
  border-radius: 2px;
  background: linear-gradient(270deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%);
  box-shadow: 1px 0 2px rgba(0,0,0,0.5);
}
```

**4. Smart Connector (bottom, 3 dots)**
```html
<div class="ipad-smart-connector" aria-hidden="true">
  <span></span><span></span><span></span>
</div>
```
```css
.ipad-smart-connector {
  position: absolute;
  bottom: 18px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
}
.ipad-smart-connector span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.6);
}
```

**5. Speaker grilles (top and bottom, flanking centre)**
```html
<!-- top speakers -->
<div class="ipad-speakers ipad-speakers--top" aria-hidden="true">
  <div class="ipad-speaker-grille"></div>
  <div class="ipad-speaker-grille"></div>
</div>
<!-- bottom speakers -->
<div class="ipad-speakers ipad-speakers--bottom" aria-hidden="true">
  <div class="ipad-speaker-grille"></div>
  <div class="ipad-speaker-grille"></div>
</div>
```
```css
.ipad-speakers { position: absolute; left: 50%; transform: translateX(-50%); display: flex; gap: 180px; }
.ipad-speakers--top { top: 10px; }
.ipad-speakers--bottom { bottom: 10px; }
.ipad-speaker-grille {
  width: 28px; height: 8px;
  border-radius: 4px;
  background: repeating-linear-gradient(
    90deg,
    rgba(0,0,0,0.6) 0px,
    rgba(0,0,0,0.6) 2px,
    rgba(255,255,255,0.08) 2px,
    rgba(255,255,255,0.08) 4px
  );
}
```

**6. Apple Pencil magnetic area (right edge, subtle)**
```html
<div class="ipad-pencil-rail" aria-hidden="true"></div>
```
```css
.ipad-pencil-rail {
  position: absolute;
  right: 6px;
  top: 30%;
  width: 3px;
  height: 22%;
  border-radius: 2px;
  background: linear-gradient(180deg,
    rgba(255,255,255,0.06) 0%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0.06) 100%
  );
}
```

### iOS status bar (inside the screen, top of viewport)

Render a real iOS-style status bar at the very top of the viewport, inside the screen content area:

```html
<div class="ipad-ios-status" aria-hidden="true">
  <span class="ipad-ios-time" id="ipadStatusTime">09:41</span>
  <div class="ipad-ios-faceid">
    <div class="ipad-ios-camera"></div>
  </div>
  <div class="ipad-ios-indicators">
    <div class="ipad-ios-signal">
      <span style="height:35%"></span>
      <span style="height:55%"></span>
      <span style="height:75%"></span>
      <span style="height:100%"></span>
    </div>
    <svg class="ipad-ios-wifi" width="16" height="12" viewBox="0 0 16 12" fill="none">
      <path d="M8 10.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-3.2-3.2A4.5 4.5 0 0 1 8 6a4.5 4.5 0 0 1 3.2 1.3l1-1A6 6 0 0 0 8 4.5a6 6 0 0 0-4.2 1.8l1 1zm-2-2A7.5 7.5 0 0 1 8 3a7.5 7.5 0 0 1 5.2 2.3l1-1A9 9 0 0 0 8 1.5 9 9 0 0 0 1.8 4.3l1 1z" fill="currentColor"/>
    </svg>
    <div class="ipad-ios-battery">
      <div class="ipad-ios-battery-fill" style="width:87%"></div>
      <div class="ipad-ios-battery-tip"></div>
    </div>
  </div>
</div>
```

```css
.ipad-ios-status { display: flex; align-items: center; justify-content: space-between; height: 50px; padding: 0 20px; background: var(--dash-bg); position: relative; flex-shrink: 0; }
.ipad-ios-time { font-size: 15px; font-weight: 600; color: var(--dash-text); min-width: 3.5rem; font-variant-numeric: tabular-nums; }
.ipad-ios-faceid { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 12px; height: 12px; border-radius: 50%; background: color-mix(in srgb, var(--dash-bg) 60%, var(--dash-muted)); border: 1.5px solid color-mix(in srgb, var(--dash-border) 60%, transparent); }
.ipad-ios-indicators { display: flex; align-items: center; gap: 8px; color: var(--dash-text); }
.ipad-ios-signal { display: flex; align-items: flex-end; gap: 2px; height: 11px; }
.ipad-ios-signal span { width: 3px; border-radius: 1px; background: var(--dash-text); }
.ipad-ios-wifi { color: var(--dash-text); }
.ipad-ios-battery { position: relative; width: 26px; height: 13px; border: 1.5px solid var(--dash-text); border-radius: 3px; overflow: visible; }
.ipad-ios-battery-fill { height: 100%; background: var(--dash-text); border-radius: 1.5px; }
.ipad-ios-battery-tip { position: absolute; right: -4px; top: 50%; transform: translateY(-50%); width: 3px; height: 7px; background: var(--dash-text); border-radius: 0 2px 2px 0; }
```

Update the clock in JS: `setInterval(() => { document.getElementById('ipadStatusTime').textContent = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'}); }, 1000);`

### iOS home indicator (bottom of screen)

```html
<div class="ipad-home-indicator" aria-hidden="true"></div>
```
```css
.ipad-home-indicator { height: 24px; display: flex; align-items: center; justify-content: center; background: var(--dash-bg); flex-shrink: 0; }
.ipad-home-indicator::after { content: ''; display: block; width: 130px; height: 5px; border-radius: 3px; background: var(--dash-text); opacity: 0.2; }
```

### Controls toolbar (outside the frame, above it)

```html
<div class="ipad-controls-bar">
  <div class="ipad-ctrl-group" role="group" aria-label="iPad model">
    <button class="ipad-ctrl-btn ipad-ctrl-btn--active" data-ipad-size="11">iPad Pro 11″</button>
    <button class="ipad-ctrl-btn" data-ipad-size="13">iPad Pro 13″</button>
  </div>
  <div class="ipad-ctrl-group ipad-colour-picker" role="radiogroup" aria-label="Bezel colour">
    <button class="ipad-colour-swatch ipad-colour-swatch--active" data-ipad-colour="space-black" aria-label="Space Black" aria-checked="true" role="radio" style="background:#1a1d24"></button>
    <button class="ipad-colour-swatch" data-ipad-colour="silver" aria-label="Silver" role="radio" style="background:#b0b5bf"></button>
    <button class="ipad-colour-swatch" data-ipad-colour="natural-titanium" aria-label="Natural Titanium" role="radio" style="background:#8a8680"></button>
    <button class="ipad-colour-swatch" data-ipad-colour="blue-titanium" aria-label="Blue Titanium" role="radio" style="background:#4f6372"></button>
  </div>
  <button class="ipad-ctrl-btn ipad-orient-btn" id="btnOrientation" title="Toggle orientation"><span id="orientIcon">⬜</span></button>
  <span class="ipad-sandbox-label">Sandbox: <strong id="ipadSandboxLabel">apalmer</strong></span>
</div>
```

```css
.ipad-controls-bar { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
.ipad-ctrl-group { display: flex; gap: 4px; background: var(--dash-surface-alt); padding: 3px; border-radius: var(--dash-radius-sm); border: 1px solid var(--dash-border); }
.ipad-ctrl-btn { padding: 4px 12px; font-size: 12px; border: none; background: transparent; color: var(--dash-text-secondary); border-radius: 8px; cursor: pointer; }
.ipad-ctrl-btn--active { background: var(--dash-surface); color: var(--dash-text); box-shadow: 0 1px 3px var(--dash-shadow); }
.ipad-colour-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: border-color 0.15s; }
.ipad-colour-swatch--active, .ipad-colour-swatch:focus-visible { border-color: var(--dash-blue); outline: none; }
.ipad-sandbox-label { font-size: 12px; color: var(--dash-text-secondary); margin-left: auto; }
.ipad-orient-btn { padding: 4px 10px; font-size: 16px; line-height: 1; }
```

### Screen stack CSS

```css
.ipad-stage { display: flex; flex-direction: column; align-items: center; padding: 24px 16px 48px; }
.ipad-bezel-scaler { transform: scale(var(--ipad-scale, 0.75)); transform-origin: top center; }
.ipad-bezel-scaler-wrap { width: 870px; height: calc(1242px * var(--ipad-scale, 0.75)); display: flex; justify-content: center; }

/* Screen content stack — MUST scroll, not overflow:hidden */
.ipad-screen-stack {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dash-bg);
  overflow-y: auto;   /* ← scroll enabled */
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}
```

---

## Data sources

### Source 1 — Firebase Realtime Database (plain fetch, no SDK)

```js
const rtdbBase = (window.firebaseDatabaseConfig || {}).databaseURL
  || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
const sandbox = new URLSearchParams(location.search).get('sandbox') || 'apalmer';

const rtdbData = await fetch(`${rtdbBase}/ajoLookups/${encodeURIComponent(sandbox)}.json`)
  .then(r => r.json()).catch(() => ({}));
```

**Nodes used from `/ajoLookups/{sandbox}`:**

| Node | Fields used |
|---|---|
| `StaffPortal` | `AgentName`, `AgentID`, `AgentType`, `FlightTerminalInfo`, `Colour` (hex, no `#`) |
| `CoreDemoData` | `name` / `airlineName` (app header) |
| `TravelData` | `bookingRef`, `flightNumber`, `origin`, `destination`, `departureDate`, `seatNumber`, `seatPreference`, `mealPreference`, `baggageAllowance`, `checkInStatus`, `gateNumber`, `boardingTime`, `flightClass`, `numberOfPassengers` |
| `CustomerLoyalty` | `tier`, `miles`, `balance`, `memberSince`, `nextTier`, `milesNeeded`, `programName` |
| `Mobile` | `captainName`, `coPilotName`, `aircraftType`, `departureCountdown`, `crewManifest` (array of `{name, role}`) |

### Source 2 — AEP profile lookup (existing, no changes)

```
GET /api/profile/table?identifier={email}&namespace=email&sandbox={sandbox}
```

Key `rows[].attribute` values used:

```
person.name.firstName / lastName / gender / birthDate / nationality
personalEmail.address
mobilePhone.number
homeAddress.street1 / city / postalCode / country
preferredLanguage
profilePictureLink
travelPreferences.seat / meal
_demoemea.loyaltyDetails.level          → loyalty tier
_demoemea.loyaltyDetails.points         → miles balance
_demoemea.identification.core.loyaltyId → member ID
_demoemea.travelReservations.flightReservations.flightNumber
_demoemea.travelReservations.flightReservations.flightClass
_demoemea.travelReservations.flightReservations.flightDate
_demoemea.travelReservations.flightReservations.confirmationNumber
_demoemea.travelReservations.flightReservations.numberofPassengers
_demoemea.travelReservations.flightReservations.departureAirportCode
_demoemea.travelReservations.flightReservations.arrivalAirportCode
_demoemea.travelReservations.flightReservations.multiLeg.layoverAirportCode_1
_demoemea.scoring.churn.churnPrediction
_demoemea.scoring.core.propensityScore
_demoemea.scoring.npsScore
_demoemea.scoring.travel.propensityForSeatUpgrade
_demoemea.orderProfile.lifetimeValue
_demoemea.orderProfile.ordersYTD
```

Row value helper:
```js
function rowVal(rows, path) {
  if (!rows) return '';
  const r = rows.find(r => r.attribute === path
    || (r.attribute || '').endsWith('.' + path.split('.').pop()));
  return r ? (r.value ?? '') : '';
}
```

### Source 3 — AEP event streaming (new Cloud Function)

```
POST /api/ipad/event
Body: { sandbox, email, eventType, payload }
```

Used to send `flight.staff.*` events when a staff action occurs.

---

## Cloud Function — `functions/ipadEventProxy.js`

Create this file. Follow the existing pattern from `functions/index.js`:

```js
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const fetch = require('node-fetch');

const IMS_CLIENT_ID     = defineSecret('ADOBE_CLIENT_ID');
const IMS_CLIENT_SECRET = defineSecret('ADOBE_CLIENT_SECRET');
const IMS_ORG_ID        = defineSecret('ADOBE_ORG_ID');
const IMS_SANDBOX       = defineSecret('ADOBE_SANDBOX_NAME');

// Reuse the existing aepHeaders() helper by importing it from imsService
// (or duplicate the minimal version below if imsService is not importable)
async function getImsToken(clientId, clientSecret) {
  const res = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'AdobeID,openid,aep.core.ingest,aep.core.profile',
    }),
  });
  const json = await res.json();
  return json.access_token;
}

exports.ipadEventProxy = onRequest({
  region: 'us-central1',
  secrets: [IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_ORG_ID, IMS_SANDBOX],
  invoker: 'public',
}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST')    { res.status(405).json({ error: 'POST only' }); return; }

  const { sandbox, email, eventType, payload } = req.body || {};
  if (!email || !eventType) {
    res.status(400).json({ error: 'email and eventType required' });
    return;
  }

  try {
    const clientId     = IMS_CLIENT_ID.value();
    const clientSecret = IMS_CLIENT_SECRET.value();
    const orgId        = IMS_ORG_ID.value();
    const sbx          = sandbox || IMS_SANDBOX.value() || 'prod';
    const token        = await getImsToken(clientId, clientSecret);

    // Try AEP streaming ingest — gracefully degrade if inlet not configured
    const inletId = process.env.AEP_INLET_ID;
    if (inletId) {
      const event = {
        header: {
          schemaRef: { contentType: 'application/vnd.adobe.xed-full+json;version=1' },
          imsOrgId: orgId,
          source: { name: 'Etihad iPad Gate Agent' },
          datasetId: process.env.AEP_EVENTS_DATASET_ID || '',
        },
        body: {
          xdmMeta: { schemaRef: { contentType: 'application/vnd.adobe.xed-full+json;version=1' } },
          xdmEntity: {
            identityMap: { email: [{ id: email, primary: true, authenticatedState: 'ambiguous' }] },
            eventType,
            timestamp: new Date().toISOString(),
            _demoemea: payload || {},
          },
        },
      };
      await fetch(`https://dcs.adobedc.net/collection/${inletId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-api-key': clientId,
          'x-gw-ims-org-id': orgId,
          'x-sandbox-name': sbx,
        },
        body: JSON.stringify(event),
      });
    }

    // Always write to RTDB as event log (visible in Firebase console)
    const { initializeApp, getApps } = require('firebase-admin/app');
    const { getDatabase } = require('firebase-admin/database');
    if (!getApps().length) initializeApp();
    const db  = getDatabase();
    const key = Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    await db.ref(`ipadEvents/${sbx}/${key}`).set({
      email, eventType, payload: payload || {}, ts: new Date().toISOString(),
    });

    res.json({ ok: true, eventType, logged: true });
  } catch (err) {
    console.error('[ipadEventProxy]', err);
    res.status(500).json({ error: err.message });
  }
});
```

**In `functions/index.js`** — add near the other exports (follow the existing pattern, do not change anything else):
```js
const { ipadEventProxy } = require('./ipadEventProxy');
exports.ipadEventProxy = ipadEventProxy;
```

**In `firebase.json`** — add inside the `"rewrites"` array:
```json
{ "source": "/api/ipad/event", "function": "ipadEventProxy", "region": "us-central1" }
```

---

## App screen layout (inside `.ipad-screen-stack`)

The full screen content, top to bottom. Everything below the iOS status bar scrolls as one long page — do **not** use `overflow: hidden` anywhere inside `.ipad-screen-stack`.

```
┌─ iOS Status Bar (fixed height, no scroll) ───────────────────┐
│
├─ App Header (Etihad gradient from StaffPortal.Colour) ───────┤
│  Airline name  |  Active flight pill  |  Agent badge
│
├─ Flight Status Strip ────────────────────────────────────────┤
│  ✈️ EY101  ·  LHR → AUH  ·  Dep 14:35  ·  🟢 Boarding  ·  [Flight Info ▾]
│
├─ Search bar ─────────────────────────────────────────────────┤
│  [email input]  [Search]
│  Staff View ⬭ Data View
│
│  ── after lookup: scrollable content below ──
│
├─ Profile Header ─────────────────────────────────────────────┤
│  Avatar  |  Full name  |  Loyalty ID  |  Tier badge
│
├─ Tab bar (sticky within scroll) ─────────────────────────────┤
│  Personal  |  Travel  |  Loyalty  |  Offers  |  Boarding
│
├─ Tab content (two-column card layout) ───────────────────────┤
│  [Card 1]         [Card 2]
│
├─ Action bar ─────────────────────────────────────────────────┤
│  [🛂 Process Boarding]  [⬆️ Offer Upgrade]  [🧳 Manage Baggage]
│
├─ Flight Operations Panel (always visible, below actions) ────┤
│  [Flight card]  [Crew card]  Staff Broadcast buttons
│
└─ iOS Home Indicator ─────────────────────────────────────────┘
```

### App header

```html
<div class="ga-app-header" id="gaAppHeader">
  <div class="ga-header-left">
    <div class="ga-header-logo">✈</div>
    <div>
      <div class="ga-airline-name" id="gaAirlineName">Etihad Airways</div>
      <div class="ga-header-sub">Staff Portal</div>
    </div>
  </div>
  <div class="ga-active-flight-pill" id="gaActiveFlightPill" hidden>
    <span id="gaActiveFlightText">—</span>
  </div>
  <div class="ga-agent-badge">
    <div class="ga-agent-accent" id="gaAgentAccent"></div>
    <div>
      <div class="ga-agent-name" id="gaAgentName">—</div>
      <div class="ga-agent-meta" id="gaAgentMeta">—</div>
    </div>
  </div>
</div>
```

Header gradient and agent accent are driven by `StaffPortal.Colour` in JS:
```js
function adjustColorBrightness(hex, pct) {
  const n = parseInt(hex.replace('#',''), 16);
  const c = v => Math.min(255, Math.max(0, v + pct));
  return '#' + ((1<<24)|(c(n>>16)<<16)|(c((n>>8)&0xFF)<<8)|c(n&0xFF)).toString(16).slice(1);
}
// applied as inline style — the ONLY allowed dynamic hex:
header.style.background = `linear-gradient(135deg, #${colour} 0%, ${adjustColorBrightness('#'+colour,-40)} 100%)`;
accent.style.cssText    = `width:4px;height:32px;border-radius:2px;background:#${colour}`;
```

### Flight status strip

Reads from RTDB `TravelData` + `Mobile`:

```html
<div class="ga-flight-strip" id="gaFlightStrip">
  <span class="ga-flight-strip-icon">✈️</span>
  <span id="gaFlightStripFlight">—</span>
  <span class="ga-flight-strip-sep">·</span>
  <span id="gaFlightStripRoute">—</span>
  <span class="ga-flight-strip-sep">·</span>
  <span id="gaFlightStripDep">—</span>
  <span class="ga-flight-strip-sep">·</span>
  <span class="ga-flight-status-dot"></span>
  <span id="gaFlightStripStatus">Boarding</span>
  <button class="ga-flight-info-btn" id="btnFlightInfoToggle">Flight Info ▾</button>
</div>
```

### Flight info panel (collapsible, toggled by "Flight Info ▾")

```html
<div class="ga-flight-info-panel" id="gaFlightInfoPanel" hidden>
  <div class="ga-two-col">
    <!-- Flight details card -->
    <div class="ga-card">
      <div class="ga-card-title">✈️ Flight Details</div>
      <dl class="ga-dl">
        <dt>Flight</dt>        <dd id="gafiFlight">—</dd>
        <dt>Aircraft</dt>      <dd id="gafiAircraft">A380-800</dd>
        <dt>Route</dt>         <dd id="gafiRoute">—</dd>
        <dt>Departure</dt>     <dd id="gafiDep">—</dd>
        <dt>Gate</dt>          <dd id="gafiGate">—</dd>
        <dt>T-minus</dt>       <dd id="gafiCountdown">—</dd>
        <dt>Pax on board</dt>  <dd id="gafiPaxCount">—</dd>
      </dl>
    </div>
    <!-- Crew card -->
    <div class="ga-card">
      <div class="ga-card-title">👨‍✈️ Crew</div>
      <dl class="ga-dl">
        <dt>Captain</dt>   <dd id="gafiCaptain">—</dd>
        <dt>Co-pilot</dt>  <dd id="gafiCoPilot">—</dd>
      </dl>
      <div class="ga-crew-manifest" id="gaCrewManifest"><!-- rendered by JS --></div>
    </div>
  </div>
  <!-- Staff broadcast -->
  <div class="ga-broadcast-section">
    <div class="ga-card-title">📡 Staff Broadcast</div>
    <div class="ga-broadcast-btns">
      <button class="ga-broadcast-btn" data-event="flight.staff.boarding.open">🛂 Open Boarding Gates</button>
      <button class="ga-broadcast-btn" data-event="flight.staff.boarding.final_call">📣 Final Call</button>
      <button class="ga-broadcast-btn" data-event="flight.staff.doors.prepare">🚪 Prepare Doors</button>
      <button class="ga-broadcast-btn" data-event="flight.staff.boarding.complete">✅ Boarding Complete</button>
    </div>
  </div>
</div>
```

Each broadcast button calls `sendEvent(eventType)` which POSTs to `/api/ipad/event` with `{ sandbox, email: currentPassengerEmail || 'broadcast', eventType, payload: { flightNumber, agentId, ts } }`.

### Search bar + view toggle

```html
<div class="ga-search-bar">
  <form class="ga-search-form" id="gaSearchForm">
    <input class="ga-search-input" id="gaSearchInput" type="text"
           placeholder="Passenger email or loyalty ID" autocomplete="off" />
    <button class="ga-search-btn" type="submit">Search</button>
  </form>
  <p class="ga-search-error" id="gaSearchError" hidden></p>
</div>
<div class="ga-view-toggle" id="gaViewToggle" hidden>
  <button class="ga-view-btn ga-view-btn--active" data-view="staff">👤 Staff View</button>
  <button class="ga-view-btn" data-view="data">📊 Data View</button>
</div>
```

### Profile header (shown after lookup)

```html
<div class="ga-profile-header" id="gaProfileHeader" hidden>
  <div class="ga-profile-photo-wrap">
    <img class="ga-profile-photo" id="gaProfilePhoto" src="" alt="" style="display:none" />
    <span class="ga-profile-gender-icon" id="gaGenderIcon">👤</span>
  </div>
  <div class="ga-profile-name-block">
    <div class="ga-profile-full-name" id="gaProfileFullName">—</div>
    <div class="ga-profile-loyalty-id" id="gaProfileLoyaltyId">—</div>
    <span class="ga-loyalty-tier-badge" id="gaLoyaltyTierBadge">Member</span>
  </div>
</div>
```

Show profile photo if `profilePictureLink` is set. On error/absent fall back to gender icon: `male`→`👨`, `female`→`👩`, else→`👤`.

Tier badge modifier classes (hardcoded brand colours allowed):
```css
.ga-loyalty-tier-badge.tier-bronze   { background: #cd7f32; color:#fff; }
.ga-loyalty-tier-badge.tier-silver   { background: #9aa0aa; color:#fff; }
.ga-loyalty-tier-badge.tier-gold     { background: #c9a227; color:#fff; }
.ga-loyalty-tier-badge.tier-platinum { background: #4a5568; color:#e2e8f0; }
```

### Tab bar (5 tabs)

```html
<div class="ga-tabs" id="gaTabs" hidden>
  <button class="ga-tab ga-tab--active" data-tab="personal">Personal</button>
  <button class="ga-tab" data-tab="travel">Travel</button>
  <button class="ga-tab" data-tab="loyalty">Loyalty</button>
  <button class="ga-tab" data-tab="offers">Offers</button>
  <button class="ga-tab" data-tab="boarding">Boarding</button>
</div>
```

---

## Tab content

### Tab: Personal — two cards side by side

```html
<div class="ga-tab-panel ga-tab-panel--active" id="tabPersonal">
  <div class="ga-two-col">
    <div class="ga-card">
      <div class="ga-card-title">👤 Personal Information</div>
      <dl class="ga-dl">
        <dt>Full Name</dt>   <dd id="gaFullName">—</dd>
        <dt>Gender</dt>      <dd id="gaGender">—</dd>
        <dt>Date of Birth</dt><dd id="gaDOB">Not available</dd>
        <dt>Age</dt>         <dd id="gaAge">—</dd>
        <dt>Nationality</dt> <dd id="gaNationality">—</dd>
      </dl>
    </div>
    <div class="ga-card">
      <div class="ga-card-title">📞 Contact Details</div>
      <dl class="ga-dl">
        <dt>Email</dt>             <dd id="gaEmail">—</dd>
        <dt>Phone</dt>             <dd id="gaPhone">—</dd>
        <dt>Address</dt>           <dd id="gaAddress">—</dd>
        <dt>Preferred Language</dt><dd id="gaLanguage">—</dd>
      </dl>
    </div>
  </div>
</div>
```

Age calculation: if `person.birthDate` is available, calculate `Math.floor((Date.now() - new Date(dob)) / 31557600000)` years.

### Tab: Travel — two cards side by side

```html
<div class="ga-tab-panel" id="tabTravel" hidden>
  <div class="ga-two-col">
    <div class="ga-card">
      <div class="ga-card-title">✈️ Current Booking</div>
      <dl class="ga-dl">
        <dt>Flight</dt>       <dd id="gaFlight">—</dd>
        <dt>Route</dt>        <dd id="gaRoute">—</dd>
        <dt>Class</dt>        <dd id="gaFlightClass">—</dd>
        <dt>Date</dt>         <dd id="gaFlightDate">Not available</dd>
        <dt>Passengers</dt>   <dd id="gaPassengers">—</dd>
        <dt>Confirmation</dt> <dd id="gaBookingRef">—</dd>
        <dt>Seat</dt>         <dd id="gaSeat">—</dd>
        <dt>Gate</dt>         <dd id="gaGate">—</dd>
        <dt>Boarding</dt>     <dd id="gaBoardingTime">—</dd>
        <dt>Baggage</dt>      <dd id="gaBaggage">—</dd>
        <dt>Check-in</dt>     <dd id="gaCheckIn">—</dd>
      </dl>
    </div>
    <div class="ga-card">
      <div class="ga-card-title">🎒 Travel Preferences</div>
      <dl class="ga-dl">
        <dt>Seat</dt>             <dd id="gaSeatPref">—</dd>
        <dt>Meal</dt>             <dd id="gaMealPref">—</dd>
        <dt>Special Requests</dt> <dd id="gaSpecialReqs">None</dd>
      </dl>
    </div>
  </div>
</div>
```

Route display: prefer RTDB `origin`/`destination`; fall back to AEP `departureAirportCode` → `arrivalAirportCode`. If `multiLeg.layoverAirportCode_1` is set, show `LHR → MXP → AUH`.

### Tab: Loyalty — two cards side by side

```html
<div class="ga-tab-panel" id="tabLoyalty" hidden>
  <div class="ga-two-col">
    <div class="ga-card">
      <div class="ga-card-title">🏆 Loyalty Status</div>
      <dl class="ga-dl">
        <dt>Program</dt>       <dd id="gaLoyaltyProgram">—</dd>
        <dt>Tier</dt>          <dd><span class="ga-loyalty-tier-badge ga-tier-inline" id="gaLoyaltyTierInline">—</span></dd>
        <dt>Member ID</dt>     <dd id="gaLoyaltyID">—</dd>
        <dt>Miles Balance</dt> <dd id="gaMiles">—</dd>
        <dt>Member Since</dt>  <dd id="gaMemberSince">—</dd>
        <dt>Next Tier</dt>     <dd id="gaNextTier">—</dd>
        <dt>Miles Needed</dt>  <dd id="gaMilesNeeded">—</dd>
      </dl>
    </div>
    <div class="ga-card">
      <div class="ga-card-title">📈 Travel Statistics</div>
      <dl class="ga-dl">
        <dt>Flights This Year</dt><dd id="gaOrdersYTD">—</dd>
        <dt>Lifetime Value</dt>   <dd id="gaLTV">—</dd>
        <dt>NPS Score</dt>        <dd id="gaNPS">—</dd>
        <dt>Churn Risk</dt>       <dd id="gaChurn">—</dd>
        <dt>Upgrade Propensity</dt><dd id="gaUpgrade">—</dd>
      </dl>
    </div>
  </div>
</div>
```

### Tab: Preferences — two cards side by side

```html
<div class="ga-tab-panel" id="tabPreferences" hidden>
  <div class="ga-two-col">
    <div class="ga-card">
      <div class="ga-card-title">🎯 AI Insights</div>
      <dl class="ga-dl">
        <dt>Churn Risk</dt>          <dd id="gaChurnPref" class="ga-score-text">—</dd>
        <dt>Propensity Score</dt>    <dd id="gaPropensityPref" class="ga-score-text">—</dd>
        <dt>NPS Score</dt>           <dd id="gaNPSPref" class="ga-score-text">—</dd>
        <dt>Upgrade Propensity</dt>  <dd id="gaUpgradePref" class="ga-score-text">—</dd>
      </dl>
    </div>
    <div class="ga-card">
      <div class="ga-card-title">📧 Communication</div>
      <dl class="ga-dl">
        <dt>Email Marketing</dt>     <dd class="ga-optin ga-optin--yes">✓ Opted In</dd>
        <dt>SMS Notifications</dt>   <dd class="ga-optin ga-optin--yes">✓ Opted In</dd>
        <dt>Push Notifications</dt>  <dd class="ga-optin ga-optin--yes">✓ Opted In</dd>
        <dt>Preferred Channel</dt>   <dd id="gaPrefChannel">Email</dd>
        <dt>Language</dt>            <dd id="gaPrefLang">—</dd>
      </dl>
    </div>
  </div>
</div>
```

Score colouring in JS: churn risk — green if < 20%, orange if 20–50%, red if > 50%. Propensity — green if > 70%, amber if 40–70%, grey if < 40%.

### Tab: Offers — tier-personalised offer cards

Offers are generated client-side based on the passenger's loyalty tier. Each card has a left accent stripe, icon, title, description, price/miles value, and a "Present Offer" button that sends an AEP event.

```html
<div class="ga-tab-panel" id="tabOffers" hidden>
  <div class="ga-offers-grid" id="gaOffersGrid">
    <!-- rendered by renderOffers(tier) -->
  </div>
</div>
```

**Offer definitions by tier** — generate these in JS:

```js
const OFFERS_BY_TIER = {
  platinum: [
    {
      icon: '👑',
      title: 'First Class Upgrade',
      desc: 'Complimentary upgrade to First Class — available seats: 2A, 3D',
      value: 'Complimentary',
      accent: '#C9A227',
      eventType: 'flight.staff.offer.upgrade.first',
    },
    {
      icon: '🚗',
      title: 'Chauffeur Service',
      desc: 'Etihad Chauffeur pick-up at destination — Abu Dhabi, Dubai, London',
      value: 'Complimentary',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.chauffeur',
    },
    {
      icon: '🥂',
      title: 'The Lounge — AUH',
      desc: 'Premium lounge access with dining and spa for all Platinum members',
      value: 'Included',
      accent: '#C9A227',
      eventType: 'flight.staff.offer.lounge',
    },
  ],
  gold: [
    {
      icon: '⬆️',
      title: 'Business Class Upgrade',
      desc: 'Upgrade from Economy to Business Class from 20,000 miles',
      value: '20,000 miles',
      accent: '#C9A227',
      eventType: 'flight.staff.offer.upgrade.business',
    },
    {
      icon: '🛋️',
      title: 'Lounge Day Pass',
      desc: 'Access to Etihad Gold Lounge — Abu Dhabi Terminal 1',
      value: '5,000 miles',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.lounge.day',
    },
    {
      icon: '💺',
      title: 'Premium Seat Upgrade',
      desc: 'Move to extra-legroom exit row or bulkhead seats',
      value: '8,000 miles',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.seat.premium',
    },
  ],
  silver: [
    {
      icon: '💺',
      title: 'Extra Legroom Seat',
      desc: 'Upgrade to Economy Space seat with extra legroom',
      value: '3,000 miles or £35',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.seat.legroom',
    },
    {
      icon: '🛂',
      title: 'Priority Boarding',
      desc: 'Board before general boarding with Zone 1 access',
      value: '1,000 miles',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.priority.boarding',
    },
    {
      icon: '🍽️',
      title: 'Premium Meal Upgrade',
      desc: 'Upgrade to Business Class dining experience on board',
      value: '4,000 miles or £28',
      accent: '#C9A227',
      eventType: 'flight.staff.offer.meal.premium',
    },
  ],
  default: [
    {
      icon: '💺',
      title: 'Seat Upgrade',
      desc: 'Upgrade to a preferred seat with extra comfort',
      value: '£29',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.seat.basic',
    },
    {
      icon: '🎒',
      title: 'Extra Baggage',
      desc: 'Add 10 kg checked baggage allowance',
      value: '£45',
      accent: '#009CA6',
      eventType: 'flight.staff.offer.baggage.extra',
    },
  ],
};

function renderOffers(tier) {
  const grid = document.getElementById('gaOffersGrid');
  if (!grid) return;
  const key = (tier || '').toLowerCase();
  const offers = OFFERS_BY_TIER[key] || OFFERS_BY_TIER.default;
  grid.innerHTML = offers.map(o => `
    <div class="ga-offer-card" style="border-left: 4px solid ${o.accent}">
      <div class="ga-offer-icon">${o.icon}</div>
      <div class="ga-offer-body">
        <div class="ga-offer-title">${o.title}</div>
        <div class="ga-offer-desc">${o.desc}</div>
        <div class="ga-offer-value">${o.value}</div>
      </div>
      <button class="ga-offer-btn" data-event="${o.eventType}" style="background:${o.accent}">
        Present Offer
      </button>
    </div>
  `).join('');
  grid.querySelectorAll('.ga-offer-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      sendEvent(btn.dataset.event, { tier, offerTitle: btn.closest('.ga-offer-card').querySelector('.ga-offer-title').textContent });
      showToast('Offer presented to passenger');
      btn.textContent = '✓ Presented';
      btn.disabled = true;
    })
  );
}
```

### Tab: Boarding — full A380-800 seat map (in-tab, scrollable)

This is now a **tab**, not a modal. The seat map renders directly in the tab panel. The tab panel itself scrolls within `.ipad-screen-stack`.

```html
<div class="ga-tab-panel" id="tabBoarding" hidden>
  <!-- Boarding status card -->
  <div class="ga-boarding-status-card" id="gaBoardingStatusCard">
    <div class="ga-bsc-row">
      <span class="ga-bsc-label">Flight</span>   <strong id="gbsFlight">—</strong>
      <span class="ga-bsc-label">Route</span>    <strong id="gbsRoute">—</strong>
      <span class="ga-bsc-label">Aircraft</span> <strong>A380-800</strong>
      <span class="ga-bsc-label">Passenger</span><strong id="gbsPassenger">—</strong>
    </div>
    <div class="ga-seat-legend">
      <span class="ga-seat-key" style="background:#4ade80"></span> Available
      <span class="ga-seat-key" style="background:#94a3b8"></span> Occupied
      <span class="ga-seat-key" style="background:#60a5fa"></span> Selected
      <span class="ga-seat-key" style="background:#fbbf24"></span> Premium
    </div>
  </div>

  <div class="ga-seat-map" id="gaSeatMap"><!-- rendered by buildSeatMap() --></div>

  <div class="ga-selected-info" id="gaSelectedInfo" hidden>
    Selected seat: <strong id="gaSelectedSeat">—</strong>
  </div>
  <button class="ga-btn ga-btn--primary ga-assign-btn" id="btnAssignSeat" disabled>
    Assign Seat &amp; Send to AEP
  </button>
</div>
```

**A380-800 cabin definitions:**

```js
const A380_CABINS = [
  { name: 'FIRST CLASS',      cssClass: 'cabin-first',      accent: '#fbbf24',
    rows: [1,2,3,4],                             layout: ['A','','C','D'] },
  { name: 'BUSINESS CLASS',   cssClass: 'cabin-business',   accent: '#60a5fa',
    rows: Array.from({length:13},(_,i)=>i+6),   layout: ['A','C','','D','G','','J','K'] },
  { name: 'PREMIUM ECONOMY',  cssClass: 'cabin-prem-eco',   accent: '#34d399',
    rows: [20,21,22,23,24],                      layout: ['A','B','','C','D','E','F','','G','H'] },
  { name: 'ECONOMY CLASS',    cssClass: 'cabin-economy',    accent: '#f87171',
    rows: Array.from({length:60},(_,i)=>i+27),  layout: ['A','B','C','','D','E','F','G','','H','J','K'] },
];
const OCC = { 'cabin-first':0.7, 'cabin-business':0.55, 'cabin-prem-eco':0.45, 'cabin-economy':0.3 };
function seededRandom(row, col) { const s=(row*31+col.charCodeAt(0))%97; return (s*16807)%100/100; }
```

Assign Seat button → `sendEvent('flight.staff.seat.selection', { seatNumber, flightNumber, agentId })` → close and show toast `"Seat 14C assigned and event sent to AEP"`.

### Action bar (below tabs, always visible after lookup)

```html
<div class="ga-actions" id="gaActions" hidden>
  <button class="ga-btn ga-btn--teal"   id="btnProcessBoarding">🛂 Process Boarding</button>
  <button class="ga-btn ga-btn--orange" id="btnOfferUpgrade">⬆️ Offer Upgrade</button>
  <button class="ga-btn ga-btn--purple" id="btnManageBaggage">🧳 Manage Baggage</button>
</div>
```

Behaviours:
- **Process Boarding** → sends `flight.staff.boarding.process` event + toast `"Boarding processed for [Name]"` + disable button
- **Offer Upgrade** → switches to Offers tab
- **Manage Baggage** → toast `"Baggage management screen opened"` + sends `flight.staff.baggage.open` event

### Data view (below view toggle)

```html
<div id="gaStaffView"><!-- profile header, tabs, actions, ops panel --></div>
<div id="gaDataView" hidden>
  <div class="ga-data-view-bar">
    <button class="ga-btn ga-btn--secondary ga-copy-btn" id="btnCopyJson">Copy JSON</button>
  </div>
  <pre class="ga-raw-json" id="gaRawJson"></pre>
</div>
```

### Toast

```html
<div class="ga-toast" id="gaToast" role="status" aria-live="polite"></div>
```

---

## JavaScript (`etihad-ipad.js`) — complete IIFE

```js
(function () {
  'use strict';

  const sandbox  = new URLSearchParams(location.search).get('sandbox') || 'apalmer';
  const rtdbBase = (window.firebaseDatabaseConfig || {}).databaseURL
    || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

  let rtdbData = {};
  let currentData = null;
  let currentPassengerEmail = '';
  let currentSize = '11';
  let isLandscape = false;

  const bezelEl  = document.getElementById('ipadBezel');
  const scalerEl = document.getElementById('ipadBezelScaler');
  const SIZE_MAP = { '11':{w:834,h:1194,scale:0.75}, '13':{w:1024,h:1366,scale:0.62} };

  // ── Clock ──────────────────────────────────────────────────────────────────
  function tick() {
    const el = document.getElementById('ipadStatusTime');
    if (el) el.textContent = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  }
  tick(); setInterval(tick, 1000);

  // ── RTDB ───────────────────────────────────────────────────────────────────
  async function loadRtdbData() {
    try {
      const res = await fetch(`${rtdbBase}/ajoLookups/${encodeURIComponent(sandbox)}.json`);
      if (res.ok) rtdbData = (await res.json()) || {};
    } catch(e) { console.warn('[ipad] RTDB', e); }
    applyRtdbToShell();
  }

  function adjustColorBrightness(hex, pct) {
    const n = parseInt(hex.replace('#',''), 16);
    const c = v => Math.min(255, Math.max(0, v + pct));
    return '#' + ((1<<24)|(c(n>>16)<<16)|(c((n>>8)&0xFF)<<8)|c(n&0xFF)).toString(16).slice(1);
  }

  function applyRtdbToShell() {
    const sp = rtdbData.StaffPortal  || {};
    const cd = rtdbData.CoreDemoData || {};
    const td = rtdbData.TravelData   || {};
    const mb = rtdbData.Mobile       || {};

    setText('gaAirlineName', cd.name || cd.airlineName || 'Etihad Airways');
    setText('gaAgentName',   sp.AgentName || '—');
    setText('gaAgentMeta',   [sp.AgentID, sp.AgentType, sp.FlightTerminalInfo].filter(Boolean).join(' · '));
    setText('ipadSandboxLabel', sandbox);

    const colour = sp.Colour ? sp.Colour.replace(/^#/,'') : null;
    const header = document.getElementById('gaAppHeader');
    const accent = document.getElementById('gaAgentAccent');
    if (header && colour) header.style.background =
      `linear-gradient(135deg,#${colour} 0%,${adjustColorBrightness('#'+colour,-40)} 100%)`;
    if (accent && colour) accent.style.cssText =
      `width:4px;height:32px;border-radius:2px;background:#${colour}`;

    // Flight strip
    const flight = td.flightNumber || mb.flightNumber || '';
    const dep    = td.origin || '';
    const arr    = td.destination || '';
    const depTime= td.boardingTime || td.departureDate || '';
    if (flight) {
      setText('gaFlightStripFlight', flight);
      setText('gaFlightStripRoute',  dep && arr ? `${dep} → ${arr}` : '—');
      setText('gaFlightStripDep',    depTime ? `Dep ${depTime}` : '—');
      setText('gaActiveFlightText',  `✈️ ${flight} ${dep}→${arr}`);
      show('gaActiveFlightPill');
    }
    // Flight info panel
    setText('gafiFlight',    flight);
    setText('gafiAircraft',  mb.aircraftType || 'A380-800');
    setText('gafiRoute',     dep && arr ? `${dep} → ${arr}` : '—');
    setText('gafiDep',       depTime || '—');
    setText('gafiGate',      td.gateNumber || sp.FlightTerminalInfo || '—');
    setText('gafiCountdown', mb.departureCountdown ? `T-${mb.departureCountdown}` : '—');
    setText('gafiCaptain',   mb.captainName  || 'Capt. James Wilson');
    setText('gafiCoPilot',   mb.coPilotName  || 'F/O Sarah Chen');

    const crewEl = document.getElementById('gaCrewManifest');
    if (crewEl) {
      const crew = mb.crewManifest || [
        {name:'Maria Santos', role:'Purser'},
        {name:'Ahmed Al-Rashid', role:'Senior Cabin Crew'},
        {name:'Priya Nair', role:'Cabin Crew'},
        {name:'David Okafor', role:'Cabin Crew'},
      ];
      crewEl.innerHTML = crew.map(c =>
        `<div class="ga-crew-row"><span>${c.name}</span><span class="ga-crew-role">${c.role}</span></div>`
      ).join('');
    }

    // Boarding tab status cards
    setText('gbsFlight',    flight || '—');
    setText('gbsRoute',     dep && arr ? `${dep} → ${arr}` : '—');
  }

  // ── AEP lookup ─────────────────────────────────────────────────────────────
  function rowVal(rows, path) {
    if (!rows) return '';
    const r = rows.find(r => r.attribute === path
      || (r.attribute||'').endsWith('.'+path.split('.').pop()));
    return r ? (r.value ?? '') : '';
  }

  async function lookupProfile(identifier) {
    const url = `/api/profile/table?identifier=${encodeURIComponent(identifier)}&namespace=email&sandbox=${encodeURIComponent(sandbox)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  // ── AEP event ──────────────────────────────────────────────────────────────
  async function sendEvent(eventType, payload) {
    try {
      await fetch('/api/ipad/event', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          sandbox,
          email: currentPassengerEmail || 'broadcast@etihad.com',
          eventType,
          payload: {
            ...payload,
            agentId: (rtdbData.StaffPortal||{}).AgentID || '',
            ts: new Date().toISOString(),
          },
        }),
      });
    } catch(e) { console.warn('[ipad] sendEvent failed', e); }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderAll(data) {
    currentData = data;
    currentPassengerEmail = data.profileEmail || '';
    const rows = data.rows || [];
    const td   = rtdbData.TravelData      || {};
    const cl   = rtdbData.CustomerLoyalty || {};

    const first = rowVal(rows,'person.name.firstName');
    const last  = rowVal(rows,'person.name.lastName');
    const full  = [first,last].filter(Boolean).join(' ') || '—';
    const gender = (rowVal(rows,'person.gender')||'').toLowerCase();
    const dob    = rowVal(rows,'person.birthDate');
    const photo  = rowVal(rows,'profilePictureLink');
    const loyaltyId = rowVal(rows,'_demoemea.identification.core.loyaltyId');
    const tier   = cl.tier || rowVal(rows,'_demoemea.loyaltyDetails.level') || '';

    setText('gaProfileFullName',  full);
    setText('gaProfileLoyaltyId', loyaltyId || '—');
    setText('gbsPassenger',       full);

    // Avatar
    const img  = document.getElementById('gaProfilePhoto');
    const icon = document.getElementById('gaGenderIcon');
    if (photo && img) {
      img.src = photo; img.style.display = '';
      img.onerror = () => { img.style.display='none'; if(icon) icon.style.display=''; };
      if(icon) icon.style.display='none';
    } else if(icon) {
      icon.textContent = gender==='male' ? '👨' : gender==='female' ? '👩' : '👤';
      icon.style.display='';
    }

    // Tier badge
    ['gaLoyaltyTierBadge','gaLoyaltyTierInline'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = tier || 'Member';
      el.className = 'ga-loyalty-tier-badge' + (tier ? ' tier-'+tier.toLowerCase() : '');
    });

    // Personal tab
    setText('gaFullName',    full);
    setText('gaGender',      gender || '—');
    setText('gaDOB',         dob || 'Not available');
    if (dob) {
      const age = Math.floor((Date.now()-new Date(dob))/31557600000);
      setText('gaAge', isNaN(age) ? '—' : age + ' years');
    }
    setText('gaNationality', rowVal(rows,'person.nationality') || '—');
    setText('gaEmail',       data.profileEmail || rowVal(rows,'personalEmail.address') || '—');
    setText('gaPhone',       rowVal(rows,'mobilePhone.number') || '—');
    const addr = [rowVal(rows,'homeAddress.street1'),rowVal(rows,'homeAddress.city'),rowVal(rows,'homeAddress.postalCode')].filter(Boolean).join(', ');
    setText('gaAddress',  addr || '—');
    setText('gaLanguage', rowVal(rows,'preferredLanguage') || '—');

    // Travel tab
    const dep = rowVal(rows,'_demoemea.travelReservations.flightReservations.departureAirportCode');
    const arr = rowVal(rows,'_demoemea.travelReservations.flightReservations.arrivalAirportCode');
    const via = rowVal(rows,'_demoemea.travelReservations.flightReservations.multiLeg.layoverAirportCode_1');
    const route = dep && arr ? (via ? `${dep} → ${via} → ${arr}` : `${dep} → ${arr}`) : (td.origin && td.destination ? `${td.origin} → ${td.destination}` : '—');
    setText('gaFlight',      td.flightNumber || rowVal(rows,'_demoemea.travelReservations.flightReservations.flightNumber') || 'N/A');
    setText('gaRoute',       route);
    setText('gaFlightClass', td.flightClass  || rowVal(rows,'_demoemea.travelReservations.flightReservations.flightClass') || '—');
    setText('gaFlightDate',  td.departureDate|| rowVal(rows,'_demoemea.travelReservations.flightReservations.flightDate') || 'Not available');
    const pax = rowVal(rows,'_demoemea.travelReservations.flightReservations.numberofPassengers');
    const kids = rowVal(rows,'_demoemea.travelReservations.flightReservations.childrenTravelling');
    setText('gaPassengers',  pax ? pax + (kids && kids!=='false' ? ' (incl. children)' : '') : '—');
    setText('gaBookingRef',  td.bookingRef    || rowVal(rows,'_demoemea.travelReservations.flightReservations.confirmationNumber') || '—');
    setText('gaSeat',        td.seatNumber    || '—');
    setText('gaGate',        td.gateNumber    || '—');
    setText('gaBoardingTime',td.boardingTime  || '—');
    setText('gaBaggage',     td.baggageAllowance || '—');
    setText('gaCheckIn',     td.checkInStatus || '—');
    setText('gaSeatPref',    td.seatPreference|| rowVal(rows,'travelPreferences.seat') || '—');
    setText('gaMealPref',    td.mealPreference|| rowVal(rows,'travelPreferences.meal') || '—');

    // Loyalty tab
    const miles = cl.miles||cl.balance||rowVal(rows,'_demoemea.loyaltyDetails.points')||'—';
    setText('gaLoyaltyProgram', cl.programName || 'Etihad Guest');
    setText('gaLoyaltyID',      loyaltyId || '—');
    setText('gaMiles',          miles ? Number(miles).toLocaleString() : '—');
    setText('gaMemberSince',    cl.memberSince || '—');
    setText('gaNextTier',       cl.nextTier    || '—');
    setText('gaMilesNeeded',    cl.milesNeeded || '—');
    setText('gaLTV',            rowVal(rows,'_demoemea.orderProfile.lifetimeValue') ? '$'+Number(rowVal(rows,'_demoemea.orderProfile.lifetimeValue')).toLocaleString() : '$0');
    setText('gaOrdersYTD',      rowVal(rows,'_demoemea.orderProfile.ordersYTD') || '0');
    setText('gaNPS',            rowVal(rows,'_demoemea.scoring.npsScore') || '—');

    const churnRaw   = parseFloat(rowVal(rows,'_demoemea.scoring.churn.churnPrediction') || 0);
    const upgradeRaw = parseFloat(rowVal(rows,'_demoemea.scoring.travel.propensityForSeatUpgrade') || 0);
    const propRaw    = parseFloat(rowVal(rows,'_demoemea.scoring.core.propensityScore') || 0);
    const npsRaw     = parseInt(rowVal(rows,'_demoemea.scoring.npsScore') || 0, 10);
    setText('gaChurn',   churnRaw   ? (churnRaw*100).toFixed(0)+'%'   : '—');
    setText('gaUpgrade', upgradeRaw ? (upgradeRaw*100).toFixed(0)+'%' : '—');

    // Preferences tab scores with colour
    setScore('gaChurnPref',     churnRaw,   'low', '%', true);
    setScore('gaPropensityPref',propRaw,    'high','%', false);
    setScore('gaNPSPref',       npsRaw/10,  'high','/10',false,npsRaw);
    setScore('gaUpgradePref',   upgradeRaw, 'high','%', false);
    setText('gaPrefLang',       rowVal(rows,'preferredLanguage') || '—');

    // Offers tab
    renderOffers(tier);

    // Data view
    const rawEl = document.getElementById('gaRawJson');
    if (rawEl) rawEl.textContent = JSON.stringify(data, null, 2);

    show('gaProfileHeader');
    show('gaTabs');
    show('gaViewToggle');
    show('gaActions');
    activateTab('personal');
    activateView('staff');
  }

  function setScore(id, val, good, suffix, invertGood, rawOverride) {
    const el = document.getElementById(id);
    if (!el) return;
    const display = rawOverride !== undefined ? rawOverride + suffix : val ? (val*100).toFixed(0)+suffix : '—';
    el.textContent = display;
    if (!val) return;
    const isGood = good === 'high' ? val > 0.7 : val < 0.2;
    const isMid  = good === 'high' ? val > 0.4 : val < 0.5;
    el.style.color = isGood ? '#4ade80' : isMid ? '#fbbf24' : '#f87171';
    el.style.fontWeight = '600';
  }

  // ── Offers ─────────────────────────────────────────────────────────────────
  const OFFERS_BY_TIER = {
    platinum: [
      { icon:'👑', title:'First Class Upgrade', desc:'Complimentary upgrade — seats 2A, 3D available', value:'Complimentary', accent:'#C9A227', eventType:'flight.staff.offer.upgrade.first' },
      { icon:'🚗', title:'Chauffeur Service', desc:'Etihad Chauffeur pick-up at destination', value:'Complimentary', accent:'#009CA6', eventType:'flight.staff.offer.chauffeur' },
      { icon:'🥂', title:'The Lounge — AUH', desc:'Premium lounge access with dining and spa', value:'Included', accent:'#C9A227', eventType:'flight.staff.offer.lounge' },
    ],
    gold: [
      { icon:'⬆️', title:'Business Class Upgrade', desc:'Upgrade from Economy to Business Class', value:'20,000 miles', accent:'#C9A227', eventType:'flight.staff.offer.upgrade.business' },
      { icon:'🛋️', title:'Lounge Day Pass', desc:'Etihad Gold Lounge — Abu Dhabi Terminal 1', value:'5,000 miles', accent:'#009CA6', eventType:'flight.staff.offer.lounge.day' },
      { icon:'💺', title:'Premium Seat', desc:'Move to extra-legroom exit row seats', value:'8,000 miles', accent:'#009CA6', eventType:'flight.staff.offer.seat.premium' },
    ],
    silver: [
      { icon:'💺', title:'Extra Legroom Seat', desc:'Economy Space seat with extra legroom', value:'3,000 miles or £35', accent:'#009CA6', eventType:'flight.staff.offer.seat.legroom' },
      { icon:'🛂', title:'Priority Boarding', desc:'Board before general boarding — Zone 1', value:'1,000 miles', accent:'#009CA6', eventType:'flight.staff.offer.priority.boarding' },
      { icon:'🍽️', title:'Premium Meal Upgrade', desc:'Business Class dining experience on board', value:'4,000 miles or £28', accent:'#C9A227', eventType:'flight.staff.offer.meal.premium' },
    ],
    default: [
      { icon:'💺', title:'Preferred Seat', desc:'Upgrade to a preferred seat', value:'£29', accent:'#009CA6', eventType:'flight.staff.offer.seat.basic' },
      { icon:'🎒', title:'Extra Baggage', desc:'Add 10 kg checked baggage', value:'£45', accent:'#009CA6', eventType:'flight.staff.offer.baggage.extra' },
    ],
  };

  function renderOffers(tier) {
    const grid = document.getElementById('gaOffersGrid');
    if (!grid) return;
    const offers = OFFERS_BY_TIER[(tier||'').toLowerCase()] || OFFERS_BY_TIER.default;
    grid.innerHTML = offers.map(o => `
      <div class="ga-offer-card" style="border-left:4px solid ${o.accent}">
        <div class="ga-offer-icon">${o.icon}</div>
        <div class="ga-offer-body">
          <div class="ga-offer-title">${o.title}</div>
          <div class="ga-offer-desc">${o.desc}</div>
          <div class="ga-offer-value">${o.value}</div>
        </div>
        <button class="ga-offer-btn" data-event="${o.eventType}" style="background:${o.accent}">Present Offer</button>
      </div>`).join('');
    grid.querySelectorAll('.ga-offer-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        const title = btn.closest('.ga-offer-card').querySelector('.ga-offer-title').textContent;
        sendEvent(btn.dataset.event, {tier, offerTitle:title});
        showToast('Offer presented: ' + title);
        btn.textContent = '✓ Presented'; btn.disabled = true;
      })
    );
  }

  // ── Seat map ───────────────────────────────────────────────────────────────
  const A380_CABINS = [
    { name:'FIRST CLASS',     cssClass:'cabin-first',    accent:'#fbbf24', rows:[1,2,3,4],                           layout:['A','','C','D'] },
    { name:'BUSINESS CLASS',  cssClass:'cabin-business', accent:'#60a5fa', rows:Array.from({length:13},(_,i)=>i+6), layout:['A','C','','D','G','','J','K'] },
    { name:'PREMIUM ECONOMY', cssClass:'cabin-prem-eco', accent:'#34d399', rows:[20,21,22,23,24],                   layout:['A','B','','C','D','E','F','','G','H'] },
    { name:'ECONOMY CLASS',   cssClass:'cabin-economy',  accent:'#f87171', rows:Array.from({length:60},(_,i)=>i+27), layout:['A','B','C','','D','E','F','G','','H','J','K'] },
  ];
  const OCC = {'cabin-first':0.7,'cabin-business':0.55,'cabin-prem-eco':0.45,'cabin-economy':0.3};
  function seededRandom(r,c){const s=(r*31+c.charCodeAt(0))%97;return(s*16807)%100/100;}

  function buildSeatMap() {
    const map = document.getElementById('gaSeatMap');
    if (!map) return;
    let html = '';
    for (const cabin of A380_CABINS) {
      const occ = OCC[cabin.cssClass] || 0.4;
      html += `<div class="ga-cabin ${cabin.cssClass}" style="--cabin-accent:${cabin.accent}">
        <div class="ga-cabin-label" style="color:${cabin.accent}">${cabin.name}</div>`;
      for (const row of cabin.rows) {
        html += `<div class="ga-seat-row"><span class="ga-seat-row-num">${row}</span>`;
        for (const col of cabin.layout) {
          if (!col) { html += '<span class="ga-seat-aisle"></span>'; continue; }
          const occupied = seededRandom(row,col) < occ;
          const cls = occupied ? 'ga-seat--occupied' : 'ga-seat--available';
          html += `<button class="ga-seat ${cls}" data-seat="${row}${col}" aria-label="Seat ${row}${col}" ${occupied?'disabled':''}></button>`;
        }
        html += '</div>';
      }
      html += '</div>';
    }
    map.innerHTML = html;
    document.getElementById('btnAssignSeat').disabled = true;
    document.getElementById('gaSelectedInfo').hidden  = true;
  }

  // ── Tab + view switching ───────────────────────────────────────────────────
  function activateTab(name) {
    document.querySelectorAll('.ga-tab').forEach(t =>
      t.classList.toggle('ga-tab--active', t.dataset.tab === name));
    document.querySelectorAll('.ga-tab-panel').forEach(p => {
      p.hidden = p.id !== 'tab' + name.charAt(0).toUpperCase() + name.slice(1);
    });
    if (name === 'boarding' && !document.getElementById('gaSeatMap').innerHTML) buildSeatMap();
  }

  function activateView(view) {
    const staff = view === 'staff';
    document.getElementById('gaStaffView').hidden = !staff;
    document.getElementById('gaDataView').hidden  =  staff;
    document.querySelectorAll('.ga-view-btn').forEach(b =>
      b.classList.toggle('ga-view-btn--active', b.dataset.view === view));
  }

  // ── Bezel controls ─────────────────────────────────────────────────────────
  function applyBezelColour(colour) {
    if (!bezelEl) return;
    ['space-black','silver','natural-titanium','blue-titanium'].forEach(c =>
      bezelEl.classList.remove('ipad-bezel--'+c));
    bezelEl.classList.add('ipad-bezel--'+colour);
    document.querySelectorAll('.ipad-colour-swatch').forEach(s => {
      const a = s.dataset.ipadColour === colour;
      s.classList.toggle('ipad-colour-swatch--active', a);
      s.setAttribute('aria-checked', String(a));
    });
    try { sessionStorage.setItem('ipadBezColour', colour); } catch{}
  }

  function applySize(size) {
    currentSize = size;
    applyOrientation(isLandscape);
    document.querySelectorAll('[data-ipad-size]').forEach(b =>
      b.classList.toggle('ipad-ctrl-btn--active', b.dataset.ipadSize === size));
    try { sessionStorage.setItem('ipadBezSize', size); } catch{}
  }

  function applyOrientation(landscape) {
    isLandscape = landscape;
    const cfg = SIZE_MAP[currentSize] || SIZE_MAP['11'];
    const vw = landscape ? cfg.h : cfg.w, vh = landscape ? cfg.w : cfg.h;
    const sc = landscape ? cfg.scale*0.9 : cfg.scale;
    if (scalerEl) scalerEl.style.setProperty('--ipad-scale', sc);
    if (bezelEl) {
      bezelEl.style.setProperty('--device-vp-w', vw+'px');
      bezelEl.style.setProperty('--device-vp-h', vh+'px');
    }
    const icon = document.getElementById('orientIcon');
    if (icon) icon.textContent = landscape ? '⬛' : '⬜';
    try { sessionStorage.setItem('ipadOrientation', landscape?'1':'0'); } catch{}
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  let toastTimer;
  function showToast(msg) {
    const el = document.getElementById('gaToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('ga-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('ga-toast--visible'), 3200);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function show(id)      { const e=document.getElementById(id); if(e) e.hidden=false; }
  function setText(id,v) { const e=document.getElementById(id); if(e) e.textContent=v; }
  function setLoading(on) {
    const btn = document.querySelector('.ga-search-btn');
    if (btn) { btn.disabled=on; btn.textContent=on?'Searching…':'Search'; }
  }
  function showError(msg) {
    const el = document.getElementById('gaSearchError');
    if (!el) return;
    el.textContent=msg; el.hidden=false;
    setTimeout(() => { el.hidden=true; }, 5000);
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  document.getElementById('gaSearchForm').addEventListener('submit', async e => {
    e.preventDefault();
    const val = document.getElementById('gaSearchInput').value.trim();
    if (!val) return;
    setLoading(true);
    try {
      const data = await lookupProfile(val);
      if (!data.found) { showError('Profile not found'); return; }
      renderAll(data);
    } catch(err) { showError('Lookup failed: '+err.message); }
    finally { setLoading(false); }
  });

  document.querySelectorAll('.ga-tab').forEach(t =>
    t.addEventListener('click', () => activateTab(t.dataset.tab)));
  document.querySelectorAll('.ga-view-btn').forEach(b =>
    b.addEventListener('click', () => activateView(b.dataset.view)));

  document.getElementById('btnCopyJson').addEventListener('click', () => {
    const raw = document.getElementById('gaRawJson');
    if (raw) navigator.clipboard.writeText(raw.textContent)
      .then(() => showToast('Copied to clipboard'));
  });

  document.getElementById('btnProcessBoarding').addEventListener('click', () => {
    const name = document.getElementById('gaProfileFullName').textContent;
    sendEvent('flight.staff.boarding.process', { passengerName: name });
    showToast('Boarding processed for ' + name);
    document.getElementById('btnProcessBoarding').disabled = true;
  });
  document.getElementById('btnOfferUpgrade').addEventListener('click', () => activateTab('offers'));
  document.getElementById('btnManageBaggage').addEventListener('click', () => {
    sendEvent('flight.staff.baggage.open', {});
    showToast('Baggage management screen opened');
  });

  document.getElementById('btnFlightInfoToggle').addEventListener('click', () => {
    const panel = document.getElementById('gaFlightInfoPanel');
    panel.hidden = !panel.hidden;
    document.getElementById('btnFlightInfoToggle').textContent =
      panel.hidden ? 'Flight Info ▾' : 'Flight Info ▴';
  });

  // Broadcast buttons
  document.querySelectorAll('.ga-broadcast-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      sendEvent(btn.dataset.event, { flightNumber: (rtdbData.TravelData||{}).flightNumber });
      showToast('Broadcast sent: ' + btn.textContent.trim());
      btn.classList.add('ga-broadcast-btn--sent');
      setTimeout(() => btn.classList.remove('ga-broadcast-btn--sent'), 3000);
    })
  );

  // Seat map
  document.getElementById('gaSeatMap').addEventListener('click', e => {
    const seat = e.target.closest('.ga-seat--available');
    if (!seat) return;
    document.querySelectorAll('#gaSeatMap .ga-seat--selected').forEach(s =>
      s.classList.replace('ga-seat--selected','ga-seat--available'));
    seat.classList.replace('ga-seat--available','ga-seat--selected');
    document.getElementById('gaSelectedInfo').hidden = false;
    document.getElementById('gaSelectedSeat').textContent = seat.dataset.seat;
    document.getElementById('btnAssignSeat').disabled = false;
  });
  document.getElementById('btnAssignSeat').addEventListener('click', () => {
    const seat = document.getElementById('gaSelectedSeat').textContent;
    const flight = (rtdbData.TravelData||{}).flightNumber || '';
    sendEvent('flight.staff.seat.selection', { seatNumber:seat, flightNumber:flight });
    showToast(`Seat ${seat} assigned — event sent to AEP`);
    document.getElementById('btnAssignSeat').disabled = true;
  });

  document.querySelectorAll('[data-ipad-colour]').forEach(btn =>
    btn.addEventListener('click', () => applyBezelColour(btn.dataset.ipadColour)));
  document.querySelectorAll('[data-ipad-size]').forEach(btn =>
    btn.addEventListener('click', () => applySize(btn.dataset.ipadSize)));
  document.getElementById('btnOrientation').addEventListener('click', () =>
    applyOrientation(!isLandscape));

  // ── Init ───────────────────────────────────────────────────────────────────
  const sc = (() => { try { return sessionStorage; } catch { return {}; } })();
  applyBezelColour(sc.getItem?.('ipadBezColour')  || 'space-black');
  applySize(        sc.getItem?.('ipadBezSize')    || '11');
  applyOrientation( sc.getItem?.('ipadOrientation')==='1');
  loadRtdbData();
  buildSeatMap();
})();
```

---

## App CSS (`etihad-ipad.css`)

```css
/* ── Screen stack must scroll ─────────────────────────────────────────────── */
.ipad-screen-stack { display:flex; flex-direction:column; height:100%; background:var(--dash-bg); overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; }

/* ── App header ───────────────────────────────────────────────────────────── */
.ga-app-header { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; flex-shrink:0; color:#fff; background:linear-gradient(135deg,#003C5F 0%,#001d30 100%); gap:8px; }
.ga-header-left { display:flex; align-items:center; gap:10px; min-width:0; }
.ga-header-logo { font-size:20px; flex-shrink:0; }
.ga-airline-name { font-size:15px; font-weight:700; color:#fff; white-space:nowrap; }
.ga-header-sub   { font-size:11px; color:rgba(255,255,255,0.7); }
.ga-active-flight-pill { background:rgba(255,255,255,0.15); border-radius:20px; padding:3px 10px; font-size:11px; color:#fff; white-space:nowrap; }
.ga-agent-badge  { display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.12); border-radius:8px; padding:6px 10px; flex-shrink:0; }
.ga-agent-accent { border-radius:2px; flex-shrink:0; }
.ga-agent-name   { font-size:12px; font-weight:600; color:#fff; white-space:nowrap; }
.ga-agent-meta   { font-size:10px; color:rgba(255,255,255,0.7); }

/* ── Flight strip ─────────────────────────────────────────────────────────── */
.ga-flight-strip { display:flex; align-items:center; gap:6px; padding:8px 14px; background:color-mix(in srgb,var(--dash-blue) 12%,var(--dash-surface)); border-bottom:1px solid var(--dash-border); font-size:12px; color:var(--dash-text); flex-wrap:wrap; }
.ga-flight-strip-icon { font-size:14px; }
.ga-flight-strip-sep  { color:var(--dash-muted); }
.ga-flight-status-dot { width:8px; height:8px; border-radius:50%; background:#4ade80; display:inline-block; }
.ga-flight-info-btn   { margin-left:auto; padding:3px 10px; font-size:11px; background:var(--dash-surface-alt); border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); color:var(--dash-text-secondary); cursor:pointer; }

/* ── Flight info panel ────────────────────────────────────────────────────── */
.ga-flight-info-panel { padding:12px 14px; border-bottom:1px solid var(--dash-border); background:var(--dash-surface); }
.ga-broadcast-section { margin-top:12px; }
.ga-broadcast-btns    { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.ga-broadcast-btn     { padding:7px 12px; font-size:12px; border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); background:var(--dash-surface-alt); color:var(--dash-text); cursor:pointer; transition:background 0.15s; }
.ga-broadcast-btn:hover         { background:var(--dash-hover); }
.ga-broadcast-btn--sent         { background:color-mix(in srgb,#4ade80 20%,var(--dash-surface-alt)); }

/* ── Search bar ───────────────────────────────────────────────────────────── */
.ga-search-bar   { padding:12px 14px; background:var(--dash-surface); border-bottom:1px solid var(--dash-border); }
.ga-search-form  { display:flex; gap:8px; }
.ga-search-input { flex:1; padding:9px 13px; background:var(--dash-input-bg); border:1px solid var(--dash-input-border); border-radius:var(--dash-radius-sm); color:var(--dash-text); font-size:13px; }
.ga-search-btn   { padding:9px 16px; background:var(--dash-blue); color:#fff; border:none; border-radius:var(--dash-radius-sm); font-size:13px; font-weight:500; cursor:pointer; }
.ga-search-error { font-size:12px; color:var(--color-error,#e53e3e); margin-top:6px; }

/* ── View toggle ──────────────────────────────────────────────────────────── */
.ga-view-toggle  { display:flex; gap:4px; padding:8px 14px; background:var(--dash-surface-alt); border-bottom:1px solid var(--dash-border); }
.ga-view-btn     { flex:1; padding:6px 12px; font-size:12px; font-weight:500; border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); background:transparent; color:var(--dash-text-secondary); cursor:pointer; }
.ga-view-btn--active { background:var(--dash-surface); color:var(--dash-text); border-color:var(--dash-blue); }

/* ── Profile header ───────────────────────────────────────────────────────── */
.ga-profile-header { display:flex; align-items:center; gap:12px; padding:12px 14px; border-bottom:1px solid var(--dash-border); }
.ga-profile-photo-wrap { width:48px; height:48px; border-radius:50%; overflow:hidden; flex-shrink:0; background:var(--dash-surface-alt); display:flex; align-items:center; justify-content:center; font-size:24px; }
.ga-profile-photo      { width:100%; height:100%; object-fit:cover; }
.ga-profile-full-name  { font-size:16px; font-weight:700; color:var(--dash-text); }
.ga-profile-loyalty-id { font-size:12px; color:var(--dash-text-secondary); margin-top:2px; }
.ga-loyalty-tier-badge { display:inline-block; margin-top:4px; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:600; background:var(--dash-surface-alt); color:var(--dash-text); border:1px solid var(--dash-border); }
.ga-loyalty-tier-badge.tier-bronze   { background:#cd7f32; color:#fff; border-color:#cd7f32; }
.ga-loyalty-tier-badge.tier-silver   { background:#9aa0aa; color:#fff; border-color:#9aa0aa; }
.ga-loyalty-tier-badge.tier-gold     { background:#c9a227; color:#fff; border-color:#c9a227; }
.ga-loyalty-tier-badge.tier-platinum { background:#4a5568; color:#e2e8f0; border-color:#4a5568; }

/* ── Tabs ─────────────────────────────────────────────────────────────────── */
.ga-tabs    { display:flex; border-bottom:1px solid var(--dash-border); background:var(--dash-surface); flex-shrink:0; }
.ga-tab     { flex:1; padding:10px 4px; font-size:11px; font-weight:500; border:none; border-bottom:2px solid transparent; background:transparent; color:var(--dash-text-secondary); cursor:pointer; }
.ga-tab--active { color:var(--dash-blue); border-bottom-color:var(--dash-blue); }

/* ── Two-column card layout ───────────────────────────────────────────────── */
.ga-two-col   { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.ga-card      { background:var(--dash-surface); border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); padding:12px; }
.ga-card-title{ font-size:12px; font-weight:700; color:var(--dash-text); margin-bottom:10px; }
.ga-dl        { display:grid; grid-template-columns:auto 1fr; gap:6px 10px; font-size:12px; margin:0; }
.ga-dl dt     { color:var(--dash-text-secondary); white-space:nowrap; }
.ga-dl dd     { color:var(--dash-text); margin:0; font-weight:500; word-break:break-word; }
.ga-tab-panel { padding:10px 14px; }

/* ── Action bar ───────────────────────────────────────────────────────────── */
.ga-actions    { display:flex; gap:8px; padding:10px 14px; border-top:1px solid var(--dash-border); flex-wrap:wrap; flex-shrink:0; }
.ga-btn        { padding:9px 14px; border-radius:var(--dash-radius-sm); font-size:12px; font-weight:600; border:none; cursor:pointer; white-space:nowrap; }
.ga-btn--teal  { background:#009CA6; color:#fff; }
.ga-btn--orange{ background:#f97316; color:#fff; }
.ga-btn--purple{ background:#7c3aed; color:#fff; }
.ga-btn--primary  { background:var(--dash-blue); color:#fff; }
.ga-btn--secondary{ background:var(--dash-surface-alt); color:var(--dash-text); border:1px solid var(--dash-border); }

/* ── Crew manifest ────────────────────────────────────────────────────────── */
.ga-crew-row  { display:flex; justify-content:space-between; padding:4px 0; font-size:12px; border-top:1px solid var(--dash-border); margin-top:4px; }
.ga-crew-role { color:var(--dash-text-secondary); font-size:11px; }

/* ── Offer cards ──────────────────────────────────────────────────────────── */
.ga-offers-grid { display:flex; flex-direction:column; gap:10px; }
.ga-offer-card  { display:flex; align-items:center; gap:10px; background:var(--dash-surface); border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); padding:12px; }
.ga-offer-icon  { font-size:24px; flex-shrink:0; }
.ga-offer-body  { flex:1; min-width:0; }
.ga-offer-title { font-size:13px; font-weight:700; color:var(--dash-text); }
.ga-offer-desc  { font-size:11px; color:var(--dash-text-secondary); margin-top:2px; }
.ga-offer-value { font-size:12px; font-weight:600; color:var(--dash-blue); margin-top:4px; }
.ga-offer-btn   { padding:6px 12px; border:none; border-radius:var(--dash-radius-sm); color:#fff; font-size:12px; font-weight:600; cursor:pointer; flex-shrink:0; white-space:nowrap; }

/* ── Boarding status card ─────────────────────────────────────────────────── */
.ga-boarding-status-card { background:var(--dash-surface); border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); padding:10px 12px; margin-bottom:10px; }
.ga-bsc-row  { display:flex; flex-wrap:wrap; gap:6px 16px; font-size:12px; align-items:center; }
.ga-bsc-label{ color:var(--dash-text-secondary); }
.ga-seat-legend { display:flex; align-items:center; gap:8px; font-size:11px; color:var(--dash-text-secondary); margin-top:8px; flex-wrap:wrap; }
.ga-seat-key    { display:inline-block; width:12px; height:12px; border-radius:2px; }

/* ── Seat map ─────────────────────────────────────────────────────────────── */
.ga-cabin       { margin-bottom:10px; }
.ga-cabin-label { font-size:10px; font-weight:700; letter-spacing:0.06em; margin-bottom:4px; }
.ga-seat-row    { display:flex; align-items:center; gap:2px; margin-bottom:2px; }
.ga-seat-row-num{ width:16px; font-size:9px; color:var(--dash-muted); text-align:right; flex-shrink:0; }
.ga-seat-aisle  { width:8px; }
.ga-seat        { width:18px; height:18px; border-radius:3px; border:1px solid var(--dash-border); cursor:pointer; padding:0; }
.cabin-first .ga-seat, .cabin-business .ga-seat { width:22px; height:22px; }
.ga-seat--available { background:#4ade80; }
.ga-seat--occupied  { background:#94a3b8; cursor:not-allowed; opacity:0.7; }
.ga-seat--selected  { background:#60a5fa; border-color:#3b82f6; }
.ga-selected-info   { font-size:13px; color:var(--dash-text); padding:8px 0; }
.ga-assign-btn      { margin-top:8px; width:100%; padding:11px; font-size:13px; }

/* ── AI score colours ─────────────────────────────────────────────────────── */
.ga-optin--yes { color:#4ade80; }
.ga-score-text { font-weight:600; }

/* ── Data view ────────────────────────────────────────────────────────────── */
#gaDataView      { display:flex; flex-direction:column; }
.ga-data-view-bar{ display:flex; justify-content:flex-end; padding:8px 14px; border-bottom:1px solid var(--dash-border); }
.ga-copy-btn     { padding:5px 12px; font-size:12px; }
.ga-raw-json     { padding:12px 14px; margin:0; font-family:monospace; font-size:11px; color:var(--dash-text); background:var(--dash-bg); white-space:pre; tab-size:2; overflow-x:auto; }

/* ── Toast ────────────────────────────────────────────────────────────────── */
.ga-toast { position:sticky; bottom:34px; left:50%; transform:translateX(-50%); display:inline-block; background:var(--dash-surface); border:1px solid var(--dash-border); border-radius:var(--dash-radius-sm); padding:9px 18px; font-size:13px; color:var(--dash-text); box-shadow:0 4px 14px var(--dash-shadow); opacity:0; transition:opacity 0.2s; pointer-events:none; white-space:nowrap; z-index:200; }
.ga-toast--visible { opacity:1; }

/* ── Bezel colour presets (full rules in iPad emulator section above) ─────── */
.mobile-demo-bezel--ipad.ipad-bezel--space-black { background:linear-gradient(145deg,color-mix(in srgb,var(--dash-text) 35%,var(--dash-border)) 0%,#1a1d24 40%,#0a0c10 100%); }
.mobile-demo-bezel--ipad.ipad-bezel--silver { background:linear-gradient(145deg,color-mix(in srgb,var(--dash-text) 8%,var(--dash-surface)) 0%,#b0b5bf 40%,#8a8e96 100%); }
.mobile-demo-bezel--ipad.ipad-bezel--silver .mobile-demo-viewport { box-shadow:inset 0 0 0 2px #9aa0aa,inset 0 0 0 6px #c8cbd0; }
.mobile-demo-bezel--ipad.ipad-bezel--natural-titanium { background:linear-gradient(145deg,color-mix(in srgb,var(--dash-text) 12%,#9e9690) 0%,#8a8680 40%,#6e6a66 100%); }
.mobile-demo-bezel--ipad.ipad-bezel--natural-titanium .mobile-demo-viewport { box-shadow:inset 0 0 0 2px #9a9590,inset 0 0 0 6px #7a7672; }
.mobile-demo-bezel--ipad.ipad-bezel--blue-titanium { background:linear-gradient(145deg,color-mix(in srgb,var(--dash-blue) 22%,var(--dash-text)) 0%,#4f6372 40%,#38505e 100%); }
.mobile-demo-bezel--ipad.ipad-bezel--blue-titanium .mobile-demo-viewport { box-shadow:inset 0 0 0 2px #5a7282,inset 0 0 0 6px #3a5060; }
```

---

## Task: Update `web/profile-viewer/aep-lab-nav.js`

Find the placeholder at ~line 362 in the `etihadMobile` channel:

```js
// BEFORE
{
  label: 'iPad (to be built) (in development)',
  navPlaceholder: true,
  inDevelopment: true,
  navHideKey: 'mobileDemoApalmerIpad',
  demoMeta: { owners: ['apalmer'], sandboxes: ['apalmer'] },
  ico: '📲',
},

// AFTER
{
  label: 'iPad gate agent',
  href: 'etihad-ipad.html',
  inDevelopment: true,
  navHideKey: 'mobileDemoApalmerIpad',
  demoMeta: { owners: ['apalmer'], sandboxes: ['apalmer'] },
  ico: '📲',
},
```

---

## Verification checklist

- [ ] 7 files created/edited, nothing else changed
- [ ] Early-paint IIFE before any `<link>` in `<head>`
- [ ] `aep-theme.css` loads last; `mobile-demo.css` before `etihad-ipad.css`
- [ ] Page loads at `/profile-viewer/etihad-ipad.html?sandbox=apalmer` with no console errors
- [ ] RTDB `/ajoLookups/apalmer.json` fetches without SDK
- [ ] App header gradient changes colour from `StaffPortal.Colour` (inline style, not hardcoded CSS)
- [ ] Agent badge shows name, ID, type, terminal
- [ ] Flight status strip shows flight number, route, boarding status
- [ ] "Flight Info ▾" expands panel with crew names and broadcast buttons
- [ ] Broadcast buttons each show a toast and (silently) POST to `/api/ipad/event`
- [ ] Clock ticks every minute in iOS status bar
- [ ] 4 bezel colour swatches work; 2 size buttons work; orientation toggle works
- [ ] Search returns profile; profile header shows photo/gender icon + tier badge with correct colour
- [ ] 5 tabs visible: Personal · Travel · Loyalty · Offers · Boarding
- [ ] Personal tab: two-card layout (Personal Info + Contact Details) matching the reference screenshot
- [ ] Travel tab: Current Booking + Travel Preferences cards
- [ ] Loyalty tab: Loyalty Status + Travel Statistics cards; tier badge rendered inline
- [ ] Preferences tab: AI Insights scores (colour-coded) + Communication card
- [ ] Offers tab: 3 tier-appropriate offer cards; "Present Offer" sends event + disables button
- [ ] Boarding tab: A380-800 seat map with 4 cabin sections (First/Business/Prem Eco/Economy) coloured distinctly
- [ ] Clicking available seat → shows selected seat label → "Assign Seat & Send to AEP" button enables
- [ ] Assign Seat → POST to `/api/ipad/event` with `eventType: flight.staff.seat.selection` → toast confirms
- [ ] "Process Boarding" sends event + disables; "Offer Upgrade" switches to Offers tab; "Manage Baggage" sends event
- [ ] Staff View / Data View toggle works; Copy JSON copies raw profile JSON
- [ ] Screen scrolls — all content visible by scrolling within the iPad viewport
- [ ] Dark theme: `html[data-aep-theme="dark"]` — every colour adapts via `--dash-*` tokens
- [ ] Nav sidebar: "iPad gate agent" under Demos → Etihad → Mobile

---

## Reference files to read first

| File | Why |
|---|---|
| `web/profile-viewer/consent.html` | Copy `<head>` IIFE + dashboard shell structure |
| `web/profile-viewer/mobile-demo.css` lines 296–438 | Base `.mobile-demo-bezel--ipad` classes |
| `web/profile-viewer/content-decision-channel-emulator.css` lines 488–507 | `color-mix()` bezel pattern |
| `web/profile-viewer/home.css` | All `--dash-*` token definitions |
| `web/profile-viewer/aep-theme.css` | Dark-mode overrides |
| `web/profile-viewer/firebase-database-config.js` | `window.firebaseDatabaseConfig` |
| `web/profile-viewer/aep-lab-nav.js` lines 330–390 | Etihad nav section to edit |
| `functions/index.js` lines 1–50 | Import pattern, `REGION`, `PROFILE_FN_SECRETS` constants to follow |
| `functions/index.js` lines 499–584 | `profileTableProxy` response shape |
