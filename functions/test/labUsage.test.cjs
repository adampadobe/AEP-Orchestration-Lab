'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { requireUsageOwner, summarizeUsage, getUsageSnapshot } = require('../labUsageService');
const { registerLabUsageRoutes } = require('../labUsageRoutes');

const now = new Date('2026-10-06T09:00:00.000Z');
const owner = { uid: 'owner-uid', email: 'apalmer@adobe.com', emailVerified: true, disabled: false };
const claims = { uid: owner.uid, email: owner.email, email_verified: true, firebase: { sign_in_provider: 'google.com' } };
const req = { method: 'GET', headers: { authorization: 'Bearer test-token' }, query: {} };
function authStub(overrides = {}) {
  return {
    verifyIdToken: async (token, checkRevoked) => {
      assert.equal(token, 'test-token');
      assert.equal(checkRevoked, true);
      return claims;
    },
    getUserByEmail: async (email) => {
      assert.equal(email, owner.email);
      return owner;
    },
    listUsers: async (limit) => {
      assert.equal(limit, 1000);
      return { users: [], pageToken: 'more-accounts' };
    },
    ...overrides,
  };
}

test('usage owner uses a revoked-token check and the current Auth directory UID', async () => {
  assert.deepEqual(await requireUsageOwner(req, authStub()), { uid: owner.uid });
  for (const tokenClaims of [
    { ...claims, email: 'another@adobe.com' },
    { ...claims, email_verified: false },
    { ...claims, firebase: { sign_in_provider: 'anonymous' } },
    { ...claims, uid: 'different-uid' },
  ]) {
    const result = await requireUsageOwner(req, authStub({ verifyIdToken: async () => tokenClaims }));
    assert.equal(result.status, 403);
  }
  for (const record of [{ ...owner, disabled: true }, { ...owner, emailVerified: false }]) {
    assert.equal((await requireUsageOwner(req, authStub({ getUserByEmail: async () => record }))).status, 403);
  }
});

test('missing, malformed, expired and revoked tokens deny access; infrastructure errors surface', async () => {
  for (const authorization of ['', 'Bearer', 'Bearer test-token extra', 'Basic test-token']) {
    assert.equal((await requireUsageOwner({ headers: { authorization } }, authStub())).status, 401);
  }
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled']) {
    const result = await requireUsageOwner(req, authStub({
      verifyIdToken: async () => { throw Object.assign(new Error('token rejected'), { code }); },
    }));
    assert.equal(result.status, 401);
  }
  await assert.rejects(() => requireUsageOwner(req, authStub({
    verifyIdToken: async () => { throw Object.assign(new Error('down'), { code: 'auth/internal-error' }); },
  })));
});

function fixture(overrides = {}) {
  return {
    now, days: 7, truncated: { usersTruncated: false, keysTruncated: false, auditTruncated: false },
    userRecords: [
      { uid: 'a', email: 'person@adobe.com', displayName: 'Person', metadata: {
        creationTime: '2026-09-01T00:00:00Z', lastSignInTime: '2026-10-05T11:00:00Z',
      } },
      { uid: 'anon', providerData: [] },
    ],
    keyRecords: [
      { id: 'key-a', principalUid: 'a', revoked: false, lastUsedAt: { toDate: () => new Date('2026-10-05T12:00:00Z') }, keyHash: 'secret-hash' },
      { id: 'old-key', principalUid: 'a', revoked: true },
      { id: 'missing-owner', principalUid: 'deleted-user', revoked: false },
    ],
    auditRecords: [
      { keyId: 'key-a', timestamp: '2026-10-05T12:00:00Z', tool: 'lab_get_profile', result: 'ok', durationMs: 100, email: 'profile-pii@example.com', identifier: 'secret-profile-id' },
      { keyId: 'old-key', timestamp: '2026-10-05T12:10:00Z', tool: 'lab_get_profile', result: 'error', durationMs: 300 },
      { keyId: 'shared', timestamp: '2026-10-04T03:00:00Z', tool: 'lab_get_profile', result: 'ok' },
      { keyId: 'missing-owner', timestamp: '2026-10-04T03:00:00Z', tool: 'unexpected-profile-id', durationMs: -1 },
      { keyId: 'key-a', timestamp: '2026-09-01T00:00:00Z', tool: 'lab_get_profile' },
      { keyId: 'key-a', timestamp: '2026-10-07T00:00:00Z', tool: 'lab_get_profile' },
      { keyId: 'key-a', timestamp: 'invalid-date', tool: 'lab_get_profile' },
    ],
    ...overrides,
  };
}

