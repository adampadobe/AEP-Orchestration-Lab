'use strict';

const { it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { instrumentRenderedHtml } = require('../demoRenderRuntime');

it('instruments before uploaded scripts without changing the stored source or doctype', () => {
  const source = '<!doctype html><html><head><script>localStorage.getItem("x")</script></head><body>Original</body></html>';
  const rendered = instrumentRenderedHtml(source);
  assert.ok(rendered.startsWith('<!doctype html><script data-aep-demo-runtime>'));
  assert.ok(rendered.indexOf('data-aep-demo-runtime') < rendered.indexOf('localStorage.getItem("x")'));
  assert.ok(rendered.endsWith(source.slice('<!doctype html>'.length)));
  assert.equal(instrumentRenderedHtml('<p>Fragment</p>').endsWith('<p>Fragment</p>'), true);
  assert.ok(instrumentRenderedHtml('<!-- exported deck -->\n<!doctype html><p>Deck</p>')
    .startsWith('<!-- exported deck -->\n<!doctype html><script'));
});

it('provides independent document-private storage and captures diagnostic errors', () => {
  const listeners = {};
  const reports = [];
  const warnings = [];
  const callbacks = [];
  const parent = { postMessage: (data) => reports.push(data) };
  const window = { parent, addEventListener: (name, fn) => { listeners[name] = fn; } };
  for (const name of ['localStorage', 'sessionStorage']) {
    Object.defineProperty(window, name, { configurable: true, get() {
      const error = new Error('sandbox');
      error.name = 'SecurityError';
      throw error;
    } });
  }
  const context = {
    window, location: { search: '?demoCheck=nonce' }, URLSearchParams, Set, Map,
    console: { warn: (msg) => warnings.push(msg) },
    clearTimeout() {},
    setTimeout(fn) { callbacks.push(fn); return callbacks.length; },
    document: { body: {}, querySelector: () => null, documentElement: { scrollWidth: 500 }, images: [] },
    innerWidth: 500, innerHeight: 800,
  };
  vm.runInNewContext(instrumentRenderedHtml('').match(/<script[^>]*>([\s\S]*)<\/script>/)[1], context);
  assert.equal(warnings.length, 2);
  window.localStorage.setItem('speed', 8);
  window.localStorage.setItem('second', true);
  assert.equal(window.localStorage.getItem('speed'), '8');
  assert.equal(window.localStorage.length, 2);
  assert.equal(window.localStorage.key(0), 'speed');
  assert.equal(window.localStorage.key(99), null);
  assert.equal(window.sessionStorage.getItem('speed'), null);
  window.localStorage.removeItem('speed');
  assert.equal(window.localStorage.getItem('speed'), null);
  window.localStorage.clear();
  assert.equal(window.localStorage.length, 0);
  listeners.error({ target: window });
  callbacks.at(-1)();
  assert.deepEqual(Array.from(reports[0].issues), ['temporary-storage', 'script-error']);
  assert.equal(reports[0].channel, 'nonce');
});
