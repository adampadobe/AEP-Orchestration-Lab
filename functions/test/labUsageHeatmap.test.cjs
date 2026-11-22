'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROUTES, CATALOGUE } = require('../labUsageTelemetry');
const {
  MIN_VIEWS, actorDigest, usersBucket, rollupDay, runRollup, readHeatmap, COLLECTION,
} = require('../labUsageHeatmap');
const { registerLabUsageRoutes } = require('../labUsageRoutes');

const now = new Date('2026-10-06T09:00:00.000Z');
const DAY = 86400000;
const future = new Date(now.getTime() + 30 * DAY);
const [routeA, routeB] = ROUTES;

/** Minimal Firestore fake supporting the where/orderBy/select/limit/startAfter queries used here. */
function fakeDb(seed = {}) {
  const data = new Map(Object.entries(seed).map(([name, docs]) => [name, new Map(Object.entries(docs))]));
  const ops = { range: 0 };
  function query(name, filters = [], order = null, max = Infinity, after = null) {
    return {
      where: (field, op, value) => query(name, [...filters, [field, op, value]], order, max, after),
      orderBy: (field) => query(name, filters, field, max, after),
      select: () => query(name, filters, order, max, after),
      limit: (n) => query(name, filters, order, n, after),
      startAfter: (doc) => query(name, filters, order, max, doc),
      doc: (id) => ({
        set: async (value) => {
          if (!data.has(name)) data.set(name, new Map());
          data.get(name).set(id, value);
        },
      }),
      async get() {
        ops.range += 1;
        let rows = [...(data.get(name) || new Map()).entries()].map(([id, value]) => ({ id, data: () => value }));
        rows = rows.filter((row) => filters.every(([field, op, value]) => {
          const actual = row.data()[field];
          return op === '>=' ? actual >= value : op === '<' ? actual < value : actual === value;
        }));
        if (order) rows.sort((a, b) => String(a.data()[order]).localeCompare(String(b.data()[order])) || a.id.localeCompare(b.id));
        if (after) rows = rows.slice(rows.findIndex((row) => row.id === after.id) + 1);
        return { docs: rows.slice(0, max) };
      },
    };
  }
  return { data, ops, collection: (name) => query(name) };
}

function events(list) {
  return Object.fromEntries(list.map((event, index) => [`e${index}`, {
    type: 'page_view', expiresAt: future, ...event,
  }]));
}

test('catalogue-driven allowlist covers every tracked nav page and stays strict', () => {
  assert.ok(ROUTES.length >= 30);
  for (const route of ROUTES) assert.match(route, /^\/profile-viewer\/[a-z0-9][a-z0-9/_-]*\.html$/);
  const tracked = CATALOGUE.pages.filter((page) => page.tracked).map((page) => page.route);
  assert.deepEqual([...ROUTES].sort(), [...new Set(tracked)].sort());
  assert.equal(new Set(ROUTES).size, ROUTES.length);
});

test('daily roll-up counts only live page views on allowlisted routes and stores no UIDs', async () => {
  const at = (h) => new Date(Date.UTC(2026, 9, 5, h)).toISOString();
  const db = fakeDb({ labUsageEvents: events([
    { uid: 'u1', route: routeA, timestamp: at(1) },
    { uid: 'u1', route: routeA, timestamp: at(2) },
    { uid: 'u2', route: routeA, timestamp: at(3) },
    { uid: 'u2', route: routeB, timestamp: at(4) },
    { uid: 'u3', route: routeA, timestamp: at(5), type: 'engagement' },
    { uid: 'u3', route: '/profile-viewer/not-allowed.html', timestamp: at(6) },
    { uid: 'u3', route: routeA, timestamp: at(7), expiresAt: new Date(now.getTime() - 1) },
    { uid: 'u3', route: routeA, timestamp: '2026-10-06T00:00:00.000Z' },
  ]) });
  const result = await rollupDay({ db, day: '2026-10-05', now });
  assert.deepEqual(result, { day: '2026-10-05', pageViews: 4, routes: 2 });
  const doc = db.data.get(COLLECTION).get('2026-10-05');
  assert.equal(doc.complete, true);
  assert.equal(doc.routes.find((r) => r.route === routeA).views, 3);
  assert.deepEqual(doc.routes.find((r) => r.route === routeA).actors, [actorDigest('u1'), actorDigest('u2')].sort());
  assert.equal(JSON.stringify(doc).includes('u1'), false);
  assert.equal(doc.expiresAt.getTime() > Date.parse('2026-10-05') + 90 * DAY, true);
});

test('hourly run refreshes today and yesterday and backfills a bounded number of missing days', async () => {
  const db = fakeDb({ [COLLECTION]: { '2026-10-04': { day: '2026-10-04', complete: true } } });
  const results = await runRollup({ db, now, logger: { log() {} } });
  const days = results.map((r) => r.day);
  assert.deepEqual(days.slice(0, 2), ['2026-10-06', '2026-10-05']);
  assert.equal(days.includes('2026-10-04'), false);
  assert.equal(days.length, 2 + 7);
  assert.equal(db.data.get(COLLECTION).get('2026-10-06').complete, false);
});

