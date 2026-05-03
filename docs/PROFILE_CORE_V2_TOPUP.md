# Profile Core v2 top-up

Each sandbox in `demoemea` has its own local copy of the `Profile Core v2` tenant
field group (the custom `mixins` FG whose `_<tenant>` subtree holds everything the
lab streams that isn't covered by an Adobe-OOTB Profile-class FG). The mixin is
**not** identical across sandboxes — verified Apr 2026 between `apalmer` (v1.5)
and `kirkham` (v1.6): apalmer has the full `travelReservations.*` subtree plus
`scoring.npsScore` and `scoring.gaming.*`; kirkham is missing all of those and
adds sports-specific leaves nobody else has.

Left unmanaged, streaming `_<tenant>.travelReservations.*` from the Travel
profile generator into kirkham silently dies — AEP drops unrecognised paths with
no error — so every Travel profile in kirkham comes out with only the generic
attributes.

The **top-up** fixes this. It runs during each per-industry wizard's
**step 2 (Attach field groups)** and guarantees the sandbox-local Profile Core v2
contains every tenant-relative leaf that industry needs, adding missing leaves
via add-only JSON-Patch.

## Where the top-up lives

- `functions/profileCoreV2Manifest.js` — per-industry "required tenant leaves"
  manifest (shared generic leaves + industry extensions).
- `functions/profileInfraFactory.js` — `topUpProfileCoreV2(...)` method + the
  pure diff/patch helpers (`walkResolvedMixinTenantTree`,
  `collectRefBlockedAncestorPaths`, `diffManifestAgainstMixin`,
  `buildTopUpJsonPatchOps`).

## Contract

- **ADD only.** Never REMOVE and never REPLACE an existing leaf with a
  different type. Type conflicts are reported in `conflicts`, not overwritten.
  (Adobe also enforces this server-side — REMOVE on a mixin used by any
  schema returns `XDM-1536-400 "Breaking change violation"`.)
- **Idempotent.** A second invocation in a sandbox that already contains every
  required leaf is a no-op (zero PATCH calls, `added: []`).
- **Concurrency-safe.** On HTTP 409 / 412 / 428 the helper re-GETs the mixin,
  recomputes the diff, and retries once. A second conflict fails cleanly.
- **Smallest non-overlapping ops.** If the entire `travelReservations` parent
  is missing, ONE `add` op for the whole subtree — not 21 per-leaf ops.
- **Schema-typo fidelity.** `travelReservations.flightReservations.multiLeg.layoverAiport_2`
  (no 'r' in `Aiport`) is preserved on purpose — that's the canonical leaf name
  today and the UI streams that exact key.
- **$ref boundaries respected.** Leaves whose ancestor is `$ref`-linked to a
  shared datatype (e.g. `identification.core.*`) cannot be added via FG PATCH —
  the datatype owns them. Those are reported as `conflict` and skipped, not
  silently overwritten.

## PATCH header contract (`/tenant/fieldgroups/{altId}`)

Verified live against `kirkham` (May 2026):

| Header        | Value                                         | Note |
|---------------|-----------------------------------------------|------|
| Content-Type  | `application/json`                            | **NOT** `application/json-patch+json` — Adobe's gateway rejects that with HTTP 415 *"Content-Type 'application/json-patch+json' is not supported."* The request body is still a JSON-Patch ARRAY (`[ {op,path,value}, … ]`); the registry parses it as a JSON document. |
| Accept        | `application/vnd.adobe.xed+json;version=1`    | Returns the updated FG body so the caller can verify the version bump.|
| If-Match      | `<current FG version>` e.g. `1.6`             | Optimistic concurrency. On 412/428/409 the helper re-GETs and retries.|

If a future PATCH fails non-2xx, the helper now also surfaces the registry's
`detail` and `report` fields in the wizard's status message (and in the
`profileCoreV2TopUp.error` payload) so the operator can see exactly what the
gateway rejected.

## How to add a new required leaf

1. Add a `push('tenantRelative.dot.path', value)` call in the relevant
   `web/profile-viewer/profile-generation-<industry>.js`.
2. Add the same `tenantRelative.dot.path` key to the industry's manifest entry
   in `functions/profileCoreV2Manifest.js` with its inline JSON-Schema body
   (use the `NUMBER_LEAF` / `STRING_LEAF` / `BOOLEAN_LEAF` / `INT_LEAF` /
   `DATE_LEAF` helpers so every leaf renders identically to the canonical
   apalmer shape).
3. That's it — the next time any sandbox's operator runs step 2, their Profile
   Core v2 picks up the new leaf automatically.

Do NOT add paths whose top segment is in `PROFILE_STREAM_ROOT_PATH_PREFIXES`
(e.g. `person.*`, `loyalty.*`, `travelPreferences.*`, `personalFinances.*`,
`subscriptions.*`). Those stream to the XDM root, not the tenant subtree.

## API response shape (step 2 / `attachFieldGroups`)

```jsonc
{
  "ok": true,
  "sandbox": "kirkham",
  "step": "attachFieldGroups",
  /* …existing step-2 fields… */
  "profileCoreV2TopUp": {
    "mixinAltId": "_demoemea.mixins.f7fc5d501b...",
    "mixinPriorVersion": "1.6",
    "mixinNewVersion": "1.7",                // null when the run was a no-op
    "added": ["travelReservations", "scoring.npsScore"],
    "alreadyPresent": ["scoring.churn.churnPrediction", "..." ],
    "conflicts": [],                         // [`path (reason)`, …] on type / $ref conflicts
    "patchOpCount": 2
  },
  "message": "Field groups attached … Profile Core v2 patched: added 2 tenant-subtree leaf/leaves (travelReservations, scoring.npsScore)."
}
```

The `message` string already embeds a human-readable summary so existing UIs
that render `data.message` need no changes.

## Verifying locally

```sh
# Pure-function unit-style dry-run + live read-only probe of apalmer
# (asserts apalmer is the canonical "already complete" source today):
node /tmp/verify-coreV2-topup.mjs

# Live read-only preview of what top-up WOULD patch in kirkham (no PATCH sent):
node /tmp/dryrun-alan-topup.mjs
```

Both scripts are dev-only; no hosted artefact ships with them.
