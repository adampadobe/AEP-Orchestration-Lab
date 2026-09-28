import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEO_CITY_PRESETS,
  GEO_INTEREST_PATTERN,
  GEO_MIRROR_SOURCE,
  GEO_MIRROR_PLACE_HINT,
  GEO_MIN_K_ANONYMITY,
  MAX_GEO_HOTSPOTS,
  MAX_CONSECUTIVE_SEED_FAILURES,
  buildGeoSeedPlan,
  geoHotspotsFailureHint,
  geoSeedEventPlace,
  geoSeedPlaceAttributes,
  geoJsonResult,
  isGeoDataUnavailable,
  nearestSeededNeighborhood,
  resolveGeoCityPreset,
  runGeoSeedBatch,
  shapeGeoHotspotsResponse,
  shapeGeoHotspotsUnavailableResponse,
} from '../src/framework/geoInsights.mjs';

const CANONICAL_TEST_ECID = '62722406001178632594092146103219305888';
import { annotationsForTool } from '../src/toolAnnotations.mjs';
import { checkEdgeSendRate, checkGenerateRate, reserveGeoSeedRates } from '../src/rateLimiter.mjs';

test('geo seed presets lead with three central seed neighborhoods per city', () => {
  assert.deepEqual(Object.keys(GEO_CITY_PRESETS), ['riyadh', 'dubai']);
  assert.deepEqual(GEO_CITY_PRESETS.riyadh.map(({ name }) => name), [
    'Olaya', 'Al Sulimaniyah', 'Al Malaz', 'Al Malqa', 'Hittin', 'Al Yasmin', 'Al Nakheel', 'Diriyah',
  ]);
  assert.deepEqual(GEO_CITY_PRESETS.dubai.map(({ name }) => name), [
    'Downtown', 'Business Bay', 'DIFC', 'Dubai Marina', 'Deira', 'JLT', 'Al Barsha',
  ]);
});

