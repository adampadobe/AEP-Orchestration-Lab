import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../web/profile-viewer/profile-generation-prefs-sync.js', import.meta.url),
  'utf8',
);

function createHarness({ authenticated = true, fetchImpl } = {}) {
  const timers = [];
  const local = new Map();
  const calls = [];
  let localCounter = 1;
  let localIncrements = 0;
  const shared = {
    readBaseEmail: () => local.get('email') || 'old@example.com',
    writeBaseEmail: (_sandbox, value) => local.set('email', value),
    readBaseMobile: () => local.get('mobile') || '',
    writeBaseMobile: (_sandbox, value) => local.set('mobile', value),
    readCounter: () => localCounter,
    persistCounter: (_sandbox, _email, value) => {
      localCounter = value;
    },
    incrementCounter: () => {
      localIncrements += 1;
      localCounter += 1;
      return localCounter;
    },
    scaleEmail: (email, counter) => `${email}:${counter}`,
  };
  const window = {
    AepGlobalSandbox: { getSandboxName: () => 'apalmer' },
    AepLabSandboxSync: {
      whenReady: Promise.resolve(),
      getAuthHeaders: async () => (
        authenticated ? { Authorization: 'Bearer test-token' } : {}
      ),
    },
    AepProfileGenShared: shared,
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(fn, delay) {
      const timer = { fn, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
  };
  const context = {
    window,
    document: {
      hidden: false,
      readyState: 'complete',
      addEventListener() {},
      querySelectorAll: () => [],
    },
    localStorage: {
      getItem: (key) => local.get(key) || null,
      setItem: (key, value) => local.set(key, value),
    },
    CustomEvent: class CustomEvent {
      constructor(type, options) {
        this.type = type;
        this.detail = options?.detail;
      }
    },
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      if (fetchImpl) return fetchImpl(url, options, calls.length);
      const body = options.body ? JSON.parse(options.body) : {};
      return {
        ok: true,
        status: 200,
        async json() {
          if (url.endsWith('/next-email')) {
            return {
              ok: true,
              baseEmail: body.baseEmail || local.get('email') || 'new@example.com',
              scaledEmail: 'new+15042026-1@example.com',
              counterN: 1,
              nextCounterN: 2,
            };
          }
          return {
            ok: true,
            prefs: {
              baseEmail: body.baseEmail || local.get('email') || '',
              mobilePhone: body.mobilePhone || local.get('mobile') || '',
              counterN: body.counterN || localCounter,
            },
          };
        },
      };
    },
    clearTimeout(timer) {
      if (timer) timer.cleared = true;
    },
    setTimeout: window.setTimeout,
    console,
  };
  vm.runInNewContext(source, context, { filename: 'profile-generation-prefs-sync.js' });
  return {
    api: window.AepProfileGenPrefsSync,
    calls,
    timers,
    localIncrements: () => localIncrements,
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('rapid preference edits are merged into one server patch', async () => {
  const harness = createHarness();
  harness.api.scheduleSave({ baseEmail: 'new@example.com' }, 'apalmer');
  harness.api.scheduleSave({ mobilePhone: '+447700900123' }, 'apalmer');
  const timer = harness.timers.findLast((entry) => entry.delay === 400 && !entry.cleared);
  timer.fn();
  await settle();

  assert.equal(harness.calls.length, 1);
  assert.deepEqual(
    JSON.parse(harness.calls[0].options.body),
    {
      sandbox: 'apalmer',
      baseEmail: 'new@example.com',
      mobilePhone: '+447700900123',
    },
  );
});

test('email reservation flushes a pending base email before advancing the counter', async () => {
  const harness = createHarness();
  harness.api.scheduleSave({ baseEmail: 'new@example.com' }, 'apalmer');

  const result = await harness.api.reserveNextEmail('apalmer', 'new@example.com');

  assert.equal(result.ok, true);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(harness.calls[0].options.body).baseEmail, 'new@example.com');
  assert.equal(harness.calls[1].options.method, 'POST');
  assert.match(harness.calls[1].url, /next-email$/);
});

test('authenticated reservation failure does not consume the local counter', async () => {
  const harness = createHarness({
    fetchImpl: async () => ({
      ok: false,
      status: 503,
      async json() {
        return { ok: false, error: 'Firestore unavailable' };
      },
    }),
  });

  const result = await harness.api.reserveNextEmail('apalmer', 'old@example.com');

  assert.equal(result.ok, false);
  assert.equal(harness.localIncrements(), 0);
  assert.match(result.error, /Firestore unavailable/);
});

test('local-only sessions retain device counter reservation', async () => {
  const harness = createHarness({ authenticated: false });

  const result = await harness.api.reserveNextEmail('apalmer', 'old@example.com');

  assert.equal(result.ok, true);
  assert.equal(result.source, 'localStorage');
  assert.equal(harness.calls.length, 0);
  assert.equal(harness.localIncrements(), 1);
});
