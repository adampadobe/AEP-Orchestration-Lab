---
name: aep-offer-creation
description: >-
  Create draft Experience Decisioning items from supplied CSV headings, verified
  schemas and authorised source content. Tag items, build tag-based collections,
  eligibility rules and selection strategies with preview, confirmation, apply
  and raw readback. A connected Coworker MCP is optional.
---

# Governed offer creation through the Lab

Use for Experience Decisioning decision items, not legacy `/offers`, content
templates or live journeys. Read `docs/DECISIONING_APIS.md`. For website-to-catalog
work, also follow `.github/skills/create-decisioning-demo/SKILL.md` and
`docs/DECISIONING_CATALOG_PLANS.md`.

## Access and safety

- Confirm the exact sandbox before writing. Schema metadata is not consent.
- Prefer an actually exposed Lab `/mcp/decisioning` connection. Discover tools,
  then call `lab_decisioning_capabilities` and `lab_mcp_access_info` if available.
  Do not describe a configured but unexposed endpoint as callable.
- Without that connection, use the existing authorised Lab backend routes below,
  preserving their preview/confirmation controls. Do not request credentials in
  chat, invent credentials, or use an ungoverned proxy for writes.
- Default new items to **draft**. Do not approve them, modify source assets,
  activate policies or send messages. Approval/activation is a separate action.
- Show names, content, media, tag membership scope, collection predicate, ranking
  and targeting before obtaining explicit consent. A preview hash is not consent.
  Material changes require a new preview and confirmation.

## Inspect the source and live schema

Resolve the offer schema through `lab_decisioning_catalog_schema` or
`GET /api/decisioning/catalog/schema?sandbox=<sandbox>`. Verify the tenant and
attached field groups against supplied schemas; substitute tenant placeholders
only after verification. Never extend a schema merely to fit an imported row.

Read relevant raw items with catalog get. They supply complete source content,
media URLs, catalog IDs, lifecycle and actual tag UUIDs that normalised rows omit.
Reuse only supplied/authorised copy. Do not invent product rates, benefits,
guarantees, dates, eligibility claims or media URLs. Omit unknown optional fields
and empty strings, especially where the schema has `minLength: 1`.

Never copy server IDs, etags, timestamps, author fields, approval status,
eligibility constraints or frequency caps into a new item.

## BA golden CSV mapping

`<tenant>` is the verified namespace including its leading underscore.

| CSV heading | JSON path |
|---|---|
| `itemName` | `_experience.decisioning.decisionitem.itemName` |
| `itemPriority` | `_experience.decisioning.decisionitem.itemPriority` (integer) |
| `lifecycleStatus` | `_experience.decisioning.offeritem.lifecycleStatus` |
| `profileConstraintType` | `_experience.decisioning.decisionitem.itemConstraints.profileConstraintType` |
| `agentScript`, `briefMessage`, `compactDescription`, `compactSubtitle`, `compactTitle`, `fullCTA`, `title`, `fullDescription`, `fullSubtitle` | `<tenant>.content.textContent.<exact heading>` |
| `imageHighRes.sourceURL`, `imageHighRes.destinationURL`, `imageHighRes.repository`, `imageHighRes.type` | `<tenant>.content.mediaAssets.<exact heading>` |

Offer Metadata is separate: `<tenant>.offerMetadata.<field>`. Preserve actual
enum values (including historical spelling such as `driveDigitialAdoption`)
only when intended. The CSV has no metadata columns: do not fabricate mappings.

`offeritem` is a **sibling** of `decisionitem`. Omitting its lifecycle can cause
an unhelpful Adobe deserialisation error. The normalised date status `Active`
does not mean approved: check raw `offeritem.lifecycleStatus === "draft"`.

## Build linked assets

1. **Tags:** verify a unified tag UUID in live `itemTags` and `itemTagDetails`,
   including its name, sandbox and catalog. Legacy DPS `/tags` returns
   `dps:tag:...` IDs in kirkham, not the compatible UUID. Never strip the ID,
   invent a UUID or assume the legacy create endpoint creates a unified tag.
   If new tags are required, discover an authorised unified-tag creation tool,
   preview/confirm, then read its actual identity back before dependent writes.
   Otherwise reuse a verified tag only with the user's approval of its scope.
2. **Items:** build the required standard fields and supported content, with
   draft lifecycle and verified tag UUID array. With no targeting requested use
   `itemConstraints: {profileConstraintType: "none"}`. Preview/create with
   `entity_type: "offer-items"`. Offer names/content alone implement no targeting.
3. **Rules:** for requested targeting, confirm strategy/item attach points.
   New rules need `exdRule: true` and a verified PQL condition. Per-item
   constraints use `{profileConstraintType: "eligibilityRule", eligibilityRule:
   <returned rule ID>}`; strategies use the same shape in `profileConstraint`.
   Keep PQL and any supplied segment UI model consistent. Do not clone a stale
   segment model with different fields.
4. **Collections:** GET an existing single-tag collection in the same catalog.
   Preserve its live `constraints` and `uiModel` type/metadata. Use
   `itemCatalogId`, and predicate
   `SELECT * FROM offer_items WHERE (_experience.decisioning.decisionitem.itemTags IN ('<UUID>') )`.
   Put the same verified UUID in item tags, predicate and UI model. Restrict
   substitution to verified UUIDs, never user-entered SQL. Tag collections match
   **all existing and future** tagged items, not just the newly created items.
   A matching draft is not necessarily deliverable.
5. **Strategies:** use the returned collection ID in `optionSelection.filter`.
   For priority ranking use `rank: {priority: 1, order: {orderEvaluationType:
   "static"}}`. With no targeting use `profileConstraint: {profileConstraintType:
   "none"}`. Prefer `lab_decisioning_selection_strategy_preview` when exposed,
   otherwise preview the full item through the ordinary catalog route. Never
   guess a future dependency ID or imply this attaches a policy.

Use `lab_decisioning_catalog_change_preview` then
`lab_decisioning_catalog_change_apply` with unchanged inputs, `preflight_id` and
the exact returned confirmation phrase. A reviewed bundle can be approved
together if the only later changes are returned IDs or reviewed tag substitutions.

## Backend equivalent (no Coworker required)

| Operation | Existing route |
|---|---|
| Resolve schema | `GET /api/decisioning/catalog/schema?sandbox=<sandbox>` |
| List entities | `POST /api/decisioning/catalog/list` |
| Raw entity read | `POST /api/decisioning/catalog/get` |
| Preview create/update | `POST /api/decisioning/catalog/change-preview` |
| Apply confirmed create/update | `POST /api/decisioning/catalog/change-apply` |

POST bodies use `sandbox` and `entity_type`; get also uses the exact `id`.
Create uses `action: "create"` and `item`. Apply additionally includes
`schemaId` for offer items, `preflight_id` and `confirmation` from the preview's
`required_confirmation`. A preview is local planning, not proof Adobe will accept
the payload or the caller is authorised to apply.

Run dependent creates sequentially. Record returned IDs and read each asset
back before continuing. After timeout/ambiguous submission, inspect before any
retry. Name lookups are first-page bounded: absence there does not establish
global absence. Never silently delete partial work; report exact persisted IDs.
Cleanup requires its own audit/confirmation/delete flow.

## Verify and report

Verify exact name, raw draft lifecycle, content, priority and tag name/UUID;
collection catalog/predicate/UI tag; and strategy collection/ranking/targeting.
Report IDs and sandbox. Distinguish configured links from evaluated membership.
State explicitly that no policy was activated. Actual delivery readiness needs
separately approved activation and live Edge scenario evaluation.
