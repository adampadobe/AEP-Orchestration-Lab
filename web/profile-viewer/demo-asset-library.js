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
    previewVersionId: null,
    historyId: null,
    historyBusy: false,
    deletingIds: new Set(),
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
    var heading = el('div', 'demo-assets-card-heading');
    heading.appendChild(el('h3', null, a.title || a.originalFilename || 'Untitled asset'));
    var deleting = state.deletingIds.has(a.id);
    var remove = button(null, 'demo-assets-delete', function () { return deleteAsset(a.id); });
    var deleteLabel = (deleting ? 'Deleting ' : 'Delete ') + (a.title || a.originalFilename || 'asset');
    remove.setAttribute('aria-label', deleteLabel);
    remove.setAttribute('aria-busy', String(deleting));
    remove.title = deleteLabel;
    remove.disabled = deleting;
    var bin = el('span', 'demo-assets-delete-icon');
    bin.setAttribute('aria-hidden', 'true');
    remove.appendChild(bin);
    heading.appendChild(remove);
    card.appendChild(heading);

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
    actions.appendChild(button('History', null, function () { return openHistory(a.id); }));
    var studio = el('a', 'dashboard-btn-outline', 'Studio');
    studio.href = 'demo-studio.html?asset=' + encodeURIComponent(a.id);
    studio.title = 'Review, edit or rebrand with Gemini';
    actions.appendChild(studio);
    var addFlow = el('a', 'dashboard-btn-outline', 'Add to flow');
    addFlow.href = 'demo-flows.html?add=' + encodeURIComponent(a.id);
    addFlow.title = 'Add this asset to a demo flow';
    actions.appendChild(addFlow);
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

  function chooseUploadVersion(it, row, candidates) {
    setRow(row, 'version', 'Is "' + it.file.name + '" a new version of an existing asset? The older version will be kept.');
    var choices = el('div', 'demo-assets-version-choice');
    var label = el('label', null, 'Existing asset ');
    var select = el('select');
    select.setAttribute('aria-label', 'Choose the asset to version');
    candidates.forEach(function (a) {
      var option = el('option', null, (a.title || a.originalFilename) + (a.customer ? ' · ' + a.customer : '') + ' — ' + a.originalFilename);
      option.value = a.id;
      select.appendChild(option);
    });
    select.value = candidates[0].id;
    label.appendChild(select);
    choices.appendChild(label);
    row.actions.appendChild(choices);
    return new Promise(function (resolve) {
      choices.appendChild(button('Save as a new version', 'dashboard-btn-primary', function () {
        resolve({ asset: candidates.find(function (a) { return a.id === select.value; }) });
      }));
      choices.appendChild(button('Keep as a separate asset', null, function () { resolve({ separate: true }); }));
      choices.appendChild(button('Cancel upload', null, function () { resolve({ cancel: true }); }));
      select.focus();
    });
  }

  async function uploadOne(it, row, force, target) {
    if (it.file.size > MAX_BYTES) {
      setRow(row, 'error', 'Too large (' + formatBytes(it.file.size) + ', max 25 MB)');
      return;
    }
    setRow(row, 'pending', target ? 'Saving new version…' : force ? 'Uploading separately…' : 'Uploading and classifying…');
    try {
      var html = await it.file.text();
      var data = await api(target ? '/' + encodeURIComponent(target.id) + '/versions' : '', {
        method: 'POST',
        body: { html: html, filename: it.file.name, folderPath: folderOf(it.path), force: !!force, expectedVersionId: target ? target.currentVersionId : undefined },
      });
      var asset = data.asset;
      upsertAsset(asset);
      if (target) {
        setRow(row, 'ok', 'New version saved for "' + asset.title + '". Older versions are in History.');
        row.actions.appendChild(button('History', null, function () { openHistory(asset.id); }));
        return;
      }
      var added = 'Added' + (asset.customer ? ' · ' + asset.customer : '') + (asset.conversationType ? ' · ' + asset.conversationType : '');
      var similar = (data.similar || [])[0];
      if (similar) {
        setRow(row, 'similar', added + ' — looks like "' + (similar.title || 'an existing demo') + '"' +
          (similar.customer ? ' (' + similar.customer + ')' : '') + ', ' + Math.round((similar.score || 0) * 100) + '% similar');
        row.actions.appendChild(button('Compare', null, function () { openPreview(similar.id); }));
      } else {
        setRow(row, 'ok', added);
      }
      row.actions.appendChild(button('Review', null, function () { openEdit(asset.id, { isNew: true }); }));
    } catch (e) {
      if (e.status === 409 && e.data && e.data.versionCandidates && e.data.versionCandidates.length) {
        var choice = await chooseUploadVersion(it, row, e.data.versionCandidates);
        if (choice.cancel) { setRow(row, 'cancelled', 'Upload cancelled. Nothing was saved.'); return; }
        return uploadOne(it, row, !!choice.separate, choice.asset);
      }
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
      row.actions.appendChild(button('Retry upload', null, function () {
        uploadQueue = uploadQueue.then(function () { return uploadOne(it, row, false); });
      }));
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
    if (!id || state.deletingIds.has(id)) return;
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
    if (state.deletingIds.has(id)) return false;
    var a = state.assets.find(function (x) { return x.id === id; });
    var label = a ? (a.title || a.originalFilename) : 'this asset';
    if (!window.confirm('Delete "' + label + '" and its version history? Demo flows using it will show a missing asset. This cannot be undone.')) return false;
    state.deletingIds.add(id);
    render();
    var editing = state.editingId === id;
    if (editing) {
      $('demoAssetsEditDelete').disabled = true;
      $('demoAssetsEditSave').disabled = true;
      $('demoAssetsEditError').textContent = '';
    }
    setStatus('Deleting "' + label + '"...');
    try {
      await api('/' + encodeURIComponent(id), { method: 'DELETE' });
      removeAsset(id);
      if (state.historyId === id) els.historyDialog.close();
      if (state.previewId === id) els.previewDialog.close();
      if (state.editingId === id) els.editDialog.close();
      setStatus('Deleted "' + label + '".');
      els.search.focus();
      return true;
    } catch (e) {
      var message = 'Could not delete "' + label + '": ' + e.message + '. Try again.';
      setStatus(message, true);
      if (editing) $('demoAssetsEditError').textContent = message;
      return false;
    } finally {
      state.deletingIds.delete(id);
      if (editing) {
        $('demoAssetsEditDelete').disabled = false;
        $('demoAssetsEditSave').disabled = false;
      }
      render();
    }
  }

  // ---- Preview / present / export ----

  async function renderUrl(id, versionId) {
    var data = await api('/' + encodeURIComponent(id) + '/render-token', { method: 'POST', body: { versionId: versionId || undefined } });
    if (!data.url) {
      throw new Error('The isolated demo preview host is not configured. Please try again after the lab update.');
    }
    return data.url;
  }

  async function openPreview(id, versionId) {
    var a = state.assets.find(function (x) { return x.id === id; });
    state.previewId = id;
    state.previewVersionId = versionId || null;
    $('demoAssetsPreviewTitle').textContent = (a ? (a.title || a.originalFilename) : 'Preview') + (versionId ? ' · version ' + versionId.slice(0, 8) : '');
    els.previewFrame.src = 'about:blank';
    els.previewDialog.showModal();
    try {
      els.previewFrame.src = await renderUrl(id, versionId);
    } catch (e) {
      els.previewDialog.close();
      setStatus(e.message, true);
    }
  }

  async function present(id, versionId) {
    // Open the tab synchronously so popup blockers allow it, then navigate once the token arrives.
    var win = window.open('about:blank', '_blank');
    try {
      var url = await renderUrl(id, versionId);
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

  async function exportAsset(a, versionId, filename) {
    try {
      var res = await api('/' + encodeURIComponent(a.id) + '/export' + (versionId ? '?versionId=' + encodeURIComponent(versionId) : ''), { raw: true });
      if (!res.ok) throw new Error('Export failed (' + res.status + ')');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename || a.originalFilename || ((a.title || 'demo-asset').replace(/[^\w.-]+/g, '-') + '.html');
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    } catch (e) {
      setStatus(e.message, true);
    }
  }

  // ---- Version history ----

  function historyStatus(message, error) {
    els.historyStatus.textContent = message;
    els.historyStatus.classList.toggle('error', !!error);
  }

  async function loadHistory(id) {
    historyStatus('Loading versions...');
    els.historyList.textContent = '';
    try {
      var data = await api('/' + encodeURIComponent(id) + '/versions');
      if (state.historyId !== id) return;
      if (!Array.isArray(data.versions)) throw new Error('Unable to read version history. Please reopen History to retry.');
      data.versions.forEach(function (v) {
        var item = el('li', 'demo-assets-history-item');
        item.appendChild(el('strong', null, (v.current ? 'Current' : 'Archived') + ' · ' + (v.note || 'Version ' + v.id.slice(0, 8))));
        item.appendChild(el('p', null, [v.originalFilename, formatDate(v.createdAt), v.createdBy && (v.createdBy.name || v.createdBy.email), 'ID ' + v.id.slice(0, 8)].filter(Boolean).join(' · ')));
        var actions = el('div', 'demo-assets-history-actions');
        actions.appendChild(button('Preview', null, function () { return openPreview(id, v.id); }));
        actions.appendChild(button('Present', null, function () { present(id, v.id); }));
        actions.appendChild(button('Export', null, function () {
          var a = state.assets.find(function (asset) { return asset.id === id; });
          if (a) exportAsset(a, v.id, v.originalFilename);
        }));
        if (!v.current) actions.appendChild(button('Restore as current', null, function () { return restoreVersion(id, v); }));
        item.appendChild(actions);
        els.historyList.appendChild(item);
      });
      historyStatus(data.versions.length ? '' : 'No versions found.');
    } catch (e) {
      if (state.historyId === id) historyStatus(e.message + ' Close and reopen History to retry.', true);
    }
  }

  function openHistory(id) {
    if (state.historyBusy) { setStatus('Wait for the current restore to finish before opening another history.'); return; }
    var a = state.assets.find(function (asset) { return asset.id === id; });
    state.historyId = id;
    $('demoAssetsHistoryTitle').textContent = 'Version history · ' + (a ? a.title || a.originalFilename : 'Asset');
    els.historyDialog.showModal();
    return loadHistory(id);
  }

  async function restoreVersion(id, version) {
    if (state.historyBusy) return;
    if (!window.confirm('Restore "' + (version.note || version.id.slice(0, 8)) + '" as the current version? All existing versions will be kept. Flows using the current version will follow this change.')) return;
    state.historyBusy = true;
    var buttons = els.historyList.querySelectorAll('button');
    buttons.forEach(function (b) { b.disabled = true; });
    historyStatus('Restoring version...');
    try {
      var data = await api('/' + encodeURIComponent(id) + '/versions/' + encodeURIComponent(version.id) + '/restore', { method: 'POST', body: {} });
      upsertAsset(data.asset);
      if (state.historyId === id) {
        await loadHistory(id);
        if (!els.historyStatus.classList.contains('error')) historyStatus('Restored as a new current version. The full history is preserved.');
      }
      setStatus('Version restored. All earlier versions have been kept.');
    } catch (e) {
      if (state.historyId === id) historyStatus(e.message + ' Please retry.', true);
      else setStatus(e.message + ' Please reopen History to retry.', true);
    } finally {
      state.historyBusy = false;
      buttons.forEach(function (b) { b.disabled = false; });
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
      if (state.previewId) present(state.previewId, state.previewVersionId);
    });
    els.previewDialog.addEventListener('close', function () {
      els.previewFrame.src = 'about:blank';
      state.previewId = null;
      state.previewVersionId = null;
    });
    $('demoAssetsHistoryClose').addEventListener('click', function () { els.historyDialog.close(); });
    els.historyDialog.addEventListener('close', function () { state.historyId = null; });
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
      historyDialog: $('demoAssetsHistoryDialog'),
      historyList: $('demoAssetsHistoryList'),
      historyStatus: $('demoAssetsHistoryStatus'),
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
