'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');

const source = readFileSync(resolve(__dirname, '../../web/profile-viewer/profile-generation-prefs-sync.js'), 'utf8');
const sharedSource = readFileSync(resolve(__dirname, '../../web/profile-viewer/profile-generation-shared.js'), 'utf8');
const flush = () => new Promise(setImmediate);
const prefs = (baseEmail = 'demo@example.com', counterN = 7) => ({
  baseEmail, counterN, nextScaledEmail: `demo+16102026-${counterN}@example.com`,
});
const response = (data, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => data });

function fixture() {
  const listeners = {};
  const timers = new Map();
  const cache = new Map();
  const calls = [];
  const applied = [];
  let uid = 'user-a';
  let sandbox = 'sandbox-a';
  let respond = async () => response({ ok: true, prefs: prefs() });
  let timerId = 0;
  let confirmed = true;
  let authHeaders = async () => ({ Authorization: 'Bearer fixture-only' });
  function element() {
    return {
      children: [], listeners: {},
      appendChild(node) { this.children.push(node); node.parentNode = this; },
      insertBefore(node) { this.appendChild(node); },
      setAttribute(key, value) { this[key] = value; },
      addEventListener(name, handler) { this.listeners[name] = handler; },
    };
  }
  const user = () => ({ uid, isAnonymous: false });
  const context = {
    console,
    Date,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    localStorage: {
      getItem: (key) => cache.get(key) || null,
      setItem: (key, value) => cache.set(key, value),
      removeItem: (key) => cache.delete(key),
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    document: {
      readyState: 'complete', hidden: false,
      querySelectorAll: () => [],
      createElement: element,
      addEventListener() {},
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return respond(url, options);
    },
  };
  const window = {
    localStorage: context.localStorage,
    setTimeout: context.setTimeout,
    firebase: { auth: () => ({ currentUser: user(), onAuthStateChanged() {} }) },
    AepGlobalSandbox: { getSandboxName: () => sandbox },
    AepLabSandboxSync: {
      whenReady: Promise.resolve(),
      getAuthHeaders: () => authHeaders(),
    },
    AepProfileGenShared: {
      readBaseEmail: () => 'old-local@example.com',
      readBaseMobile: () => '',
      writeBaseEmail(sb, email) { applied.push({ sb, email }); },
      writeBaseMobile() {},
      persistCounter() {},
    },
    addEventListener(name, handler) { listeners[name] = handler; },
    dispatchEvent() {},
    confirm: () => confirmed,
  };
  context.window = window;
  runInNewContext(source, context);
  return {
    sync: window.AepProfileGenPrefsSync, calls, applied, timers, cache,
    respond(fn) { respond = fn; },
    sandbox(value) { sandbox = value; },
    user(value) { uid = value; },
    confirm(value) { confirmed = value; },
    authHeaders(fn) { authHeaders = fn; },
    element,
    changeContext() { listeners['aep-global-sandbox-change'](); },
    shared() {
      delete window.AepProfileGenShared;
      runInNewContext(sharedSource, context);
      return window.AepProfileGenShared;
    },
  };
}

test('preview uses only GET and does not migrate another account’s local email', async () => {
  const f = fixture();
  f.respond(async () => response({ ok: true, prefs: prefs('', 1) }));
  const result = await f.sync.pull('sandbox-a');
  assert.equal(result.baseEmail, '');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].options.method, 'GET');
  assert.equal(f.applied[0].email, '');
});

test('parallel pulls are separated by account and sandbox and discard stale results', async () => {
  const f = fixture();
  let finishOld;
  f.respond(() => new Promise((resolveRequest) => { finishOld = resolveRequest; }));
  const old = f.sync.pull('sandbox-a');
  await flush();
  f.sandbox('sandbox-b');
  f.user('user-b');
  f.respond(async () => response({ ok: true, prefs: prefs('new@example.com') }));
  const current = await f.sync.pull('sandbox-b');
  finishOld(response({ ok: true, prefs: prefs('old@example.com') }));
  assert.equal(await old, null);
  assert.equal(current.baseEmail, 'new@example.com');
  assert.deepEqual(f.applied, [{ sb: 'sandbox-b', email: 'new@example.com' }]);
});

test('a late save cannot apply preferences to a new account', async () => {
  const f = fixture();
  let finish;
  f.respond(() => new Promise((resolveRequest) => { finish = resolveRequest; }));
  const saved = f.sync.savePatch({ baseEmail: 'old@example.com' }, 'sandbox-a');
  await flush();
  f.user('user-b');
  finish(response({ ok: true, prefs: prefs('old@example.com') }));
  assert.equal((await saved).ok, false);
  assert.equal(f.applied.length, 0);
});

