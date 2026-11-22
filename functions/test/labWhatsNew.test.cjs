'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REPO, COLLECTION, DOC_ID, sanitizePull, fetchOpenPulls, refreshInProgress, registerWhatsNewRoutes,
} = require('../labWhatsNew');

const now = new Date('2026-10-06T09:00:00.000Z');
const pull = (number, extra = {}) => ({
  number, title: `PR ${number}`, html_url: `https://github.com/${REPO}/pull/${number}`,
  user: { login: 'kirkside-bit', id: 1, email: 'private@example.com' }, updated_at: '2026-10-06T08:00:00Z',
  draft: false, labels: [{ name: 'home', color: 'fff' }], body: 'secret body', head: { ref: 'branch' }, ...extra,
});

function memoryStore(seed = null) {
  const docs = new Map(seed ? [[`${COLLECTION}/${DOC_ID}`, seed]] : []);
  return {
    docs,
    collection: (name) => ({ doc: (id) => ({
      get: async () => ({ data: () => docs.get(`${name}/${id}`) }),
      set: async (value, opts) => docs.set(`${name}/${id}`, opts?.merge ? { ...docs.get(`${name}/${id}`), ...value } : value),
    }) }),
  };
}

const okFetch = (body) => async (url, init) => {
  assert.match(url, /^https:\/\/api\.github\.com\/repos\/adampadobe\/AEP-Orchestration-Lab\/pulls\?state=open/);
  assert.equal(init.headers.Authorization, undefined);
  return { ok: true, status: 200, json: async () => body };
};

test('only whitelisted pull request fields are kept', () => {
  assert.deepEqual(sanitizePull(pull(7, { draft: true, html_url: 'https://evil.example/x' })), {
    title: 'PR 7', number: 7, url: `https://github.com/${REPO}/pull/7`, author: 'kirkside-bit',
    updatedAt: '2026-10-06T08:00:00Z', draft: true, labels: ['home'],
  });
  assert.equal(sanitizePull({ title: 'x' }), null);
});

test('fetch maps the GitHub list and surfaces HTTP failures with a code', async () => {
  assert.deepEqual((await fetchOpenPulls({ fetchImpl: okFetch([pull(1), { bogus: true }]) })).map((p) => p.number), [1]);
  await assert.rejects(fetchOpenPulls({ fetchImpl: async () => ({ ok: false, status: 403 }) }), { code: 'github-http-403' });
  await assert.rejects(fetchOpenPulls({ fetchImpl: okFetch({ message: 'x' }) }), { code: 'github-invalid' });
});

test('refresh caches results and keeps the previous items when GitHub fails', async () => {
  const db = memoryStore();
  await refreshInProgress({ db, fetchImpl: okFetch([pull(2)]), now });
  const cached = db.docs.get(`${COLLECTION}/${DOC_ID}`);
  assert.equal(cached.fetchedAt, now.toISOString());
  assert.equal(JSON.stringify(cached).includes('secret'), false);
  const later = new Date(now.getTime() + 60000);
  await assert.rejects(refreshInProgress({ db, fetchImpl: async () => ({ ok: false, status: 500 }), now: later, logger: { error() {} } }));
  const after = db.docs.get(`${COLLECTION}/${DOC_ID}`);
  assert.equal(after.items.length, 1);
  assert.equal(after.fetchedAt, now.toISOString());
  assert.equal(after.lastError, 'github-http-500');
});

function call(handler, req = {}) {
  const res = {
    headers: {}, statusCode: 200,
    set(k, v) { this.headers[k] = v; return this; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    send(b) { this.body = b; return this; },
  };
  return Promise.resolve(handler({ method: 'GET', headers: {}, ...req }, res)).then(() => res);
}

test('in-progress endpoint serves the cache, flags staleness and refreshes a cold cache once', async () => {
  const stale = { items: [{ ...sanitizePull(pull(3)), extra: 'drop' }], fetchedAt: new Date(now.getTime() - 2 * 3600000).toISOString() };
  const routes = registerWhatsNewRoutes({ onRequest: (_, h) => h, setCors() {}, getDb: () => memoryStore(stale), now: () => now });
  const res = await call(routes.labWhatsNewInProgress);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.stale, true);
  assert.deepEqual(Object.keys(res.body.items[0]).sort(), ['author', 'draft', 'labels', 'number', 'title', 'updatedAt', 'url']);
  assert.equal((await call(routes.labWhatsNewInProgress, { method: 'POST' })).statusCode, 405);

  let fetches = 0;
  const cold = registerWhatsNewRoutes({
    onRequest: (_, h) => h, setCors() {}, getDb: () => memoryStore(), now: () => now,
    fetchImpl: async (...args) => { fetches += 1; return okFetch([pull(4)])(...args); },
  });
  const fresh = await call(cold.labWhatsNewInProgress);
  assert.equal(fresh.body.stale, false);
  assert.deepEqual(fresh.body.items.map((p) => p.number), [4]);
  assert.equal(fetches, 1);

  const down = registerWhatsNewRoutes({
    onRequest: (_, h) => h, setCors() {}, getDb: () => memoryStore(), now: () => now,
    fetchImpl: async () => ({ ok: false, status: 403 }), logger: { error() {} },
  });
  assert.equal((await call(down.labWhatsNewInProgress)).statusCode, 503);
});
