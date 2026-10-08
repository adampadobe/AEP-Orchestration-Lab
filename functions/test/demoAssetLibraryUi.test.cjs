'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../../web/profile-viewer/demo-asset-library.js'), 'utf8');
const asset = { id: 'assetAAA1', title: 'BA channels', status: 'ready', originalFilename: 'ba-channels-v1.html', currentVersionId: 'versionAAA1' };

async function library({ confirm = true, remove = async () => ({ ok: true }), request } = {}) {
  class Element {
    constructor(tag = '') {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.dataset = {};
      this.value = '';
      this.checked = false;
      this.disabled = false;
      const classes = new Set();
      this.classList = { toggle(name, on) { if (on) classes.add(name); else classes.delete(name); }, contains: (name) => classes.has(name) };
      this.attributes = {};
      this._text = '';
    }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text; }
    appendChild(child) { this.children.push(child); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.listeners.close?.(); }
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]);
    }
  }
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('demoAssetsEditForm').elements = { conversationType: new Element() };
  const requests = [];
  const bodies = [];
  const confirmations = [];
  const context = {
    document: {
      readyState: 'complete',
      getElementById: get,
      createElement: (tag) => new Element(tag),
    },
    window: {
      firebaseDatabaseConfig: {},
      confirm: (message) => { confirmations.push(message); return confirm; },
    },
    firebase: {
      apps: [{}],
      auth: () => ({
        onAuthStateChanged: (callback) => callback({
          uid: 'user1', email: 'user@adobe.com', getIdToken: async () => 'test-token',
        }),
      }),
    },
    fetch: async (url, init) => {
      requests.push({ url, method: init.method });
      bodies.push(init.body ? JSON.parse(init.body) : null);
      if (request) {
        const response = await request(url, init);
        if (response) return { ok: response.ok !== false, status: response.status || 200, json: async () => response.data };
      }
      if (init.method === 'DELETE') {
        const body = await remove();
        return { ok: body.ok, status: body.ok ? 200 : 503, json: async () => body };
      }
      return { ok: true, json: async () => ({ assets: [asset], conversationTypes: ['Decisioning'] }) };
    },
  };
  vm.runInNewContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  const deleteButton = () => get('demoAssetsGrid').children[0].children
    .find((child) => child.className === 'demo-assets-card-heading').children
    .find((child) => child.className === 'demo-assets-delete');
  const action = (label) => get('demoAssetsGrid').children[0].children
    .find((child) => child.className === 'demo-assets-card-actions').children.find((child) => child.textContent === label);
  return { get, deleteButton, requests, bodies, confirmations, action };
}

it('shows Delete on each card and cancellation sends no request', async () => {
  const app = await library({ confirm: false });
  assert.equal(app.deleteButton().textContent, '');
  assert.equal(app.deleteButton().attributes['aria-label'], 'Delete BA channels');
  assert.equal(app.deleteButton().children[0].className, 'demo-assets-delete-icon');
  assert.equal(app.deleteButton().children[0].attributes['aria-hidden'], 'true');
  const actions = app.get('demoAssetsGrid').children[0].children.find((child) => child.className === 'demo-assets-card-actions');
  assert.ok(!actions.children.includes(app.deleteButton()));
  await app.deleteButton().listeners.click();
  assert.match(app.confirmations[0], /BA channels/);
  assert.match(app.confirmations[0], /cannot be undone/);
  assert.equal(app.requests.filter((request) => request.method === 'DELETE').length, 0);
  assert.equal(app.get('demoAssetsCount').textContent, '1');
});

it('removes the card and updates the count after a confirmed successful deletion', async () => {
  const app = await library();
  await app.deleteButton().listeners.click();
  assert.deepEqual(app.requests.at(-1), { url: '/api/demo-assets/assetAAA1', method: 'DELETE' });
  assert.equal(app.get('demoAssetsCount').textContent, '0');
  assert.match(app.get('demoAssetsStatus').textContent, /Deleted "BA channels"/);
  assert.equal(app.get('demoAssetsSearch').focused, true);
});

