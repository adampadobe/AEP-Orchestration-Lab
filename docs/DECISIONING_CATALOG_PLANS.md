# Website-to-AJO catalog plans

The `create-decisioning-demo` skill generates a customer website and a matching
catalog plan from the same objectives, content and scenario mappings.
`aep-offer-creation` defines the governed write workflow. No Coworker connection
is required when the existing authorised Lab backend routes are available.

## Boundaries

`scripts/provision-decisioning-catalog.mjs` compiles seven objectives into
eligibility rules, draft offer items, tag-based collections and selection
strategies. Each rule reads one or two typed profile fields. Objective rules
attach to strategies; optional offer rules select within their objective.
Only creates are supported: existing source objects are not patched or deleted.
There is no deployment, automatic schema extension, profile ingestion, approval,
decision-policy activation or message send.

**Unified tag creation remains a prerequisite**, not an implemented feature of
this runner. Kirkham's DPS `/tags` IDs are not compatible item tag UUIDs. Supply
seven distinct tags verified from raw items in the same catalog, or create them
through an independently verified authorised unified-tag workflow first.
Reused tags also select existing/future offers, potentially from other customers.
Review that membership scope explicitly. Do not call such collections exclusive.

## Plan contract (version 1, kirkham)

Save plans and write journals outside `web/` and `functions/`, preferably in the
session artifact directory. Do not commit customer profile identities or secrets.
Plans contain content and synthetic scenarios, not credentials.

| Field | Meaning |
|---|---|
| `version`, `sandbox`, `customer` | `1`, `"kirkham"`, confirmed customer prefix for names |
| `tenant` | Live verified tenant key, including `_` |
| `schemaId`, `catalogId` | Exact live offer-item schema and decision catalog IDs |
| `profileSchemaId` | Exact verified Operational Profile schema ID |
| `collectionTemplateId` | Exact existing single-tag collection ID in that catalog |
| `profileFields` | `{path, type, dataflow}` rows; type is string, number or boolean |
| `objectives` | Seven ordered rows described below |
| `scenarios` | `{name, attributes, expectedObjective, expectedOffer}` assertions |

Each objective is:

```json
{
  "key": "protect",
  "label": "Protect / Recover",
  "tag": {
    "id": "<verified-unified-tag-UUID>",
    "name": "<exact-live-name>",
    "sourceOfferId": "<raw-item-containing-that-tag>"
  },
  "rule": {
    "operator": "and",
    "conditions": [
      { "path": "<verified-tenant>.complaint.status", "op": "eq", "value": "open" }
    ]
  },
  "offers": [
    {
      "key": "support",
      "name": "Source-grounded service offer",
      "priority": 730,
      "content": {
        "title": "<authorised source title>",
        "briefMessage": "<authorised source copy>"
      }
    }
  ]
}
```

This fragment is explanatory, not a runnable customer plan. Never stream its
placeholders. Derive seven industry-relevant objectives and real offers from the
uploaded customer content; do not repurpose unrelated fields as objective flags.

An offer may additionally have `rule` and `imageHighRes`. Content keys are the
BA CSV text headings: `agentScript`, `briefMessage`, `compactDescription`,
`compactSubtitle`, `compactTitle`, `fullCTA`, `title`, `fullDescription`,
`fullSubtitle`. Image keys are `sourceURL`, `destinationURL`, `repository`, `type`.
Omit empty/unknown optional values. All newly created items are forced to draft.
Names are customer-prefixed; offer priorities must be distinct within an objective.
Normally use three source-grounded offers per objective, following the BA CSV's
21-item structure, but do not fabricate offers just to reach that count.

Rules have `operator: "and" | "or"` and one or two conditions.
Operators: `eq`, `in` (non-empty value array), `gt`, `gte`, `lt`, `lte`.
Ordering comparisons are numeric only. String comparisons are case-insensitive,
matching the generated PQL. Preserve numeric values and booleans, not UI labels.
The compiler also emits AJO's visual `segmentModel` from the same conditions.
It retains exact attribute paths, and/or grouping, numeric thresholds and typed
boolean/multi-value comparisons. Raw readback checks both representations.
PQL without this model may evaluate correctly but show no visual attributes.
`profileFields` is a mapping declaration, **not a live schema validator**:
the skill must verify live resolved schemas (profile and owning write-dataflow)
before approval. The runner verifies the offer schema ID, not its full custom
field definitions or profile dataflow schemas.

