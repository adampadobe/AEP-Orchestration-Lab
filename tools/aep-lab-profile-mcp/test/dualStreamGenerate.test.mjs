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
  onGenerate,
} = {}) {
  const calls = [];
  const profileReadAttempts = new Map();
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const requestUrl = new URL(url);
    const path = requestUrl.pathname;
    const body = init.body ? JSON.parse(init.body) : null;
    const namespace = requestUrl.searchParams.get('namespace');
    calls.push({ path, body, namespace, origin: requestUrl.origin });

    if (path === '/api/generic-profile-connection') {
      return onConnection();
    }
    if (path === '/profileTableProxy') {
      const attempt = (profileReadAttempts.get(namespace) || 0) + 1;
      profileReadAttempts.set(namespace, attempt);
      return onProfileRead(attempt, namespace);
    }
    if (onGenerate) return onGenerate(body);
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
    '/profileTableProxy',
    '/profileTableProxy',
    '/profileTableProxy',
    '/profileTableProxy',
    '/api/profile/generate',
  ]);
  assert.deepEqual(
    calls.filter((call) => call.path === '/profileTableProxy').map((call) => call.namespace),
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
    ['email_lookup_not_ready', 'generic_dataset_provenance_missing'],
    JSON.stringify(result.stepResults[0].persistence),
  );
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 1);
});

test('dual-stream sends the overlay while ECID indexing is pending, using direct reads', async (t) => {
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

  assert.equal(result.ok, true);
  assert.deepEqual(result.stepResults[0].persistence.missingChecks, []);
  assert.equal(result.stepResults[0].persistence.gateNamespace, 'email');
  assert.equal(result.stepResults[0].persistence.ecidLookupReady, false);
  assert.equal(result.stepResults[0].persistence.lastReadErrors.ecid.status, 404);
  assert.equal(calls.filter((call) => call.path === '/api/profile/generate').length, 2);
  assert.ok(calls.filter((call) => call.path === '/profileTableProxy')
    .every((call) => call.origin === 'https://us-central1-aep-orchestration-lab.cloudfunctions.net'));
});

test('email gate matches tenant-relative attributes against real UPS tenant-prefixed rows', async (t) => {
  const attributes = {
    'profilePlaceContext.city': 'London',
    'scoring.core.flag': false,
    'scoring.core.count': 0,
    'scoring.core.tags': ['one', 'two'],
  };
  mockLabApi(t, {
    onProfileRead: () => {
      const profile = persistedProfile({});
      profile.rows.push(
        { path: '_demoemea.profilePlaceContext.city', value: 'London' },
        { path: '_demoemea.scoring.core.flag', value: 'false' },
        { path: '_demoemea.scoring.core.count', value: '0' },
        { path: '_demoemea.scoring.core.tags.0', value: 'one' },
        { path: '_demoemea.scoring.core.tags.1', value: 'two' },
      );
      return Response.json(profile);
    },
  });
  const result = await executeGeneratePlan({
    email: EMAIL, sandbox: 'offline',
    plan: planDualStreamGenerate({
      industry: 'media', email: EMAIL,
      attributes: { ...attributes, 'industryMedia.primaryGenre': 'Drama' },
    }),
    persistenceTimeoutMs: 100,
  });
  assert.equal(result.ok, true, JSON.stringify(result.stepResults));
});

test('email gate refuses wrong identities and missing or incorrect stored fields', async (t) => {
  for (const change of [
    profile => { profile.ecid = '99999999999999999999999999999999999999'; },
    profile => { profile.profileEmail = 'different@example.com'; },
    profile => { profile.rows.find(row => row.path.endsWith('.core.ecid')).value = 'wrong'; },
    profile => { profile.rows.find(row => row.path === 'profilePlaceContext.city').value = 'Paris'; },
    profile => { profile.profileAccessHints.identityMapHasEmail = false; },
  ]) {
    const calls = mockLabApi(t, {
      onProfileRead: () => {
        const profile = persistedProfile({ 'profilePlaceContext.city': 'London' });
        change(profile);
        return Response.json(profile);
      },
    });
    const result = await executeGeneratePlan({
      email: EMAIL, sandbox: 'offline',
      plan: planDualStreamGenerate({
        industry: 'media', email: EMAIL,
        attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
      }),
      persistenceTimeoutMs: 15,
    });
    assert.equal(result.ok, false);
    assert.equal(result.partialSuccess, true);
    assert.equal(calls.filter(call => call.path === '/api/profile/generate').length, 1);
    t.mock.restoreAll();
  }
});

