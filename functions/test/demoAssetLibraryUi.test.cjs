'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../../web/profile-viewer/demo-asset-library.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../web/profile-viewer/demo-asset-library.html'), 'utf8');
const asset = { id: 'assetAAA1', title: 'BA channels', status: 'ready', originalFilename: 'ba-channels-v1.html', currentVersionId: 'versionAAA1' };

async function library({ confirm = true, remove = async () => ({ ok: true }), request } = {}) {
  class Element {
    constructor(tag = '') {
      this.tagName = tag;
      this.children = [];
      this.listeners = {};
      this.dataset = {};
      this.value = '';
      this.href = '';
      this.checked = false;
      this.disabled = false;
      const classes = new Set();
      this.classList = {
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name),
        toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        contains: (name) => classes.has(name),
      };
      this.attributes = {};
      this._text = '';
      this.hidden = false;
    }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text; }
    appendChild(child) { this.children.push(child); }
    remove() { this.removed = true; }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { this.focused = true; }
    select() { this.selected = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
    contains(target) { return this === target || this.children.some((child) => child.contains(target)); }
    querySelectorAll(tag) {
      return this.children.flatMap((child) => [...(child.tagName === tag ? [child] : []), ...child.querySelectorAll(tag)]);
    }
  }
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('demoAssetsEditForm').elements = Object.fromEntries(
    ['conversationType', 'title', 'customer', 'industry', 'event', 'tags', 'summary', 'notes']
      .map((name) => [name, new Element()]),
  );
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
      location: { href: '' },
      open: () => ({ location: {}, close() {} }),
    },
    navigator: { clipboard: { writeText: async () => {} } },
    AbortController,
    URLSearchParams,
    setTimeout,
    clearTimeout,
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
      if (url.endsWith('/flows')) return { ok: true, json: async () => ({ flows: [] }) };
      if (url.includes('/render-tokens')) return { ok: true, json: async () => ({ tokens: [] }) };
      if (url.includes('/versions?')) return { ok: true, json: async () => ({ versions: history || [] }) };
      return { ok: true, json: async () => ({ assets: [asset], conversationTypes: ['Decisioning'] }) };
    },
  };
  context.document.execCommand = () => true;
  vm.runInNewContext(script, context);
  await flush();
  const card = () => {
    const result = get('demoAssetsGrid').querySelectorAll('article')[0];
    if (!result) throw new Error('Library card missing: ' + get('demoAssetsStatus').textContent);
    return result;
  };
  const deleteButton = () => card().children
    .find((child) => child.className === 'demo-assets-card-heading').children
    .find((child) => child.className === 'demo-assets-delete');
  const action = (label) => card().querySelectorAll('button').find((child) => child.textContent === label);
  return { get, card, deleteButton, requests, bodies, confirmations, action };
}

it('shows Move to Trash on each card and cancellation sends no request', async () => {
  const app = await library({ confirm: false });
  assert.equal(app.deleteButton().textContent, '');
  assert.equal(app.deleteButton().attributes['aria-label'], 'Move to Trash: BA channels');
  assert.equal(app.deleteButton().children[0].className, 'demo-assets-delete-icon');
  assert.equal(app.deleteButton().children[0].attributes['aria-hidden'], 'true');
  const actions = app.card().children.find((child) => child.className === 'demo-assets-card-actions');
  assert.ok(!actions.children.includes(app.deleteButton()));
  await app.deleteButton().listeners.click();
  assert.match(app.confirmations[0], /BA channels/);
  assert.match(app.confirmations[0], /retained in Trash/);
  assert.equal(app.requests.filter((request) => request.method === 'DELETE').length, 0);
  assert.equal(app.get('demoAssetsCount').textContent, '1');
});

it('removes the card and updates the count after a confirmed successful deletion', async () => {
  const app = await library();
  await app.deleteButton().listeners.click();
  assert.deepEqual(app.requests.at(-1), { url: '/api/demo-assets/assetAAA1', method: 'DELETE' });
  assert.equal(app.get('demoAssetsCount').textContent, '0');
  assert.match(app.get('demoAssetsStatus').textContent, /Moved "BA channels" to Trash/);
  assert.equal(app.get('demoAssetsSearch').focused, true);
});

