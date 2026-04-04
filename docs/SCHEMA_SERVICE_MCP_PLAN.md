# Schema service & MCP plan — sandbox provisioning for AEP-Orchestration-Lab

This document describes how to add a **schema / field-group / HTTP-flow provisioning layer** so any **sandbox** can be checked and (when needed) brought up to the shape your **content service** and Profile tooling expect. It complements the inventory work in [`DEPENDENCY_AUDIT_PLAN.md`](./DEPENDENCY_AUDIT_PLAN.md).

---

## 1. Goals

| Goal | Outcome |
|------|--------|
| **Discover** | For a given `imsOrg` + `sandbox` + **spec version**, list schemas, field groups, dataset, and HTTP streaming flow status vs desired state. |
| **Validate** | Confirm consent-related XDM paths exist (aligned with Profile Viewer / `profileConsentPayload.js` expectations). |
| **Provision** | Idempotently create or patch schema, attach field groups, create dataset (**consent lab:** not Profile-enabled — see §14), create HTTP API → dataset flow; persist a **manifest** for runtime. |
| **Expose to AI** | Optional **MCP** tools that call your HTTPS API (not raw Adobe from the IDE). |
| **Scale** | Rare writes, frequent reads of a small manifest; queue or chunk work when Adobe workflows exceed function timeouts. |

---

## 2. Architecture — Firebase vs MCP

**MCP** (Model Context Protocol) is a **client ↔ server protocol** (tools, resources; often stdio or HTTP/SSE). **Firebase Cloud Functions** are **stateless HTTPS** handlers.

| Layer | Responsibility |
|-------|----------------|
| **Provisioning API** (Firebase Gen2 HTTPS, or Cloud Run if you need longer runs) | IMS `client_credentials`, `x-gw-ims-org-id`, `x-sandbox-name`; calls Adobe Schema Registry, Catalog, Flow Service / Sources. |
| **Optional MCP server** (local Node or Cloud Run) | Maps MCP `tools/call` → your Provisioning API with **your** auth (API key, App Check, JWT). Cursor / agents never hold Adobe secrets. |
| **Runtime** (existing `functions/` + web) | Reads **manifest** (Firestore or env) for `datasetId`, `inletUrl`, `flowId`, `schemaId`, `xdmTenantKey` — does not reprovision on every request. |

**Recommendation:** implement **Provisioning API + manifest first**; add **MCP as a thin adapter** second. Avoid embedding a full MCP host inside a single Cloud Function unless you standardize on HTTP/SSE MCP and keep handlers minimal.

---

## 3. Desired state — versioned spec

Define one or more JSON specs checked into repo, e.g. `config/provisioning-specs/content-service-v1.json`:

| Field | Purpose |
|-------|--------|
| `specId` | e.g. `content-service-v1` |
| `profileClass` | `_xdm.context.profile` (and/or EE class if you provision both) |
| `requiredFieldGroupRefs` | List of field group `$id` URIs **or** stable internal keys mapped to org-specific IDs via a small registry |
| `consentPaths` | Optional: explicit XDM paths that must exist for consent UI (for validation only) |
| `dataset` | Naming prefix, Profile enablement policy per spec (**consent:** must stay off Profile), identity descriptor expectations (Catalog API) |
| `httpStreaming` | Template intent: “HTTP API → above dataset” per Adobe’s HTTP API source / flow docs |
| `tags` | Label keys/values to find existing resources idempotently (e.g. `aep-decisioning:spec=content-service-v1`) |

**Consent alignment:** cross-check with runtime code under `functions/profileConsentPayload.js` and streaming paths in Profile Viewer (`consents.*`, `optInOut._channels`, tenant key from `AEP_PROFILE_XDM_KEY` / `_demoemea`).

---

## 4. Phases (orchestration)

### Phase 0 — Auth context

- Resolve Adobe access token (same pattern as `functions/index.js` + secrets).
- Every downstream call sets **`x-sandbox-name`** from the request (no silent default on mutate paths).

### Phase 1 — Discover (read-only)

- **Schema Registry:** list / get tenant schemas; filter by `meta:class` and optional labels.
- **Field groups:** list available field groups (global + org); resolve `$id`s needed by spec.
- **Catalog:** list datasets (filter by schema ref or labels).
- **Flow Service / Sources:** list or resolve flows by **name** and linked **source/target connections** (for §15 idempotency and status); resolve **inlet URL** from connection entities where exposed.