test('snapshot separates current accounts/keys from observed, UTC-bounded MCP audit events', () => {
  const result = summarizeUsage(fixture());
  assert.deepEqual(result.summary, {
    registeredUsers: 1, accountsWithoutEmail: 1, usersWithRecentSignIn: 1, keyOwners: 1,
    activeKeys: 2, revokedKeys: 1, observedMcpEvents: 4, observedMcpUsers: 1,
    unattributedEvents: 2, observedErrors: 1,
  });
  assert.equal(result.users[0].observedMcpEvents, 2);
  assert.equal(result.users[0].lastKeyUseAt, '2026-10-05T12:00:00.000Z');
  assert.equal(result.users[0].lastObservedMcpAt, '2026-10-05T12:10:00.000Z');
  assert.deepEqual(result.tools[0], {
    name: 'lab_get_profile', events: 3, errors: 1, unknownResults: 0, timedEvents: 2, averageDurationMs: 200,
  });
  assert.equal(result.tools[1].unknownResults, 1);
  assert.equal(result.tools[1].averageDurationMs, null);
  assert.equal(result.hours[1][12], 2);
  assert.equal(result.hours[0][3], 2);
  assert.deepEqual(result.daily, [{ date: '2026-10-04', events: 2 }, { date: '2026-10-05', events: 2 }]);
  assert.equal(result.coverage.pageViews, 'not_collected');
  assert.equal(result.coverage.loginHistory, 'not_collected');
  for (const forbidden of ['profile-pii', 'secret-profile-id', 'secret-hash', 'unexpected-profile-id', 'key-a']) {
    assert.equal(JSON.stringify(result).includes(forbidden), false);
  }
});

test('empty or unlinked records do not create fictional logins, key owners or latency', () => {
  const result = summarizeUsage(fixture({
    userRecords: [], keyRecords: [], auditRecords: [],
  }));
  assert.deepEqual(result.users, []);
  assert.deepEqual(result.tools, []);
  assert.equal(result.summary.observedMcpEvents, 0);
  assert.equal(result.coverage.firstEventAt, null);
  assert.equal(result.coverage.engagement, 'not_collected');
});

function dbStub({ keyCount = 0, auditCount = 0, websiteRecords = [], invocationRecords = [],
  keyRecords = null, auditRecords = null, fail = false } = {}) {
  return {
    collection(name) {
      assert.ok(['mcpApiKeys', 'mcpProfileAuditLog', 'labUsageEvents', 'mcpUsageInvocations'].includes(name));
      const audit = name === 'mcpProfileAuditLog';
      const website = name === 'labUsageEvents';
      const invocation = name === 'mcpUsageInvocations';
      const query = {
        select(...fields) {
          assert.deepEqual(fields, invocation
            ? ['version', 'principalUid', 'authSource', 'endpoint', 'toolset', 'tool',
              'timestamp', 'durationMs', 'handlerStarted', 'outcome', 'expiresAt'] : website
            ? ['uid', 'type', 'route', 'timestamp', 'expiresAt', 'navigation', 'occurredAt', 'activeMs'] : audit
            ? ['timestamp', 'keyId', 'tool', 'result', 'durationMs']
            : ['principalUid', 'revoked', 'createdAt', 'lastUsedAt']);
          return query;
        },
        where(field, op, value) {
          assert.equal(field, 'timestamp');
          assert.ok(['>=', '<='].includes(op));
          assert.ok(Number.isFinite(Date.parse(value)));
          return query;
        },
        orderBy(field, direction) {
          assert.deepEqual([field, direction], ['timestamp', 'desc']);
          return query;
        },
        limit(value) { assert.equal(value, audit || website || invocation ? 5001 : 1001); return query; },
        async get() {
          if (fail) throw Object.assign(new Error('database unavailable'), { code: 'unavailable' });
          if (website) return { docs: websiteRecords.map((record) => ({ data: () => record })) };
          if (invocation) return { docs: invocationRecords.map((record) => ({ data: () => record })) };
          const supplied = audit ? auditRecords : keyRecords;
          if (supplied) return { docs: supplied.map((record) => ({ id: record.id, data: () => record })) };
          return { docs: Array.from({ length: website ? 0 : audit ? auditCount : keyCount }, (_, index) => ({
            id: String(index), data: () => audit
              ? { timestamp: '2026-10-05T12:00:00Z', tool: 'lab_get_profile', result: 'ok' }
              : { revoked: false },
          })) };
        },
      };
      return query;
    },
  };
}

