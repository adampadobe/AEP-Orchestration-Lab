'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLoyaltyReadRequest, buildLoyaltySignupRequest, createAjoLoyaltyService } = require('../ajoLoyaltyService');

const headers = { Authorization: 'Bearer test-token', 'x-sandbox-name': 'kirkham' };
const input = (action, params = {}) => ({ action, sandbox: 'kirkham', ...params });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const signupInput = (overrides = {}) => input('signup', {
  profile_id: 'member-1', challenge_id: 'challenge-1', region: 'nld2', test: false, confirmed: true, ...overrides,
});

test('signup submits exactly one documented single-challenge POST with server headers and no extra payload', async () => {
  const calls = [];
  const service = createAjoLoyaltyService({ fetchImpl: async (url, init) => {
    calls.push({ url, init }); return new Response('', { status: 200 });
  } });
  const result = await service.signup(headers, signupInput());
  assert.equal(result.accepted, true);
  assert.equal(result.challenge_id, 'challenge-1');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.href, 'https://platform-nld2.adobe.io/ajo/loyalty/challenges/signup/challenge-1');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'error');
  assert.deepEqual(calls[0].init.headers, { ...headers, 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(calls[0].init.body), { profileId: 'member-1', test: false });
  for (const changes of [{ confirmed: false }, { confirmed: 'true' }, { test: 'false' }, { region: undefined },
    { region: 'bad.host' }, { challenge_id: '../other' }, { profile_id: '' }, { data: {} }, { method: 'DELETE' },
    { action: 'withdraw' }, { sandbox: 'other/../sandbox' }, { challenge_id: ' challenge-1 ' }, { profile_id: ' member-1 ' }]) {
    assert.throws(() => buildLoyaltySignupRequest(signupInput(changes)), { status: 400 });
  }
  assert.equal(calls.length, 1);
});