### Phase 2 — Diff

Produce a machine-readable report:

- Consent-capable **schema** present? (class + required mixins / `allOf` refs.)
- **Field groups** attached to that schema descriptor?
- **Dataset** exists, correct schema, Profile enabled? (**Consent automation:** schema must **not** have `union` in `meta:immutableTags`; dataset must **not** be Profile-enabled.)
- **HTTP flow** exists with retrievable **inlet URL** and **flow id**?

### Phase 3 — Apply (idempotent)

Order (adjust per Adobe prerequisites):

1. Create schema if no matching descriptor (by spec tag / name convention).
2. PATCH schema to add field groups / mixins per Adobe schema patch rules.
3. Create dataset if missing; **consent lab:** do **not** enable for Profile; other specs may enable per requirements; set primary identity as required.
4. Create source connection + flow for HTTP API streaming → dataset — **concrete API sequence in §15** (multi-step; async jobs; poll until terminal state).
5. Write **manifest** document (see §6).

All mutating steps should be **safe to re-run**: check-before-create; use stable names + labels to find existing resources.

### Phase 4 — Handoff

Return manifest payload to caller and store in Firestore for content service and local dev sync.

---

## 5. Adobe API surface (reference)

Exact paths and payloads live in **Adobe Experience Platform API** documentation (Schema Registry, Catalog Service, Flow Service, Sources). This repo already proxies `https://platform.adobe.io` in `functions/index.js` (`aepProxy`); provisioning can either:

- **Extend** allowed methods/paths on that proxy (tight allowlist), or  
- **Dedicated** function module(s) with explicit Adobe URLs for schema / catalog / flow (easier to audit).

Typical operations:

| Concern | API area |
|---------|----------|
| List / create / patch schemas | Schema Registry (XDM) |
| List field groups; attach to schema | Schema Registry |
| Create / update datasets | Catalog |
| HTTP API inlet + flow | **Flow Service** primary; **Sources** catalog aligns with the same connectors — see **§15** for the ordered REST sequence. |

**Note:** Creating **new** custom field groups is a heavier workflow than **attaching existing** standard or packaged field groups; prefer attaching known `$id`s per sandbox where packages are aligned.

---

## 6. Manifest model (runtime contract)

Store per **`(imsOrgId, sandboxTechnicalName, specId)`**, e.g. Firestore path:

`provisioningManifests/{orgHash}_{sandbox}_{specId}`

Suggested fields:

```json
{
  "specId": "content-service-v1",
  "imsOrg": "...@AdobeOrg",
  "sandbox": "your-sandbox-technical-name",
  "profileSchemaId": "https://ns.adobe.com/.../schemas/...",
  "xdmTenantKey": "_demoemea",
  "profileDatasetId": "...",
  "profileDatasetQualifiedName": "...",
  "httpStreamingInletUrl": "https://dcs.adobedc.net/collection/...",
  "httpStreamingFlowId": "...",
  "provisionedAt": "ISO-8601",
  "provisionedBy": "serviceAccount|userId",
  "checksum": "hash-of-spec-version"
}
```

**Content service and Firebase functions** should read this manifest (or env injected at deploy from a one-off export) instead of hardcoding colleague IDs.

---

## 7. MCP tool design (optional)

Keep MCP tools **coarse**; expose granular REST only for humans/scripts.

| Tool | Behavior |
|------|----------|
| `sandbox_provisioning_status` | Phases 1–2 only; `sandbox`, `specId`; returns diff JSON. |
| `sandbox_provisioning_apply` | Phase 3; supports `dryRun: true`; requires stronger auth server-side. |
| `sandbox_provisioning_flow` | (Optional) Executes **§15** only — HTTP API streaming → existing dataset; returns `inletUrl` + `flowId` for manifest / Consent store; same idempotency rules as §15.6. |
| `sandbox_list_manifests` | Lists stored manifests for the org (optional filter by sandbox). |

MCP server configuration:

- **Base URL** — Firebase function URL or API Gateway.
- **Auth** — Header or OAuth to **your** API; **not** Adobe IMS secret in MCP env.

---

## 8. Scaling, limits, and reliability

