'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const placeContext = require('../profilePlaceContext');
const genericInfra = require('../genericProfileInfraService');
const profileStreamingCore = require('../profileStreamingCore');
const { resolveIndustryForPath } = require('../industryAttributeMap');
const webPlace = require(path.resolve(__dirname, '../../web/profile-viewer/profile-place-context.js'));

const NOW = new Date('2026-07-10T12:00:00.000Z');

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('profilePlaceContext.encodeGeohash', () => {
  it('matches published geohash vectors', () => {
    assert.equal(placeContext.encodeGeohash(57.64911, 10.40744, 11), 'u4pruydqqvj');
    assert.equal(placeContext.encodeGeohash(42.605, -5.603, 5), 'ezs42');
    assert.equal(placeContext.encodeGeohash(-25.382708, -49.265506, 12), '6gkzwgjzn820');
  });

  it('defaults to precision 7 and can be all digits', () => {
    assert.equal(placeContext.encodeGeohash(-89.9999, -179.9999), '0000000');
    assert.equal(placeContext.encodeGeohash(24.7743, 46.6384).length, 7);
  });

  it('rejects non-finite / out-of-range coordinates', () => {
    assert.throws(() => placeContext.encodeGeohash(91, 0), /latitude/);
    assert.throws(() => placeContext.encodeGeohash(0, 181), /longitude/);
    assert.throws(() => placeContext.encodeGeohash(Number.NaN, 0), /latitude/);
  });

  it('web helper produces identical geohashes to the server', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 200; i++) {
      const lat = rng() * 180 - 90;
      const lon = rng() * 360 - 180;
      assert.equal(webPlace.encodeGeohash(lat, lon, 7), placeContext.encodeGeohash(lat, lon, 7));
    }
  });
});

describe('profilePlaceContext spec parity', () => {
  it('leaf list and source enum match the field group spec', () => {
    assert.deepEqual([...placeContext.PLACE_CONTEXT_LEAVES].sort(),
      genericInfra.PROFILE_PLACE_CONTEXT_LEAF_PATHS.map((p) => p.replace('profilePlaceContext.', '')).sort());
    assert.deepEqual(placeContext.PLACE_CONTEXT_SOURCES, genericInfra.PLACE_CONTEXT_SOURCES);
    assert.deepEqual(webPlace.PLACE_CONTEXT_SOURCES, genericInfra.PLACE_CONTEXT_SOURCES);
  });
});

describe('profilePlaceContext.normalizeProfilePlaceContext', () => {
  const base = {
    latitude: 24.7743,
    longitude: 46.6384,
    accuracyMeters: 150,
    neighborhood: 'Al Nakheel',
    city: 'Riyadh',
    regionCode: 'SA-01',
    countryCode: 'SA',
    lastSeenAt: '2026-07-10T08:15:00Z',
    source: 'ui-sample',
  };

  it('derives geohash server-side and keeps valid leaves', () => {
    const r = placeContext.normalizeProfilePlaceContext({ ...base }, { now: NOW });
    assert.equal(r.ok, true);
    assert.equal(r.value.geohash, placeContext.encodeGeohash(24.7743, 46.6384, 7));
    assert.equal(r.value.city, 'Riyadh');
    assert.equal(r.value.lastSeenAt, '2026-07-10T08:15:00Z');
    assert.equal(r.value.source, 'ui-sample');
  });

  it('defaults lastSeenAt (when coordinates present) and source', () => {
    const r = placeContext.normalizeProfilePlaceContext(
      { latitude: 24.7743, longitude: 46.6384 },
      { now: NOW, defaultSource: 'profile-update' },
    );
    assert.equal(r.ok, true);
    assert.equal(r.value.lastSeenAt, NOW.toISOString());
    assert.equal(r.value.source, 'profile-update');
  });

  it('accepts a matching client geohash, rejects a mismatching one', () => {
    const gh = placeContext.encodeGeohash(24.7743, 46.6384, 7);
    assert.equal(placeContext.normalizeProfilePlaceContext({ ...base, geohash: gh }, { now: NOW }).ok, true);
    const bad = placeContext.normalizeProfilePlaceContext({ ...base, geohash: 'u4pruyd' }, { now: NOW });
    assert.equal(bad.ok, false);
    assert.equal(bad.leaf, 'geohash');
  });

  const rejects = [
    ['latitude without longitude', { latitude: 1 }, 'longitude'],
    ['string latitude', { latitude: '24.77', longitude: 46.6 }, 'latitude'],
    ['latitude out of range', { latitude: 95, longitude: 46.6 }, 'latitude'],
    ['longitude out of range', { latitude: 24, longitude: -200 }, 'longitude'],
    ['non-integer accuracy', { accuracyMeters: 12.5 }, 'accuracyMeters'],
    ['negative accuracy', { accuracyMeters: -1 }, 'accuracyMeters'],
    ['lowercase country', { countryCode: 'sa' }, 'countryCode'],
    ['bad region', { regionCode: 'Riyadh' }, 'regionCode'],
    ['region/country mismatch', { regionCode: 'AE-DU', countryCode: 'SA' }, 'regionCode'],
    ['empty city', { city: '   ' }, 'city'],
    ['long neighborhood', { neighborhood: 'x'.repeat(101) }, 'neighborhood'],
    ['bad lastSeenAt', { lastSeenAt: 'yesterday' }, 'lastSeenAt'],
    ['date-only lastSeenAt', { lastSeenAt: '2026-07-10' }, 'lastSeenAt'],
    ['unknown source', { source: 'magic' }, 'source'],
    ['unknown leaf', { altitude: 5 }, 'altitude'],
    ['null leaf', { city: null }, 'city'],
    ['geohash wrong alphabet', { geohash: 'abcdefg' }, 'geohash'],
  ];
  for (const [name, input, leaf] of rejects) {
    it(`rejects ${name}`, () => {
      const r = placeContext.normalizeProfilePlaceContext(input, { now: NOW });
      assert.equal(r.ok, false, name);
      assert.equal(r.leaf, leaf);
      assert.match(r.error, /profilePlaceContext/);
    });
  }

  it('rejects a non-object', () => {
    assert.equal(placeContext.normalizeProfilePlaceContext('Riyadh', { now: NOW }).ok, false);
  });
});

