#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../web/profile-viewer/shared/demo-visitor-reset.js'), 'utf8');
const prefsSource = fs.readFileSync(path.join(__dirname, '../web/profile-viewer/shared/env-bar-prefs-local.js'), 'utf8');
const OLD = '12345678901234567890123456789012345678';
const FRESH = '87654321098765432109876543210987654321';
const MARKER = 'aep-demo-visitor-reset-v1';
const INVALIDATION = 'aep-demo-visitor-invalidated-v1';
const result = (ecid) => ({ identity: { ECID: ecid } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    get length() { return map.size; },
    key(i) { return [...map.keys()][i] || null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    snapshot() { return Object.fromEntries(map); }
  };
}

function fixture(options = {}) {
  const listeners = {};
  const events = [];
  const sdkCalls = [];
  const cookieWrites = [];
  const patches = [];
  const errors = [];
  let reloads = 0;
  let drawerClears = 0;
  const elements = {
    customerEmail: { value: 'old@example.com', removeAttribute() {} },
    aepLabProfileStatus: { textContent: '', setAttribute() {} },
    sandboxSelect: { value: 'apalmer' }
  };
  const win = {
    sessionStorage: options.sessionStorage || storage(),
    localStorage: options.localStorage || storage(),
    setTimeout, clearTimeout, Promise, Date, Math,
    document: {
      getElementById(id) { return elements[id] || null; },
      get cookie() {
        return options.cookies === undefined ?
          'kndctr_TEST_AdobeOrg_identity=old; kndctr_TEST_AdobeOrg_cluster=irl1; kndctr_TEST_AdobeOrg_consent=in; AMCV_TEST%40AdobeOrg=old; unrelated=keep' :
          options.cookies;
      },
      set cookie(value) { cookieWrites.push(value); }
    },
    location: {
      hostname: 'demos.example.com', pathname: '/profile-viewer/demos/test.html', protocol: 'https:',
      reload() { reloads++; }
    },
    confirm() { return options.confirm !== false; },
    CustomEvent: class CustomEvent {
      constructor(type, init) { this.type = type; this.detail = init.detail; }
    },
    console: { error(...args) { errors.push(args); } },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) {
      events.push(event);
      (listeners[event.type] || []).forEach((fn) => fn(event));
    },
    DemoProfileDrawer: {
      clearDrawerVisitorState() { drawerClears++; },
      patchLastProfileOrUpdate(value) { patches.push(value); }
    }
  };
  if (options.sdk !== false) {
    win.alloy = (command, args) => {
      sdkCalls.push({ command, args });
      return options.sdk ? options.sdk(command, args) : Promise.resolve(result(OLD));
    };
  }
  win.window = win;
  if (options.beforeLoad) options.beforeLoad(win);
  const context = vm.createContext(win);
  if (options.realPrefs) vm.runInContext(prefsSource, context);
  vm.runInContext(source, context);
  const api = win.AepDemoVisitorReset;
  if (options.init !== false) api.init({ prefix: 'test', timeoutMs: 35, ...options.config });
  return {
    win, api, elements, events, sdkCalls, cookieWrites, patches, errors,
    get reloads() { return reloads; }, get drawerClears() { return drawerClears; },
    storageEvent(value) { win.dispatchEvent({ type: 'storage', key: INVALIDATION, newValue: JSON.stringify(value) }); }
  };
}

function pendingStorage(status = 'pending') {
  return storage({
    [MARKER]: JSON.stringify({
      version: 1, id: 'reset-1', oldEcid: OLD, orgId: 'TEST',
      prefix: 'test', sandbox: 'apalmer', scriptUrl: 'https://assets.adobedtm.com/test.js', status
    })
  });
}

test('public API is nonblocking and does not mount UI or issue idle Adobe calls', async () => {
  const f = fixture();
  assert.equal(f.api.init({ prefix: 'test' }), f.api);
  assert.equal(f.api.isBlocked(), false);
  assert.equal(f.api.isPending(), false);
  assert.equal(f.api.isResetPage(), false);
  assert.equal(f.api.availability().canReset, true);
  assert.equal(await f.api.acceptEcid(OLD), false);
  assert.equal(f.sdkCalls.length, 0);
});

