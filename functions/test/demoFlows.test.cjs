'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const base = require('../demoAssetsService');
const flows = require('../demoFlowsService');
const { registerDemoAssetsRoutes } = require('../demoAssetsRoutes');

function fakeDb(seed) {
  const store = new Map(Object.entries(seed || {}));
  let auto = 0;
  const docRef = (col, id) => ({
    id,
    async get() {
      const d = store.get(`${col}/${id}`);
      return { id, exists: !!d, data: () => d };
    },
    async set(d) { store.set(`${col}/${id}`, { ...d }); },
    async update(d) { store.set(`${col}/${id}`, { ...store.get(`${col}/${id}`), ...d }); },
    async delete() { store.delete(`${col}/${id}`); },
  });
  return {
    store,
    collection: (col) => ({
      doc: (id) => docRef(col, id || `auto${String(++auto).padStart(4, '0')}`),
    }),
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
    assert.deepEqual(out.steps[0], { assetId: 'assetAAA1', versionId: null, title: '', talkTrack: 'Say hi', durationMin: 3.5 });
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

  it('suggestFlow validates input and Gemini availability', async () => {
    await assert.rejects(flows.suggestFlow({ assetIds: ['assetAAA1'] }, user, {}), /not configured/);
    await assert.rejects(flows.suggestFlow({ assetIds: [] }, user, { callGemini: async () => '{}' }), /at least one/);
    await assert.rejects(
      flows.suggestFlow({ assetIds: ['assetAAA1'] }, user, { callGemini: async () => '{"title":"t","steps":[]}' }),
      /usable order/,
    );
  });

  it('presentFlow marks deleted assets instead of failing', async () => {
    const flow = await flows.createFlow({ title: 'P', steps: [{ assetId: 'assetAAA1' }, { assetId: 'assetBBB2' }] }, user);
    db.store.delete('demoAssets/assetBBB2');
    const origToken = base.createRenderToken;
    base.createRenderToken = async (id) => ({ url: `/api/demo-assets/render/tok-${id}`, expiresAt: 'soon' });
    try {
      const { flow: presented } = await flows.presentFlow(flow.id, user);
      assert.equal(presented.steps[0].renderUrl, '/api/demo-assets/render/tok-assetAAA1');
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
      api({ method, originalUrl: url, body: body || {} }, res);
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
      presentFlow: async (id) => { seen.push(['present', id]); return { flow: { id } }; },
    });
    assert.equal((await call(api, 'GET', '/api/demo-assets/flows')).status, 200);
    assert.equal((await call(api, 'POST', '/api/demo-assets/flows', { title: 'T' })).status, 201);
    await call(api, 'POST', '/demoAssetsApi/flows/suggest', {});
    await call(api, 'GET', '/api/demo-assets/flows/flow0001');
    await call(api, 'PATCH', '/api/demo-assets/flows/flow0001');
    await call(api, 'DELETE', '/api/demo-assets/flows/flow0001');
    const p = await call(api, 'POST', '/api/demo-assets/flows/flow0001/present');
    assert.equal(p.body.flow.id, 'flow0001');
    assert.equal((await call(api, 'PUT', '/api/demo-assets/flows/flow0001')).status, 404);
    assert.deepEqual(seen, [
      'list', ['create', 'T'], ['suggest', 'function'], ['get', 'flow0001'],
      ['patch', 'flow0001'], ['delete', 'flow0001'], ['present', 'flow0001'],
    ]);
  });
});
