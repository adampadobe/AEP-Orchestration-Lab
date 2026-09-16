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
| Tags | `/tags` | No |

Paths above were confirmed with a live GET (and, for tags/ranking-formulas, a full
create→update→delete cycle) against sandbox `apalmer` — note that eligibility rules live at
**`/offer-rules`**, not `/eligibility-rules` (the Experience League docs for this section
were unreachable at the time of writing; the docs-linked slugs for eligibility
rules/ranking formulas/placements 404'd, so this table is the source of truth until
re-verified). Schema tags seen: `offer-rules` → `.../offer-management/eligibility-rule`,
`ranking-formulas` → `.../offer-management/ranking-function`, `placements` →
`.../offer-management/placement`, `tags` → `.../offer-management/tag`.

**Confirmed live create payload requirements not obvious from the schema alone:**
- **Offer-items** need a sibling `_experience.decisioning.offeritem.lifecycleStatus`
  (e.g. `"draft"`) alongside `decisionitem` — omitting it fails with a generic
  `500 Error during deserialization`, not a helpful validation message.
- **Eligibility rules (`offer-rules`)** need `exdRule: true` to be usable — without it,
  the rule saves fine but Adobe later rejects it as "not an ExD rule" when referenced from
  an offer's `itemConstraints` or a selection strategy's `profileConstraint`. The MCP's
  `change_apply` defaults this to `true` on create when the caller omits it.
- **Offer-level eligibility** (`_experience.decisioning.decisionitem.itemConstraints`)
  requires `profileConstraintType` to be set alongside `eligibilityRule` — Adobe rejects
  `{eligibilityRule: <id>}` alone with "Cannot specify eligibilityRule without a declared
  profileConstraintType". Confirmed shape: `{profileConstraintType: 'eligibilityRule',
  eligibilityRule: <rule id>}`; detach with `{profileConstraintType: 'none'}`. A JSON Patch
  `op: 'add'` on this path works for both the first set *and* replacing an existing value
  (DPS treats `add` as upsert here) — no need to branch on `add` vs `replace`.
- **Item-collections' `constraints`** are not a simple field/operator/value filter — each
  entry is `{itemCatalogId, constraint: "<SQL-like WHERE predicate string>", uiModel:
  {...}}`, where `uiModel` carries per-field UI metadata (title, type, source) matched to
  the schema's field registry. This is materially more involved than the other resource
  types' payloads and is why there is no `lab_decisioning_collection_preview` compound
  builder — building one correctly needs a follow-up investigation into the field-metadata
  registry, not a small DSL.
- **Offer-item tagging (`itemTags`)** — confirmed the value is *not* the tag's `dps:tag:...`
  id (`"Invalid [tagId] id"`) and *not* its bare hex suffix either (`"At least one of the
  tags is invalid"`) — but neither of those was the tag's actual dashed UUID (the `id` field
  `GET /tags` returns), which was never tried at the time. A separately deployed ExD
  accelerator MCP (`exd-accelerator-mcp`) confirms that full UUID, used verbatim in a plain
  array, is the correct value. Rather than hard-code even a well-evidenced answer,
  `lab_decisioning_tag_bulk_apply` still resolves this live at write time: it tries the raw
  UUID first, then `name`, then `{tags: [...]}`, then the URL-wrapped id as a last resort,
  against the real first write in a sandbox, and caches whichever format DPS accepts
  (`functions/decisioningTagFormatStore.js`) so every later call in that sandbox skips
  straight to it. See "MCP write/bulk layer" below.

Many **list decision items** calls require header **`x-schema-id`** (your decision item schema). Pass it through the local proxy as `platform_headers` (see below).

## MCP write/bulk layer (`tools/aep-lab-profile-mcp`, `/mcp/decisioning`)

The Decisioning MCP context wraps all seven resource types above with a governed, two-phase
write model (mirrors `functions/commerceOptimizerService.js`'s ingestion plan — stateless,
no persisted "pending preview" record):

