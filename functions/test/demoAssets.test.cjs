'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const firebaseConfig = require('../../firebase.json');
const firebaseProjectConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../../.firebaserc'), 'utf8'));
const service = require('../demoAssetsService');
const { registerDemoAssetsRoutes, parseRoute } = require('../demoAssetsRoutes');

function responseRecorder() {
  return {
    statusCode: 200, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    set(k, v) { if (typeof k === 'object') Object.assign(this.headers, k); else this.headers[k] = v; return this; },
  };
}

const ADOBE = { uid: 'u1', email: 'alan@adobe.com', name: 'Alan', isAnonymous: false };

function route(overrides = {}, claims = ADOBE, studio = {}) {
  const svc = { ...service, ...overrides };
  const { demoAssetsApi } = registerDemoAssetsRoutes({
    onRequest: (_opts, handler) => ({ __handler: handler }),
    fnOpts: {},
    setCors: () => {},
    verifyClaims: async () => claims,
    service: svc,
    studio,
    callGemini: null,
  });
  return async (method, url, body) => {
    const res = responseRecorder();
    await demoAssetsApi.__handler({ method, originalUrl: url, headers: {}, body }, res);
    return res;
  };
}

describe('demoAssetsService helpers', () => {
  it('extracts large data URIs and rehydrates byte-for-byte', () => {
    const big = Buffer.alloc(4000, 7).toString('base64');
    const small = 'data:image/png;base64,iVBORw0KGgo=';
    const html = `<img src="data:image/png;base64,${big}"><img src="${small}"><div style="background:url(data:image/png;base64,${big})"></div>`;
    const { skeleton, media } = service.extractMedia(html);
    assert.equal(media.length, 1);
    assert.ok(skeleton.includes(small));
    assert.equal(service.mediaHashesIn(skeleton).length, 1);
    const map = new Map(media.map((m) => [m.hash, m]));
    assert.equal(service.rehydrate(skeleton, map), html);
  });

  it('fails loudly when media is missing', () => {
    assert.throws(() => service.rehydrate(`__DEMO_MEDIA_${'a'.repeat(64)}__`, new Map()), /Missing media/);
  });

  it('extracts title and headings, ignoring scripts and styles', () => {
    const meta = service.extractMeta('<title>BA &amp; Decisioning</title><style>.x{}</style><body><h1>Channels</h1><script>var secret=1</script><p>Hello</p></body>');
    assert.equal(meta.title, 'BA & Decisioning');
    assert.deepEqual(meta.headings, [{ level: 1, text: 'Channels' }]);
    assert.ok(!meta.textExcerpt.includes('secret'));
  });

  it('classifies with Gemini output wrapped in code fences', async () => {
    const meta = service.extractMeta('<title>X</title>');
    const out = await service.classifyAsset(meta, { filename: 'x.html' }, {
      callGemini: async () => '```json\n{"title":"BA","customer":"British Airways","conversationType":"decisioning","summary":"s","tags":["AJO","ajo"]}\n```',
    });
    assert.equal(out.customer, 'British Airways');
    assert.equal(out.conversationType, 'Decisioning');
    assert.deepEqual(out.tags, ['ajo']);
  });

  it('falls back to heuristics when Gemini fails', async () => {
    const meta = service.extractMeta('<title>Apps architecture</title>');
    const out = await service.classifyAsset(meta, { filename: 'a.html', folderPath: 'Event Demos/LEAP' }, {
      callGemini: async () => { throw new Error('quota'); },
    });
    assert.equal(out.conversationType, 'Architecture');
    assert.equal(out.event, 'LEAP');
    assert.match(out.classifyError, /quota/);
  });

  it('rejects unknown patch fields and invalid status', () => {
    assert.throws(() => service.sanitisePatch({ sha256: 'x' }), /not editable/);
    assert.throws(() => service.sanitisePatch({ status: 'draft' }), /ready/);
    assert.throws(() => service.sanitisePatch({ title: '  ' }), /empty/);
    assert.deepEqual(service.sanitisePatch({ tags: 'A, b ,a', status: 'ready' }), { tags: ['a', 'b'], status: 'ready' });
  });

  it('only allows signed-in Adobe accounts', () => {
    assert.throws(() => service.assertAllowedUser(null), (e) => e.status === 401);
    assert.throws(() => service.assertAllowedUser({ uid: 'x', isAnonymous: true }), (e) => e.status === 403);
    assert.throws(() => service.assertAllowedUser({ uid: 'x', email: 'a@gmail.com' }), (e) => e.status === 403);
    assert.equal(service.assertAllowedUser(ADOBE).email, 'alan@adobe.com');
  });

  it('refuses the public brand-scrapes bucket', () => {
    const prev = process.env.DEMO_ASSETS_BUCKET;
    process.env.DEMO_ASSETS_BUCKET = 'aep-orchestration-lab-brand-scrapes';
    try { assert.throws(() => service.bucketName(), /public bucket/); } finally {
      if (prev === undefined) delete process.env.DEMO_ASSETS_BUCKET; else process.env.DEMO_ASSETS_BUCKET = prev;
    }
  });

  it('creates render URLs only on the dedicated HTTPS origin', () => {
    assert.equal(
      service.buildRenderUrl('token_123'),
      'https://aep-orchestration-lab-demo-render.web.app/render/token_123',
    );
    assert.throws(() => service.buildRenderUrl('token', 'http://demo.example'), /HTTPS origin/);
    assert.throws(() => service.buildRenderUrl('token', 'https://demo.example/path'), /HTTPS origin/);
  });
});