test('reset captures a live ECID, persists reload marker, tombstones cached IDs and preserves configuration/history', async () => {
  const prefs = {
    selectedSandbox: 'apalmer',
    tagsBySandbox: {
      apalmer: { ecid: OLD, launchScript: 'https://assets.adobedtm.com/launch.js', configured: true, company: 'co' },
      other: { ecid: OLD, configured: true }
    },
    bcBySandbox: { apalmer: { datastreamId: 'keep', style: 'keep' } }
  };
  const ls = storage({
    aepLabEnvBarV1: JSON.stringify(prefs),
    testLastResolvedEcidBySandbox: JSON.stringify({ apalmer: OLD }),
    recentEmails: JSON.stringify(Array.from({ length: 20 }, (_, i) => `person${i}@example.com`)),
    consent: 'keep',
    'aep-demo-session-identifier-v1': 'old@example.com'
  });
  const ss = storage({ 'aep-demo-session-identifier-v1': 'old@example.com', environment: 'keep' });
  const f = fixture({ localStorage: ls, sessionStorage: ss, realPrefs: true });
  const history = ls.getItem('recentEmails');
  await f.api.reset();
  assert.equal(f.reloads, 1);
  assert.equal(f.api.isBlocked(), true);
  const marker = JSON.parse(ss.getItem(MARKER));
  assert.equal(marker.oldEcid, OLD);
  assert.equal(marker.status, 'pending');
  assert.equal(ss.getItem('testPendingLaunchInject'), prefs.tagsBySandbox.apalmer.launchScript);
  const savedPrefs = JSON.parse(ls.getItem('aepLabEnvBarV1'));
  assert.equal(savedPrefs.tagsBySandbox.apalmer.ecid, '');
  assert.equal(savedPrefs.tagsBySandbox.other.ecid, '');
  assert.equal(savedPrefs.tagsBySandbox.apalmer.configured, true);
  assert.equal(savedPrefs.tagsBySandbox.apalmer.company, 'co');
  assert.equal(savedPrefs.bcBySandbox.apalmer.datastreamId, 'keep');
  assert.equal(savedPrefs.selectedSandbox, 'apalmer');
  assert.equal(JSON.parse(ls.getItem('testLastResolvedEcidBySandbox')).apalmer, '');
  assert.equal(ss.getItem('aep-demo-session-identifier-v1'), null);
  assert.equal(ls.getItem('aep-demo-session-identifier-v1'), null);
  assert.equal(ls.getItem('recentEmails'), history);
  assert.equal(ls.getItem('consent'), 'keep');
  assert.equal(ss.getItem('environment'), 'keep');
  assert.equal(f.elements.customerEmail.value, '');
  assert.ok(f.drawerClears > 0);
  assert.deepEqual(f.sdkCalls.map((call) => call.command), ['getIdentity']);
  assert.equal(f.events.filter((event) => event.type === 'aep-demo-visitor-reset-complete').length, 0);
});

test('cookie expiration targets identity/cluster and legacy cookies, including parent domains and ancestor paths, not consent or other orgs', async () => {
  const f = fixture({
    config: { orgId: 'TEST@AdobeOrg' },
    cookies: 'kndctr_TEST_AdobeOrg_identity=a; kndctr_TEST_AdobeOrg_consent=in; AMCV_TEST%40AdobeOrg=b; kndctr_OTHER_AdobeOrg_identity=c; consent=keep'
  });
  await f.api.reset();
  const names = new Set(f.cookieWrites.map((value) => value.split('=')[0]));
  assert.ok(names.has('kndctr_TEST_AdobeOrg_identity'));
  assert.ok(names.has('kndctr_TEST_AdobeOrg_cluster'));
  assert.ok(names.has('AMCV_TEST%40AdobeOrg'));
  assert.ok(!names.has('kndctr_TEST_AdobeOrg_consent'));
  assert.ok(!names.has('kndctr_OTHER_AdobeOrg_identity'));
  assert.ok(!names.has('consent'));
  assert.ok(f.cookieWrites.some((value) => value.includes('Domain=.example.com')));
  assert.ok(f.cookieWrites.some((value) => value.includes('Path=/profile-viewer/demos;')));
  assert.ok(f.cookieWrites.every((value) => value.includes('Max-Age=0')));
});

