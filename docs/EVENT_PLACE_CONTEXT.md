# Event place context

Event-level place context tells a heat map or overlap view where each event happened. It complements the profile-level `_{tenant}.profilePlaceContext` (see [GEO_AUDIENCE_MIRROR.md](GEO_AUDIENCE_MIRROR.md)), which says where a person usually is.

## Schema design

Both union-enabled lab ExperienceEvent schemas get two field groups:

| Field group | Provides | Why |
|---|---|---|
| **Environment Details** (standard, global) `https://ns.adobe.com/xdm/context/experienceevent-environment-details` | `placeContext.geo._schema.{latitude,longitude}`, `placeContext.geo.{city,countryCode,stateProvince,postalCode}`, `placeContext.POIinteraction`, `placeContext.localTime` | XDM-native event coordinates. `eventGeneratorService.attachGeo` already writes `placeContext.geo._schema`, but AEP drops it until this FG is attached. |
| **AEP Lab - Event Place Context v1** (tenant) at `_{tenant}.eventPlaceContext` | `geohash` (precision 7), `neighborhood`, `regionCode` (ISO 3166-2), `accuracyMeters`, `storeId`, `poiId`, `source` (enum) | The attributes XDM lacks. It deliberately has no lat/lon, city or country leaves, so it does not duplicate `placeContext.geo`. |

Target schemas are matched by exact title: `AEP Lab - Event Generic - Schema` and `AEP Event Tool - Schema - v1`. The older `AEP Event Tool - Schema` is not touched.

The spec is in `functions/eventPlaceContextFieldGroup.js`. Both schemas are profile-enabled, so every change after attach must be **additive only**. Never rename, retype, tighten or remove a leaf.

## Governed create and attach

```bash
# 1. Dry-run (default): read-only GETs; prints the exact POST and PATCH bodies
node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer

# 2. Create the tenant FG only (NOT attached): review it in the AEP UI
node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer --apply --create-only

# 3. After approval: attach Environment Details and the FG to both schemas
node scripts/ensure-event-place-context-fieldgroup.cjs --sandbox apalmer --apply
```

- Only missing refs are added. A re-run is a no-op (`action: "none"`) when everything is attached.
- PATCH sends `If-Match` with the current schema version.
- Verification re-reads each schema (`xed-full-notext`) for `placeContext.geo._schema.latitude/longitude` and every `eventPlaceContext` leaf. It then checks that `_xdm.context.experienceevent__union` exposes `_{tenant}.eventPlaceContext`.
- The script refuses to run if a schema already resolves `placeContext` without Environment Details, if the union already defines `eventPlaceContext` while nothing is attached, or if a target title does not match exactly one schema.

### Rollback

- **Before attach:** `DELETE /tenant/fieldgroups/{meta:altId}`. The create-only output prints the path.
- **After attach:** removing a field group from a union-enabled schema is a breaking change, so treat the attach as irreversible. Stop writing the fields instead.
