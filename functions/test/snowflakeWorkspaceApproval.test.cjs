'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {resolve} = require('node:path');
const {createApprovalPanel} = require('../../web/profile-viewer/snowflake-workspace-approval');

const previewId = 'c19882d0-822e-4ab4-91d0-e2f23e9db4be';

test('approval panel assets and script load order match the canonical and Express surfaces', () => {
  for (const filename of ['snowflake-workspace-approval.js', 'profile-generation-snowflake.js',
    'profile-generation-snowflake.css', 'profile-generation-snowflake.html']) {
    assert.equal(readFileSync(resolve(__dirname, '../../web/profile-viewer', filename), 'utf8'),
      readFileSync(resolve(__dirname, '../../aep-prototypes/AEP Profile/03 Profile Viewer/public', filename), 'utf8'), filename);
  }
  const html = readFileSync(resolve(__dirname, '../../web/profile-viewer/profile-generation-snowflake.html'), 'utf8');
  assert.ok(html.indexOf('<script src="snowflake-workspace-approval.js') <
    html.indexOf('<script src="profile-generation-snowflake.js'));
});

function fixture() {
  const elements = Object.fromEntries(['id', 'load', 'review', 'details', 'confirm', 'approve', 'message']
    .map(key => [key, {value: '', checked: false, textContent: '', hidden: false, disabled: false,
      listeners: {}, attributes: {},
      addEventListener(event, callback) { this.listeners[event] = callback; },
      setAttribute(key, value) { this.attributes[key] = value; }}]));
  Object.defineProperty(elements.details, 'innerHTML', {set() { throw Error('Unsafe rendering'); }});
  let time = 0;
  let context = {uid: 'u1', sandbox: 'apalmer', epoch: 0};
  let respond = async action => action === 'change_get' ? {
    ok: true, preview_id: previewId, state: 'previewed',
    sql: 'INSERT INTO "DB"."SCHEMA"."T" ("VALUE") VALUES (?)',
    bindings: ['<img src=x onerror=alert(1)>'],
    operation: {kind: 'insert', table: 'T', values: {VALUE: '<img src=x onerror=alert(1)>'}},
    targets: ['DB.SCHEMA.T'], context: {account: 'test-account', role: 'ROLE'},
    serverNow: '2026-11-05T00:00:00Z', expiresAt: '2026-11-05T00:10:00Z',
  } : {ok: true, preview_id: previewId, approved: true};
  const calls = [];
  let timer;
  const panel = createApprovalPanel({elements, clock: () => time,
    context: () => ({...context}), isCurrent: saved => saved.uid === context.uid &&
      saved.sandbox === context.sandbox && saved.epoch === context.epoch,
    schedule: fn => { timer = fn; return fn; }, cancel: fn => { if (fn === timer) timer = null; },
    request: async (action, id, context) => {
      calls.push({action, id, context});
      return respond(action, id);
    }});
  elements.id.value = previewId;
  return {elements, calls, panel, click: key => elements[key].listeners.click(),
    respond(fn) { respond = fn; }, advance(ms) { time += ms; },
    context(patch) { context = {...context, ...patch}; },
    confirm() { elements.confirm.checked = true; elements.confirm.listeners.change(); },
    expire() { timer(); }};
}

test('review loads only authoritative data, safely renders bound values, and requires explicit confirmation', async () => {
  const f = fixture();
  f.elements.id.value = previewId.toUpperCase();
  await f.click('approve');
  assert.equal(f.calls.length, 0);
  await f.click('load');
  assert.deepEqual(f.calls.map(c => c.action), ['change_get']);
  const displayed = JSON.parse(f.elements.details.textContent);
  assert.equal(displayed.sandbox, 'apalmer');
  assert.equal(displayed.context.role, 'ROLE');
  assert.match(displayed.bindings[0], /<img/);
  assert.equal(f.elements.review.hidden, false);
  assert.equal(f.elements.approve.disabled, true);
  f.confirm();
  assert.equal(f.elements.approve.disabled, false);
  await f.click('approve');
  assert.deepEqual(f.calls.map(c => c.action), ['change_get', 'change_approve']);
  assert.equal(f.calls[1].id, previewId);
  assert.equal(f.elements.review.hidden, true);
  assert.match(f.elements.message.textContent, /Nothing was executed/);
  await f.click('approve');
  assert.equal(f.calls.length, 2, 'Approval is never replayed and apply is never called');
});

