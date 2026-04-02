# Dependency audit plan — colleague config vs your sandbox

This document is a **repeatable plan** to find everything in the AEP-Decisioning repo that assumes a **specific colleague setup** (schemas, datasets, DCS inlets, Cloud Run URLs, Launch property, DSN site, default sandbox). You share the **same IMS org** but use **different sandboxes**; many IDs are **sandbox-scoped** and will not work until recreated or retargeted in your sandbox.

---

## 1. Goals

| Goal | Outcome |
|------|--------|
| **Inventory** | List every org-adjacent ID, URL, and default that is not portable across sandboxes. |
| **Classify** | Separate *org-level* (often shared), *sandbox-scoped* (must exist per sandbox), and *personal / third-party* (colleague’s Cloud Run, DSN site, Launch embed). |
| **Document** | For each sandbox-scoped item, record how to reproduce: schema, field groups, dataset, source/flow, HTTP streaming inlet, Edge datastream, AJO channel surface. |
| **Automate later** | Optional: central `config/` manifest + script that greps for drift; CI warning when hardcoded IDs change. |

---

## 2. Dependency categories

### 2.1 Org-level (usually shared if same `x-gw-ims-org-id`)

- Adobe IMS **client ID** / product profile / API scopes (Developer Console).
- **Journey Optimizer** and **DPS** API access (same org, sandbox header still required).

These do not replace sandbox work: APIs still need **`x-sandbox-name`** and resources in *that* sandbox.

### 2.2 Sandbox-scoped (must exist in *your* sandbox or be re-pointed)

Typical Platform artifacts:

| Artifact | Why it breaks in another sandbox |
|----------|----------------------------------|
| **XDM schema** `$id` URIs | URIs include tenant hash; different sandbox → different schema instances unless you import/align. |
| **Datasets** | Bound to schema + sandbox; dataset IDs in UI/code are wrong in your sandbox. |
| **HTTP API / DCS streaming** | Inlet URL, `x-adobe-flow-id`, dataset, schema ref — all tied to a dataflow in one sandbox. |
| **Identity namespaces** | `Email` vs `email`, custom codes — Profile UPS calls must match your namespace setup. |
| **Merge policies / Profile** | Same org, different sandbox = different profile store. |
| **Segments, audiences** | IDs differ. |
| **Query Service** | Table names / dataset qualified names differ. |

### 2.3 Edge / client-side (often colleague-specific)

| Item | Notes |
|------|--------|
| **AEP Web SDK datastream ID** | Edge collection uses a datastream; must point at datasets/schemas in the intended sandbox. |
| **Adobe Launch** embed URL | Development property / environment is usually personal or shared dev; not automatic. |
| **DSN / AJO web channel** spoof URL | `web://dsn.adobe.com/...#surface` must match how *your* channel definitions publish experiences. |

### 2.4 External HTTP (colleague infrastructure)

| Item | Notes |
|------|--------|
| **Cloud Run** “experience event” POST URL | Must be yours or a shared service configured for your org/sandbox. |
| **Webhook listener** host | Repo allowlists a specific `*.run.app` host in `functions/index.js` and `proxy_server.py`; deploy your own or update allowlist + UI defaults. |

### 2.5 Code / UI assumptions

| Item | Notes |
|------|--------|
| **Tenant path `_demoemea`** | Profile Viewer and streaming examples assume this mixin key; your tenant may differ (`_yourtenant`). |
| **ECID / email paths** | Helpers hardcode `_demoemea.identification.core.*` in several places — align with your XDM or abstract via config. |

---

## 3. Audit methodology (run in order)

### Step A — Freeze “source of truth” sandbox

1. In AEP, pick the **colleague sandbox** that the demo was built against (name in their `.env` / docs, e.g. historical `kirkham` / `apalmer` references in code).
2. Export or screenshot:
   - Schema Registry: profile + experience event + any **decisioning / personalization** schemas used in streaming.
   - Catalog: dataset list for those schemas (IDs + **qualified names**).
   - Dataflows: HTTP API inlets → copy **inlet URL**, **flow ID**, linked dataset/schema.
3. Repeat for **your** target sandbox once artifacts exist, to build a **side-by-side ID mapping table**.

### Step B — Repo sweep (mechanical)

Run from repo root (adapt patterns as needed):