test('ambiguous Adobe org cookies require explicit organization and perform no deletion', async () => {
  const f = fixture({ cookies: 'kndctr_ONE_AdobeOrg_identity=a; kndctr_TWO_AdobeOrg_identity=b' });
  await assert.rejects(f.api.reset(), /organization safely/);
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
  assert.equal(f.api.isBlocked(), true);
});

test('cancel leaves all state untouched', async () => {
  const f = fixture({ confirm: false });
  assert.equal(await f.api.reset(), false);
  assert.equal(f.api.isBlocked(), false);
  assert.equal(f.sdkCalls.length, 0);
  assert.equal(f.reloads, 0);
});

test('no configured SDK and no usable live ECID refuse reset rather than using a cache', async () => {
  for (const sdk of [false, () => Promise.resolve({})]) {
    const f = fixture({ sdk, localStorage: storage({ testLastResolvedEcidBySandbox: JSON.stringify({ apalmer: OLD }) }) });
    await assert.rejects(f.api.reset(), /SDK|ECID/);
    assert.equal(f.reloads, 0);
    assert.equal(f.cookieWrites.length, 0);
    assert.equal(f.api.isBlocked(), true);
    assert.equal(f.api.isPending(), false);
  }
});

test('hung old getIdentity is bounded and does not clear cookies or reload', async () => {
  const f = fixture({ sdk: () => new Promise(() => {}) });
  await assert.rejects(f.api.reset(), /Timed out reading/);
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
  assert.equal(f.api.getState().status, 'error');
});

test('beforeReset rejection preserves visitor data and blocks false success', async () => {
  const f = fixture();
  f.api.registerAdapter({ beforeReset() { throw new Error('Pending checkout cannot stop'); } });
  await assert.rejects(f.api.reset(), /Pending checkout/);
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
  assert.equal(f.elements.customerEmail.value, 'old@example.com');
  assert.equal(f.win.sessionStorage.getItem(MARKER), null);
});

test('storage failure cannot result in cookie deletion/reload without a persistent marker', async () => {
  const ss = storage();
  ss.setItem = () => { throw new Error('Storage disabled'); };
  const f = fixture({ sessionStorage: ss });
  await assert.rejects(f.api.reset(), /Storage disabled/);
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
});

test('restored reset is blocked before init, verifies a new ECID once, updates empty drawer and never sends an event', async () => {
  const ss = pendingStorage();
  const f = fixture({ sessionStorage: ss, sdk: () => Promise.resolve(result(FRESH)), init: false });
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.api.isPending(), true);
  assert.equal(f.api.isResetPage(), true);
  let invalidates = 0;
  let completions = 0;
  f.api.registerAdapter({
    invalidate() { invalidates++; },
    afterReset({ ecid }) { assert.equal(ecid, FRESH); completions++; }
  });
  assert.equal(f.api.init({ prefix: 'test', timeoutMs: 35 }), f.api);
  f.api.resume();
  await tick();
  assert.equal(f.api.isBlocked(), false);
  assert.equal(f.api.isPending(), false);
  assert.equal(f.api.isResetPage(), true);
  assert.equal(f.api.getState().status, 'complete');
  assert.ok(invalidates > 0);
  assert.equal(completions, 1);
  assert.equal(ss.getItem(MARKER), null);
  assert.equal(f.reloads, 0);
  assert.equal(f.patches.length, 1);
  assert.equal(f.patches[0].ecid, FRESH);
  assert.deepEqual(Array.from(f.patches[0].events), []);
  assert.deepEqual(Array.from(f.patches[0].audiences.realized), []);
  assert.deepEqual(f.sdkCalls.map((call) => call.command), ['getIdentity']);
  assert.equal(await f.api.acceptEcid(FRESH), true);
  assert.equal(completions, 1);
  assert.equal(f.events.filter((event) => event.type === 'aep-demo-visitor-reset-complete').length, 1);
});

