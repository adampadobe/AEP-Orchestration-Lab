'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  ROUTES, NOTICE, telemetryEnabled, requireTelemetryUser, validateEvent, collectEvent,
  readTelemetry, summarizeTelemetry,
} = require('../labUsageTelemetry');
const { registerLabUsageRoutes } = require('../labUsageRoutes');

const now = new Date('2026-10-06T09:00:00.000Z');
const claims = { uid: 'fixture-uid', email: 'fixture@adobe.com',
  auth_time: now.getTime() / 1000, firebase: { sign_in_provider: 'password' } };
const event = (overrides = {}) => ({
  version: 1, id: randomUUID(), type: 'page_view', route: '/profile-viewer/profile.html',
  occurredAt: now.toISOString(), navigation: 'navigate', ...overrides,
});
const request = (body = event()) => ({
  method: 'POST', headers: { authorization: 'Bearer fixture-token', 'content-type': 'application/json' }, body,
});

function memoryDb() {
  const records = new Map();
  let tail = Promise.resolve();
  return {
    records,
    collection: (name) => ({ doc: (id) => ({ key: name + '/' + id }) }),
    runTransaction(fn) {
      const work = tail.then(async () => {
        const pending = [];
        const result = await fn({
          get: async (ref) => ({ exists: records.has(ref.key), data: () => records.get(ref.key) }),
          set: (ref, data) => pending.push([ref.key, data]),
          create: (ref, data) => {
            assert.equal(records.has(ref.key), false);
            pending.push([ref.key, data]);
          },
        });
        pending.forEach(([key, data]) => records.set(key, data));
        return result;
      });
      tail = work.then(() => undefined, () => undefined);
      return work;
    },
  };
}

test('collection is off by default and configured only by the exact server flag', () => {
  const prior = process.env.LAB_USAGE_TELEMETRY_ENABLED;
  try {
    for (const value of [undefined, '', 'false', 'TRUE', '1']) {
      if (value === undefined) delete process.env.LAB_USAGE_TELEMETRY_ENABLED;
      else process.env.LAB_USAGE_TELEMETRY_ENABLED = value;
      assert.equal(telemetryEnabled(), false);
    }
    process.env.LAB_USAGE_TELEMETRY_ENABLED = 'true';
    assert.equal(telemetryEnabled(), true);
  } finally {
    if (prior === undefined) delete process.env.LAB_USAGE_TELEMETRY_ENABLED;
    else process.env.LAB_USAGE_TELEMETRY_ENABLED = prior;
  }
});

test('telemetry identity is derived from a revocation-checked non-anonymous Firebase token', async () => {
  const auth = { verifyIdToken: async (token, revoked) => {
    assert.equal(token, 'fixture-token');
    assert.equal(revoked, true);
    return claims;
  } };
  assert.deepEqual(await requireTelemetryUser(request(), auth), claims);
  for (const headers of [{}, { authorization: 'Bearer fixture-token extra' }, { authorization: 'Basic fixture' }]) {
    await assert.rejects(requireTelemetryUser({ headers }, auth), { status: 401 });
  }
  for (const record of [{ ...claims, email: '' }, { ...claims, firebase: { sign_in_provider: 'anonymous' } }]) {
    await assert.rejects(requireTelemetryUser(request(), { verifyIdToken: async () => record }), { status: 403 });
  }
  for (const code of ['auth/id-token-revoked', 'auth/id-token-expired', 'auth/user-disabled']) {
    await assert.rejects(requireTelemetryUser(request(), { verifyIdToken: async () => {
      throw Object.assign(new Error('invalid'), { code });
    } }), { status: 401 });
  }
  await assert.rejects(requireTelemetryUser(request(), { verifyIdToken: async () => {
    throw Object.assign(new Error('offline'), { code: 'auth/internal-error' });
  } }), { code: 'auth/internal-error' });
});

