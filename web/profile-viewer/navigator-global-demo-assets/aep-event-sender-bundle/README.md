# AEP event sender bundle

> **AEP Orchestration Lab (Navigator Global demo only)**  
> This folder is vendored next to the embedded snapshot so the **same** Event Generator contract is documented in-repo. The browser does **not** import these modules; it `POST`s JSON to `/api/events/generator` (see `../AEP-EVENT-REPLICATION.md` and `../navigator-global-demo.js`). Canonical presets for the whole Profile Viewer app live at `web/profile-viewer/event-generator-targets.json` — keep this `event-generator-targets.json` in sync when you change datastreams. Source bundle path (Adobe internal): `AEP Profile/03 Profile Viewer/aep-event-sender-bundle`.

Portable copy of the Profile Viewer **Event Generator** logic: build the same XDM as `POST /api/events/generator` and send via **Edge** (datastream) or **DCS HTTP streaming**.

## Contents

| File | Purpose |
|------|---------|
| `send-aep-event.js` | `buildEventGeneratorXdm`, `sendGeneratorEvent`, preset helpers |
| `event-generator-targets.json` | Same presets as the app (datastream IDs, minimal vs full XDM, streaming URL) |
| `example-send.mjs` | Minimal Node 18+ script |

Copy this entire folder into another repo. There is no npm dependency beyond **Node 18+** (`fetch`).

## Auth

- **Bearer token** — you said you already have this.
- **Edge** also requires **`x-api-key`** (IMS OAuth **client id**) and **`x-gw-ims-org-id`** (org). These are mandatory for `https://server.adobedc.net/ee/v2/interact`.
- **DCS streaming** uses the token, **`sandbox-name`**, and **`x-adobe-flow-id`** (defaults match `server.js`; override with `AEP_EVENT_FLOW_ID` / `AEP_EVENT_GENERATOR_FLOW_ID`).

## Usage (Node)

```js
import {
  sendGeneratorEvent,
  loadPresetsFromFile,
  resolvePreset,
} from './send-aep-event.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const presets = loadPresetsFromFile(join(__dirname, 'event-generator-targets.json'));
const preset = resolvePreset(presets, 'edge-46677-donation');

const result = await sendGeneratorEvent(
  {
    email: 'user@example.com',
    eventType: 'donation.made',
    viewName: 'Donate',
    viewUrl: 'https://yoursite.com/donate',
    channel: 'Web',
    ecid: 'optional-profile-ecid',
    public: { donationAmount: 25, donationDate: '2026-04-22' },
  },
  { token: BEARER, clientId: OAUTH_CLIENT_ID, orgId: ORG_ID_AT_ADOBE },
  preset,
);
```

## Env overrides (optional)

Align with `server.js`: `AEP_EVENT_GENERATOR_SCHEMA_ID`, `AEP_EVENT_GENERATOR_DATASET_ID`, `AEP_EVENT_GENERATOR_STREAMING_URL`, `AEP_EVENT_GENERATOR_FLOW_ID`, `AEP_EVENT_GENERATOR_SANDBOX`, `AEP_EDGE_ECID`, `AEP_XDM_TENANT_ID`.

## Browser

Do **not** put long-lived tokens in frontend code. Either call your own backend that uses `sendGeneratorEvent`, or use the Adobe Web SDK against a **public** datastream.
