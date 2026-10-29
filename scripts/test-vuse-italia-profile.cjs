'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const profileApi = require('../web/profile-viewer/vuse-italia-profile.js');
const { create } = profileApi;

const email = 'giulia@example.com';
const ecid = '12345678901234567890123456789012345678';
const tenant = '_demoemea';
const base = () => ({ sandbox: 'apalmer', email, ecid, isNew: false, details: {} });
const receipt = { ok: true, accepted: true, consentMode: 'preserve', receipt: { stage: 'inlet-accepted', upsVerified: false, retrySafe: false } };

function schemaFor(leaves) {
  const schema = { type: 'object', properties: {} };
  for (const [path, type] of Object.entries(leaves)) {
    const parts = path.split('.');
    let node = schema;
    for (const [i, part] of parts.entries()) {
      node.properties ||= {};
      node.properties[part] ||= i === parts.length - 1 ? { type } : { type: 'object', properties: {} };
      node = node.properties[part];
    }
  }
  return schema;
}
function fixture({ rows, found = true, preferences = false, write, tableChange, schemaChange } = {}) {
  rows ||= [
    { path: 'person.name.firstName', value: 'Giulia', valueType: 'string' },
    { path: 'person.name.lastName', value: 'Rossi', valueType: 'string' },
    { path: 'person.birthDate', value: '1990-04-12', valueType: 'string' },
    { path: 'mobilePhone.number', value: '+390123456789', valueType: 'string' },
    { path: 'homeAddress.postalCode', value: '00100', valueType: 'string' },
    { path: 'consents.marketing.email.val', value: 'n', valueType: 'string' },
    { path: `${tenant}.consents.marketing.sms.val`, value: 'u', valueType: 'string' },
    { path: `${tenant}.optInOut._channels.email`, value: 'out', valueType: 'string' },
    { path: `${tenant}.loyaltyDetails.points`, value: '123', valueType: 'number' },
    { path: 'testProfile', value: 'false', valueType: 'boolean' }
  ];
  const leaves = {
    'person.name.firstName': 'string', 'person.name.lastName': 'string', 'person.birthDate': 'string',
    'personalEmail.address': 'string', 'mobilePhone.number': 'string', testProfile: 'boolean',
    'homeAddress.street1': 'string', 'homeAddress.city': 'string', 'homeAddress.postalCode': 'string', 'homeAddress.countryCode': 'string',
    [`${tenant}.identification.core.email`]: 'string', [`${tenant}.identification.core.ecid`]: 'string'
  };
  for (const row of rows) leaves[row.path] = row.valueType;
  if (preferences) {
    const manifest = require('../functions/profileCoreV2Manifest').getManifestForIndustry('generic');
    for (const [path, leaf] of Object.entries(manifest)) {
      if (path.startsWith('preferences.brands.')) leaves[`${tenant}.${path}`] = leaf.type;
    }
  }
  const schema = schemaFor(leaves);
  if (schemaChange) schemaChange(schema);
  const table = {
    found, rows: found ? rows.map((row) => ({ industry: 'generic', writable: true, ...row })) : [],
    profileEmail: found ? email : null, safeSnapshot: true, profileWriteConsentMode: 'preserve',
    industries: { generic: { writable: true, schemaId: 'https://ns.adobe.com/demoemea/schemas/generic', datasetId: 'ds', xdmKey: tenant, collectionUrl: 'https://mock.invalid/inlet', dataflowId: 'mock-flow' } }
  };
  if (tableChange) tableChange(table);
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (init.method === 'POST' && write) return write(url, init);
    const data = calls.length === 1 ? table : calls.length === 2 ? { schema } : receipt;
    return { ok: true, status: 200, json: async () => data };
  };
  const api = create({ labAuthFetch: fetcher });
  return { api, calls, table, schema, fetcher };
}
function sent(f) { return JSON.parse(f.calls.find((c) => c.init.method === 'POST').init.body); }
function updates(f) { return Object.fromEntries(sent(f).updates.map((u) => [u.path, u.value])); }
async function rejectsWithoutWrite(f, input, code) {
  await assert.rejects(f.api.submit(input), (e) => e.code === code && e.uncertain === false);
  assert.equal(f.calls.filter((c) => c.init.method === 'POST').length, 0);
}

