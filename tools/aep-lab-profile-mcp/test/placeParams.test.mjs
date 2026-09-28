import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasPlaceParams,
  planBatchPlaces,
  plannedPlaceForIndex,
  summarizePlaceAttributes,
  summarizePlacePlan,
  validatePlaceParams,
} from '../src/framework/placeParams.mjs';
import { buildPersonaAttributes } from '../src/personaBuilder/index.mjs';
import {
  buildPlaceContextPersonaAttributes,
  resolvePlaceRequest,
} from '../src/personaBuilder/placeContext.mjs';
import { distanceKm, FEATURED_AREA_KEYS } from '../src/placeCatalog/index.mjs';

function seeded(seed = 42) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

test('resolvePlaceRequest maps preset, mode and area', () => {
  assert.deepEqual(resolvePlaceRequest({}), { mode: 'featured', area: 'random' });
  assert.deepEqual(resolvePlaceRequest({ preset: 'tokyo' }), { mode: 'featured', area: 'tokyo' });
  assert.deepEqual(resolvePlaceRequest({ preset: 'global' }), { mode: 'global' });
  assert.deepEqual(resolvePlaceRequest({ area: 'Nairobi' }), { mode: 'area', area: 'Nairobi' });
  assert.deepEqual(resolvePlaceRequest({ mode: 'global' }), { mode: 'global' });
  assert.throws(() => resolvePlaceRequest({ mode: 'moon' }), /Unknown place mode/);
  assert.throws(() => resolvePlaceRequest({ preset: 'atlantis' }), /Unknown place preset/);
});

test('global persona place has city + country only and stays within the city radius', () => {
  const rng = seeded(7);
  const countries = new Set();
  for (let i = 0; i < 120; i += 1) {
    const attrs = buildPlaceContextPersonaAttributes({ mode: 'global', rng });
    assert.equal(attrs['profilePlaceContext.source'], 'mcp-persona');
    assert.ok(attrs['profilePlaceContext.city']);
    assert.match(String(attrs['profilePlaceContext.countryCode']), /^[A-Z]{2}$/);
    assert.equal(attrs['profilePlaceContext.neighborhood'], undefined);
    assert.equal(attrs['profilePlaceContext.regionCode'], undefined);
    countries.add(attrs['profilePlaceContext.countryCode']);
  }
  assert.ok(countries.size >= 20, `expected broad global spread, got ${countries.size} countries`);
});

test('area mode resolves any catalog city', () => {
  const attrs = buildPlaceContextPersonaAttributes({ area: 'Nairobi', rng: seeded(3) });
  assert.equal(attrs['profilePlaceContext.city'], 'Nairobi');
  assert.equal(attrs['profilePlaceContext.countryCode'], 'KE');
  const d = distanceKm(-1.2833, 36.8167, attrs['profilePlaceContext.latitude'], attrs['profilePlaceContext.longitude']);
  assert.ok(d < 12, `Nairobi sample ${d} km from centre`);
});

test('a planned place passes through untouched apart from lastSeenAt/source', () => {
  const place = { latitude: 24.69, longitude: 46.685, accuracyMeters: 40, city: 'Riyadh', countryCode: 'SA' };
  const attrs = buildPlaceContextPersonaAttributes({ place, source: 'mcp-seed', rng: seeded(1) });
  assert.equal(attrs['profilePlaceContext.latitude'], 24.69);
  assert.equal(attrs['profilePlaceContext.longitude'], 46.685);
  assert.equal(attrs['profilePlaceContext.accuracyMeters'], 40);
  assert.equal(attrs['profilePlaceContext.source'], 'mcp-seed');
  assert.equal(attrs['profilePlaceContext.neighborhood'], undefined);
});

