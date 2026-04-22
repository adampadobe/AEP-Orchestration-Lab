# AEP experience events on the Navigator Global demo (replication guide)

This page sends Experience Events the same way the portable **`aep-event-sender-bundle`** does on the **server or in Node**: the JSON body matches the first argument to `sendGeneratorEvent()` in `aep-event-sender-bundle/send-aep-event.js`, which the backend turns into XDM (Edge or DCS) via the Event Generator.

## What this page does

| Action | How | eventType (examples) |
|--------|-----|----------------------|
| **Look up profile** | `DemoProfileDrawer.loadProfileDataForDrawer` → `GET /api/profile/consent` | Then **`application.login`** is sent with `POST /api/events/generator` (from `aep-profile-drawer.js`, shared with other demos) |
| **Primary CTA in iframe** (e.g. Get started) | `navigator-global-demo.js` intercepts `a.cmp-button` / `a.auth-link`, opens URL in a new tab, then `POST /api/events/generator` | Derived from label: `get.started`, `book.a.demo`, … |

## Request body contract (must match the bundle)

The browser builds a **plain object** (same fields the Node `sendGeneratorEvent` helper expects). Implemented in `navigator-global-demo.js` as `buildNavigatorGlobalGeneratorRequestBody()`.

- **Required (for CTA + generator):** `email` (primary identity in this lab), `eventType`, `viewName`, `viewUrl` (becomes `web.webPageDetails.URL` in XDM), `channel` (e.g. `Web`)
- **Optional:** `ecid` if the ECID hint is valid, `targetId` (from preset), `timestamp` (ISO; server/XDM also default time), `public` (merged into `_demoemea` for known shapes; CTAs pass `linkUrl` + `ctaLabel`)
- **Do not** embed IMS tokens in the page; the lab backend attaches OAuth.

Reference implementation of XDM build: `send-aep-event.js` → `buildEventGeneratorXdm` and `sendGeneratorEvent`.

## Presets (Edge vs DCS)

- **App-wide list (Firebase hosting):** `GET /api/events/generator-targets` → `targets[]` (backed by `web/profile-viewer/event-generator-targets.json` at the site root in this repo; Express `server.js` in the AEP Profile prototype serves the same).
- **Bundle copy (documentation / Node):** `navigator-global-demo-assets/aep-event-sender-bundle/event-generator-targets.json` should stay aligned with the root file when datastream IDs change.

## Replicating to another demo page (checklist)

1. Include **`event-generator-targets.json`** in the app (or reuse the same file).
2. On load, **`GET /api/events/generator-targets`** and fill a `<select>`; persist choice as `targetId`.
3. For each custom action, `POST /api/events/generator` with a body that matches the bundle (see `donate-demo.js`, `race-for-life-demo.js`, and **`navigator-global-demo.js` → `buildNavigatorGlobalGeneratorRequestBody`** for a field-accurate template).
4. Reuse **`DemoProfileDrawer.init({ getSelectedGeneratorTarget, … })`** so **lookup** continues to send **`application.login`** the same way.
5. For **Node/scripts**, import `send-aep-event.js` and pass `{ token, clientId, orgId }` plus a preset; never ship tokens in static HTML/JS.

## Local Express vs Firebase Hosting

The **AEP Profile** Express mirror (`aep-prototypes/.../server.js`) implements **`/api/events/generator`** and **`/api/events/generator-targets`**. If your Firebase project does not yet expose those paths, add the equivalent **Cloud Function** and **hosting rewrites** so the same `fetch` calls succeed in production. Until then, use local `npm run profile-viewer` for Event Generator–based sends.