test('late adapters receive verified completion and stale identity after success is rejected', async () => {
  const f = fixture({ sessionStorage: pendingStorage(), sdk: () => Promise.resolve(result(FRESH)) });
  await tick();
  let ecid;
  f.api.registerAdapter({ afterReset(detail) { ecid = detail.ecid; } });
  await tick();
  assert.equal(ecid, FRESH);
  await assert.rejects(f.api.acceptEcid(OLD), /stale or unavailable/);
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.patches.length, 1);
});

test('same ECID cannot succeed; acceptEcid rejects and failure remains blocked across reload', async () => {
  const ss = pendingStorage();
  const f = fixture({ sessionStorage: ss });
  await tick();
  await assert.rejects(f.api.acceptEcid(OLD), /previous ECID/);
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.api.isPending(), false);
  assert.equal(f.api.getState().status, 'error');
  assert.equal(f.patches.length, 0);
  const next = fixture({ sessionStorage: ss, sdk: () => Promise.resolve(result(FRESH)) });
  await tick();
  assert.equal(next.api.isBlocked(), true);
  assert.equal(next.sdkCalls.length, 0);
  assert.equal(next.reloads, 0);
});

test('restored SDK absent, unavailable identity, and hung identity time out/fail without false success', async () => {
  for (const sdk of [false, () => Promise.resolve({}), () => new Promise(() => {})]) {
    const f = fixture({ sessionStorage: pendingStorage(), sdk });
    await new Promise((resolve) => setTimeout(resolve, 55));
    assert.equal(f.api.isBlocked(), true);
    assert.equal(f.api.isPending(), false);
    assert.equal(f.api.getState().status, 'error');
    assert.equal(f.patches.length, 0);
    assert.ok(f.elements.aepLabProfileStatus.textContent.includes('failed'));
    assert.ok(f.events.some((event) => event.type === 'aep-demo-visitor-reset-state' && event.detail.status === 'error'));
    assert.equal(f.reloads, 0);
  }
});

test('a late getIdentity result after timeout cannot unblock the failed reset', async () => {
  let resolve;
  const f = fixture({
    sessionStorage: pendingStorage(),
    sdk: () => new Promise((done) => { resolve = done; })
  });
  await new Promise((done) => setTimeout(done, 55));
  resolve(result(FRESH));
  await tick();
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.patches.length, 0);
});

test('cross-tab invalidation clears stale UI, preserves settings, blocks until explicit reload and never replays events', async () => {
  const f = fixture({ localStorage: storage({ recentEmails: 'keep', datastream: 'keep' }) });
  let invalidations = 0;
  f.api.registerAdapter({ invalidate() { invalidations++; } });
  f.storageEvent({ id: 'other-tab', oldEcid: OLD, orgId: 'TEST' });
  await tick();
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.api.isPending(), false);
  assert.equal(f.api.getState().status, 'invalidated');
  assert.equal(f.elements.customerEmail.value, '');
  assert.equal(invalidations, 1);
  assert.equal(f.win.localStorage.getItem('recentEmails'), 'keep');
  assert.equal(f.win.localStorage.getItem('datastream'), 'keep');
  assert.equal(f.reloads, 0);
  assert.equal(f.sdkCalls.length, 0);
  await assert.rejects(f.api.acceptEcid(FRESH), /Another tab/);
  const next = fixture({ sessionStorage: f.win.sessionStorage, sdk: () => Promise.resolve(result(FRESH)) });
  await tick();
  assert.equal(next.api.getState().status, 'complete');
  assert.equal(next.reloads, 0);
});

test('an in-flight verification cannot restore stale UI after another tab invalidates it', async () => {
  let resolve;
  const f = fixture({ sessionStorage: pendingStorage(), sdk: () => new Promise((done) => { resolve = done; }) });
  f.storageEvent({ id: 'later-reset', oldEcid: FRESH, orgId: 'TEST' });
  resolve(result(FRESH));
  await tick();
  assert.equal(f.api.getState().status, 'invalidated');
  assert.equal(f.patches.length, 0);
});

