'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildGeoHotspotsQuery, createGeoHotspotsService } = require('../geoHotspotsService');

const baseInput = {
  sandbox: 'apalmer',
  center: { lat: 24.7136, lon: 46.6753 },
  radiusKm: 10,
  windowHours: 24,
  interest: "camping%_\\' OR 1=1 --",
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
  assert.match(sql, /"Retail ""Events"""/);
  assert.doesNotMatch(sql, /camping|OR 1=1/);
  assert.equal(queryParameters.interestPattern, "%camping\\%\\_\\\\' OR 1=1 --%");
  assert.equal(queryParameters.windowStart, '2026-09-26T12:00:00.000Z');
  assert.equal(queryParameters.windowEnd, '2026-09-27T12:00:00.000Z');
  assert.match(sql, /COUNT\(DISTINCT profile_id\) AS profiles/);
});

test('geo hotspot query binds only string parameters and inlines validated numeric literals', () => {
  const { sql, queryParameters } = buildGeoHotspotsQuery({
    ...baseInput,
    datasetName: 'retail_events',
    now: () => Date.parse('2026-09-27T12:00:00.000Z'),
  });

  // AEP Query Service rejects non-string queryParameters values with
  // "Invalid element found with key: centerLon ... class java.lang.Double".
  for (const [key, value] of Object.entries(queryParameters)) {
    assert.equal(typeof value, 'string', `queryParameters.${key} must be a string`);
  }
  assert.deepEqual(
    Object.keys(queryParameters).sort(),
    ['interestPattern', 'windowEnd', 'windowStart'],
  );

  // Numerics are strictly validated and inlined, so no numeric placeholders remain.
  for (const placeholder of ['$centerLat', '$centerLon', '$radiusKm', '$cellLatStep', '$cellLonStep', '$kThreshold']) {
    assert.ok(!sql.includes(placeholder), `${placeholder} must not remain in SQL`);
  }
  assert.ok(sql.includes('24.7136'), 'center latitude is inlined');
  assert.ok(sql.includes('46.6753'), 'center longitude is inlined');
  assert.match(sql, /profiles >= 10/);
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
  assert.equal(JSON.parse(calls[0].init.body).queryParameters.interestPattern, '%camping\\%\\_\\\\\' OR 1=1 --%');
  assert.match(calls[2].url, /limit=100/);
});