test('heat map returns thresholded aggregates, unique-user buckets and trend only', async () => {
  const day = (offset) => new Date(now.getTime() - offset * DAY).toISOString().slice(0, 10);
  const actors = (n, prefix = 'a') => Array.from({ length: n }, (_, i) => actorDigest(prefix + i));
  const db = fakeDb({ [COLLECTION]: {
    [day(0)]: { day: day(0), computedAt: now.toISOString(), routes: [{ route: routeA, views: 8, actors: actors(6) }, { route: routeB, views: MIN_VIEWS - 1, actors: actors(2) }] },
    [day(3)]: { day: day(3), computedAt: now.toISOString(), routes: [{ route: routeA, views: 4, actors: actors(3) }, { route: '/profile-viewer/evil.html', views: 99, actors: [] }] },
    [day(9)]: { day: day(9), routes: [{ route: routeA, views: 6, actors: actors(1, 'b') }] },
    [day(20)]: { day: day(20), routes: [{ route: routeA, views: 50, actors: [] }] },
  } });
  const heat = await readHeatmap({ db, window: '7d', now });
  assert.equal(heat.from, day(6));
  assert.equal(heat.to, day(0));
  assert.equal(heat.belowThreshold, 1);
  assert.equal(heat.daysWithData, 2);
  assert.equal(heat.items.length, 1);
  const page = CATALOGUE.pages.find((p) => p.route === routeA);
  assert.deepEqual(heat.items[0], {
    route: routeA, navGroup: page.navGroup, label: page.label, views: 12, uniqueUsersBucket: '5-9', trendPct: 100,
  });
  assert.doesNotMatch(JSON.stringify(heat), /actor|uid|email|[0-9a-f]{16}/i);
  await assert.rejects(readHeatmap({ db, window: '90d', now }), { status: 400 });
  assert.deepEqual([0, 4, 5, 9, 10, 24, 25, 49, 50].map(usersBucket), ['<5', '<5', '5-9', '5-9', '10-24', '10-24', '25-49', '25-49', '50+']);
});

function heatmapHarness({ access = 'approved', tokenClaims = { uid: 'fixture', email: 'fixture@adobe.com', firebase: { sign_in_provider: 'password' } }, fail = false } = {}) {
  const db = fakeDb({ [COLLECTION]: {} });
  const logs = [];
  const { labUsageHeatmap } = registerLabUsageRoutes({
    onRequest: (_, handler) => handler, CONSENT_STORE_FN_OPTS: {}, setCors() {},
    isTelemetryEnabled: () => false, logger: { error: (...args) => logs.push(args) },
    getServices() {
      if (fail) throw new Error('private infrastructure detail');
      return { db, auth: { verifyIdToken: async () => tokenClaims }, getAccessStatus: async () => ({ status: access }) };
    },
  });
  return {
    db, logs,
    async run(req) {
      const res = {
        headers: {}, statusCode: 200,
        set(key, val) { this.headers[key] = val; return this; },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; },
      };
      await labUsageHeatmap({ method: 'GET', headers: { authorization: 'Bearer fixture-token' }, query: {}, ...req }, res);
      return res;
    },
  };
}

test('heat map endpoint requires an approved signed-in user, validates window and caches', async () => {
  const ok = heatmapHarness();
  const res = await ok.run({ query: { window: '30d' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.window, '30d');
  assert.equal(res.body.collectionEnabled, false);
  assert.deepEqual(res.body.items, []);
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
  const reads = ok.db.ops.range;
  await ok.run({ query: { window: '30d' } });
  assert.equal(ok.db.ops.range, reads);

  assert.equal((await ok.run({ query: { window: '1y' } })).statusCode, 400);
  assert.equal((await ok.run({ query: { window: ['7d'] } })).statusCode, 400);
  assert.equal((await ok.run({ method: 'POST' })).statusCode, 405);
  assert.equal((await ok.run({ headers: {} })).statusCode, 401);
  assert.equal((await heatmapHarness({ access: 'pending' }).run({})).statusCode, 403);
  assert.equal((await heatmapHarness({ tokenClaims: { uid: 'x', email: '', firebase: { sign_in_provider: 'anonymous' } } }).run({})).statusCode, 403);
  const broken = heatmapHarness({ fail: true });
  const unavailable = await broken.run({});
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.error.includes('private'), false);
});

test('heat map and in-progress routes are wired in index.js and firebase.json', () => {
  const root = path.join(__dirname, '..', '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  const rewrites = (Array.isArray(config.hosting) ? config.hosting : [config.hosting]).flatMap((host) => host.rewrites || []);
  for (const [source, functionId] of [['/api/lab/usage/heatmap', 'labUsageHeatmap'], ['/api/lab/whats-new/in-progress', 'labWhatsNewInProgress']]) {
    const rewrite = rewrites.find((r) => r.source === source);
    assert.deepEqual(rewrite?.function, { functionId, region: 'us-central1' });
  }
  const index = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
  assert.match(index, /exports\.labUsageRollup = onSchedule\(\s*\{ schedule: 'every 60 minutes'/);
  assert.match(index, /exports\.labWhatsNewRefresh = onSchedule\(\s*\{ schedule: 'every 30 minutes'/);
});
