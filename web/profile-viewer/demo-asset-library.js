/**
 * Demo asset library — store, classify, preview and present customer HTML demos.
 * Signed-in Adobe users only (Firebase ID token verified server-side).
 */
(function () {
  'use strict';

  var API = '/api/demo-assets';
  var MAX_BYTES = 25 * 1024 * 1024;
  var PAGE_SIZE = 100;
  var UPLOAD_CONCURRENCY = 3;

  var state = {
    user: null,
    assets: [],
    conversationTypes: [],
    view: 'active',
    groupBy: 'customer',
    nextCursor: null,
    loadingMore: false,
    listRequest: 0,
    searchTimer: null,
    selectedIds: new Set(),
    thumbnailUrls: new Map(),
    thumbnailBusy: new Set(),
    editingId: null,
    previewId: null,
    previewVersionId: null,
    historyId: null,
    historyBusy: false,
    historyCursor: null,
    shareId: null,
    activityId: null,
    flowAssetIds: [],
    flowBusy: false,
    deletingIds: new Set(),
    restoringIds: new Set(),
    uploadJobs: [],
    uploadQueue: [],
    activeUploads: 0,
    assetCommitQueues: new Map(),
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
    if (opts.signal) init.signal = opts.signal;
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

  async function loadLibrary(append) {
    append = !!append;
    if (append && state.loadingMore) return;
    var requestId = append ? state.listRequest : ++state.listRequest;
    state.loadingMore = true;
    if (!append) {
      state.assets = [];
      state.nextCursor = null;
      state.selectedIds.clear();
      render();
      updateSelectionToolbar();
      setStatus('Loading library…');
    }
    els.loadMore.disabled = true;
    els.loadMore.textContent = append ? 'Loading…' : 'Load more';
    try {
      var params = new URLSearchParams();
      params.set('limit', String(PAGE_SIZE));
      if (append && state.nextCursor) params.set('cursor', state.nextCursor);
      var query = els.search.value.trim();
      if (query) params.set('q', query);
      if (state.view === 'trash') params.set('deleted', 'true');
      var data = await api('?' + params.toString());
      if (requestId !== state.listRequest) return;
      var page = Array.isArray(data.assets) ? data.assets : [];
      if (append) {
        var existing = new Set(state.assets.map(function (a) { return a.id; }));
        page.forEach(function (a) { if (!existing.has(a.id)) state.assets.push(a); });
      } else {
        state.assets = page;
      }
      state.conversationTypes = Array.isArray(data.conversationTypes) ? data.conversationTypes : [];
      state.nextCursor = data.nextCursor || null;
      populateFilters();
      render();
      updateSelectionToolbar();
      els.loadMore.hidden = !state.nextCursor;
      els.pageStatus.textContent = state.assets.length
        ? 'Showing ' + state.assets.length + ' ' + (state.assets.length === 1 ? 'asset' : 'assets') + (state.nextCursor ? ' · more available' : ' · all results loaded')
        : '';
      setStatus('');
    } catch (e) {
      if (requestId === state.listRequest) {
        setStatus(e.message + (append ? ' Use Load more to retry.' : ' Check your connection and try again.'), true);
        els.loadMore.hidden = !state.nextCursor;
      }
    } finally {
      if (requestId === state.listRequest) {
        state.loadingMore = false;
        els.loadMore.disabled = false;
        els.loadMore.textContent = 'Load more';
      }
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
    var cust = els.customerFilter.value;
    var type = els.typeFilter.value;
    var evt = els.eventFilter.value;
    var review = els.needsReview.checked;
    return state.assets.filter(function (a) {
      if (state.view === 'trash' && a.deleted === false) return false;
      if (state.view === 'active' && a.deleted === true) return false;
      if (cust && a.customer !== cust) return false;
      if (type && a.conversationType !== type) return false;
      if (evt && a.event !== evt) return false;
      if (review && a.status !== 'needs_review') return false;
      return true;
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
        state.assets.length ? 'No assets match these filters.' : state.view === 'trash'
          ? 'Trash is empty. Deleted assets will stay here until restored.'
          : 'No assets yet. Drop HTML files above to start the library.'));
      return;
    }
    var key = state.groupBy;
    if (key === 'none') {
      list.forEach(function (a) { els.grid.appendChild(renderCard(a)); });
      return;
    }
    var groups = new Map();
    list.forEach(function (a) {
      var label = String(a[key] || '').trim() || (key === 'customer' ? 'No customer' : 'Unclassified');
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(a);
    });
    Array.from(groups.keys()).sort(function (a, b) { return a.localeCompare(b); }).forEach(function (label) {
      var group = el('section', 'demo-assets-group');
      group.setAttribute('aria-label', label + ' assets');
      var title = el('h3', 'demo-assets-group-title', label);
      title.appendChild(el('span', 'demo-assets-group-count', String(groups.get(label).length)));
      group.appendChild(title);
      var grid = el('div', 'demo-assets-group-grid');
      groups.get(label).forEach(function (a) { grid.appendChild(renderCard(a)); });
      group.appendChild(grid);
      els.grid.appendChild(group);
    });
  }

  function renderCard(a) {
    var card = el('article', 'demo-assets-card');
    var heading = el('div', 'demo-assets-card-heading');
    if (state.view !== 'trash') {
      var selectLabel = el('label', 'demo-assets-select-label');
      var select = el('input');
      select.type = 'checkbox';
      select.className = 'demo-assets-select';
      select.checked = state.selectedIds.has(a.id);
      select.setAttribute('aria-label', 'Select ' + (a.title || a.originalFilename || 'asset'));
      select.addEventListener('change', function () {
        if (select.checked) state.selectedIds.add(a.id);
        else state.selectedIds.delete(a.id);
        updateSelectionToolbar();
      });
      selectLabel.appendChild(select);
      heading.appendChild(selectLabel);
    }
    heading.appendChild(el('h3', null, a.title || a.originalFilename || 'Untitled asset'));
    var deleting = state.deletingIds.has(a.id);
    var restoring = state.restoringIds.has(a.id);
    if (state.view !== 'trash' && !a.deleted) {
      var remove = button(null, 'demo-assets-delete', function () { return deleteAsset(a.id); });
      var deleteLabel = (deleting ? 'Moving to Trash: ' : 'Move to Trash: ') + (a.title || a.originalFilename || 'asset');
      remove.setAttribute('aria-label', deleteLabel);
      remove.setAttribute('aria-busy', String(deleting));
      remove.title = deleteLabel;
      remove.disabled = deleting;
      var bin = el('span', 'demo-assets-delete-icon');
      bin.setAttribute('aria-hidden', 'true');
      remove.appendChild(bin);
      heading.appendChild(remove);
    }
    card.appendChild(heading);

    var localPoster = typeof a.posterUrl === 'string' && a.posterUrl &&
      !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(a.posterUrl) ? a.posterUrl : '';
    if (localPoster) {
      var poster = el('img', 'demo-assets-poster');
      poster.src = localPoster;
      poster.alt = 'Preview image for ' + (a.title || a.originalFilename || 'demo asset');
      poster.loading = 'lazy';
      card.appendChild(poster);
    } else if (state.view !== 'trash') {
      card.appendChild(renderThumbnail(a));
    }

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
    if (state.view === 'trash' || a.deleted) {
      var recover = button(restoring ? 'Restoring…' : 'Restore', 'dashboard-btn-primary', function () { return restoreAsset(a.id); });
      recover.disabled = restoring;
      recover.setAttribute('aria-busy', String(restoring));
      actions.appendChild(recover);
    } else {
      actions.appendChild(button('Preview', 'dashboard-btn-primary', function () { openPreview(a.id); }));
      var adapt = el('a', 'dashboard-btn-outline', 'Adapt');
      adapt.href = 'demo-studio.html?asset=' + encodeURIComponent(a.id) + '&adapt=1';
      actions.appendChild(adapt);
      var menu = el('details', 'demo-assets-more-actions');
      var summary = el('summary', null, 'More');
      menu.appendChild(summary);
      var menuItems = el('div', 'demo-assets-more-menu');
      menuItems.appendChild(button('Edit details', null, function () { openEdit(a.id); }));
      var review = el('a', 'demo-assets-menu-link', 'AI Review');
      review.href = 'demo-studio.html?asset=' + encodeURIComponent(a.id);
      menuItems.appendChild(review);
      menuItems.appendChild(button('Present', null, function () { present(a.id); }));
      menuItems.appendChild(button('Export', null, function () { exportAsset(a); }));
      menuItems.appendChild(button('History', null, function () { return openHistory(a.id); }));
      menuItems.appendChild(button('Add to flow…', null, function () { openFlowChooser([a.id]); }));
      menuItems.appendChild(button('Share…', null, function () { return openShare(a.id); }));
      menuItems.appendChild(button('Activity', null, function () { return openActivity(a.id); }));
      menu.appendChild(menuItems);
      actions.appendChild(menu);
    }
    card.appendChild(actions);
    return card;
  }

  function renderThumbnail(a) {
    var wrap = el('div', 'demo-assets-thumbnail');
    var url = state.thumbnailUrls.get(a.id);
    var busy = state.thumbnailBusy.has(a.id);
    if (url) {
      var frame = el('iframe', 'demo-assets-thumbnail-frame');
      frame.setAttribute('title', 'Sandboxed thumbnail preview of ' + (a.title || a.originalFilename || 'demo asset'));
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('loading', 'lazy');
      frame.src = url;
      wrap.appendChild(frame);
    } else {
      var show = button(busy ? 'Loading preview…' : 'Show thumbnail', 'demo-assets-thumbnail-toggle', function () { return loadThumbnail(a.id); });
      show.disabled = busy;
      show.setAttribute('aria-busy', String(busy));
      wrap.appendChild(show);
    }
    return wrap;
  }

  async function loadThumbnail(id) {
    if (state.thumbnailBusy.has(id)) return;
    state.thumbnailBusy.add(id);
    render();
    try {
      var url = await renderUrl(id);
      state.thumbnailUrls.set(id, url);
    } catch (e) {
      setStatus('Could not load thumbnail: ' + e.message, true);
    } finally {
      state.thumbnailBusy.delete(id);
      render();
    }
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

  function updateSelectionToolbar() {
    var ids = Array.from(state.selectedIds).filter(function (id) {
      return state.assets.some(function (a) { return a.id === id && !a.deleted; });
    });
    state.selectedIds = new Set(ids);
    var count = ids.length;
    els.selectionToolbar.hidden = !count || state.view === 'trash';
    els.selectionCount.textContent = count + ' selected';
    var encoded = ids.map(encodeURIComponent).join(',');
    els.buildFlow.href = 'demo-flows.html?assets=' + encoded;
    els.createBrief.href = 'demo-flows.html?assets=' + encoded;
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
      var job = { item: it, row: row, status: 'queued', mode: null, controller: null, cancelled: false };
      row.job = job;
      state.uploadJobs.push(job);
      queueUploadJob(job, null);
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
    return { li: li, msg: msg, actions: actions, name: name };
  }

  function setRow(row, st, text) {
    row.li.dataset.state = st;
    row.msg.textContent = text;
    row.actions.textContent = '';
    refreshUploadSummary();
  }

  function addCancelAction(job) {
    job.row.actions.appendChild(button('Cancel upload', null, function () { cancelUpload(job); }));
  }

  function cancelUpload(job) {
    if (!job || ['done', 'error', 'cancelled'].indexOf(job.status) !== -1) return;
    job.cancelled = true;
    if (job.controller) job.controller.abort();
    job.status = 'cancelled';
    setRow(job.row, 'cancelled', 'Upload cancelled. Nothing further will be sent.');
  }

  function refreshUploadSummary() {
    var jobs = state.uploadJobs;
    var counts = { queued: 0, uploading: 0, decision: 0, done: 0, error: 0, cancelled: 0 };
    jobs.forEach(function (job) { counts[job.status] = (counts[job.status] || 0) + 1; });
    var completed = counts.done + counts.error + counts.cancelled;
    els.uploadSummary.textContent = jobs.length
      ? jobs.length + ' file' + (jobs.length === 1 ? '' : 's') + ' · ' +
        counts.queued + ' queued · ' + counts.uploading + ' uploading · ' +
        counts.decision + ' awaiting decision · ' + completed + ' complete' +
        (counts.error ? ' · ' + counts.error + ' need retry' : '')
      : '';
    els.uploadProgress.hidden = !jobs.length;
    els.uploadProgress.max = jobs.length || 1;
    els.uploadProgress.value = completed;
  }

  function queueUploadJob(job, mode) {
    if (job.cancelled) return;
    job.mode = mode || null;
    job.status = 'queued';
    job.controller = null;
    setRow(job.row, 'pending', 'Queued');
    addCancelAction(job);
    state.uploadQueue.push(job);
    refreshUploadSummary();
    scheduleUploads();
  }

  function scheduleUploads() {
    while (state.activeUploads < UPLOAD_CONCURRENCY && state.uploadQueue.length) {
      var job = state.uploadQueue.shift();
      if (job.cancelled) continue;
      state.activeUploads += 1;
      job.status = 'uploading';
      job.controller = typeof AbortController === 'function' ? new AbortController() : null;
      var text = job.mode && job.mode.target ? 'Saving new version…' : job.mode && job.mode.separate
        ? 'Uploading separately…' : 'Uploading and classifying…';
      setRow(job.row, 'pending', text);
      addCancelAction(job);
      refreshUploadSummary();
      (function (current) {
        Promise.resolve(uploadOne(current)).catch(function (e) {
          if (current.cancelled || e.name === 'AbortError') {
            current.status = 'cancelled';
            setRow(current.row, 'cancelled', 'Upload cancelled. Nothing further will be sent.');
            return;
          }
          current.status = 'error';
          setRow(current.row, 'error', e.message);
          current.row.actions.appendChild(button('Retry upload', null, function () {
            current.cancelled = false;
            queueUploadJob(current, current.mode);
          }));
        }).finally(function () {
          current.controller = null;
          state.activeUploads -= 1;
          refreshUploadSummary();
          scheduleUploads();
        });
      })(job);
    }
  }

  function chooseUploadVersion(job, candidates) {
    var it = job.item;
    var row = job.row;
    job.status = 'decision';
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
    choices.appendChild(button('Save as a new version', 'dashboard-btn-primary', function () {
      var target = candidates.find(function (a) { return a.id === select.value; });
      queueUploadJob(job, { target: target });
    }));
    choices.appendChild(button('Keep as a separate asset', null, function () {
      queueUploadJob(job, { separate: true });
    }));
    choices.appendChild(button('Cancel upload', null, function () {
      cancelUpload(job);
    }));
    select.focus();
  }

  function saveVersionSerially(job, target) {
    var id = target.id;
    var prior = state.assetCommitQueues.get(id) || Promise.resolve();
    var request = prior.catch(function () {}).then(async function () {
      if (job.cancelled) throw new Error('Upload cancelled.');
      var latest = state.assets.find(function (asset) { return asset.id === id; }) || target;
      var data = await api('/' + encodeURIComponent(id) + '/versions', {
        method: 'POST',
        signal: job.controller && job.controller.signal,
        body: {
          html: await job.item.file.text(),
          filename: job.item.file.name,
          folderPath: folderOf(job.item.path),
          expectedVersionId: latest.currentVersionId || target.currentVersionId,
        },
      });
      if (data.asset) upsertAsset(data.asset);
      return data;
    });
    state.assetCommitQueues.set(id, request);
    return request.finally(function () {
      if (state.assetCommitQueues.get(id) === request) state.assetCommitQueues.delete(id);
    });
  }

  async function uploadOne(job) {
    var it = job.item;
    var row = job.row;
    if (it.file.size > MAX_BYTES) {
      job.status = 'error';
      setRow(row, 'error', 'Too large (' + formatBytes(it.file.size) + ', max 25 MB)');
      return;
    }
    try {
      var data;
      var mode = job.mode || {};
      if (mode.target) {
        data = await saveVersionSerially(job, mode.target);
      } else {
        data = await api('', {
          method: 'POST',
          signal: job.controller && job.controller.signal,
          body: { html: await it.file.text(), filename: it.file.name, folderPath: folderOf(it.path), force: !!mode.separate },
        });
      }
      var asset = data.asset;
      upsertAsset(asset);
      if (mode.target) {
        job.status = 'done';
        setRow(row, 'ok', 'New version saved for "' + asset.title + '". Older versions are in History.');
        row.actions.appendChild(button('History', null, function () { openHistory(asset.id); }));
        return;
      }
      var added = 'Added' + (asset.customer ? ' · ' + asset.customer : '') + (asset.conversationType ? ' · ' + asset.conversationType : '');
      var similar = (data.similar || [])[0];
      if (similar) {
        job.status = 'done';
        setRow(row, 'similar', added + ' — looks like "' + (similar.title || 'an existing demo') + '"' +
          (similar.customer ? ' (' + similar.customer + ')' : '') + ', ' + Math.round((similar.score || 0) * 100) + '% similar');
        row.actions.appendChild(button('Compare', null, function () { openPreview(similar.id); }));
      } else {
        job.status = 'done';
        setRow(row, 'ok', added);
      }
      row.actions.appendChild(button('Edit details', null, function () { openEdit(asset.id, { isNew: true }); }));
      row.actions.appendChild(button('AI Review', null, function () { window.location.href = 'demo-studio.html?asset=' + encodeURIComponent(asset.id); }));
    } catch (e) {
      if (job.cancelled || e.name === 'AbortError') {
        job.status = 'cancelled';
        setRow(row, 'cancelled', 'Upload cancelled. Nothing further will be sent.');
        return;
      }
      if (e.status === 409 && e.data && e.data.versionCandidates && e.data.versionCandidates.length) {
        chooseUploadVersion(job, e.data.versionCandidates);
        return;
      }
      if (e.status === 409 && e.data && e.data.duplicate) {
        job.status = 'decision';
        var existing = e.data.asset;
        setRow(row, 'duplicate', 'Already in library' + (existing && existing.title ? ': ' + existing.title : ''));
        if (existing && existing.id) {
          row.actions.appendChild(button('View', null, function () { openPreview(existing.id); }));
        }
        row.actions.appendChild(button('Upload anyway', null, function () {
          queueUploadJob(job, { separate: true });
        }));
        row.actions.appendChild(button('Cancel upload', null, function () { cancelUpload(job); }));
        return;
      }
      job.status = 'error';
      setRow(row, 'error', e.message);
      row.actions.appendChild(button('Retry upload', null, function () {
        job.cancelled = false;
        queueUploadJob(job, job.mode);
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
    if (!window.confirm('Move "' + label + '" to Trash? The HTML and version history will be retained in Trash. Demo flows may show the asset as unavailable until it is restored.')) return false;
    state.deletingIds.add(id);
    render();
    var editing = state.editingId === id;
    if (editing) {
      $('demoAssetsEditDelete').disabled = true;
      $('demoAssetsEditSave').disabled = true;
      $('demoAssetsEditError').textContent = '';
    }
    setStatus('Moving "' + label + '" to Trash…');
    try {
      await api('/' + encodeURIComponent(id), { method: 'DELETE' });
      removeAsset(id);
      state.selectedIds.delete(id);
      if (state.historyId === id) els.historyDialog.close();
      if (state.previewId === id) els.previewDialog.close();
      if (state.editingId === id) els.editDialog.close();
      setStatus('Moved "' + label + '" to Trash. Its HTML and version history are retained.');
      els.search.focus();
      return true;
    } catch (e) {
      var message = 'Could not move "' + label + '" to Trash: ' + e.message + '. Try again.';
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

  async function restoreAsset(id) {
    if (state.restoringIds.has(id)) return false;
    var a = state.assets.find(function (asset) { return asset.id === id; });
    var label = a ? a.title || a.originalFilename : 'asset';
    state.restoringIds.add(id);
    render();
    setStatus('Restoring "' + label + '"…');
    try {
      var data = await api('/' + encodeURIComponent(id) + '/undelete', { method: 'POST', body: {} });
      state.assets = state.assets.filter(function (asset) { return asset.id !== id; });
      if (state.view === 'active' && data.asset) upsertAsset(data.asset);
      else render();
      setStatus('Restored "' + label + '" to the active library.');
      return true;
    } catch (e) {
      setStatus('Could not restore "' + label + '": ' + e.message + '. Try again.', true);
      return false;
    } finally {
      state.restoringIds.delete(id);
      render();
    }
  }

  // ---- Flow assignment ----

  function flowNewHref(ids) {
    return 'demo-flows.html?assets=' + ids.map(encodeURIComponent).join(',');
  }

  async function openFlowChooser(ids) {
    state.flowAssetIds = ids.filter(function (id, index) { return ids.indexOf(id) === index; });
    els.flowNew.href = flowNewHref(state.flowAssetIds);
    els.flowStatus.textContent = 'Loading flows…';
    els.flowExisting.disabled = true;
    els.flowSelect.textContent = '';
    var placeholder = el('option', null, 'Choose a flow');
    placeholder.value = '';
    els.flowSelect.appendChild(placeholder);
    els.flowDialog.showModal();
    try {
      var data = await api('/flows');
      var flows = Array.isArray(data.flows) ? data.flows : [];
      flows.forEach(function (flow) {
        var option = el('option', null, (flow.title || 'Untitled flow') + (flow.customer ? ' · ' + flow.customer : ''));
        option.value = flow.id;
        els.flowSelect.appendChild(option);
      });
      els.flowStatus.textContent = flows.length ? 'Choose where to add ' + state.flowAssetIds.length + ' asset' + (state.flowAssetIds.length === 1 ? '' : 's') + '.' : 'No flows yet. Create a new flow to continue.';
      els.flowExisting.disabled = !flows.length;
    } catch (e) {
      els.flowStatus.textContent = 'Could not load flows: ' + e.message + '. Retry by closing and reopening this chooser.';
      els.flowStatus.classList.add('error');
    }
  }

  async function addAssetsToFlow() {
    if (state.flowBusy || !els.flowSelect.value) return;
    state.flowBusy = true;
    var flowId = els.flowSelect.value;
    els.flowExisting.disabled = true;
    els.flowExisting.setAttribute('aria-busy', 'true');
    els.flowStatus.textContent = 'Adding assets to the flow…';
    els.flowStatus.classList.remove('error');
    try {
      var response = await api('/flows/' + encodeURIComponent(flowId));
      if (!response.flow || !Array.isArray(response.flow.steps)) throw new Error('Flow response did not include its steps.');
      var flow = response.flow;
      var steps = flow.steps.slice();
      var existing = new Set(steps.map(function (step) { return step.assetId; }));
      state.flowAssetIds.forEach(function (id) {
        if (existing.has(id)) return;
        var asset = state.assets.find(function (item) { return item.id === id; });
        if (!asset) return;
        var pinnedVersion = asset.currentVersionId || null;
        steps.push({
          assetId: asset.id,
          versionId: pinnedVersion,
          expectedVersionId: pinnedVersion,
          currentVersionAtSave: pinnedVersion,
          title: asset.title || asset.originalFilename || 'Demo asset',
          talkTrack: '',
          durationMin: 5,
        });
      });
      await api('/flows/' + encodeURIComponent(flowId), { method: 'PATCH', body: { steps: steps } });
      els.flowStatus.textContent = steps.length === flow.steps.length
        ? 'All selected assets are already in this flow.'
        : 'Added selected assets to "' + (flow.title || 'the flow') + '". Your library selection is unchanged.';
      setStatus('Flow updated. Selected library assets remain available.');
    } catch (e) {
      els.flowStatus.textContent = 'Could not update the flow: ' + e.message + '. Your assets are unchanged; retry when ready.';
      els.flowStatus.classList.add('error');
    } finally {
      state.flowBusy = false;
      els.flowExisting.disabled = false;
      els.flowExisting.setAttribute('aria-busy', 'false');
    }
  }

  // ---- Share links and activity ----

  async function loadShareLinks(id) {
    els.shareList.textContent = '';
    els.shareStatus.textContent = 'Loading your links…';
    try {
      var data = await api('/' + encodeURIComponent(id) + '/render-tokens');
      var tokens = Array.isArray(data.tokens) ? data.tokens : [];
      tokens.forEach(function (token) {
        var item = el('li', 'demo-assets-history-item');
        var stateText = token.revoked ? 'Revoked' : new Date(token.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Active';
        item.appendChild(el('strong', null, stateText + ' · expires ' + (formatDate(token.expiresAt) || 'unknown')));
        item.appendChild(el('p', null, ['Version ' + String(token.versionId || '').slice(0, 8), 'Created ' + formatDate(token.createdAt)].filter(Boolean).join(' · ')));
        var actions = el('div', 'demo-assets-history-actions');
        if (stateText === 'Active' && token.url) {
          actions.appendChild(button('Copy link', null, function () { return copyShareUrl(token.url); }));
          var revoke = button('Revoke link', null, function () { return revokeShareToken(id, token.id, revoke); });
          revoke.disabled = stateText !== 'Active';
          actions.appendChild(revoke);
        }
        item.appendChild(actions);
        els.shareList.appendChild(item);
      });
      els.shareStatus.textContent = tokens.length ? 'Only links created by your account are listed here.' : 'No links created by you yet.';
      if (!tokens.length) els.shareList.appendChild(el('li', 'demo-assets-empty', 'No share links yet.'));
    } catch (e) {
      els.shareStatus.textContent = 'Could not load your links: ' + e.message + '. Close and reopen Share to retry.';
      els.shareStatus.classList.add('error');
    }
  }

  async function openShare(id) {
    state.shareId = id;
    els.shareDialog.showModal();
    els.shareCreated.hidden = true;
    els.shareStatus.classList.remove('error');
    var a = state.assets.find(function (asset) { return asset.id === id; });
    els.shareTitle.textContent = 'Share · ' + (a ? a.title || a.originalFilename : 'Demo');
    els.shareCreate.disabled = false;
    await loadShareLinks(id);
  }

  async function createShareLink() {
    var id = state.shareId;
    if (!id) return;
    var asset = state.assets.find(function (item) { return item.id === id; });
    els.shareCreate.disabled = true;
    els.shareCreate.setAttribute('aria-busy', 'true');
    els.shareStatus.textContent = 'Creating a pinned, expiring link…';
    els.shareStatus.classList.remove('error');
    try {
      if (!asset || !asset.currentVersionId) throw new Error('This asset has no current version to pin.');
      var data = await api('/' + encodeURIComponent(id) + '/render-token', {
        method: 'POST',
        body: { versionId: asset.currentVersionId },
      });
      if (!data.url || !data.expiresAt) throw new Error('The server did not return a share URL and expiry.');
      els.shareUrl.value = data.url;
      els.shareExpiry.textContent = 'Pinned to version ' + String(data.versionId || (asset && asset.currentVersionId) || 'current').slice(0, 8) + ' · expires ' + new Date(data.expiresAt).toLocaleString();
      els.shareCreated.hidden = false;
      els.shareStatus.textContent = 'Link created. Anyone with it can view the demo until it expires.';
      await loadShareLinks(id);
    } catch (e) {
      els.shareStatus.textContent = 'Could not create the link: ' + e.message + '. Retry when ready.';
      els.shareStatus.classList.add('error');
    } finally {
      els.shareCreate.disabled = false;
      els.shareCreate.setAttribute('aria-busy', 'false');
    }
  }

  async function copyShareUrl(url) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        els.shareUrl.value = url;
        els.shareUrl.focus();
        els.shareUrl.select();
        if (!document.execCommand || !document.execCommand('copy')) throw new Error('Clipboard access is unavailable. Select and copy the link manually.');
      }
      els.shareStatus.textContent = 'Link copied to clipboard.';
      els.shareStatus.classList.remove('error');
    } catch (e) {
      els.shareStatus.textContent = 'Could not copy the link: ' + e.message + '. Select the link field and copy it manually.';
      els.shareStatus.classList.add('error');
    }
  }

  async function revokeShareToken(assetId, tokenId, control) {
    if (!window.confirm('Revoke this share link? Anyone using it will lose access immediately.')) return;
    control.disabled = true;
    control.setAttribute('aria-busy', 'true');
    try {
      await api('/' + encodeURIComponent(assetId) + '/render-tokens/' + encodeURIComponent(tokenId), { method: 'DELETE' });
      els.shareStatus.textContent = 'Share link revoked.';
      await loadShareLinks(assetId);
    } catch (e) {
      control.disabled = false;
      control.setAttribute('aria-busy', 'false');
      els.shareStatus.textContent = 'Could not revoke this link: ' + e.message + '. Try again.';
      els.shareStatus.classList.add('error');
    }
  }

  async function openActivity(id) {
    state.activityId = id;
    var asset = state.assets.find(function (item) { return item.id === id; });
    els.activityTitle.textContent = 'Activity · ' + (asset ? asset.title || asset.originalFilename : 'Asset');
    els.activityList.textContent = '';
    els.activityStatus.textContent = 'Loading activity…';
    els.activityStatus.classList.remove('error');
    els.activityDialog.showModal();
    try {
      var data = await api('/audit?assetId=' + encodeURIComponent(id));
      var entries = Array.isArray(data.entries) ? data.entries : [];
      entries.forEach(function (entry) {
        var item = el('li', 'demo-assets-history-item');
        item.appendChild(el('strong', null, entry.action || entry.event || entry.type || 'Asset updated'));
        var detail = [entry.detail, entry.email, formatDate(entry.at)]
          .filter(Boolean).join(' · ');
        if (detail) item.appendChild(el('p', null, detail));
        els.activityList.appendChild(item);
      });
      els.activityStatus.textContent = entries.length ? entries.length + ' activity ' + (entries.length === 1 ? 'entry' : 'entries') + '.' : 'No activity recorded for this asset.';
    } catch (e) {
      els.activityStatus.textContent = 'Could not load activity: ' + e.message + '. Close and reopen Activity to retry.';
      els.activityStatus.classList.add('error');
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

  async function loadHistory(id, append) {
    append = !!append;
    if (!append) {
      state.historyCursor = null;
      els.historyList.textContent = '';
      els.historyMore.hidden = true;
    }
    historyStatus(append ? 'Loading more versions…' : 'Loading versions…');
    els.historyMore.disabled = true;
    try {
      var params = new URLSearchParams();
      params.set('limit', '50');
      if (append && state.historyCursor) params.set('cursor', state.historyCursor);
      var data = await api('/' + encodeURIComponent(id) + '/versions?' + params.toString());
      if (state.historyId !== id) return;
      var versions = Array.isArray(data) ? data : data.versions;
      if (!Array.isArray(versions)) throw new Error('Unable to read version history. Please reopen History to retry.');
      state.historyCursor = Array.isArray(data) ? null : data.nextCursor || null;
      versions.forEach(function (v) {
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
      historyStatus(versions.length ? '' : append ? 'No more versions found.' : 'No versions found.');
      els.historyMore.hidden = !state.historyCursor;
    } catch (e) {
      if (state.historyId === id) historyStatus(e.message + ' Close and reopen History to retry.', true);
    } finally {
      els.historyMore.disabled = false;
    }
  }

  function openHistory(id) {
    if (state.historyBusy) { setStatus('Wait for the current restore to finish before opening another history.'); return; }
    var a = state.assets.find(function (asset) { return asset.id === id; });
    state.historyId = id;
    $('demoAssetsHistoryTitle').textContent = 'Version history · ' + (a ? a.title || a.originalFilename : 'Asset');
    els.historyDialog.showModal();
    return loadHistory(id, false);
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
        await loadHistory(id, false);
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

    els.search.addEventListener('input', function () {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () { loadLibrary(false); }, 250);
    });
    [els.customerFilter, els.typeFilter, els.eventFilter, els.needsReview].forEach(function (n) {
      n.addEventListener('change', render);
    });
    els.groupBy.addEventListener('change', function () {
      state.groupBy = els.groupBy.value || 'customer';
      render();
    });
    els.activeView.addEventListener('click', function () {
      if (state.view === 'active') return;
      state.view = 'active';
      state.selectedIds.clear();
      els.activeView.setAttribute('aria-pressed', 'true');
      els.trashView.setAttribute('aria-pressed', 'false');
      els.trashNotice.hidden = true;
      els.needsReview.disabled = false;
      loadLibrary(false);
    });
    els.trashView.addEventListener('click', function () {
      if (state.view === 'trash') return;
      state.view = 'trash';
      state.selectedIds.clear();
      els.activeView.setAttribute('aria-pressed', 'false');
      els.trashView.setAttribute('aria-pressed', 'true');
      els.trashNotice.hidden = false;
      els.needsReview.checked = false;
      els.needsReview.disabled = true;
      render();
      updateSelectionToolbar();
      loadLibrary(false);
    });
    els.loadMore.addEventListener('click', function () { return loadLibrary(true); });
    els.selectAll.addEventListener('click', function () {
      filtered().forEach(function (asset) { state.selectedIds.add(asset.id); });
      render();
      updateSelectionToolbar();
    });
    els.clearSelection.addEventListener('click', function () {
      state.selectedIds.clear();
      render();
      updateSelectionToolbar();
    });
    els.addToFlow.addEventListener('click', function () { return openFlowChooser(Array.from(state.selectedIds)); });
    els.flowExisting.addEventListener('click', addAssetsToFlow);
    els.historyMore.addEventListener('click', function () {
      if (state.historyId) return loadHistory(state.historyId, true);
    });
    els.shareCreate.addEventListener('click', createShareLink);
    els.shareCopy.addEventListener('click', function () { return copyShareUrl(els.shareUrl.value); });
    els.shareClose.addEventListener('click', function () { els.shareDialog.close(); });
    els.activityClose.addEventListener('click', function () { els.activityDialog.close(); });
    els.flowCancel.addEventListener('click', function () { els.flowDialog.close(); });

    els.form.addEventListener('submit', saveEdit);
    $('demoAssetsEditCancel').addEventListener('click', async function () {
      var id = state.editingId;
      if (els.editDialog.dataset.isNew === '1' && id &&
          window.confirm('Keep this upload in the library as "Needs review"? Choose Cancel to move it to Trash; its content will be retained.') === false) {
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
    els.historyDialog.addEventListener('close', function () { state.historyId = null; state.historyCursor = null; });
    els.shareDialog.addEventListener('close', function () { state.shareId = null; });
    els.activityDialog.addEventListener('close', function () { state.activityId = null; });
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
      uploadSummary: $('demoAssetsUploadSummary'),
      uploadProgress: $('demoAssetsUploadProgress'),
      count: $('demoAssetsCount'),
      search: $('demoAssetsSearch'),
      customerFilter: $('demoAssetsCustomerFilter'),
      typeFilter: $('demoAssetsTypeFilter'),
      eventFilter: $('demoAssetsEventFilter'),
      groupBy: $('demoAssetsGroupBy'),
      needsReview: $('demoAssetsNeedsReview'),
      status: $('demoAssetsStatus'),
      grid: $('demoAssetsGrid'),
      pageStatus: $('demoAssetsPageStatus'),
      loadMore: $('demoAssetsLoadMore'),
      activeView: $('demoAssetsActiveView'),
      trashView: $('demoAssetsTrashView'),
      trashNotice: $('demoAssetsTrashNotice'),
      selectionToolbar: $('demoAssetsSelectionToolbar'),
      selectionCount: $('demoAssetsSelectionCount'),
      selectAll: $('demoAssetsSelectAll'),
      clearSelection: $('demoAssetsClearSelection'),
      addToFlow: $('demoAssetsAddToFlow'),
      buildFlow: $('demoAssetsBuildFlow'),
      createBrief: $('demoAssetsCreateBrief'),
      editDialog: $('demoAssetsEditDialog'),
      form: $('demoAssetsEditForm'),
      previewDialog: $('demoAssetsPreviewDialog'),
      previewFrame: $('demoAssetsPreviewFrame'),
      historyDialog: $('demoAssetsHistoryDialog'),
      historyList: $('demoAssetsHistoryList'),
      historyStatus: $('demoAssetsHistoryStatus'),
      historyMore: $('demoAssetsHistoryMore'),
      shareDialog: $('demoAssetsShareDialog'),
      shareTitle: $('demoAssetsShareTitle'),
      shareCreate: $('demoAssetsShareCreate'),
      shareStatus: $('demoAssetsShareStatus'),
      shareCreated: $('demoAssetsShareCreated'),
      shareExpiry: $('demoAssetsShareExpiry'),
      shareUrl: $('demoAssetsShareUrl'),
      shareCopy: $('demoAssetsShareCopy'),
      shareList: $('demoAssetsShareList'),
      shareClose: $('demoAssetsShareClose'),
      activityDialog: $('demoAssetsActivityDialog'),
      activityTitle: $('demoAssetsActivityTitle'),
      activityStatus: $('demoAssetsActivityStatus'),
      activityList: $('demoAssetsActivityList'),
      activityClose: $('demoAssetsActivityClose'),
      flowDialog: $('demoAssetsFlowDialog'),
      flowStatus: $('demoAssetsFlowStatus'),
      flowSelect: $('demoAssetsFlowSelect'),
      flowExisting: $('demoAssetsFlowExisting'),
      flowCancel: $('demoAssetsFlowCancel'),
      flowNew: $('demoAssetsFlowNew'),
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
      loadLibrary(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