| Cloud Function route | MCP tool | Notes |
|---|---|---|
| `POST /api/decisioning/catalog/change-preview` | `lab_decisioning_catalog_change_preview` | Local hash-bound preview for create (`item`) or update (`patches`); no Adobe call. Returns `preflight_id` + `required_confirmation`. |
| `POST /api/decisioning/catalog/change-apply` | `lab_decisioning_catalog_change_apply` | One non-retried create/update. Requires the unchanged `item`/`patches`, `preflight_id`, and exact `confirmation`. |
| `POST /api/decisioning/catalog/delete-audit` | `lab_decisioning_catalog_delete_audit` | Re-reads current state, runs a best-effort dependency scan (`referencedBy` — currently checks `selection-strategies` referencing an `item-collections` or `ranking-formulas` id), returns `expected_name`. |
| `POST /api/decisioning/catalog/delete-apply` | `lab_decisioning_catalog_delete_apply` | Re-reads and fails closed (409) if the entity changed since audit, then one DELETE. |
| *(none — MCP-side orchestration only)* | `lab_decisioning_catalog_bulk_apply` | Async, resumable create/update for 1–200 items. DPS has no array-body batch endpoint, so this loops sequentially (preview+apply per item, small retry on 429/5xx) via a Firestore job (`decisioning_bulk_write`), pollable with the existing `lab_batch_job_status`. |
| *(reuses `change-preview` — MCP-side only)* | `lab_decisioning_catalog_clone_preview` | Fetches a source entity, strips server-assigned fields, applies recursive find/replace, hands off to the existing `change_apply` (no new backend route). Works across all seven entity types. |
| *(reuses `change-preview` — MCP-side only)* | `lab_decisioning_ranking_formula_preview` | Builds the confirmed live payload shape from a `formula_type` enum instead of the raw object. |
| *(reuses `change-preview` — MCP-side only)* | `lab_decisioning_selection_strategy_preview` | Resolves collection/ranking-formula/eligibility-rule references by id-or-name and builds the raw payload. Hard guard: refuses to set strategy-level eligibility (from either `eligibility_rule_id_or_name` or `audience_id_or_name`) unless the caller states `user_explicitly_chose_strategy_level: true`. |
| *(reuses `change-preview` — MCP-side only)* | `lab_decisioning_attach_offer_eligibility_preview` | Builds the confirmed `itemConstraints` JSON Patch to attach/detach offer-level eligibility. Hard guard: refuses to set offer-level eligibility unless the caller states `user_explicitly_chose_offer_level: true` — symmetric with the selection-strategy guard, so neither tool silently picks the attach point on the caller's behalf. Both this tool and `selection_strategy_preview` also accept `audience_id_or_name` (mutually exclusive with `eligibility_rule_id_or_name`): auto-wraps an RT-CDP audience into an `"Audience: <name>"` eligibility rule with a `segmentMembership` PQL condition, reusing it by exact name on repeat calls instead of duplicating. If no such rule exists yet, returns a ready-to-run `change-preview` payload to create it first (via the normal `lab_decisioning_catalog_change_apply` gate) rather than creating it silently. The PQL shape mirrors Adobe's documented segment-membership pattern and the confirmed-live `{type:'PQL', format:'pql/text', value}` expression object from ranking-formulas, but has not itself been confirmed live for an offer-rule condition — verify the created rule. Reusing an audience also requires the caller's own `X-AEP-Lab-Mcp-Key` (same constraint as `lab_audience_list`/`lab_audience_audit`), so it 401s under pure Adobe IMS Coworker auth. |
| `POST /api/decisioning/schema/extend-preview` | `lab_decisioning_schema_extend_preview` | Add-only diff of 1-50 proposed fields against the offer-items schema's tenant field group (Schema Registry). Never removes or retypes an existing field — a same-name field with a different shape is reported as a `conflict`, not applied. Returns `preview_hash`. |
| `POST /api/decisioning/schema/extend-apply` | `lab_decisioning_schema_extend_apply` | One non-retried field-group `PATCH` (`op: add` only). Requires the unchanged `fields`, `preview_hash`, and `confirmed: true` — a boolean gate, not a typed confirmation phrase, since a field list doesn't have a natural "entity name" to echo back. Re-reads the field group first; a changed `meta:eTag` fails closed as `error: "schema_drifted"`. |
| `POST /api/decisioning/tags/bulk-preview` + `POST /api/decisioning/tags/bulk-apply` + `POST /api/decisioning/tags/apply-one` | `lab_decisioning_tag_bulk_preview` / `lab_decisioning_tag_bulk_apply` | Resolves 1-20 tags and an `offer_selector` (`ids`, `name_prefix`, or `collection` — the last only works when the collection happens to carry an explicit member-id list, not DPS's usual opaque predicate) against up to 200 offers, then attaches/detaches/replaces sequentially in the background (Firestore job `decisioning_tag_bulk_write`, pollable with `lab_batch_job_status`). `action=replace` overwrites each offer's entire tag set to exactly the given tags, unlike `attach`/`detach` which merge with or subtract from the existing set. `bulk-apply` takes only `{sandbox, preview_hash, confirmed, resume_token?}` — the resolved plan is cached server-side by its own `preview_hash` (`functions/decisioningTagBulkPreviewStore.js`, 1-hour TTL) so a large matched-offer list never needs to be resent; `resume_token` is the job id, letting an interrupted batch continue from its first unprocessed offer instead of restarting. Every per-offer write re-reads that offer's live tags immediately before patching it, so drift since preview fails closed at the item level and an already-satisfied offer is a `no_op`, not a failure. |

Backend implementation: `functions/decisioningCatalogWriteService.js` (write operations) and
`functions/decisioningCatalogService.js` (read + shared `platformFetch`/allowlist, now with
`body` support for POST/PATCH/DELETE, and `resolveEntityIdOrName` for id-or-name lookups).
The schema-extend and tag-bulk pairs above are separate services that reuse those two —
`functions/decisioningSchemaExtendService.js` (plus `functions/catalogConfigStore.js` for the
offer schema id) and `functions/decisioningTagBulkService.js` (plus
`functions/decisioningTagFormatStore.js` and `functions/decisioningTagBulkPreviewStore.js`) —
rather than folding non-DPS-entity writes (a Schema Registry field group; a per-offer tag
diff) into `decisioningCatalogWriteService.js`'s single-entity plan/hash model.
Write verbs, confirmed live against sandbox `apalmer` (create + update + delete on a
disposable `ranking-formulas` object) are `POST` (create), `PATCH` (update) and `DELETE`
(delete) against the same single-resource paths as the read side. **Update uses `PATCH`
with an RFC 6902 JSON Patch body** (`[{op, path, value}]`, `Content-Type:
application/json-patch+json`) — a full-object `PUT` also works on DPS, but a JSON Patch is
safer: it only touches the fields it names, where a full-object `PUT` silently nulls out
anything the caller omits. (An earlier version of this doc said update was `PUT`; that
shipped, then got corrected to `PATCH` after inspecting a competing MCP's tool schemas,
which all use JSON Patch for updates.)

**id-or-name resolution.** Every write/delete/get tool accepts either a literal DPS id or an
exact display name — `resolveEntityIdOrName` tries the value as an id first, and on either
404 (not found) or 400 (confirmed live: DPS rejects an id-shaped path segment containing
spaces — e.g. a plain display name — with 400, not 404) falls back to a case-insensitive
exact-name search against the **first page only** (`MAX_LIMIT` = 50 items). This is a
deliberate v1 limit: DPS's `_links.next` cursor format
for these endpoints has never been exercised (result counts in testing were always small),
so pagination is unverified — scanning only page 1 keeps this honest rather than guessing at
an unconfirmed cursor shape. A name matching more than one entity fails with a 409 listing
every match so the caller can retry with the exact id.

## Required headers (Platform REST)

| Header | Purpose |
|--------|---------|
| `Authorization: Bearer {TOKEN}` | IMS access token |
| `x-api-key` | Adobe Developer Console integration API key |
| `x-gw-ims-org-id` | IMS org |
| `x-sandbox-name` | Sandbox technical name |
| `Content-Type: application/json` | For POST (create); `application/json-patch+json` for PATCH (update) |
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