test('editing the ID clears the review; an invalid ID is rejected without a request', async () => {
  const f = fixture();
  await f.click('load');
  f.confirm();
  f.elements.id.value = 'invalid';
  f.elements.id.listeners.input();
  assert.equal(f.elements.details.textContent, '');
  assert.equal(f.elements.approve.disabled, true);
  await f.click('load');
  assert.equal(f.calls.length, 1);
  assert.match(f.elements.message.textContent, /preview UUID/);
});

test('Portal deep links load the matching preview but never preselect approval', async () => {
  const f = fixture();
  await f.panel.loadPreviewFromLink(previewId, 'apalmer');
  assert.deepEqual(f.calls.map(call => call.action), ['change_get']);
  assert.equal(f.elements.id.value, previewId);
  assert.equal(f.elements.review.hidden, false);
  assert.equal(f.elements.confirm.checked, false);
  assert.equal(f.elements.approve.disabled, true);

  const wrongSandbox = fixture();
  await wrongSandbox.panel.loadPreviewFromLink(previewId, 'other');
  assert.equal(wrongSandbox.calls.length, 0);
  assert.match(wrongSandbox.elements.message.textContent, /targets sandbox other/);
});

test('owner, sandbox or connection changes clear loaded data and suppress in-flight review responses', async () => {
  for (const patch of [{uid: 'u2'}, {sandbox: 'other'}, {epoch: 1}]) {
    const f = fixture();
    await f.click('load');
    f.confirm();
    f.context(patch);
    await f.click('approve');
    assert.equal(f.calls.length, 1, 'Stale context cannot approve even before reset is delivered');
    f.panel.reset();
    assert.equal(f.elements.id.value, '');
    assert.equal(f.elements.details.textContent, '');
    assert.equal(f.elements.confirm.checked, false);
    assert.equal(f.elements.approve.disabled, true);
    let finish;
    f.elements.id.value = previewId;
    f.respond(() => new Promise(resolve => { finish = resolve; }));
    const pending = f.click('load');
    f.context({epoch: 2});
    f.panel.reset();
    finish({preview_id: previewId, state: 'previewed', sql: 'STALE'});
    await pending;
    assert.equal(f.elements.details.textContent, '');
    assert.equal(f.elements.review.hidden, true);
    assert.equal(f.elements.message.textContent, '');
  }
});

test('server-relative expiry clears review and prevents approving even when expiry timer is delayed', async () => {
  const f = fixture();
  await f.click('load');
  f.confirm();
  f.advance(600001);
  await f.click('approve');
  assert.equal(f.calls.length, 1);
  assert.equal(f.elements.approve.disabled, true);
  f.expire();
  assert.equal(f.elements.details.textContent, '');
  assert.match(f.elements.message.textContent, /expired/);
});

test('approval consumes the local confirmation before sending and never retries ambiguous responses', async () => {
  const f = fixture();
  await f.click('load');
  f.confirm();
  let finish;
  f.respond(() => new Promise((resolve, reject) => { finish = reject; }));
  const pending = f.click('approve');
  assert.equal(f.elements.details.textContent, '');
  assert.equal(f.elements.approve.disabled, true);
  await f.click('approve');
  assert.equal(f.calls.length, 2);
  finish(Error('Gateway timeout'));
  await pending;
  assert.match(f.elements.message.textContent, /may have been recorded/);
  assert.equal(f.elements.message.attributes['data-tone'], 'error');
  assert.equal(f.elements.approve.disabled, true);
  f.respond(async () => ({preview_id: previewId, state: 'approved',
    serverNow: '2026-11-05T00:00:00Z', expiresAt: '2026-11-05T00:10:00Z'}));
  await f.click('load');
  f.confirm();
  await f.click('approve');
  assert.equal(f.elements.approve.disabled, true);
  assert.equal(f.calls.length, 3);
  assert.match(f.elements.message.textContent, /cannot be approved again/);
});

test('failed or expired review never enables approval; network delay counts against remaining lifetime', async () => {
  for (const scenario of ['expired', 'slow', 'wrong-id', 'server-error']) {
    const f = fixture();
    f.respond(async () => {
      if (scenario === 'server-error') throw Error('Policy disabled');
      if (scenario === 'slow') f.advance(60001);
      return {preview_id: scenario === 'wrong-id' ? 'different' : previewId, state: 'previewed',
        serverNow: '2026-11-05T00:00:00Z',
        expiresAt: scenario === 'expired' ? '2026-11-04T00:00:00Z' : '2026-11-05T00:01:00Z'};
    });
    await f.click('load');
    f.confirm();
    await f.click('approve');
    assert.equal(f.calls.length, 1, scenario);
    assert.equal(f.elements.approve.disabled, true);
    assert.equal(f.elements.review.hidden, true);
    assert.equal(f.elements.message.attributes['data-tone'], 'error');
  }
});