function kmBetween(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

test('every Riyadh seed cluster sits within 10 km of the geocoded city centre', () => {
  // OpenWeather geocodes "Riyadh" to roughly this point; the HUMAIN demo asks for 10 km.
  const center = { lat: 24.6877, lon: 46.7219 };
  for (const seed of GEO_CITY_PRESETS.riyadh.slice(0, 3)) {
    assert.ok(kmBetween(center, seed) < 6, `${seed.name} is ${kmBetween(center, seed).toFixed(1)} km away`);
  }
});

test('seed plan places a 30-profile batch in exactly three clusters of ten at identical cluster points', () => {
  const plan = buildGeoSeedPlan({
    city: 'Riyadh', count: 30, interest: 'camping gear', now: () => Date.parse('2026-09-27T12:00:00.000Z'),
  });
  const byHood = new Map();
  for (const seed of plan) {
    const list = byHood.get(seed.neighborhood) || [];
    list.push(seed);
    byHood.set(seed.neighborhood, list);
  }
  assert.deepEqual([...byHood.keys()], ['Olaya', 'Al Sulimaniyah', 'Al Malaz']);
  for (const [name, seeds] of byHood) {
    assert.equal(seeds.length, 10, name);
    const preset = GEO_CITY_PRESETS.riyadh.find((n) => n.name === name);
    for (const seed of seeds) {
      assert.equal(seed.lat, preset.lat);
      assert.equal(seed.lon, preset.lon);
      assert.equal(seed.city_id, 'riyadh');
      const ts = Date.parse(seed.timestamp);
      assert.ok(ts <= Date.parse('2026-09-27T12:00:00.000Z') && ts >= Date.parse('2026-09-27T09:00:00.000Z'));
    }
  }
});

test('seed place attributes are the governed profilePlaceContext leaves with source mcp-seed', () => {
  const [seed] = buildGeoSeedPlan({
    city: 'Riyadh', count: 1, interest: 'camping gear', now: () => Date.parse('2026-09-27T12:00:00.000Z'), random: () => 0.5,
  });
  assert.deepEqual(geoSeedPlaceAttributes(seed), {
    'profilePlaceContext.latitude': 24.6908,
    'profilePlaceContext.longitude': 46.6853,
    'profilePlaceContext.accuracyMeters': 50,
    'profilePlaceContext.neighborhood': 'Olaya',
    'profilePlaceContext.city': 'Riyadh',
    'profilePlaceContext.regionCode': 'SA-01',
    'profilePlaceContext.countryCode': 'SA',
    'profilePlaceContext.lastSeenAt': '2026-09-27T10:30:00Z',
    'profilePlaceContext.source': 'mcp-seed',
  });
  const [dubai] = buildGeoSeedPlan({ city: 'Dubai', count: 1, random: () => 0 });
  const attrs = geoSeedPlaceAttributes(dubai);
  assert.equal(attrs['profilePlaceContext.city'], 'Dubai');
  assert.equal(attrs['profilePlaceContext.regionCode'], 'AE-DU');
  assert.equal(attrs['profilePlaceContext.countryCode'], 'AE');
});

test('seed events carry the same place as the seeded profile, source mcp-seed', () => {
  const [seed] = buildGeoSeedPlan({
    city: 'Riyadh', count: 1, interest: 'camping gear', now: () => Date.parse('2026-09-27T12:00:00.000Z'), random: () => 0.5,
  });
  assert.deepEqual(geoSeedEventPlace(seed), {
    latitude: 24.6908,
    longitude: 46.6853,
    accuracyMeters: 50,
    neighborhood: 'Olaya',
    city: 'Riyadh',
    regionCode: 'SA-01',
    countryCode: 'SA',
    source: 'mcp-seed',
  });
});

test('mirror-sourced hotspots pass their source through and explain what the location means', () => {
  const result = shapeGeoHotspotsResponse({
    center: { lat: 24.6877, lon: 46.7219, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    sandbox: 'apalmer',
    source: GEO_MIRROR_SOURCE,
    rows: [{ total_profiles: 10, suppressed_profiles: 0, cell_lat: 24.6908, cell_lon: 46.6853, profiles: 10 }],
  });
  assert.equal(GEO_MIRROR_SOURCE, 'aep-lab-geo-mirror');
  assert.equal(result.source, 'aep-lab-geo-mirror');
  assert.equal(result.hint, GEO_MIRROR_PLACE_HINT);
  assert.match(result.hint, /last-known place/i);
  assert.match(result.hint, /profilePlaceContext/);
});

test('an empty result explains the exact interest match and how to seed', () => {
  const empty = shapeGeoHotspotsResponse({
    center: { lat: 24, lon: 46, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'tents',
    sandbox: 'apalmer',
    source: GEO_MIRROR_SOURCE,
    rows: [{ total_profiles: 0, suppressed_profiles: 0, cell_lat: null, cell_lon: null, profiles: null }],
  });
  assert.equal(empty.total_profiles, 0);
  assert.match(empty.hint, /lab_seed_geo_demo/);
  assert.match(empty.hint, /product name or category/i);
});

test('geo hotspot shaping suppresses small cells and emits only the governed contract', () => {
  const result = shapeGeoHotspotsResponse({
    center: { lat: 24.7136, lon: 46.6753, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 24,
    sandbox: 'apalmer',
    generated_at: '2026-09-27T12:00:00.000Z',
    rows: [
      { cell_lat: 24.7743, cell_lon: 46.6384, profiles: 12 },
      { cell_lat: 24.7136, cell_lon: 46.6753, profiles: 8 },
      { cell_lat: 24.7401, cell_lon: 46.6302, profiles: 4 },
    ],
  });

  assert.deepEqual(result, {
    ok: true,
    kind: 'audience_geo_hotspots',
    center: { lat: 24.7136, lon: 46.6753, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 24,
    suppressed_profiles: 12,
    k_threshold: 10,
    hotspots: [
      { lat: 24.7743, lon: 46.6384, profiles: 12, share: 0.5, label: 'Al Nakheel' },
    ],
    source: 'aep-query-service',
    data_status: 'available',
    sandbox: 'apalmer',
    generated_at: '2026-09-27T12:00:00.000Z',
    hint: '',
  });
  assert.equal(GEO_MIN_K_ANONYMITY, 10);
  assert.equal(MAX_GEO_HOTSPOTS, 50);
  assert.equal(JSON.stringify(result).includes('email'), false);
  assert.equal(JSON.stringify(result).includes('ecid'), false);
});

test('geo hotspot shaping prefers the mirrored place name and falls back to the nearest neighborhood', () => {
  const result = shapeGeoHotspotsResponse({
    center: { lat: 24.6877, lon: 46.7219, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 40,
    sandbox: 'apalmer',
    source: GEO_MIRROR_SOURCE,
    rows: [
      { cell_lat: 24.7113, cell_lon: 46.6744, profiles: 25, label: '  Kingdom Centre  ' },
      { cell_lat: 24.7743, cell_lon: 46.6384, profiles: 15 },
      { cell_lat: 24.6905, cell_lon: 46.6853, profiles: 12, label: 'X'.repeat(200) },
    ],
  });
  assert.deepEqual(result.hotspots.map((h) => h.label), ['Kingdom Centre', 'Al Nakheel', 'X'.repeat(80)]);
});

test('geo hotspot shaping caps output at fifty cells and reports empty datasets honestly', () => {
  const rows = Array.from({ length: 55 }, (_, index) => ({
    cell_lat: 24 + index / 1000,
    cell_lon: 46 + index / 1000,
    profiles: 60 - index,
  }));
  const capped = shapeGeoHotspotsResponse({
    center: { lat: 24, lon: 46, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 1000,
    sandbox: 'apalmer',
    rows,
  });
  assert.equal(capped.hotspots.length, 50);
  assert.equal(capped.hotspots[0].profiles, 60);

  const empty = shapeGeoHotspotsResponse({
    center: { lat: 24, lon: 46, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 0,
    sandbox: 'apalmer',
    rows: [],
  });
  assert.equal(empty.ok, true);
  assert.equal(empty.total_profiles, 0);
  assert.deepEqual(empty.hotspots, []);
  assert.match(empty.hint, /lab_seed_geo_demo/);
});

test('geo tool JSON result includes identical text and structured content', () => {
  const payload = { ok: true, kind: 'audience_geo_hotspots', total_profiles: 0 };
  const result = geoJsonResult(payload);
  assert.deepEqual(result.structuredContent, payload);
  assert.equal(result.content[0].text, JSON.stringify(payload, null, 2));
});

test('geo hotspot is read-only and geo demo seed is a non-destructive mutation', () => {
  assert.deepEqual(annotationsForTool('lab_audience_geo_hotspots'), {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  });

  test('geo seed rate reservations are atomic across profile and event limits', () => {
    const keyId = `geo-seed-rate-test-${Date.now()}-${Math.random()}`;
    assert.deepEqual(reserveGeoSeedRates(keyId, 30), { ok: true });
    assert.equal(checkGenerateRate(keyId).ok, false);
    assert.equal(checkEdgeSendRate(keyId).ok, false);
    assert.equal(reserveGeoSeedRates(keyId, 1).ok, false);
  });
  assert.deepEqual(annotationsForTool('lab_seed_geo_demo'), {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  });
});

test('seed batch keeps going when a single profile or event fails', async () => {
  const plan = buildGeoSeedPlan({ city: 'Riyadh', count: 6, interest: 'camping gear' });
  let sendCall = 0;
  const outcome = await runGeoSeedBatch({
    plan,
    deps: {
      resolveEmail: async () => ({ ok: true, email: 'demo@example.com' }),
      generateProfile: async () => ({ ok: true, ecid: CANONICAL_TEST_ECID }),
      sendEvent: async () => {
        sendCall += 1;
        if (sendCall === 3) return { ok: false, error: 'Invalid identity provided' };
        return { ok: true };
      },
    },
  });

  assert.equal(outcome.generated, 6);
  assert.equal(outcome.sent, 5);
  assert.equal(outcome.failed, 1);
  assert.equal(outcome.aborted, false);
  assert.match(outcome.errors[0], /Invalid identity provided/);
});

test('seed batch refuses to send events for non-canonical ECIDs', async () => {
  const plan = buildGeoSeedPlan({ city: 'Riyadh', count: 3, interest: 'camping gear' });
  const sent = [];
  const outcome = await runGeoSeedBatch({
    plan,
    deps: {
      resolveEmail: async () => ({ ok: true, email: 'demo@example.com' }),
      generateProfile: async ({ index }) => ({
        ok: true,
        // The legacy lab format could emit a low half above the signed 64-bit range.
        ecid: index === 1 ? `4000000000000000000${'9'.repeat(19)}` : CANONICAL_TEST_ECID,
      }),
      sendEvent: async ({ ecid }) => {
        sent.push(ecid);
        return { ok: true };
      },
    },
  });

  assert.equal(outcome.generated, 3);
  assert.equal(outcome.sent, 2);
  assert.equal(outcome.failed, 1);
  assert.deepEqual(sent, [CANONICAL_TEST_ECID, CANONICAL_TEST_ECID]);
  assert.match(outcome.errors[0], /ECID/i);
});

test('seed batch aborts after repeated consecutive failures instead of burning the batch', async () => {
  const plan = buildGeoSeedPlan({ city: 'Dubai', count: 30, interest: 'camping gear' });
  let attempts = 0;
  const outcome = await runGeoSeedBatch({
    plan,
    deps: {
      resolveEmail: async () => ({ ok: true, email: 'demo@example.com' }),
      generateProfile: async () => {
        attempts += 1;
        return { ok: false, error: 'AEP test profile generation failed.' };
      },
      sendEvent: async () => ({ ok: true }),
    },
  });

  assert.equal(outcome.aborted, true);
  assert.equal(attempts, MAX_CONSECUTIVE_SEED_FAILURES);
  assert.equal(outcome.sent, 0);
  assert.equal(outcome.failed, MAX_CONSECUTIVE_SEED_FAILURES);
});

test('a 404 from the lab API is reported as an undeployed route, not a data problem', () => {
  const hint = geoHotspotsFailureHint({ ok: false, status: 404, error: 'Not Found' });
  assert.match(hint, /\/api\/geo-hotspots/);
  assert.match(hint, /hosting/i);
  assert.equal(geoHotspotsFailureHint({ ok: false, status: 500, error: 'boom' }), '');
});

test('geo interest pattern rejects SQL-escape payloads and accepts ordinary text', () => {
  // Query Service runs Spark SQL, where a backslash escapes a quote character, so
  // quote-doubling alone is not a safe guarantee. The tool schema applies a strict
  // allowlist before any value reaches the query builder.
  for (const payload of [
    "\\' OR 1=1 --",
    "camping' OR 1=1 --",
    'camping\\gear',
    'camping%gear',
    'camping_gear',
    'camping"gear',
    'camping;gear',
    'camping\u0000gear',
    'a'.repeat(65),
    '',
  ]) {
    assert.equal(GEO_INTEREST_PATTERN.test(payload), false, `${JSON.stringify(payload)} must be rejected`);
  }

  for (const allowed of ['camping gear', 'Café & Co.', 'Ropa de montaña', 'tents, poles - 2 person', 'كشتة']) {
    assert.equal(GEO_INTEREST_PATTERN.test(allowed), true, `${allowed} must be allowed`);
  }
});

test('known-unavailable lab API state is recognised only from the explicit data_status flag', () => {
  assert.equal(isGeoDataUnavailable({ ok: true, rows: [], data_status: 'unavailable' }), true);
  assert.equal(isGeoDataUnavailable({ ok: true, rows: [], data_status: 'available' }), false);
  assert.equal(isGeoDataUnavailable({ ok: true, rows: [] }), false);
  assert.equal(isGeoDataUnavailable({ ok: false, error: 'Bad Gateway' }), false);
  assert.equal(isGeoDataUnavailable(null), false);
});

test('unavailable geo data is an honest empty audience_geo_hotspots result, not a zero count', () => {
  const result = shapeGeoHotspotsUnavailableResponse({
    center: { lat: 24.71355, lon: 46.67529, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    sandbox: 'apalmer',
    generated_at: '2026-09-27T12:00:00.000Z',
  });

  assert.deepEqual(result, {
    ok: true,
    kind: 'audience_geo_hotspots',
    center: { lat: 24.7136, lon: 46.6753, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    total_profiles: 0,
    suppressed_profiles: 0,
    k_threshold: 10,
    hotspots: [],
    source: 'none',
    data_status: 'unavailable',
    sandbox: 'apalmer',
    generated_at: '2026-09-27T12:00:00.000Z',
    hint: result.hint,
  });
  assert.match(result.hint, /not available yet/i);
  assert.match(result.hint, /not a zero count/i);
  assert.doesNotMatch(result.hint, /lab_seed_geo_demo/);
});

test('hotspot payload kind stays audience_geo_hotspots for every data status', () => {
  const common = {
    center: { lat: 24, lon: 46, label: 'Riyadh' },
    radius_km: 10,
    window_hours: 24,
    interest: 'camping gear',
    sandbox: 'apalmer',
  };
  assert.equal(shapeGeoHotspotsResponse({ ...common, rows: [] }).kind, 'audience_geo_hotspots');
  assert.equal(shapeGeoHotspotsUnavailableResponse(common).kind, 'audience_geo_hotspots');
});

test('seed batch hands generateProfile the full email plan so the stored mobile is applied', async () => {
  const plan = buildGeoSeedPlan({ city: 'Riyadh', count: 1 });
  const seen = [];
  await runGeoSeedBatch({
    plan,
    deps: {
      resolveEmail: async () => ({ ok: true, email: 'demo+47@example.com', mobilePhone: '+447425627462' }),
      generateProfile: async (input) => { seen.push(input); return { ok: true, ecid: CANONICAL_TEST_ECID }; },
      sendEvent: async () => ({ ok: true }),
    },
  });
  assert.equal(seen[0].email, 'demo+47@example.com');
  assert.equal(seen[0].emailPlan.mobilePhone, '+447425627462');
  assert.equal(seen[0].seed, plan[0]);
});

test('seed plans cover every featured area with three clusters inside a 10 km query', () => {
  const centers = {
    london: { lat: 51.5074, lon: -0.1278, city: 'London', cc: 'GB' },
    tokyo: { lat: 35.6895, lon: 139.6917, city: 'Tokyo', cc: 'JP' },
    'são paulo': { lat: -23.5505, lon: -46.6333, city: 'São Paulo', cc: 'BR' },
  };
  for (const [city, c] of Object.entries(centers)) {
    const plan = buildGeoSeedPlan({ city, count: 30, now: () => Date.parse('2026-09-28T12:00:00Z'), random: () => 0.5 });
    const points = new Map();
    for (const seed of plan) points.set(`${seed.lat},${seed.lon}`, (points.get(`${seed.lat},${seed.lon}`) || 0) + 1);
    assert.deepEqual([...points.values()], [10, 10, 10], city);
    for (const seed of plan) {
      assert.ok(kmBetween(c, seed) < 6, `${city} ${seed.neighborhood} ${kmBetween(c, seed).toFixed(1)} km`);
      assert.ok(seed.neighborhood, `${city} seed has a neighborhood label`);
    }
    const attrs = geoSeedPlaceAttributes(plan[0]);
    assert.equal(attrs['profilePlaceContext.city'], c.city);
    assert.equal(attrs['profilePlaceContext.countryCode'], c.cc);
    assert.match(attrs['profilePlaceContext.regionCode'], /^[A-Z]{2}-[A-Z0-9]{1,3}$/);
  }
});

test('seed plans for any catalog city use three anchors ~2 km from the centre, without invented neighborhoods', () => {
  const plan = buildGeoSeedPlan({ city: 'Nairobi', count: 30, random: () => 0.1 });
  const preset = resolveGeoCityPreset('Nairobi');
  assert.equal(preset.place.city, 'Nairobi');
  assert.equal(preset.place.countryCode, 'KE');
  const points = new Set(plan.map((s) => `${s.lat},${s.lon}`));
  assert.equal(points.size, 3);
  for (const seed of plan) {
    const d = kmBetween({ lat: preset.center.lat, lon: preset.center.lon }, seed);
    assert.ok(d > 1.5 && d < 2.5, `anchor ${d.toFixed(2)} km`);
    assert.equal(seed.neighborhood, '');
  }
  const attrs = geoSeedPlaceAttributes(plan[0]);
  assert.equal(attrs['profilePlaceContext.city'], 'Nairobi');
  assert.equal(attrs['profilePlaceContext.countryCode'], 'KE');
  assert.equal(attrs['profilePlaceContext.neighborhood'], undefined);
  assert.equal(attrs['profilePlaceContext.regionCode'], undefined);
  assert.equal(attrs['profilePlaceContext.source'], 'mcp-seed');
});

test('seed plan rejects unknown cities with a catalog-aware message', () => {
  assert.throws(() => buildGeoSeedPlan({ city: 'Qwxzzy', count: 1 }), /featured areas .* or any catalog city/i);
});

test('hotspot labels fall back to featured neighborhoods outside Riyadh and Dubai', () => {
  assert.equal(nearestSeededNeighborhood({ lat: 51.5265, lon: -0.0786 }), 'Shoreditch');
  assert.equal(nearestSeededNeighborhood({ lat: 24.6908, lon: 46.6853 }), 'Olaya');
  assert.equal(nearestSeededNeighborhood({ lat: 0, lon: -150 }), '');
});
