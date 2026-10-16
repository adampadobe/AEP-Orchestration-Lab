'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../../web/profile-viewer/profile-generation-snowflake.js'), 'utf8');
const html = readFileSync(resolve(__dirname, '../../web/profile-viewer/profile-generation-snowflake.html'), 'utf8');
const flush = () => new Promise(setImmediate);

function element() {
  const listeners = {};
  const attributes = {};
  const node = {
    value: '', hidden: false, disabled: false, children: [], listeners,
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child) { this.children.push(child); },
    setAttribute(key, value) { attributes[key] = String(value); },
    getAttribute(key) { return attributes[key] || null; },
    removeAttribute(key) { delete attributes[key]; },
    addEventListener(name, handler) { listeners[name] = handler; },
    querySelectorAll() { return []; },
    scrollIntoView() {},
  };
  let text = '';
  Object.defineProperty(node, 'textContent', {
    get() { return text; },
    set(value) { text = value; node.children = []; },
  });
  return node;
}

function fixture() {
  const nodes = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => [match[1], element()]));
  const events = {};
  const eventTargets = {};
  const storage = new Map([['aepGlobalSandboxName', 'sandbox-a']]);
  const calls = [];
  let uid = 'user-a';
  let token = async () => 'fixture-token';
  let selected = [];
  let authChanged;
  let respond = async () => ({ ok: true, json: async () => ({ result: { ok: true, profiles: [] } }) });
  const auth = {
    get currentUser() { return { uid, email: 'fixture@adobe.com', isAnonymous: false, getIdToken: () => token() }; },
    onAuthStateChanged(handler) { authChanged = handler; },
  };
  nodes.get('sfIndustry').value = 'retail';
  nodes.get('sfGenCount').value = '1';
  nodes.get('sfGenScopeSingle').checked = true;
  nodes.get('sfGenScopeFull').checked = false;
  const context = {
    console, setTimeout,
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    document: {
      getElementById: (id) => nodes.get(id) || null,
      createElement: element,
      createTextNode: (text) => ({ textContent: text }),
      querySelectorAll: () => selected,
      addEventListener: (name, handler) => { events[name] = handler; eventTargets[name] = 'document'; },
    },
    window: {
      firebase: { auth: () => auth }, confirm: () => true,
      addEventListener: (name, handler) => { events[name] = handler; eventTargets[name] = 'window'; },
    },
    fetch: async (url, options) => {
      calls.push({ url, body: options?.body && JSON.parse(options.body) });
      return respond(url, options);
    },
  };
  const instrumented = source.replace(/\}\)\(\);\s*$/, `
    globalThis.ui = { bind: bind, reset: resetWorkflowContext, reload: reloadWorkflowContext,
      history: safeGetBaseBatchHistory, append: appendBaseBatchHistory,
      load: loadProfiles, enrich: enrichSelected, generate: generateProfiles, generateClick: handleGenerateClick,
      catalog: loadIndustryCatalog, render: renderProfileRows,
      profiles: function () { return loadedProfiles; } };
  })();`);
  runInNewContext(instrumented, context);
  context.ui.bind();
  return {
    ui: context.ui, nodes, events, eventTargets, storage, calls,
    sandbox(value) { storage.set('aepGlobalSandboxName', value); },
    user(value) { uid = value; },
    token(fn) { token = fn; },
    respond(fn) { respond = fn; },
    async start() { events.DOMContentLoaded(); await flush(); },
    authChanged() { authChanged(); },
    selectFirst() {
      selected = [{ getAttribute: () => '0', checked: true }];
      nodes.get('sfEventTypes').querySelectorAll = () => [{ checked: true, value: 'order' }];
    },
  };
}