it('disables deletion while pending and prevents duplicate requests', async () => {
  let finish;
  const app = await library({ remove: () => new Promise((resolve) => { finish = resolve; }) });
  const button = app.deleteButton();
  const pending = button.listeners.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(app.deleteButton().disabled, true);
  assert.equal(app.deleteButton().attributes['aria-label'], 'Moving to Trash: BA channels');
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
    if (url.includes('/versions?')) return { data: { versions: history } };
    if (url.endsWith('/render-token')) return { data: { url: 'https://renderer.example/render/token' } };
    return null;
  } });
  await app.action('History').listeners.click();
  const items = app.get('demoAssetsHistoryList').children;
  assert.match(items[0].children[0].textContent, /Current/);
  assert.match(items[1].children[0].textContent, /Archived/);
  await items[1].querySelectorAll('button').find((b) => b.textContent === 'Preview').listeners.click();
  const createIndex = app.requests.findIndex((request) => request.url.endsWith('/render-token') && request.method === 'POST');
  assert.equal(app.bodies[createIndex].versionId, 'versionAAA1');
  assert.equal(app.get('demoAssetsPreviewFrame').src, 'https://renderer.example/render/token');
});

it('loads version history incrementally with an opaque cursor', async () => {
  const older = { id: 'versionCCC3', current: false, note: 'Earlier upload', originalFilename: 'ba-channels-v0.html' };
  const app = await library({ request: async (url) => {
    if (!url.includes('/versions?')) return null;
    if (url.includes('cursor=history-2')) return { data: { versions: [older], nextCursor: null } };
    return { data: { versions: history, nextCursor: 'history-2' } };
  } });
  await app.action('History').listeners.click();
  assert.equal(app.get('demoAssetsHistoryList').children.length, 2);
  assert.equal(app.get('demoAssetsHistoryMore').hidden, false);
  assert.match(app.requests.at(-1).url, /limit=50/);
  await app.get('demoAssetsHistoryMore').listeners.click();
  await flush();
  assert.match(app.requests.at(-1).url, /cursor=history-2/);
  assert.equal(app.get('demoAssetsHistoryList').children.length, 3);
  assert.equal(app.get('demoAssetsHistoryMore').hidden, true);
});

