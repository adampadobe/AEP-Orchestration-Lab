# Journey Optimizer: two decisioning stacks (APIs)

Adobe documents **two** decisioning product lines. This project targets **Experience Decisioning** only. Use the comparison below so you do not mix endpoints, UI flows, or Edge payloads.

| | **Offer Decisioning** (legacy) | **Experience Decisioning** (current) |
|---|----------------------------------|--------------------------------------|
| **Names in docs** | Decision Management, Offer Library, “Offer Decisioning” | “Decisioning”, Experience Decisioning |
| **Typical UI** | Older offer library / placements / personalized & fallback **offers** | Decision items, item collections, selection strategies, ranking, code-based experiences & email |
| **REST host** | `https://platform.adobe.io` | Same host |
| **REST API root** | `https://platform.adobe.io/data/core/dps` | Same **`/data/core/dps`** root for many CRUD operations |
| **Key resource paths** | `/offers?offer-type=personalized\|fallback`, legacy placement/activity model | **`/offer-items`**, **`/item-collections`**, **`/selection-strategies`**, eligibility rules, ranking formulas, placements for the new model |
| **Delivery / test** | Historical Edge “offer” flows; docs often labeled legacy | **Edge Network** via Web/Mobile SDK (`sendEvent`, `personalization.decisionScopes`), Assurance |

**Important:** The hostname is often the same (`/data/core/dps`), but **the resource paths and schemas differ**. Listing **`/offers`** is the legacy catalog; listing **`/offer-items`** is the Experience Decisioning catalog. Do not assume they return the same objects.

**Docs (canonical):**

- Experience Decisioning (use this): [Get started with Decisioning](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/gs-experience-decisioning) and [Decisioning API developer guide](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/experience-decisioning-api-reference/getting-started)
- Legacy Offer Library / Decision Management: [Getting started (legacy)](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/offer-decisioning/api-reference/getting-started) — reference only if you must touch old objects
- Migration (legacy → new): [Decisioning Migration API](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/migrate-to-decisioning/decisioning-migration-api)

## Experience Decisioning — REST (management)

Base: `https://platform.adobe.io/data/core/dps`

Common read paths (see Experience League for filters, paging, `x-schema-id`, and bodies):

| Concept | Path (after `/data/core/dps`) | `x-schema-id` required |
|---------|--------------------------------|------------------------|
| Decision items | `/offer-items` | Yes |
| Item collections | `/item-collections` | No |
| Selection strategies | `/selection-strategies` | No |
| Eligibility rules | **`/offer-rules`** | No |
| Ranking formulas | `/ranking-formulas` | No |
| Placements (new model) | `/placements` | No |