test('read limits are bounded, flagged and projected to non-sensitive fields', async () => {
  const result = await getUsageSnapshot({
    auth: authStub(), db: dbStub({ keyCount: 1001, auditCount: 5001 }), days: 7, now,
  });
  assert.equal(result.coverage.usersTruncated, true);
  assert.equal(result.coverage.keysTruncated, true);
  assert.equal(result.coverage.auditTruncated, true);
  assert.equal(result.summary.activeKeys, 1000);
  assert.equal(result.summary.observedMcpEvents, 5000);
});

test('owner snapshot joins website summaries without exposing raw telemetry and retains history when disabled', async () => {
  const result = await getUsageSnapshot({
    auth: authStub({ listUsers: async () => ({ users: fixture().userRecords }) }),
    db: dbStub({ websiteRecords: [{
      uid: 'a', type: 'page_view', route: '/profile-viewer/profile.html',
      timestamp: '2026-10-05T12:00:00.000Z', expiresAt: new Date('2026-12-01'),
      navigation: 'reload', fingerprint: 'private-event-fingerprint',
    }] }), days: 7, now, telemetryCollectionEnabled: false,
  });

  assert.equal(result.website.enabled, false);
  assert.equal(result.website.summary.pageViews, 1);
  assert.equal(result.website.users[0].uid, 'a');
  assert.deepEqual(result.website.users[0].pages, [{ route: '/profile-viewer/profile.html', views: 1 }]);
  assert.equal(result.coverage.pageViews, 'partial');
  assert.equal(JSON.stringify(result).includes('private-event-fingerprint'), false);
});

test('owner snapshot exposes independent invocation summaries, not raw dispatch records', async () => {
  const result = await getUsageSnapshot({
    auth: authStub({ listUsers: async () => ({ users: fixture().userRecords }) }),
    db: dbStub({ invocationRecords: [{
      version: 1, principalUid: 'a', authSource: 'ims', endpoint: '/mcp/profile', toolset: 'profile',
      tool: 'lab_get_profile', outcome: 'result', timestamp: '2026-10-05T12:00:00.000Z',
      expiresAt: new Date('2026-12-01'), durationMs: 50, handlerStarted: true,
      id: 'private-invocation', arguments: 'private-arguments',
    }] }), days: 7, now,
  });
  assert.equal(result.invocations.summary.invocations, 1);
  assert.equal(result.invocations.users[0].uid, 'a');
  assert.equal(result.summary.observedMcpEvents, 0);
  assert.doesNotMatch(JSON.stringify(result), /private-invocation|private-arguments/);
});

  test('owner exclusion filters all identifiable sources before aggregation, not shared history', async () => {
    const timestamp = '2026-10-05T12:00:00.000Z';
    const expiry = new Date('2026-12-01');
    const source = {
      auth: authStub({ listUsers: async () => ({ users: [owner, ...fixture().userRecords] }) }),
      db: dbStub({
        keyRecords: [{ id: 'owner-key', principalUid: owner.uid, revoked: false },
          { id: 'person-key', principalUid: 'a', revoked: false }],
        auditRecords: ['owner-key', 'person-key', 'deleted-key'].map((keyId) => ({
          keyId, timestamp, tool: 'lab_get_profile', result: 'ok',
        })),
        websiteRecords: [owner.uid, 'a'].flatMap((uid) => [
          { uid, timestamp, expiresAt: expiry, type: 'page_view', route: '/profile-viewer/profile.html' },
          { uid, timestamp, expiresAt: expiry, type: 'heartbeat', route: '/profile-viewer/profile.html',
            occurredAt: timestamp, activeMs: 15000 },
        ]),
        invocationRecords: [owner.uid, 'a', null].map((principalUid) => ({
          version: 1, principalUid, timestamp, expiresAt: expiry, tool: 'lab_get_profile',
          endpoint: '/mcp/profile', toolset: 'profile', authSource: principalUid ? 'user' : 'env',
          outcome: 'result', handlerStarted: true, durationMs: 10,
        })),
      }), days: 7, now,
    };
    const included = await getUsageSnapshot(source);
    const excluded = await getUsageSnapshot({ ...source, excludedUid: owner.uid });
    assert.equal(included.ownerExcluded, false);
    assert.equal(excluded.ownerExcluded, true);
    assert.equal(excluded.summary.registeredUsers, included.summary.registeredUsers - 1);
    assert.equal(excluded.summary.activeKeys, 1);
    assert.equal(excluded.summary.observedMcpEvents, 2);
    assert.equal(excluded.summary.unattributedEvents, 1);
    assert.equal(excluded.website.summary.pageViews, 1);
    assert.equal(excluded.invocations.summary.invocations, 2);
    assert.equal(excluded.invocations.summary.unattributed, 1);
    assert.equal(excluded.engagement.summary.activeMs, 15000);
    assert.equal(excluded.engagement.summary.sessions, 1);
    assert.equal(excluded.coverage.engagement, 'partial');
    assert.doesNotMatch(JSON.stringify(excluded), /owner-uid|owner-key|apalmer@adobe.com/);
  });

