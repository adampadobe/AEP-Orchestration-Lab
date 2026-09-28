import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  FEATURED_AREA_KEYS,
  FEATURED_AREAS,
  planClusteredPlaces,
  resolveArea,
  samplePlace,
  seedNeighborhoods,
  nearestNeighborhood,
  globalPlaceCount,
} from '../src/placeCatalog/index.mjs';

const require = createRequire(import.meta.url);
const webCatalog = require('../../../web/profile-viewer/place-catalog.js');
const { aggregateMirrorHotspots } = require('../../../functions/geoHotspotsService.js');

const WEB = new URL('../../../web/profile-viewer/', import.meta.url);
const MCP = new URL('../src/placeCatalog/', import.meta.url);

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function km(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h));
}

const REGION_CODE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

describe('place catalog copies (drift guard)', () => {
  it('MCP engine and data are byte-identical to the canonical web files', () => {
    assert.ok(readFileSync(new URL('place-catalog.js', WEB)).equals(readFileSync(new URL('place-catalog.cjs', MCP))),
      'engine drifted: run npm run build:place-catalog -- --sync-only');
    assert.ok(readFileSync(new URL('place-catalog-data.json', WEB)).equals(readFileSync(new URL('place-catalog-data.json', MCP))),
      'data drifted: run npm run build:place-catalog -- --sync-only');
  });

  it('the browser data wrapper carries exactly the JSON data', () => {
    const sandbox = { self: {} };
    vm.runInNewContext(readFileSync(new URL('place-catalog-data.js', WEB), 'utf8'), sandbox);
    const json = JSON.parse(readFileSync(new URL('place-catalog-data.json', WEB), 'utf8'));
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.self.AepPlaceCatalogData)), json);
  });

  it('the browser engine loads from the global data wrapper', () => {
    const sandbox = { self: {} };
    vm.runInNewContext(readFileSync(new URL('place-catalog-data.js', WEB), 'utf8'), sandbox);
    vm.runInNewContext(readFileSync(new URL('place-catalog.js', WEB), 'utf8'), sandbox);
    const api = sandbox.self.AepPlaceCatalog;
    assert.equal(api.globalPlaceCount(), webCatalog.globalPlaceCount());
    assert.equal(api.resolveArea('Nairobi').countryCode, 'KE');
  });
});

