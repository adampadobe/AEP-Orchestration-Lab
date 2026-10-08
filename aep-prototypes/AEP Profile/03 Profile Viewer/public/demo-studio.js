/**
 * Demo Studio — review, edit and rebrand demo assets with Gemini.
 * Changes are returned as proposals (structured ops) that are previewed before applying as a new version.
 */
(function () {
  'use strict';

  var API = '/api/demo-assets';
  var state = { user: null, assetId: null, asset: null, conversationId: null, proposal: null, busy: false, controller: null, lastRequest: null };
  var els = {};

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function button(label, cls, onClick) {
    var b = el('button', cls || 'dashboard-btn-outline', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // /api/* Hosting rewrites cap at 60s; Gemini edits can take longer, so chat calls the function directly.
  function cloudFunctionsOrigin() {
    try {
      if (window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__) return String(window.__AEP_LAB_CLOUD_FUNCTIONS_ORIGIN__).replace(/\/+$/, '');
    } catch (_e) {}
    var pid = 'aep-orchestration-lab';
    try {
      if (window.firebaseDatabaseConfig && window.firebaseDatabaseConfig.projectId) pid = String(window.firebaseDatabaseConfig.projectId).trim() || pid;
    } catch (_e2) {}
    return 'https://us-central1-' + pid + '.cloudfunctions.net';
  }

  async function authHeaders() {
    var token = await state.user.getIdToken();
    return { Authorization: 'Bearer ' + token };
  }

  async function request(url, opts) {
    opts = opts || {};
    var headers = await authHeaders();
    var init = { method: opts.method || 'GET', headers: headers, signal: opts.signal };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch(url, init);
    var data = null;
    try { data = await res.json(); } catch (_e) { data = null; }
    if (!res.ok || !data || data.ok === false) {
      var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function assetPath(suffix) { return '/' + encodeURIComponent(state.assetId) + (suffix || ''); }
  function api(suffix, opts) { return request(API + assetPath(suffix), opts); }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.className = 'status' + (isError ? ' error' : '');
  }

  // ---- Minimal, escape-first markdown for assistant replies ----

  function inline(text) {
    var frag = document.createDocumentFragment();
    var re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var tok = m[0];
      frag.appendChild(tok[0] === '`' ? el('code', null, tok.slice(1, -1)) : el('strong', null, tok.slice(2, -2)));
      last = m.index + tok.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  function renderMarkdown(text) {
    var root = document.createDocumentFragment();
    var list = null;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
      if (bullet) {
        if (!list) { list = el('ul'); root.appendChild(list); }
        var li = el('li'); li.appendChild(inline(bullet[1])); list.appendChild(li);
        return;
      }
      list = null;
      if (!line.trim()) return;
      var p = el('p'); p.appendChild(inline(line.replace(/^#+\s*/, ''))); root.appendChild(p);
    });
    return root;
  }

  // ---- Messages ----

  function clearEmpty() {
    var empty = els.messages.querySelector('.demo-studio-empty');
    if (empty) empty.remove();
  }

  function addMessage(role, text, extra) {
    clearEmpty();
    var msg = el('div', 'demo-studio-msg');
    msg.dataset.role = role;
    var label = role === 'user' ? 'You' + (extra && extra.intent ? ' · ' + extra.intent : '') : role === 'error' ? 'Error' : 'Demo Studio';
    msg.appendChild(el('div', 'demo-studio-msg-label', label));
    if (role === 'assistant') msg.appendChild(renderMarkdown(text));
    else msg.appendChild(el('div', null, text));
    els.messages.appendChild(msg);
    els.messages.scrollTop = els.messages.scrollHeight;
    return msg;
  }

  function renderOps(msg, data) {
    var ops = data.ops || [];
    if (ops.length) {
      var ul = el('ul', 'demo-studio-ops');
      ops.forEach(function (o) {
        var li = el('li', null, (o.ok ? '✓ ' : '⚠ ') + (o.summary || o.op) + (o.ok ? '' : ' — ' + (o.error || 'not applied')));
        li.dataset.ok = String(!!o.ok);
        if (o.op === 'note') li.dataset.note = 'true';
        ul.appendChild(li);
      });
      msg.appendChild(ul);
    }
    if (data.validationErrors && data.validationErrors.length) {
      msg.appendChild(el('div', 'demo-studio-validation', 'Changes were blocked by safety checks: ' + data.validationErrors.join('; ')));
    }
    if (data.truncatedContext) {
      msg.appendChild(el('div', 'demo-studio-msg-label', 'Large document: Gemini saw an outline plus the most relevant sections.'));
    }
  }

  function renderChips(suggestions) {
    els.chips.textContent = '';
    (suggestions || []).forEach(function (s) {
      els.chips.appendChild(button(s, 'demo-studio-chip-btn', function () {
        els.input.value = s;
        els.input.focus();
      }));
    });
  }

  function currentIntent() {
    var checked = els.form.querySelector('input[name="intent"]:checked');
    return checked ? checked.value : 'edit';
  }

  function syncIntent() {
    var intent = currentIntent();
    els.target.hidden = intent !== 'rebrand';
    els.target.required = intent === 'rebrand';
    els.input.placeholder = intent === 'review'
      ? 'e.g. Review this as a conversation starter for a retail CMO'
      : intent === 'rebrand'
        ? 'e.g. Adapt for this customer — keep the decisioning story, swap destinations for their routes'
        : 'e.g. Change the hero headline to "Every journey, personalised"';
  }

  function setBusy(busy) {
    state.busy = busy;
    els.send.disabled = busy;
    els.stop.hidden = !busy;
    els.input.disabled = busy;
  }

  async function send(payload) {
    if (state.busy) return;
    state.lastRequest = payload;
    addMessage('user', payload.message, { intent: payload.intent });
    renderChips([]);
    var pending = addMessage('assistant', payload.intent === 'rebrand' ? 'Rebranding — this can take a minute or two…' : 'Thinking…');
    pending.classList.add('is-pending');
    setBusy(true);
    setStatus('');
    state.controller = new AbortController();
    try {
      var body = Object.assign({}, payload, { conversationId: state.conversationId || undefined });
      var data = await request(cloudFunctionsOrigin() + '/demoAssetsApi' + assetPath('/studio/chat'), {
        method: 'POST', body: body, signal: state.controller.signal,
      });
      pending.remove();
      if (data.conversationId) {
        state.conversationId = data.conversationId;
        try { sessionStorage.setItem('demoStudioConvo:' + state.assetId, data.conversationId); } catch (_e) {}
      }
      var msg = addMessage('assistant', data.reply);
      renderOps(msg, data);
      renderChips(data.suggestions);
      if (data.proposalId) await showProposal(data.proposalId, data);
    } catch (e) {
      pending.remove();
      var aborted = e && e.name === 'AbortError';
      var err = addMessage('error', aborted ? 'Stopped. The request may still finish on the server, but nothing is applied unless you click Apply.' : e.message);
      var actions = el('div', 'demo-studio-msg-actions');
      actions.appendChild(button('Retry', null, function () { err.remove(); send(state.lastRequest); }));
      err.appendChild(actions);
    } finally {
      setBusy(false);
      state.controller = null;
      els.input.focus();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    var message = els.input.value.trim();
    if (!message) return;
    var intent = currentIntent();
    var target = els.target.value.trim();
    if (intent === 'rebrand' && !target) {
      setStatus('Enter the target customer to rebrand for.', true);
      els.target.focus();
      return;
    }
    var payload = { message: message, intent: intent };
    if (intent === 'rebrand') payload.targetCustomer = target;
    if (els.model.value) payload.model = els.model.value;
    els.input.value = '';
    send(payload);
  }

  // ---- Preview + proposals ----

  async function renderUrl(opts) {
    var data = await api('/render-token', { method: 'POST', body: opts || {} });
    if (!data.url) {
      throw new Error('The isolated demo preview host is not configured. Please try again after the lab update.');
    }
    return data.url;
  }

  function setView(view) {
    els.frames.dataset.view = view;
    [['current', els.tabCurrent], ['proposed', els.tabProposed], ['split', els.tabSplit]].forEach(function (pair) {
      pair[1].setAttribute('aria-selected', String(pair[0] === view));
    });
  }

  async function loadCurrentFrame() {
    els.frameCurrent.src = 'about:blank';
    els.frameCurrent.src = await renderUrl({});
  }

  async function showProposal(proposalId, data) {
    state.proposal = { id: proposalId, baseVersionId: data.baseVersionId };
    var changes = (data.ops || []).filter(function (o) { return o.ok && o.op !== 'note'; }).length;
    els.proposalText.textContent = 'Proposed: ' + changes + ' change' + (changes === 1 ? '' : 's') + ' (' + (data.model || 'Gemini') + '). Preview, then apply or discard.';
    els.proposalBar.hidden = false;
    els.tabProposed.disabled = false;
    els.tabSplit.disabled = false;
    try {
      els.frameProposed.src = await renderUrl({ proposalId: proposalId });
      setView('split');
    } catch (e) {
      setStatus('Could not render the proposal: ' + e.message, true);
    }
  }

  function clearProposal() {
    state.proposal = null;
    els.proposalBar.hidden = true;
    els.tabProposed.disabled = true;
    els.tabSplit.disabled = true;
    els.frameProposed.src = 'about:blank';
    setView('current');
  }

  async function applyProposal() {
    if (!state.proposal) return;
    els.apply.disabled = true;
    try {
      var data = await api('/studio/apply', { method: 'POST', body: { proposalId: state.proposal.id } });
      if (data.asset) renderHeader(data.asset);
      clearProposal();
      setStatus('Applied as a new version.');
      await Promise.all([loadCurrentFrame(), loadVersions()]);
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      els.apply.disabled = false;
    }
  }

  async function discardProposal() {
    if (!state.proposal) return;
    var id = state.proposal.id;
    clearProposal();
    try { await api('/studio/discard', { method: 'POST', body: { proposalId: id } }); } catch (_e) {}
    setStatus('Proposal discarded.');
  }

  // ---- Versions ----

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (_e) { return iso; }
  }

  async function loadVersions() {
    var data = await api('/versions');
    var versions = data.versions || [];
    els.versionCount.textContent = String(versions.length);
    els.versions.textContent = '';
    versions.forEach(function (v) {
      var li = el('li');
      li.dataset.current = String(!!v.current);
      li.appendChild(el('span', 'demo-studio-version-note', (v.current ? 'Current · ' : '') + (v.note || 'Version')));
      li.appendChild(el('span', 'demo-studio-version-meta',
        fmtDate(v.createdAt) + (v.createdBy && v.createdBy.email ? ' · ' + v.createdBy.email : '')));
      li.appendChild(button('Preview', null, function () { previewVersion(v.id); }));
      if (!v.current) li.appendChild(button('Restore', null, function () { restoreVersion(v); }));
      els.versions.appendChild(li);
    });
  }

  async function previewVersion(versionId) {
    try {
      els.frameCurrent.src = await renderUrl({ versionId: versionId });
      setView('current');
      setStatus('Previewing an older version. Reload the page to return to the current version.');
    } catch (e) { setStatus(e.message, true); }
  }

  async function restoreVersion(v) {
    if (!window.confirm('Restore this version? It is copied forward as a new version; nothing is deleted.')) return;
    try {
      var data = await api('/versions/' + encodeURIComponent(v.id) + '/restore', { method: 'POST', body: {} });
      if (data.asset) renderHeader(data.asset);
      clearProposal();
      setStatus('Version restored.');
      await Promise.all([loadCurrentFrame(), loadVersions()]);
    } catch (e) { setStatus(e.message, true); }
  }

  // ---- Header / derive / present ----

  function renderHeader(asset) {
    state.asset = asset;
    els.title.textContent = asset.title || asset.originalFilename || 'Untitled demo';
    document.title = (asset.title || 'Demo') + ' – Demo Studio';
    els.meta.textContent = '';
    [asset.customer, asset.conversationType, asset.event, asset.industry].forEach(function (v) {
      if (v) els.meta.appendChild(el('span', 'demo-studio-chip', v));
    });
    if (asset.derivedFrom && asset.derivedFrom.title) {
      els.meta.appendChild(el('span', 'demo-studio-chip', 'From: ' + asset.derivedFrom.title));
    }
    if (!els.target.value && asset.customer && currentIntent() !== 'rebrand') els.target.placeholder = 'Target customer (currently ' + asset.customer + ')';
  }

  async function present() {
    var win = window.open('about:blank', '_blank');
    try {
      var url = await renderUrl({});
      if (win) { win.opener = null; win.location.href = url; } else window.location.href = url;
    } catch (e) {
      if (win) win.close();
      setStatus(e.message, true);
    }
  }

  async function onDerive(e) {
    e.preventDefault();
    var fd = new FormData(els.deriveForm);
    var customer = String(fd.get('customer') || '').trim();
    if (!customer) return;
    $('studioDeriveError').textContent = '';
    try {
      var data = await api('/derive', { method: 'POST', body: { customer: customer, industry: String(fd.get('industry') || '').trim() || undefined } });
      window.location.href = 'demo-studio.html?asset=' + encodeURIComponent(data.asset.id) + '&rebrand=1';
    } catch (err) {
      $('studioDeriveError').textContent = err.message;
    }
  }

  // ---- Boot ----

  async function loadAsset() {
    try {
      var data = await api('');
      renderHeader(data.asset);
    } catch (e) {
      els.title.textContent = e.status === 404 ? 'Asset not found' : 'Could not load asset';
      setStatus(e.message, true);
      els.form.querySelectorAll('button, textarea, input, select').forEach(function (n) { n.disabled = true; });
      return;
    }
    try { state.conversationId = sessionStorage.getItem('demoStudioConvo:' + state.assetId) || null; } catch (_e) {}
    if (state.conversationId) await restoreConversation();
    var params = new URLSearchParams(window.location.search);
    if (params.get('rebrand') === '1' && state.asset.customer) {
      els.form.querySelector('input[value="rebrand"]').checked = true;
      els.target.value = state.asset.customer;
      syncIntent();
      els.input.value = 'Rebrand this demo for ' + state.asset.customer + '.';
    }
    await Promise.all([
      loadCurrentFrame().catch(function (e) { setStatus(e.message, true); }),
      loadVersions().catch(function (e) { setStatus(e.message, true); }),
    ]);
  }

  async function restoreConversation() {
    try {
      var data = await api('/studio/conversations/' + encodeURIComponent(state.conversationId));
      (data.conversation.messages || []).forEach(function (m) {
        addMessage(m.role === 'user' ? 'user' : 'assistant', m.text, { intent: m.intent });
      });
    } catch (_e) {
      state.conversationId = null;
      try { sessionStorage.removeItem('demoStudioConvo:' + state.assetId); } catch (_e2) {}
    }
  }

  function newChat() {
    if (state.busy) return;
    state.conversationId = null;
    try { sessionStorage.removeItem('demoStudioConvo:' + state.assetId); } catch (_e) {}
    els.messages.textContent = '';
    renderChips([]);
    setStatus('Started a new conversation.');
  }

  function showGate(msg) {
    els.gate.hidden = false;
    els.app.hidden = true;
    if (msg) $('studioGateMsg').textContent = msg;
  }

  function bindUi() {
    els.form.addEventListener('submit', onSubmit);
    els.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); els.form.requestSubmit(); }
    });
    els.form.querySelectorAll('input[name="intent"]').forEach(function (r) { r.addEventListener('change', syncIntent); });
    els.stop.addEventListener('click', function () { if (state.controller) state.controller.abort(); });
    els.newChat.addEventListener('click', newChat);
    els.apply.addEventListener('click', applyProposal);
    els.discard.addEventListener('click', discardProposal);
    els.tabCurrent.addEventListener('click', function () { setView('current'); });
    els.tabProposed.addEventListener('click', function () { setView('proposed'); });
    els.tabSplit.addEventListener('click', function () { setView('split'); });
    $('studioPresent').addEventListener('click', present);
    $('studioDerive').addEventListener('click', function () {
      els.deriveForm.reset();
      $('studioDeriveError').textContent = '';
      els.deriveDialog.showModal();
    });
    $('studioDeriveCancel').addEventListener('click', function () { els.deriveDialog.close(); });
    els.deriveForm.addEventListener('submit', onDerive);
    syncIntent();
  }

  function init() {
    els = {
      gate: $('studioGate'), app: $('studioApp'), title: $('studioTitle'), meta: $('studioMeta'),
      messages: $('studioMessages'), chips: $('studioChips'), form: $('studioForm'),
      input: $('studioInput'), target: $('studioTarget'), model: $('studioModel'),
      status: $('studioStatus'), send: $('studioSend'), stop: $('studioStop'), newChat: $('studioNewChat'),
      proposalBar: $('studioProposalBar'), proposalText: $('studioProposalText'),
      apply: $('studioApply'), discard: $('studioDiscard'),
      tabCurrent: $('studioTabCurrent'), tabProposed: $('studioTabProposed'), tabSplit: $('studioTabSplit'),
      frames: $('studioFrames'), frameCurrent: $('studioFrameCurrent'), frameProposed: $('studioFrameProposed'),
      versions: $('studioVersions'), versionCount: $('studioVersionCount'),
      deriveDialog: $('studioDeriveDialog'), deriveForm: $('studioDeriveForm'),
    };
    bindUi();

    state.assetId = new URLSearchParams(window.location.search).get('asset');
    if (!state.assetId || !/^[A-Za-z0-9_-]{6,64}$/.test(state.assetId)) {
      showGate('No asset selected. Open an asset from the Demo asset library and choose "Studio".');
      $('studioGateMsg').appendChild(document.createTextNode(' '));
      var link = el('a', null, 'Go to the library');
      link.href = 'demo-asset-library.html';
      $('studioGateMsg').appendChild(link);
      return;
    }
    if (typeof firebase === 'undefined' || !window.firebaseDatabaseConfig) {
      showGate('Firebase is not available on this page, so sign-in cannot be checked.');
      return;
    }
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseDatabaseConfig);
    firebase.auth().onAuthStateChanged(function (user) {
      if (!user || user.isAnonymous || !user.email) {
        state.user = null;
        showGate();
        return;
      }
      var first = !state.user;
      state.user = user;
      els.gate.hidden = true;
      els.app.hidden = false;
      if (first) loadAsset();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