```bash
# Adobe org pattern
rg -n "@AdobeOrg|@adobeOrg" --glob '!**/node_modules/**'

# Schema / dataset style IDs
rg -n "ns\.adobe\.com/[a-z]+/schemas/" --glob '*.{html,js,py,json,md,env.example}'
rg -n "\b[0-9a-f]{24}\b" web functions colleague-cursor --glob '*.{html,js}'

# Streaming / Edge
rg -n "dcs\.adobedc\.net|server\.adobedc\.net|dataStreamId|datastream" --glob '*.{html,js,py}'
rg -n "adobedtm\.com|launch-" web

# Cloud Run / webhooks
rg -n "run\.app|cloudfunctions\.net" web functions proxy_server.py

# Sandbox names (defaults)
rg -n "apalmer|kirkham|DEFAULT_ADOBE_SANDBOX|ADOBE_SANDBOX" --glob '*.{js,md,html,py}'
```

Record every hit in the **inventory worksheet** (Section 5).

### Step C — Classify each hit

For each value, tag: **Org-shared** | **Sandbox copy required** | **Replace with your service** | **UI-only default (localStorage overrides)**.

### Step D — Parity build order (recommended)

1. **Identity**: namespaces for email / ECID used in UPS and journeys.  
2. **XDM**: profile + experience event schemas; tenant mixin matching your field groups.  
3. **Datasets** + **batch/streaming** dataflows; note **inlet URL** + **flow ID**.  
4. **Edge**: datastream linking to the same event dataset / sandbox.  
5. **AJO**: channel surfaces / web configuration aligned with **decision scopes** in the lab.  
6. **Webhook**: listener URL + AJO custom action → your allowlisted host.

### Step E — Document in a single “sandbox manifest” (suggested)

Create `config/sandbox-manifest.TEMPLATE.json` (or similar) *you* maintain:

```json
{
  "imsOrg": "...@AdobeOrg",
  "sandboxTechnicalName": "your-sandbox",
  "tenantXdmKey": "_demoemea",
  "profile": { "schemaId": "", "datasetId": "" },
  "experienceEvent": { "schemaId": "", "datasetId": "", "streamingInletUrl": "", "flowId": "" },
  "edge": { "datastreamId": "" },
  "decisioning": { "decisionItemSchemaId": "" },
  "webhookListenerBaseUrl": "https://your-listener.run.app/",
  "experienceEventIngestUrl": "https://your-cloud-run.run.app"
}
```

Then progressively **replace hardcoded defaults** in `web/` with reads from a generated `config/sandbox-manifest.json` (gitignored per developer) or build-time env — future work.

---

## 4. Tooling ideas (optional follow-ups)

| Idea | Benefit |
|------|--------|
| **Script**: `scripts/audit-hardcoded-ids.py` | Fails CI if new `@AdobeOrg` / `schemas/` / `run.app` appear without allowlist entry. |
| **Schema export** | Use Platform UI “Export” or API to store JSON under `docs/schemas/<sandbox>/` (no secrets). |
| **`.env` per developer** | Keep `web` defaults minimal; document required vars in `docs/FIREBASE_STANDALONE_DEPLOY.md` + Profile Viewer `.env.example`. |

---

## 5. Inventory — known locations in *this* repo

> Values below are **examples** as found in the codebase; verify in your org and replace for your sandbox.

### 5.1 Firebase Cloud Functions (`functions/`)

| Location | What | Action |
|----------|------|--------|
| `index.js` | `DEFAULT_ADOBE_SANDBOX` (e.g. `apalmer`) | Set `ADOBE_SANDBOX_NAME` at deploy or use UI `?sandbox=` / `platform_headers`. |
| `index.js` | IMS secrets (`ADOBE_CLIENT_ID`, etc.) | Your Developer Console project (org can match). |
| `index.js` | `WEBHOOK_LISTENER_ALLOWED_HOST` | Colleague’s listener host — **change** if you deploy your own listener. |
| Profile proxy modules | UPS, Query, Catalog, JO, DPS paths | Sandbox via header; **dataset/schema IDs** only if you add env-based SQL later (`AEP_QUERY_*` in functions env). |

### 5.2 Experience Decisioning lab (`web/index.html`)