test('payload is strictly allowlisted and bounded, excludes identifiers and binds login to recent auth', () => {
  assert.equal(validateEvent(event(), claims, now).route, '/profile-viewer/profile.html');
  for (const body of [
    null, [], event({ uid: 'someone-else' }), event({ email: 'profile@example.test' }),
    event({ referrer: 'sensitive' }), event({ route: '/profile-viewer/profile.html?identifier=secret' }),
    event({ route: '/profile-viewer/experimentation-overview.html' }),
    event({ route: '/profile-viewer/demos/secret.html' }), event({ version: 3 }),
    event({ type: 'heartbeat' }), event({ id: 'a/b' }), event({ navigation: 'unknown' }),
    event({ occurredAt: 'bad-date' }), event({ occurredAt: new Date(now.getTime() - 300001).toISOString() }),
    event({ occurredAt: new Date(now.getTime() + 300001).toISOString() }),
    event({ id: 'x'.repeat(2000) }),
  ]) assert.throws(() => validateEvent(body, claims, now), { status: 400 });
  const login = event({ type: 'sign_in', navigation: undefined });
  assert.equal(validateEvent(login, claims, now).type, 'sign_in');
  for (const token of [{ ...claims, auth_time: undefined }, { ...claims, auth_time: claims.auth_time - 3600 }]) {
    assert.throws(() => validateEvent(login, token, now), { status: 400 });
  }
  assert.throws(() => validateEvent(event({ type: 'sign_in' }), claims, now), { status: 400 });
});

test('transactions dedupe concurrent retries, isolate actors, reject conflicting IDs and never persist raw PII', async () => {
  const db = memoryDb();
  const body = event();
  const results = await Promise.all(Array.from({ length: 8 }, () => collectEvent({ db, body, claims, now })));
  assert.equal(results.filter((result) => !result.duplicate).length, 1);
  assert.equal(db.records.size, 2);
  const stored = [...db.records].find(([key]) => key.startsWith('labUsageEvents/'))[1];
  assert.equal(stored.uid, claims.uid);
  assert.equal(stored.timestamp, now.toISOString());
  assert.equal(stored.expiresAt.getTime(), now.getTime() + 90 * 86400000);
  assert.equal(JSON.stringify(stored).includes(claims.email), false);
  assert.equal(JSON.stringify(stored).includes(body.id), false);
  await assert.rejects(collectEvent({ db, claims, now, body: { ...body, route: ROUTES[0] } }), { status: 409 });
  await collectEvent({ db, claims: { ...claims, uid: 'second-fixture' }, body, now });
  assert.equal(db.records.size, 4);
});

test('rate limit is per actor across instances and retries do not consume quota', async () => {
  const db = memoryDb();
  let last;
  for (let index = 0; index < 60; index += 1) {
    last = event();
    await collectEvent({ db, claims, body: last, now });
  }
  assert.equal((await collectEvent({ db, claims, body: last, now })).duplicate, true);
  await assert.rejects(collectEvent({ db, claims, body: event(), now }), { status: 429 });
  await collectEvent({ db, claims: { ...claims, uid: 'other' }, body: event(), now });
  const later = new Date(now.getTime() + 60000);
  await collectEvent({ db, claims, body: event({ occurredAt: later.toISOString() }), now: later });
});

test('website reporting excludes expiry/future/invalid records and attributes only current directory UIDs', () => {
  const record = { uid: claims.uid, type: 'page_view', route: ROUTES[0], timestamp: now.toISOString(),
    expiresAt: new Date(now.getTime() + 86400000), navigation: 'reload' };
  const summary = summarizeTelemetry({
    records: [
      record, { ...record, type: 'sign_in' }, { ...record, uid: 'deleted-uid' },
      { ...record, expiresAt: now }, { ...record, expiresAt: undefined },
      { ...record, timestamp: new Date(now.getTime() + 1).toISOString() },
      { ...record, timestamp: '2026-01-01T00:00:00Z' },
      { ...record, route: '/private/identifier' },
    ], users: [{ uid: claims.uid }], now, days: 7, truncated: true, enabled: false,
  });
  assert.deepEqual(summary.summary, { pageViews: 2, signIns: 1, activeUsers: 1, unattributedEvents: 1 });
  assert.equal(summary.users[0].pageViews, 1);
  assert.equal(summary.users[0].signIns, 1);
  assert.deepEqual(summary.users[0].pages, [{ route: ROUTES[0], views: 1 }]);
  assert.equal(summary.pages[0].users, 1);
  assert.equal(summary.pages[0].reloads, 2);
  assert.equal(summary.hours[2][9], 3);
  assert.equal(summary.truncated, true);
  assert.equal(JSON.stringify(summary).includes('deleted-uid'), false);
  assert.equal(summary.enabled, false);
});

test('read query is receipt-time ordered and projects only safe fields with a sentinel cap', async () => {
  const query = {
    where(field, op, time) { assert.equal(field, 'timestamp'); assert.ok(['>=', '<='].includes(op)); assert.ok(Date.parse(time)); return this; },
    orderBy(field, dir) { assert.equal(field, 'timestamp'); assert.equal(dir, 'desc'); return this; },
    select(...fields) { assert.deepEqual(fields, ['uid', 'type', 'route', 'timestamp', 'expiresAt', 'navigation', 'occurredAt', 'activeMs']); return this; },
    limit(limit) { assert.equal(limit, 5001); return this; },
    async get() { return { docs: Array.from({ length: 5001 }, () => ({ data: () => ({}) })) }; },
  };
  const result = await readTelemetry({ db: { collection(name) { assert.equal(name, 'labUsageEvents'); return query; } }, now, days: 7 });
  assert.equal(result.records.length, 5000);
  assert.equal(result.truncated, true);
});