| Topic | Approach |
|-------|----------|
| **Function timeout** | If apply chain > ~60s (or your configured max), split: enqueue **Cloud Tasks** / Firestore **job doc** + worker function; checkpoint after each Adobe step. |
| **Cold starts** | Warm provisioner sparingly; runtime path only reads manifest. |
| **Adobe rate limits** | Serialize or lightly throttle per `sandbox`; retry with backoff on 429. |
| **Concurrency** | One active **apply** per `(org, sandbox, spec)` lock (Firestore transaction or lock doc). |
| **Drift detection** | Scheduled **read-only** diff job; alert if UI/manual changes diverge from manifest. |

**Cloud Run** alternative: use for a single long-running “provision” container if you want one process to hold state without chunking (still persist manifest at end).

---

## 9. Security and governance

- **Least privilege:** separate Adobe product profile for “provisioner” vs “runtime profile read.”
- **Sandbox isolation:** validate `sandbox` against an allowlist if the API is multi-tenant beyond your org.
- **Audit log:** append-only entries for each apply (who, what spec, resource ids created).
- **Secrets:** IMS client secret only in Firebase Secret Manager / env; never returned to MCP clients.

---

## 10. Implementation order (suggested)

1. **Manifest schema** + manual Firestore document (prove content / functions can read it).
2. **GET** `provisioning/status` — Phases 1–2, read-only.
3. **POST** `provisioning/apply` — Phase 3 behind auth; `dryRun` + idempotency key header.
4. **Worker / task split** if timeouts hit in real sandboxes.
5. **Implement §15** (Flow Service) for HTTP API → dataset; merge `inletUrl` + `flowId` into manifest and Consent Firestore doc (same shape as manual paste today).
6. **Wire** content-decision / profile streaming defaults to manifest (fallback to env).
7. **MCP adapter** (local) calling the HTTPS API.
8. **Optional:** package export/import docs for field groups across sandboxes (Adobe packages), linked from [`DEPENDENCY_AUDIT_PLAN.md`](./DEPENDENCY_AUDIT_PLAN.md) §6.

---

## 11. Success criteria

- [ ] Pointing at a **fresh sandbox** with spec `content-service-v1` yields a clear **diff** report (missing schema, mixins, dataset, flow).
- [ ] **Apply** (or manual steps guided by report) produces a **manifest** sufficient for Profile consent streaming and lab defaults.
- [ ] Re-running **apply** does not duplicate datasets/flows (idempotent), including HTTP flows resolved by stable name (see §15.6).
- [ ] Runtime **content service** uses manifest IDs, not colleague hardcoded values.
- [ ] Optional MCP tools only invoke **your** API, with Adobe credentials server-side only.

---

## 12. Related repo files

| Area | Files |
|------|--------|
| Profile / consent expectations | `functions/profileConsentPayload.js`, `functions/profileTableHelpers.js` |
| Adobe proxy pattern | `functions/index.js` (`aepProxy`, secrets) |
| Streaming / tenant paths | `aep-prototypes/.../server.js`, `web/profile-viewer/profile-streaming-shared.js` |
| Flow Service (read reference; §15 automation TBD) | `aep-prototypes/AEP Profile/03 Profile Viewer/server.js` (`FLOW_SERVICE_BASE`, `GET /flows/{flowId}`) |
| DCS forward / envelope | `functions/index.js` (`profileUpdateProxy`), `proxy_server.py` |
| Consent schema + dataset | `functions/consentInfraService.js` |
| Dependency inventory | [`docs/DEPENDENCY_AUDIT_PLAN.md`](./DEPENDENCY_AUDIT_PLAN.md) |

This plan should be updated when the **spec** format or Adobe onboarding steps change.

---

## 13. Implemented Firebase endpoints (Schema Registry)

These use the same secrets as other functions (`ADOBE_CLIENT_ID`, `ADOBE_CLIENT_SECRET`, `ADOBE_IMS_ORG`, `ADOBE_SCOPES`). **`x-sandbox-name`** is set from `?sandbox=` or the deploy default (`ADOBE_SANDBOX_NAME` / `DEFAULT_ADOBE_SANDBOX`). Do **not** paste bearer tokens into the repo or client apps.