| Area | Examples | Action |
|------|----------|--------|
| Launch | `assets.adobedtm.com/.../launch-...min.js` | Point to **your** Launch environment or tag manager property. |
| Edge | `DEFAULT_EDGE_CONFIG_ID`, `edgeConfigId` field | **Your** datastream; must match sandbox datasets. |
| DSN spoof | `dsn.adobe.com/web/apalmer-I018/...`, decision scopes | **Your** DSN site id and surfaces. |
| Streaming | `streamingDatasetId`, `streamingSchemaId`, inlet URL placeholder | **Your** dataset/schema/inlet from Flow Service. |
| DPS preset | `x-schema-id` for offer items | Schema must exist in **your** sandbox. |
| Webhook | `webhooklistener-...run.app` | Same allowlist issue as functions — align host. |

### 5.3 Content decision (`web/content-decision-live.html`)

| Constant / default | Action |
|--------------------|--------|
| `EG_IMS_ORG` | Often org-wide — confirm still your org. |
| `EG_DATASET_ID`, `EG_SCHEMA_ID`, `EG_TENANT` | **Sandbox-specific** — replace with your experience-event dataset + schema + tenant key. |
| `DEFAULT_EXPERIENCE_EVENT_POST_URL` | Colleague Cloud Run — **your** endpoint or shared service. |
| `WEBHOOK_LISTENER_DIRECT_URL` | Same listener host as above. |

### 5.4 Python proxy (`proxy_server.py`)

| Item | Action |
|------|--------|
| `WEBHOOK_LISTENER_ALLOWED_NETLOC` | Must match listener you actually call. |
| Adobe auth | From `adobe_ims_auth` / env — sandbox in headers when calling Platform. |

### 5.5 Profile Viewer (vendored `colleague-cursor/...` + synced `web/profile-viewer/`)

| Item | Action |
|------|--------|
| `server.js` + `.env` | Many `AEP_*` vars: streaming URLs, flow IDs, dataset IDs, Query profile dataset, Edge interact URL — **all sandbox/service specific**. See `colleague-cursor/AEP Profile/03 Profile Viewer/.env.example`. |
| Default sandbox in JS | e.g. `kirkham` / `apalmer` fallbacks in sandbox dropdown loaders — cosmetic; global sandbox selector overrides when using hosted APIs. |
| XDM paths | `_demoemea.*` throughout — align with **your** tenant namespace. |

### 5.6 Docs

| File | Purpose |
|------|---------|
| `docs/FIREBASE_STANDALONE_DEPLOY.md` | Firebase sandbox default. |
| `docs/COLLEAGUE_PROFILE_VIEWER.md` | Local Profile Viewer + env notes. |

---

## 6. Schema & field group documentation (practical)

1. **Export** from Schema Registry (UI or API) for each schema `$id` you depend on — store JSON in `docs/schemas/reference/` (redact if needed).  
2. **Field groups**: list mixin titles and extension of class (`_xdm.context.profile` / `experienceevent`) — recreate in your sandbox or use package.  
3. **Lineage**: for each dataset, note `schemaRef` and **primary identity** descriptor — required for Profile and streaming validation.  
4. **Decisioning**: document AJO **channel** + **surface** URIs alongside Platform schema for **personalization/decision items** if using DPS REST presets in the lab.

---

## 7. Success criteria

- [ ] Every **hardcoded** `run.app`, **dataset ID**, **schema $id**, **flow GUID**, **datastream UUID**, and **DSN URL** in `web/` and `content-decision-live.html` is listed and either replaced or documented as intentional.  
- [ ] **Webhook allowlist** (`functions/index.js`, `proxy_server.py`) matches **your** listener or a shared team listener.  
- [ ] **Profile Viewer** `.env` (local) and **Firebase** function env document **your** sandbox technical name and any Query dataset overrides.  
- [ ] **Launch + Edge** point at **your** dev datastream wired to **your** sandbox datasets.  
- [ ] Optional: committed **sandbox manifest template** + gitignored filled manifest per developer.

---

## 8. Ownership

| Role | Task |
|------|------|
| **Platform admin** | Recreate schemas, datasets, flows, identities in target sandbox. |
| **AJO admin** | Channels, surfaces, journeys, custom actions to webhook URL. |
| **You (repo)** | Replace defaults, allowlists, and optional manifest; keep this doc updated when adding new demos. |

For **automated schema / field-group / HTTP-flow provisioning** and an optional MCP façade, see [`SCHEMA_SERVICE_MCP_PLAN.md`](./SCHEMA_SERVICE_MCP_PLAN.md).

This plan is meant to be **run once per sandbox migration** and **updated** when new hardcoded dependencies are added to the lab or Profile Viewer.