test('signup failures preserve Adobe errors and uncertain responses are never retried or accepted', async () => {
  for (const [response, expectedStatus] of [
    [() => json({ title: 'Already joined' }, 409), 409],
    [() => json({ title: 'Personalization missing' }, 422), 422],
    [() => new Response('<html>unexpected</html>'), 502],
    [() => new Response('', { status: 202 }), 502],
    [() => json({ ok: false, error: 'Rejected' }), 502],
    [() => { throw Object.assign(new Error('secret-transport'), { name: 'TimeoutError' }); }, 504],
  ]) {
    let calls = 0;
    const service = createAjoLoyaltyService({ fetchImpl: async () => { calls++; return response(); } });
    await assert.rejects(service.signup(headers, signupInput()), error => {
      assert.equal(error.status, expectedStatus);
      assert.doesNotMatch(error.message, /secret-transport/);
      if (expectedStatus === 409) assert.deepEqual(error.platformResponse, { title: 'Already joined' });
      assert.equal(error.signupOutcomeUnknown, expectedStatus === 502 || expectedStatus === 504);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('builds only documented GET resource paths with encoded cursors and identities', async () => {
  const calls = [];
  const service = createAjoLoyaltyService({
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return json({ challengeList: [], _links: { next: { href: '?start=next' } } });
    },
  });
  for (const params of [
    input('config'),
    input('challenge_list', { limit: '100', start: 'a+b&next=1' }),
    input('challenge_get', { challenge_id: 'challenge-1' }),
    input('profile_state', { profile_id: 'member+1@example.test', challenge_id: 'challenge-1', test: false }),
    input('profile_challenges', { profile_id: 'member/one', state: 'complete', region: 'nld2' }),
  ]) await service.read(headers, params);
  assert.equal(calls[0].url.href, 'https://platform.adobe.io/ajo/loyalty/metadata/config');
  assert.equal(calls[1].url.searchParams.get('start'), 'a+b&next=1');
  assert.equal(calls[1].url.searchParams.get('limit'), '100');
  assert.equal(calls[2].url.pathname, '/ajo/loyalty/metadata/challenges/challenge-1');
  assert.equal(calls[3].url.hostname, 'platform-va7.adobe.io');
  assert.deepEqual(Object.fromEntries(calls[3].url.searchParams), {
    pid: 'member+1@example.test', v: '2', cid: 'challenge-1', test: 'false',
  });
  assert.equal(calls[4].url.hostname, 'platform-nld2.adobe.io');
  assert.equal(calls[4].url.pathname, '/ajo/loyalty/challenges/member%2Fone');
  assert.equal(calls[4].url.searchParams.get('state'), 'complete');
  assert.equal(buildLoyaltyReadRequest(input('profile_state', { profile_id: 'member', region: 'global' })).hostname, 'platform.adobe.io');
  for (const { init } of calls) {
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'error');
    assert.equal(init.body, undefined);
    assert.equal(init.headers, headers);
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('rejects invalid inputs, arbitrary request fields and reserved routes before fetching', async () => {
  let calls = 0;
  const service = createAjoLoyaltyService({ fetchImpl: async () => { calls++; return json({}); } });
  for (const params of [
    input('signup'),
    input('__proto__'),
    input(['config']),
    input('config', { path: '/ajo/loyalty/challenges/signup/x' }),
    input('config', { method: 'POST' }),
    input('challenge_list', { limit: ['1'] }),
    input('challenge_list', { limit: 0 }),
    input('challenge_list', { limit: 101 }),
    input('challenge_list', { limit: 1.5 }),
    input('challenge_list', { start: ['cursor'] }),
    input('challenge_get', { challenge_id: '../config' }),
    input('profile_state', { profile_id: 'member', region: 'va7.adobe.io@evil.test' }),
    input('profile_state', { profile_id: 'member', region: ['va7'] }),
    input('profile_state', { profile_id: 'member', test: 'false&test=true' }),
    input('profile_state', { profile_id: ' ' }),
    input('profile_state', { profile_id: 'member\nother' }),
    input('profile_challenges', { profile_id: '..' }),
    input('profile_challenges', { profile_id: 'org' }),
    input('profile_challenges', { profile_id: 'member', state: 'all' }),
  ]) await assert.rejects(service.read(headers, params), { status: 400 });
  assert.equal(calls, 0);
});

test('configuration returns only safe identity/event fields, never provider authentication', async () => {
  const service = createAjoLoyaltyService({ fetchImpl: async () => json({
    namespace: 'loyaltyId',
    applyEventsPriorToSignup: false,
    archiveDays: 0,
    autoSignupEvents: ['app-opened'],
    rewardEndpointList: [{ auth: { clientSecret: 'provider-secret' } }],
    completionSinkList: [{ apiKey: 'sink-secret' }],
    futureCredentialField: 'future-secret',
  }) });
  const result = await service.read(headers, input('config'));
  assert.equal(result.data.namespace, 'loyaltyId');
  assert.equal(result.data.applyEventsPriorToSignup, false);
  assert.equal(result.data.archiveDays, 0);
  assert.equal(result.data.eventSchemaId, null);
  assert.deepEqual(result.data.autoSignupEvents, ['app-opened']);
  assert.doesNotMatch(JSON.stringify(result), /provider-secret|sink-secret|future-secret|test-token/);
  const failed = createAjoLoyaltyService({ fetchImpl: async () => json({
    error_code: 'internal-error', message: 'Configuration rejected',
    rewardEndpointList: [{ additionalHeaders: { authorization: 'provider-secret' } }],
  }, 500) });
  await assert.rejects(failed.read(headers, input('config')), (error) => {
    assert.deepEqual(error.platformResponse, { error_code: 'internal-error', message: 'Configuration rejected' });
    return true;
  });
  for (const data of [{ namespace: { secret: 'invalid' } }, { autoSignupEvents: [{ secret: 'invalid' }] }]) {
    const invalid = createAjoLoyaltyService({ fetchImpl: async () => json(data) });
    await assert.rejects(invalid.read(headers, input('config')), { status: 502, platformResponse: null });
  }
});

test('preserves observed children metadata envelopes, exact IDs and pagination alongside the documented format', async () => {
  for (const [field, challenges] of [
    ['children', [{ _id: 'challenge-1', tasksToComplete: 1, tasks: [{ taskId: 'task-1', variables: { goal: 3 } }] }]],
    ['children', []],
    ['challengeList', [{ get_id: 'challenge-1' }]],
  ]) {
    const data = {
      _page: { count: challenges.length, total_records: 6 },
      [field]: challenges,
      _links: { next: { href: '?start=opaque%2Bcursor' } },
    };
    const service = createAjoLoyaltyService({ fetchImpl: async () => json(data) });
    const result = await service.read(headers, input('challenge_list'));
    assert.deepEqual(result.data, data);
  }
});

test('preserves member task goals, zero counters, opt-in and completion history without deriving progress from metadata', async () => {
  const data = {
    challengeList: [{
      challenge_id: 'challenge-1', state: 'active', tasksToComplete: 1, optedIn: false,
      tasks: [{
        taskId: 'task-1', taskState: 'incomplete', variables: { goal: 3 },
        accumulators: { qty: 0, spend: 0, days: 0 }, taskCompletions: [],
      }],
      challengeCompletions: [],
    }],
    _links: { next: { href: '?start=cursor-2' } },
  };
  const service = createAjoLoyaltyService({ fetchImpl: async () => json(data) });
  const result = await service.read(headers, input('profile_state', { profile_id: 'member-1' }));
  assert.deepEqual(result.data, data);
  assert.equal(result.platform_status, 200);
  assert.equal(result.platform_host, 'platform-va7.adobe.io');
  for (const action of ['profile_state', 'profile_challenges']) {
    const metadata = createAjoLoyaltyService({ fetchImpl: async () => json({ children: [] }) });
    await assert.rejects(metadata.read(headers, input(action, { profile_id: 'member-1' })), { status: 502 });
  }
});

test('preserves Adobe errors and stops after one failed read, including authorization failures', async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    let calls = 0;
    const body = { error_code: 'loyalty-error', message: `Adobe error ${status}` };
    const service = createAjoLoyaltyService({ fetchImpl: async () => { calls++; return json(body, status); } });
    await assert.rejects(service.read(headers, input('challenge_list')), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.platformStatus, status);
      assert.deepEqual(error.platformResponse, body);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('rejects malformed, oversized and missing-list responses instead of claiming no challenges', async () => {
  for (const response of [
    () => new Response('<html>unexpected</html>'),
    () => json({}),
    () => json({ challengeList: null }),
    () => json({ children: null }),
    () => json({ children: {} }),
    () => json({ children: [null] }),
    () => json({ children: ['not a challenge'] }),
    () => json({ challengeList: [[]] }),
    () => json([]),
    () => json({ challengeList: [], padding: 'x'.repeat(2 * 1024 * 1024) }),
  ]) {
    const service = createAjoLoyaltyService({ fetchImpl: async () => response() });
    await assert.rejects(service.read(headers, input('challenge_list')), { status: 502 });
  }
  const empty = createAjoLoyaltyService({ fetchImpl: async () => json({ challengeList: [] }) });
  assert.deepEqual((await empty.read(headers, input('challenge_list'))).data.challengeList, []);
});

test('transport and body timeouts fail explicitly without leaking transport details', async () => {
  for (const [error, status] of [
    [Object.assign(new Error('request-with-secret'), { name: 'TimeoutError' }), 504],
    [new TypeError('request-with-secret'), 502],
  ]) {
    const service = createAjoLoyaltyService({ fetchImpl: async () => { throw error; } });
    await assert.rejects(service.read(headers, input('config')), (failure) => {
      assert.equal(failure.status, status);
      assert.doesNotMatch(failure.message, /request-with-secret/);
      return true;
    });
  }
  const service = createAjoLoyaltyService({ fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.error(Object.assign(new Error('timeout'), { name: 'AbortError' })); },
  })) });
  await assert.rejects(service.read(headers, input('config')), { status: 504 });
});
