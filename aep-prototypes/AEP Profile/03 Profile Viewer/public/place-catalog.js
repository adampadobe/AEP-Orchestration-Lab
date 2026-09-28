/**
 * AEP Lab global place catalog + sampler (window.AepPlaceCatalog / module.exports).
 *
 * - FEATURED_AREAS: ten curated "common areas" with ISO 3166-2 region codes and
 *   named neighborhoods (the original Riyadh/Dubai/London/New York presets are
 *   unchanged, so existing samples and drift tests stay stable).
 * - Global places: Natural Earth populated places (pop >= 10k, public domain),
 *   loaded from place-catalog-data.json (Node) or window.AepPlaceCatalogData
 *   (browser, via place-catalog-data.js). "Random anywhere" picks a city
 *   weighted by sqrt(population) so samples span the whole globe.
 * - planClusteredPlaces: groups bulk generation into clusters of >= k (10)
 *   profiles that share one exact point, so each cluster always lands in a
 *   single hotspot cell and survives k-anonymity suppression on the map.
 *
 * Canonical file. scripts/build-place-catalog.mjs copies it byte-for-byte to
 * tools/aep-lab-profile-mcp/src/placeCatalog/place-catalog.cjs.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./place-catalog-data.json'));
  } else {
    root.AepPlaceCatalog = factory(root.AepPlaceCatalogData || null);
  }
})(typeof self !== 'undefined' ? self : this, function (data) {
  'use strict';

  const EARTH_RADIUS_M = 6371008.8;
  const ACCURACY_MIN = 25;
  const ACCURACY_MAX = 300;
  const DEFAULT_K = 10;
  const DEFAULT_CLUSTER_SIZE = 12;
  const MAX_COUNT = 100000;
  const CLUSTER_ANCHOR_JITTER_M = 250;
  const MAX_CITY_RADIUS_KM = 10;
  const PLACE_MODES = ['featured', 'global', 'area'];

  function freezeDeep(o) {
    Object.values(o).forEach(function (v) { if (v && typeof v === 'object') freezeDeep(v); });
    return Object.freeze(o);
  }

  function hood(name, lat, lon) { return { name: name, lat: lat, lon: lon }; }

  const FEATURED_AREAS = freezeDeep({
    riyadh: {
      label: 'Riyadh, Saudi Arabia', city: 'Riyadh', regionCode: 'SA-01', countryCode: 'SA',
      center: { lat: 24.6877, lon: 46.7219 },
      neighborhoods: [hood('Al Nakheel', 24.7743, 46.6384), hood('Al Olaya', 24.6958, 46.685),
        hood('Al Malqa', 24.812, 46.612), hood('Al Yasmin', 24.825, 46.64), hood('Al Murabba', 24.644, 46.711)],
    },
    dubai: {
      label: 'Dubai, UAE', city: 'Dubai', regionCode: 'AE-DU', countryCode: 'AE',
      center: { lat: 25.2048, lon: 55.2708 },
      neighborhoods: [hood('Downtown Dubai', 25.1972, 55.2744), hood('Dubai Marina', 25.0805, 55.1403),
        hood('Deira', 25.2711, 55.3075), hood('Jumeirah', 25.2048, 55.2474)],
    },
    london: {
      label: 'London, United Kingdom', city: 'London', regionCode: 'GB-LND', countryCode: 'GB',
      center: { lat: 51.5074, lon: -0.1278 },
      neighborhoods: [hood('Shoreditch', 51.5265, -0.0786), hood('Camden', 51.539, -0.1426),
        hood('Canary Wharf', 51.5054, -0.0235), hood('Kensington', 51.4991, -0.1938)],
    },
    newYork: {
      label: 'New York, United States', city: 'New York', regionCode: 'US-NY', countryCode: 'US',
      center: { lat: 40.7128, lon: -74.006 },
      neighborhoods: [hood('Midtown Manhattan', 40.7549, -73.984), hood('Williamsburg', 40.7081, -73.9571),
        hood('SoHo', 40.7233, -74.003), hood('Harlem', 40.8116, -73.9465)],
    },
    singapore: {
      label: 'Singapore', city: 'Singapore', regionCode: 'SG-01', countryCode: 'SG',
      center: { lat: 1.2897, lon: 103.8501 },
      neighborhoods: [hood('Marina Bay', 1.2834, 103.8607), hood('Orchard', 1.3048, 103.8318),
        hood('Bugis', 1.3008, 103.8553), hood('Tampines', 1.3496, 103.9568), hood('Jurong East', 1.3329, 103.7436)],
    },
    tokyo: {
      label: 'Tokyo, Japan', city: 'Tokyo', regionCode: 'JP-13', countryCode: 'JP',
      center: { lat: 35.6895, lon: 139.6917 },
      neighborhoods: [hood('Shinjuku', 35.6938, 139.7034), hood('Shibuya', 35.6595, 139.7005),
        hood('Roppongi', 35.6628, 139.7314), hood('Ginza', 35.6717, 139.765), hood('Asakusa', 35.7148, 139.7967)],
    },
    sydney: {
      label: 'Sydney, Australia', city: 'Sydney', regionCode: 'AU-NSW', countryCode: 'AU',
      center: { lat: -33.8688, lon: 151.2093 },
      neighborhoods: [hood('Sydney CBD', -33.8688, 151.2093), hood('Surry Hills', -33.8861, 151.2111),
        hood('Pyrmont', -33.8697, 151.1946), hood('Bondi', -33.8915, 151.2767), hood('Newtown', -33.8981, 151.1746)],
    },
    paris: {
      label: 'Paris, France', city: 'Paris', regionCode: 'FR-IDF', countryCode: 'FR',
      center: { lat: 48.8566, lon: 2.3522 },
      neighborhoods: [hood('Le Marais', 48.859, 2.362), hood('Montmartre', 48.8867, 2.3431),
        hood('Saint-Germain-des-Prés', 48.854, 2.3339), hood('Bastille', 48.8532, 2.3691),
        hood('Champs-Élysées', 48.8698, 2.3076)],
    },
    saoPaulo: {
      label: 'São Paulo, Brazil', city: 'São Paulo', regionCode: 'BR-SP', countryCode: 'BR',
      center: { lat: -23.5505, lon: -46.6333 },
      neighborhoods: [hood('Paulista', -23.5614, -46.6559), hood('Vila Madalena', -23.5535, -46.6913),
        hood('Pinheiros', -23.567, -46.702), hood('Moema', -23.601, -46.665), hood('Itaim Bibi', -23.5846, -46.678)],
    },
    mumbai: {
      label: 'Mumbai, India', city: 'Mumbai', regionCode: 'IN-MH', countryCode: 'IN',
      center: { lat: 19.0144, lon: 72.8479 },
      neighborhoods: [hood('Lower Parel', 18.995, 72.83), hood('Worli', 19.0176, 72.8174),
        hood('Bandra', 19.0596, 72.8295), hood('Colaba', 18.9067, 72.8147), hood('Andheri', 19.1136, 72.8697)],
    },
  });
  const FEATURED_AREA_KEYS = Object.freeze(Object.keys(FEATURED_AREAS));

  const places = data && Array.isArray(data.places) ? data.places : [];

  function toRad(d) { return (d * Math.PI) / 180; }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
    return (2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))) / 1000;
  }

  /** Uniform random point in a disk of radiusM around the anchor (small-distance approximation). */
  function jitter(lat, lon, radiusM, rng) {
    const r = radiusM * Math.sqrt(rng());
    const theta = 2 * Math.PI * rng();
    const dLat = (r * Math.cos(theta)) / EARTH_RADIUS_M;
    const dLon = (r * Math.sin(theta)) / (EARTH_RADIUS_M * Math.max(Math.cos(toRad(lat)), 0.01));
    const outLat = Math.max(-90, Math.min(90, lat + (dLat * 180) / Math.PI));
    let outLon = lon + (dLon * 180) / Math.PI;
    if (outLon > 180) outLon -= 360;
    if (outLon < -180) outLon += 360;
    return { latitude: round6(outLat), longitude: round6(outLon) };
  }

  function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }
  function drawAccuracy(rng) { return ACCURACY_MIN + Math.floor(rng() * (ACCURACY_MAX - ACCURACY_MIN + 1)); }

  function normalizeName(value) {
    return String(value == null ? '' : value)
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9,]+/g, ' ').replace(/\s*,\s*/g, ',').trim();
  }

  function cityRadiusKm(population) {
    return Math.min(MAX_CITY_RADIUS_KM, 1 + Math.sqrt(Math.max(0, population)) / 800);
  }

  function rowToCity(row) {
    return { kind: 'global', name: row[0], countryCode: row[1], lat: row[2], lon: row[3], population: row[4],
      radiusKm: cityRadiusKm(row[4]) };
  }

  let cumulativeWeights = null;
  function weightedCityIndex(rng) {
    if (!places.length) throw new Error('Global place data is not loaded (include place-catalog-data.js).');
    if (!cumulativeWeights) {
      cumulativeWeights = new Float64Array(places.length);
      let sum = 0;
      for (let i = 0; i < places.length; i += 1) {
        sum += Math.sqrt(places[i][4]);
        cumulativeWeights[i] = sum;
      }
    }
    const target = rng() * cumulativeWeights[cumulativeWeights.length - 1];
    let lo = 0;
    let hi = cumulativeWeights.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cumulativeWeights[mid] <= target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  let featuredIndex = null;
  let nameIndex = null;
  function buildIndexes() {
    if (featuredIndex) return;
    featuredIndex = new Map();
    FEATURED_AREA_KEYS.forEach(function (key) {
      const area = FEATURED_AREAS[key];
      [key, area.city, area.label, area.city + ',' + area.countryCode].forEach(function (alias) {
        featuredIndex.set(normalizeName(alias), key);
      });
    });
    nameIndex = new Map();
    places.forEach(function (row, i) {
      const k = normalizeName(row[0]);
      if (!nameIndex.has(k)) nameIndex.set(k, []);
      nameIndex.get(k).push(i);
    });
  }

  function featuredArea(key) {
    return Object.assign({ kind: 'featured', key: key }, FEATURED_AREAS[key]);
  }

  /**
   * Resolve a featured-area key/name or any catalog city ("Nairobi", "Paris, US").
   * @returns {object|null} featured area ({ kind: 'featured', key, ... }) or global city ({ kind: 'global', ... })
   */
  function resolveArea(query) {
    const q = normalizeName(query);
    if (!q) return null;
    buildIndexes();
    if (featuredIndex.has(q)) return featuredArea(featuredIndex.get(q));
    const parts = q.split(',');
    const name = parts[0];
    const cc = parts[1] ? parts[1].toUpperCase() : '';
    if (featuredIndex.has(name) && (!cc || FEATURED_AREAS[featuredIndex.get(name)].countryCode === cc)) {
      return featuredArea(featuredIndex.get(name));
    }
    const candidates = (nameIndex.get(name) || []).filter(function (i) { return !cc || places[i][1] === cc; });
    if (!candidates.length) return null;
    // Rows are sorted by population descending, so the first candidate is the most populous.
    return rowToCity(places[candidates[0]]);
  }

  function sampleFeatured(key, rng) {
    const areaKey = key === 'random' || !key ? pick(FEATURED_AREA_KEYS, rng) : key;
    const area = FEATURED_AREAS[areaKey];
    if (!area) throw new Error('Unknown place preset "' + key + '"');
    const n = pick(area.neighborhoods, rng);
    const accuracyMeters = drawAccuracy(rng);
    // Keep the jittered point strictly inside the accuracy radius after 6-dp rounding.
    const pt = jitter(n.lat, n.lon, Math.max(0, accuracyMeters - 1), rng);
    return {
      latitude: pt.latitude,
      longitude: pt.longitude,
      accuracyMeters: accuracyMeters,
      neighborhood: n.name,
      city: area.city,
      regionCode: area.regionCode,
      countryCode: area.countryCode,
    };
  }

  function sampleInCity(city, rng) {
    const accuracyMeters = drawAccuracy(rng);
    const pt = jitter(city.lat, city.lon, city.radiusKm * 1000, rng);
    return {
      latitude: pt.latitude,
      longitude: pt.longitude,
      accuracyMeters: accuracyMeters,
      city: String(city.name).slice(0, 100),
      countryCode: city.countryCode,
    };
  }

  function resolveRequiredArea(area) {
    if (area == null || String(area).trim() === '') throw new Error('area is required when mode is "area".');
    const resolved = resolveArea(area);
    if (!resolved) throw new Error('Unknown place area "' + area + '". Use a featured area or a city name.');
    return resolved;
  }

  function assertMode(mode) {
    if (PLACE_MODES.indexOf(mode) < 0) {
      throw new Error('Unknown place mode "' + mode + '". Use one of: ' + PLACE_MODES.join(', ') + '.');
    }
  }

  /**
   * One place sample (no lastSeenAt/source — callers add those).
   * @param {{ mode?: 'featured'|'global'|'area', area?: string, rng?: () => number }} [opts]
   *   featured: area is an optional featured key or 'random' (default random featured area);
   *   global: a city anywhere on Earth; area: a featured area or any catalog city.
   */
  function samplePlace(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const mode = o.mode || 'featured';
    assertMode(mode);
    if (mode === 'featured') {
      if (o.area && o.area !== 'random' && !FEATURED_AREAS[o.area]) {
        const r = resolveArea(o.area);
        if (!r || r.kind !== 'featured') throw new Error('Unknown place preset "' + o.area + '"');
        return sampleFeatured(r.key, rng);
      }
      return sampleFeatured(o.area || 'random', rng);
    }
    if (mode === 'global') return sampleInCity(rowToCity(places[weightedCityIndex(rng)]), rng);
    const resolved = resolveRequiredArea(o.area);
    return resolved.kind === 'featured' ? sampleFeatured(resolved.key, rng) : sampleInCity(resolved, rng);
  }

  function shuffled(arr, rng) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  }

  function featuredAnchor(areaKey, n, rng) {
    const area = FEATURED_AREAS[areaKey];
    const pt = jitter(n.lat, n.lon, CLUSTER_ANCHOR_JITTER_M, rng);
    return { latitude: pt.latitude, longitude: pt.longitude, neighborhood: n.name, city: area.city,
      regionCode: area.regionCode, countryCode: area.countryCode };
  }

  function cityAnchor(city, rng) {
    const s = sampleInCity(city, rng);
    return { latitude: s.latitude, longitude: s.longitude, city: s.city, countryCode: s.countryCode };
  }

  function clusterSizes(count, clusterSize) {
    const n = count < clusterSize ? 1 : Math.floor(count / clusterSize);
    const base = Math.floor(count / n);
    const extra = count % n;
    return Array.from({ length: n }, function (_, i) { return base + (i < extra ? 1 : 0); });
  }

  /**
   * Plan places for bulk generation so the hotspot map can show them. Members of
   * a cluster share one exact point (one grid cell under any cell size/centre)
   * and every cluster has >= k members when count >= k.
   * @param {{ count: number, k?: number, clusterSize?: number, mode?: string, area?: string, rng?: () => number }} opts
   * @returns {{ k: number, clusterSize: number, clusters: object[], assignments: number[], places: object[], warnings: string[] }}
   */
  function planClusteredPlaces(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const count = o.count;
    const k = o.k == null ? DEFAULT_K : o.k;
    const clusterSize = o.clusterSize == null ? Math.max(DEFAULT_CLUSTER_SIZE, k) : o.clusterSize;
    const mode = o.mode || 'featured';
    assertMode(mode);
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new Error('count must be an integer between 1 and ' + MAX_COUNT + '.');
    }
    if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer.');
    if (!Number.isInteger(clusterSize) || clusterSize < k) {
      throw new Error('clusterSize must be an integer >= k (' + k + ').');
    }

    let areaKey = null;
    let city = null;
    if (mode === 'area') {
      const resolved = resolveRequiredArea(o.area);
      if (resolved.kind === 'featured') areaKey = resolved.key; else city = resolved;
    } else if (mode === 'featured' && o.area) {
      const resolved = FEATURED_AREAS[o.area] ? featuredArea(o.area) : resolveArea(o.area);
      if (!resolved || resolved.kind !== 'featured') throw new Error('Unknown place preset "' + o.area + '"');
      areaKey = resolved.key;
    }

    const sizes = clusterSizes(count, clusterSize);
    let hoodOrder = areaKey ? shuffled(FEATURED_AREAS[areaKey].neighborhoods, rng) : null;
    const clusters = sizes.map(function (size, i) {
      let anchor;
      if (areaKey) {
        if (i > 0 && i % hoodOrder.length === 0) hoodOrder = shuffled(FEATURED_AREAS[areaKey].neighborhoods, rng);
        anchor = featuredAnchor(areaKey, hoodOrder[i % hoodOrder.length], rng);
      } else if (city) {
        anchor = cityAnchor(city, rng);
      } else if (mode === 'global') {
        anchor = cityAnchor(rowToCity(places[weightedCityIndex(rng)]), rng);
      } else {
        const key = pick(FEATURED_AREA_KEYS, rng);
        anchor = featuredAnchor(key, pick(FEATURED_AREAS[key].neighborhoods, rng), rng);
      }
      return Object.assign({ id: 'cluster-' + (i + 1), size: size }, anchor);
    });

    const assignments = [];
    const planned = [];
    clusters.forEach(function (c, ci) {
      for (let m = 0; m < c.size; m += 1) {
        const place = { latitude: c.latitude, longitude: c.longitude, accuracyMeters: drawAccuracy(rng) };
        if (c.neighborhood !== undefined) place.neighborhood = c.neighborhood;
        place.city = c.city;
        if (c.regionCode !== undefined) place.regionCode = c.regionCode;
        place.countryCode = c.countryCode;
        planned.push(place);
        assignments.push(ci);
      }
    });

    const warnings = [];
    if (count < k) {
      warnings.push('count ' + count + ' is below k=' + k + ': no hotspot cell can reach k, so the map will '
        + 'suppress these profiles. Generate at least ' + k + ' to see a hotspot.');
    }
    return { k: k, clusterSize: clusterSize, clusters: clusters, assignments: assignments, places: planned,
      warnings: warnings };
  }

  /** The three featured neighborhoods closest to the area centre (seed clusters for a 10 km map). */
  function seedNeighborhoods(areaKey, count) {
    const area = FEATURED_AREAS[areaKey];
    if (!area) throw new Error('Unknown place preset "' + areaKey + '"');
    return area.neighborhoods.slice().sort(function (a, b) {
      return distanceKm(area.center.lat, area.center.lon, a.lat, a.lon)
        - distanceKm(area.center.lat, area.center.lon, b.lat, b.lon);
    }).slice(0, count || 3);
  }

  /** Name of the nearest featured neighborhood within maxKm (default 6), else ''. */
  function nearestNeighborhood(lat, lon, maxKm) {
    const limit = maxKm == null ? 6 : maxKm;
    let best = '';
    let bestKm = Infinity;
    FEATURED_AREA_KEYS.forEach(function (key) {
      FEATURED_AREAS[key].neighborhoods.forEach(function (n) {
        const d = distanceKm(lat, lon, n.lat, n.lon);
        if (d < bestKm) { bestKm = d; best = n.name; }
      });
    });
    return bestKm <= limit ? best : '';
  }

  function globalPlaceCount() { return places.length; }

  return {
    CATALOG_VERSION: data && data.version ? data.version : '',
    PLACE_MODES: PLACE_MODES,
    DEFAULT_K: DEFAULT_K,
    DEFAULT_CLUSTER_SIZE: DEFAULT_CLUSTER_SIZE,
    FEATURED_AREAS: FEATURED_AREAS,
    FEATURED_AREA_KEYS: FEATURED_AREA_KEYS,
    globalPlaceCount: globalPlaceCount,
    resolveArea: resolveArea,
    samplePlace: samplePlace,
    planClusteredPlaces: planClusteredPlaces,
    seedNeighborhoods: seedNeighborhoods,
    nearestNeighborhood: nearestNeighborhood,
    distanceKm: distanceKm,
  };
});