function harness({ enabled = true, access = 'approved', fail = false, tokenClaims = claims } = {}) {
  const db = memoryDb();
  const logs = [];
  let reads = 0;
  const { labUsageEvents } = registerLabUsageRoutes({
    onRequest: (_, handler) => handler, CONSENT_STORE_FN_OPTS: {}, setCors() {},
    isTelemetryEnabled: () => enabled, logger: { error: (...args) => logs.push(args) },
    getServices() {
      reads += 1;
      if (fail) throw new Error('private infrastructure detail');
      return { db, auth: { verifyIdToken: async () => tokenClaims }, getAccessStatus: async () => ({ status: access }) };
    },
  });
  return { db, logs, get reads() { return reads; }, async run(req) {
    const res = {
      headers: {}, statusCode: 200,
      set(key, val) { this.headers[key] = val; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
      send(body) { this.body = body; return this; },
    };
    await labUsageEvents(req, res);
    return res;
  } };
}

test('event endpoint exposes notice/config without data and enforces gate, methods, content and identity', async () => {
  const off = harness({ enabled: false });
  const config = await off.run({ method: 'GET' });
  assert.equal(config.body.enabled, false);
  assert.equal(config.body.notice, NOTICE);
  assert.equal(config.headers['Cache-Control'], 'private, no-store');
  assert.equal((await off.run(request())).statusCode, 403);
  assert.equal(off.reads, 0);
  const on = harness();
  assert.equal((await on.run({ method: 'OPTIONS' })).statusCode, 204);
  assert.equal((await on.run({ method: 'DELETE' })).statusCode, 405);
  assert.equal((await on.run({ ...request(), headers: {} })).statusCode, 415);
  assert.equal((await on.run({ ...request(), rawBody: Buffer.alloc(1025) })).statusCode, 413);
  assert.equal((await on.run({ ...request(), headers: { 'content-type': 'application/json' } })).statusCode, 401);
  assert.equal((await harness({ access: 'pending' }).run(request())).statusCode, 403);
  assert.equal((await harness({ tokenClaims: { ...claims, firebase: { sign_in_provider: 'anonymous' } } }).run(request())).statusCode, 403);
  const unavailable = harness({ fail: true });
  const res = await unavailable.run(request());
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.error.includes('private'), false);
  assert.equal(unavailable.logs.length, 1);
});

test('event endpoint accepts safe events, deduplicates retries and signals rate limits', async () => {
  const on = harness();
  const body = event({ occurredAt: new Date().toISOString() });
  assert.equal((await on.run(request(body))).statusCode, 200);
  assert.equal((await on.run(request(body))).body.duplicate, true);
  assert.equal((await on.run(request({ ...body, route: ROUTES[0] }))).statusCode, 409);
  for (let index = 1; index < 60; index += 1) {
    assert.equal((await on.run(request(event({ occurredAt: new Date().toISOString() })))).statusCode, 200);
  }
  const limited = await on.run(request(event({ occurredAt: new Date().toISOString() })));
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '60');
});

test('route inventory exists, excludes redirects/embedded/SPA routes and is wired to shared collector', () => {
  const root = path.resolve(__dirname, '../..');
  for (const route of ROUTES) {
    const html = fs.readFileSync(path.join(root, 'web' + route), 'utf8');
    assert.match(html, /aep-lab-nav\.js/);
    assert.match(html, /firebase-auth-compat\.js/);
    assert.doesNotMatch(html, /http-equiv=["']refresh["']/i);
  }
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const hosting = Array.isArray(config.hosting) ? config.hosting : [config.hosting];
  const rewrite = hosting.flatMap((host) => host.rewrites || []).find((entry) => entry.source === '/api/lab/usage/events');
  assert.deepEqual(rewrite.function, { functionId: 'labUsageEvents', region: 'us-central1' });
  assert.match(fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8'), /LAB_USAGE_TELEMETRY_ENABLED: 'false'/);
  assert.match(fs.readFileSync(path.join(root, 'web/profile-viewer/aep-lab-nav.js'), 'utf8'), /aep-lab-usage-telemetry\.js/);
});
