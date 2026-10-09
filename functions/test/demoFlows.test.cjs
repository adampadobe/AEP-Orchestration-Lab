'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const base = require('../demoAssetsService');
const flows = require('../demoFlowsService');
const { registerDemoAssetsRoutes } = require('../demoAssetsRoutes');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed || {}));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split('/').at(-1),
    path,
    collection: (name) => collection(`${path}/${name}`),
    async get() {
      const d = store.get(path);
      return { id: this.id, ref: this, exists: !!d, data: () => d || {} };
    },
    async set(d) { store.set(path, { ...d }); },
    async update(d) { store.set(path, { ...store.get(path), ...d }); },
    async delete() { store.delete(path); },
  });
  const collection = (name, filter = () => true, sort = null, limit = Infinity, after = '') => ({
    doc: (id) => docRef(`${name}/${id || `auto${String(++auto).padStart(4, '0')}`}`),
    where: (field, _op, value) => collection(name, (data) => filter(data) && data[field] === value, sort, limit, after),
    orderBy: (field, direction) => collection(name, filter, { field, direction }, limit, after),
    limit: (count) => collection(name, filter, sort, count, after),
    startAfter: (doc) => collection(name, filter, sort, limit, doc.ref.path),
    async get() {
      let entries = [...store.entries()].filter(([path, data]) => path.slice(0, path.lastIndexOf('/')) === name && filter(data));
      if (sort) entries.sort((a, b) => {
        const av = a[1][sort.field]?.toMillis ? a[1][sort.field].toMillis() : a[1][sort.field];
        const bv = b[1][sort.field]?.toMillis ? b[1][sort.field].toMillis() : b[1][sort.field];
        const compare = typeof av === 'number' && typeof bv === 'number'
          ? av - bv : String(av).localeCompare(String(bv));
        return compare * (sort.direction === 'desc' ? -1 : 1);
      });
      if (after) entries = entries.slice(entries.findIndex(([path]) => path === after) + 1);
      const docs = entries.slice(0, limit).map(([path]) => {
        const ref = docRef(path);
        return { id: ref.id, ref, exists: true, data: () => store.get(path) || {} };
      });
      return { docs, empty: !docs.length };
    },
  });
  return {
    store,
    collection,
    getAll: (...refs) => Promise.all(refs.map((r) => r.get())),
  };
}

const user = { uid: 'u1', email: 'a@adobe.com', name: 'A' };
const ASSETS = {
  'demoAssets/assetAAA1': { title: 'BA channels', customer: 'British Airways', conversationType: 'Decisioning', outline: { headings: ['Intro', 'Channels'] } },
  'demoAssets/assetBBB2': { title: 'Apps architecture', customer: 'Adobe', conversationType: 'Architecture', outline: { headings: ['Overview'] } },
};

describe('demoFlows normalisation', () => {
  it('requires a title and cleans steps', () => {
    assert.throws(() => flows.normaliseFlowInput({ steps: [] }), /title is required/);
    const out = flows.normaliseFlowInput({
      title: '  Retail story ', conversationType: 'not-a-type',
      steps: [{ assetId: 'assetAAA1', talkTrack: 'Say hi', durationMin: '3.3' }],
    });
    assert.equal(out.title, 'Retail story');
    assert.equal(out.conversationType, '');
    assert.deepEqual(out.steps[0], {
      assetId: 'assetAAA1', versionId: null, currentVersionAtSave: null,
      title: '', talkTrack: 'Say hi', transition: '', durationMin: 3.5,
    });
  });

  it('rejects invalid ids and too many steps', () => {
    assert.throws(() => flows.normaliseFlowInput({ title: 't', steps: [{ assetId: '../x' }] }), /invalid asset id/);
    const many = Array.from({ length: flows.MAX_STEPS + 1 }, () => ({ assetId: 'assetAAA1' }));
    assert.throws(() => flows.normaliseFlowInput({ title: 't', steps: many }), /at most/);
  });

  it('partial updates only touch supplied fields', () => {
    assert.deepEqual(flows.normaliseFlowInput({ customer: 'Globex' }, { partial: true }), { customer: 'Globex' });
  });

  it('reads outline headings', () => {
    assert.deepEqual(flows.outlineLabels({ outline: { headings: ['A', 'B'] } }), ['A', 'B']);
    assert.deepEqual(flows.outlineLabels({ outline: null }), []);
  });
});

