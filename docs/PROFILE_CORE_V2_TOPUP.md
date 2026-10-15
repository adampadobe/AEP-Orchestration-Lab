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
- **Present subtrees are walked.** When a whole-subtree manifest entry (e.g.
  `travelReservations`) already exists, the diff descends into it and adds any
  missing child objects/leaves, so new leaves reach sandboxes created earlier.
- **One bad subtree doesn't block the rest.** If the batched PATCH returns 400
  (e.g. `Cannot merge incompatible data types` from another field group in a
  schema using Profile Core v2), each gap is retried on its own. Rejected paths
  are listed in `conflicts` as `<path> (patch rejected: …)`; the rest still land.
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

### Exception: `profilePlaceContext.*` (dedicated field group)

`_<tenant>.profilePlaceContext.*` (last-known place: lat/lon, geohash, city,
region, country, `lastSeenAt`, `source`) is owned by the purpose-built tenant
field group **`AEP Lab - Profile Place Context v1`**, not Profile Core v2.
Never add these leaves to `profileCoreV2Manifest.js`. A second definition of
the same path in the Profile union would conflict, and
`functions/test/genericProfilePlaceContext.test.cjs` fails if you try.

- The spec lives in `functions/genericProfileInfraService.js`
  (`PROFILE_PLACE_CONTEXT_V1_PROPERTIES`). The Generic wizard auto-creates and
  attaches it (optional `createIfMissing`) in sandboxes that don't have it yet.
- The governed first rollout uses
  `node scripts/ensure-generic-place-context-fieldgroup.cjs --sandbox <name>`.
  It is a read-only dry-run that prints the exact POST/PATCH. Add `--apply` to
  write, and only after review.
- Changes are **additive-only**: the Generic schema is Profile-enabled, so
  once the field group is attached it cannot be detached. Leaves may only gain
  optional siblings.
- Writers: the Generate Profiles Generic panel (`source: ui-sample`/`ui-manual`),
  `POST /api/profile/update` (full-snapshot round-trips re-derive a stale
  `geohash` from lat/lon), and `POST /api/profile/generate`. That route
  rejects place context with a 400 for non-generic industries, because only the
  Generic schema carries the field group. MCP personas add a random preset
  place (`source: mcp-persona`) to every industry. Dual-stream generate routes it
  to the generic step, and a caller-supplied place replaces the persona block
  wholesale.

### Travel active flight: trip leaves in Core v2, `individualCharacteristics.travel.*` in Profile Travel v1 / v2

The Travel generator and the MCP travel persona both build flights with the
shared `web/profile-viewer/travel-flight-trip.js` builder. The MCP copy is
`tools/aep-lab-profile-mcp/src/personaBuilder/flightTrip.cjs`, written by
`npm run sync:travel-flight-trip`; CI runs `verify:travel-flight-trip`. The
builder's leaves are owned in two places:

- **`travelReservations.flightReservations.*`** trip detail lives in this
  manifest. That covers the airport names, cities, airline, the
  `departureDateTime` and `arrivalDateTime` (ISO-8601 with the airport's local
  offset, via `DATETIME_LEAF`), duration, `flightStatus`, `tripType`, the
  return leg, seat, bags, `bookingChannel` and `bookingDate`. The normal
  top-up adds these leaves.
- **`individualCharacteristics.travel.*`** is owned by the tenant field groups
  **Profile Travel v1** (trip purpose, class, favourite airline, booking lead
  time) and **Profile Travel v2** (`flightBookings.activeFlight` `"Yes"`/`"No"`
  plus `next*`/`last*` booking leaves). Never add these to the manifest.
  `functions/test/travelActiveFlightSchema.test.cjs` checks both owners.
  - The specs are `TRAVEL_PROFILE_V1_PROPERTIES` and
    `TRAVEL_PROFILE_V2_PROPERTIES` in `functions/travelProfileInfraService.js`.
    They mirror the apalmer groups exactly, including the string-typed
    `activeFlight`.
  - Step 2 (`attachFieldGroups`) creates and attaches the groups when they are
    missing. Both groups are optional `createIfMissing` entries with
    exact-title matches.
  - `npm run ensure:travel-profile-fieldgroups -- <sandbox>` runs a read-only
    dry run. Add `--apply` to run step 2, and only after review: attaching to
    the Profile-enabled Travel schema is additive-only.
  - Infra status reports `optionalFieldGroups: [{label, exists, attached}]`.
    The UI hides the v1/v2 leaves only when a group is known to be unattached.
    AEP silently drops unknown paths in any case.

Active flight semantics:
- **Yes:** the next departure is within 30 days, or the flight is in the air
  now (~10% of generated trips). The builder writes the `next*` and `last*`
  values.
- **No:** the trip is fully in the past, and only `last*` is written.
- Switching an existing profile from Yes to No leaves the old `next*` values in
  place, so segment on `activeFlight` rather than on whether `next*` is present.
- MCP: `active_flight: true|false` on `lab_generate_profile` and
  `lab_generate_profiles_batch`, or the segment hint `active_flyer` /
  `lapsed_flyer`. An explicit `active_flight` wins over the hint.

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