it('disables deletion while pending and prevents duplicate requests', async () => {
  let finish;
  const app = await library({ remove: () => new Promise((resolve) => { finish = resolve; }) });
  const button = app.deleteButton();
  const pending = button.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.deleteButton().disabled, true);
  assert.equal(app.deleteButton().attributes['aria-label'], 'Deleting BA channels');
  assert.equal(app.deleteButton().attributes['aria-busy'], 'true');
  await button.listeners.click();
  assert.equal(app.requests.filter((request) => request.method === 'DELETE').length, 1);
  finish({ ok: true });
  await pending;
});

it('keeps the card and re-enables Delete when the server rejects deletion', async () => {
  const app = await library({ remove: async () => ({ ok: false, error: 'Storage unavailable' }) });
  await app.deleteButton().listeners.click();
  assert.equal(app.get('demoAssetsCount').textContent, '1');
  assert.equal(app.deleteButton().disabled, false);
  assert.match(app.get('demoAssetsStatus').textContent, /Storage unavailable.*Try again/);
});

it('keeps the card and re-enables Delete after a network failure', async () => {
  const app = await library({ remove: async () => { throw new Error('Network offline'); } });
  await app.deleteButton().listeners.click();
  assert.equal(app.get('demoAssetsCount').textContent, '1');
  assert.equal(app.deleteButton().disabled, false);
  assert.match(app.get('demoAssetsStatus').textContent, /Network offline/);
});