test('buildPersonaAttributes honours place_mode, place_area and planned place', () => {
  const g = buildPersonaAttributes('generic', 'a+28092026-1@example.com', null, { place_mode: 'global' });
  assert.equal(g['profilePlaceContext.neighborhood'], undefined);
  assert.equal(g['profilePlaceContext.regionCode'], undefined);
  assert.ok(g['profilePlaceContext.city']);

  const t = buildPersonaAttributes('retail', 'a+28092026-2@example.com', null, { place_area: 'tokyo' });
  assert.equal(t['profilePlaceContext.city'], 'Tokyo');
  assert.equal(t['profilePlaceContext.countryCode'], 'JP');

  const place = { latitude: 1.5, longitude: 2.5, accuracyMeters: 30, city: 'X', countryCode: 'GB' };
  const p = buildPersonaAttributes('generic', 'a+28092026-3@example.com', null, { place });
  assert.equal(p['profilePlaceContext.latitude'], 1.5);
  assert.equal(p['profilePlaceContext.city'], 'X');
});

test('validatePlaceParams accepts modes and rejects bad combinations', () => {
  assert.deepEqual(validatePlaceParams({}), { ok: true, place_mode: undefined });
  assert.equal(validatePlaceParams({ place_mode: 'global' }).ok, true);
  const area = validatePlaceParams({ place_area: 'Lagos' });
  assert.equal(area.ok, true);
  assert.equal(area.place_mode, 'area');
  assert.equal(area.resolved.countryCode, 'NG');
  assert.equal(validatePlaceParams({ place_mode: 'featured', place_area: 'riyadh' }).ok, true);
  assert.match(validatePlaceParams({ place_mode: 'featured', place_area: 'Lagos' }).error, /not a featured area/);
  assert.match(validatePlaceParams({ place_mode: 'area' }).error, /place_area is required/);
  assert.match(validatePlaceParams({ place_mode: 'global', place_area: 'Lagos' }).error, /cannot be combined/);
  assert.match(validatePlaceParams({ place_area: 'Qwxzzy' }).error, /Unknown place_area/);
  assert.equal(hasPlaceParams({}), false);
  assert.equal(hasPlaceParams({ place_area: 'Lagos' }), true);
});

test('planBatchPlaces clusters >= k profiles per point by default and can be disabled', () => {
  assert.equal(planBatchPlaces({ count: 5 }), null);
  assert.equal(planBatchPlaces({ count: 50, place_clustering: false }), null);
  const plan = planBatchPlaces({ count: 50, place_mode: 'global', rng: seeded(9) });
  assert.equal(plan.places.length, 50);
  assert.ok(plan.clusters.every((c) => c.size >= 10));
  assert.equal(plan.clusters.reduce((n, c) => n + c.size, 0), 50);
  const small = planBatchPlaces({ count: 4, place_clustering: true, place_area: 'riyadh', rng: seeded(2) });
  assert.equal(small.clusters.length, 1);
  assert.ok(small.warnings.length >= 1);

  const sum = summarizePlacePlan(plan);
  assert.equal(sum.cluster_count, plan.clusters.length);
  assert.equal(sum.k, 10);
  assert.ok(!('places' in sum) && !('assignments' in sum));
  assert.equal(plannedPlaceForIndex(plan, 1), plan.places[0]);
  assert.equal(plannedPlaceForIndex(null, 1), undefined);
});

test('cluster_size is honoured and featured areas stay in-area', () => {
  const plan = planBatchPlaces({ count: 60, place_area: 'riyadh', cluster_size: 20, rng: seeded(5) });
  assert.equal(plan.clusters.length, 3);
  for (const p of plan.places) {
    assert.equal(p.city, 'Riyadh');
    assert.ok(distanceKm(24.7136, 46.6753, p.latitude, p.longitude) < 25);
  }
});

test('summarizePlaceAttributes extracts dotted and nested leaves', () => {
  assert.deepEqual(
    summarizePlaceAttributes({ 'profilePlaceContext.city': 'Tokyo', 'person.name.firstName': 'A' }),
    { city: 'Tokyo' },
  );
  assert.deepEqual(summarizePlaceAttributes({ profilePlaceContext: { city: 'Paris' } }), { city: 'Paris' });
  assert.equal(summarizePlaceAttributes({ a: 1 }), null);
  assert.equal(FEATURED_AREA_KEYS.length, 10);
});