function routeHarness(getServices) {
  const logs = [];
  const { labUsageStats } = registerLabUsageRoutes({
    onRequest: (options, handler) => handler,
    CONSENT_STORE_FN_OPTS: {}, setCors: () => {},
    getServices, logger: { error: (...args) => logs.push(args) },
  });
  return {
    logs,
    async run(request = req) {
      const res = {
        headers: {}, statusCode: 200,
        set(key, value) { this.headers[key] = value; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
      };
      await labUsageStats(request, res);
      return res;
    },
  };
}

test('route prevents anonymous/non-owner reads before querying data and rejects mutations', async () => {
  let reads = 0;
  const harness = routeHarness(() => ({
    auth: authStub({ verifyIdToken: async () => ({ ...claims, email: 'other@adobe.com' }) }),
    db: { collection: () => { reads += 1; throw new Error('must not query'); } },
  }));
  assert.equal((await harness.run({ ...req, method: 'OPTIONS' })).statusCode, 204);
  assert.equal((await harness.run({ ...req, method: 'POST' })).statusCode, 405);
  assert.equal((await harness.run({ ...req, headers: {} })).statusCode, 401);
  assert.equal((await harness.run()).statusCode, 403);
  assert.equal(reads, 0);
});

test('route validates windows, does not publicly cache, and reauthorizes cached snapshots', async () => {
  let verifications = 0;
  let ownerAllowed = true;
  const harness = routeHarness(() => ({
    auth: authStub({
      verifyIdToken: async () => {
        verifications += 1;
        return ownerAllowed ? claims : { ...claims, email: 'someone@adobe.com' };
      },
    }),
    db: dbStub(),
  }));
  for (const days of ['0', '365', ['7'], '7.0', 7]) {
    assert.equal((await harness.run({ ...req, query: { days } })).statusCode, 400);
  }
  const first = await harness.run();
  assert.equal(first.statusCode, 200);
  assert.equal(first.headers['Cache-Control'], 'private, no-store');
  assert.equal(first.headers.Vary, 'Authorization');
  assert.equal((await harness.run()).body.generatedAt, first.body.generatedAt);
  ownerAllowed = false;
  assert.equal((await harness.run()).statusCode, 403);
  assert.equal(verifications, 8);
});

test('backend failure returns explicit unavailability, never empty success or private error text', async () => {
  const harness = routeHarness(() => ({ auth: authStub(), db: dbStub({ fail: true }) }));
  const res = await harness.run();
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error.includes('database unavailable'), false);
  assert.equal(harness.logs.length, 1);
});

test('exclusion query is strict, cached independently and never bypasses owner authorization', async () => {
  let listings = 0;
  let allowed = true;
  const harness = routeHarness(() => ({
    auth: authStub({
      verifyIdToken: async () => allowed ? claims : { ...claims, email: 'other@adobe.com' },
      listUsers: async () => { listings += 1; return { users: [owner] }; },
    }), db: dbStub(),
  }));
  for (const excludeOwner of ['1', '', true, ['true'], { uid: owner.uid }]) {
    assert.equal((await harness.run({ ...req, query: { excludeOwner } })).statusCode, 400);
  }
  assert.equal((await harness.run()).body.summary.registeredUsers, 1);
  const excluded = { ...req, query: { excludeOwner: 'true' } };
  assert.equal((await harness.run(excluded)).body.summary.registeredUsers, 0);
  assert.equal((await harness.run(excluded)).body.ownerExcluded, true);
  assert.equal((await harness.run()).body.ownerExcluded, false);
  assert.equal(listings, 2);
  allowed = false;
  assert.equal((await harness.run(excluded)).statusCode, 403);
});

test('Hosting rewrite, exported handler and page data endpoint remain aligned', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '../..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  const route = hosting.flatMap((entry) => entry.rewrites || []).find((entry) => entry.source === '/api/lab/usage');
  assert.deepEqual(route.function, { functionId: 'labUsageStats', region: 'us-central1' });
  assert.match(fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'), /Object\.assign\(exports, registerLabUsageRoutes/);
  assert.match(fs.readFileSync(path.join(root, 'web/profile-viewer/usage-statistics.js'), 'utf8'), /\/api\/lab\/usage\?days=/);
  assert.match(fs.readFileSync(path.join(root, 'web/profile-viewer/aep-lab-nav.js'), 'utf8'),
    /href: 'usage-statistics\.html'.*onlyUserEmails: \['apalmer@adobe\.com'\]/);
});
