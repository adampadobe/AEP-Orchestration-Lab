export const GEO_MIN_K_ANONYMITY = 10;
export const MAX_GEO_HOTSPOTS = 50;

// AEP Query Service runs Spark SQL, where a backslash escapes a quote character, so
// quote-doubling alone cannot guarantee a string literal stays inside its quotes. Every
// interest value is therefore held to this strict allowlist — letters, numbers, spaces and
// a few punctuation marks — before it reaches the query builder. It deliberately excludes
// quotes, backslashes and the LIKE wildcards % and _.
export const GEO_INTEREST_PATTERN = /^[\p{L}\p{N} &,.\-]{1,64}$/u;
export const GEO_INTEREST_RULE =
  'Use 1-64 characters of letters, numbers, spaces or & , . - only.';

// The first three neighborhoods per city are the seed clusters: all sit within ~6 km of the
// geocoded city centre so a 10 km hotspot query sees every seeded profile.
export const GEO_CITY_PRESETS = Object.freeze({
  riyadh: Object.freeze([
    Object.freeze({ name: 'Olaya', lat: 24.6908, lon: 46.6853 }),
    Object.freeze({ name: 'Al Sulimaniyah', lat: 24.7055, lon: 46.6983 }),
    Object.freeze({ name: 'Al Malaz', lat: 24.6667, lon: 46.735 }),
    Object.freeze({ name: 'Al Malqa', lat: 24.814, lon: 46.619 }),
    Object.freeze({ name: 'Hittin', lat: 24.7701, lon: 46.575 }),
    Object.freeze({ name: 'Al Yasmin', lat: 24.846, lon: 46.625 }),
    Object.freeze({ name: 'Al Nakheel', lat: 24.742, lon: 46.630 }),
    Object.freeze({ name: 'Diriyah', lat: 24.734, lon: 46.575 }),
  ]),
  dubai: Object.freeze([
    Object.freeze({ name: 'Downtown', lat: 25.1972, lon: 55.2744 }),
    Object.freeze({ name: 'Business Bay', lat: 25.186, lon: 55.265 }),
    Object.freeze({ name: 'DIFC', lat: 25.211, lon: 55.282 }),
    Object.freeze({ name: 'Dubai Marina', lat: 25.0805, lon: 55.1403 }),
    Object.freeze({ name: 'Deira', lat: 25.2697, lon: 55.3095 }),
    Object.freeze({ name: 'JLT', lat: 25.0657, lon: 55.1413 }),
    Object.freeze({ name: 'Al Barsha', lat: 25.1124, lon: 55.198 }),
  ]),
});

const GEO_CITY_PLACE = Object.freeze({
  riyadh: Object.freeze({ city: 'Riyadh', regionCode: 'SA-01', countryCode: 'SA' }),
  dubai: Object.freeze({ city: 'Dubai', regionCode: 'AE-DU', countryCode: 'AE' }),
});

export const GEO_SEED_ACCURACY_METERS = 50;

const GEO_CITY_ALIASES = Object.freeze({
  riyadh: 'riyadh',
  'riyadh,sa': 'riyadh',
  'riyadh, sa': 'riyadh',
  dubai: 'dubai',
  'dubai,ae': 'dubai',
  'dubai, ae': 'dubai',
});