test('reset restores a selected script through registered Tags session helper', async () => {
  const f = fixture({ config: { storagePrefix: 'custom' } });
  const writes = [];
  f.win.AepLabTagsInjectSession = {
    readScript(p, sk) { assert.equal(p, 'custom'); assert.equal(sk, 'apalmer'); return 'https://assets.adobedtm.com/custom.js'; },
    writeScript(...args) { writes.push(args); }
  };
  await f.api.reset();
  assert.deepEqual(writes, [['custom', 'apalmer', 'https://assets.adobedtm.com/custom.js']]);
  assert.equal(f.win.sessionStorage.getItem('customPendingLaunchInject'), writes[0][2]);
});

test('configured alternate SDK function is used and a successful reset page permits another explicit reset', async () => {
  const f = fixture({
    sessionStorage: pendingStorage(), sdk: false,
    config: { alloy: () => Promise.resolve(result(FRESH)), orgId: 'TEST@AdobeOrg' }
  });
  await tick();
  assert.equal(f.api.canReset(), true);
  await f.api.reset();
  assert.equal(f.reloads, 1);
  assert.equal(JSON.parse(f.win.sessionStorage.getItem(MARKER)).oldEcid, FRESH);
});

test('a concurrent stale ECID cannot borrow a new-identity verification promise', async () => {
  const f = fixture({ sessionStorage: pendingStorage(), sdk: false });
  let release;
  f.api.registerAdapter({
    afterReset() { return new Promise((resolve) => { release = resolve; }); }
  });
  const accepted = f.api.acceptEcid(FRESH);
  await tick();
  await assert.rejects(f.api.acceptEcid(OLD), /previous ECID/);
  release();
  await accepted;
  assert.equal(f.api.getState().status, 'error');
  assert.equal(f.api.isBlocked(), true);
  assert.equal(f.patches.length, 0);
});

test('concurrent reset clicks share one live capture and one reload', async () => {
  const f = fixture();
  const first = f.api.reset();
  const second = f.api.reset();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(f.reloads, 1);
  assert.equal(f.sdkCalls.length, 1);
});

test('adapter invalidation failure blocks the reset before cookies change or reload', async () => {
  const f = fixture();
  f.api.registerAdapter({ invalidate() { return Promise.reject(new Error('Cannot clear visitor state')); } });
  await assert.rejects(f.api.reset(), /Cannot clear visitor state/);
  assert.equal(f.api.getState().status, 'error');
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
  assert.equal(JSON.parse(f.win.sessionStorage.getItem(MARKER)).status, 'error');
});

test('another-tab reset while old identity capture is in flight prevents competing deletion/reload', async () => {
  let resolve;
  const f = fixture({ sdk: () => new Promise((done) => { resolve = done; }) });
  const resetting = f.api.reset();
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  resolve(result(OLD));
  await assert.rejects(resetting, /Another tab changed/);
  assert.equal(f.reloads, 0);
  assert.equal(f.cookieWrites.length, 0);
  assert.equal(f.api.isBlocked(), true);
});

function installAdobeStub(win, name) {
  // Match Adobe's assignment-expression bootstrap, including the first namespace push.
  (win.__alloyNS = win.__alloyNS || []).push(name);
  win[name] = function () {
    const args = arguments;
    return new Promise((resolve, reject) => {
      win[name].q.push([resolve, reject, args]);
    });
  };
  win[name].q = [];
  return win[name];
}

test('submission guard is installed at module evaluation before init or Tags restoration', async () => {
  const f = fixture({ sessionStorage: pendingStorage(), init: false });
  await assert.rejects(f.win.alloy('sendEvent', { xdm: {} }), { code: 'AEP_DEMO_VISITOR_BLOCKED' });
  assert.equal(f.sdkCalls.length, 0);
  assert.deepEqual(await f.win.alloy('getIdentity', { namespaces: ['ECID'] }), result(OLD));
  assert.equal(f.sdkCalls.length, 1);
  assert.equal(Object.getOwnPropertyDescriptor(f.win, 'alloy').configurable, true);
});