it('restores an older version, guards pending double clicks and retains history', async () => {
  let finish;
  const app = await library({ request: async (url) => {
    if (url.includes('/versions?')) return { data: { versions: history } };
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
    if (url.includes('/versions?')) return { data: { versions: history } };
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
  const app = await library({ confirm: false, request: async (url) => url.includes('/versions?') ? { data: { versions: history } } : null });
  await app.action('History').listeners.click();
  await app.get('demoAssetsHistoryList').children[1].querySelectorAll('button').find((b) => b.textContent === 'Restore as current').listeners.click();
  assert.equal(app.requests.filter((r) => r.url.endsWith('/restore')).length, 0);
});

it('requests successive library pages and retains older results', async () => {
  const second = { id: 'assetBBB2', title: 'Loyalty launch', status: 'ready', currentVersionId: 'versionBBB2' };
  const app = await library({ request: async (url) => {
    if (url.includes('/versions?')) return { data: { versions: [] } };
    if (url.includes('cursor=cursor-2')) return { data: { assets: [second], nextCursor: null, conversationTypes: ['Decisioning'] } };
    if (url.includes('/api/demo-assets?')) return { data: { assets: [asset], nextCursor: 'cursor-2', conversationTypes: ['Decisioning'] } };
    return null;
  } });
  assert.match(app.requests[0].url, /limit=100/);
  assert.equal(app.get('demoAssetsLoadMore').hidden, false);
  await app.get('demoAssetsLoadMore').listeners.click();
  await flush();
  assert.match(app.requests.at(-1).url, /cursor=cursor-2/);
  assert.equal(app.get('demoAssetsCount').textContent, '2');
  assert.equal(app.get('demoAssetsGrid').querySelectorAll('article').length, 2);
  assert.match(app.get('demoAssetsPageStatus').textContent, /all results loaded/);
});

it('searches the server and separates customer-grouped results from page filters', async () => {
  const matching = { ...asset, customer: 'Acme' };
  const app = await library({ request: async (url) => {
    if (url.includes('/api/demo-assets?') && url.includes('q=hotel')) return { data: { assets: [matching], nextCursor: null, conversationTypes: [] } };
    if (url.includes('/api/demo-assets?')) return { data: { assets: [asset], nextCursor: null, conversationTypes: [] } };
    return null;
  } });
  app.get('demoAssetsSearch').value = 'hotel';
  app.get('demoAssetsSearch').listeners.input();
  await new Promise((resolve) => setTimeout(resolve, 280));
  await flush();
  assert.ok(app.requests.some((request) => request.url.includes('q=hotel')));
  assert.equal(app.get('demoAssetsGrid').querySelectorAll('section').filter((item) => item.className === 'demo-assets-group').length, 1);
  assert.equal(app.get('demoAssetsGrid').querySelectorAll('h3').find((item) => item.className === 'demo-assets-group-title').textContent, 'Acme');
});

it('loads Trash separately and restores an asset without hard-deleting it', async () => {
  const trashed = { ...asset, deleted: true };
  const restored = { ...asset, deleted: false };
  const app = await library({ request: async (url, init) => {
    if (url.includes('deleted=true')) return { data: { assets: [trashed], nextCursor: null } };
    if (url.endsWith('/undelete') && init.method === 'POST') return { data: { asset: restored } };
    if (url.includes('/api/demo-assets?')) return { data: { assets: [asset], nextCursor: null } };
    return null;
  } });
  await app.get('demoAssetsTrashView').listeners.click();
  await flush();
  assert.ok(app.requests.some((request) => request.url.includes('deleted=true')));
  const recover = app.card().querySelectorAll('button').find((button) => button.textContent === 'Restore');
  await recover.listeners.click();
  assert.ok(app.requests.some((request) => request.url.endsWith('/assetAAA1/undelete')));
  assert.equal(app.get('demoAssetsCount').textContent, '0');
  assert.match(app.get('demoAssetsStatus').textContent, /Restored "BA channels"/);
});

it('adds selected assets to an existing flow using GET and PATCH without navigating away', async () => {
  const flow = { id: 'flowAAA', title: 'Retail conversation', steps: [] };
  const app = await library({ request: async (url, init) => {
    if (url.endsWith('/flows') && init.method === 'GET') return { data: { flows: [flow] } };
    if (url.endsWith('/flows/flowAAA') && init.method === 'GET') return { data: { flow } };
    if (url.endsWith('/flows/flowAAA') && init.method === 'PATCH') return { data: { flow: { ...flow, steps: JSON.parse(init.body).steps } } };
    return null;
  } });
  const checkbox = app.card().querySelectorAll('input')[0];
  checkbox.checked = true;
  checkbox.listeners.change();
  assert.match(app.get('demoAssetsBuildFlow').href, /assets=assetAAA1/);
  assert.equal(app.get('demoAssetsCreateBrief').href, 'demo-flows.html?assets=assetAAA1');
  assert.match(html, /id="demoAssetsCreateBrief"[^>]*aria-describedby="demoAssetsReviewSelectedHint">Review selected with Gemini in Flows<\/a>/);
  await app.get('demoAssetsAddToFlow').listeners.click();
  await flush();
  app.get('demoAssetsFlowSelect').value = 'flowAAA';
  await app.get('demoAssetsFlowExisting').listeners.click();
  await flush();
  const patch = app.requests.find((request) => request.method === 'PATCH');
  assert.equal(patch.url, '/api/demo-assets/flows/flowAAA');
  assert.equal(app.bodies.at(-1).steps[0].assetId, 'assetAAA1');
  assert.equal(app.bodies.at(-1).steps[0].versionId, 'versionAAA1');
  assert.match(app.get('demoAssetsStatus').textContent, /library assets remain available/);
});

it('routes multiple selected assets to Flows for Gemini review, not the unsupported Studio brief query', async () => {
  const second = { id: 'assetBBB2', title: 'Loyalty launch', status: 'ready', originalFilename: 'loyalty.html', currentVersionId: 'versionBBB2' };
  const app = await library({ request: async (url) => {
    if (url.includes('/api/demo-assets?')) return { data: { assets: [asset, second], nextCursor: null } };
    return null;
  } });
  const cards = app.get('demoAssetsGrid').querySelectorAll('article').filter((card) => card.className === 'demo-assets-card');
  assert.equal(cards.length, 2);
  cards.forEach((card) => {
    const checkbox = card.querySelectorAll('input')[0];
    checkbox.checked = true;
    checkbox.listeners.change();
  });
  assert.equal(app.get('demoAssetsSelectionCount').textContent, '2 selected');
  assert.equal(app.get('demoAssetsCreateBrief').href, 'demo-flows.html?assets=assetAAA1,assetBBB2');
  assert.doesNotMatch(app.get('demoAssetsCreateBrief').href, /demo-studio|brief=1/);
  assert.match(html, /Opens a new flow with these assets\. Choose “Suggest with Gemini” there to review them\./);
});

it('creates pinned share links, lists own links, copies and revokes with visible status', async () => {
  const token = { id: 'tokenAAA', versionId: 'versionAAA1', createdAt: '2026-10-01T00:00:00Z', expiresAt: '2099-10-01T00:00:00Z', revoked: false, url: 'https://renderer.example/r/tokenAAA' };
  const app = await library({ request: async (url, init) => {
    if (url.endsWith('/render-tokens') && init.method === 'GET') return { data: { tokens: [token] } };
    if (url.endsWith('/render-token') && init.method === 'POST') return { data: { ...token, tokenId: token.id } };
    if (url.endsWith('/render-tokens/tokenAAA') && init.method === 'DELETE') return { data: { ok: true } };
    return null;
  } });
  await app.action('Share…').listeners.click();
  await flush();
  await app.get('demoAssetsShareCreate').listeners.click();
  await flush();
  const createIndex = app.requests.findIndex((request) => request.url.endsWith('/render-token') && request.method === 'POST');
  assert.notEqual(createIndex, -1);
  assert.equal(app.bodies[createIndex].versionId, 'versionAAA1');
  assert.equal(app.get('demoAssetsShareUrl').value, token.url);
  assert.equal(app.get('demoAssetsShareCreated').hidden, false);
  await app.get('demoAssetsShareCopy').listeners.click();
  assert.equal(app.get('demoAssetsShareStatus').textContent, 'Link copied to clipboard.');
  const revoke = app.get('demoAssetsShareList').querySelectorAll('button').find((button) => button.textContent === 'Revoke link');
  await revoke.listeners.click();
  await flush();
  assert.ok(app.requests.some((request) => request.url.endsWith('/render-tokens/tokenAAA') && request.method === 'DELETE'));
});

it('shows activity and obtains a preview token only after the user requests a thumbnail', async () => {
  const app = await library({ request: async (url, init) => {
    if (url.includes('/audit?assetId=')) return { data: { entries: [{ id: 'auditAAA', action: 'Asset reviewed', at: '2026-10-01T00:00:00Z', email: 'reviewer@adobe.com', detail: 'Review completed' }] } };
    if (url.endsWith('/render-token') && init.method === 'POST') return { data: { url: 'https://renderer.example/r/thumb', expiresAt: '2099-10-01T00:00:00Z' } };
    return null;
  } });
  assert.equal(app.requests.filter((request) => request.url.endsWith('/render-token')).length, 0);
  await app.action('Activity').listeners.click();
  await flush();
  assert.match(app.get('demoAssetsActivityStatus').textContent, /1 activity entry/);
  assert.match(app.get('demoAssetsActivityList').querySelectorAll('strong')[0].textContent, /Asset reviewed/);
  assert.match(app.get('demoAssetsActivityList').children[0].children[1].textContent, /Review completed.*reviewer@adobe\.com/);
  await app.card().querySelectorAll('button').find((button) => button.textContent === 'Show thumbnail').listeners.click();
  await flush();
  assert.equal(app.requests.filter((request) => request.url.endsWith('/render-token')).length, 1);
  const frame = app.card().querySelectorAll('iframe')[0];
  assert.equal(frame.src, 'https://renderer.example/r/thumb');
  assert.equal(frame.attributes.sandbox, 'allow-scripts');
  assert.match(frame.attributes.title, /Sandboxed thumbnail preview/);
});

it('lets unrelated uploads proceed while another filename decision is pending', async () => {
  let postCount = 0;
  const app = await library({ request: async (_url, init) => {
    if (init.method !== 'POST') return null;
    postCount += 1;
    if (postCount === 1) return matches;
    return { data: { asset: { ...asset, id: 'asset-new-' + postCount, title: 'New ' + postCount } } };
  } });
  const input = app.get('demoAssetsFileInput');
  input.files = ['one.html', 'two.html', 'three.html'].map((name) => ({ name, size: 30, text: async () => '<html>demo</html>' }));
  input.listeners.change();
  await flush();
  const rows = app.get('demoAssetsUploadList').children;
  assert.equal(rows[0].dataset.state, 'version');
  assert.equal(rows[1].dataset.state, 'ok');
  assert.equal(rows[2].dataset.state, 'ok');
  assert.match(app.get('demoAssetsUploadSummary').textContent, /1 awaiting decision/);
  choice(rows[0], 'Cancel upload').listeners.click();
  await flush();
  assert.equal(rows[0].dataset.state, 'cancelled');
});

it('serializes two chosen versions of one asset with a fresh expected version each time', async () => {
  const expected = [];
  let conflictCount = 0;
  let savedCount = 0;
  const app = await library({ request: async (url, init) => {
    if (init.method !== 'POST') return null;
    if (url.endsWith('/versions')) {
      expected.push(JSON.parse(init.body).expectedVersionId);
      savedCount += 1;
      return { data: { asset: { ...asset, currentVersionId: savedCount === 1 ? 'versionBBB2' : 'versionCCC3' } } };
    }
    conflictCount += 1;
    return matches;
  } });
  const input = app.get('demoAssetsFileInput');
  input.files = ['v2.html', 'v3.html'].map((name) => ({ name, size: 30, text: async () => '<html>demo</html>' }));
  input.listeners.change();
  await flush();
  const rows = app.get('demoAssetsUploadList').children;
  assert.equal(rows[0].dataset.state, 'version');
  assert.equal(rows[1].dataset.state, 'version');
  choice(rows[0], 'Save as a new version').listeners.click();
  choice(rows[1], 'Save as a new version').listeners.click();
  await flush();
  assert.deepEqual(expected, ['versionAAA1', 'versionBBB2']);
  assert.equal(rows[0].dataset.state, 'ok');
  assert.equal(rows[1].dataset.state, 'ok');
});
