'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] || null; }
  removeAttribute(key) { delete this.attributes[key]; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  focus() {}
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); }
  showModal() { this.open = true; }
  close() { this.open = false; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get firstChild() { return this.children[0]; }
  get options() { return this.children; }
}

function harness(surface, responder = async () => ({ ok: true })) {
  const root = path.resolve(__dirname, '../../web/profile-viewer');
  const html = fs.readFileSync(path.join(root, `demo-${surface}.html`), 'utf8');
  const nodes = {};
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"/g)) nodes[match[2]] = new Node(match[1]);
  const document = {
    readyState: 'loading', addEventListener() {}, title: '', activeElement: new Node(),
    getElementById: (id) => nodes[id] || (nodes[id] = new Node()),
    createElement: (tag) => new Node(tag), createDocumentFragment: () => new Node(),
    createTextNode: (text) => Object.assign(new Node(), { textContent: text }),
    body: new Node('body'), documentElement: new Node('html'),
  };
  const storage = new Map(), requests = [];
  const location = { href: `https://lab.example/profile-viewer/demo-${surface}.html`, search: '', pathname: `/demo-${surface}.html` };
  const popup = { location: {}, close() { this.closed = true; } };
  const window = { location, open: () => popup, confirm: () => true, prompt: () => 'Meeting preparation',
    addEventListener() {}, firebaseDatabaseConfig: { projectId: 'fixture-project' } };
  const context = {
    document, window, location, history: { replaceState() {} }, console, URL, URLSearchParams, AbortController,
    setInterval: () => 1, clearInterval() {},
    sessionStorage: { getItem: (key) => storage.get(key), setItem: (key, val) => storage.set(key, val), removeItem: (key) => storage.delete(key) },
    fetch: async (url, opts) => {
      const body = opts.body ? JSON.parse(opts.body) : null;
      requests.push({ url, body, method: opts.method });
      const result = await responder(url, body, opts);
      return { ok: result.ok !== false, status: result.status || (result.ok === false ? 500 : 200), json: async () => result };
    },
  };
  const exports = surface === 'studio'
    ? 'loadCurrentFrame,previewVersion,present,applyProposal,discardProposal,loadVersions,send,newChat,selectConversation,renderHeader,restoreVersion'
    : 'handleDeepLinks,loadIntoEditor,runSuggest,acceptSuggestion,undoSuggestion,formPayload,loadStepVersions,checkFlow';
  let source = fs.readFileSync(path.join(root, `demo-${surface}.js`), 'utf8');
  source = source.replace(/\}\)\(\);\s*$/, `globalThis.ui = {state,${exports}, setEls(value) { els = value; }}; })();`);
  vm.runInNewContext(source, context, { filename: `demo-${surface}.js` });
  const ui = context.ui;
  ui.state.user = { getIdToken: async () => 'fixture-token' };
  const els = surface === 'studio'
    ? { frameCurrent: nodes.studioFrameCurrent, frameProposed: nodes.studioFrameProposed, frames: nodes.studioFrames,
      status: nodes.studioStatus, tabCurrent: nodes.studioTabCurrent, tabProposed: nodes.studioTabProposed, tabSplit: nodes.studioTabSplit,
      proposalBar: nodes.studioProposalBar, apply: nodes.studioApply, discard: nodes.studioDiscard, versions: nodes.studioVersions, versionCount: nodes.studioVersionCount,
      messages: nodes.studioMessages, chips: nodes.studioChips, send: nodes.studioSend, stop: nodes.studioStop,
      input: nodes.studioInput, newChat: nodes.studioNewChat }
    : { form: nodes.flowForm, empty: nodes.flowEmpty, steps: nodes.flowSteps, totals: nodes.flowTotals, list: nodes.flowsList,
      search: nodes.flowsSearch, flowStatus: nodes.flowStatus, assetSearch: nodes.assetSearch, assetResults: nodes.assetResults,
      del: nodes.flowDelete, present: nodes.flowPresent, suggestForm: nodes.suggestForm, suggestRun: nodes.suggestRun,
      suggestError: nodes.suggestError, suggestDialog: nodes.suggestDialog };
  if (surface === 'studio') {
    ui.state.assetId = 'asset_001';
    ui.state.asset = { id: 'asset_001', currentVersionId: 'version_current', title: 'Airline demo' };
  } else {
    els.form.elements = {};
    for (const name of ['title', 'customer', 'conversationType', 'description']) els.form.elements[name] = new Node('input');
    els.suggestForm.elements = {};
    for (const name of ['goal', 'customer', 'minutes', 'model']) els.suggestForm.elements[name] = new Node('input');
    els.suggestForm.elements.minutes.value = '30';
    ui.state.assets = [{ id: 'asset_001', title: 'Airline demo', currentVersionId: 'version_current', customer: 'Airline' }];
    ui.state.assetById = { asset_001: ui.state.assets[0] };
  }
  ui.setEls(els);
  if (surface !== 'studio') ui.loadIntoEditor({ id: 'flow_001', title: 'Meeting', steps: [{ assetId: 'asset_001', versionId: 'version_old', title: 'Opening', talkTrack: 'Keep this', durationMin: 5 }] });
  return { ui, nodes, requests, els, location, popup };
}

