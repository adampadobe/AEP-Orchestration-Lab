/**
 * Profile place context helpers for the Generate Profiles page (Generic).
 *
 * Writes `_<tenant>.profilePlaceContext.*` — the person's last-known place,
 * NOT their residential address (field group "AEP Lab - Profile Place
 * Context v1"). The geohash here is a preview only; the server derives the
 * authoritative value from latitude/longitude (functions/profilePlaceContext.js).
 *
 * UMD: exposes window.AepProfilePlaceContext in the browser and
 * module.exports under Node so functions/test can exercise it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AepProfilePlaceContext = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PLACE_CONTEXT_SOURCES = ['ui-sample', 'ui-manual', 'profile-update', 'mcp-persona', 'mcp-seed', 'import'];
  const LEAVES = ['latitude', 'longitude', 'geohash', 'accuracyMeters', 'neighborhood', 'city',
    'regionCode', 'countryCode', 'lastSeenAt', 'source'];
  const NUMBER_LEAVES = new Set(['latitude', 'longitude', 'accuracyMeters']);
  const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';
  const SAMPLE_MAX_AGE_MS = 6 * 3600 * 1000;
  const ACCURACY_MIN = 25;
  const ACCURACY_MAX = 300;
  const EARTH_RADIUS_M = 6371008.8;

  const PRESETS = {
    riyadh: {
      label: 'Riyadh, Saudi Arabia',
      city: 'Riyadh',
      regionCode: 'SA-01',
      countryCode: 'SA',
      neighborhoods: [
        { name: 'Al Nakheel', lat: 24.7743, lon: 46.6384 },
        { name: 'Al Olaya', lat: 24.6958, lon: 46.685 },
        { name: 'Al Malqa', lat: 24.812, lon: 46.612 },
        { name: 'Al Yasmin', lat: 24.825, lon: 46.64 },
        { name: 'Al Murabba', lat: 24.644, lon: 46.711 },
      ],
    },
    dubai: {
      label: 'Dubai, UAE',
      city: 'Dubai',
      regionCode: 'AE-DU',
      countryCode: 'AE',
      neighborhoods: [
        { name: 'Downtown Dubai', lat: 25.1972, lon: 55.2744 },
        { name: 'Dubai Marina', lat: 25.0805, lon: 55.1403 },
        { name: 'Deira', lat: 25.2711, lon: 55.3075 },
        { name: 'Jumeirah', lat: 25.2048, lon: 55.2474 },
      ],
    },
    london: {
      label: 'London, United Kingdom',
      city: 'London',
      regionCode: 'GB-LND',
      countryCode: 'GB',
      neighborhoods: [
        { name: 'Shoreditch', lat: 51.5265, lon: -0.0786 },
        { name: 'Camden', lat: 51.539, lon: -0.1426 },
        { name: 'Canary Wharf', lat: 51.5054, lon: -0.0235 },
        { name: 'Kensington', lat: 51.4991, lon: -0.1938 },
      ],
    },
    newYork: {
      label: 'New York, United States',
      city: 'New York',
      regionCode: 'US-NY',
      countryCode: 'US',
      neighborhoods: [
        { name: 'Midtown Manhattan', lat: 40.7549, lon: -73.984 },
        { name: 'Williamsburg', lat: 40.7081, lon: -73.9571 },
        { name: 'SoHo', lat: 40.7233, lon: -74.003 },
        { name: 'Harlem', lat: 40.8116, lon: -73.9465 },
      ],
    },
  };

  function encodeGeohash(latitude, longitude, precision) {
    const len = precision || 7;
    let latLo = -90;
    let latHi = 90;
    let lonLo = -180;
    let lonHi = 180;
    let hash = '';
    let bit = 0;
    let ch = 0;
    let even = true;
    while (hash.length < len) {
      if (even) {
        const mid = (lonLo + lonHi) / 2;
        if (longitude >= mid) { ch = (ch << 1) | 1; lonLo = mid; } else { ch <<= 1; lonHi = mid; }
      } else {
        const mid = (latLo + latHi) / 2;
        if (latitude >= mid) { ch = (ch << 1) | 1; latLo = mid; } else { ch <<= 1; latHi = mid; }
      }
      even = !even;
      bit += 1;
      if (bit === 5) {
        hash += GEOHASH_ALPHABET[ch];
        bit = 0;
        ch = 0;
      }
    }
    return hash;
  }

  function toRad(d) { return (d * Math.PI) / 180; }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  /** Uniform random point in a disk of `radiusM` around the anchor (small-distance approximation). */
  function jitter(lat, lon, radiusM, rng) {
    const r = radiusM * Math.sqrt(rng());
    const theta = 2 * Math.PI * rng();
    const dLat = (r * Math.cos(theta)) / EARTH_RADIUS_M;
    const dLon = (r * Math.sin(theta)) / (EARTH_RADIUS_M * Math.cos(toRad(lat)));
    return { latitude: round6(lat + (dLat * 180) / Math.PI), longitude: round6(lon + (dLon * 180) / Math.PI) };
  }

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

  /**
   * @param {string} presetKey - a PRESETS key, 'random', or 'none'
   * @param {{ rng?: () => number, now?: Date }} [opts]
   * @returns {object|null} place-context leaves (no geohash), or null for 'none'
   */
  function generateSample(presetKey, opts) {
    const rng = (opts && opts.rng) || Math.random;
    const now = (opts && opts.now) || new Date();
    if (presetKey === 'none') return null;
    const key = presetKey === 'random' ? pick(Object.keys(PRESETS), rng) : presetKey;
    const preset = PRESETS[key];
    if (!preset) throw new Error(`Unknown place preset "${presetKey}"`);
    const hood = pick(preset.neighborhoods, rng);
    const accuracyMeters = ACCURACY_MIN + Math.floor(rng() * (ACCURACY_MAX - ACCURACY_MIN + 1));
    // Keep the jittered point strictly inside the accuracy radius after 6-dp rounding.
    const pt = jitter(hood.lat, hood.lon, Math.max(0, accuracyMeters - 1), rng);
    const seenAt = new Date(now.getTime() - Math.floor(rng() * SAMPLE_MAX_AGE_MS));
    seenAt.setUTCMilliseconds(0);
    return {
      latitude: pt.latitude,
      longitude: pt.longitude,
      accuracyMeters,
      neighborhood: hood.name,
      city: preset.city,
      regionCode: preset.regionCode,
      countryCode: preset.countryCode,
      lastSeenAt: seenAt.toISOString().replace('.000Z', 'Z'),
      source: 'ui-sample',
    };
  }

  /**
   * Profile-update rows for /api/profile/update (tenant-relative; the proxy
   * nests them under `_<tenant>`). Empty values are skipped; geohash is
   * omitted because the server derives it.
   */
  function buildUpdates(place) {
    if (!place || typeof place !== 'object') return [];
    const updates = [];
    for (const leaf of LEAVES) {
      if (leaf === 'geohash') continue;
      const raw = place[leaf];
      if (raw === undefined || raw === null) continue;
      if (NUMBER_LEAVES.has(leaf)) {
        if (typeof raw === 'string' && raw.trim() === '') continue;
        updates.push({ path: `profilePlaceContext.${leaf}`, value: Number(raw), valueType: 'number' });
      } else {
        const s = String(raw).trim();
        if (!s) continue;
        updates.push({ path: `profilePlaceContext.${leaf}`, value: s, valueType: 'string' });
      }
    }
    return updates;
  }

  /** Hydrate from /api/profile/table rows ({ path, value }); tenant-agnostic. */
  function readFromRows(rows) {
    if (!Array.isArray(rows)) return null;
    const out = {};
    let found = false;
    for (const row of rows) {
      const p = String((row && row.path) || '');
      const m = /(?:^|\.)profilePlaceContext\.([A-Za-z]+)$/.exec(p);
      if (!m || !LEAVES.includes(m[1])) continue;
      if (row.value === undefined || row.value === null || String(row.value).trim() === '') continue;
      if (out[m[1]] === undefined) {
        out[m[1]] = String(row.value).trim();
        found = true;
      }
    }
    return found ? out : null;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** ISO 8601 → value for <input type="datetime-local"> in the browser's timezone. */
  function isoToLocalInput(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return '';
    const d = new Date(t);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** <input type="datetime-local"> value → ISO 8601 UTC ('' when blank/invalid). */
  function localInputToIso(local) {
    const s = String(local || '').trim();
    if (!s) return '';
    const t = new Date(s).getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : '';
  }

  return {
    PLACE_CONTEXT_SOURCES,
    LEAVES,
    PRESETS,
    encodeGeohash,
    haversineMeters,
    jitter,
    generateSample,
    buildUpdates,
    readFromRows,
    isoToLocalInput,
    localInputToIso,
  };
});