| Hosting path | Method | Behavior |
|--------------|--------|----------|
| `/api/provisioning/tenant-schemas` | GET | List tenant schemas. Optional query: `start`, `limit`, `orderBy`, `properties`, `property` (forwarded to Adobe). |
| `/api/provisioning/tenant-schemas` | GET | Single schema: add `?altId=<meta:altId>` (or `metaAltId=`). |
| `/api/provisioning/tenant-schemas` | POST | Create tenant schema. Body = descriptor JSON (same as Postman), or `{ "descriptor": { ... } }`. |
| `/api/provisioning/field-groups` | GET | List global field groups. Optional `?class=https://ns.adobe.com/xdm/context/profile` and list params above. |
| `/api/provisioning/tenant-schema/patch` | POST | Body: `{ "metaAltId": "_org.schemaname", "ifMatch": "<etag/version from GET>", "operations": [ ... ] }` — `operations` is sent as the Adobe PATCH body (e.g. JSON Patch). |

Implementation: `functions/schemaRegistryService.js`, exports in `functions/index.js`, rewrites in `firebase.json`.

**IMS scopes:** the OAuth client must be allowed to call Schema Registry for your org (same technical account as Profile / Catalog). If create returns 403, add the appropriate **Experience Platform** API and Schema Registry permissions to the product profile in Adobe Developer Console.

**Security:** endpoints are currently `invoker: public` like other lab proxies — restrict with App Check / IAM before production use.

---

## 14. Consent sandbox automation (implemented)

| Hosting path | Method | Purpose |
|--------------|--------|---------|
| `/api/consent-infra/status` | GET | **Profile Core v2**, schema **AEP Profile Viewer - Consent - Schema** (or legacy title), **Email** primary-identity descriptor, dataset **AEP Profile Viewer - Consent - Dataset**. Also **`schemaInProfileUnion`** / **`warnings`** if `meta:immutableTags` includes **`union`** (then **`ready`** is false). |
| `/api/consent-infra/ensure` | POST | Creates missing schema/dataset with those canonical names. **Aborts** if the schema already has the **union** tag (Profile-enabled; Adobe does not support removing it). Otherwise schema and dataset stay **out** of Real-Time Customer Profile. Adds **primary Email** descriptor. HTTP dataflow **AEP Profile Viewer - Consent - Dataflow** is **manual in AEP UI today**; **planned automation** follows **§15** (Flow Service). Requires **Profile Core v2**. |
| `/api/profile/update` | POST | Streams profile updates to DCS; body must include `streaming.url`, `streaming.flowId`, optional `streaming.datasetId` / `schemaId` / `xdmKey` for envelope mode, plus `email`, `ecid`, `updates` or `consent`. |
| `/api/consent-connection` | GET | Returns Firestore doc for `?sandbox=` (or deploy default): `streaming` + `infra` IDs. |
| `/api/consent-connection` | POST | Merges body `streaming` / `infra` into the same doc (Admin SDK). Collection `consentConnections`; client SDK denied by rules. |
| `/api/consent-infra/flow-lookup` | GET | After the HTTP API dataflow exists in AEP, resolves **DCS collection URL** + **flow id** via Flow Service (`GET /flows` by name or `GET /flows/{flowId}`, then **sourceConnections** for `inletUrl`). Query: `sandbox`, optional `flowId`, optional `flowName`. |

**HTTP API dataflow:** the user still **creates** the dataflow in **AEP** (or via full **§15** automation when implemented). **Lookup:** `flow-lookup` avoids manual copy/paste of URL and Flow ID. **Implementation target:** §15 **create** path so the dataflow itself is also API-driven.

**Profile Viewer Consent** (`consent.html`): status + wizard steps, **Save connection**, **Update consent preferences** (hosted).

---

## 15. HTTP API streaming dataflow — Flow Service API sequence (implementation plan)

This section expands **§4 Phase 3 — step 4** into an ordered, automatable sequence. Base URL:

`https://platform.adobe.io/data/foundation/flowservice`

All calls use the same headers as other Platform APIs: `Authorization: Bearer …`, `x-api-key`, `x-gw-ims-org-id`, **`x-sandbox-name`**. Exact JSON bodies change when Adobe revises connection specs; always validate against current **Flow Service** and **Sources** documentation for “HTTP API” streaming.

### 15.1 Prerequisites (before Flow Service)

- **Dataset** exists in Catalog and is bound to the correct schema (consent lab: dataset **not** enabled for Profile).
- **OAuth technical account** has Flow Service / Sources permissions (Developer Console product profile: Experience Platform + data ingestion / sources as required for your org).
- Optional but recommended: stable **flow name** (e.g. `AEP Profile Viewer - Consent - Dataflow`) for **LIST → reuse** idempotency (§15.6).

