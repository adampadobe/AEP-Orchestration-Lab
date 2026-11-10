const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const campaignId = 'd360b9ce-7303-465d-93eb-d31c3f19a6c4';
const campaignName = 'AEP-LAB-Decisioning-Hero-Banner';

function lookups() {
  delete require.cache[require.resolve('../joLookups')];
  return require('../joLookups');
}

test('kirkham resolves the exact campaign through the accelerated store and caches only names', async t => {
  const fetch = t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://platform.adobe.io/data/foundation/query/accelerated-queries');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    assert.equal(options.headers['x-api-key'], 'fixture-client');
    assert.equal(options.headers['x-gw-ims-org-id'], 'fixture-org');
    assert.equal(options.headers['x-sandbox-name'], 'kirkham');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.dbName, 'kirkham:qsaccel');
    assert.equal(body.sql, `SELECT DISTINCT campaign_id, campaign_name FROM qsaccel.ajo_lookup.ajo_campaign_names WHERE campaign_id = '${campaignId}' ORDER BY campaign_name`);
    return { ok: true, json: async () => ({ results: [{ campaign_id: campaignId, campaign_name: campaignName }] }) };
  });
  const { getCampaignNameById } = lookups();
  const get = org => getCampaignNameById(campaignId, 'kirkham', 'fixture-token', 'fixture-client', org);
  assert.equal(await get('fixture-org'), campaignName);
  assert.equal(await get('fixture-org'), campaignName);
  assert.equal(fetch.mock.callCount(), 1);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  now += 5 * 60 * 1000 + 1;
  assert.equal(await get('fixture-org'), campaignName);
  assert.equal(fetch.mock.callCount(), 2);
});

test('campaign cache does not cross org or API client boundaries', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => ({
    ok: true, json: async () => ({ results: [{ campaign_id: campaignId, campaign_name: campaignName }] }),
  }));
  const { getCampaignNameById } = lookups();
  for (const [client, org] of [['client-a', 'org-a'], ['client-b', 'org-a'], ['client-a', 'org-b']]) {
    assert.equal(await getCampaignNameById(campaignId, 'kirkham', 'token', client, org), campaignName);
  }
  assert.equal(fetch.mock.callCount(), 3);
});

test('other sandboxes retain the existing campaign API and never query kirkham data', async t => {
  const fetch = t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, 'https://journey.adobe.io/campaign/campaigns/' + campaignId);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['x-sandbox-name'], 'apalmer');
    return { ok: true, json: async () => ({ name: 'Other sandbox campaign' }) };
  });
  assert.equal(await lookups().getCampaignNameById(campaignId, 'apalmer', 'token', 'client', 'org'), 'Other sandbox campaign');
  assert.equal(fetch.mock.callCount(), 1);
});

test('invalid campaign IDs cannot enter SQL', async t => {
  const fetch = t.mock.method(global, 'fetch', async () => { throw new Error('Unexpected request'); });
  await assert.rejects(lookups().getCampaignNameById("' OR 1=1 --", 'kirkham', 'token', 'client', 'org'),
    error => error.status === 400 && /UUID/.test(error.message));
  assert.equal(fetch.mock.callCount(), 0);
});

test('missing campaigns and failed queries are not cached', async t => {
  let response = { ok: true, json: async () => ({ results: [] }) };
  const fetch = t.mock.method(global, 'fetch', async () => response);
  const { getCampaignNameById } = lookups();
  const get = () => getCampaignNameById(campaignId, 'kirkham', 'token', 'client', 'org');
  assert.equal(await get(), null);
  response = { ok: false, status: 403 };
  await assert.rejects(get(), /HTTP 403/);
  response = { ok: true, json: async () => ({ results: [{ campaign_id: campaignId, campaign_name: campaignName }] }) };
  assert.equal(await get(), campaignName);
  assert.equal(fetch.mock.callCount(), 3);
});

test('invalid, mismatched and conflicting results fail explicitly', async t => {
  let data;
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => data }));
  const { getCampaignNameById } = lookups();
  for (const result of [{}, { results: [{}] }, { results: [{ campaign_id: 'other', campaign_name: campaignName }] },
    { results: [{ campaign_id: campaignId, campaign_name: ' ' }] },
    { results: [{ campaign_id: campaignId, campaign_name: 'One' }, { campaign_id: campaignId, campaign_name: 'Two' }] }]) {
    data = result;
    await assert.rejects(getCampaignNameById(campaignId, 'kirkham', 'token', 'client', 'org'), /invalid results|conflicting names/);
  }
});

test('hosted campaign endpoint preserves its contract and surfaces validation and upstream failures', async () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const start = source.indexOf('exports.campaignNameProxy =');
  const end = source.indexOf('/** GET /api/journey-name', start);
  assert.ok(start >= 0 && end > start);
  const warnings = [];
  const context = {
    exports: {}, onRequest: (_options, handler) => handler, profileFnOpts: {}, setCors() {},
    resolveSandboxFromQuery: req => req.query.sandbox,
    getAdobeAccessToken: async () => 'fixture-token',
    ADOBE_CLIENT_ID: { value: () => 'fixture-client' },
    ADOBE_IMS_ORG: { value: () => 'fixture-org' },
    console: { warn: (...args) => warnings.push(args) },
    joLookups: { getCampaignNameById: async (...args) => {
      assert.deepEqual(args, [campaignId, 'kirkham', 'fixture-token', 'fixture-client', 'fixture-org']);
      return campaignName;
    } },
  };
  vm.runInNewContext(source.slice(start, end), context);
  const request = { method: 'GET', query: { id: campaignId, sandbox: 'kirkham' } };
  const response = {
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await context.exports.campaignNameProxy(request, response);
  assert.equal(response.code, 200);
  assert.equal(response.body.id, campaignId);
  assert.equal(response.body.name, campaignName);
  for (const [status, message] of [[400, 'Campaign id must be a UUID.'], [500, 'Campaign name query failed (HTTP 403).']]) {
    context.joLookups.getCampaignNameById = async () => { const error = new Error(message); error.status = status; throw error; };
    await context.exports.campaignNameProxy(request, response);
    assert.equal(response.code, status);
    assert.equal(response.body.name, null);
    assert.equal(response.body.error, message);
  }
  assert.equal(warnings.length, 2);
});
