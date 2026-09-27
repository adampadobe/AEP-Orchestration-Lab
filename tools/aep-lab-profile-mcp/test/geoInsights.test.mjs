import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GEO_CITY_PRESETS,
  GEO_MIN_K_ANONYMITY,
  MAX_GEO_HOTSPOTS,
  geoJsonResult,
  shapeGeoHotspotsResponse,
} from '../src/framework/geoInsights.mjs';
import { annotationsForTool } from '../src/toolAnnotations.mjs';
import { checkEdgeSendRate, checkGenerateRate, reserveGeoSeedRates } from '../src/rateLimiter.mjs';

test('geo seed presets cover the requested Riyadh and Dubai neighborhoods', () => {
  assert.deepEqual(Object.keys(GEO_CITY_PRESETS), ['riyadh', 'dubai']);
  assert.deepEqual(GEO_CITY_PRESETS.riyadh.map(({ name }) => name), [
    'Olaya', 'Al Malqa', 'Hittin', 'Al Yasmin', 'Al Nakheel', 'Diriyah',
  ]);
  assert.deepEqual(GEO_CITY_PRESETS.dubai.map(({ name }) => name), [
    'Dubai Marina', 'Downtown', 'Deira', 'JLT', 'Business Bay', 'Al Barsha',
  ]);
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
    sandbox: 'apalmer',
    generated_at: '2026-09-27T12:00:00.000Z',
    hint: '',
  });
  assert.equal(GEO_MIN_K_ANONYMITY, 10);
  assert.equal(MAX_GEO_HOTSPOTS, 50);
  assert.equal(JSON.stringify(result).includes('email'), false);
  assert.equal(JSON.stringify(result).includes('ecid'), false);
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
