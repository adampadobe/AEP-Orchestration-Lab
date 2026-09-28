# Geo audience mirror (profile place context → hotspots)

`/api/geo-hotspots` (Cloud Function `geoHotspotsQuery`, MCP tool `lab_audience_geo_hotspots`) answers
"how many profiles that viewed *interest* in the last *N* hours have a last-known place within *R* km of a
centre" from a Firestore mirror. AEP Query Service is not used on the live path: its REST API exposes no
ad-hoc result fetch, the PostgreSQL interface is unreachable from Cloud Run, and cold queries take minutes.

## What is written, and when

| Writer | Trigger | Collection | Document |
|--------|---------|------------|----------|
| `profileGenerateProxy` (`functions/profileGenerateService.js`) | AEP accepted a generated profile carrying `_demoemea.profilePlaceContext` | `labGeoProfilePlaces` | `{sandbox}__{identityHash}` — `identityHash`, `ecidHash`, `lat`, `lon` (5 dp), `geohash7`, `city`, `countryCode`, `source`, `lastSeenAt`, `updatedAt`, `expireAt` |
| `profileUpdateProxy` (`functions/profileRoutes.js`) | AEP accepted a live (not dry-run) update carrying place context | `labGeoProfilePlaces` | same doc, overwritten with the latest place |
| `eventGeneratorProxy` (`functions/index.js`) | AEP accepted a `commerce.productViews` event | `labGeoInterestSignals` | auto-ID — `sandbox`, `identityHash`, `ecidHash`, `interestKeys[]`, `eventType`, `ts`, `expireAt` |

* Mirror writes happen only after AEP accepted the request, never on failure or dry run. A mirror
  failure is reported in the response (`geoMirror: { written: false, error }`) and never fails a request
  AEP already accepted.
* `identityHash` = sha256 of `sandbox|lower(trim(email))`; `ecidHash` is the same over the ECID. No raw email,
  ECID, name, or neighborhood is stored. Signals with only an ECID are counted (`stats.ecid_only_signals`)
  but not joined to places.
* `interestKeys` = normalized (lower-case, collapsed whitespace) `public.*.productName` and
  `public.*.productCategory`, at most 8 keys of 64 characters. Hotspot interest matching is an exact
  normalized match, not a substring match.
* The mirror records what the lab sent. If AEP later drops a field during ingestion, the mirror still has it.

## Retention

Firestore TTL on `expireAt` (`firestore.indexes.json` `fieldOverrides`): places expire 30 days after the last
write, signals 7 days after the event. The hotspot window maximum is 168 h, so signal TTL always covers it.

## Query path

`functions/geoHotspotsService.js` `runMirror`:

1. `assertSafeInterest` (same allowlist as before) and normalize to an interest key.
2. Read signals for `sandbox` + `interestKeys array-contains key` + `ts` within the window (composite index
   in `firestore.indexes.json`), capped at `MAX_MIRROR_SIGNALS` (20 000).
3. Read the matching `labGeoProfilePlaces` docs by ID (batched `getAll`).
4. `aggregateMirrorHotspots`: dedupe by identity, haversine radius filter, grid cells of `cell_km`,
   suppress cells below k=10, sort by profiles, cap at 50 — the in-memory twin of the former SQL.

The response keeps the existing contract (`kind`, ≤50 hotspots, 4-dp coordinates, 3-dp share, k=10) with
`source: "aep-lab-geo-mirror"`. Hotspot locations are each profile's last-known place, not the event location.

## Controls

| Env var (functions) | Values | Effect |
|---------------------|--------|--------|
| `GEO_HOTSPOTS_DATA_PATH` | `firestore-mirror` (default), `unavailable`, `query-service` | `unavailable` restores the honest "no geo data" answer; `query-service` is the legacy SQL path |
| `GEO_MIRROR_ENABLED` | `true` (default when unset) / `false` | Kill switch for all mirror writes |

## Seeding

`lab_seed_geo_demo` creates up to 30 retail test profiles following the MCP generation pattern (stored
prefs email counter + stored mobile) with `profilePlaceContext.source = "mcp-seed"`, ten per central
neighborhood (Riyadh: Olaya, Al Sulimaniyah, Al Malaz; Dubai: Downtown, Business Bay, DIFC; other featured
areas and any place-catalog city use three generated neighborhood anchors around the city center), and one
`commerce.productViews` event each carrying the same `eventPlace`. Results are visible to hotspots immediately.

## Bulk generation and clustering

`lab_generate_profiles_batch` samples places from the shared catalog (`place_mode` `featured` | `global` |
`area`). For count ≥ 10 it clusters profiles (default 12 per anchor, never below k=10) so global random
data still produces visible hotspots; the job returns `place_clusters` for map verification.
