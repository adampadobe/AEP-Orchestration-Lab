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

### Attach status (sandbox `apalmer`)

Attached on 2026-09-28: `AEP Lab - Event Generic - Schema` v1.4 and `AEP Event Tool - Schema - v1` v1.16. The union check passed and a re-run dry-run returns `action: "none"`.

## Writing event place (Event Tool and edge builder)

The **Event Tool** page (`web/profile-viewer/event-tool.html`) has a **Place context** block that applies to both trigger and industry modes.

- **Preset:** `None` (the default) sends nothing. `Random city`, `Riyadh`, `Dubai`, `London` or `New York` fills a sample (reusing the profile place presets), and **New sample** re-rolls it. The preset is remembered in `localStorage` (`aepEventToolPlacePreset`).
- **Source:** a filled sample is sent as `source: "ui-sample"`. Editing any field by hand switches it to `source: "event-tool"`.
- **Preview:** the payload preview includes the place, so an edited preview (sent as `rawPayload`) still carries it.

The page posts `eventPlace` to `POST /api/events/edge`, alongside the usual body:

```json
{
  "eventPlace": {
    "latitude": 24.6958, "longitude": 46.685, "accuracyMeters": 150,
    "neighborhood": "Al Olaya", "city": "Riyadh", "regionCode": "SA-01", "countryCode": "SA",
    "storeId": "RUH-OLAYA-01", "poiId": "poi-olaya-mall", "source": "ui-sample"
  }
}
```

`functions/eventPlaceContext.js` validates it. Latitude and longitude are required; `regionCode` must start with `countryCode-`; `source` must be one of the field-group enum values; unknown leaves are rejected. Invalid input returns **HTTP 400** before any Adobe call. The geohash (precision 7) is always derived from the coordinates, and a supplied geohash must match. `buildGeneratorEdgeInteractXdm` then writes it in both minimal and full XDM styles:

| Input | XDM path |
|---|---|
| `latitude`, `longitude` | `placeContext.geo._schema.latitude/longitude` |
| `city`, `countryCode` | `placeContext.geo.city/countryCode` |
| `regionCode` | `placeContext.geo.stateProvince` and `_{tenant}.eventPlaceContext.regionCode` |
| `poiId` | `placeContext.POIinteraction.poiDetail.poiID` and `_{tenant}.eventPlaceContext.poiId` |
| derived geohash, `accuracyMeters`, `neighborhood`, `storeId`, `source` | `_{tenant}.eventPlaceContext.*` |

The browser mirror, `web/profile-viewer/event-place-context.js` (`window.AepEventPlaceContext`), must load after `profile-place-context.js`. Parity with the server placement is covered by `functions/test/eventPlaceContext.test.cjs`.

**Known risk:** if the datastream has Edge geo lookup enabled, the Edge Network may overwrite `placeContext.geo` with IP-derived values. `_{tenant}.eventPlaceContext` is not affected.