Paths above were confirmed with a live GET against sandbox `apalmer` — note that eligibility rules live at **`/offer-rules`**, not `/eligibility-rules` (the Experience League docs for this section were unreachable at the time of writing; the docs-linked slugs for eligibility rules/ranking formulas/placements 404'd, so this table is the source of truth until re-verified). Schema tags seen: `offer-rules` → `.../offer-management/eligibility-rule`, `ranking-formulas` → `.../offer-management/ranking-function`, `placements` → `.../offer-management/placement`.

Many **list decision items** calls require header **`x-schema-id`** (your decision item schema). Pass it through the local proxy as `platform_headers` (see below).

## MCP write/bulk layer (`tools/aep-lab-profile-mcp`, `/mcp/decisioning`)

The Decisioning MCP context wraps all six resource types above with a governed, two-phase
write model (mirrors `functions/commerceOptimizerService.js`'s ingestion plan — stateless,
no persisted "pending preview" record):

| Cloud Function route | MCP tool | Notes |
|---|---|---|
| `POST /api/decisioning/catalog/change-preview` | `lab_decisioning_catalog_change_preview` | Local hash-bound preview for create/update; no Adobe call. Returns `preflight_id` + `required_confirmation`. |
| `POST /api/decisioning/catalog/change-apply` | `lab_decisioning_catalog_change_apply` | One non-retried create/update. Requires the unchanged `item`, `preflight_id`, and exact `confirmation`. |
| `POST /api/decisioning/catalog/delete-audit` | `lab_decisioning_catalog_delete_audit` | Re-reads current state, runs a best-effort dependency scan (`referencedBy` — currently checks `selection-strategies` referencing an `item-collections` or `ranking-formulas` id), returns `expected_name`. |
| `POST /api/decisioning/catalog/delete-apply` | `lab_decisioning_catalog_delete_apply` | Re-reads and fails closed (409) if the entity changed since audit, then one DELETE. |
| *(none — MCP-side orchestration only)* | `lab_decisioning_catalog_bulk_apply` | Async, resumable create/update for 1–200 items. DPS has no array-body batch endpoint, so this loops sequentially (preview+apply per item, small retry on 429/5xx) via a Firestore job (`decisioning_bulk_write`), pollable with the existing `lab_batch_job_status`. |

Backend implementation: `functions/decisioningCatalogWriteService.js` (write operations) and
`functions/decisioningCatalogService.js` (read + shared `platformFetch`/allowlist, now with
`body` support for POST/PUT/DELETE). Write verbs, confirmed live against sandbox `apalmer`
(create + update + delete on a disposable `ranking-formulas` object) are `POST` (create),
`PUT` (update — full-object replace) and `DELETE` (delete) against the same single-resource
paths as the read side. DPS's `PATCH` is RFC 6902 JSON Patch (an array of operations), not a
full-object body, so it is deliberately not used here.

## Required headers (Platform REST)

| Header | Purpose |
|--------|---------|
| `Authorization: Bearer {TOKEN}` | IMS access token |
| `x-api-key` | Adobe Developer Console integration API key |
| `x-gw-ims-org-id` | IMS org |
| `x-sandbox-name` | Sandbox technical name |
| `Content-Type: application/json` | For POST/PUT/PATCH |
| `x-schema-id` | Often required for **`/offer-items`** and related decision-item operations |

Auth setup: Cursor skill at `/Users/apalmer/.cursor/skills/adobe-ims-auth/SKILL.md`.

## Edge testing (runtime decisions)

REST above **manages** definitions. **Edge** executes decisions for a profile/session.

See **[EDGE_TESTING.md](./EDGE_TESTING.md)** in this folder for Web SDK, `decisionScopes`, and Assurance.

## Real-Time CDP Profile (optional smoke test)

`GET https://platform.adobe.io/data/core/ups/access/entities` with profile schema + identity — useful to confirm the same identity you use in Edge exists in UPS. Parameter names: [Profile API](https://experienceleague.adobe.com/en/docs/experience-platform/profile/api/overview).

## Local proxy: `POST /api/aep`

Body JSON:

```json
{
  "method": "GET",
  "path": "/data/core/dps/offer-items",
  "params": { "limit": 10 },
  "platform_headers": {
    "x-schema-id": "YOUR_DECISION_ITEM_SCHEMA_ID"
  }
}
```

Only headers you list in `platform_headers` are added on top of IMS auth headers from `adobe_ims_auth`.

## Run the local lab

```bash
cd "/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AEP-Orchestration-Lab"
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

**Credentials:** install the **adobe-ims-auth** skill flow (`~/.config/adobe-ims/credentials.env` or `ADOBE_*` env vars). On this Mac you can reuse Campaign Orchestration’s file without copying secrets:

```bash
./scripts/with-campaign-adobe-env.sh .venv/bin/python proxy_server.py
```

Or `export ADOBE_CREDENTIALS_FILE="/path/to/.../adobe_auth/credentials.env"` then run `proxy_server.py`.

Open `http://127.0.0.1:8765/`.

Audit (Experience Decisioning–oriented):

```bash
python scripts/audit_decisioning.py
```