test('Studio historical preview labels selected content and Present pins the same version', async () => {
  const h = harness('studio', async (_url, body) => ({ ok: true, url: 'https://render.example/' + body.versionId }));
  await h.ui.loadCurrentFrame();
  await h.ui.previewVersion('version_old');
  assert.equal(h.nodes.studioTabCurrent.textContent, 'Historical');
  assert.equal(h.nodes.studioBackCurrent.hidden, false);
  await h.ui.present();
  assert.equal(h.requests.at(-1).body.versionId, 'version_old');
  assert.equal(h.popup.location.href, 'https://render.example/version_old');
  await h.ui.previewVersion('version_current');
  assert.equal(h.nodes.studioTabCurrent.textContent, 'Current');
  assert.equal(h.nodes.studioBackCurrent.hidden, true);
});

test('Studio failed discard retains the proposal and reports an actionable error', async () => {
  const h = harness('studio', async () => ({ ok: false, error: 'Storage unavailable' }));
  h.ui.state.proposal = { id: 'proposal_001' };
  await h.ui.discardProposal();
  assert.equal(h.ui.state.proposal.id, 'proposal_001');
  assert.match(h.nodes.studioStatus.textContent, /Could not discard.*Storage unavailable/);
  assert.equal(h.nodes.studioDiscard.disabled, false);
});

test('Studio paged history keeps previously loaded versions reachable', async () => {
  const h = harness('studio', async (url) => url.includes('cursor=')
    ? { ok: true, versions: [{ id: 'older_001', note: 'Original' }], nextCursor: null }
    : { ok: true, versions: [{ id: 'version_current', current: true, note: 'Latest' }], nextCursor: 'older' });
  h.ui.state.selectedVersionId = 'version_current';
  await h.ui.loadVersions();
  assert.equal(h.nodes.studioMoreVersions.hidden, false);
  await h.ui.loadVersions(true);
  assert.equal(h.ui.state.versions.length, 2);
  assert.equal(h.nodes.studioMoreVersions.hidden, true);
});

