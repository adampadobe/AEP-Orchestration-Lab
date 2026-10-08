/**
 * Demo asset library — store, classify, preview and present customer HTML demos.
 * Signed-in Adobe users only (Firebase ID token verified server-side).
 */
(function () {
  'use strict';

  var API = '/api/demo-assets';
  var MAX_BYTES = 25 * 1024 * 1024;

  var state = {
    user: null,
    assets: [],
    conversationTypes: [],
    editingId: null,
    previewId: null,
  };

  function $(id) { return document.getElementById(id); }

  var els = {};

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function button(label, cls, onClick) {
    var b = el('button', cls || 'dashboard-btn-outline', label);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.classList.toggle('error', !!isError);
  }

  async function authHeaders() {
    if (!state.user) throw new Error('Not signed in');
    var token = await state.user.getIdToken();
    return { Authorization: 'Bearer ' + token };
  }

  async function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({}, await authHeaders(), opts.headers || {});
    var init = { method: opts.method || 'GET', headers: headers };
    if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    var res = await fetch(API + path, init);
    if (opts.raw) return res;
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) {
      var err = new Error((data && data.error) || ('Request failed (' + res.status + ')'));
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---- Library ----

  async function loadLibrary() {
    setStatus('Loading library…');
    try {
      var data = await api('');
      state.assets = Array.isArray(data.assets) ? data.assets : [];
      state.conversationTypes = Array.isArray(data.conversationTypes) ? data.conversationTypes : [];
      populateFilters();
      render();
      setStatus('');
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    values.forEach(function (v) {
      var s = String(v || '').trim();
      if (s && !seen[s.toLowerCase()]) { seen[s.toLowerCase()] = true; out.push(s); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b); });
  }

  function fillSelect(select, values, allLabel) {
    var current = select.value;
    select.textContent = '';
    if (allLabel != null) {
      var all = el('option', null, allLabel);
      all.value = '';
      select.appendChild(all);
    }
    values.forEach(function (v) {
      var o = el('option', null, v);
      o.value = v;
      select.appendChild(o);
    });
    if (current && values.indexOf(current) !== -1) select.value = current;
  }

  function fillDatalist(list, values) {
    list.textContent = '';
    values.forEach(function (v) {
      var o = document.createElement('option');
      o.value = v;
      list.appendChild(o);
    });
  }

  function populateFilters() {
    var customers = uniqueSorted(state.assets.map(function (a) { return a.customer; }));
    var events = uniqueSorted(state.assets.map(function (a) { return a.event; }));
    var types = uniqueSorted(state.conversationTypes.concat(state.assets.map(function (a) { return a.conversationType; })));
    fillSelect(els.customerFilter, customers, 'All customers');
    fillSelect(els.typeFilter, types, 'All conversation types');
    fillSelect(els.eventFilter, events, 'All events');
    fillDatalist($('demoAssetsCustomerList'), customers);
    fillDatalist($('demoAssetsEventList'), events);
    fillSelect(els.form.elements.conversationType, state.conversationTypes.length ? state.conversationTypes : types, null);
  }

  function filtered() {
    var q = els.search.value.trim().toLowerCase();
    var cust = els.customerFilter.value;
    var type = els.typeFilter.value;
    var evt = els.eventFilter.value;
    var review = els.needsReview.checked;
    return state.assets.filter(function (a) {
      if (cust && a.customer !== cust) return false;
      if (type && a.conversationType !== type) return false;
      if (evt && a.event !== evt) return false;
      if (review && a.status !== 'needs_review') return false;
      if (!q) return true;
      var hay = [a.title, a.customer, a.industry, a.conversationType, a.event, a.summary, a.originalFilename, a.folderPath]
        .concat(a.tags || []).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function formatDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatBytes(n) {
    if (!n) return '';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function render() {
    var list = filtered();
    els.count.textContent = String(state.assets.length);
    els.grid.textContent = '';
    if (!list.length) {
      els.grid.appendChild(el('p', 'demo-assets-empty',
        state.assets.length ? 'No assets match these filters.' : 'No assets yet. Drop HTML files above to start the library.'));
      return;
    }
    list.forEach(function (a) { els.grid.appendChild(renderCard(a)); });
  }

  function renderCard(a) {
    var card = el('article', 'demo-assets-card');
    card.appendChild(el('h3', null, a.title || a.originalFilename || 'Untitled asset'));

    var meta = el('div', 'demo-assets-card-meta');
    if (a.customer) meta.appendChild(el('span', 'demo-assets-chip demo-assets-chip--customer', a.customer));
    if (a.conversationType) meta.appendChild(el('span', 'demo-assets-chip', a.conversationType));
    if (a.event) meta.appendChild(el('span', 'demo-assets-chip', a.event));
    if (a.status === 'needs_review') meta.appendChild(el('span', 'demo-assets-chip demo-assets-chip--review', 'Needs review'));
    (a.tags || []).slice(0, 4).forEach(function (t) { meta.appendChild(el('span', 'demo-assets-chip', '#' + t)); });
    card.appendChild(meta);

    if (a.summary) card.appendChild(el('p', 'demo-assets-card-summary', a.summary));

    var footBits = [];
    if (a.createdBy && (a.createdBy.name || a.createdBy.email)) footBits.push('Added by ' + (a.createdBy.name || a.createdBy.email));
    if (a.createdAt) footBits.push(formatDate(a.createdAt));
    var size = a.sizes && a.sizes.htmlBytes;
    if (size) footBits.push(formatBytes(size));
    if (footBits.length) card.appendChild(el('p', 'demo-assets-card-foot', footBits.join(' · ')));

    var actions = el('div', 'demo-assets-card-actions');
    actions.appendChild(button('Preview', 'dashboard-btn-primary', function () { openPreview(a.id); }));
    actions.appendChild(button('Present', null, function () { present(a.id); }));
    actions.appendChild(button(a.status === 'needs_review' ? 'Review' : 'Edit', null, function () { openEdit(a.id); }));
    actions.appendChild(button('Export', null, function () { exportAsset(a); }));
    var studio = el('a', 'dashboard-btn-outline', 'Studio');
    studio.href = 'demo-studio.html?asset=' + encodeURIComponent(a.id);
    studio.title = 'Review, edit or rebrand with Gemini';
    actions.appendChild(studio);
    card.appendChild(actions);
    return card;
  }

  function upsertAsset(asset) {
    var idx = state.assets.findIndex(function (x) { return x.id === asset.id; });
    if (idx === -1) state.assets.unshift(asset);
    else state.assets[idx] = asset;
    populateFilters();
    render();
  }

  function removeAsset(id) {
    state.assets = state.assets.filter(function (x) { return x.id !== id; });
    populateFilters();
    render();
  }

  // ---- Upload ----

  function isHtmlFile(file) {
    return /\.html?$/i.test(file.name) || file.type === 'text/html';
  }

  function folderOf(path) {
    var p = String(path || '');
    var i = p.lastIndexOf('/');
    return i > 0 ? p.slice(0, i) : '';
  }

  function readEntry(entry, prefix, out) {
    return new Promise(function (resolve) {
      if (entry.isFile) {
        entry.file(function (f) {
          out.push({ file: f, path: prefix + f.name });
          resolve();
        }, function () { resolve(); });
      } else if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        (function readBatch() {
          reader.readEntries(function (batch) {
            if (!batch.length) {
              Promise.all(all.map(function (e) { return readEntry(e, prefix + entry.name + '/', out); })).then(resolve);
              return;
            }
            all = all.concat(Array.prototype.slice.call(batch));
            readBatch();
          }, function () { resolve(); });
        })();
      } else {
        resolve();
      }
    });
  }

  async function filesFromDrop(dt) {
    var out = [];
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    var entries = items
      .map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; })
      .filter(Boolean);
    if (entries.length) {
      await Promise.all(entries.map(function (e) { return readEntry(e, '', out); }));
      return out;
    }
    Array.prototype.slice.call(dt.files || []).forEach(function (f) { out.push({ file: f, path: f.name }); });
    return out;
  }

  function filesFromInput(input) {
    return Array.prototype.slice.call(input.files || []).map(function (f) {
      return { file: f, path: f.webkitRelativePath || f.name };
    });
  }

  var uploadQueue = Promise.resolve();

  function enqueueUploads(items) {
    var html = items.filter(function (it) { return isHtmlFile(it.file); });
    var skipped = items.length - html.length;
    if (!html.length) {
      setStatus(items.length ? 'No HTML files found in that selection.' : '', !!items.length);
      return;
    }
    if (skipped) setStatus('Skipped ' + skipped + ' non-HTML file' + (skipped === 1 ? '' : 's') + '.');
    html.forEach(function (it) {
      var row = createUploadRow(it);
      uploadQueue = uploadQueue.then(function () { return uploadOne(it, row, false); });
    });
  }

  function createUploadRow(it) {
    var li = el('li', 'demo-assets-upload-item');
    li.dataset.state = 'pending';
    var name = el('span', 'demo-assets-upload-name', it.path);
    name.title = it.path;
    var msg = el('span', 'demo-assets-upload-msg', 'Queued');
    var actions = el('span', 'demo-assets-upload-actions');
    li.appendChild(name);
    li.appendChild(msg);
    li.appendChild(actions);
    els.uploadList.appendChild(li);
    return { li: li, msg: msg, actions: actions };
  }

  function setRow(row, st, text) {
    row.li.dataset.state = st;
    row.msg.textContent = text;
    row.actions.textContent = '';
  }

  async function uploadOne(it, row, force) {
    if (it.file.size > MAX_BYTES) {
      setRow(row, 'error', 'Too large (' + formatBytes(it.file.size) + ', max 25 MB)');
      return;
    }
    setRow(row, 'pending', force ? 'Uploading again…' : 'Uploading and classifying…');
    try {
      var html = await it.file.text();
      var data = await api('', {
        method: 'POST',
        body: { html: html, filename: it.file.name, folderPath: folderOf(it.path), force: !!force },
      });
      var asset = data.asset;
      upsertAsset(asset);
      setRow(row, 'ok', 'Added' + (asset.customer ? ' · ' + asset.customer : '') + (asset.conversationType ? ' · ' + asset.conversationType : ''));
      row.actions.appendChild(button('Review', null, function () { openEdit(asset.id, { isNew: true }); }));
    } catch (e) {
      if (e.status === 409 && e.data && e.data.duplicate) {
        var existing = e.data.asset;
        setRow(row, 'duplicate', 'Already in library' + (existing && existing.title ? ': ' + existing.title : ''));
        if (existing && existing.id) {
          row.actions.appendChild(button('View', null, function () { openPreview(existing.id); }));
        }
        row.actions.appendChild(button('Upload anyway', null, function () {
          uploadQueue = uploadQueue.then(function () { return uploadOne(it, row, true); });
        }));
        return;
      }
      setRow(row, 'error', e.message);
    }
  }

  // ---- Edit / review ----

  function openEdit(id, opts) {
    var a = state.assets.find(function (x) { return x.id === id; });
    if (!a) return;
    state.editingId = id;
    var f = els.form.elements;
    f.title.value = a.title || '';
    f.customer.value = a.customer || '';
    f.industry.value = a.industry || '';
    var types = state.conversationTypes.slice();
    if (a.conversationType && types.indexOf(a.conversationType) === -1) types.push(a.conversationType);
    fillSelect(f.conversationType, types, null);
    f.conversationType.value = a.conversationType || 'Other';
    f.event.value = a.event || '';
    f.tags.value = (a.tags || []).join(', ');
    f.summary.value = a.summary || '';
    f.notes.value = a.notes || '';
    $('demoAssetsEditTitle').textContent = a.status === 'needs_review' ? 'Confirm classification' : 'Edit asset';
    var src = [];
    if (a.originalFilename) src.push(a.originalFilename);
    if (a.folderPath) src.push('from ' + a.folderPath);
    if (a.classification && a.classification.source) {
      src.push(a.classification.source === 'gemini' ? 'suggested by Gemini' : 'suggested from file metadata');
    }
    $('demoAssetsEditSource').textContent = src.join(' · ');
    $('demoAssetsEditError').textContent = '';
    els.editDialog.dataset.isNew = opts && opts.isNew ? '1' : '';
    els.editDialog.showModal();
  }

  async function saveEdit(ev) {
    ev.preventDefault();
    var id = state.editingId;
    if (!id) return;
    var f = els.form.elements;
    var patch = {
      title: f.title.value.trim(),
      customer: f.customer.value.trim(),
      industry: f.industry.value.trim(),
      conversationType: f.conversationType.value,
      event: f.event.value.trim(),
      tags: f.tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
      summary: f.summary.value.trim(),
      notes: f.notes.value.trim(),
      status: 'ready',
    };
    var saveBtn = $('demoAssetsEditSave');
    saveBtn.disabled = true;
    try {
      var data = await api('/' + encodeURIComponent(id), { method: 'PATCH', body: patch });
      upsertAsset(data.asset);
      els.editDialog.close();
      state.editingId = null;
    } catch (e) {
      $('demoAssetsEditError').textContent = e.message;
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteAsset(id) {
    var a = state.assets.find(function (x) { return x.id === id; });
    var label = a ? (a.title || a.originalFilename) : 'this asset';
    if (!window.confirm('Delete "' + label + '" from the library? This cannot be undone.')) return false;
    try {
      await api('/' + encodeURIComponent(id), { method: 'DELETE' });
      removeAsset(id);
      return true;
    } catch (e) {
      setStatus(e.message, true);
      $('demoAssetsEditError').textContent = e.message;
      return false;
    }
  }

  // ---- Preview / present / export ----

  async function renderUrl(id) {
    var data = await api('/' + encodeURIComponent(id) + '/render-token', { method: 'POST' });
    return data.url || (API + '/render/' + encodeURIComponent(data.token));
  }

  async function openPreview(id) {
    var a = state.assets.find(function (x) { return x.id === id; });
    state.previewId = id;
    $('demoAssetsPreviewTitle').textContent = a ? (a.title || a.originalFilename) : 'Preview';
    els.previewFrame.src = 'about:blank';
    els.previewDialog.showModal();
    try {
      els.previewFrame.src = await renderUrl(id);
    } catch (e) {
      els.previewDialog.close();
      setStatus(e.message, true);
    }
  }

  async function present(id) {
    // Open the tab synchronously so popup blockers allow it, then navigate once the token arrives.
    var win = window.open('about:blank', '_blank');
    try {
      var url = await renderUrl(id);
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch (e) {
      if (win) win.close();
      setStatus(e.message, true);
    }
  }

  async function exportAsset(a) {
    try {
      var res = await api('/' + encodeURIComponent(a.id) + '/export', { raw: true });
      if (!res.ok) throw new Error('Export failed (' + res.status + ')');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = a.originalFilename || ((a.title || 'demo-asset').replace(/[^\w.-]+/g, '-') + '.html');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  // ---- Wiring ----

  function bindUi() {
    els.drop.addEventListener('dragover', function (ev) {
      ev.preventDefault();
      els.drop.classList.add('is-dragover');
    });
    els.drop.addEventListener('dragleave', function (ev) {
      if (!els.drop.contains(ev.relatedTarget)) els.drop.classList.remove('is-dragover');
    });
    els.drop.addEventListener('drop', async function (ev) {
      ev.preventDefault();
      els.drop.classList.remove('is-dragover');
      enqueueUploads(await filesFromDrop(ev.dataTransfer));
    });
    els.drop.addEventListener('keydown', function (ev) {
      if (ev.target === els.drop && (ev.key === 'Enter' || ev.key === ' ')) {
        ev.preventDefault();
        els.fileInput.click();
      }
    });
    els.fileInput.addEventListener('change', function () {
      enqueueUploads(filesFromInput(els.fileInput));
      els.fileInput.value = '';
    });
    els.folderInput.addEventListener('change', function () {
      enqueueUploads(filesFromInput(els.folderInput));
      els.folderInput.value = '';
    });

    [els.search].forEach(function (n) { n.addEventListener('input', render); });
    [els.customerFilter, els.typeFilter, els.eventFilter, els.needsReview].forEach(function (n) {
      n.addEventListener('change', render);
    });

    els.form.addEventListener('submit', saveEdit);
    $('demoAssetsEditCancel').addEventListener('click', async function () {
      var id = state.editingId;
      if (els.editDialog.dataset.isNew === '1' && id &&
          window.confirm('Keep this upload in the library as "Needs review"? Choose Cancel to remove it.') === false) {
        if (await deleteAsset(id)) els.editDialog.close();
        return;
      }
      els.editDialog.close();
    });
    $('demoAssetsEditDelete').addEventListener('click', async function () {
      if (state.editingId && await deleteAsset(state.editingId)) els.editDialog.close();
    });
    els.editDialog.addEventListener('close', function () { state.editingId = null; });

    $('demoAssetsPreviewClose').addEventListener('click', function () { els.previewDialog.close(); });
    $('demoAssetsPreviewPresent').addEventListener('click', function () {
      if (state.previewId) present(state.previewId);
    });
    els.previewDialog.addEventListener('close', function () {
      els.previewFrame.src = 'about:blank';
      state.previewId = null;
    });
  }

  function showGate(msg) {
    els.app.hidden = true;
    els.gate.hidden = false;
    if (msg) $('demoAssetsGateMsg').textContent = msg;
  }

  function init() {
    els = {
      gate: $('demoAssetsGate'),
      app: $('demoAssetsApp'),
      drop: $('demoAssetsDrop'),
      fileInput: $('demoAssetsFileInput'),
      folderInput: $('demoAssetsFolderInput'),
      uploadList: $('demoAssetsUploadList'),
      count: $('demoAssetsCount'),
      search: $('demoAssetsSearch'),
      customerFilter: $('demoAssetsCustomerFilter'),
      typeFilter: $('demoAssetsTypeFilter'),
      eventFilter: $('demoAssetsEventFilter'),
      needsReview: $('demoAssetsNeedsReview'),
      status: $('demoAssetsStatus'),
      grid: $('demoAssetsGrid'),
      editDialog: $('demoAssetsEditDialog'),
      form: $('demoAssetsEditForm'),
      previewDialog: $('demoAssetsPreviewDialog'),
      previewFrame: $('demoAssetsPreviewFrame'),
    };
    bindUi();

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
      state.user = user;
      els.gate.hidden = true;
      els.app.hidden = false;
      loadLibrary();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
