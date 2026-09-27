'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildGeoHotspotsQuery, createGeoHotspotsService, stringLiteral } = require('../geoHotspotsService');

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