async function flush() {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function upload(app, filename = 'ba-channels-v2.html') {
  const input = app.get('demoAssetsFileInput');
  input.files = [{ name: filename, size: 40, text: async () => '<html><body>New</body></html>' }];
  input.listeners.change();
  await flush();
  return app.get('demoAssetsUploadList').children[0];
}

function choice(row, label) {
  return row.querySelectorAll('button').find((button) => button.textContent === label);
}

const matches = { ok: false, status: 409, data: { error: 'Similar filename', versionCandidates: [asset] } };

it('prompts for a matching filename and cancellation writes no new asset or version', async () => {
  const app = await library({ request: async (_url, init) => init.method === 'POST' ? matches : null });
  const row = await upload(app);
  assert.equal(row.dataset.state, 'version');
  assert.match(row.children[1].textContent, /older version will be kept/);
  choice(row, 'Cancel upload').listeners.click();
  await flush();
  assert.equal(row.dataset.state, 'cancelled');
  assert.equal(app.requests.filter((r) => r.method === 'POST').length, 1);
  assert.equal(app.get('demoAssetsCount').textContent, '1');
});

it('saves a confirmed upload under the same asset and passes the expected current version', async () => {
  const app = await library({ request: async (url, init) => {
    if (init.method !== 'POST') return null;
    return url.endsWith('/versions') ? { data: { asset: { ...asset, currentVersionId: 'versionBBB2' } } } : matches;
  } });
  const row = await upload(app);
  choice(row, 'Save as a new version').listeners.click();
  await flush();
  assert.equal(app.requests.at(-1).url, '/api/demo-assets/assetAAA1/versions');
  assert.equal(app.bodies.at(-1).expectedVersionId, 'versionAAA1');
  assert.equal(app.bodies.at(-1).filename, 'ba-channels-v2.html');
  assert.equal(row.dataset.state, 'ok');
  assert.match(row.children[1].textContent, /Older versions are in History/);
  assert.equal(app.get('demoAssetsCount').textContent, '1');
});

it('lets the user keep a similar file separate without changing the original', async () => {
  let posts = 0;
  const app = await library({ request: async (_url, init) => {
    if (init.method !== 'POST') return null;
    return ++posts === 1 ? matches : { data: { asset: { ...asset, id: 'assetBBB2' } } };
  } });
  const row = await upload(app);
  choice(row, 'Keep as a separate asset').listeners.click();
  await flush();
  assert.equal(app.requests.at(-1).url, '/api/demo-assets');
  assert.equal(app.bodies.at(-1).force, true);
  assert.equal(app.get('demoAssetsCount').textContent, '2');
});

it('offers a retry after version-upload failure and keeps the original library entry', async () => {
  const app = await library({ request: async (url, init) => {
    if (init.method !== 'POST') return null;
    return url.endsWith('/versions') ? { ok: false, status: 409, data: { error: 'The asset has changed.' } } : matches;
  } });
  const row = await upload(app);
  choice(row, 'Save as a new version').listeners.click();
  await flush();
  assert.equal(row.dataset.state, 'error');
  assert.match(row.children[1].textContent, /asset has changed/);
  assert.ok(choice(row, 'Retry upload'));
  assert.equal(app.get('demoAssetsCount').textContent, '1');
});

const history = [
  { id: 'versionBBB2', current: true, note: 'Uploaded v2', originalFilename: 'ba-channels-v2.html' },
  { id: 'versionAAA1', current: false, note: 'Original upload', originalFilename: asset.originalFilename },
];

it('shows current and archived versions and previews the selected older version', async () => {
  const app = await library({ request: async (url) => {
    if (url.endsWith('/versions')) return { data: { versions: history } };
    if (url.endsWith('/render-token')) return { data: { url: 'https://renderer.example/render/token' } };
    return null;
  } });
  await app.action('History').listeners.click();
  const items = app.get('demoAssetsHistoryList').children;
  assert.match(items[0].children[0].textContent, /Current/);
  assert.match(items[1].children[0].textContent, /Archived/);
  await items[1].querySelectorAll('button').find((b) => b.textContent === 'Preview').listeners.click();
  assert.equal(app.bodies.at(-1).versionId, 'versionAAA1');
  assert.equal(app.get('demoAssetsPreviewFrame').src, 'https://renderer.example/render/token');
});

it('restores an older version, guards pending double clicks and retains history', async () => {
  let finish;
  const app = await library({ request: async (url) => {
    if (url.endsWith('/versions')) return { data: { versions: history } };
    if (url.endsWith('/restore')) return new Promise((resolve) => { finish = resolve; });
    return null;
  } });
  await app.action('History').listeners.click();
  const restore = app.get('demoAssetsHistoryList').children[1].querySelectorAll('button').find((b) => b.textContent === 'Restore as current');
  const pending = restore.listeners.click();
  await flush();
  assert.equal(restore.disabled, true);
  await restore.listeners.click();
  assert.equal(app.requests.filter((r) => r.url.endsWith('/restore')).length, 1);
  finish({ data: { asset: { ...asset, currentVersionId: 'versionCCC3' } } });
  await pending;
  assert.equal(app.get('demoAssetsHistoryList').children.length, 2);
  assert.match(app.get('demoAssetsHistoryStatus').textContent, /full history is preserved/);
});

it('keeps history and allows retry after a restore failure', async () => {
  const app = await library({ request: async (url) => {
    if (url.endsWith('/versions')) return { data: { versions: history } };
    if (url.endsWith('/restore')) return { ok: false, status: 503, data: { error: 'Storage unavailable' } };
    return null;
  } });
  await app.action('History').listeners.click();
  const restore = app.get('demoAssetsHistoryList').children[1].querySelectorAll('button').find((b) => b.textContent === 'Restore as current');
  await restore.listeners.click();
  assert.equal(restore.disabled, false);
  assert.equal(app.get('demoAssetsHistoryList').children.length, 2);
  assert.match(app.get('demoAssetsHistoryStatus').textContent, /Storage unavailable.*retry/);
});

it('does not restore an archived version if the confirmation is cancelled', async () => {
  const app = await library({ confirm: false, request: async (url) => url.endsWith('/versions') ? { data: { versions: history } } : null });
  await app.action('History').listeners.click();
  await app.get('demoAssetsHistoryList').children[1].querySelectorAll('button').find((b) => b.textContent === 'Restore as current').listeners.click();
  assert.equal(app.requests.filter((r) => r.url.endsWith('/restore')).length, 0);
});