describe('global place data', () => {
  it('covers thousands of populated places across 200+ countries with valid rows', () => {
    const data = JSON.parse(readFileSync(new URL('place-catalog-data.json', WEB), 'utf8'));
    assert.ok(data.places.length > 5000, `${data.places.length} places`);
    assert.equal(data.count, data.places.length);
    assert.equal(globalPlaceCount(), data.places.length);
    assert.match(data.license, /public domain/i);
    const countries = new Set();
    for (const [name, cc, lat, lon, pop] of data.places) {
      assert.ok(name && typeof name === 'string');
      assert.match(cc, /^[A-Z]{2}$/);
      assert.ok(Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
      assert.ok(pop >= data.minPopulation);
      countries.add(cc);
    }
    assert.ok(countries.size >= 200, `${countries.size} countries`);
  });
});

describe('featured areas', () => {
  it('are the ten common areas, keeping the original four unchanged', () => {
    assert.deepEqual(FEATURED_AREA_KEYS, [
      'riyadh', 'dubai', 'london', 'newYork', 'singapore', 'tokyo', 'sydney', 'paris', 'saoPaulo', 'mumbai',
    ]);
    assert.deepEqual(FEATURED_AREAS.riyadh.neighborhoods.map((n) => n.name), [
      'Al Nakheel', 'Al Olaya', 'Al Malqa', 'Al Yasmin', 'Al Murabba',
    ]);
    assert.deepEqual(FEATURED_AREAS.newYork.neighborhoods[0], { name: 'Midtown Manhattan', lat: 40.7549, lon: -73.984 });
    assert.equal(FEATURED_AREAS.saoPaulo.city, 'São Paulo');
  });

  it('carry valid ISO 3166-2 region codes and neighborhoods near the area centre', () => {
    for (const key of FEATURED_AREA_KEYS) {
      const area = FEATURED_AREAS[key];
      assert.match(area.regionCode, REGION_CODE, key);
      assert.ok(area.regionCode.startsWith(`${area.countryCode}-`), key);
      assert.ok(area.neighborhoods.length >= 4, key);
      for (const n of area.neighborhoods) {
        assert.ok(km(area.center, n) < 25, `${key}/${n.name} is ${km(area.center, n).toFixed(1)} km from centre`);
      }
    }
  });

  it('seed neighborhoods are the three closest, all within 6 km of the centre (10 km map shows them)', () => {
    // Riyadh and Dubai keep their dedicated GEO_CITY_PRESETS seed anchors (geoInsights.mjs).
    for (const key of FEATURED_AREA_KEYS.filter((k) => k !== 'riyadh' && k !== 'dubai')) {
      const seeds = seedNeighborhoods(key);
      assert.equal(seeds.length, 3, key);
      for (const n of seeds) assert.ok(km(FEATURED_AREAS[key].center, n) < 6, `${key}/${n.name}`);
    }
  });

  it('labels a point with its featured neighborhood when close enough', () => {
    const olaya = FEATURED_AREAS.riyadh.neighborhoods[1];
    assert.equal(nearestNeighborhood(olaya.lat + 0.001, olaya.lon), 'Al Olaya');
    assert.equal(nearestNeighborhood(0, 0), '');
  });
});

describe('resolveArea', () => {
  it('matches featured areas by key, city and accent-insensitive name', () => {
    assert.equal(resolveArea('riyadh').key, 'riyadh');
    assert.equal(resolveArea('New York').key, 'newYork');
    assert.equal(resolveArea('newYork').kind, 'featured');
    assert.equal(resolveArea('Sao Paulo').key, 'saoPaulo');
    assert.equal(resolveArea('Tokyo, JP').key, 'tokyo');
  });

  it('falls back to any catalog city, preferring the most populous and honouring a country code', () => {
    const nairobi = resolveArea('Nairobi');
    assert.equal(nairobi.kind, 'global');
    assert.equal(nairobi.countryCode, 'KE');
    assert.equal(resolveArea('Birmingham').countryCode, 'GB');
    assert.equal(resolveArea('Birmingham, US').countryCode, 'US');
    assert.equal(resolveArea('London, CA').countryCode, 'CA');
    assert.equal(resolveArea('reykjavik').countryCode, 'IS');
  });

  it('returns null for unknown or empty input', () => {
    assert.equal(resolveArea('Atlantis'), null);
    assert.equal(resolveArea(''), null);
    assert.equal(resolveArea(null), null);
  });
});

describe('samplePlace', () => {
  it('featured mode reproduces the legacy preset sampler draw order', () => {
    const vals = [0.1, 0.7, 0.3, 0.9, 0.5];
    let i = 0;
    const s = samplePlace({ mode: 'featured', area: 'london', rng: () => vals[i++] });
    assert.equal(s.neighborhood, 'Shoreditch');
    assert.equal(s.city, 'London');
    assert.equal(s.regionCode, 'GB-LND');
    assert.equal(s.accuracyMeters, 25 + Math.floor(0.7 * 276));
  });

  it("featured mode with area 'random' or no area picks any featured area", () => {
    const rng = seededRng(3);
    const cities = new Set(FEATURED_AREA_KEYS.map((k) => FEATURED_AREAS[k].city));
    for (let i = 0; i < 20; i += 1) {
      assert.ok(cities.has(samplePlace({ mode: 'featured', area: 'random', rng }).city));
      assert.ok(cities.has(samplePlace({ rng }).city));
    }
  });

  it('global mode can land anywhere: many countries, valid leaves, no region code', () => {
    const rng = seededRng(42);
    const countries = new Set();
    for (let n = 0; n < 600; n += 1) {
      const s = samplePlace({ mode: 'global', rng });
      assert.ok(Math.abs(s.latitude) <= 90 && Math.abs(s.longitude) <= 180);
      assert.match(s.countryCode, /^[A-Z]{2}$/);
      assert.ok(s.city.length > 0 && s.city.length <= 100);
      assert.equal(s.regionCode, undefined);
      assert.equal(s.neighborhood, undefined);
      assert.ok(Number.isInteger(s.accuracyMeters) && s.accuracyMeters >= 25 && s.accuracyMeters <= 300);
      countries.add(s.countryCode);
    }
    assert.ok(countries.size >= 60, `${countries.size} countries`);
  });

  it('area mode samples inside a featured area or any named city', () => {
    const rng = seededRng(7);
    const tokyo = samplePlace({ mode: 'area', area: 'Tokyo', rng });
    assert.equal(tokyo.city, 'Tokyo');
    assert.equal(tokyo.regionCode, 'JP-13');
    const nairobi = resolveArea('Nairobi');
    for (let n = 0; n < 50; n += 1) {
      const s = samplePlace({ mode: 'area', area: 'Nairobi', rng });
      assert.equal(s.city, 'Nairobi');
      assert.equal(s.countryCode, 'KE');
      assert.ok(km({ lat: nairobi.lat, lon: nairobi.lon }, { lat: s.latitude, lon: s.longitude }) <= 10.01);
    }
  });

  it('rejects unknown modes and areas', () => {
    assert.throws(() => samplePlace({ mode: 'moon' }), /mode/);
    assert.throws(() => samplePlace({ mode: 'area', area: 'Atlantis' }), /Unknown place area/);
    assert.throws(() => samplePlace({ mode: 'area' }), /area is required/);
  });
});

function hotspotsFor(places, center, radiusKm = 25, cellKm = 1) {
  return aggregateMirrorHotspots({
    places: places.map((p, i) => ({ lat: p.latitude, lon: p.longitude, identityHash: `id${i}` })),
    center,
    radiusKm,
    cellKm,
  }).filter((row) => row.cell_lat !== null);
}

describe('planClusteredPlaces', () => {
  it('groups a bulk batch into clusters of at least k that share one point', () => {
    const plan = planClusteredPlaces({ count: 100, mode: 'area', area: 'riyadh', rng: seededRng(3) });
    assert.equal(plan.places.length, 100);
    assert.equal(plan.k, 10);
    assert.equal(plan.clusters.length, 8);
    assert.equal(plan.clusters.reduce((sum, c) => sum + c.size, 0), 100);
    for (const c of plan.clusters) assert.ok(c.size >= 12);
    for (const [index, place] of plan.places.entries()) {
      const c = plan.clusters[plan.assignments[index]];
      assert.equal(place.latitude, c.latitude);
      assert.equal(place.longitude, c.longitude);
      assert.equal(place.city, 'Riyadh');
    }
    assert.deepEqual(plan.warnings, []);
  });

  it('every cluster surfaces as a k-anonymous hotspot cell in the real mirror aggregation', () => {
    const plan = planClusteredPlaces({ count: 60, clusterSize: 10, mode: 'area', area: 'Riyadh', rng: seededRng(9) });
    const rows = hotspotsFor(plan.places, FEATURED_AREAS.riyadh.center);
    assert.equal(rows.reduce((sum, r) => sum + r.profiles, 0), 60);
    assert.equal(rows[0].suppressed_profiles, 0);
  });

  it('unclustered global random places are suppressed by k-anonymity (why clustering matters)', () => {
    const rng = seededRng(11);
    const places = Array.from({ length: 200 }, () => samplePlace({ mode: 'global', rng }));
    const rows = hotspotsFor(places, { lat: 0, lon: 0 }, 20000, 1);
    assert.equal(rows.reduce((sum, r) => sum + r.profiles, 0), 0);
  });

  it('global clusters land in different cities worldwide, each still k-anonymous', () => {
    const plan = planClusteredPlaces({ count: 120, mode: 'global', rng: seededRng(5) });
    assert.equal(plan.clusters.length, 10);
    assert.ok(new Set(plan.clusters.map((c) => c.countryCode)).size >= 5);
    for (const c of plan.clusters) {
      const members = plan.places.filter((_, i) => plan.assignments[i] === plan.clusters.indexOf(c));
      const rows = hotspotsFor(members, { lat: c.latitude, lon: c.longitude }, 10, 0.5);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].profiles, c.size);
    }
  });

  it('keeps small batches in one cluster and warns when below k', () => {
    const small = planClusteredPlaces({ count: 11, mode: 'featured', area: 'dubai', rng: seededRng(1) });
    assert.equal(small.clusters.length, 1);
    assert.equal(small.clusters[0].size, 11);
    assert.deepEqual(small.warnings, []);
    const tiny = planClusteredPlaces({ count: 4, mode: 'featured', area: 'dubai', rng: seededRng(1) });
    assert.equal(tiny.clusters.length, 1);
    assert.match(tiny.warnings[0], /below k=10/);
  });

  it('featured-area clusters cycle through distinct neighborhoods', () => {
    const plan = planClusteredPlaces({ count: 50, clusterSize: 10, mode: 'area', area: 'paris', rng: seededRng(2) });
    assert.equal(new Set(plan.clusters.map((c) => c.neighborhood)).size, 5);
  });

  it('validates count and cluster size', () => {
    assert.throws(() => planClusteredPlaces({ count: 0 }), /count/);
    assert.throws(() => planClusteredPlaces({ count: 20, clusterSize: 5 }), /clusterSize/);
  });
});