### 15.2 Resolve the HTTP API streaming connection spec

1. **`GET /connectionSpecs`** (with query filters as documented, e.g. by `flowType`, `mode`, or keyword for HTTP / streaming).
2. From the response, select the **connection specification** whose `name` / `attributes` match the **HTTP API** streaming source for your catalog (Adobe labels evolve; do not hardcode an id in repo config until verified per org).
3. Record **`connectionSpec.id`** for subsequent `POST` bodies.

### 15.3 Base connection

1. **`POST /connections`** with a body that references the chosen **`connectionSpec.id`** and supplies required `auth` / `params` per spec (HTTP streaming often uses minimal or empty auth on the base connection; follow the spec’s `requiredFields`).
2. Store returned **`id`** as `baseConnectionId`.
3. If the response or a follow-up **`GET /connections/{id}`** exposes **`inletUrl`** (DCS collection base), capture it; otherwise obtain it from the **source connection** or **flow** entity after creation (Adobe’s shape varies by spec version).

### 15.4 Source connection

1. **`POST /sourceConnections`** linking **`baseConnectionId`** to the flow’s source side, with `connectionSpec.id` and any **`data`** object required by the spec (e.g. ingestion mode).
2. Store **`id`** as `sourceConnectionId`.

### 15.5 Target connection (dataset)

1. **`POST /targetConnections`** using the **target** connection spec appropriate for **Data Lake / dataset** ingestion (again, resolve `connectionSpec.id` via `GET /connectionSpecs` or docs).
2. Body must reference the **dataset** (`dataSetId` / equivalent per spec) and match **non-Profile** settings for the consent lab dataset.
3. Store **`id`** as `targetConnectionId`.

### 15.6 Flow (dataflow) and mapping

1. **Idempotency (recommended):** `GET /flows?property=...` (or list with filter) and search by **name**; if a flow named **`AEP Profile Viewer - Consent - Dataflow`** already exists for this sandbox and targets the consent dataset, **reuse** it: read **`id`** as `flowId` and resolve **inlet URL** from linked connections; skip creates.
2. Otherwise **`POST /flows`** with the **flow spec** that wires **`sourceConnectionId`** → **`targetConnectionId`**, including:
   - **Schedule** for streaming (frequency / `as_needed` per Adobe pattern).
   - **Transformations** if **Data Prep** is required: create or reference a **mapping set** so incoming payload fields align with the dataset XDM schema (`functions/profileConsentPayload.js` paths must land under the tenant namespace expected by the flow).
3. On **`201`** / success, persist **`flowId`** (`items[0].id` or documented shape).
4. If Adobe returns **`202`** or an **operation** id, **poll** `GET /flows/{id}` or the documented **async status** endpoint until state is terminal (success or failure) — see **§8**.

### 15.7 Values to write into the manifest / Consent store

| Field | Source |
|-------|--------|
| `httpStreamingInletUrl` | DCS URL from connection / flow (e.g. `https://dcs.adobedc.net/collection/{inletId}`) |
| `httpStreamingFlowId` | Flow `id` (sent as **`x-adobe-flow-id`** to DCS) |
| `profileDatasetId` / `datasetId` | Catalog dataset used as target |
| `profileSchemaId` / `schemaId` | Schema `$id` for envelope mode if used |

These match what **`/api/profile/update`** and the Consent page already expect under **`streaming.url`**, **`streaming.flowId`**, optional **`streaming.datasetId`** / **`streaming.schemaId`**, **`streaming.xdmKey`**.

### 15.8 Failure modes (design for)

| Risk | Mitigation |
|------|------------|
| **Timeout** in one function | Checkpoint after §15.3–15.6; resume from stored partial IDs (**§8**). |
| **Mapping errors** | Validate with a test payload; log Flow Service error body; optional dry-run mapping API if Adobe exposes it for your spec. |
| **Duplicate flows** | Strict idempotency: list-by-name before `POST /flows`. |
| **Wrong Profile flags** | Target connection + dataset must remain **non-Profile** for consent lab; reject if Catalog dataset was toggled. |

### 15.9 Optional Sources API alignment

The **Sources** UI catalog maps to the same underlying specs. Some teams prefer **`GET /sources/connectionSpecs`** (if available for your API version) for discovery, then the same **Flow Service** `POST` sequence. Treat Sources responses as an alternate **discovery** path, not a second parallel flow graph, unless Adobe documents a single-call alternative.
