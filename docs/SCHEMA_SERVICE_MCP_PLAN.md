# Schema service & MCP plan — sandbox provisioning for AEP-Decisioning

This document describes how to add a **schema / field-group / HTTP-flow provisioning layer** so any **sandbox** can be checked and (when needed) brought up to the shape your **content service** and Profile tooling expect. It complements the inventory work in [`DEPENDENCY_AUDIT_PLAN.md`](./DEPENDENCY_AUDIT_PLAN.md).

---

## 1. Goals

| Goal | Outcome |
|------|--------|
| **Discover** | For a given `imsOrg` + `sandbox` + **spec version**, list schemas, field groups, dataset, and HTTP streaming flow status vs desired state. |
| **Validate** | Confirm consent-related XDM paths exist (aligned with Profile Viewer / `profileConsentPayload.js` expectations). |
| **Provision** | Idempotently create or patch schema, attach field groups, create dataset (Profile-enabled), create HTTP API → dataset flow; persist a **manifest** for runtime. |
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
| `dataset` | Naming prefix, Profile enablement, identity descriptor expectations (documented; creation via Catalog API) |
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
- **Flow Service / Sources:** list or resolve flows linked to HTTP API inlets (as supported by API).

### Phase 2 — Diff

Produce a machine-readable report:

- Consent-capable **schema** present? (class + required mixins / `allOf` refs.)
- **Field groups** attached to that schema descriptor?
- **Dataset** exists, correct schema, Profile enabled?
- **HTTP flow** exists with retrievable **inlet URL** and **flow id**?

### Phase 3 — Apply (idempotent)

Order (adjust per Adobe prerequisites):

1. Create schema if no matching descriptor (by spec tag / name convention).
2. PATCH schema to add field groups / mixins per Adobe schema patch rules.
3. Create dataset if missing; enable for Profile; set primary identity as required.
4. Create source connection + flow for HTTP API streaming → dataset (multi-step; may return async job ids — poll until terminal state).
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
| HTTP API inlet + flow | Sources / Flow Service (HTTP API streaming pattern) |

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
5. **Wire** content-decision / profile streaming defaults to manifest (fallback to env).
6. **MCP adapter** (local) calling the HTTPS API.
7. **Optional:** package export/import docs for field groups across sandboxes (Adobe packages), linked from [`DEPENDENCY_AUDIT_PLAN.md`](./DEPENDENCY_AUDIT_PLAN.md) §6.

---

## 11. Success criteria

- [ ] Pointing at a **fresh sandbox** with spec `content-service-v1` yields a clear **diff** report (missing schema, mixins, dataset, flow).
- [ ] **Apply** (or manual steps guided by report) produces a **manifest** sufficient for Profile consent streaming and lab defaults.
- [ ] Re-running **apply** does not duplicate datasets/flows (idempotent).
- [ ] Runtime **content service** uses manifest IDs, not colleague hardcoded values.
- [ ] Optional MCP tools only invoke **your** API, with Adobe credentials server-side only.

---

## 12. Related repo files

| Area | Files |
|------|--------|
| Profile / consent expectations | `functions/profileConsentPayload.js`, `functions/profileTableHelpers.js` |
| Adobe proxy pattern | `functions/index.js` (`aepProxy`, secrets) |
| Streaming / tenant paths | `colleague-cursor/.../server.js`, `web/profile-viewer/profile-streaming-shared.js` |
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
| `/api/consent-infra/status` | GET | Reports whether **Profile Core v2** mixin exists, schema **AEP Profile Viewer - Consent - Schema** (or legacy **AEP Decisioning — Profile + Consent**), **Email** primary-identity descriptor on `_{tenant}.identification/core/email`, and Catalog dataset **AEP Profile Viewer - Consent - Dataset**. |
| `/api/consent-infra/ensure` | POST | Creates missing schema/dataset with those canonical names; dataset is **not** enabled for Profile. Adds **union** tag (best effort), **primary Email** descriptor. In AEP UI, name the HTTP streaming dataflow **AEP Profile Viewer - Consent - Dataflow**. Requires **Profile Core v2** in the sandbox. |
| `/api/profile/update` | POST | Streams profile updates to DCS; body must include `streaming.url`, `streaming.flowId`, optional `streaming.datasetId` / `schemaId` / `xdmKey` for envelope mode, plus `email`, `ecid`, `updates` or `consent`. |

**HTTP API dataflow** (inlet URL + `x-adobe-flow-id`) is still created in the **AEP UI** (or Sources API); the Consent page stores URL + Flow ID in **localStorage** per browser.

**Profile Viewer Consent** (`consent.html`): **Check sandbox status**, **Prepare sandbox**, streaming fields, **Save connection**, then **Update consent preferences** (hosted).