describe('demoFlows service with fake Firestore', () => {
  let original;
  let db;
  beforeEach(() => {
    original = base._internal.getDb;
    db = fakeDb(ASSETS);
    base._internal.getDb = () => db;
  });
  afterEach(() => { base._internal.getDb = original; });

  it('creates a flow and rejects unknown assets', async () => {
    await assert.rejects(
      flows.createFlow({ title: 'x', steps: [{ assetId: 'missing01' }] }, user),
      /Unknown asset/,
    );
    const flow = await flows.createFlow({
      title: 'BA flow', steps: [{ assetId: 'assetAAA1', durationMin: 4 }, { assetId: 'assetBBB2', durationMin: 2 }],
    }, user);
    assert.equal(flow.stepCount, 2);
    assert.equal(flow.totalMinutes, 6);
    assert.equal(flow.createdBy.email, 'a@adobe.com');
  });

  it('validates pins, records the current-version snapshot, and detects later changes', async () => {
    db.store.set('demoAssets/assetAAA1', { ...ASSETS['demoAssets/assetAAA1'], currentVersionId: 'versionAAA2' });
    db.store.set('demoAssets/assetAAA1/versions/versionAAA1', { createdAt: 1 });
    db.store.set('demoAssets/assetAAA1/versions/versionAAA2', { createdAt: 2 });
    const flow = await flows.createFlow({
      title: 'Pinned', steps: [{ assetId: 'assetAAA1', versionId: 'versionAAA1' }],
    }, user);
    assert.equal(flow.steps[0].versionId, 'versionAAA1');
    assert.equal(flow.steps[0].currentVersionAtSave, 'versionAAA2');
    await assert.rejects(flows.createFlow({
      title: 'Bad pin', steps: [{ assetId: 'assetAAA1', versionId: 'missing01' }],
    }, user), /Unknown version/);

    db.store.set('demoAssets/assetAAA1', { ...ASSETS['demoAssets/assetAAA1'], currentVersionId: 'versionAAA3' });
    db.store.set('demoAssets/assetAAA1/versions/versionAAA3', { createdAt: 3 });
    const check = await flows.checkFlow(flow.id);
    assert.equal(check.ready, true);
    assert.deepEqual(check.steps[0], {
      assetId: 'assetAAA1', versionId: 'versionAAA1', currentVersionId: 'versionAAA3', title: 'BA channels',
    });
    assert.equal(check.issues[0].severity, 'warning');
    assert.match(check.issues[0].message, /changed from versionAAA2 to versionAAA3/);
  });

  it('suggestFlow keeps only known, unique asset ids and reports omissions', async () => {
    let prompt = '';
    const callGemini = async (_sys, userPrompt, opts) => {
      prompt = userPrompt;
      assert.ok(opts.responseSchema);
      return JSON.stringify({
        title: 'Story', steps: [
          { assetId: 'assetBBB2', title: 'Arch', talkTrack: 'Start wide' },
          { assetId: 'invented99', title: 'Fake', talkTrack: 'x' },
          { assetId: 'assetBBB2', title: 'Dup', talkTrack: 'y' },
        ],
      });
    };
    const { suggestion } = await flows.suggestFlow(
      { assetIds: ['assetAAA1', 'assetBBB2'], goal: 'Airline CMO', customer: 'Emirates' }, user, { callGemini },
    );
    assert.match(prompt, /AUDIENCE CUSTOMER: Emirates/);
    assert.match(prompt, /Channels/);
    assert.deepEqual(suggestion.steps.map((s) => s.assetId), ['assetBBB2']);
    assert.deepEqual(suggestion.omitted, ['assetAAA1']);
  });

  it('reviews extracted content and preserves requested version pins and transitions', async () => {
    db.store.set('demoAssets/assetAAA1', { ...ASSETS['demoAssets/assetAAA1'], currentVersionId: 'versionAAA1' });
    db.store.set('demoAssets/assetAAA1/versions/versionAAA1', { createdAt: 1 });
    const originalLoad = base.loadSkeleton;
    base.loadSkeleton = async (id, versionId) => {
      assert.equal(id, 'assetAAA1');
      assert.equal(versionId, 'versionAAA1');
      return { skeleton: '<!doctype html><html><body><h1>Frequent flyer offers</h1><p>Relevant copy.</p></body></html>' };
    };
    try {
      let prompt = '';
      const { suggestion } = await flows.suggestFlow({
        goal: 'Connect eligibility to value',
        steps: [
          { assetId: 'assetAAA1', versionId: 'versionAAA1', title: 'Existing title', talkTrack: 'Keep this track' },
          { assetId: 'assetBBB2', title: 'Architecture' },
        ],
      }, user, {
        callGemini: async (_system, userPrompt) => {
          prompt = userPrompt;
          return JSON.stringify({
            title: 'Review',
            rationale: 'Start with audience needs, then explain the architecture.',
            reviewNotes: ['The transition needs a clear hand-off.'],
            steps: [
              { assetId: 'assetAAA1', title: 'Offers', talkTrack: 'Show the offer.', transition: 'Now explain the data path.' },
              { assetId: 'assetBBB2', title: 'Architecture', talkTrack: 'Show the components.' },
            ],
          });
        },
      });
      assert.match(prompt, /Frequent flyer offers/);
      assert.equal(suggestion.steps[0].versionId, 'versionAAA1');
      assert.equal(suggestion.steps[0].transition, 'Now explain the data path.');
      assert.match(suggestion.rationale, /audience needs/);
      assert.deepEqual(suggestion.reviewNotes, ['The transition needs a clear hand-off.']);
    } finally {
      base.loadSkeleton = originalLoad;
    }
  });

  it('rejects requests that select different versions of the same asset', async () => {
    await assert.rejects(flows.suggestFlow({
      steps: [
        { assetId: 'assetAAA1', versionId: 'versionAAA1' },
        { assetId: 'assetAAA1', versionId: 'versionAAA2' },
      ],
    }, user, { callGemini: async () => '{}' }), /multiple versions/);
  });

  it('paginates flows while preserving the legacy list shape', async () => {
    db.store.set('demoFlows/flow0001', { title: 'One', steps: [], updatedAt: 1 });
    db.store.set('demoFlows/flow0002', { title: 'Two', steps: [], updatedAt: 2 });
    db.store.set('demoFlows/flow0003', { title: 'Three', steps: [], updatedAt: 3 });
    const first = await flows.listFlows({ limit: 2 });
    assert.deepEqual(first.flows.map((flow) => flow.title), ['Three', 'Two']);
    assert.ok(first.nextCursor);
    const second = await flows.listFlows({ limit: 2, cursor: first.nextCursor });
    assert.deepEqual(second.flows.map((flow) => flow.title), ['One']);
    assert.equal(second.nextCursor, null);
    assert.ok(Array.isArray(await flows.listFlows()));
  });

  it('suggestFlow validates input and Gemini availability', async () => {
    await assert.rejects(flows.suggestFlow({ assetIds: ['assetAAA1'] }, user, {}), /not configured/);
    await assert.rejects(flows.suggestFlow({ assetIds: [] }, user, { callGemini: async () => '{}' }), /at least one/);
    await assert.rejects(
      flows.suggestFlow({ assetIds: ['assetAAA1'] }, user, { callGemini: async () => '{"title":"t","steps":[]}' }),
      /usable order/,
    );
  });

  it('presentFlow marks deleted assets instead of failing', async () => {
    db.store.set('demoAssets/assetAAA1', { ...ASSETS['demoAssets/assetAAA1'], currentVersionId: 'versionAAA1' });
    db.store.set('demoAssets/assetBBB2', { ...ASSETS['demoAssets/assetBBB2'], currentVersionId: 'versionBBB2' });
    const flow = await flows.createFlow({ title: 'P', steps: [{ assetId: 'assetAAA1' }, { assetId: 'assetBBB2' }] }, user);
    db.store.delete('demoAssets/assetBBB2');
    const origToken = base.createRenderToken;
    base.createRenderToken = async (id, _user, opts) => {
      assert.equal(opts.versionId, id === 'assetAAA1' ? 'versionAAA1' : 'versionBBB2');
      return { url: `/api/demo-assets/render/tok-${id}`, expiresAt: 'soon' };
    };
    try {
      const { flow: presented } = await flows.presentFlow(flow.id, user);
      assert.equal(presented.steps[0].renderUrl, '/api/demo-assets/render/tok-assetAAA1');
      assert.equal(presented.steps[0].versionId, 'versionAAA1');
      assert.equal(presented.steps[1].missing, true);
    } finally {
      base.createRenderToken = origToken;
    }
  });
});