function roundedCoordinate(value) {
  const rounded = Number(Number(value).toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function distanceKm(a, b) {
  const radians = (degree) => (degree * Math.PI) / 180;
  const latDiff = radians(b.lat - a.lat);
  const lonDiff = radians(b.lon - a.lon);
  const haversine = Math.sin(latDiff / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(lonDiff / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(haversine));
}

export function resolveGeoCityPreset(city) {
  const key = String(city || '').trim().toLowerCase();
  const normalized = GEO_CITY_ALIASES[key]
    || Object.keys(GEO_CITY_PRESETS).find((name) => key.startsWith(`${name},`));
  return normalized ? { id: normalized, neighborhoods: GEO_CITY_PRESETS[normalized] } : null;
}

export function nearestSeededNeighborhood({ lat, lon, city }) {
  const matchingCity = city ? resolveGeoCityPreset(city) : null;
  const neighborhoods = matchingCity
    ? matchingCity.neighborhoods
    : Object.values(GEO_CITY_PRESETS).flat();
  let nearest = null;
  let nearestDistance = Infinity;
  for (const neighborhood of neighborhoods) {
    const distance = distanceKm({ lat, lon }, neighborhood);
    if (distance < nearestDistance) {
      nearest = neighborhood;
      nearestDistance = distance;
    }
  }
  return nearestDistance <= 6 ? nearest.name : '';
}

export const GEO_MIRROR_SOURCE = 'aep-lab-geo-mirror';

export const GEO_MIRROR_PLACE_HINT =
  'Hotspot locations are each matching profile\'s last-known place (profilePlaceContext), not where the '
  + 'product view happened. Cells with fewer than 10 profiles are suppressed.';

export const GEO_EMPTY_HINT =
  'No matching profiles are available yet. The interest must exactly match a viewed product name or category '
  + '(case-insensitive), e.g. "camping gear". Run lab_seed_geo_demo to create governed sample profiles and '
  + 'product-view events.';

function defaultHotspotHint(totalProfiles, source) {
  if (totalProfiles === 0) return GEO_EMPTY_HINT;
  return source === GEO_MIRROR_SOURCE ? GEO_MIRROR_PLACE_HINT : '';
}

export function shapeGeoHotspotsResponse({
  center,
  radius_km,
  window_hours,
  interest,
  total_profiles,
  suppressed_profiles,
  sandbox,
  generated_at = new Date().toISOString(),
  rows = [],
  hint,
  source = 'aep-query-service',
}) {
  const safeSource = String(source || 'aep-query-service');
  const safeRows = Array.isArray(rows) ? rows : [];
  const firstRow = safeRows[0] || {};
  const totalProfiles = Math.max(0, Number(total_profiles ?? firstRow.total_profiles) || 0);
  let suppressedProfiles = Math.max(
    0,
    Number(suppressed_profiles ?? firstRow.suppressed_profiles) || 0,
  );

  const eligible = [];
  for (const row of safeRows) {
    if (!row || row.cell_lat == null || row.cell_lon == null) continue;
    const profiles = Math.max(0, Number(row.profiles) || 0);
    if (profiles < GEO_MIN_K_ANONYMITY) {
      suppressedProfiles += profiles;
      continue;
    }
    const lat = Number(row.cell_lat);
    const lon = Number(row.cell_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    eligible.push({ lat, lon, profiles });
  }

  const hotspots = eligible
    .sort((a, b) => b.profiles - a.profiles || a.lat - b.lat || a.lon - b.lon)
    .slice(0, MAX_GEO_HOTSPOTS)
    .map(({ lat, lon, profiles }) => ({
      lat: roundedCoordinate(lat),
      lon: roundedCoordinate(lon),
      profiles,
      share: totalProfiles > 0 ? Number((profiles / totalProfiles).toFixed(3)) : 0,
      label: nearestSeededNeighborhood({ lat, lon }),
    }));

  const result = {
    ok: true,
    kind: 'audience_geo_hotspots',
    center: {
      lat: roundedCoordinate(center.lat),
      lon: roundedCoordinate(center.lon),
      label: String(center.label || ''),
    },
    radius_km,
    window_hours,
    interest,
    total_profiles: totalProfiles,
    suppressed_profiles: suppressedProfiles,
    k_threshold: GEO_MIN_K_ANONYMITY,
    hotspots,
    source: safeSource,
    data_status: 'available',
    sandbox,
    generated_at,
    hint: hint || defaultHotspotHint(totalProfiles, safeSource),
  };
  return result;
}

export const GEO_DATA_UNAVAILABLE_HINT =
  'Geo audience data is not available yet: the lab\'s AEP event schema has no location fields and the '
  + 'hotspot data path is being rebuilt on profile place context. No profiles were evaluated — this is not a '
  + 'zero count.';

/** True only when the lab API explicitly reports the known-unavailable data path. */
export function isGeoDataUnavailable(apiData) {
  return Boolean(apiData && typeof apiData === 'object' && apiData.data_status === 'unavailable');
}

export function shapeGeoHotspotsUnavailableResponse({
  center,
  radius_km,
  window_hours,
  interest,
  sandbox,
  generated_at = new Date().toISOString(),
}) {
  return {
    ok: true,
    kind: 'audience_geo_hotspots',
    center: {
      lat: roundedCoordinate(center.lat),
      lon: roundedCoordinate(center.lon),
      label: String(center.label || ''),
    },
    radius_km,
    window_hours,
    interest,
    total_profiles: 0,
    suppressed_profiles: 0,
    k_threshold: GEO_MIN_K_ANONYMITY,
    hotspots: [],
    source: 'none',
    data_status: 'unavailable',
    sandbox,
    generated_at,
    hint: GEO_DATA_UNAVAILABLE_HINT,
  };
}

export function geoJsonResult(payload) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

export function buildGeoSeedPlan({ city, count, interest = 'camping gear', now = Date.now, random = Math.random }) {
  const preset = resolveGeoCityPreset(city);
  if (!preset) throw new Error('Geo demo seeding supports Riyadh and Dubai only.');
  if (!Number.isInteger(count) || count < 1 || count > 30) {
    throw new Error('count must be an integer between 1 and 30.');
  }
  const interestText = String(interest || '').trim();
  if (!interestText || interestText.length > 120) {
    throw new Error('interest must be a non-empty string of at most 120 characters.');
  }

  const nowMs = typeof now === 'function' ? now() : Number(now);
  const seedNeighborhoods = preset.neighborhoods.slice(0, 3);
  // No coordinate jitter: every profile in a cluster shares one point, so each cluster lands in
  // exactly one hotspot cell and a 30-profile batch is three cells of ten (k=10 demonstrable).
  return Array.from({ length: count }, (_, index) => {
    const neighborhood = seedNeighborhoods[Math.floor(index / 10) % seedNeighborhoods.length];
    const timestamp = new Date(nowMs - random() * 3 * 60 * 60 * 1000).toISOString();
    return {
      city_id: preset.id,
      neighborhood: neighborhood.name,
      lat: neighborhood.lat,
      lon: neighborhood.lon,
      timestamp,
      interest: interestText,
    };
  });
}

/**
 * Governed profilePlaceContext leaves (tenant-relative dotted attributes) for one seed entry.
 * @param {{ city_id: string, neighborhood: string, lat: number, lon: number, timestamp: string }} seed
 */
export function geoSeedPlaceAttributes(seed) {
  const place = GEO_CITY_PLACE[seed?.city_id];
  if (!place) throw new Error(`Unknown geo seed city "${seed?.city_id}".`);
  const seenAt = new Date(Date.parse(seed.timestamp));
  if (!Number.isFinite(seenAt.getTime())) throw new Error('Geo seed timestamp is invalid.');
  seenAt.setUTCMilliseconds(0);
  return {
    'profilePlaceContext.latitude': seed.lat,
    'profilePlaceContext.longitude': seed.lon,
    'profilePlaceContext.accuracyMeters': GEO_SEED_ACCURACY_METERS,
    'profilePlaceContext.neighborhood': seed.neighborhood,
    'profilePlaceContext.city': place.city,
    'profilePlaceContext.regionCode': place.regionCode,
    'profilePlaceContext.countryCode': place.countryCode,
    'profilePlaceContext.lastSeenAt': seenAt.toISOString().replace('.000Z', 'Z'),
    'profilePlaceContext.source': 'mcp-seed',
  };
}

/** Stop a seed batch once this many attempts fail back to back. */
export const MAX_CONSECUTIVE_SEED_FAILURES = 5;

const ECID_HALF_MAX = 9223372036854775807n;

/**
 * Adobe ECIDs are two zero-padded 19-digit signed-64-bit halves. Edge Network
 * rejects anything else with "Invalid identity provided", so validate before
 * spending an event send.
 */
export function isCanonicalEcid(value) {
  const ecid = String(value ?? '').trim();
  if (!/^\d{38}$/.test(ecid)) return false;
  return BigInt(ecid.slice(0, 19)) <= ECID_HALF_MAX && BigInt(ecid.slice(19)) <= ECID_HALF_MAX;
}

/**
 * Seeds one profile + product-view event per plan entry. A single failure no
 * longer burns the whole batch: it is recorded and the run continues, aborting
 * only after MAX_CONSECUTIVE_SEED_FAILURES consecutive failures.
 */
export async function runGeoSeedBatch({ plan, deps }) {
  const { resolveEmail, generateProfile, sendEvent } = deps;
  const outcome = { generated: 0, sent: 0, failed: 0, aborted: false, errors: [], lastError: '' };
  let consecutiveFailures = 0;

  const recordFailure = (message) => {
    outcome.failed += 1;
    outcome.lastError = message;
    if (outcome.errors.length < 10) outcome.errors.push(message);
    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_CONSECUTIVE_SEED_FAILURES) outcome.aborted = true;
  };

  for (const [index, seed] of plan.entries()) {
    if (outcome.aborted) break;
    try {
      const emailPlan = await resolveEmail({ index, seed });
      if (!emailPlan?.ok) {
        recordFailure(emailPlan?.error || 'Generation preferences are not configured.');
        continue;
      }

      const profileResult = await generateProfile({ index, seed, email: emailPlan.email, emailPlan });
      if (!profileResult?.ok) {
        recordFailure(profileResult?.error || 'AEP test profile generation failed.');
        continue;
      }
      outcome.generated += 1;

      const ecid = String(profileResult.ecid ?? '').trim();
      if (!isCanonicalEcid(ecid)) {
        recordFailure(
          'AEP profile generation returned a non-canonical ECID; the geo event was not sent because '
          + 'Edge Network rejects it as an invalid identity.',
        );
        continue;
      }

      const eventResult = await sendEvent({ index, seed, email: emailPlan.email, ecid });
      if (!eventResult?.ok) {
        recordFailure(eventResult?.error || 'AEP product-view event send failed.');
        continue;
      }
      outcome.sent += 1;
      consecutiveFailures = 0;
    } catch (error) {
      recordFailure(String(error?.message || error));
    }
  }

  return outcome;
}

/**
 * Turns an opaque lab-API failure into an actionable operator hint. A 404 means
 * the Hosting rewrite is not live, not that the audience is empty.
 */
export function geoHotspotsFailureHint(apiResult) {
  if (Number(apiResult?.status) === 404) {
    return 'The lab API route /api/geo-hotspots returned 404. The Cloud Function exists but the Firebase '
      + 'hosting rewrite is not deployed — run a hosting deploy for project aep-orchestration-lab.';
  }
  return '';
}