test('full Generic snapshot preserves unrelated values, unknown/denied consents, postal strings, and applies explicit details', async () => {
  const f = fixture();
  const result = await f.api.submit({ ...base(), details: { firstName: 'Giulia Maria', phone: '', address: { city: 'Roma', postalCode: '' } } });
  const data = updates(f);
  assert.equal(data['person.name.firstName'], 'Giulia Maria');
  assert.equal(data['person.name.lastName'], 'Rossi');
  assert.equal(data['person.birthDate'], '1990-04-12');
  assert.equal(data['mobilePhone.number'], '+390123456789');
  assert.equal(data['homeAddress.postalCode'], '00100');
  assert.equal(data['homeAddress.city'], 'Roma');
  assert.equal(data['consents.marketing.email.val'], 'n');
  assert.equal(data[`${tenant}.consents.marketing.sms.val`], 'u');
  assert.equal(data[`${tenant}.optInOut._channels.email`], 'out');
  assert.equal(data[`${tenant}.loyaltyDetails.points`], 123);
  assert.equal(data.testProfile, true);
  assert.equal(data[`${tenant}.identification.core.ecid`], ecid);
  assert.equal(sent(f).consentMode, 'preserve');
  assert.equal(sent(f).streaming.schemaId, f.table.industries.generic.schemaId);
  assert.equal(sent(f).streaming.flowId, 'mock-flow');
  assert.equal(result.accepted, true);
  assert.equal(result.upsVerified, false);
  assert.equal(result.consentState, 'preserved');
  assert.deepEqual(result.identity, { email, firstName: 'Giulia Maria', lastName: 'Rossi' });
  assert.equal(f.calls.length, 3, 'no readback, retries or mutations besides one update');
  assert.match(f.calls[0].url, /safeSnapshot=1/);
});
test('empty objects and omitted preferences do not clear saved details or consent', async () => {
  const f = fixture();
  await f.api.submit({ ...base(), details: { address: {} } });
  assert.equal(updates(f)['person.name.firstName'], 'Giulia');
  assert.equal(updates(f)['consents.marketing.email.val'], 'n');
  assert.equal(Object.keys(updates(f)).some((p) => p.includes('preferences')), false);
});
test('new email requires explicit successful notfound and has no invented opt-ins', async () => {
  const f = fixture({ found: false });
  const result = await f.api.submit({ ...base(), isNew: true });
  assert.equal(result.isNew, true);
  assert.equal(result.consentState, 'unknown');
  assert.equal(Object.keys(updates(f)).some((p) => /consents|optInOut/.test(p)), false);
});
test('existing/new intent mismatches are rejected', async () => {
  await rejectsWithoutWrite(fixture(), { ...base(), isNew: true }, 'PROFILE_EXISTS');
  await rejectsWithoutWrite(fixture({ found: false }), base(), 'PROFILE_NOT_FOUND');
});
test('guest checkout omitted isNew resolves existing or new only after strict snapshot read', async () => {
  for (const found of [false, true]) {
    const f = fixture({ found });
    const input = base();
    delete input.isNew;
    const result = await f.api.submit(input);
    assert.equal(result.isNew, !found);
    assert.equal(result.accepted, true);
    assert.match(f.calls[0].url, /safeSnapshot=1/);
    if (found) assert.equal(updates(f)['consents.marketing.email.val'], 'n');
    else assert.equal(Object.keys(updates(f)).some((p) => /consents|optInOut/.test(p)), false);
  }
});
test('guest checkout cannot infer a new record from failed reads or invalid isNew', async () => {
  const f = fixture({ tableChange: (t) => { delete t.found; } });
  const input = base();
  delete input.isNew;
  await rejectsWithoutWrite(f, input, 'SNAPSHOT_INVALID');
  await rejectsWithoutWrite(fixture(), { ...base(), isNew: null }, 'INVALID_FORM');
});
test('lookup failures and old backend cannot authorize new records', async () => {
  const api = create({ labAuthFetch: async () => ({ ok: false, status: 500, json: async () => ({ error: 'failed' }) }) });
  await assert.rejects(api.submit({ ...base(), isNew: true }), (e) => e.code === 'READ_FAILED' && !e.uncertain);
  await rejectsWithoutWrite(fixture({ found: false, tableChange: (t) => { delete t.safeSnapshot; } }), { ...base(), isNew: true }, 'SAFE_MODE_UNAVAILABLE');
});
test('unknown details, password/payment payloads and invalid DOB fail before reading', async () => {
  for (const details of [{ password: 'nope' }, { payment: {} }, { address: { cardNumber: 'nope' } }, { dateOfBirth: '2026-02-31' }]) {
    const f = fixture();
    await rejectsWithoutWrite(f, { ...base(), details }, 'INVALID_FORM');
    assert.equal(f.calls.length, 0);
  }
});
test('unsupported schema leaves and sensitive stored leaves fail closed', async () => {
  await rejectsWithoutWrite(fixture({ schemaChange: (s) => { delete s.properties.person.properties.name.properties.firstName; } }), base(), 'SCHEMA_UNSUPPORTED');
  await rejectsWithoutWrite(fixture({ rows: [{ path: `${tenant}.preferences.password`, value: 'secret', valueType: 'string' }] }), base(), 'UNSAFE_SNAPSHOT');
});
test('preserves array indices, typed scalars and explicit tenant key without writing another industry', async () => {
  const f = fixture({ rows: [
    { path: `${tenant}.preferences.flags.enabled`, value: 'false', valueType: 'boolean' },
    { path: `${tenant}.preferences.labels.0`, value: 'adult', valueType: 'string' },
    { path: `${tenant}.preferences.labels.1`, value: 'returning', valueType: 'string' },
    { path: 'person.middleName', value: '', valueType: 'null' },
    { path: 'travelPreferences.roomType', value: 'suite', valueType: 'string', industry: 'travel' }
  ], schemaChange: (s) => {
    s.properties[tenant].properties.preferences.properties.labels = { type: 'array', items: { type: 'string' } };
  } });
  await f.api.submit(base());
  assert.equal(updates(f)[`${tenant}.preferences.flags.enabled`], false);
  assert.equal(updates(f)['person.middleName'], null);
  assert.equal(updates(f)[`${tenant}.preferences.labels.1`], 'returning');
  assert.equal(own(updates(f), 'travelPreferences.roomType'), false);
});
function own(o, key) { return Object.prototype.hasOwnProperty.call(o, key); }
test('all brand/channel booleans require schema support; no global opt-in substitution', async () => {
  const preferences = { vuse: { email: true, sms: false, whatsapp: false }, velo: { email: false, sms: false, whatsapp: false }, glo: { email: false, sms: true, whatsapp: false } };
  await rejectsWithoutWrite(fixture(), { ...base(), preferences }, 'PREFERENCES_UNSUPPORTED');
  const f = fixture({ preferences: true });
  await f.api.submit({ ...base(), preferences });
  assert.equal(updates(f)[`${tenant}.preferences.brands.vuse.email`], true);
  assert.equal(updates(f)[`${tenant}.preferences.brands.velo.email`], false);
  assert.equal(updates(f)['consents.marketing.email.val'], 'n');
});
test('write network/5xx uncertainty is surfaced once; 4xx rejection is definite', async () => {
  for (const status of [0, 400, 503]) {
    const f = fixture({ write: async () => {
      if (!status) throw new Error('connection lost');
      return { ok: false, status, json: async () => ({ error: 'rejected' }) };
    } });
    await assert.rejects(f.api.submit(base()), (e) => e.uncertain === (status !== 400));
    assert.equal(f.calls.filter((c) => c.init.method === 'POST').length, 1);
  }
});
test('a legacy success without safe receipt is uncertain, not UPS verified', async () => {
  const f = fixture({ write: async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) });
  await assert.rejects(f.api.submit(base()), (e) => e.uncertain === true && e.code === 'WRITE_UNCERTAIN');
});
test('malformed write responses are uncertain after 2xx/5xx but definite after 4xx', async () => {
  for (const status of [200, 400, 503]) {
    const f = fixture({ write: async () => ({ ok: status < 400, status, json: async () => { throw new Error('invalid json'); } }) });
    await assert.rejects(f.api.submit(base()), (e) => e.uncertain === (status !== 400));
    assert.equal(f.calls.filter((c) => c.init.method === 'POST').length, 1);
  }
});
test('invalid live identity, readonly Generic target and profile mismatch abort before writing', async () => {
  await rejectsWithoutWrite(fixture(), { ...base(), ecid: 'stale' }, 'INVALID_FORM');
  await rejectsWithoutWrite(fixture({ tableChange: (t) => { t.industries.generic.writable = false; } }), base(), 'NOT_WRITABLE');
  await rejectsWithoutWrite(fixture({ tableChange: (t) => { t.profileEmail = 'different@example.com'; } }), base(), 'IDENTITY_MISMATCH');
});
test('no labAuthFetch means no unauthenticated fallback', async () => {
  await assert.rejects(create().submit(base()), (e) => e.code === 'AUTH_UNAVAILABLE' && !e.uncertain);
});
test('default browser API uses the existing AepDemoGeneratorTargets labAuthFetch helper', async () => {
  const previous = global.AepDemoGeneratorTargets;
  const f = fixture();
  global.AepDemoGeneratorTargets = { labAuthFetch: f.fetcher };
  try {
    const result = await profileApi.submit(base());
    assert.equal(result.accepted, true);
    assert.equal(f.calls.length, 3);
  } finally {
    if (previous === undefined) delete global.AepDemoGeneratorTargets;
    else global.AepDemoGeneratorTargets = previous;
  }
});