describe('demoAssetsApi route', () => {
  it('routes rendered HTML through the isolated Hosting site', () => {
    assert.ok(Array.isArray(firebaseConfig.hosting));
    const appSite = firebaseConfig.hosting.find((site) => site.target === 'app');
    const renderSite = firebaseConfig.hosting.find((site) => site.target === 'demo-render');
    assert.ok(appSite);
    assert.ok(renderSite);
    assert.deepEqual(
      firebaseProjectConfig.targets['aep-orchestration-lab'].hosting,
      { app: ['aep-orchestration-lab'], 'demo-render': ['aep-orchestration-lab-demo-render'] },
    );
    assert.equal(
      appSite.redirects[0].destination,
      'https://aep-orchestration-lab-demo-render.web.app/render/:token',
    );
    assert.deepEqual(renderSite.rewrites, [{
      source: '/render/**',
      function: { functionId: 'demoAssetsApi', region: 'us-central1' },
    }]);
  });

  it('keeps renderer requests valid on the dedicated site path', () => {
    assert.deepEqual(parseRoute({ originalUrl: '/render/token_123' }), ['render', 'token_123']);
  });

  it('parses paths behind the hosting rewrite', () => {
    assert.deepEqual(parseRoute({ originalUrl: '/api/demo-assets/abc/render-token?x=1' }), ['abc', 'render-token']);
    assert.deepEqual(parseRoute({ originalUrl: '/api/demo-assets/' }), []);
    assert.deepEqual(parseRoute({ originalUrl: '/demoAssetsApi/abc/studio/chat' }), ['abc', 'studio', 'chat']);
    assert.deepEqual(parseRoute({ originalUrl: '/api/demo-assets/abc/versions/v1/restore' }), ['abc', 'versions', 'v1', 'restore']);
  });

  it('renders proposals through the studio service', async () => {
    const res = await route({
      resolveRenderTarget: async () => ({ assetId: 'a1', proposalId: 'p1' }),
    }, null, { loadProposalRenderedHtml: async (a, p) => `<p>${a}:${p}</p>` })('GET', '/render/tok');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '<p>a1:p1</p>');
  });

  it('checks proposal ownership before minting a preview token', async () => {
    const res = await route({ createRenderToken: async () => ({ token: 'x' }) }, ADOBE, {
      loadProposal: async () => { const e = new Error('Not your proposal'); e.status = 403; throw e; },
    })('POST', '/api/demo-assets/a1/render-token', { proposalId: 'p1' });
    assert.equal(res.statusCode, 403);
  });

  it('routes studio chat, apply and restore', async () => {
    const studio = {
      studioChat: async (id, body) => ({ reply: `${id}:${body.message}` }),
      applyProposal: async (_id, body) => ({ versionId: `v-${body.proposalId}` }),
      restoreVersion: async (_id, vId) => ({ versionId: `r-${vId}` }),
    };
    const call = route({}, ADOBE, studio);
    assert.equal((await call('POST', '/demoAssetsApi/a1/studio/chat', { message: 'hi' })).body.reply, 'a1:hi');
    assert.equal((await call('POST', '/api/demo-assets/a1/studio/apply', { proposalId: 'p1' })).body.versionId, 'v-p1');
    assert.equal((await call('POST', '/api/demo-assets/a1/versions/v9/restore')).body.versionId, 'r-v9');
    assert.equal((await call('GET', '/api/demo-assets/a1/studio/nope')).statusCode, 404);
  });

  it('returns 401 without a signed-in user', async () => {
    const res = await route({}, null)('GET', '/api/demo-assets');
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.ok, false);
  });

  it('lists assets with conversation types', async () => {
    const res = await route({ listAssets: async () => [{ id: 'a' }] })('GET', '/api/demo-assets');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.assets, [{ id: 'a' }]);
    assert.ok(res.body.conversationTypes.includes('Decisioning'));
  });

  it('creates assets and reports duplicates as 409', async () => {
    let calls = 0;
    const call = route({ createAsset: async (input) => { calls += 1; return input.force ? { asset: { id: 'n' } } : { duplicate: true, asset: { id: 'old' } }; } });
    const dup = await call('POST', '/api/demo-assets', { html: '<p>', filename: 'a.html' });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.body.asset.id, 'old');
    const ok = await call('POST', '/api/demo-assets', { html: '<p>', filename: 'a.html', force: true });
    assert.equal(ok.statusCode, 201);
    assert.equal(calls, 2);
  });

  it('surfaces patch validation errors as 400', async () => {
    const res = await route({ updateAsset: async (_id, body) => service.sanitisePatch(body) })('PATCH', '/api/demo-assets/a1', { owner: 'x' });
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /not editable/);
  });

  it('deletes the requested asset only for signed-in Adobe users', async () => {
    const deleted = [];
    const service = { deleteAsset: async (id) => { deleted.push(id); return { ok: true, id }; } };
    assert.equal((await route(service, null)('DELETE', '/api/demo-assets/assetAAA1')).statusCode, 401);
    assert.equal((await route(service, { uid: 'u2', email: 'user@example.com' })('DELETE', '/api/demo-assets/assetAAA1')).statusCode, 403);
    assert.deepEqual(deleted, []);
    const result = await route(service)('DELETE', '/api/demo-assets/assetAAA1');
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.body, { ok: true, id: 'assetAAA1' });
    assert.deepEqual(deleted, ['assetAAA1']);
  });

  it('reports deletion failures instead of returning success', async () => {
    const result = await route({ deleteAsset: async () => { throw new service.DemoAssetsError(503, 'Storage unavailable'); } })('DELETE', '/api/demo-assets/assetAAA1');
    assert.equal(result.statusCode, 503);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.error, 'Storage unavailable');
  });

  it('renders by token without auth and with sandbox CSP', async () => {
    const res = await route({
      resolveRenderTarget: async (t) => { assert.equal(t, 'tok'); return { assetId: 'a1' }; },
      loadRenderedHtml: async () => ({ html: '<p>hi</p>' }),
    }, null)('GET', '/render/tok');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body, '<p>hi</p>');
    assert.match(res.headers['Content-Security-Policy'], /^sandbox /);
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    assert.equal(res.headers['X-Robots-Tag'], 'noindex, nofollow');
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  });

  it('rejects malformed render tokens', async () => {
    const res = await route({}, null)('GET', '/render/bad');
    assert.equal(res.statusCode, 404);
  });

  it('redirects legacy and encoded API paths without loading uploaded HTML', async () => {
    const call = route({
      resolveRenderTarget: async () => { throw new Error('Must not load on the app origin'); },
    }, null);
    for (const path of ['/api/demo-assets/render/tok', '/api/demo-assets/r%65nder/tok/', '/demoAssetsApi/render/tok']) {
      const res = await call('GET', path);
      assert.equal(res.statusCode, 302);
      assert.equal(res.headers.Location, service.buildRenderUrl('tok'));
      assert.equal(res.headers['Cache-Control'], 'private, no-store');
      assert.equal(res.body, '');
    }
    assert.equal((await call('GET', '/api/demo-assets/render/tok/extra')).statusCode, 404);
  });
});
