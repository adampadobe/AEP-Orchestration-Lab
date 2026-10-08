'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const base = require('../demoAssetsService');
const guardMod = require('../demoAssetsGuardService');
const { registerDemoAssetsRoutes } = require('../demoAssetsRoutes');

function fakeDb({ failWrites = false } = {}) {
  const store = new Map();
  let auto = 0;
  const docRef = (col, id) => ({
    id,
    path: `${col}/${id}`,
    async get() {
      const d = store.get(`${col}/${id}`);
      return { id, exists: !!d, data: () => d };
    },
    async set(d) {
      if (failWrites) throw new Error('write failed');
      store.set(`${col}/${id}`, { ...d });
    },
  });
  return {
    store,
    collection: (col) => ({
      doc: (id) => docRef(col, id || `auto${String(++auto).padStart(4, '0')}`),
    }),
    async runTransaction(fn) {
      const writes = [];
      const out = await fn({
        get: (ref) => ref.get(),
        set: (ref, d) => writes.push([ref, d]),
      });
      for (const [ref, d] of writes) await ref.set(d);
      return out;
    },
  };
}

const user = { uid: 'u1', email: 'A@Adobe.com', name: 'A' };
const fixedNow = () => new Date('2025-03-04T10:00:00Z');

describe('demoAssetsGuard budget', () => {
  it('counts calls per user per day and blocks at the limit', async () => {
    const db = fakeDb();
    const g = guardMod.createGuard({ getDb: () => db, now: fixedNow, limit: () => 3 });
    await g.consume(user, 'classify', 1);
    await g.consume(user, 'classify', 2);
    const usage = await g.getUsage(user);
    assert.deepEqual({ used: usage.used, limit: usage.limit, remaining: usage.remaining, day: usage.day }, { used: 3, limit: 3, remaining: 0, day: '20250304' });
    const doc = db.store.get('demoAssetUsage/20250304_a_adobe_com');
    assert.equal(doc.byKind.classify, 3);
    await assert.rejects(g.consume(user, 'classify', 1), (e) => e.status === 429 && e.code === 'BUDGET_EXCEEDED');
  });

  it('weights Pro calls more than Flash', () => {
    assert.equal(guardMod.callWeight({ model: 'gemini-2.5-pro' }), guardMod.PRO_WEIGHT);
    assert.equal(guardMod.callWeight({ model: 'gemini-2.5-flash' }), 1);
    assert.equal(guardMod.callWeight(undefined), 1);
  });

  it('budgetedGemini charges before calling and never calls once spent', async () => {
    const db = fakeDb();
    const g = guardMod.createGuard({ getDb: () => db, now: fixedNow, limit: () => 5 });
    let calls = 0;
    const gem = g.budgetedGemini(async () => { calls += 1; return 'ok'; }, user, 'studio.chat');
    assert.equal(await gem('s', 'p', { model: 'gemini-2.5-pro' }), 'ok');
    assert.equal(await gem('s', 'p', {}), 'ok');
    await assert.rejects(gem('s', 'p', { model: 'gemini-2.5-pro' }), /Daily Gemini budget/);
    assert.equal(calls, 2);
  });
});

describe('demoAssetsGuard audit', () => {
  it('records entries and lists them filtered by asset', async () => {
    const db = fakeDb();
    const g = guardMod.createGuard({ getDb: () => db, now: fixedNow });
    await g.audit(user, 'asset.update', { assetId: 'assetAAA1', fields: ['title'] });
    const entries = [...db.store.entries()].filter(([k]) => k.startsWith('demoAssetAudit/'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0][1].action, 'asset.update');
    assert.equal(entries[0][1].assetId, 'assetAAA1');
    assert.deepEqual(entries[0][1].detail, { fields: ['title'] });
    await assert.rejects(g.listAudit({ assetId: '../bad' }), /Invalid asset id/);
  });

  it('swallows audit write failures', async () => {
    const g = guardMod.createGuard({ getDb: () => fakeDb({ failWrites: true }), now: fixedNow });
    const orig = console.error;
    console.error = () => {};
    try {
      await assert.doesNotReject(g.audit(user, 'asset.delete', { assetId: 'assetAAA1' }));
    } finally {
      console.error = orig;
    }
  });
});

