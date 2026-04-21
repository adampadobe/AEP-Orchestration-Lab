/**
 * Image hosting — list brand-scraper scrapes per sandbox and render their
 * classified images as a grid using the public URL saved alongside each
 * asset. Falls back to signedUrl when the object wasn't made public.
 */
(function () {
  'use strict';

  var listEl = document.getElementById('imageHostingList');
  var statusEl = document.getElementById('imageHostingStatus');
  var libraryGridEl = document.getElementById('imageHostingLibraryGrid');
  var libraryEmptyEl = document.getElementById('imageHostingLibraryEmpty');
  var libraryCountEl = document.getElementById('imageHostingLibraryCountPill');
  var refreshBtn = document.getElementById('imageHostingRefreshBtn');
  var categoryFilterEl = document.getElementById('imageHostingCategoryFilter');
  var lightbox = document.getElementById('imageHostingLightbox');
  var lightboxImg = document.getElementById('imageHostingLightboxImg');
  var lightboxCaption = document.getElementById('imageHostingLightboxCaption');
  var lightboxClose = document.getElementById('imageHostingLightboxClose');

  var currentFilter = '';
  var lastRecords = [];
  var classifying = {}; // scrapeId → true while a classify is in flight

  // Persist view + sort preferences per-browser so switching pages
  // or reloading keeps the user's last choice.
  var LS_VIEW = 'imageHostingLibraryView';
  var LS_SORT = 'imageHostingLibrarySort';
  var viewMode = (function () {
    try { return localStorage.getItem(LS_VIEW) || 'grid'; } catch (_e) { return 'grid'; }
  })();
  var sortBy = (function () {
    try { return localStorage.getItem(LS_SORT) || 'name'; } catch (_e) { return 'name'; }
  })();
  // Most-recently-focused library card — used to decide whether a paste
  // should replace that specific card vs. add a new file.
  var focusedLibraryCard = null;
  var lastLibraryItems = [];
  var libraryFilterText = '';
  // Bulk-select state for multi-delete. Tracks item relPaths.
  var selectedRelPaths = Object.create(null);
  function selectionCount() {
    return Object.keys(selectedRelPaths).length;
  }

  function getSandbox() {
    try {
      return (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandboxName()) || '';
    } catch (_e) { return ''; }
  }

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  function sandboxQs() {
    var sb = getSandbox();
    return sb ? ('?sandbox=' + encodeURIComponent(sb)) : '';
  }

  async function fetchScrapes(sb) {
    var r = await fetch('/api/brand-scraper/scrapes' + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  async function fetchScrape(sb, scrapeId) {
    var r = await fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId) + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    if (!r.ok) return null;
    return r.json().catch(function () { return null; });
  }

  function imageUrl(img) {
    return img.publicUrl || img.signedUrl || img.src || '';
  }

  function collectCategories(records) {
    var set = {};
    records.forEach(function (rec) {
      var imgs = rec.images || [];
      imgs.forEach(function (img) {
        var cat = img.classification && img.classification.category;
        if (cat) set[cat] = true;
      });
    });
    return Object.keys(set).sort();
  }

  function populateCategoryFilter(cats) {
    if (!categoryFilterEl) return;
    var keep = categoryFilterEl.value;
    categoryFilterEl.innerHTML = '<option value="">All categories</option>' +
      cats.map(function (c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');
    if (keep && cats.indexOf(keep) !== -1) categoryFilterEl.value = keep;
  }

  // ----- Library (curated per-sandbox assets) -----

  async function fetchLibrary(sb) {
    var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  // Try to fetch the image bytes in the browser (where the origin CDN
  // already trusts us) so the server doesn't have to re-fetch from a
  // potentially-blocking origin. Returns null if CORS or any other
  // failure — server will fall back to its own fetch / scrape-storage.
  async function fetchImageBytesClient(imgUrl) {
    if (!imgUrl || /^data:/i.test(imgUrl)) return null;
    try {
      var resp = await fetch(imgUrl, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!resp.ok) return null;
      var blob = await resp.blob();
      if (!blob || !blob.size) return null;
      var reader = new FileReader();
      var p = new Promise(function (resolve, reject) {
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = reject;
      });
      reader.readAsDataURL(blob);
      var dataUrl = await p;
      var base64 = dataUrl.split(',')[1] || '';
      return { base64: base64, contentType: blob.type || '' };
    } catch (_e) { return null; }
  }

  async function aiGenerateToLibrary(scrapeId, imageIndex, btn, img, rec) {
    var sb = getSandbox();
    if (!sb || !scrapeId || imageIndex == null) return;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
    setManualMsg('Generating AI replacement — this can take ~10-20s…');
    try {
      var body = { sandbox: sb, scrapeId: scrapeId, imageIndex: imageIndex };
      if (rec) body.brandName = rec.brandName || '';
      if (img) {
        body.classification = img.classification || null;
        body.subject = (img.classification && img.classification.subject) || '';
        body.alt = img.alt || '';
        body.imageUrl = img.src || '';
      }
      var resp = await fetch('/api/image-hosting/library/ai-publish?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        setManualMsg('AI generate failed: ' + (data.error || resp.statusText), 'err');
        return;
      }
      setManualMsg('Generated AI ' + (data.published && data.published.file) + '. Treat as a demo placeholder — upload the real asset when you have it.', 'ok');
      await renderLibrary();
    } catch (e) {
      setManualMsg('AI generate failed: ' + (e.message || e), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'AI generate'; }
    }
  }

  async function publishToLibrary(scrapeId, imageIndex, btn, img) {
    var sb = getSandbox();
    if (!sb || !scrapeId || imageIndex == null) return;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Publishing…'; }
    try {
      var body = { sandbox: sb, scrapeId: scrapeId, imageIndex: imageIndex };
      // First try to capture bytes from the browser (works if CDN allows
      // CORS). If not, the server will try its own UA fetch, falling
      // back to the scrape-bucket storagePath.
      if (img && img.src) {
        var bytes = await fetchImageBytesClient(img.src);
        if (bytes && bytes.base64) {
          body.imageBase64 = bytes.base64;
          body.imageContentType = bytes.contentType;
        }
        body.imageUrl = img.src;
        body.classification = img.classification || null;
        body.srcName = (img.classification && img.classification.subject) || img.alt || '';
      }
      var r = await fetch('/api/image-hosting/library/publish?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setStatus('Publish failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      setStatus('Published ' + (data.published && data.published.file) + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Publish failed: ' + (e.message || e), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Publish'; }
    }
  }

  function updateBulkBar() {
    var bar = document.getElementById('imageHostingBulkBar');
    var countEl = document.getElementById('imageHostingBulkCount');
    var n = selectionCount();
    if (!bar) return;
    bar.hidden = n === 0;
    if (countEl) countEl.textContent = n + ' selected';
  }

  function selectAllVisible() {
    var filtered = filterLibraryItems(lastLibraryItems);
    filtered.forEach(function (it) { selectedRelPaths[it.relPath] = true; });
    renderLibraryItems();
    updateBulkBar();
  }

  function clearSelection() {
    selectedRelPaths = Object.create(null);
    renderLibraryItems();
    updateBulkBar();
  }

  async function deleteSelectedItems() {
    var sb = getSandbox();
    var paths = Object.keys(selectedRelPaths);
    if (!sb || !paths.length) return;
    if (!confirm('Delete ' + paths.length + ' file' + (paths.length === 1 ? '' : 's') + ' from the library?\n\n' + paths.join('\n'))) return;
    var bar = document.getElementById('imageHostingBulkBar');
    if (bar) bar.setAttribute('aria-busy', 'true');
    setManualMsg('Deleting ' + paths.length + ' file(s)…');
    var failures = [];
    // Cap concurrency at 6 so we don't overwhelm the function.
    var CONCURRENCY = 6;
    for (var i = 0; i < paths.length; i += CONCURRENCY) {
      var chunk = paths.slice(i, i + CONCURRENCY);
      await Promise.all(chunk.map(async function (rel) {
        try {
          var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb) + '&relPath=' + encodeURIComponent(rel), { method: 'DELETE' });
          if (!r.ok) {
            var d = await r.json().catch(function () { return {}; });
            failures.push({ rel: rel, error: d.error || r.statusText });
          } else {
            delete selectedRelPaths[rel];
          }
        } catch (e) {
          failures.push({ rel: rel, error: String(e.message || e) });
        }
      }));
    }
    if (bar) bar.removeAttribute('aria-busy');
    if (failures.length) {
      setManualMsg('Deleted ' + (paths.length - failures.length) + '/' + paths.length + '. Failures: ' +
        failures.map(function (f) { return f.rel + ' (' + f.error + ')'; }).join(', '), 'err');
    } else {
      setManualMsg('Deleted ' + paths.length + ' file(s).', 'ok');
    }
    updateBulkBar();
    await renderLibrary();
  }

  async function deleteLibraryItem(relPath) {
    var sb = getSandbox();
    if (!sb || !relPath) return;
    if (!confirm('Remove ' + relPath + ' from the library?')) return;
    try {
      var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sb) + '&relPath=' + encodeURIComponent(relPath), { method: 'DELETE' });
      if (!r.ok) {
        var d = await r.json().catch(function () { return {}; });
        setStatus('Delete failed: ' + (d.error || r.statusText), 'err');
        return;
      }
      setStatus('Removed ' + relPath + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Delete failed: ' + (e.message || e), 'err');
    }
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    } catch (_e) {}
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_e) {}
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function absoluteCdnUrl(cdnPath) {
    if (!cdnPath) return '';
    if (/^https?:\/\//i.test(cdnPath)) return cdnPath;
    var origin = window.location.origin || '';
    return origin + cdnPath;
  }

  async function replaceLibraryItem(relPath, file, card) {
    var sb = getSandbox();
    if (!sb || !relPath || !file) return;

    // Optimistic UI: swap the card's thumbnail to a local preview
    // immediately, and mark the card busy. The network round-trip
    // happens in the background. On success we cache-bust just this
    // one thumbnail — no full library re-fetch — so the swap feels
    // instant to the user.
    var previewUrl = '';
    var originalSrc = '';
    var imgEl = card && card.querySelector('.image-hosting-lib-card-img');
    if (imgEl && file) {
      try {
        previewUrl = URL.createObjectURL(file);
        originalSrc = imgEl.src;
        imgEl.src = previewUrl;
      } catch (_e) {}
    }
    if (card) card.classList.add('is-busy');
    setManualMsg('Replacing ' + relPath + '…');

    try {
      var base64 = await fileToBase64(file);
      var resp = await fetch('/api/image-hosting/library/replace?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, relPath: relPath, base64: base64, contentType: file.type || '' }),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        // Revert the thumbnail and surface the error.
        if (imgEl && originalSrc) imgEl.src = originalSrc;
        setManualMsg('Replace failed for ' + relPath + ': ' + (data.error || resp.statusText), 'err');
        return;
      }
      var note = data.published && data.published.converted
        ? ' (converted → ' + relPath.split('.').pop().toUpperCase() + ')'
        : '';
      setManualMsg('Replaced ' + relPath + note + '.', 'ok');

      // Cache-bust just this card's image so the new file loads from
      // the CDN next time. Local preview URL keeps the pixels on
      // screen until the CDN response arrives — zero visible latency.
      if (imgEl) {
        var published = data.published || {};
        var cdn = published.cdnUrl ? absoluteCdnUrl(published.cdnUrl) : imgEl.src.replace(/[?&]_cb=[^&]*$/, '');
        var cacheBust = cdn + (cdn.indexOf('?') === -1 ? '?' : '&') + '_cb=' + Date.now();
        // Preload the new image so the swap is flicker-free.
        var pre = new Image();
        pre.onload = function () {
          imgEl.src = cacheBust;
          if (previewUrl) { try { URL.revokeObjectURL(previewUrl); } catch (_e) {} }
        };
        pre.onerror = function () {
          // Fall back to a full refresh if the CDN isn't ready yet.
          renderLibrary();
        };
        pre.src = cacheBust;
      }
    } catch (e) {
      if (imgEl && originalSrc) imgEl.src = originalSrc;
      setManualMsg('Replace failed: ' + (e.message || e), 'err');
    } finally {
      if (card) card.classList.remove('is-busy');
    }
  }

  function wireCardReplace(card, item) {
    card.setAttribute('title', 'Drop or paste an image here to replace ' + item.relPath);
    // Always preventDefault on dragenter/dragover/drop so the browser
    // doesn't navigate away / open the file / fall through to a parent
    // drop zone. We stopPropagation so the global drop-zone's "add
    // new file" path never runs when the target is a specific card.
    ['dragenter', 'dragover'].forEach(function (evt) {
      card.addEventListener(evt, function (e) {
        var types = (e.dataTransfer && e.dataTransfer.types) || [];
        var hasFiles = Array.prototype.indexOf.call(types, 'Files') !== -1;
        if (!hasFiles) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        card.classList.add('is-drop-target');
      });
    });
    card.addEventListener('dragleave', function (e) {
      e.stopPropagation();
      card.classList.remove('is-drop-target');
    });
    card.addEventListener('drop', function (e) {
      // Always prevent the default so the browser never takes over.
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('is-drop-target');
      var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name)) {
        setManualMsg('Drop an image file to replace ' + item.relPath + '.', 'err');
        return;
      }
      // Fire the replace immediately — no confirm, optimistic UI.
      replaceLibraryItem(item.relPath, file, card);
    });
  }

  function renderLibraryCard(item) {
    var card = document.createElement('div');
    card.className = 'image-hosting-lib-card';
    card.tabIndex = 0;
    card.dataset.relPath = item.relPath;
    if (selectedRelPaths[item.relPath]) card.classList.add('is-selected');
    card.addEventListener('focus', function () { focusedLibraryCard = card; });
    card.addEventListener('mousedown', function () { focusedLibraryCard = card; });
    card.addEventListener('blur', function () {
      if (focusedLibraryCard === card) focusedLibraryCard = null;
    });

    // Bulk-select checkbox overlay.
    var selectLabel = document.createElement('label');
    selectLabel.className = 'image-hosting-lib-card-select';
    selectLabel.title = 'Select for bulk actions';
    selectLabel.addEventListener('click', function (e) { e.stopPropagation(); });
    var selectBox = document.createElement('input');
    selectBox.type = 'checkbox';
    selectBox.checked = !!selectedRelPaths[item.relPath];
    selectBox.addEventListener('change', function () {
      if (selectBox.checked) {
        selectedRelPaths[item.relPath] = true;
        card.classList.add('is-selected');
      } else {
        delete selectedRelPaths[item.relPath];
        card.classList.remove('is-selected');
      }
      updateBulkBar();
    });
    selectLabel.appendChild(selectBox);
    card.appendChild(selectLabel);

    var wrap = document.createElement('div');
    wrap.className = 'image-hosting-lib-card-img-wrap';
    var img = document.createElement('img');
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.alt = item.file;
    img.src = absoluteCdnUrl(item.cdnUrl);
    img.onerror = function () { img.style.opacity = '0.3'; };
    wrap.appendChild(img);
    card.appendChild(wrap);

    var name = document.createElement('div');
    name.className = 'image-hosting-lib-card-name';
    name.textContent = item.relPath;
    name.title = item.relPath;
    card.appendChild(name);

    if (item.aiGenerated) {
      var aiBadge = document.createElement('span');
      aiBadge.className = 'image-hosting-lib-card-ai-badge';
      aiBadge.textContent = 'AI';
      aiBadge.title = item.aiPrompt
        ? 'Generated by ' + (item.aiModel || 'Vertex AI') + '\nPrompt: ' + item.aiPrompt
        : 'AI-generated placeholder — replace with real brand asset when available.';
      card.appendChild(aiBadge);
    }

    var url = document.createElement('div');
    url.className = 'image-hosting-lib-card-url';
    url.textContent = absoluteCdnUrl(item.cdnUrl);
    url.title = absoluteCdnUrl(item.cdnUrl);
    card.appendChild(url);

    var actions = document.createElement('div');
    actions.className = 'image-hosting-lib-card-actions';
    var copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy URL';
    copyBtn.addEventListener('click', function () {
      copyToClipboard(absoluteCdnUrl(item.cdnUrl)).then(function () {
        var prev = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(function () { copyBtn.textContent = prev; }, 1200);
      });
    });
    actions.appendChild(copyBtn);

    var openBtn = document.createElement('a');
    openBtn.href = absoluteCdnUrl(item.cdnUrl);
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.textContent = 'Open';
    openBtn.style.cssText = 'font-size:0.65rem;padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--dash-border);text-decoration:none;color:var(--dash-text);';
    actions.appendChild(openBtn);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', function () { deleteLibraryItem(item.relPath); });
    actions.appendChild(delBtn);

    // Add a "Replace" button as a secondary affordance alongside the
    // drag-drop (discoverability for users who don't think to drag).
    var replaceLabel = document.createElement('label');
    replaceLabel.className = 'image-hosting-file-label';
    replaceLabel.style.fontSize = '0.65rem';
    replaceLabel.style.padding = '0.2rem 0.55rem';
    replaceLabel.textContent = 'Replace';
    var replaceInput = document.createElement('input');
    replaceInput.type = 'file';
    replaceInput.accept = 'image/*';
    replaceInput.hidden = true;
    replaceInput.addEventListener('change', function () {
      if (replaceInput.files && replaceInput.files[0]) {
        replaceLibraryItem(item.relPath, replaceInput.files[0], card);
        replaceInput.value = '';
      }
    });
    replaceLabel.appendChild(replaceInput);
    actions.appendChild(replaceLabel);

    card.appendChild(actions);
    wireCardReplace(card, item);
    return card;
  }

  function setManualMsg(msg, cls) {
    var el = document.getElementById('imageHostingManualMsg');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

  function fileToBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(String(r.result || '').split(',')[1] || ''); };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  /**
   * Send one file to the server /upload endpoint. Individual requests
   * (rather than one big batch) keep each payload under Cloud Run's
   * 32 MB body cap and let the status line update per-file.
   */
  function readUploadOptions() {
    var modeEl = document.getElementById('imageHostingDropMode');
    var convEl = document.getElementById('imageHostingDropConvert');
    return {
      keepFilename: modeEl && modeEl.value === 'keep',
      convertToPng: convEl ? !!convEl.checked : true,
    };
  }

  async function uploadOneFile(sb, file) {
    var base64 = await fileToBase64(file);
    var opts = readUploadOptions();
    var resp = await fetch('/api/image-hosting/library/upload?sandbox=' + encodeURIComponent(sb), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandbox: sb,
        files: [{ name: file.name, base64: base64, contentType: file.type || '' }],
        keepFilename: opts.keepFilename,
        convertToPng: opts.convertToPng,
      }),
    });
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    return data;
  }

  async function handleDroppedFiles(files) {
    var sb = getSandbox();
    if (!sb) { setManualMsg('Select a sandbox first.', 'err'); return; }
    var list = Array.from(files || []).filter(function (f) {
      return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|zip)$/i.test(f.name);
    });
    if (!list.length) { setManualMsg('No images or ZIP detected in that drop.', 'err'); return; }

    var drop = document.getElementById('imageHostingDropZone');
    if (drop) drop.classList.add('is-busy');
    var totalOk = 0;
    var totalErr = 0;
    var errors = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      setManualMsg('Uploading ' + f.name + ' (' + (i + 1) + '/' + list.length + ')…');
      try {
        var data = await uploadOneFile(sb, f);
        totalOk += (data.uploaded || []).length;
        (data.errors || []).forEach(function (e) { errors.push(e); });
      } catch (e) {
        totalErr += 1;
        errors.push({ name: f.name, error: String(e.message || e) });
      }
    }
    if (drop) drop.classList.remove('is-busy');

    if (errors.length) {
      setManualMsg(
        'Added ' + totalOk + ' file(s). ' + errors.length + ' failed: ' +
        errors.map(function (e) { return e.name + ' (' + e.error + ')'; }).join(', '),
        totalOk ? 'warn' : 'err'
      );
    } else {
      setManualMsg('Added ' + totalOk + ' file(s) to the library.', 'ok');
    }
    await renderLibrary();
  }

  function sortLibraryItems(items) {
    var copy = items.slice();
    switch (sortBy) {
      case 'name-desc': copy.sort(function (a, b) { return b.relPath.localeCompare(a.relPath); }); break;
      case 'date-desc': copy.sort(function (a, b) { return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0); }); break;
      case 'date-asc':  copy.sort(function (a, b) { return (Date.parse(a.updatedAt || 0) || 0) - (Date.parse(b.updatedAt || 0) || 0); }); break;
      case 'size-desc': copy.sort(function (a, b) { return (b.size || 0) - (a.size || 0); }); break;
      case 'size-asc':  copy.sort(function (a, b) { return (a.size || 0) - (b.size || 0); }); break;
      case 'folder':    copy.sort(function (a, b) { var fa = a.folder || '', fb = b.folder || ''; return fa.localeCompare(fb) || a.relPath.localeCompare(b.relPath); }); break;
      case 'name':
      default:          copy.sort(function (a, b) { return a.relPath.localeCompare(b.relPath); }); break;
    }
    return copy;
  }

  function applyViewClass() {
    if (!libraryGridEl) return;
    libraryGridEl.className = 'image-hosting-library-grid image-hosting-library-grid--' + viewMode;
  }

  function filterLibraryItems(items) {
    var q = (libraryFilterText || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(function (it) {
      var hay = ((it.relPath || '') + ' ' + (it.folder || '') + ' ' + (it.file || '')).toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }

  function updateFilterCount(matched, total) {
    var el = document.getElementById('imageHostingFilterCount');
    if (!el) return;
    if (!(libraryFilterText || '').trim()) { el.textContent = ''; return; }
    el.textContent = matched + ' / ' + total;
  }

  function renderLibraryItems() {
    if (!libraryGridEl) return;
    libraryGridEl.innerHTML = '';
    applyViewClass();
    var filtered = filterLibraryItems(lastLibraryItems);
    updateFilterCount(filtered.length, lastLibraryItems.length);
    sortLibraryItems(filtered).forEach(function (it) {
      libraryGridEl.appendChild(renderLibraryCard(it));
    });
    // Show a dedicated empty state when a filter is active but nothing matches.
    if (!filtered.length && (libraryFilterText || '').trim() && lastLibraryItems.length) {
      var empty = document.createElement('p');
      empty.className = 'image-hosting-empty';
      empty.textContent = 'No library items match "' + libraryFilterText + '".';
      libraryGridEl.appendChild(empty);
    }
  }

  async function renderLibrary() {
    if (!libraryGridEl) return;
    libraryGridEl.innerHTML = '';
    applyViewClass();
    var sb = getSandbox();
    if (!sb) {
      if (libraryEmptyEl) libraryEmptyEl.hidden = false;
      if (libraryCountEl) libraryCountEl.textContent = '0';
      lastLibraryItems = [];
      return;
    }
    var items;
    try { items = await fetchLibrary(sb); }
    catch (e) {
      if (libraryEmptyEl) { libraryEmptyEl.hidden = false; libraryEmptyEl.textContent = 'Library load failed: ' + (e.message || e); }
      return;
    }
    lastLibraryItems = items || [];
    // Drop any selected paths that no longer exist in the latest fetch
    // (e.g. a bulk-delete just ran or another user/tab removed them).
    var liveSet = Object.create(null);
    lastLibraryItems.forEach(function (it) { liveSet[it.relPath] = true; });
    Object.keys(selectedRelPaths).forEach(function (k) {
      if (!liveSet[k]) delete selectedRelPaths[k];
    });
    updateBulkBar();
    if (!lastLibraryItems.length) {
      if (libraryEmptyEl) { libraryEmptyEl.hidden = false; libraryEmptyEl.textContent = 'Library empty. Drop a ZIP or images above — or publish a classified image from a scrape below.'; }
      if (libraryCountEl) libraryCountEl.textContent = '0';
      return;
    }
    if (libraryEmptyEl) libraryEmptyEl.hidden = true;
    if (libraryCountEl) libraryCountEl.textContent = String(lastLibraryItems.length);
    renderLibraryItems();
  }

  async function classifyScrape(scrapeId, btn) {
    var sb = getSandbox();
    if (!sb || !scrapeId || classifying[scrapeId]) return;
    classifying[scrapeId] = true;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying…'; }
    setStatus('Classifying images for ' + scrapeId + '…');
    try {
      var r = await fetch('/api/brand-scraper/scrapes/classify?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scrapeId: scrapeId }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setStatus('Classify failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      setStatus('Classified ' + (data.classified || 0) + ' images. Refreshing…', 'ok');
      await refresh();
    } catch (e) {
      setStatus('Classify failed: ' + (e.message || e), 'err');
    } finally {
      classifying[scrapeId] = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  function renderBrand(rec) {
    var brand = document.createElement('section');
    brand.className = 'image-hosting-brand';

    var header = document.createElement('header');
    header.className = 'image-hosting-brand-header';
    var title = document.createElement('h3');
    title.className = 'image-hosting-brand-title';
    title.textContent = rec.brandName || rec.url || rec.scrapeId;
    header.appendChild(title);

    var meta = document.createElement('div');
    meta.className = 'image-hosting-brand-meta';
    var metaBits = [];
    if (rec.url) metaBits.push('<a href="' + encodeURI(rec.url) + '" target="_blank" rel="noopener">' + rec.url + '</a>');
    if (rec.industry) metaBits.push(rec.industry);
    if (rec.pagesScraped != null) metaBits.push(rec.pagesScraped + ' pages');
    if (rec.updatedAt) {
      var dt = new Date(rec.updatedAt);
      if (!isNaN(dt.getTime())) metaBits.push('updated ' + dt.toLocaleString());
    }
    meta.innerHTML = metaBits.join(' · ');
    header.appendChild(meta);

    brand.appendChild(header);

    // Keep the original index in imagesV2 alongside each image so the
    // Publish endpoint can fetch the right storagePath server-side.
    var indexedImgs = (rec.images || []).map(function (img, idx) {
      return { img: img, index: idx };
    });
    var filteredImgs = indexedImgs.filter(function (entry) {
      var img = entry.img;
      if (!imageUrl(img)) return false;
      if (!currentFilter) return true;
      var cat = img.classification && img.classification.category;
      return cat === currentFilter;
    });

    if (!filteredImgs.length) {
      var empty = document.createElement('div');
      empty.className = 'image-hosting-empty';
      if (currentFilter) {
        empty.textContent = 'No images in this brand match the current category filter.';
      } else {
        var msg = document.createElement('p');
        msg.style.margin = '0 0 0.6rem';
        msg.textContent = rec.rawImageCount
          ? rec.rawImageCount + ' images were found during crawl but haven’t been classified + uploaded to Cloud Storage yet.'
          : 'No images captured during crawl.';
        empty.appendChild(msg);
        if (rec.rawImageCount) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'primary';
          btn.textContent = 'Classify images';
          btn.addEventListener('click', function () { classifyScrape(rec.scrapeId, btn); });
          empty.appendChild(btn);
        }
      }
      brand.appendChild(empty);
      return brand;
    }

    var grid = document.createElement('div');
    grid.className = 'image-hosting-grid';
    filteredImgs.forEach(function (entry) {
      var img = entry.img;
      var originalIndex = entry.index;
      var url = imageUrl(img);
      var card = document.createElement('div');
      card.className = 'image-hosting-card';
      card.tabIndex = 0;
      var wrap = document.createElement('div');
      wrap.className = 'image-hosting-card-img-wrap';
      var thumb = document.createElement('img');
      thumb.className = 'image-hosting-card-img';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      thumb.alt = img.alt || '';
      thumb.src = url;
      thumb.onerror = function () {
        thumb.style.opacity = '0.3';
        thumb.alt = 'failed to load';
      };
      wrap.appendChild(thumb);
      card.appendChild(wrap);

      var cat = img.classification && img.classification.category;
      if (cat) {
        var catEl = document.createElement('div');
        catEl.className = 'image-hosting-card-category';
        catEl.textContent = cat;
        card.appendChild(catEl);
      }

      var label = document.createElement('div');
      label.className = 'image-hosting-card-label';
      label.textContent = (img.classification && img.classification.subject) || img.alt || img.storagePath || '';
      label.title = label.textContent;
      card.appendChild(label);

      if (img.publicUrl) {
        var urlLink = document.createElement('a');
        urlLink.className = 'image-hosting-card-url';
        urlLink.href = img.publicUrl;
        urlLink.target = '_blank';
        urlLink.rel = 'noopener';
        urlLink.textContent = 'GCS URL';
        urlLink.addEventListener('click', function (e) { e.stopPropagation(); });
        card.appendChild(urlLink);
      }

      var pubBtn = document.createElement('button');
      pubBtn.type = 'button';
      pubBtn.className = 'image-hosting-card-publish';
      pubBtn.textContent = 'Publish to library';
      pubBtn.title = 'Promote this image to the curated library with a standard name.';
      pubBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        publishToLibrary(rec.scrapeId, originalIndex, pubBtn, img);
      });
      card.appendChild(pubBtn);

      // Secondary AI fallback — synthesises a brand-plausible image via
      // Gemini 2.5 Flash Image for sites whose CDN blocks direct fetch.
      var aiBtn = document.createElement('button');
      aiBtn.type = 'button';
      aiBtn.className = 'image-hosting-card-ai';
      aiBtn.textContent = 'AI generate';
      aiBtn.title = 'Generate a brand-plausible substitute image via Vertex AI (useful when the customer CDN blocks our fetch).';
      aiBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        aiGenerateToLibrary(rec.scrapeId, originalIndex, aiBtn, img, rec);
      });
      card.appendChild(aiBtn);

      card.addEventListener('click', function () { openLightbox(url, img); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(url, img); }
      });
      grid.appendChild(card);
    });
    brand.appendChild(grid);
    return brand;
  }

  function openLightbox(url, img) {
    if (!lightbox || !lightboxImg) { window.open(url, '_blank'); return; }
    lightboxImg.src = url;
    lightboxImg.alt = img.alt || '';
    var caption = [];
    if (img.classification && img.classification.category) caption.push(img.classification.category);
    if (img.classification && img.classification.subject) caption.push(img.classification.subject);
    if (img.publicUrl) caption.push(img.publicUrl);
    else if (img.src) caption.push(img.src);
    lightboxCaption.textContent = caption.join(' · ');
    try { lightbox.showModal(); } catch (_e) { lightbox.setAttribute('open', ''); }
  }

  function closeLightbox() {
    if (!lightbox) return;
    try { lightbox.close(); } catch (_e) { lightbox.removeAttribute('open'); }
    if (lightboxImg) lightboxImg.src = '';
  }

  async function refresh() {
    if (!listEl) return;
    listEl.innerHTML = '';
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox to see hosted images.', 'warn'); return; }
    setStatus('Loading scrapes…');
    var summaries;
    try { summaries = await fetchScrapes(sb); }
    catch (e) { setStatus('Error: ' + (e.message || e), 'err'); return; }
    if (!summaries.length) {
      setStatus('No scrapes yet in sandbox "' + sb + '". Run a scrape in Brand scraper first.', '');
      return;
    }
    setStatus('Loading images for ' + summaries.length + ' scrape(s)…');
    // Pull full records in parallel so we get imagesV2 + raw image counts.
    var records = await Promise.all(summaries.map(function (s) { return fetchScrape(sb, s.scrapeId); }));
    var brands = [];
    records.forEach(function (rec, i) {
      if (!rec) return;
      var assets = rec.crawlSummary && rec.crawlSummary.assets;
      var classified = (assets && Array.isArray(assets.imagesV2)) ? assets.imagesV2 : [];
      var rawCount = (assets && Array.isArray(assets.images)) ? assets.images.length : 0;
      brands.push({
        scrapeId: rec.scrapeId,
        brandName: rec.brandName || (summaries[i] && summaries[i].brandName),
        url: rec.url || (summaries[i] && summaries[i].url),
        industry: rec.industry || (summaries[i] && summaries[i].industry),
        pagesScraped: (rec.crawlSummary && rec.crawlSummary.pagesScraped) || null,
        updatedAt: rec.updatedAt || (summaries[i] && summaries[i].updatedAt),
        rawImageCount: rawCount,
        images: classified,
      });
    });
    lastRecords = brands;
    populateCategoryFilter(collectCategories(brands));
    render();
    // Library is independent of scrape records; always refresh in parallel.
    renderLibrary().catch(function () { /* surfaced inline */ });
  }

  function render() {
    if (!listEl) return;
    listEl.innerHTML = '';
    if (!lastRecords.length) {
      setStatus('No scrapes in this sandbox yet. Run one in Brand scraper first.', '');
      return;
    }
    var classified = 0;
    var hostedCount = 0;
    lastRecords.forEach(function (rec) {
      listEl.appendChild(renderBrand(rec));
      var hosted = (rec.images || []).filter(function (i) { return imageUrl(i); });
      if (hosted.length) classified += 1;
      hostedCount += hosted.length;
    });
    setStatus(lastRecords.length + ' scrape(s), ' + classified + ' classified, ' + hostedCount + ' hosted image(s).', 'ok');
  }

  async function downloadLibrary() {
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'err'); return; }
    var customer = window.prompt('Download the library as logo_<name>.zip\n\nEnter a customer name (letters, numbers, hyphens):', '');
    if (customer == null) return;
    customer = String(customer).trim();
    if (!customer) customer = sb;
    var url = '/api/image-hosting/library/download?sandbox=' + encodeURIComponent(sb) + '&customer=' + encodeURIComponent(customer);
    setStatus('Preparing ZIP…');
    try {
      var resp = await fetch(url);
      if (!resp.ok) {
        var e = await resp.json().catch(function () { return {}; });
        setStatus('Download failed: ' + (e.error || resp.statusText), 'err');
        return;
      }
      var blob = await resp.blob();
      var safe = customer.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'library';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'logo_' + safe + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      setStatus('Downloaded logo_' + safe + '.zip (' + Math.round(blob.size / 1024) + ' KB).', 'ok');
    } catch (e) {
      setStatus('Download failed: ' + (e.message || e), 'err');
    }
  }

  async function restoreLibraryFromFile(file) {
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'err'); return; }
    if (!file) return;
    if (!confirm('Replace this sandbox\'s library with the contents of "' + file.name + '"?\n\nAll current library files will be removed first.')) return;
    setStatus('Restoring from ' + file.name + '…');
    try {
      var base64 = await fileToBase64(file);
      var resp = await fetch('/api/image-hosting/library/restore?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, zipBase64: base64, replace: true }),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok) {
        setStatus('Restore failed: ' + (data.error || resp.statusText), 'err');
        return;
      }
      setStatus('Restored ' + (data.restored || 0) + ' file(s) from ' + file.name + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Restore failed: ' + (e.message || e), 'err');
    }
  }

  // View toggle + sort controls.
  function wireViewToolbar() {
    var btns = document.querySelectorAll('.image-hosting-view-toggle button[data-view]');
    function markActive() {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.dataset.view === viewMode ? 'true' : 'false'); });
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        viewMode = b.dataset.view;
        try { localStorage.setItem(LS_VIEW, viewMode); } catch (_e) {}
        markActive();
        renderLibraryItems();
      });
    });
    markActive();
    var sortSel = document.getElementById('imageHostingLibrarySort');
    if (sortSel) {
      sortSel.value = sortBy;
      sortSel.addEventListener('change', function () {
        sortBy = sortSel.value || 'name';
        try { localStorage.setItem(LS_SORT, sortBy); } catch (_e) {}
        renderLibraryItems();
      });
    }
    // Type-to-filter — re-render on every keystroke. For the library
    // sizes we're dealing with (dozens to low hundreds of items)
    // the render is cheap enough that debouncing adds no value.
    var filterInput = document.getElementById('imageHostingFilterInput');
    if (filterInput) {
      filterInput.addEventListener('input', function () {
        libraryFilterText = filterInput.value || '';
        renderLibraryItems();
      });
      // Esc clears the filter, matches the native search-input UX.
      filterInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && libraryFilterText) {
          e.preventDefault();
          filterInput.value = '';
          libraryFilterText = '';
          renderLibraryItems();
        }
      });
    }
  }
  wireViewToolbar();

  // Paste handler: Cmd/Ctrl+V anywhere on the page with an image on the
  // clipboard adds it to the library. If a library card currently has
  // focus (last clicked/tabbed) the paste replaces that card instead.
  function onPaste(e) {
    if (!e.clipboardData) return;
    // Don't hijack paste inside text inputs/selects/textareas.
    var tag = (e.target && e.target.tagName) || '';
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) && e.target.type !== 'file') return;
    var items = e.clipboardData.items || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || typeof it.type !== 'string' || !/^image\//.test(it.type)) continue;
      var blob = it.getAsFile();
      if (!blob) continue;
      e.preventDefault();
      // Force a plausible filename so auto-naming heuristics work
      // (clipboard blobs often come in as "image.png" with no context).
      var ext = (it.type.split('/')[1] || 'png').toLowerCase();
      var fileName = (blob.name && blob.name !== 'image.png') ? blob.name : ('paste-' + Date.now() + '.' + ext);
      var file = new File([blob], fileName, { type: blob.type });
      if (focusedLibraryCard && focusedLibraryCard.dataset && focusedLibraryCard.dataset.relPath) {
        replaceLibraryItem(focusedLibraryCard.dataset.relPath, file, focusedLibraryCard);
      } else {
        handleDroppedFiles([file]);
      }
      return;
    }
  }
  document.addEventListener('paste', onPaste);

  if (refreshBtn) refreshBtn.addEventListener('click', refresh);

  // Bulk-selection action bar.
  var bulkSelectAll = document.getElementById('imageHostingBulkSelectAll');
  if (bulkSelectAll) bulkSelectAll.addEventListener('click', selectAllVisible);
  var bulkClear = document.getElementById('imageHostingBulkClear');
  if (bulkClear) bulkClear.addEventListener('click', clearSelection);
  var bulkDelete = document.getElementById('imageHostingBulkDelete');
  if (bulkDelete) bulkDelete.addEventListener('click', deleteSelectedItems);

  // Drop zone: click-to-browse + native drag/drop for files and ZIPs.
  var dropZone = document.getElementById('imageHostingDropZone');
  var dropInput = document.getElementById('imageHostingDropInput');
  if (dropZone && dropInput) {
    dropZone.addEventListener('click', function () { dropInput.click(); });
    dropZone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dropInput.click(); }
    });
    dropInput.addEventListener('change', function () {
      if (dropInput.files && dropInput.files.length) {
        handleDroppedFiles(dropInput.files).then(function () { dropInput.value = ''; });
      }
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropZone.addEventListener(evt, function (e) {
        e.preventDefault(); e.stopPropagation();
        dropZone.classList.remove('is-dragover');
      });
    });
    dropZone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleDroppedFiles(e.dataTransfer.files);
      }
    });
  }

  var downloadBtn = document.getElementById('imageHostingDownloadBtn');
  if (downloadBtn) downloadBtn.addEventListener('click', downloadLibrary);
  var restoreInput = document.getElementById('imageHostingRestoreInput');
  if (restoreInput) restoreInput.addEventListener('change', function () {
    if (restoreInput.files && restoreInput.files[0]) {
      restoreLibraryFromFile(restoreInput.files[0]);
      restoreInput.value = ''; // allow same file to be chosen again
    }
  });
  if (categoryFilterEl) {
    categoryFilterEl.addEventListener('change', function () {
      currentFilter = categoryFilterEl.value || '';
      render();
    });
  }
  if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
  if (lightbox) {
    lightbox.addEventListener('click', function (e) { if (e.target === lightbox) closeLightbox(); });
  }
  window.addEventListener('aep-lab-sandbox-synced', refresh);
  window.addEventListener('aep-lab-sandbox-keys-applied', refresh);

  // Populate the sandbox <select>, wire change handler, then pull scrapes.
  (async function initSandboxAndLoad() {
    var sel = document.getElementById('sandboxSelect');
    try {
      if (window.AepGlobalSandbox && window.AepGlobalSandbox.loadSandboxesIntoSelect) {
        await window.AepGlobalSandbox.loadSandboxesIntoSelect(sel);
      }
    } catch (e) {
      setStatus('Failed to load sandboxes: ' + (e.message || e), 'err');
    }
    if (sel && !sel.dataset.aepImageHostingWired) {
      sel.dataset.aepImageHostingWired = '1';
      sel.addEventListener('change', refresh);
    }
    if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.whenReady) {
      AepLabSandboxSync.whenReady.then(refresh).catch(function () { refresh(); });
    } else {
      refresh();
    }
  })();
})();
