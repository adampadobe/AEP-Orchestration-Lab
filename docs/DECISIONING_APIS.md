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

| Concept | Typical path (after `/data/core/dps`) |
|---------|--------------------------------------|
| Decision items | `/offer-items` |
| Item collections | `/item-collections` |
| Selection strategies | `/selection-strategies` |
| Eligibility rules | Documented under [eligibility rules](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/experience-decisioning-api-reference/eligibility-rules/create) (exact list path in that section) |
| Ranking formulas | Documented under [ranking formulas](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/experience-decisioning-api-reference/ranking-formulas/create) |
| Placements (new model) | Documented under [placements](https://experienceleague.adobe.com/en/docs/journey-optimizer/using/decisioning/experience-decisioning/experience-decisioning-api-reference/placements/create) |

Many **list decision items** calls require header **`x-schema-id`** (your decision item schema). Pass it through the local proxy as `platform_headers` (see below).

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
cd "/Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AEP-Decisioning"
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