test('existing SDK proxy preserves properties, shared queue, symbols, and caller receiver', async () => {
  const symbol = Symbol('sdk-property');
  const queue = [];
  const receiver = { custom: true };
  let seenReceiver;
  let seenArgs;
  let raw;
  const f = fixture({
    beforeLoad(win) {
      raw = function (...args) {
        seenReceiver = this;
        seenArgs = args;
        return 'original-result';
      };
      raw.q = queue;
      raw.metadata = { version: 1 };
      raw[symbol] = 'symbol-value';
      win.alloy = raw;
    }
  });
  const wrapped = f.win.alloy;
  assert.notEqual(wrapped, raw);
  assert.equal(wrapped.q, queue);
  assert.equal(wrapped.metadata, raw.metadata);
  assert.equal(wrapped[symbol], 'symbol-value');
  wrapped.newProperty = 12;
  assert.equal(raw.newProperty, 12);
  assert.equal(wrapped.call(receiver, 'sendEvent', { test: true }), 'original-result');
  assert.equal(seenReceiver, receiver);
  assert.deepEqual(seenArgs, ['sendEvent', { test: true }]);
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  await assert.rejects(wrapped.call(receiver, 'sendEvent', {}), /sendEvent blocked/);
  assert.equal(wrapped.call(receiver, 'getIdentity'), 'original-result');
});

test('queued SDK rejects existing sendEvent on invalidation and retains configure/getIdentity entries', async () => {
  const f = fixture({ sdk: false });
  const fn = installAdobeStub(f.win, 'alloy');
  const configured = fn('configure', { orgId: 'TEST@AdobeOrg' });
  const identity = fn('getIdentity');
  const sending = fn('sendEvent', { xdm: { identityMap: {} } });
  const rejected = assert.rejects(sending, { code: 'AEP_DEMO_VISITOR_BLOCKED' });
  assert.equal(fn.q.length, 3);
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  await rejected;
  assert.deepEqual(fn.q.map((entry) => entry[2][0]), ['configure', 'getIdentity']);
  await assert.rejects(fn('sendEvent', {}), /sendEvent blocked/);
  fn.q[0][0]('configured');
  fn.q[1][0](result(FRESH));
  assert.equal(await configured, 'configured');
  assert.deepEqual(await identity, result(FRESH));
});

test('existing bootstrap queue is drained of sends before pending reset init', async () => {
  let rejected;
  let queue;
  const f = fixture({
    sessionStorage: pendingStorage(), init: false, sdk: false,
    beforeLoad(win) {
      const stub = installAdobeStub(win, 'alloy');
      stub.q.push([
        () => assert.fail('queued send resolved'),
        (error) => { rejected = error; },
        ['sendEvent', { stale: true }]
      ]);
      stub.q.push([() => {}, () => {}, ['getIdentity']]);
      queue = stub.q;
    }
  });
  assert.equal(rejected.code, 'AEP_DEMO_VISITOR_BLOCKED');
  assert.equal(f.win.alloy.q, queue);
  assert.deepEqual(queue.map((entry) => entry[2][0]), ['getIdentity']);
});

test('late named instances from Adobe __alloyNS bootstrap and replacement functions are guarded synchronously', async () => {
  const f = fixture({ sdk: false });
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  assert.equal(f.win.alloy, undefined);
  const stub = installAdobeStub(f.win, 'customEdge');
  assert.deepEqual(Array.from(f.win.__alloyNS), ['customEdge']);
  await assert.rejects(stub('sendEvent', {}), /sendEvent blocked/);
  let calls = 0;
  f.win.customEdge = (command) => { calls++; return command; };
  await assert.rejects(f.win.customEdge('sendEvent', {}), /sendEvent blocked/);
  assert.equal(f.win.customEdge('getIdentity'), 'getIdentity');
  assert.equal(calls, 1);
  f.win.alloy = (command) => { calls++; return command; };
  await assert.rejects(f.win.alloy('sendEvent', {}), /sendEvent blocked/);
  assert.equal(calls, 1);
});

test('namespace array assignment observes existing and future custom names', async () => {
  const f = fixture({ sdk: false, config: { alloyInstanceName: 'namedSdk' } });
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  f.win.__alloyNS = ['firstSdk'];
  f.win.firstSdk = () => 'should-not-send';
  f.win.__alloyNS[1] = 'secondSdk';
  f.win.secondSdk = () => 'should-not-send';
  f.win.namedSdk = () => 'should-not-send';
  for (const name of ['firstSdk', 'secondSdk', 'namedSdk']) {
    await assert.rejects(f.win[name]('sendEvent', {}), /sendEvent blocked/);
  }
});

