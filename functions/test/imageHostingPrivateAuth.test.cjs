'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../labUserSandboxStore');
const drive = require('../imageHostingDrive');
const backups = require('../imageHostingBackups');
const library = require('../imageHostingLibrary');
const provision = require('../labRtdbProvisionService');
const principalAuth = require('../labGenerationPrefsAuth');
const customers = require('../labDemoCustomerService');
const { imageHostingPrivate, imageHostingLibrary, brandScraperClassify } = require('../index');
const hosting = require('../../firebase.json').hosting.find((site) => site.target === 'app');

function response() {
  return {
    statusCode: 200, body: null,
    set() { return this; },
    setHeader() { return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    end() { return this; },
  };
}

test('private APIs, library reads and classification reject missing and anonymous sessions', async (t) => {
  let claims = null;
  t.mock.method(auth, 'verifyIdTokenClaimsFromRequest', async () => claims);
  const cases = [
    [imageHostingPrivate, 'GET', '/api/image-hosting/drive', {}],
    [imageHostingPrivate, 'POST', '/api/image-hosting/backups', {}],
    [imageHostingLibrary, 'GET', '/api/image-hosting/library', { sandbox: 'retail' }],
    [imageHostingLibrary, 'GET', '/api/image-hosting/library/download', { sandbox: 'retail' }],
    [brandScraperClassify, 'POST', '/api/brand-scraper/scrapes/classify', {}],
  ];
  for (const identity of [null, { uid: 'anonymous', isAnonymous: true }]) {
    claims = identity;
    for (const [handler, method, path, query] of cases) {
      const req = { method, path, query, body: {}, headers: {}, header: () => undefined };
      const res = response();
      await handler(req, res);
      assert.equal(res.statusCode, 401, path);
      assert.equal(res.body.ok, false, path);
    }
  }
});

test('private routes use the verified uid and preserve the agreed response shapes', async (t) => {
  t.mock.method(auth, 'verifyIdTokenClaimsFromRequest', async () => ({ uid: 'real-user', isAnonymous: false }));
  t.mock.method(auth, 'getWorkspaceProfile', async () => ({ workspaceSlug: 'retail' }));
  t.mock.method(provision, 'userOwnsWorkspace', async () => true);
  const calls = [];
  t.mock.method(drive, 'list', async (...args) => { calls.push(args); return { items: [], nextCursor: null }; });
  t.mock.method(backups, 'get', async (...args) => { calls.push(args); return { id: args[1], status: 'complete' }; });
  t.mock.method(backups, 'sandboxesUsed', async () => ({ sandboxes: [{ name: 'retail', fileCount: 1 }] }));
  for (const [path, query, expected] of [
    ['/api/image-hosting/drive', { path: '', cursor: 'cursor', uid: 'other' }, { ok: true, items: [], nextCursor: null }],
    ['/api/image-hosting/backups/123', {}, { ok: true, backup: { id: '123', status: 'complete' } }],
    ['/api/image-hosting/sandboxes-used', {}, { ok: true, sandboxes: [{ name: 'retail', fileCount: 1 }] }],
  ]) {
    const res = response();
    await imageHostingPrivate({ method: 'GET', path, query, body: {}, headers: {}, header: () => undefined }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, expected);
  }
  assert.equal(calls[0][0], 'real-user');
  assert.equal(calls[1][0], 'real-user');
});

test('library paging is opt-in and forwards the cursor and limit', async (t) => {
  t.mock.method(auth, 'verifyIdTokenClaimsFromRequest', async () => ({ uid: 'real-user', isAnonymous: false }));
  t.mock.method(auth, 'getWorkspaceProfile', async () => ({ workspaceSlug: 'retail' }));
  t.mock.method(provision, 'userOwnsWorkspace', async () => true);
  const calls = [];
  t.mock.method(library, 'listLibrary', async (...args) => {
    calls.push(args);
    return args[1] ? { items: [{ relPath: 'page.png' }], nextCursor: 'next' } : [{ relPath: 'all.png' }];
  });
  const call = async (query) => {
    const res = response();
    await imageHostingLibrary({ method: 'GET', path: '/api/image-hosting/library',
      query: { sandbox: 'retail', ...query }, body: {}, headers: {}, header: () => undefined }, res);
    return res;
  };
  assert.deepEqual((await call({})).body, { sandbox: 'retail', items: [{ relPath: 'all.png' }] });
  assert.deepEqual((await call({ limit: '25', cursor: 'first' })).body,
    { sandbox: 'retail', items: [{ relPath: 'page.png' }], nextCursor: 'next' });
  assert.deepEqual(calls, [['retail'], ['retail', { limit: 25, cursor: 'first' }]]);
  assert.equal((await call({ limit: '1001' })).statusCode, 400);
});

test('workspace ownership scopes library reads, writes, discovery and backup creation', async (t) => {
    t.mock.method(auth, 'verifyIdTokenClaimsFromRequest', async () => ({ uid: 'alice', isAnonymous: false }));
    let slug = 'retail', owned = true;
    t.mock.method(auth, 'getWorkspaceProfile', async () => ({ workspaceSlug: slug }));
    t.mock.method(provision, 'userOwnsWorkspace', async () => owned);
    let keySandbox = null;
    t.mock.method(principalAuth, 'resolveGenerationPrefsPrincipal', async () => ({ ok: true, uid: 'alice', keySandbox }));
    t.mock.method(customers, 'acquireLegacyWrite', async () => async () => {});
    t.mock.method(library, 'listLibrary', async () => []);
    t.mock.method(library, 'createLibraryFolder', async () => ({ created: true }));
    t.mock.method(backups, 'sandboxesUsed', async (name) => ({ sandboxes: [{ name, fileCount: 2 }] }));
    t.mock.method(backups, 'create', async () => ({ backupId: 'test' }));
    const call = async (handler, method, path, query = {}, body = {}) => {
      const res = response();
      await handler({ method, path, query, body, headers: {}, header: () => undefined }, res);
      return res;
    };
    assert.equal((await call(imageHostingLibrary, 'GET', '/api/image-hosting/library', { sandbox: 'retail' })).statusCode, 200);
    assert.equal((await call(imageHostingLibrary, 'GET', '/api/image-hosting/library', { sandbox: 'other' })).statusCode, 403);
    assert.equal((await call(imageHostingLibrary, 'GET', '/api/image-hosting/library/download', { sandbox: 'other' })).statusCode, 403);
    assert.equal((await call(imageHostingLibrary, 'POST', '/api/image-hosting/library/folder', { sandbox: 'retail' }, { folder: 'x' })).statusCode, 200);
    assert.equal((await call(imageHostingLibrary, 'POST', '/api/image-hosting/library/folder', { sandbox: 'other' }, { folder: 'x' })).statusCode, 403);
    keySandbox = 'other';
    assert.equal((await call(imageHostingLibrary, 'POST', '/api/image-hosting/library/folder', { sandbox: 'retail' }, { folder: 'x' })).statusCode, 403);
    keySandbox = null;
    assert.deepEqual((await call(imageHostingPrivate, 'GET', '/api/image-hosting/sandboxes-used')).body.sandboxes, [{ name: 'retail', fileCount: 2 }]);
    assert.equal((await call(imageHostingPrivate, 'POST', '/api/image-hosting/backups', {}, { sandboxes: ['retail'] })).statusCode, 200);
    assert.equal((await call(imageHostingPrivate, 'POST', '/api/image-hosting/backups', {}, { sandboxes: ['retail', 'other'] })).statusCode, 403);
    owned = false;
    assert.equal((await call(imageHostingLibrary, 'GET', '/api/image-hosting/library', { sandbox: 'retail' })).statusCode, 403);
    const missing = await call(imageHostingPrivate, 'GET', '/api/image-hosting/sandboxes-used');
    assert.deepEqual(missing.body.sandboxes, []);
    assert.match(missing.body.reason, /workspace/);
    slug = '';
    assert.equal((await call(imageHostingPrivate, 'POST', '/api/image-hosting/backups', {}, { sandboxes: ['retail'] })).statusCode, 403);
    slug = '-retail';
    owned = true;
    assert.equal((await call(imageHostingLibrary, 'GET', '/api/image-hosting/library', { sandbox: '-retail' })).statusCode, 403);
  });
test('Hosting routes classification, private APIs and the public CDN to the intended functions', () => {
  const rewrites = hosting.rewrites;
  const rewrite = (source) => rewrites.find((entry) => entry.source === source)?.function?.functionId;
  assert.equal(rewrite('/api/brand-scraper/scrapes/classify'), 'brandScraperClassify');
  assert.ok(rewrites.findIndex((entry) => entry.source === '/api/brand-scraper/scrapes/classify')
    < rewrites.findIndex((entry) => entry.source === '/api/brand-scraper/scrapes/**'));
  for (const source of ['/api/image-hosting/drive', '/api/image-hosting/drive/**',
    '/api/image-hosting/backups', '/api/image-hosting/backups/**', '/api/image-hosting/sandboxes-used']) {
    assert.equal(rewrite(source), 'imageHostingPrivate');
  }
  assert.equal(rewrite('/cdn/**'), 'imageHostingAsset');
});