Scenario `attributes` is a flat map of exact profile paths to synthetic values.
Every rule needs explicit positive and negative inputs; missing values do not
count as negative coverage. Every objective and offer needs a winning assertion.
Add threshold, overlap, service-first and no-content scenarios as appropriate.
The local evaluator tries objectives in order, skips ineligible ones, sorts
eligible items by priority, and stops at the first winner. This tests intended
logic, not an actual AJO policy or Edge response.

## Preview, confirm, apply, read back

```powershell
npm run decisioning:catalog-plan -- "C:\path\customer-plan.json"
```

This is offline: it validates the plan and scenario expectations, prints all
payload templates and a SHA-256 fingerprint, and performs **no network writes**.
References are symbolic until preceding creates return IDs. The single-tag
collection UI model is read live on apply; only its tag value is replaced,
preserving its metadata and string/object representation. Inspect that template
before approving the bundle. Governed per-asset previews run again on apply.

Review the full output, live schemas, live tag names/UUIDs and membership scope.
Check existing names in a complete authorised inventory before creating a new
bundle. The backend's first-page list/name lookup cannot prove absence. Obtain
explicit user consent to this exact bundle; the fingerprint binds inputs but
is not itself consent.

```powershell
npm run decisioning:catalog-plan -- "C:\path\customer-plan.json" --apply --confirm "<reviewed fingerprint>" --state "C:\path\customer-catalog-journal.json"
```

The runner rechecks schema/tag/template identity, then sequentially previews,
applies and verifies raw values for rules, offers, collections and strategies.
It preserves returned IDs in the journal before proceeding. The original plan
and journal must be reused on resume; verified assets are re-read and compared,
not recreated. This is **journal-based resumability**, not a global name-based
upsert. Do not run concurrent instances or use a fresh journal for the same plan.
A lock excludes concurrent use of the same journal, and updates use flushed
temporary files followed by rename. If a process is killed and leaves a `.lock`,
verify that no writer is running and inspect the journal's pending entries
before removing that exact lock file. Do not bypass it during an active run.

A pending entry without an ID means a write could have succeeded. The runner
stops rather than retrying it. Inspect Adobe and reconcile the exact asset's ID
in the journal only after verified recovery. Drift, partial writes and errors
stop execution; there is no silent rollback/delete. Keep the journal and report
its persisted IDs and blocker. Material plan changes require a new review and
deliberate reconciliation, not discarding the original journal.

## Live readiness is a separate gate

For an already-provisioned plan lacking visual models, use the original plan and
creation journal with the narrowly scoped repair tool:

```powershell
node scripts\repair-decisioning-rule-models.mjs "<plan>" "<original-journal>" "<new-repair-journal>" --preview
node scripts\repair-decisioning-rule-models.mjs "<plan>" "<original-journal>" "<new-repair-journal>" --apply "<reviewed-repair-fingerprint>"
```

Review and approve the preview first. This adds only missing `/segmentModel` on
verified original rule IDs; it refuses name/PQL drift or a conflicting existing
model. It never creates assets or activates policies. An exclusive, flushed
repair journal records each pending write and verified readback; a partial or
interrupted run requires inspection, not an automatic retry/new journal.
Older journals need this reconciliation before the updated compiler can verify
them; never rerun creates with a fresh creation journal to fix editor metadata.

Static priority ranks items within a strategy. Strategy `rank.priority: 1` is
not the seven-objective ordering of a decision policy. Wire the returned IDs and
objective order through a separately reviewed policy change, including fallback
behaviour. Draft objects alone cannot go live.

After explicit activation/test-profile approval, apply scenario changes through
full-snapshot profile updates, confirm rule-read fields in Hub, then evaluate
Edge with the same identity and configured policy/surfaces. Verify returned item
IDs for cross-objective and within-objective transitions. Hub ingestion does not
guarantee Edge propagation. Until these steps pass, report **catalog configured,
live decision not verified**, never "ready to go live".
