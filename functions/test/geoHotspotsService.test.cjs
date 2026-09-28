'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  GEO_DATA_UNAVAILABLE_REASON,
  GEO_MIRROR_SOURCE,
  MAX_MIRROR_SIGNALS,
  aggregateMirrorHotspots,
  buildGeoHotspotsHttpBody,
  buildGeoHotspotsQuery,
  createGeoHotspotsService,
  resolveGeoHotspotsDataPath,
  stringLiteral,
} = require('../geoHotspotsService');

const baseInput = {
  sandbox: 'apalmer',
  center: { lat: 24.7136, lon: 46.6753 },
  radiusKm: 10,
  windowHours: 24,
  interest: 'camping gear',
  cellKm: 1,
};

test('geo hotspot query uses configured table and escaped, bound parameters', () => {
  const { sql, queryParameters } = buildGeoHotspotsQuery({
    ...baseInput,
    datasetName: 'Retail "Events"',
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
  });

  assert.match(sql, /COUNT\s*\(\s*DISTINCT profile_id/i);
  assert.match(sql, /placeContext\.geo\._schema\.latitude/);
  assert.match(sql, /placeContext\.geo\._schema\.longitude/);
  assert.match(sql, /eventType = 'commerce\.productViews'/);
  assert.match(sql, /_demoemea\.public\.retail\.productName/);
  assert.match(sql, /_demoemea\.public\.retail\.productCategory/);
  assert.match(sql, /ROUND\(grid_lat, 4\) AS cell_lat/);
  assert.doesNotMatch(sql, /AVG\(latitude\)|AVG\(longitude\)/);
  assert.match(sql, /FROM retail_events/);
  assert.match(sql, /COUNT\(DISTINCT profile_id\) AS profiles/);
});

test('geo hotspot query inlines quoted literals and sends no substitution parameters', () => {
  const { sql, queryParameters } = buildGeoHotspotsQuery({
    ...baseInput,
    datasetName: 'retail_events',
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
  });

  // AEP Query Service substitutes `$name` parameters as RAW TEXT, so an ISO timestamp
  // arrived unquoted and failed with "no viable alternative at input". Everything is
  // therefore quoted and inlined here instead of relying on server-side substitution.
  assert.deepEqual(queryParameters, {});
  for (const placeholder of ['$windowStart', '$windowEnd', '$interestPattern', '$centerLat', '$centerLon', '$radiusKm', '$cellLatStep', '$cellLonStep', '$kThreshold']) {
    assert.ok(!sql.includes(placeholder), `${placeholder} must not remain in SQL`);
  }
  assert.ok(sql.includes("TIMESTAMP '2026-09-26 12:00:00'"), 'window start is a quoted timestamp literal');
  assert.ok(sql.includes("TIMESTAMP '2026-09-27 12:00:00'"), 'window end is a quoted timestamp literal');
  assert.ok(sql.includes('24.7136'), 'center latitude is inlined');
  assert.ok(sql.includes('46.6753'), 'center longitude is inlined');
  assert.match(sql, /profiles >= 10/);
});

test('geo hotspot query rejects interest values outside the strict allowlist', () => {
  // Query Service runs Spark SQL, where a backslash escapes a quote character. Doubling
  // the quote alone is therefore not a safe guarantee, so `interest` must first pass a
  // strict allowlist that excludes backslashes, quotes, %, _ and control characters.
  const payloads = [
    "\\' OR 1=1 --",
    "camping' OR 1=1 --",
    'camping\\gear',
    'camping%gear',
    'camping_gear',
    'camping\u0000gear',
    'a'.repeat(65),
    '',
  ];
  for (const interest of payloads) {
    assert.throws(
      () => buildGeoHotspotsQuery({ ...baseInput, interest, datasetName: 'retail_events' }),
      /interest/i,
      `interest payload ${JSON.stringify(interest)} must be rejected`,
    );
  }
});

test('geo hotspot query accepts ordinary interest text and inlines it as one literal', () => {
  for (const interest of ['camping gear', 'Café & Co.', 'Ropa de montaña', 'tents, poles - 2 person']) {
    const { sql } = buildGeoHotspotsQuery({
      ...baseInput,
      interest,
      datasetName: 'retail_events',
      now: () => Date.parse('2026-09-27T12:00:00.000Z'),
    });
    assert.ok(sql.includes(`LIKE LOWER('%${interest}%')`), `${interest} is inlined verbatim`);
    assert.equal((sql.match(/'/g) || []).length % 2, 0, 'SQL single quotes stay balanced');
    assert.ok(!sql.includes('\\'), 'no backslash reaches the SQL text');
  }
});

test('stringLiteral refuses backslashes as a second layer of defence', () => {
  assert.throws(() => stringLiteral('camping\\gear', 'interest'), /interest/i);
  assert.throws(() => stringLiteral("camping'gear", 'interest'), /interest/i);
});

test('geo hotspot query refuses non-finite numeric inputs instead of inlining them', () => {
  assert.throws(
    () => buildGeoHotspotsQuery({
      ...baseInput,
      center: { lat: Number.NaN, lon: 46.6753 },
      datasetName: 'retail_events',
    }),
    /numeric/i,
  );
  assert.throws(
    () => buildGeoHotspotsQuery({
      ...baseInput,
      radiusKm: '10 OR 1=1',
      datasetName: 'retail_events',
    }),
    /numeric/i,
  );
});

test('geo hotspot service resolves the configured dataset and fetches only aggregate rows', async () => {
  const calls = [];
  const service = createGeoHotspotsService({
    getAccessToken: async () => 'test-token',
    getClientId: () => 'test-client-id',
    getImsOrg: () => 'test-org',
    getEventConfig: async (sandbox) => {
      assert.equal(sandbox, 'apalmer');
      return { datasetName: 'Retail Events' };
    },
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/queries')) {
        return new Response(JSON.stringify({ id: 'query-123', state: 'RUNNING' }), { status: 200 });
      }
      if (String(url).endsWith('/queries/query-123')) {
        return new Response(JSON.stringify({
          id: 'query-123',
          state: 'SUCCESS',
          lastRunDetails: { id: 'run-456', state: 'SUCCESS' },
        }), { status: 200 });
      }
      if (String(url).includes('/runs/run-456/rows')) {
        return new Response(JSON.stringify({
          rows: [{ total_profiles: 12, suppressed_profiles: 2, cell_lat: 24.7743, cell_lon: 46.6384, profiles: 12 }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected Query Service URL: ${url}`);
    },
    sleep: async () => {},
    maxWaitMs: 1000,
    pollIntervalMs: 1,
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
    dataPath: 'query-service',
  });

  const result = await service.run(baseInput);

  assert.equal(calls.length, 3);
  assert.deepEqual(result.rows, [
    { total_profiles: 12, suppressed_profiles: 2, cell_lat: 24.7743, cell_lon: 46.6384, profiles: 12 },
  ]);
  assert.equal(calls[0].init.headers['x-sandbox-name'], 'apalmer');
  assert.match(JSON.parse(calls[0].init.body).sql, /identityMap\['ECID'\]\[0\]\.id/);
  assert.equal(JSON.parse(calls[0].init.body).queryParameters, undefined, 'no raw-substitution parameters are sent');
  assert.match(JSON.parse(calls[0].init.body).sql, /LIKE LOWER\('%camping/);
  assert.match(calls[2].url, /limit=100/);
});

test('normalizeDatasetTableName converts a dataset display name to its Query Service table name', () => {
  const { normalizeDatasetTableName } = require('../geoHotspotsService.js');
  // Query Service exposes datasets as lowercase snake_case tables, not by display name.
  assert.equal(normalizeDatasetTableName('AEP Event Tool - Dataset - v1'), 'aep_event_tool_dataset_v1');
  assert.equal(normalizeDatasetTableName('  Retail__Events  '), 'retail_events');
  assert.equal(normalizeDatasetTableName('already_snake_case'), 'already_snake_case');
});

test('buildGeoHotspotsQuery normalizes a display-name dataset before it reaches SQL', () => {
  const { sql } = buildGeoHotspotsQuery({ ...baseInput, datasetName: 'AEP Event Tool - Dataset - v1' });
  assert.match(sql, /FROM aep_event_tool_dataset_v1/);
  assert.doesNotMatch(sql, /AEP Event Tool/);
});

test('unavailable data path short-circuits without calling IMS, Catalog or Query Service', async () => {
  let tokenCalls = 0;
  let fetchCalls = 0;
  let configCalls = 0;
  const service = createGeoHotspotsService({
    getAccessToken: async () => { tokenCalls += 1; return 'test-token'; },
    getClientId: () => 'test-client-id',
    getImsOrg: () => 'test-org',
    getEventConfig: async () => { configCalls += 1; return { datasetName: 'Retail Events' }; },
    fetchImpl: async () => { fetchCalls += 1; throw new Error('must not be called'); },
    dataPath: 'unavailable',
  });

  const result = await service.run(baseInput);

  assert.deepEqual(result, {
    rows: [],
    dataStatus: 'unavailable',
    reason: GEO_DATA_UNAVAILABLE_REASON,
  });
  assert.equal(tokenCalls, 0);
  assert.equal(fetchCalls, 0);
  assert.equal(configCalls, 0);
});

test('geo hotspot data path defaults to the Firestore mirror and rejects unknown values explicitly', () => {
  assert.equal(resolveGeoHotspotsDataPath(undefined), 'firestore-mirror');
  assert.equal(resolveGeoHotspotsDataPath(''), 'firestore-mirror');
  assert.equal(resolveGeoHotspotsDataPath(' Query-Service '), 'query-service');
  assert.equal(resolveGeoHotspotsDataPath('unavailable'), 'unavailable');
  assert.throws(() => resolveGeoHotspotsDataPath('firestore'), /GEO_HOTSPOTS_DATA_PATH/);
  assert.throws(
    () => createGeoHotspotsService({
      getAccessToken: async () => 'x',
      getClientId: () => 'x',
      getImsOrg: () => 'x',
      getEventConfig: async () => ({}),
      dataPath: 'bogus',
    }),
    /GEO_HOTSPOTS_DATA_PATH/,
  );
});

test('query-service data path reports available rows', async () => {
  const service = createGeoHotspotsService({
    getAccessToken: async () => 'test-token',
    getClientId: () => 'test-client-id',
    getImsOrg: () => 'test-org',
    getEventConfig: async () => ({ datasetName: 'Retail Events' }),
    fetchImpl: async (url) => {
      if (String(url).endsWith('/queries')) return new Response(JSON.stringify({ id: 'q1', state: 'SUCCESS', lastRunDetails: { id: 'r1', state: 'SUCCESS' } }), { status: 200 });
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    },
    sleep: async () => {},
    maxWaitMs: 1000,
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
    dataPath: 'query-service',
  });
  const result = await service.run(baseInput);
  assert.deepEqual(result, { rows: [], dataStatus: 'available' });
});

test('HTTP body keeps the known-unavailable state honest and distinct from zero results', () => {
  assert.deepEqual(
    buildGeoHotspotsHttpBody({ rows: [], dataStatus: 'unavailable', reason: GEO_DATA_UNAVAILABLE_REASON }),
    { ok: true, rows: [], data_status: 'unavailable', reason: GEO_DATA_UNAVAILABLE_REASON },
  );
  assert.deepEqual(
    buildGeoHotspotsHttpBody({ rows: [{ profiles: 12 }], dataStatus: 'available' }),
    { ok: true, rows: [{ profiles: 12 }], data_status: 'available' },
  );
  assert.throws(() => buildGeoHotspotsHttpBody({ rows: [], dataStatus: 'maybe' }), /data status/i);
});

// ---- Firestore mirror path (Phase 4) ----

const RIYADH_CENTER = { lat: 24.6877, lon: 46.7219 };

function cluster(lat, lon, n, prefix) {
  return Array.from({ length: n }, (_, i) => ({ identityHash: `${prefix}${i}`, lat: lat + i * 0.00001, lon }));
}

test('mirror aggregation keeps only in-radius places, buckets them on the SQL grid and suppresses cells below k=10', () => {
  const places = [
    ...cluster(24.6908, 46.6853, 12, 'olaya'),
    ...cluster(24.7055, 46.6983, 10, 'sul'),
    ...cluster(24.6667, 46.735, 4, 'malaz'),
    ...cluster(24.814, 46.619, 15, 'far'),
  ];
  const rows = aggregateMirrorHotspots({ places, center: RIYADH_CENTER, radiusKm: 10, cellKm: 1 });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['cell_lat', 'cell_lon', 'profiles', 'suppressed_profiles', 'total_profiles']);
    assert.equal(row.total_profiles, 26);
    assert.equal(row.suppressed_profiles, 4);
  }
  assert.deepEqual(rows.map((r) => r.profiles), [12, 10]);
  const latStep = Math.round((1 / 111.045) * 1e6) / 1e6;
  const lonStep = Math.round((1 / (111.045 * Math.abs(Math.cos((RIYADH_CENTER.lat * Math.PI) / 180)))) * 1e6) / 1e6;
  assert.equal(rows[0].cell_lat, Math.round(Math.round(24.6908 / latStep) * latStep * 1e4) / 1e4);
  assert.equal(rows[0].cell_lon, Math.round(Math.round(46.6853 / lonStep) * lonStep * 1e4) / 1e4);
});

test('mirror aggregation labels each visible cell with its most common place name', () => {
  const named = (lat, lon, n, prefix, names) => cluster(lat, lon, n, prefix)
    .map((place, i) => ({ ...place, neighborhood: names[i % names.length] }));
  const places = [
    ...named(24.7113, 46.6744, 12, 'kc', ['Kingdom Centre', 'Kingdom Centre', 'Al Olaya']),
    ...named(24.6905, 46.6853, 11, 'fa', [null]),
    ...named(24.6440, 46.7110, 10, 'mu', ['Zulu', 'Alpha']),
  ];
  const rows = aggregateMirrorHotspots({ places, center: RIYADH_CENTER, radiusKm: 10, cellKm: 1 });
  assert.equal(rows.length, 3);
  const byProfiles = Object.fromEntries(rows.map((r) => [r.profiles, r]));
  assert.equal(byProfiles[12].label, 'Kingdom Centre');
  assert.equal('label' in byProfiles[11], false, 'no label when no member carries a place name');
  assert.equal(byProfiles[10].label, 'Alpha', 'ties resolve alphabetically');
});

test('mirror aggregation reports an honest summary row when no cell reaches k', () => {
  assert.deepEqual(
    aggregateMirrorHotspots({ places: cluster(24.6908, 46.6853, 3, 'x'), center: RIYADH_CENTER, radiusKm: 10, cellKm: 1 }),
    [{ total_profiles: 3, suppressed_profiles: 3, cell_lat: null, cell_lon: null, profiles: null }],
  );
  assert.deepEqual(
    aggregateMirrorHotspots({ places: [], center: RIYADH_CENTER, radiusKm: 10, cellKm: 1 }),
    [{ total_profiles: 0, suppressed_profiles: 0, cell_lat: null, cell_lon: null, profiles: null }],
  );
});

test('mirror aggregation caps output at fifty cells, largest first', () => {
  const places = [];
  for (let c = 0; c < 60; c += 1) places.push(...cluster(24.60 + c * 0.02, 46.70, 10 + (c % 3), `c${c}-`));
  const rows = aggregateMirrorHotspots({ places, center: { lat: 25.2, lon: 46.7 }, radiusKm: 50, cellKm: 0.5 });
  const inRadius = rows[0].total_profiles;
  assert.ok(inRadius > 0);
  assert.ok(rows.length <= 50);
  for (let i = 1; i < rows.length; i += 1) assert.ok(rows[i - 1].profiles >= rows[i].profiles);
});

test('firestore-mirror data path aggregates mirrored signals and places without calling Adobe', async () => {
  const calls = [];
  const mirror = {
    async listInterestIdentityHashes(input) {
      calls.push(['signals', input]);
      return { identityHashes: new Set(['h1', 'h2']), signals: 3, ecidOnlySignals: 1 };
    },
    async getProfilePlaces(input) {
      calls.push(['places', input]);
      return [...cluster(24.6908, 46.6853, 10, 'o')];
    },
  };
  const service = createGeoHotspotsService({
    getAccessToken: async () => { throw new Error('must not call IMS'); },
    getClientId: () => 'x',
    getImsOrg: () => 'x',
    getEventConfig: async () => { throw new Error('must not read event config'); },
    fetchImpl: async () => { throw new Error('must not call fetch'); },
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
    dataPath: 'firestore-mirror',
    mirror,
  });
  const result = await service.run(baseInput);
  assert.equal(result.dataStatus, 'available');
  assert.equal(result.source, GEO_MIRROR_SOURCE);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].profiles, 10);
  assert.deepEqual(result.stats, { signals: 3, identities: 2, ecid_only_signals: 1, places: 10 });
  const [, signalInput] = calls[0];
  assert.deepEqual(signalInput, {
    sandbox: 'apalmer',
    interest: 'camping gear',
    startMs: Date.parse('2026-09-26T12:00:00.000Z'),
    endMs: Date.parse('2026-09-27T12:00:00.000Z'),
    maxSignals: MAX_MIRROR_SIGNALS,
  });
  assert.deepEqual(calls[1][1], { sandbox: 'apalmer', identityHashes: ['h1', 'h2'] });
});

test('firestore-mirror data path requires a mirror dependency', () => {
  assert.throws(
    () => createGeoHotspotsService({
      getAccessToken: async () => 'x', getClientId: () => 'x', getImsOrg: () => 'x', getEventConfig: async () => ({}),
      dataPath: 'firestore-mirror',
    }),
    /mirror/i,
  );
});

test('firestore-mirror data path still enforces the strict interest allowlist', async () => {
  const service = createGeoHotspotsService({
    getAccessToken: async () => 'x', getClientId: () => 'x', getImsOrg: () => 'x', getEventConfig: async () => ({}),
    dataPath: 'firestore-mirror',
    mirror: {
      listInterestIdentityHashes: async () => { throw new Error('must not query'); },
      getProfilePlaces: async () => [],
    },
  });
  await assert.rejects(service.run({ ...baseInput, interest: "gear' OR 1=1" }), /interest value/);
});

test('HTTP body carries the mirror source and stats alongside the available rows', () => {
  assert.deepEqual(
    buildGeoHotspotsHttpBody({
      rows: [{ profiles: 12 }], dataStatus: 'available', source: GEO_MIRROR_SOURCE, stats: { signals: 1 },
    }),
    { ok: true, rows: [{ profiles: 12 }], data_status: 'available', source: GEO_MIRROR_SOURCE, stats: { signals: 1 } },
  );
});