test('invalid recipient counts show an error before either generation path submits', () => {
  const f = fixture();
  f.nodes.get('sfGenCount').reportValidity = () => false;
  for (const full of [false, true]) {
    f.nodes.get('sfGenScopeFull').checked = full;
    f.ui.generateClick();
    assert.equal(f.calls.length, 0);
    assert.equal(f.nodes.get('sfGenerateMessage').hidden, false);
    assert.equal(f.nodes.get('sfGenerateMessage').getAttribute('data-tone'), 'error');
  }
  assert.match(html, /type="number" id="sfGenCount"[^>]*min="1"[^>]*max="1000"[^>]*step="1"[^>]*required/);
});

test('batch history is isolated by user, sandbox and industry; unscoped legacy data is not imported', () => {
  const f = fixture();
  f.storage.set('aepLabSnowflakeBaseProfileBatchesV1', JSON.stringify([{ id: 'legacy' }]));
  assert.equal(f.ui.history().length, 0);
  f.ui.append({ ok: true, rowcount: 1, sample: [{ ecid: 'a' }] });
  assert.equal(f.ui.history().length, 1);
  f.sandbox('sandbox-b');
  assert.equal(f.ui.history().length, 0);
  f.ui.append({ ok: true, rowcount: 1, sample: [{ ecid: 'b' }] });
  f.sandbox('sandbox-a');
  assert.equal(f.ui.history()[0].result.sample[0].ecid, 'a');
  f.user('user-b');
  assert.equal(f.ui.history().length, 0);
  f.user('user-a');
  f.nodes.get('sfIndustry').value = 'fsi';
  assert.equal(f.ui.history().length, 0);
});

test('sandbox sync and cross-tab sandbox changes immediately clear selected profiles and old results', async () => {
  for (const name of ['aep-lab-sandbox-synced', 'storage']) {
    const f = fixture();
    assert.equal(f.eventTargets[name], 'window', 'sandbox sync is dispatched on window by aep-lab-sandbox-sync.js');
    f.ui.render([{ crmId: 'CRM-A', ecid: 'ECID-A' }]);
    f.selectFirst();
    f.nodes.get('sfGenerateResult').hidden = false;
    f.nodes.get('sfProfileBundleOut').hidden = false;
    f.sandbox('sandbox-b');
    f.events[name]({ key: 'aepGlobalSandboxName' });
    assert.equal(f.ui.profiles().length, 0);
    assert.equal(f.nodes.get('sfGenerateResult').hidden, true);
    assert.equal(f.nodes.get('sfProfileBundleOut').hidden, true);
    f.ui.enrich();
    await flush();
    assert.equal(f.calls.some(({ url }) => url.includes('enrich-profiles')), false);
  }
});

test('late profile responses cannot repopulate a new sandbox or finish its busy state', async () => {
  const f = fixture();
  let resolveOld;
  let resolveNew;
  f.respond(() => new Promise((resolveRequest) => { resolveOld = resolveRequest; }));
  f.ui.load();
  await flush();
  f.sandbox('sandbox-b');
  f.ui.reset();
  f.respond(() => new Promise((resolveRequest) => { resolveNew = resolveRequest; }));
  f.ui.load();
  await flush();
  resolveOld({ ok: true, json: async () => ({ result: { ok: true, profiles: [{ crmId: 'OLD' }] } }) });
  await flush();
  assert.equal(f.ui.profiles().length, 0);
  assert.equal(f.nodes.get('sfUpdaterForm').getAttribute('aria-busy'), 'true');
  resolveNew({ ok: true, json: async () => ({ result: { ok: true, profiles: [{ crmId: 'NEW' }] } }) });
  await flush();
  assert.equal(f.ui.profiles()[0].crmId, 'NEW');
  assert.equal(f.nodes.get('sfUpdaterForm').getAttribute('aria-busy'), 'false');
});