test('submission guard allows explicit sendEvent again after successful verification', async () => {
  const commands = [];
  const f = fixture({
    sessionStorage: pendingStorage(),
    sdk(command) {
      commands.push(command);
      return Promise.resolve(command === 'getIdentity' ? result(FRESH) : { sent: true });
    }
  });
  await tick();
  assert.equal(f.api.isResetPage(), true);
  assert.deepEqual(await f.win.alloy('sendEvent', { explicit: true }), { sent: true });
  assert.deepEqual(commands, ['getIdentity', 'sendEvent']);
});

test('failed resets continue rejecting sendEvent while getIdentity remains available for retry', async () => {
  const f = fixture({ sessionStorage: pendingStorage() });
  await tick();
  assert.equal(f.api.getState().status, 'error');
  await assert.rejects(f.win.alloy('sendEvent', {}), /sendEvent blocked/);
  assert.deepEqual(await f.win.alloy('getIdentity'), result(OLD));
  assert.deepEqual(f.sdkCalls.map((call) => call.command), ['getIdentity', 'getIdentity']);
});

test('same-origin iframe windows can be guarded before SDK creation and retain parent blocked-state gate', async () => {
  const f = fixture();
  const child = { document: {} };
  assert.equal(f.api.guardSdkWindow(child), true);
  installAdobeStub(child, 'childEdge');
  const queued = child.childEdge('sendEvent', {});
  const rejected = assert.rejects(queued, /sendEvent blocked/);
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  await rejected;
  child.childEdge = (command) => command;
  await assert.rejects(child.childEdge('sendEvent', {}), /sendEvent blocked/);
  assert.equal(child.childEdge('getIdentity'), 'getIdentity');
});

test('existing and newly loaded same-origin frames receive submission guards', async () => {
  const child = { document: {} };
  const frameListeners = {};
  const frame = {
    contentWindow: child,
    addEventListener(type, fn) { frameListeners[type] = fn; }
  };
  const f = fixture({
    beforeLoad(win) { win.document.querySelectorAll = () => [frame]; }
  });
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  child.alloy = () => 'should-not-send';
  await assert.rejects(child.alloy('sendEvent', {}), /sendEvent blocked/);
  const navigatedChild = { document: {}, alloy: () => 'should-not-send' };
  frame.contentWindow = navigatedChild;
  frameListeners.load();
  await assert.rejects(navigatedChild.alloy('sendEvent', {}), /sendEvent blocked/);
});

test('a same-origin frame navigating cross-origin cannot break the reset state transition', () => {
  const child = { document: {} };
  const f = fixture();
  const { proxy, revoke } = Proxy.revocable(child, {});
  f.api.guardSdkWindow(proxy);
  revoke();
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  assert.equal(f.api.getState().status, 'invalidated');
  assert.ok(f.api.getGuardWarnings().some((message) => message.includes('no longer accessible')));
});

test('non-configurable SDK globals, cross-origin frames, and unsupported redefinitions produce explicit coverage warnings', () => {
  const f = fixture();
  const fixed = { document: {} };
  const fn = () => 'unchanged';
  Object.defineProperty(fixed, 'alloy', { value: fn, configurable: false });
  assert.equal(f.api.guardSdkWindow(fixed), true);
  assert.equal(fixed.alloy, fn);
  const crossOrigin = {};
  Object.defineProperty(crossOrigin, 'document', { get() { throw new Error('SecurityError'); } });
  assert.equal(f.api.guardSdkWindow(crossOrigin), false);
  Object.defineProperty(f.win, 'alloy', { value: fn, configurable: true, writable: true });
  f.storageEvent({ id: 'later-reset', oldEcid: OLD, orgId: 'TEST' });
  const warnings = f.api.getGuardWarnings();
  assert.ok(warnings.some((message) => message.includes('non-configurable')));
  assert.ok(warnings.some((message) => message.includes('iframe SDK')));
  assert.ok(warnings.some((message) => message.includes('redefined')));
  f.api.guardSdkWindow(f.win);
  assert.notEqual(f.win.alloy, fn);
});