describe('profile streaming integration points', () => {
  it('keeps all-digit geohash / text leaves as strings', () => {
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('profilePlaceContext.geohash'), true);
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('profilePlaceContext.neighborhood'), true);
    assert.equal(profileStreamingCore.isDigitStringSchemaLeafPath('profilePlaceContext.latitude'), false);
  });

  it('profilePlaceContext is not a root mixin (lands under the tenant)', () => {
    assert.equal(profileStreamingCore.PROFILE_STREAM_ROOT_PATH_PREFIXES.has('profilePlaceContext'), false);
  });

  it('attribute ownership maps place context to generic by explicit prefix', () => {
    const r = resolveIndustryForPath('_demoemea.profilePlaceContext.latitude');
    assert.equal(r.industry, 'generic');
  });
});

describe('web profile-place-context helper', () => {
  it('generates bounded samples for every preset', () => {
    const rng = seededRng(7);
    for (const key of Object.keys(webPlace.PRESETS)) {
      for (let i = 0; i < 25; i++) {
        const s = webPlace.generateSample(key, { rng, now: NOW });
        const r = placeContext.normalizeProfilePlaceContext(s, { now: NOW });
        assert.equal(r.ok, true, `${key}: ${r.error}`);
        assert.equal(s.source, 'ui-sample');
        assert.equal(s.city, webPlace.PRESETS[key].city);
        const ageMs = NOW.getTime() - Date.parse(s.lastSeenAt);
        assert.ok(ageMs >= 0 && ageMs <= 6 * 3600 * 1000, 'lastSeenAt within last 6h');
        const anchor = webPlace.PRESETS[key].neighborhoods.find((n) => n.name === s.neighborhood);
        assert.ok(anchor, 'neighborhood from preset');
        const d = webPlace.haversineMeters(anchor.lat, anchor.lon, s.latitude, s.longitude);
        assert.ok(d <= s.accuracyMeters + 1, `jitter ${d} within accuracy ${s.accuracyMeters}`);
      }
    }
  });

  it('random preset picks one of the named presets; none returns null', () => {
    const s = webPlace.generateSample('random', { rng: seededRng(1), now: NOW });
    assert.ok(Object.values(webPlace.PRESETS).some((p) => p.city === s.city));
    assert.equal(webPlace.generateSample('none', { now: NOW }), null);
    assert.throws(() => webPlace.generateSample('atlantis', { now: NOW }), /Unknown place preset/);
  });

  it('buildUpdates emits typed tenant-relative paths and omits geohash/empties', () => {
    const updates = webPlace.buildUpdates({
      latitude: 24.7743, longitude: 46.6384, accuracyMeters: 150, neighborhood: 'Al Nakheel',
      city: 'Riyadh', regionCode: 'SA-01', countryCode: 'SA', lastSeenAt: '2026-07-10T08:15:00Z',
      source: 'ui-sample', geohash: 'th3u8wr',
    });
    const byPath = Object.fromEntries(updates.map((u) => [u.path, u]));
    assert.equal(byPath['profilePlaceContext.latitude'].valueType, 'number');
    assert.equal(byPath['profilePlaceContext.accuracyMeters'].value, 150);
    assert.equal(byPath['profilePlaceContext.city'].valueType, 'string');
    assert.equal(byPath['profilePlaceContext.geohash'], undefined);
    assert.equal(updates.length, 9);
    assert.deepEqual(webPlace.buildUpdates({ city: '', latitude: null }), []);
  });

  it('readFromRows hydrates from profile table rows (tenant-agnostic)', () => {
    const rows = [
      { path: '_demoemea.profilePlaceContext.latitude', value: 24.7743 },
      { path: '_demoemea.profilePlaceContext.longitude', value: '46.6384' },
      { path: '_otherTenant.profilePlaceContext.city', value: 'Riyadh' },
      { path: '_demoemea.profilePlaceContext.geohash', value: 'th3u8wr' },
      { path: 'homeAddress.city', value: 'Jeddah' },
    ];
    const p = webPlace.readFromRows(rows);
    assert.equal(p.latitude, '24.7743');
    assert.equal(p.longitude, '46.6384');
    assert.equal(p.city, 'Riyadh');
    assert.equal(p.geohash, 'th3u8wr');
    assert.equal(webPlace.readFromRows([{ path: 'homeAddress.city', value: 'x' }]), null);
  });

  it('converts between ISO and datetime-local round-trip', () => {
    const iso = '2026-07-10T08:15:00.000Z';
    const local = webPlace.isoToLocalInput(iso);
    assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.equal(webPlace.localInputToIso(local), iso);
    assert.equal(webPlace.localInputToIso(''), '');
    assert.equal(webPlace.isoToLocalInput('garbage'), '');
  });
});