test('context change while waiting for auth prevents enrichment from being submitted', async () => {
  const f = fixture();
  f.ui.render([{ crmId: 'CRM-A', ecid: 'ECID-A' }]);
  f.selectFirst();
  let resolveToken;
  f.token(() => new Promise((resolveRequest) => { resolveToken = resolveRequest; }));
  f.ui.enrich();
  f.sandbox('sandbox-b');
  f.ui.reset();
  resolveToken('fixture-token');
  await flush();
  assert.equal(f.calls.length, 0);
});

test('retained rows cannot be enriched after a target change even before its notification fires', async () => {
  const f = fixture();
  f.ui.render([{ crmId: 'CRM-A', ecid: 'ECID-A' }]);
  f.selectFirst();
  f.sandbox('sandbox-b');
  f.ui.enrich();
  await flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.ui.profiles().length, 0);
  assert.match(f.nodes.get('sfUpdaterMessage').children[0].textContent, /Load profiles again/);
});

test('late generation success neither renders nor stores a batch in the next user context', async () => {
  const f = fixture();
  let finish;
  f.respond(() => new Promise((resolveRequest) => { finish = resolveRequest; }));
  f.ui.generate();
  await flush();
  assert.equal(f.calls[0].body.sandbox, 'sandbox-a');
  f.user('user-b');
  f.ui.reset();
  finish({ ok: true, json: async () => ({ result: { ok: true, rowcount: 1, recipientTable: 'OLD.PARENT', sample: [{ ecid: 'OLD' }] } }) });
  await flush();
  assert.equal(f.nodes.get('sfGenerateResult').hidden, true);
  assert.equal(f.ui.history().length, 0);
  assert.match(f.nodes.get('sfGenerateMessage').children[0].textContent, /previous run may still finish/);
});

test('late catalog failures cannot replace readiness feedback for the new industry', async () => {
  const f = fixture();
  let fail;
  f.respond(() => new Promise((_resolveRequest, reject) => { fail = reject; }));
  f.ui.catalog(true);
  await flush();
  f.nodes.get('sfIndustry').value = 'media';
  f.ui.reset();
  fail(new Error('old catalog failed'));
  await flush();
  assert.equal(f.nodes.get('sfIndustryMessage').textContent, '');
});

test('profile selection checkboxes have identity-based accessible names', () => {
  const f = fixture();
  f.ui.render([{ crmId: 'CRM-A', ecid: 'ECID-A', email: 'fixture@example.invalid' }]);
  const checkbox = f.nodes.get('sfProfileTbody').children[0].children[0].children[0];
  assert.equal(checkbox.getAttribute('aria-label'), 'Select profile CRM-A');
});

test('Portal identity changes clear the previous user selection, result and credential input', async () => {
  const f = fixture();
  await f.start();
  f.ui.render([{ crmId: 'CRM-A' }]);
  f.nodes.get('sfCredential').value = 'fixture-only';
  f.nodes.get('sfGenerateResult').hidden = false;
  f.user('user-b');
  f.authChanged();
  assert.equal(f.ui.profiles().length, 0);
  assert.equal(f.nodes.get('sfGenerateResult').hidden, true);
  assert.equal(f.nodes.get('sfCredential').value, '');
  await flush();
});

test('saving a connection blocks generation until the target change is confirmed', async () => {
  const f = fixture();
  f.nodes.get('sfAccount').value = 'fixture-account';
  f.nodes.get('sfUser').value = 'fixture-user';
  let finishSave;
  f.respond(() => new Promise((resolveRequest) => { finishSave = resolveRequest; }));
  f.nodes.get('sfSaveBtn').listeners.click();
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, '/api/snowflake/config');
  assert.equal(f.nodes.get('sfGenerateBtn').disabled, true);
  f.ui.generate();
  await flush();
  assert.equal(f.calls.length, 1, 'generation must not be submitted during connection mutation');
  assert.equal(f.nodes.get('sfGenerateBtn').disabled, true);
  finishSave({ ok: false, json: async () => ({ error: 'fixture save denied' }) });
  await flush();
  assert.equal(f.nodes.get('sfGenerateBtn').disabled, false);
});