describe('demoFlows routes', () => {
  function makeApi(flowsImpl) {
    const exportsObj = registerDemoAssetsRoutes({
      onRequest: (_opts, handler) => handler,
      fnOpts: {},
      setCors: () => {},
      verifyClaims: async () => ({ uid: 'u1', email: 'a@adobe.com' }),
      service: { assertAllowedUser: (c) => c },
      studio: {},
      flows: flowsImpl,
      callGemini: async () => '{}',
    });
    return Object.values(exportsObj)[0];
  }
  function call(api, method, url, body) {
    return new Promise((resolve) => {
      const res = {
        statusCode: 200,
        headers: {},
        set(k, v) { this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        json(d) { resolve({ status: this.statusCode, body: d }); },
        send(d) { resolve({ status: this.statusCode, body: d }); },
      };
      api({
        method, originalUrl: url, body: body || {},
        query: Object.fromEntries(new URL(url, 'https://lab.example').searchParams),
      }, res);
    });
  }

  it('dispatches flow routes', async () => {
    const seen = [];
    const api = makeApi({
      listFlows: async () => { seen.push('list'); return []; },
      createFlow: async (b) => { seen.push(['create', b.title]); return { id: 'f1' }; },
      suggestFlow: async (_b, _u, d) => { seen.push(['suggest', typeof d.callGemini]); return { suggestion: {} }; },
      getFlow: async (id) => { seen.push(['get', id]); return { id }; },
      updateFlow: async (id) => { seen.push(['patch', id]); return { id }; },
      deleteFlow: async (id) => { seen.push(['delete', id]); return { ok: true }; },
      checkFlow: async (id) => { seen.push(['check', id]); return { ready: true, issues: [], steps: [] }; },
      presentFlow: async (id) => { seen.push(['present', id]); return { flow: { id } }; },
    });
    assert.equal((await call(api, 'GET', '/api/demo-assets/flows')).status, 200);
    assert.equal((await call(api, 'POST', '/api/demo-assets/flows', { title: 'T' })).status, 201);
    await call(api, 'POST', '/demoAssetsApi/flows/suggest', {});
    await call(api, 'GET', '/api/demo-assets/flows/flow0001');
    await call(api, 'PATCH', '/api/demo-assets/flows/flow0001');
    await call(api, 'DELETE', '/api/demo-assets/flows/flow0001');
    const check = await call(api, 'GET', '/api/demo-assets/flows/flow0001/check');
    assert.equal(check.body.check.ready, true);
    const p = await call(api, 'POST', '/api/demo-assets/flows/flow0001/present');
    assert.equal(p.body.flow.id, 'flow0001');
    assert.equal((await call(api, 'PUT', '/api/demo-assets/flows/flow0001')).status, 404);
    assert.deepEqual(seen, [
      'list', ['create', 'T'], ['suggest', 'function'], ['get', 'flow0001'],
      ['patch', 'flow0001'], ['delete', 'flow0001'], ['check', 'flow0001'], ['present', 'flow0001'],
    ]);
  });

  it('routes paged flow listing', async () => {
    const api = makeApi({ listFlows: async (options) => {
      assert.deepEqual(options, { limit: '100', cursor: 'page2' });
      return { flows: [{ id: 'flow1' }], nextCursor: 'next' };
    } });
    const result = await call(api, 'GET', '/api/demo-assets/flows?limit=100&cursor=page2');
    assert.deepEqual(result.body, { ok: true, flows: [{ id: 'flow1' }], nextCursor: 'next' });
  });
});
