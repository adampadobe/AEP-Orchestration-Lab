'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const path = require('node:path');

const source = readFileSync(path.join(__dirname, '../../web/profile-viewer/image-hosting-customers.js'), 'utf8');
const html = readFileSync(path.join(__dirname, '../../web/profile-viewer/image-hosting.html'), 'utf8');

function fixture({ pending, statusCode = 200, operation } = {}) {
  const elements = new Map();
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag; this.children = []; this.dataset = {}; this.events = {};
      this.value = ''; this.checked = false; this.disabled = false; this.hidden = false; this._text = '';
    }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map((item) => item.textContent).join(''); }
    append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
    replaceChildren(...nodes) { this.children = []; this._text = ''; this.append(...nodes); }
    replaceWith(node) { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1, node); }
    remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
    setAttribute(name, value) { this[name] = value; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    async emit(name) { for (const callback of this.events[name] || []) await callback({ preventDefault() {} }); }
    click() { return this.emit('click'); }
    focus() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    querySelectorAll(selector) {
      const matches = (node) => selector === 'img' ? node.tagName === 'img'
        : selector.startsWith('.') ? node.className?.split(' ').includes(selector.slice(1))
          : selector === '[type=file]' ? node.type === 'file'
            : selector === '[data-target-path]' ? 'targetPath' in node.dataset
              : selector === '[data-restore]' ? 'restore' in node.dataset : false;
      return this.children.flatMap((node) => [...(matches(node) ? [node] : []), ...node.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0]; }
  }
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
    const element = new Element(); element.id = match[1];
  }
  const root = elements.get('imageHostingCustomers');
  root.append(...[...elements.values()].filter((node) => node !== root));
  const storage = new Map(pending ? [['aepCustomerOperation:demo', JSON.stringify(pending)]] : []);
  const calls = [];
  const inspect = {
    ok: true, activeCustomer: null, rtdbCustomerName: 'Customer A', drift: true, warnings: ['Name needs review'],
    items: [{ relPath: 'logo/logo.png', scope: 'customer', size: 20 }, { relPath: 'shared/icon.png', scope: 'shared', size: 10 }],
    configuration: [{ path: 'CoreDemoData.name', value: 'Customer A' }], revisions: [], nextCursor: 'more-revisions',
  };
  vm.runInNewContext(source, {
    document: { getElementById: (id) => elements.get(id), createElement: (tag) => new Element(tag) },
    window: {
      AepGlobalSandbox: { getSandboxName: () => 'demo' },
      AepLabSandboxSync: { getAuthHeaders: async () => ({ Authorization: 'Bearer fixture' }) },
      location: { href: 'https://lab.example/profile-viewer/image-hosting.html' },
      setTimeout, clearTimeout, confirm: () => true,
    },
    Headers, AbortController, URL, crypto: webcrypto,
    sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    FileReader: class {
      readAsDataURL() { this.result = 'data:image/png;base64,Ynl0ZXM='; this.onload(); }
    },
    fetch: async (_url, init) => {
      assert.equal(init.headers.get('Authorization'), 'Bearer fixture');
      const body = JSON.parse(init.body); calls.push(body);
      const status = body.action === 'customer-status' ? statusCode : 200;
      const data = body.action === 'customer-inspect' ? inspect
        : body.action === 'customer-status' ? operation || { ok: false, error: 'Record not found.' }
          : body.action === 'customer-stage' ? { ok: true, stageId: 'stage' }
            : { ok: true, preflightId: 'preview', customerName: 'Customer B', files: [{ relPath: 'logo/logo.png', action: 'replace', previewUrl: 'https://preview.example/logo.png' }] };
      return { ok: status === 200, status, json: async () => data };
    },
  });
  return {
    elements, calls, storage,
    async ready() {
      await elements.get('customerInspect').click();
      elements.get('customerClassification').checked = true;
      await elements.get('customerClassification').emit('change');
    },
  };
}

test('full inventory can save before revision pagination finishes, with RTDB name and drift visible', async () => {
  const f = fixture(); await f.ready();
  assert.equal(f.elements.get('customerSave').disabled, false);
  assert.equal(f.elements.get('customerSaveName').value, 'Customer A');
  assert.match(f.elements.get('customerActive').textContent, /RTDB customer: Customer A.*Drift: true.*Name needs review/);
});

test('loading or broken AFTER previews cannot be confirmed for activation', async () => {
  const f = fixture(); await f.ready();
  await f.elements.get('customerSave').click();
  f.elements.get('customerPreviewConfirm').checked = true;
  await f.elements.get('customerPreviewConfirm').emit('change');
  assert.equal(f.elements.get('customerApply').disabled, true);
  await f.elements.get('customerPreviewContent').querySelector('img').emit('error');
  assert.equal(f.elements.get('customerApply').disabled, true);
  assert.match(f.elements.get('customerPreviewStatus').textContent, /Activation is disabled/);
  assert.equal(f.calls.some((call) => call.action === 'customer-apply'), false);
});

test('new exact customer paths stage successfully while shared paths remain protected', async () => {
  const f = fixture(); await f.ready();
  f.elements.get('customerNewName').value = 'Customer B';
  f.elements.get('customerConfig0').value = '"Customer B"';
  f.elements.get('customerConfigApprove0').checked = true;
  await f.elements.get('customerAddReplacement').click();
  const row = f.elements.get('customerReplacements').children[0];
  row.querySelector('[data-target-path]').value = 'email/new.png';
  row.querySelector('[type=file]').files = [{ name: 'new.png', size: 20, type: 'image/png' }];
  await f.elements.get('customerPreparePreview').click();
  assert.deepEqual(f.calls.find((call) => call.action === 'customer-switch-preview').replacements, [{ rel_path: 'email/new.png', stage_id: 'stage' }]);
});

test('superseded success clears tracking, but network/server uncertainty never does', async () => {
  const pending = { idempotencyKey: 'operation-key' };
  const done = fixture({ pending, operation: { status: 'succeeded', verified: false, operationId: 'op' } });
  await done.ready(); await done.elements.get('customerCheckStatus').click();
  assert.equal(done.storage.size, 0);
  assert.match(done.elements.get('customerStatus').textContent, /superseded/);
  const uncertain = fixture({ pending, statusCode: 503 });
  await uncertain.ready(); await uncertain.elements.get('customerCheckStatus').click();
  assert.equal(uncertain.storage.size, 1);
  const absent = fixture({ pending, statusCode: 404 });
  await absent.ready(); await absent.elements.get('customerCheckStatus').click();
  assert.equal(absent.storage.size, 0);
});