test('email gate reports missing ECID identity-map linkage without blocking a matching tenant identity', async (t) => {
  mockLabApi(t, {
    onProfileRead: (_attempt, namespace) => {
      if (namespace === 'ecid') {
        return Response.json({ code: 'UPS_ENTITY_NOT_FOUND' }, { status: 404 });
      }
      const profile = persistedProfile({ 'profilePlaceContext.city': 'London' });
      profile.profileAccessHints.identityMapHasEcid = false;
      return Response.json(profile);
    },
  });
  const result = await executeGeneratePlan({
    email: EMAIL, sandbox: 'offline',
    plan: planDualStreamGenerate({
      industry: 'media', email: EMAIL,
      attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
    }),
    persistenceTimeoutMs: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.stepResults[0].persistence.ecidLookupReady, false);
});

test('readback deadline starts after the generation response, not before submission', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  mockLabApi(t, {
    onGenerate: body => {
      now += 80_000;
      return Response.json({
        ok: true, ecid: ECID,
        ...(body.industry === 'generic' ? { appendToken: 'offline-continuation' } : {}),
      });
    },
  });
  const result = await executeGeneratePlan({
    email: EMAIL, sandbox: 'offline',
    plan: planDualStreamGenerate({
      industry: 'media', email: EMAIL,
      attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
    }),
    persistenceTimeoutMs: 100,
  });
  assert.equal(result.ok, true);
  assert.equal(result.stepResults[0].persistence.elapsedMs, 0);
});

test('default email deadline is exactly 90 seconds and never retries the accepted stream', async (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const calls = mockLabApi(t, {
    onProfileRead: (_attempt, namespace) => {
      if (namespace === 'email') now += 30_000;
      return Response.json({ code: 'UPS_ENTITY_NOT_FOUND' }, { status: 404 });
    },
  });
  const result = await executeGeneratePlan({
    email: EMAIL, sandbox: 'offline',
    plan: planDualStreamGenerate({
      industry: 'media', email: EMAIL,
      attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
    }),
    persistencePollIntervalMs: 1,
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'GENERIC_PROFILE_PERSISTENCE_TIMEOUT');
  assert.equal(result.stepResults[0].persistence.elapsedMs, 90_000);
  assert.equal(result.stepResults[0].persistence.attempts, 3);
  assert.equal(calls.filter(call => call.path === '/api/profile/generate').length, 1);
});

test('email read errors stop the overlay, while ECID errors remain explicit diagnostics', async (t) => {
  for (const failedNamespace of ['email', 'ecid']) {
    const calls = mockLabApi(t, {
      onProfileRead: (_attempt, namespace) => namespace === failedNamespace
        ? Response.json({ code: 'UPS_FAILED', error: 'Read unavailable' }, { status: 500 })
        : Response.json(persistedProfile({ 'profilePlaceContext.city': 'London' })),
    });
    const result = await executeGeneratePlan({
      email: EMAIL, sandbox: 'offline',
      plan: planDualStreamGenerate({
        industry: 'media', email: EMAIL,
        attributes: { 'profilePlaceContext.city': 'London', 'industryMedia.primaryGenre': 'Drama' },
      }),
      persistenceTimeoutMs: 100,
    });
    assert.equal(result.ok, failedNamespace === 'ecid');
    assert.equal(calls.filter(call => call.path === '/api/profile/generate').length, failedNamespace === 'ecid' ? 2 : 1);
    if (failedNamespace === 'ecid') {
      assert.equal(result.stepResults[0].persistence.lastReadErrors.ecid.status, 500);
    } else {
      assert.equal(result.errorCode, 'UPS_FAILED');
    }
    t.mock.restoreAll();
  }
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
