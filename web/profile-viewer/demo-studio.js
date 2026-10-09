/**
 * Demo Studio — review, edit and rebrand demo assets with Gemini.
 * Changes are returned as proposals (structured ops) that are previewed before applying as a new version.
 */
(function () {
  'use strict';

  var API = '/api/demo-assets';
  var state = { user: null, assetId: null, asset: null, conversationId: null, proposal: null, busy: false, controller: null, lastRequest: null,
    selectedVersionId: null, versions: [], versionCursor: null, restoring: false, deriving: false, conversationLoading: false };
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
      msg.appendChild(el('div', 'demo-studio-msg-label', 'Large document: Gemini saw an outline and only the beginning of the HTML. Ask for smaller, targeted changes.'));
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
    $('studioConversation').disabled = busy;
    $('studioRenameChat').disabled = busy;
    els.newChat.disabled = busy;
    $('studioDerive').disabled = busy;
  }

  async function send(payload) {
    if (state.busy) return;
    if (state.proposal) {
      setStatus('Apply or discard the pending proposal before making another request.', true);
      return;
    }
    state.lastRequest = payload;
    addMessage('user', payload.message, { intent: payload.intent });
    renderChips([]);
    var pending = addMessage('assistant', payload.intent === 'rebrand' ? 'Rebranding — this can take a minute or two…' : 'Thinking…');
    pending.classList.add('is-pending');
    setBusy(true);
    setStatus('');
    state.controller = new AbortController();
    try {
      var body = Object.assign({}, payload, { conversationId: state.conversationId || undefined,
        versionId: state.selectedVersionId || undefined, adaptationBrief: state.asset.adaptationBrief || undefined });
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
      renderChecklist(data.checklist || []);
      if (data.proposalId) await showProposal(data.proposalId, data);
      await loadConversations().catch(function (e) { setStatus('Your reply is saved, but the conversation list could not refresh: ' + e.message, true); });
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
    if (state.selectedVersionId !== state.asset.currentVersionId && intent !== 'review') {
      setStatus('Return to the current version before editing. You can review or present this historical version.', true);
      return;
    }
    if (intent === 'rebrand' && !state.asset.derivedFrom) {
      openAdaptation();
      els.deriveForm.elements.customer.value = target;
      els.deriveForm.elements.objective.value = message;
      setStatus('Create a customer copy first so the original remains unchanged.');
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
    $('studioPresent').textContent = view === 'proposed' ? 'Present proposal' : 'Present selected version';
  }

  async function loadCurrentFrame() {
    els.frameCurrent.src = 'about:blank';
    var versionId = state.asset.currentVersionId;
    var url = await renderUrl({ versionId: versionId });
    state.selectedVersionId = versionId;
    els.frameCurrent.src = url;
    renderSelectedVersion();
  }

  function renderSelectedVersion() {
    var current = state.selectedVersionId === state.asset.currentVersionId;
    var version = state.versions.find(function (v) { return v.id === state.selectedVersionId; });
    $('studioSelectedVersion').textContent = (current ? 'Current version' : 'Historical version') +
      (version ? ' · ' + (version.note || version.originalFilename || version.id.slice(0, 8)) + ' · ' + fmtDate(version.createdAt) : '');
    $('studioBackCurrent').hidden = current;
    els.tabCurrent.textContent = current ? 'Current' : 'Historical';
  }

  function renderChecklist(checks) {
    var box = $('studioChecklist');
    box.textContent = '';
    box.hidden = !checks.length;
    if (!checks.length) return;
    box.appendChild(el('h4', null, 'Adaptation review'));
    box.appendChild(el('p', 'hint', 'Automated checks are not approval. Review logos, sample data and customer claims before presenting.'));
    var list = el('ul');
    checks.forEach(function (check) {
      list.appendChild(el('li', null, (check.passed ? 'Checked: ' : 'Review: ') + check.label + (check.detail ? ' — ' + check.detail : '')));
    });
    box.appendChild(list);
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
    if (!state.proposal || els.apply.disabled) return;
    els.apply.disabled = true;
    els.discard.disabled = true;
    try {
      var data = await api('/studio/apply', { method: 'POST', body: { proposalId: state.proposal.id } });
      if (data.asset) renderHeader(data.asset);
      clearProposal();
      setStatus('Applied as a new version.');
      await Promise.all([loadCurrentFrame(), loadVersions(), loadActivity()]);
    } catch (e) {
      setStatus(e.message, true);
    } finally {
      els.apply.disabled = false;
      els.discard.disabled = false;
    }
  }

  async function discardProposal() {
    if (!state.proposal || els.discard.disabled) return;
    var id = state.proposal.id;
    els.discard.disabled = true;
    els.apply.disabled = true;
    try {
      await api('/studio/discard', { method: 'POST', body: { proposalId: id } });
      clearProposal();
      setStatus('Proposal discarded.');
    } catch (e) { setStatus('Could not discard the proposal: ' + e.message, true); }
    finally { els.discard.disabled = false; els.apply.disabled = false; }
  }

  // ---- Versions ----

  function fmtDate(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }); } catch (_e) { return iso; }
  }

  async function loadVersions(more) {
    var data = await api('/versions?limit=50' + (more && state.versionCursor ? '&cursor=' + encodeURIComponent(state.versionCursor) : ''));
    state.versions = more ? state.versions.concat(data.versions || []) : data.versions || [];
    state.versionCursor = data.nextCursor || null;
    $('studioMoreVersions').hidden = !state.versionCursor;
    var versions = state.versions;
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
    renderSelectedVersion();
  }

  async function previewVersion(versionId) {
    try {
      if (state.proposal) { setStatus('Apply or discard the proposal before switching versions.', true); return; }
      var url = await renderUrl({ versionId: versionId });
      state.selectedVersionId = versionId;
      els.frameCurrent.src = url;
      renderSelectedVersion();
      setView('current');
      setStatus('Preview and Present now use this version. Editing remains available on the current version.');
    } catch (e) { setStatus(e.message, true); }
  }

  async function restoreVersion(v) {
    if (state.restoring || state.busy) return;
    if (state.proposal) {
      setStatus('Apply or discard the pending proposal before restoring a version.', true);
      return;
    }
    if (!window.confirm('Restore this version? It is copied forward as a new version; nothing is deleted.')) return;
    state.restoring = true;
    try {
      var data = await api('/versions/' + encodeURIComponent(v.id) + '/restore', { method: 'POST', body: {} });
      if (data.asset) renderHeader(data.asset);
      clearProposal();
      setStatus('Version restored.');
      await Promise.all([loadCurrentFrame(), loadVersions(), loadActivity()]);
    } catch (e) { setStatus(e.message, true); }
    finally { state.restoring = false; }
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
      var opts = state.proposal && els.frames.dataset.view === 'proposed'
        ? { proposalId: state.proposal.id } : { versionId: state.selectedVersionId || state.asset.currentVersionId };
      var url = await renderUrl(opts);
      if (win) { win.opener = null; win.location.href = url; } else window.location.href = url;
    } catch (e) {
      if (win) win.close();
      setStatus(e.message, true);
    }
  }

  async function onDerive(e) {
    e.preventDefault();
    if (state.deriving) return;
    var fd = new FormData(els.deriveForm);
    var customer = String(fd.get('customer') || '').trim();
    if (!customer) return;
    $('studioDeriveError').textContent = '';
    state.deriving = true;
    $('studioDeriveSave').disabled = true;
    try {
      var data = await api('/derive', { method: 'POST', body: { customer: customer,
        industry: String(fd.get('industry') || '').trim() || undefined,
        audience: String(fd.get('audience') || '').trim(), objective: String(fd.get('objective') || '').trim(),
        brandNotes: String(fd.get('brandNotes') || '').trim(), versionId: state.selectedVersionId } });
      window.location.href = 'demo-studio.html?asset=' + encodeURIComponent(data.asset.id) + '&rebrand=1';
    } catch (err) {
      $('studioDeriveError').textContent = err.message;
    } finally { state.deriving = false; $('studioDeriveSave').disabled = false; }
  }

  function openAdaptation() {
    els.deriveForm.reset();
    $('studioDeriveError').textContent = '';
    els.deriveDialog.showModal();
  }

  async function loadConversations() {
    var data = await api('/studio/conversations');
    var select = $('studioConversation');
    select.textContent = '';
    var empty = el('option', null, 'New conversation');
    empty.value = '';
    select.appendChild(empty);
    (data.conversations || []).forEach(function (c) {
      var option = el('option', null, c.title || 'Conversation · ' + fmtDate(c.updatedAt));
      option.value = c.id;
      select.appendChild(option);
    });
    select.value = state.conversationId || '';
  }

  async function selectConversation() {
    if (state.busy || state.conversationLoading) return;
    if (state.proposal) {
      $('studioConversation').value = state.conversationId || '';
      setStatus('Apply or discard the pending proposal before switching conversations.', true);
      return;
    }
    var id = $('studioConversation').value;
    if (!id) { newChat(); return; }
    state.conversationLoading = true;
    setBusy(true);
    try {
      var data = await api('/studio/conversations/' + encodeURIComponent(id));
      state.conversationId = id;
      els.messages.textContent = '';
      (data.conversation.messages || []).forEach(function (m) { addMessage(m.role, m.text, { intent: m.intent }); });
      renderChips([]);
      setStatus('Conversation resumed. Pending edits are not automatically applied.');
      try { sessionStorage.setItem('demoStudioConvo:' + state.assetId, id); }
      catch (e) { setStatus('Conversation resumed, but this browser could not remember it: ' + e.message, true); }
    } catch (e) { setStatus(e.message, true); }
    finally { state.conversationLoading = false; setBusy(false); }
  }

  async function renameConversation() {
    if (!state.conversationId) { setStatus('Send a message to save a conversation first.', true); return; }
    var title = window.prompt('Conversation name', '');
    if (title === null) return;
    if (!title.trim()) { setStatus('Enter a conversation name.', true); return; }
    try {
      await api('/studio/conversations/' + encodeURIComponent(state.conversationId), { method: 'PATCH', body: { title: title.trim() } });
      await loadConversations();
      setStatus('Conversation renamed.');
    } catch (e) { setStatus(e.message, true); }
  }

  async function loadActivity() {
    var data = await request(API + '/audit?assetId=' + encodeURIComponent(state.assetId));
    var list = $('studioActivity');
    list.textContent = '';
    (data.entries || []).forEach(function (entry) {
      list.appendChild(el('li', null, entry.action + ' · ' + (entry.email || '') + ' · ' + fmtDate(entry.at)));
    });
    if (!list.children.length) list.appendChild(el('li', null, 'No recorded activity yet.'));
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
      loadConversations().catch(function (e) { setStatus('Conversations: ' + e.message, true); }),
      loadActivity().catch(function (e) { setStatus('Activity: ' + e.message, true); }),
    ]);
    if (params.get('adapt') === '1') openAdaptation();
    if (params.get('rebrand') === '1' && state.asset.adaptationBrief) {
      var brief = state.asset.adaptationBrief;
      els.input.value = 'Adapt this copy for ' + state.asset.customer + '. ' + (brief.objective || '') +
        (brief.audience ? ' Audience: ' + brief.audience + '.' : '') + ' Use only approved facts; label illustrative examples.';
    }
  }

  async function restoreConversation() {
    try {
      var data = await api('/studio/conversations/' + encodeURIComponent(state.conversationId));
      (data.conversation.messages || []).forEach(function (m) {
        addMessage(m.role === 'user' ? 'user' : 'assistant', m.text, { intent: m.intent });
      });
    } catch (e) {
      setStatus('Could not resume the previous conversation: ' + e.message, true);
      state.conversationId = null;
      try { sessionStorage.removeItem('demoStudioConvo:' + state.assetId); } catch (_e2) {}
    }
  }

  function newChat() {
    if (state.busy) return;
    if (state.proposal) { setStatus('Apply or discard the pending proposal first.', true); return; }
    state.conversationId = null;
    try { sessionStorage.removeItem('demoStudioConvo:' + state.assetId); } catch (_e) {}
    els.messages.textContent = '';
    renderChips([]);
    $('studioConversation').value = '';
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
    $('studioDerive').addEventListener('click', openAdaptation);
    $('studioConversation').addEventListener('change', selectConversation);
    $('studioRenameChat').addEventListener('click', renameConversation);
    $('studioBackCurrent').addEventListener('click', function () { previewVersion(state.asset.currentVersionId); });
    $('studioMoreVersions').addEventListener('click', async function () {
      this.disabled = true;
      try { await loadVersions(true); } catch (e) { setStatus(e.message, true); }
      finally { this.disabled = false; }
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
