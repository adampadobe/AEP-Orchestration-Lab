import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGeneratorPostBody } from '../src/framework/buildGeneratorPostBody.mjs';
import { resolveEventPlace } from '../src/framework/placeParams.mjs';
import {
  sanitizeCoworkerEventParams,
  sanitizeCoworkerEventSteps,
} from '../src/framework/sanitizeCoworkerEventParams.mjs';
import { distanceKm, FEATURED_AREAS } from '../src/placeCatalog/index.mjs';

function seeded(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const EVENT_LEAVES = new Set([
  'latitude', 'longitude', 'accuracyMeters', 'neighborhood', 'city',
  'regionCode', 'countryCode', 'storeId', 'poiId', 'source',
]);

test('resolveEventPlace returns null without place params', () => {
  assert.deepEqual(resolveEventPlace({}), { ok: true, value: null });
});

test('resolveEventPlace samples a featured area into event-place leaves', () => {
  const r = resolveEventPlace({ place_area: 'tokyo' }, { rng: seeded() });
  assert.equal(r.ok, true);
  const v = r.value;
  assert.equal(v.city, 'Tokyo');
  assert.equal(v.countryCode, 'JP');
  assert.equal(v.source, 'event-tool');
  for (const k of Object.keys(v)) assert.ok(EVENT_LEAVES.has(k), `unexpected leaf ${k}`);
  assert.ok(!('geohash' in v), 'server derives geohash');
  const c = FEATURED_AREAS.tokyo.center;
  assert.ok(distanceKm(v.latitude, v.longitude, c.lat, c.lon) < 40);
});

test('resolveEventPlace supports global mode and any catalog city', () => {
  const g = resolveEventPlace({ place_mode: 'global' }, { rng: seeded(3) });
  assert.equal(g.ok, true);
  assert.equal(typeof g.value.latitude, 'number');
  assert.match(g.value.countryCode, /^[A-Z]{2}$/);
  const n = resolveEventPlace({ place_area: 'Nairobi' }, { rng: seeded(4) });
  assert.equal(n.ok, true);
  assert.equal(n.value.countryCode, 'KE');
});

test('resolveEventPlace accepts an explicit event_place and rejects bad input', () => {
  const ok = resolveEventPlace({ event_place: { latitude: 24.7, longitude: 46.7, city: 'Riyadh', countryCode: 'SA' } });
  assert.deepEqual(ok, {
    ok: true,
    value: { latitude: 24.7, longitude: 46.7, city: 'Riyadh', countryCode: 'SA', source: 'event-tool' },
  });
  assert.equal(resolveEventPlace({ event_place: { latitude: 99, longitude: 1 } }).ok, false);
  assert.equal(resolveEventPlace({ event_place: { latitude: 1 } }).ok, false);
  assert.equal(resolveEventPlace({ event_place: { latitude: 1, longitude: 2, geohash: 'x' } }).ok, false);
  assert.equal(resolveEventPlace({ event_place: { latitude: 1, longitude: 2 }, place_area: 'tokyo' }).ok, false);
  assert.equal(resolveEventPlace({ place_area: 'Atlantis Nowhere' }).ok, false);
});

test('sanitizeCoworkerEventParams converts place params into event_place', () => {
  const r = sanitizeCoworkerEventParams({ event_type: 'commerce.productViews', place_area: 'riyadh' }, { rng: seeded() });
  assert.deepEqual(r.errors, []);
  assert.equal(r.params.place_area, undefined);
  assert.equal(r.params.place_mode, undefined);
  assert.equal(r.params.event_place.city, 'Riyadh');
  const bad = sanitizeCoworkerEventParams({ place_mode: 'area' });
  assert.equal(bad.errors.length, 1);
});

test('sanitizeCoworkerEventSteps applies batch place defaults per step unless overridden', () => {
  const r = sanitizeCoworkerEventSteps(
    [{ event_type: 'a' }, { event_type: 'b', place_area: 'london' }],
    { place: { place_area: 'dubai' }, rng: seeded() },
  );
  assert.deepEqual(r.errors, []);
  assert.equal(r.events[0].event_place.city, 'Dubai');
  assert.equal(r.events[1].event_place.city, 'London');
  const none = sanitizeCoworkerEventSteps([{ event_type: 'a' }]);
  assert.equal(none.events[0].event_place, undefined);
});

test('buildGeneratorPostBody forwards event_place as body.eventPlace', () => {
  const place = { latitude: 24.7, longitude: 46.7, city: 'Riyadh', source: 'event-tool' };
  const body = buildGeneratorPostBody({ email: 'a@b.co', event_type: 'x', event_place: place });
  assert.deepEqual(body.eventPlace, place);
  assert.notEqual(body.eventPlace, place);
  assert.equal('eventPlace' in buildGeneratorPostBody({ email: 'a@b.co' }), false);
});