test('reservation waits for an already in-flight save and serializes successive saves', async () => {
  const f = fixture();
  let finish;
  f.respond((url, options) => {
    if (f.calls.length === 1) return new Promise((resolveRequest) => { finish = resolveRequest; });
    if (url.endsWith('/next-email')) return response({
      ok: true, scaledEmail: 'new+16102026-7@example.com', counterN: 7, nextCounterN: 8,
    });
    return response({ ok: true, prefs: prefs(JSON.parse(options.body).baseEmail) });
  });
  const first = f.sync.savePatch({ baseEmail: 'first@example.com' }, 'sandbox-a');
  await flush();
  const second = f.sync.savePatch({ baseEmail: 'new@example.com' }, 'sandbox-a');
  const reserved = f.sync.reserveNextEmail('sandbox-a', 'new@example.com');
  await flush();
  assert.equal(f.calls.length, 1);
  finish(response({ ok: true, prefs: prefs('first@example.com') }));
  await first;
  await second;
  assert.equal((await reserved).ok, true);
  assert.equal(f.calls.map((call) => call.options.method).join(','), 'PUT,PUT,POST');
  assert.equal(JSON.parse(f.calls.at(-1).options.body).expectedBaseEmail, 'new@example.com');
});

test('a failed save blocks reservation without falling back to a local address', async () => {
  const f = fixture();
  f.respond(async () => response({ ok: false, error: 'write denied' }, false));
  await f.sync.savePatch({ baseEmail: 'new@example.com' }, 'sandbox-a');
  const result = await f.sync.reserveNextEmail('sandbox-a', 'new@example.com');
  assert.equal(result.ok, false);
  assert.match(result.error, /write denied/);
  assert.equal(f.calls.length, 1);
});

test('signed-in authentication failures never reserve locally or report a device-only save', async () => {
  const f = fixture();
  f.authHeaders(async () => ({}));
  const saved = await f.sync.savePatch({ baseEmail: 'new@example.com' }, 'sandbox-a');
  assert.equal(saved.ok, false);
  assert.equal(saved.localOnly, undefined);
  const reserved = await f.sync.reserveNextEmail('sandbox-a', 'new@example.com');
  assert.equal(reserved.ok, false);
  assert.equal(f.calls.length, 0);
});

test('a queued debounce is canceled when the context changes', async () => {
  const f = fixture();
  f.sync.scheduleSave({ baseEmail: 'old@example.com' }, 'sandbox-a');
  f.user('user-b');
  f.changeContext();
  for (const timer of f.timers.values()) {
    if (timer.delay === 400) timer.fn();
  }
  await flush();
  assert.equal(f.calls.some((call) => call.options.method === 'PUT'), false);
});

test('a pull started before an edit cannot overwrite the completed save', async () => {
  const f = fixture();
  let finish;
  f.respond((url) => url.includes('?') ? new Promise((resolveRequest) => { finish = resolveRequest; })
    : response({ ok: true, prefs: prefs('new@example.com') }));
  const pulled = f.sync.pull('sandbox-a');
  await flush();
  await f.sync.savePatch({ baseEmail: 'new@example.com' }, 'sandbox-a');
  finish(response({ ok: true, prefs: prefs('old@example.com') }));
  assert.equal(await pulled, null);
  assert.deepEqual(f.applied.map((entry) => entry.email), ['new@example.com']);
});

test('signed-in browser caches are isolated by account and counters stay shared across base emails', () => {
  const f = fixture();
  const shared = f.shared();
  shared.writeBaseEmail('sandbox-a', 'a@example.com');
  shared.persistCounter('sandbox-a', 'a@example.com', 20);
  assert.equal(shared.readCounter('sandbox-a', 'changed@example.com'), 20);
  f.user('user-b');
  assert.equal(shared.readBaseEmail('sandbox-a'), '');
  assert.equal(shared.readCounter('sandbox-a', 'a@example.com'), 1);
  f.user('user-a');
  assert.equal(shared.readBaseEmail('sandbox-a'), 'a@example.com');
  assert.equal(shared.readCounter('sandbox-a', 'a@example.com'), 20);
});

test('counter overrides are advanced, validated and confirmed before saving', async () => {
  const f = fixture();
  const container = f.element();
  const preview = f.element();
  const reset = f.element();
  const counter = Object.assign(f.element(), { id: 'counter' });
  container.appendChild(preview);
  preview.appendChild(reset);
  let applied;
  f.sync.bindCounterOverride(counter, reset, (n) => { applied = n; });
  assert.equal(counter.readOnly, true);
  const details = container.children[1];
  const [summary, warning, label, input, apply, , status] = details.children;
  assert.equal(summary.textContent, 'Advanced email counter');
  assert.match(warning.textContent, /reuse/);
  assert.equal(input.id, label.htmlFor);
  input.value = '1.5';
  apply.listeners.click();
  assert.match(status.textContent, /whole/);
  assert.equal(f.calls.length, 0);
  input.value = '4';
  f.confirm(false);
  apply.listeners.click();
  assert.equal(f.calls.length, 0);
  f.confirm(true);
  f.respond(async () => response({ ok: true, prefs: prefs('demo@example.com', 4) }));
  apply.listeners.click();
  await flush();
  assert.equal(JSON.parse(f.calls[0].options.body).counterN, 4);
  assert.equal(applied, 4);
  f.respond(async () => response({ ok: false, error: 'write denied' }, false));
  reset.listeners.click();
  await flush();
  assert.equal(applied, 4, 'failed reset cannot change the displayed/local counter');
  assert.match(status.textContent, /write denied/);
});