test('Studio restore cannot silently discard a pending proposal', async () => {
  const h = harness('studio');
  h.ui.state.proposal = { id: 'proposal_001' };
  await h.ui.restoreVersion({ id: 'version_old' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.ui.state.proposal.id, 'proposal_001');
  assert.match(h.nodes.studioStatus.textContent, /Apply or discard/);
});

test('Studio conversation loading prevents sending into the previous conversation', async () => {
  let complete;
  const h = harness('studio', () => new Promise((resolve) => { complete = resolve; }));
  h.nodes.studioConversation.value = 'conversation_002';
  const pending = h.ui.selectConversation();
  await new Promise((resolve) => setImmediate(resolve));
  await h.ui.send({ intent: 'review', message: 'Do not send to old conversation' });
  assert.equal(h.requests.length, 1);
  assert.equal(h.nodes.studioSend.disabled, true);
  complete({ ok: true, conversation: { messages: [] } });
  await pending;
  assert.equal(h.ui.state.conversationId, 'conversation_002');
  assert.equal(h.nodes.studioSend.disabled, false);
});

test('Studio cannot discard a proposal while it is being applied', async () => {
  let complete;
  const h = harness('studio', () => new Promise((resolve) => { complete = resolve; }));
  h.ui.state.proposal = { id: 'proposal_001' };
  const pending = h.ui.applyProposal();
  await new Promise((resolve) => setImmediate(resolve));
  await h.ui.discardProposal();
  assert.equal(h.requests.length, 1);
  complete({ ok: false, error: 'Version conflict' });
  await pending;
  assert.equal(h.ui.state.proposal.id, 'proposal_001');
  assert.equal(h.nodes.studioDiscard.disabled, false);
});

test('Flow suggestion is review-only until accepted, preserves pins, and supports Undo', async () => {
  const h = harness('flows', async () => ({ ok: true, suggestion: { title: 'Suggested', rationale: 'Business then platform',
    steps: [{ assetId: 'asset_001', title: 'New opening', talkTrack: 'New notes', transition: 'Connect to the platform.', durationMin: 10 }] } }));
  await h.ui.runSuggest({ preventDefault() {} });
  assert.equal(h.ui.state.steps[0].talkTrack, 'Keep this');
  assert.equal(h.nodes.flowSuggestionReview.open, true);
  assert.equal(h.requests[0].body.steps[0].versionId, 'version_old');
  h.ui.acceptSuggestion();
  assert.equal(h.ui.state.steps[0].versionId, 'version_old');
  assert.equal(h.ui.state.steps[0].talkTrack, 'New notes');
  assert.equal(h.ui.formPayload().steps[0].transition, 'Connect to the platform.');
  h.ui.undoSuggestion();
  assert.equal(h.ui.state.steps[0].talkTrack, 'Keep this');
  assert.equal(h.ui.state.steps[0].versionId, 'version_old');
});

test('Flow edits made during AI work are not overwritten', async () => {
  let complete;
  const h = harness('flows', () => new Promise((resolve) => { complete = resolve; }));
  const pending = h.ui.runSuggest({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  h.els.form.elements.title.value = 'My newer title';
  complete({ ok: true, suggestion: { steps: [{ assetId: 'asset_001', talkTrack: 'Replacement' }] } });
  await pending;
  h.ui.acceptSuggestion();
  assert.equal(h.ui.state.steps[0].talkTrack, 'Keep this');
  assert.equal(h.els.form.elements.title.value, 'My newer title');
  assert.match(h.els.flowStatus.textContent, /changed while Gemini/);
});

test('Batch library deep link adds chosen assets rather than unrelated recent items', () => {
  const h = harness('flows');
  h.location.search = '?assets=asset_001';
  h.ui.state.dirty = false;
  h.ui.handleDeepLinks();
  assert.equal(h.ui.state.current.id, null);
  assert.equal(h.ui.state.steps.length, 1);
  assert.equal(h.ui.state.steps[0].assetId, 'asset_001');
  assert.equal(h.ui.state.steps[0].currentVersionAtSave, 'version_current');
});

test('Rehearsal blocks presentation when a saved asset/version is unavailable', async () => {
  const h = harness('flows', async () => ({ ok: true, check: { ready: false,
    issues: [{ stepIndex: 0, severity: 'error', message: 'Asset is in Trash' }] } }));
  await h.ui.checkFlow(true);
  assert.equal(h.nodes.flowCheckContinue.hidden, true);
  assert.match(h.nodes.flowCheckIssues.textContent, /Step 1.*Trash/);
});
