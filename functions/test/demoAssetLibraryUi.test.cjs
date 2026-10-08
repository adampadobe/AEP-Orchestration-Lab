'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '../../web/profile-viewer/demo-asset-library.js'), 'utf8');
const asset = { id: 'assetAAA1', title: 'BA channels', status: 'ready' };

async function library({ confirm = true, remove = async () => ({ ok: true }) } = {}) {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
      this.dataset = {};
      this.value = '';
      this.checked = false;
      this.disabled = false;
      this.classList = { toggle() {} };
      this.attributes = {};
      this._text = '';
    }
    set textContent(value) { this._text = value; this.children = []; }
    get textContent() { return this._text; }
    appendChild(child) { this.children.push(child); }
    addEventListener(name, handler) { this.listeners[name] = handler; }
    setAttribute(name, value) { this.attributes[name] = value; }
    focus() { this.focused = true; }
    close() { this.listeners.close?.(); }
  }
  const elements = new Map();
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  get('demoAssetsEditForm').elements = { conversationType: new Element() };
  const requests = [];
  const confirmations = [];
  const context = {
    document: {
      readyState: 'complete',
      getElementById: get,
      createElement: () => new Element(),
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
    .find((child) => child.className === 'demo-assets-card-actions').children
    .find((child) => child.attributes['aria-label'] === 'Delete BA channels');
  return { get, deleteButton, requests, confirmations };
}

it('shows Delete on each card and cancellation sends no request', async () => {
  const app = await library({ confirm: false });
  assert.equal(app.deleteButton().textContent, 'Delete');
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
  assert.equal(app.deleteButton().textContent, 'Deleting...');
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
