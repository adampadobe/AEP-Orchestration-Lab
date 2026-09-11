'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ASSURANCE_URL,
  STATUS_URL,
  createMeasurementQualityService,
} = require('../measurementQualityService');

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

test('Assurance reads use narrow scopes and omit raw event payload values', async () => {
  const calls = [];
  const scopes = [];
  const service = createMeasurementQualityService({
    getAccessToken: async (value) => { scopes.push(value); return 'secret-token'; },
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
    tagsService: {},
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      const body = JSON.parse(init.body);
      if (body.query.includes('AssuranceSessions')) return response({ data: { sessions: [{ uuid: 's-1', name: 'Demo' }] } });
      return response({ data: { events: [{ uuid: 'e-1', clientId: 'mobile', timestamp: 123, vendor: 'com.adobe', type: 'edge', payload: { email: 'private@example.com', xdm: {} } }] } });
    },
  });

  const sessions = await service.listAssuranceSessions({ limit: 100 });
  const events = await service.inspectAssuranceEvents({ session_uuid: 's-1', limit: 100 });
  assert.equal(sessions.limit, 50);
  assert.deepEqual(events.events[0].payload_keys, ['email', 'xdm']);
  assert.equal(JSON.stringify(events).includes('private@example.com'), false);
  assert.equal(calls[0].url, ASSURANCE_URL);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
  assert.ok(scopes[0].includes('assurance_manage_sessions'));
  assert.ok(scopes[0].includes('assurance_read_events'));
  assert.equal(scopes[0].includes('assurance_read_annotations'), false);
});

test('Launch audits reuse read-only Reactor helpers and return bounded safe summaries', async () => {
  const service = createMeasurementQualityService({
    getAccessToken: async () => 'token',
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
    tagsService: {
      listAllPropertiesAcrossCompanies: async () => ({ ok: true, rows: [{ propertyId: 'PR1', propertyName: 'Web', domains: ['example.com'] }] }),
      listExtensions: async () => ({ ok: true, items: [{ extensionId: 'EX1', name: 'Web SDK', enabled: true, updatedAt: 'now', settings: 'omit' }] }),
      listRules: async () => ({ ok: true, items: [{ ruleId: 'RL1', name: 'Page view', enabled: true, updatedAt: 'now', settings: 'omit' }] }),
      listEnvironments: async () => ({ ok: true, items: [{ environmentId: 'EN1', name: 'Production', stage: 'production' }] }),
    },
    fetchImpl: async () => { throw new Error('unexpected fetch'); },
  });
  const audit = await service.auditLaunchProperties({ property_id: 'PR1' });
  assert.equal(audit.audits[0].extensions[0].settings, undefined);
  assert.equal(audit.audits[0].rules[0].settings, undefined);
  const environments = await service.listLaunchEnvironments({ property_id: 'PR1' });
  assert.equal(environments.environments[0].stage, 'production');
});

test('Adobe Status correlation fixes the host, bounds dates, and filters locally', async () => {
  let calledUrl;
  const service = createMeasurementQualityService({
    getAccessToken: async () => 'token',
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
    tagsService: {},
    fetchImpl: async (url) => {
      calledUrl = new URL(url);
      return response({ events: [
        { id: '1', title: 'Experience Platform incident', status: 'resolved' },
        { id: '2', title: 'Unrelated product', status: 'resolved' },
      ] });
    },
  });
  const result = await service.correlateStatusIncidents({
    from: '2026-09-01', to: '2026-09-11', product_ids: ['123'], keywords: ['platform'],
  });
  assert.equal(calledUrl.origin + calledUrl.pathname, STATUS_URL);
  assert.equal(calledUrl.searchParams.get('productIds'), '123');
  assert.equal(result.incidents.length, 1);
  await assert.rejects(
    () => service.correlateStatusIncidents({ from: '2026-01-01', to: '2026-09-11' }),
    /31 days/,
  );
});

test('upstream errors never expose response bodies or tokens', async () => {
  const service = createMeasurementQualityService({
    getAccessToken: async () => 'secret-token',
    getClientId: () => 'client-id',
    getImsOrg: () => 'org-id',
    tagsService: {},
    fetchImpl: async () => response({ error: 'private upstream body secret-token' }, 403),
  });
  await assert.rejects(async () => {
    try { await service.listAssuranceSessions(); } catch (error) {
      assert.equal(String(error).includes('private upstream body'), false);
      assert.equal(String(error).includes('secret-token'), false);
      throw error;
    }
  }, /HTTP 403/);
});
