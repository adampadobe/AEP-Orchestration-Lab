import test from 'node:test';
import assert from 'node:assert/strict';
import { executeGeneratePlan, planDualStreamGenerate } from '../src/framework/dualStreamGenerate.mjs';

const EMAIL = 'offline@example.com';
const ECID = '12345678901234567890123456789012345678';
const DATASET_ID = '69f4aabf1c8a60bba5e92423';

function persistedProfile(attributes, { sourceDatasetId = DATASET_ID } = {}) {
  const rows = [
    { path: 'personalEmail.address', value: EMAIL, valueType: 'string' },
    { path: '_demoemea.identification.core.email', value: EMAIL, valueType: 'string' },
    { path: '_demoemea.identification.core.ecid', value: ECID, valueType: 'string' },
    ...Object.entries(attributes).map(([path, value]) => ({
      path,
      value: String(value),
      valueType: typeof value,
    })),
  ];
  return {
    found: true,
    profileEmail: EMAIL,
    ecid: ECID,
    rows,
    profileAccessHints: {
      identityMapHasEmail: true,
      identityMapHasEcid: true,
      sourceDatasetIds: [sourceDatasetId],
    },
  };
}

function mockLabApi(t, {
  onConnection = () => Response.json({ record: { streaming: { datasetId: DATASET_ID } } }),
  onProfileRead = () => Response.json(persistedProfile({ 'profilePlaceContext.city': 'London' })),
} = {}) {
  const calls = [];
  const profileReadAttempts = new Map();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    const namespace = requestUrl.searchParams.get('namespace');
    calls.push({ path, body, namespace });

    if (path === '/api/generic-profile-connection') {
      return onConnection();
    }
    if (path === '/api/profile/table') {
      const attempt = (profileReadAttempts.get(namespace) || 0) + 1;
      profileReadAttempts.set(namespace, attempt);
      return onProfileRead(attempt, namespace);
    }
    return Response.json({
      ok: true,
      ecid: ECID,
      appendToken: body.industry === 'generic' ? 'offline-continuation' : undefined,
      geoMirror: body.industry === 'generic' ? { written: true } : { written: false, reason: 'no_place' },
    });
  });
  return calls;
}

test('dual-stream waits for matching Generic persistence before sending the overlay', async (t) => {
  const calls = mockLabApi(t, {
    onProfileRead: (attempt) => attempt === 1
      ? Response.json({ error: 'Profile not yet visible', code: 'UPS_ENTITY_NOT_FOUND' }, { status: 404 })
      : Response.json(persistedProfile({ 'profilePlaceContext.city': 'London' })),
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: 'offline@example.com',
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });
  const result = await executeGeneratePlan({
    email: EMAIL,
    sandbox: 'offline',
    plan,
    persistenceTimeoutMs: 100,
    persistencePollIntervalMs: 1,
  });
  assert.equal(result.ok, true, JSON.stringify(result.stepResults));
  const paths = calls.map((call) => call.path);
  assert.deepEqual(paths, [
    '/api/generic-profile-connection',
    '/api/profile/generate',
    '/api/profile/table',
    '/api/profile/table',
    '/api/profile/table',
    '/api/profile/table',
    '/api/profile/generate',
  ]);
  assert.deepEqual(
    calls.filter((call) => call.path === '/api/profile/table').map((call) => call.namespace),
    ['email', 'ecid', 'email', 'ecid'],
  );
  assert.equal(result.stepResults[0].persistence.ready, true);
  assert.equal(result.stepResults[0].persistence.attempts, 2);
  assert.deepEqual(result.data.geoMirror, { written: true });
  assert.deepEqual(result.stepResults[1].geoMirror, { written: false, reason: 'no_place' });
});

test('dual-stream stops after Generic acceptance when persistence is not verified', async (t) => {
  const calls = mockLabApi(t, {
    onProfileRead: () => Response.json(
      { error: 'Profile not yet visible', code: 'UPS_ENTITY_NOT_FOUND' },
      { status: 404 },
    ),
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: EMAIL,
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });

  const result = await executeGeneratePlan({
    email: EMAIL,
    sandbox: 'offline',
    plan,
    persistenceTimeoutMs: 100,
  });

  assert.equal(result.ok, false);
  assert.equal(result.partialSuccess, true);
  assert.equal(result.errorCode, 'GENERIC_PROFILE_PERSISTENCE_TIMEOUT');
  assert.match(result.error, /Do not regenerate this identity/);
  assert.equal(result.stepResults[0].persistence.ready, false);
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 1);
});

test('dual-stream does not accept a profile without the Generic dataset provenance', async (t) => {
  const calls = mockLabApi(t, {
    onProfileRead: () => Response.json(
      persistedProfile({ 'profilePlaceContext.city': 'London' }, { sourceDatasetId: '000000000000000000000000' }),
    ),
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: EMAIL,
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });

  const result = await executeGeneratePlan({
    email: EMAIL,
    sandbox: 'offline',
    plan,
    persistenceTimeoutMs: 100,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.stepResults[0].persistence.missingChecks,
    ['email_lookup_not_ready', 'ecid_lookup_not_ready'],
    JSON.stringify(result.stepResults[0].persistence),
  );
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 1);
});

test('dual-stream requires ECID namespace lookup even when Email lookup succeeds', async (t) => {
  const calls = mockLabApi(t, {
    onProfileRead: (_attempt, namespace) => namespace === 'ecid'
      ? Response.json({ error: 'ECID not yet linked', code: 'UPS_ENTITY_NOT_FOUND' }, { status: 404 })
      : Response.json(persistedProfile({ 'profilePlaceContext.city': 'London' })),
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: EMAIL,
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });

  const result = await executeGeneratePlan({
    email: EMAIL,
    sandbox: 'offline',
    plan,
    persistenceTimeoutMs: 100,
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.stepResults[0].persistence.missingChecks, ['ecid_lookup_not_ready']);
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 1);
});

test('dual-stream does not submit a profile when Generic dataset provenance cannot be configured', async (t) => {
  const calls = mockLabApi(t, {
    onConnection: () => Response.json({ record: { streaming: {} } }),
  });
  const plan = planDualStreamGenerate({
    industry: 'media', email: EMAIL,
    attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
  });

  const result = await executeGeneratePlan({ email: EMAIL, sandbox: 'offline', plan });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'GENERIC_PROFILE_DATASET_UNAVAILABLE');
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 0);
});