describe('near-duplicate SimHash', () => {
  const words = 'customer journey decisioning offers channels email push web app loyalty tier rewards experience platform audience segment real time profile identity consent'.split(' ');
  const deck = (brand, n = 400) => {
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(words[(i * 7 + (i >> 3)) % words.length]);
    return `<html><head><title>${brand} demo</title></head><body><h1>${brand}</h1><p>${out.join(' ')}</p></body></html>`;
  };

  it('fingerprints rebrands close together and different decks far apart', () => {
    const a = base.computeSimHash(deck('British Airways'));
    const b = base.computeSimHash(deck('Lufthansa'));
    const other = 'retail basket checkout inventory store pickup returns warehouse shipping courier tracking parcel'.split(' ');
    let c = '';
    for (let i = 0; i < 400; i += 1) c += `${other[(i * 5 + (i >> 2)) % other.length]} `;
    const d = base.computeSimHash(`<html><body>${c}</body></html>`);
    assert.match(a, /^[a-f0-9]{16}$/);
    assert.ok(base.simHashDistance(a, b) <= base.SIMILAR_MAX_DISTANCE, `rebrand distance ${base.simHashDistance(a, b)}`);
    assert.ok(base.simHashDistance(a, d) > base.SIMILAR_MAX_DISTANCE, `different distance ${base.simHashDistance(a, d)}`);
  });

  it('ignores short documents and malformed hashes', () => {
    assert.equal(base.computeSimHash('<p>hi</p>'), '');
    assert.equal(base.simHashDistance('xyz', '0000000000000000'), null);
    assert.equal(base.simHashDistance('0000000000000000', '000000000000000f'), 4);
  });

  it('findSimilarAssets ranks by distance and skips self / missing hashes', () => {
    const h = '0000000000000000';
    const out = base.findSimilarAssets(h, [
      { id: 'self', simHash: h },
      { id: 'near', title: 'Near', simHash: '0000000000000001' },
      { id: 'mid', title: 'Mid', simHash: '00000000000000ff' },
      { id: 'far', simHash: 'ffffffffffffffff' },
      { id: 'old' },
    ], { excludeId: 'self' });
    assert.deepEqual(out.map((x) => [x.id, x.distance]), [['near', 1], ['mid', 8]]);
    assert.equal(out[0].score, 0.98);
  });
});

describe('guard route wiring', () => {
  function harness(guard) {
    let handler;
    const exportsObj = registerDemoAssetsRoutes({
      onRequest: (_opts, fn) => { handler = fn; return fn; },
      fnOpts: {},
      setCors: () => {},
      verifyClaims: async () => ({ uid: 'u1', email: 'a@adobe.com', name: 'A' }),
      service: { assertAllowedUser: (c) => c },
      studio: {},
      flows: {},
      guard,
      callGemini: async () => '',
    });
    assert.ok(exportsObj);
    return async (method, path, query) => {
      const res = {
        statusCode: 200, body: null, headers: {},
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        set(k, v) { this.headers[k] = v; return this; },
        setHeader(k, v) { this.headers[k] = v; },
        send(b) { this.body = b; return this; },
        end() { return this; },
      };
      await handler({ method, path, url: path, query: query || {}, headers: { authorization: 'Bearer x' }, body: {} }, res);
      return res;
    };
  }

  it('serves usage and audit', async () => {
    const call = harness({
      getUsage: async () => ({ used: 2, limit: 80 }),
      listAudit: async (q) => [{ id: 'x', q }],
    });
    const u = await call('GET', '/api/demo-assets/usage');
    assert.equal(u.statusCode, 200);
    assert.deepEqual(u.body.usage, { used: 2, limit: 80 });
    const a = await call('GET', '/api/demo-assets/audit', { assetId: 'assetAAA1', limit: '5' });
    assert.equal(a.body.entries[0].q.assetId, 'assetAAA1');
    const bad = await call('POST', '/api/demo-assets/usage');
    assert.equal(bad.statusCode, 405);
  });
});
