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

  /**
   * Classify/download images for a scrape runs on `brandScraperClassify` (up to
   * several minutes). Firebase Hosting rewrites to `/api/*` are proxied with a
   * short timeout, so we call the Cloud Function URL directly — same pattern
   * as `brand-scraper.js` (CLASSIFY_URL).
   */
  var BRAND_SCRAPER_FUNCTIONS_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  var BRAND_SCRAPER_CLASSIFY_URL = BRAND_SCRAPER_FUNCTIONS_BASE + '/brandScraperClassify';

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
  /** Last sandbox we loaded the library for — reset folder scope when it changes. */
  var lastLibrarySandbox = '';
  /** null = show all folders; '' = root only; 'a/b' = assets in that folder path. */
  var libraryFolderScope = null;
  var LS_FOLDER_PANEL = 'imageHostingFolderPanelOpen';
  var folderPanelOpen = (function () {
    try { return localStorage.getItem(LS_FOLDER_PANEL) === '1'; } catch (_e) { return false; }
  })();
  // Bulk-select state for multi-delete. Tracks item relPaths.
  var selectedRelPaths = Object.create(null);
  /** Hidden GCS object that materialises an otherwise-empty folder prefix. */
  var LIB_FOLDER_MARKER = '.aep-library-folder';
  var DT_LIBRARY_PATH = 'text/x-image-hosting-relpath';
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
    var filtered = filterLibraryItems(applyFolderScope(assetLibraryItems()));
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

  function libraryDirAndFilename(relPath) {
    var s = String(relPath || '');
    var i = s.lastIndexOf('/');
    if (i === -1) return { dir: '', file: s };
    return { dir: s.slice(0, i), file: s.slice(i + 1) };
  }

  function assetLibraryItems() {
    return lastLibraryItems.filter(function (it) { return !it.isFolderMarker; });
  }

  function folderPathFromMarkerRel(relPath) {
    var suf = '/' + LIB_FOLDER_MARKER;
    if (relPath && relPath.endsWith(suf)) return relPath.slice(0, -suf.length);
    return null;
  }

  function collectFolderPaths(items) {
    var set = Object.create(null);
    set[''] = true;
    (items || []).forEach(function (it) {
      if (it.isFolderMarker) {
        var fp = folderPathFromMarkerRel(it.relPath);
        if (fp != null) set[fp] = true;
        return;
      }
      var rp = String(it.relPath || '');
      var i = rp.lastIndexOf('/');
      while (i > 0) {
        set[rp.slice(0, i)] = true;
        i = rp.slice(0, i).lastIndexOf('/');
      }
    });
    return set;
  }

  function sortedFolderPaths(set) {
    var keys = Object.keys(set);
    keys.sort(function (a, b) { return a.localeCompare(b, undefined, { sensitivity: 'base' }); });
    var zi = keys.indexOf('');
    if (zi > 0) {
      keys.splice(zi, 1);
      keys.unshift('');
    }
    return keys;
  }

  function uniqueTargetRelPathForMove(desiredRelPath, movingRelPath) {
    var names = Object.create(null);
    lastLibraryItems.forEach(function (it) { names[it.relPath] = true; });
    if (!names[desiredRelPath] || desiredRelPath === movingRelPath) return desiredRelPath;
    var parts = libraryDirAndFilename(desiredRelPath);
    var file = parts.file;
    var m = /^(.+)\.([a-z0-9]{1,12})$/i.exec(file);
    var stem = m ? m[1] : file;
    var ext = m ? '.' + m[2] : '';
    for (var n = 2; n < 200; n++) {
      var candidate = (parts.dir ? parts.dir + '/' : '') + stem + '-' + n + ext;
      if (!names[candidate]) return candidate;
    }
    return (parts.dir ? parts.dir + '/' : '') + stem + '-' + Date.now().toString(36) + ext;
  }

  async function moveLibraryItemToFolder(relPath, targetFolder) {
    var sb = getSandbox();
    if (!sb || !relPath) return;
    var srcParts = libraryDirAndFilename(relPath);
    if (srcParts.file === LIB_FOLDER_MARKER) return;
    var destFolder = String(targetFolder == null ? '' : targetFolder).replace(/^\/+|\/+$/g, '');
    if (destFolder.indexOf('..') !== -1) {
      setManualMsg('Invalid folder.', 'err');
      return;
    }
    var currentDir = srcParts.dir || '';
    if (currentDir === destFolder) {
      setManualMsg('Already in that folder.', 'ok');
      return;
    }
    var baseName = srcParts.file;
    var desired = destFolder ? destFolder + '/' + baseName : baseName;
    var newRelPath = uniqueTargetRelPathForMove(desired, relPath);
    if (newRelPath === relPath) return;
    try {
      var r = await fetch('/api/image-hosting/library/rename?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, relPath: relPath, newRelPath: newRelPath }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setManualMsg('Move failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      var wasSel = !!selectedRelPaths[relPath];
      delete selectedRelPaths[relPath];
      var finalPath = data.newRelPath || newRelPath;
      if (wasSel) selectedRelPaths[finalPath] = true;
      var into = libraryDirAndFilename(finalPath).dir;
      setManualMsg(into ? ('Moved into ' + into + '/') : 'Moved to library root.', 'ok');
      await renderLibrary();
    } catch (e) {
      setManualMsg('Move failed: ' + (e.message || e), 'err');
    }
  }

  async function createEmptyLibraryFolder() {
    var sb = getSandbox();
    if (!sb) { setManualMsg('Select a sandbox first.', 'err'); return; }
    var entered = window.prompt('Folder path (use / for nested), e.g. campaign-2025 or logos/primary:', '');
    if (entered === null) return;
    entered = String(entered).trim().replace(/^\/+|\/+$/g, '');
    if (!entered || entered.indexOf('..') !== -1) {
      setManualMsg('Enter a non-empty path without "..".', 'err');
      return;
    }
    try {
      var r = await fetch('/api/image-hosting/library/folder?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, folder: entered }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setManualMsg('Create folder failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      setManualMsg('Created folder "' + (data.folder || entered) + '".', 'ok');
      await renderLibrary();
    } catch (e) {
      setManualMsg('Create folder failed: ' + (e.message || e), 'err');
    }
  }

  function applyFolderScope(items) {
    if (libraryFolderScope === null || libraryFolderScope === undefined) return items;
    return items.filter(function (it) {
      return (it.folder || '') === libraryFolderScope;
    });
  }

  function setLibraryFolderScope(fp) {
    libraryFolderScope = fp;
    updateFolderScopeBar();
    renderLibraryItems();
  }

  function updateFolderScopeBar() {
    var bar = document.getElementById('imageHostingFolderScopeBar');
    var label = document.getElementById('imageHostingFolderScopeLabel');
    if (!bar || !label) return;
    if (libraryFolderScope === null || libraryFolderScope === undefined) {
      bar.hidden = true;
      label.textContent = '';
      return;
    }
    bar.hidden = false;
    var n = applyFolderScope(assetLibraryItems()).length;
    var name = libraryFolderScope === '' ? 'Library root (top level)' : libraryFolderScope;
    label.textContent = 'Viewing folder: ' + name + ' · ' + n + (n === 1 ? ' item' : ' items');
  }

  function syncFolderPanelLayout() {
    var layout = document.getElementById('imageHostingLibraryLayout');
    var btn = document.getElementById('imageHostingFolderPanelToggle');
    if (layout) layout.classList.toggle('is-folder-panel-open', folderPanelOpen);
    if (btn) {
      btn.setAttribute('aria-expanded', folderPanelOpen ? 'true' : 'false');
      btn.textContent = folderPanelOpen ? 'Hide folder panel' : 'Organize folders';
    }
  }

  function setFolderPanelOpen(open) {
    folderPanelOpen = !!open;
    try { localStorage.setItem(LS_FOLDER_PANEL, folderPanelOpen ? '1' : '0'); } catch (_e) {}
    syncFolderPanelLayout();
  }

  function folderMayDeleteMarkerOnly(folderPath) {
    var markerRel = folderPath + '/' + LIB_FOLDER_MARKER;
    var hasMarker = false;
    var hasAssetInTree = false;
    lastLibraryItems.forEach(function (it) {
      if (it.isFolderMarker) {
        if (it.relPath === markerRel) hasMarker = true;
        return;
      }
      var rp = it.relPath || '';
      if (rp === markerRel) return;
      if (rp === folderPath || rp.indexOf(folderPath + '/') === 0) hasAssetInTree = true;
    });
    return hasMarker && !hasAssetInTree;
  }

  function wireFolderRowDrop(el, folderPath) {
    ['dragenter', 'dragover'].forEach(function (evt) {
      el.addEventListener(evt, function (e) {
        var types = (e.dataTransfer && e.dataTransfer.types) || [];
        if (Array.prototype.indexOf.call(types, DT_LIBRARY_PATH) === -1) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        el.classList.add('is-drop-hover');
      });
    });
    el.addEventListener('dragleave', function () {
      el.classList.remove('is-drop-hover');
    });
    el.addEventListener('drop', function (e) {
      el.classList.remove('is-drop-hover');
      var types = (e.dataTransfer && e.dataTransfer.types) || [];
      if (Array.prototype.indexOf.call(types, DT_LIBRARY_PATH) === -1) return;
      e.preventDefault();
      e.stopPropagation();
      var from = e.dataTransfer.getData(DT_LIBRARY_PATH) || e.dataTransfer.getData('text/plain');
      if (!from) return;
      moveLibraryItemToFolder(from, folderPath);
    });
  }

  function renderFolderPanel() {
    var host = document.getElementById('imageHostingFolderList');
    if (!host) return;
    var sb = getSandbox();
    if (!sb) {
      host.innerHTML = '';
      return;
    }
    var paths = sortedFolderPaths(collectFolderPaths(lastLibraryItems));
    host.innerHTML = '';
    paths.forEach(function (fp) {
      var row = document.createElement('div');
      row.className = 'image-hosting-folder-row';
      row.setAttribute('role', 'listitem');
      if (libraryFolderScope !== null && libraryFolderScope !== undefined && libraryFolderScope === fp) {
        row.classList.add('is-folder-view-active');
      }
      var pad = 8 + (fp ? Math.max(0, fp.split('/').length - 1) * 10 : 0);
      row.style.paddingLeft = pad + 'px';
      var label = document.createElement('button');
      label.type = 'button';
      label.className = 'image-hosting-folder-row-label';
      label.textContent = fp || 'Library root';
      label.title = (fp || '(top level)') + ' — click to show only this folder';
      label.addEventListener('click', function (e) {
        e.stopPropagation();
        setLibraryFolderScope(fp);
      });
      row.appendChild(label);
      if (fp && folderMayDeleteMarkerOnly(fp)) {
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'image-hosting-folder-row-delete';
        delBtn.title = 'Remove empty folder';
        delBtn.setAttribute('aria-label', 'Remove empty folder');
        delBtn.textContent = '×';
        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var mr = fp + '/' + LIB_FOLDER_MARKER;
          if (!confirm('Remove empty folder "' + fp + '"?')) return;
          deleteLibraryItem(mr);
        });
        row.appendChild(delBtn);
      }
      wireFolderRowDrop(row, fp);
      host.appendChild(row);
    });
  }

  function sanitizeLibraryFilename(name) {
    var n = String(name || '').trim();
    if (!n) return null;
    if (n.indexOf('..') !== -1) return null;
    if (/[/\\]/.test(n)) return null;
    n = n.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_');
    if (!n) return null;
    if (n.length > 180) n = n.slice(0, 180);
    return n;
  }

  async function renameLibraryItem(relPath) {
    var sb = getSandbox();
    if (!sb || !relPath) return;
    var parts = libraryDirAndFilename(relPath);
    var msg = parts.dir
      ? 'New file name (keeps folder ' + parts.dir + '/):'
      : 'New file name:';
    var entered = window.prompt(msg, parts.file);
    if (entered === null) return;
    var newFile = sanitizeLibraryFilename(entered);
    if (!newFile) {
      setManualMsg('Invalid name. Use letters, numbers, dots, dashes, underscores — no slashes or "..".', 'err');
      return;
    }
    var newRelPath = parts.dir ? parts.dir + '/' + newFile : newFile;
    if (newRelPath === relPath) {
      setManualMsg('Name unchanged.', 'ok');
      return;
    }
    try {
      var r = await fetch('/api/image-hosting/library/rename?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, relPath: relPath, newRelPath: newRelPath }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        setManualMsg('Rename failed: ' + (data.error || r.statusText), 'err');
        return;
      }
      if (data.noop) {
        setManualMsg('Name unchanged.', 'ok');
        return;
      }
      delete selectedRelPaths[relPath];
      setManualMsg('Renamed to ' + (data.newRelPath || newRelPath) + '.', 'ok');
      await renderLibrary();
    } catch (e) {
      setManualMsg('Rename failed: ' + (e.message || e), 'err');
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

  /** CDN URL for <img> / previews — busts intermediaries when metadata generation changes. */
  function libraryCdnUrlForDisplay(item) {
    var base = absoluteCdnUrl(item && item.cdnUrl);
    if (!base) return base;
    var token =
      item && item.updatedAt
        ? String(item.updatedAt)
        : item && item.size != null && item.relPath != null
          ? String(item.size) + '-' + String(item.relPath)
          : String(Date.now());
    var v = encodeURIComponent(token).slice(0, 240);
    return base + (base.indexOf('?') === -1 ? '?' : '&') + 'v=' + v;
  }

  function libraryCardThumbImg(card) {
    if (!card) return null;
    return card.querySelector('.image-hosting-lib-card-img')
      || card.querySelector('.image-hosting-lib-card-img-wrap img');
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
    var imgEl = libraryCardThumbImg(card);
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

      // Swap to CDN URL with cache-bust. While that loads, the card may
      // still show the local blob from above — revoke only after the
      // remote `load` so the visible pixels never disappear.
      if (imgEl) {
        var published = data.published || {};
        var cdn = published.cdnUrl ? absoluteCdnUrl(published.cdnUrl) : '';
        var revokePreview = function () {
          if (previewUrl) {
            try { URL.revokeObjectURL(previewUrl); } catch (_e1) {}
            previewUrl = '';
          }
        };
        if (!cdn) {
          revokePreview();
          await renderLibrary();
          return;
        }
        var bustBase = published.updatedAt
          ? encodeURIComponent(String(published.updatedAt)).slice(0, 240)
          : String(Date.now());
        var attempt = 0;
        var maxAttempts = 5;
        function cdnTryUrl() {
          return cdn + (cdn.indexOf('?') === -1 ? '?' : '&') + '_cb=' + bustBase + '&_try=' + String(++attempt);
        }
        if (previewUrl) {
          var onRemoteErr = function () {
            imgEl.removeEventListener('load', onRemote);
            imgEl.removeEventListener('error', onRemoteErr);
            if (attempt < maxAttempts) {
              window.setTimeout(function () {
                imgEl.addEventListener('load', onRemote);
                imgEl.addEventListener('error', onRemoteErr);
                imgEl.src = cdnTryUrl();
              }, 350 * attempt);
              return;
            }
            try {
              previewUrl = URL.createObjectURL(file);
              imgEl.src = previewUrl;
            } catch (_e2) {}
            setManualMsg('Saved to library; CDN preview may take a moment for ' + relPath + '.', 'ok');
          };
          var onRemote = function () {
            revokePreview();
            imgEl.removeEventListener('load', onRemote);
            imgEl.removeEventListener('error', onRemoteErr);
          };
          imgEl.addEventListener('load', onRemote);
          imgEl.addEventListener('error', onRemoteErr);
          imgEl.src = cdnTryUrl();
        } else {
          imgEl.src = cdnTryUrl();
        }
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
        if (Array.prototype.indexOf.call(types, DT_LIBRARY_PATH) !== -1) {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
          return;
        }
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
    if (item.isFolderMarker) return null;
    var card = document.createElement('div');
    card.className = 'image-hosting-lib-card';
    card.tabIndex = 0;
    card.dataset.relPath = item.relPath;
    card.draggable = true;
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
    img.className = 'image-hosting-lib-card-img';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.alt = item.file;
    img.src = libraryCdnUrlForDisplay(item);
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
    openBtn.href = libraryCdnUrlForDisplay(item);
    openBtn.target = '_blank';
    openBtn.rel = 'noopener';
    openBtn.textContent = 'Open';
    openBtn.style.cssText = 'font-size:0.65rem;padding:0.2rem 0.55rem;border-radius:999px;border:1px solid var(--dash-border);text-decoration:none;color:var(--dash-text);';
    actions.appendChild(openBtn);

    var renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = 'Rename';
    renameBtn.title = 'Change file name in the same folder (e.g. logo.png → logo_1.png)';
    renameBtn.addEventListener('click', function () { renameLibraryItem(item.relPath); });
    actions.appendChild(renameBtn);

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
    card.addEventListener('dragstart', function (e) {
      if (e.target && e.target.closest && e.target.closest('.image-hosting-lib-card-actions, .image-hosting-lib-card-select, button, a, input, label')) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData(DT_LIBRARY_PATH, item.relPath);
      e.dataTransfer.setData('text/plain', item.relPath);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('is-dragging-source');
    });
    card.addEventListener('dragend', function () {
      card.classList.remove('is-dragging-source');
    });
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

  /**
   * Browsing for files uses the hidden <input accept>. When "keep original
   * filename" is on, allow any type; otherwise only images + ZIP (same as drag).
   */
  function syncDropInputAccept() {
    var dropInput = document.getElementById('imageHostingDropInput');
    if (!dropInput) return;
    var opts = readUploadOptions();
    dropInput.setAttribute('accept', opts.keepFilename ? '*/*' : 'image/*,.zip,application/zip');
  }

  function isAcceptedDropFile(f, keepFilename) {
    if (!f || !f.name) return false;
    if (keepFilename) return true;
    return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|zip)$/i.test(f.name);
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
    var opts = readUploadOptions();
    var list = Array.from(files || []).filter(function (f) {
      return isAcceptedDropFile(f, opts.keepFilename);
    });
    if (!list.length) {
      setManualMsg(opts.keepFilename ? 'No files detected in that drop.' : 'No images or ZIP detected in that drop.', 'err');
      return;
    }

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
    updateFolderScopeBar();
    var baseAll = assetLibraryItems();
    var base = applyFolderScope(baseAll);
    var filtered = filterLibraryItems(base);
    updateFilterCount(filtered.length, base.length);
    sortLibraryItems(filtered).forEach(function (it) {
      var card = renderLibraryCard(it);
      if (card) libraryGridEl.appendChild(card);
    });
    if (!filtered.length && (libraryFilterText || '').trim() && base.length) {
      var emptySearch = document.createElement('p');
      emptySearch.className = 'image-hosting-empty';
      emptySearch.textContent = 'No library items match "' + libraryFilterText + '".';
      libraryGridEl.appendChild(emptySearch);
    } else if (!filtered.length && !base.length && baseAll.length && libraryFolderScope !== null && libraryFolderScope !== undefined) {
      var emptyFolder = document.createElement('p');
      emptyFolder.className = 'image-hosting-empty';
      emptyFolder.textContent = 'No assets in this folder. Use Show all folders to see the full library, or Organize folders to move items here.';
      libraryGridEl.appendChild(emptyFolder);
    }
    renderFolderPanel();
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
      updateFolderScopeBar();
      renderFolderPanel();
      return;
    }
    var items;
    try { items = await fetchLibrary(sb); }
    catch (e) {
      lastLibraryItems = [];
      if (libraryEmptyEl) { libraryEmptyEl.hidden = false; libraryEmptyEl.textContent = 'Library load failed: ' + (e.message || e); }
      updateFolderScopeBar();
      renderFolderPanel();
      return;
    }
    lastLibraryItems = (items || []).map(function (it) {
      it.isFolderMarker = !!it.isFolderMarker || it.file === LIB_FOLDER_MARKER;
      return it;
    });
    // Drop any selected paths that no longer exist in the latest fetch
    // (e.g. a bulk-delete just ran or another user/tab removed them).
    var liveSet = Object.create(null);
    lastLibraryItems.forEach(function (it) { liveSet[it.relPath] = true; });
    Object.keys(selectedRelPaths).forEach(function (k) {
      if (!liveSet[k]) delete selectedRelPaths[k];
    });
    updateBulkBar();
    var assets = assetLibraryItems();
    if (!assets.length) {
      if (libraryEmptyEl) {
        libraryEmptyEl.hidden = false;
        libraryEmptyEl.textContent = lastLibraryItems.length
          ? 'No image files yet — use New folder to add structure, then upload or publish assets.'
          : 'Library empty. Drop a ZIP or images above — or publish a classified image from a scrape below.';
      }
      if (libraryCountEl) libraryCountEl.textContent = '0';
      updateFolderScopeBar();
      renderFolderPanel();
      return;
    }
    if (libraryEmptyEl) libraryEmptyEl.hidden = true;
    if (libraryCountEl) libraryCountEl.textContent = String(assets.length);
    renderLibraryItems();
  }

  async function classifyScrape(scrapeId, btn) {
    var sb = getSandbox();
    if (!sb || !scrapeId || classifying[scrapeId]) return;
    classifying[scrapeId] = true;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying…'; }
    setStatus('Classifying images for ' + scrapeId + '… (this can take 1–3 minutes)', '');
    setManualMsg('Downloading images to GCS and classifying with Gemini vision…');
    try {
      var url = BRAND_SCRAPER_CLASSIFY_URL + '?sandbox=' + encodeURIComponent(sb);
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, scrapeId: scrapeId }),
      });
      var data = await r.json().catch(function () { return {}; });
      if (!r.ok) {
        var errLine = 'Classify failed: ' + (data.error || r.statusText);
        setStatus(errLine, 'err');
        setManualMsg(errLine, 'err');
        return;
      }
      var okLine = 'Classified ' + (data.classified || 0) + '/' + (data.total != null ? data.total : (data.images || []).length) + ' images. Refreshing…';
      setStatus(okLine, 'ok');
      setManualMsg(okLine, 'ok');
      await refresh();
    } catch (e) {
      var net = 'Classify failed: ' + (e.message || e);
      setStatus(net, 'err');
      setManualMsg(net, 'err');
    } finally {
      classifying[scrapeId] = false;
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  }

  function truncateScrapeAbout(text, maxLen) {
    var s = String(text || '').trim().replace(/\s+/g, ' ');
    if (!s) return '';
    if (s.length <= maxLen) return s;
    return s.slice(0, Math.max(1, maxLen - 1)).trim() + '…';
  }

  function renderBrand(rec) {
    var article = document.createElement('article');
    article.className = 'brand-scraper-history-card image-hosting-scrape-card';

    var main = document.createElement('div');
    main.className = 'brand-scraper-history-card-main';

    var h4 = document.createElement('h4');
    h4.textContent = rec.brandName || rec.url || rec.scrapeId;
    main.appendChild(h4);

    if (rec.industry) {
      var ind = document.createElement('p');
      ind.className = 'brand-scraper-history-industry';
      ind.textContent = rec.industry;
      main.appendChild(ind);
    }

    if (rec.analysisAbout) {
      var ab = document.createElement('p');
      ab.className = 'brand-scraper-result-muted image-hosting-scrape-about';
      ab.textContent = truncateScrapeAbout(rec.analysisAbout, 240);
      ab.title = rec.analysisAbout;
      main.appendChild(ab);
    }

    if (rec.url) {
      var urlP = document.createElement('p');
      urlP.className = 'brand-scraper-result-muted';
      var a = document.createElement('a');
      a.href = rec.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = rec.url;
      urlP.appendChild(a);
      main.appendChild(urlP);
    }

    var indexedImgs = (rec.images || []).map(function (img, idx) {
      return { img: img, index: idx };
    });
    var withUrl = indexedImgs.filter(function (entry) { return imageUrl(entry.img); });
    var filteredImgs = withUrl.filter(function (entry) {
      if (!currentFilter) return true;
      var cat = entry.img.classification && entry.img.classification.category;
      return cat === currentFilter;
    });
    var hostedCount = withUrl.length;
    var classifiedTotal = (rec.images || []).length;

    var stats = document.createElement('p');
    stats.className = 'brand-scraper-result-muted';
    var statParts = [];
    statParts.push(hostedCount + (hostedCount === 1 ? ' image' : ' images') + ' ready to publish');
    if (classifiedTotal && classifiedTotal !== hostedCount) {
      statParts[statParts.length - 1] += ' (' + classifiedTotal + ' classified)';
    }
    if (rec.rawImageCount) statParts.push(rec.rawImageCount + ' discovered in crawl');
    if (rec.pagesScraped != null) statParts.push(rec.pagesScraped + ' pages scraped');
    if (rec.updatedAt) {
      var dt = new Date(rec.updatedAt);
      if (!isNaN(dt.getTime())) statParts.push('updated ' + dt.toLocaleDateString());
    }
    stats.textContent = statParts.join(' · ');
    main.appendChild(stats);

    article.appendChild(main);

    var details = document.createElement('details');
    details.className = 'image-hosting-scrape-images-details';

    var summary = document.createElement('summary');
    var sumLabel = document.createElement('span');
    sumLabel.textContent = 'Classified images';
    summary.title = 'Opens across the full content width so thumbnails use more columns with less vertical scroll.';
    summary.appendChild(sumLabel);
    var badge = document.createElement('span');
    badge.className = 'image-hosting-scrape-images-badge';
    if (currentFilter && hostedCount) {
      badge.textContent = filteredImgs.length + ' / ' + hostedCount + ' (filter)';
    } else {
      badge.textContent = String(filteredImgs.length || hostedCount);
    }
    summary.appendChild(badge);
    var chev = document.createElement('span');
    chev.className = 'image-hosting-scrape-images-summary-chevron';
    chev.setAttribute('aria-hidden', 'true');
    chev.textContent = '›';
    summary.appendChild(chev);
    details.appendChild(summary);

    var body = document.createElement('div');
    if (!filteredImgs.length) {
      var empty = document.createElement('div');
      empty.className = 'image-hosting-empty';
      if (currentFilter) {
        empty.textContent = 'No images match the category filter. Clear the filter or open another scrape.';
      } else if (rec.rawImageCount) {
        var p = document.createElement('p');
        p.style.margin = '0 0 0.6rem';
        p.textContent = rec.rawImageCount + ' images were found during crawl but have not been classified and stored yet. Use Classify images below.';
        empty.appendChild(p);
      } else {
        empty.textContent = 'No images captured during this crawl.';
      }
      body.appendChild(empty);
    } else {
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
      body.appendChild(grid);
    }
    details.appendChild(body);
    article.appendChild(details);

    details.addEventListener('toggle', function () {
      if (!listEl) return;
      if (details.open) {
        article.classList.add('image-hosting-scrape-card--expanded');
        var siblings = listEl.querySelectorAll('.image-hosting-scrape-card');
        for (var si = 0; si < siblings.length; si++) {
          var other = siblings[si];
          if (other === article) continue;
          var od = other.querySelector('.image-hosting-scrape-images-details');
          if (od && od.open) od.open = false;
          other.classList.remove('image-hosting-scrape-card--expanded');
        }
        try {
          requestAnimationFrame(function () {
            article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          });
        } catch (_e1) {}
      } else {
        article.classList.remove('image-hosting-scrape-card--expanded');
      }
    });

    if (rec.rawImageCount > 0) {
      var actions = document.createElement('div');
      actions.className = 'brand-scraper-history-card-actions image-hosting-scrape-card-actions';
      var clsBtn = document.createElement('button');
      clsBtn.type = 'button';
      clsBtn.className = 'dashboard-btn-outline';
      clsBtn.textContent = 'Classify images';
      clsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        classifyScrape(rec.scrapeId, clsBtn);
      });
      actions.appendChild(clsBtn);
      article.appendChild(actions);
    }

    return article;
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
    if (sb !== lastLibrarySandbox) {
      libraryFolderScope = null;
      updateFolderScopeBar();
    }
    lastLibrarySandbox = sb || '';
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
      var about = '';
      if (rec.analysis && typeof rec.analysis.about === 'string') about = rec.analysis.about.trim();
      brands.push({
        scrapeId: rec.scrapeId,
        brandName: rec.brandName || (summaries[i] && summaries[i].brandName),
        url: rec.url || (summaries[i] && summaries[i].url),
        industry: rec.industry || (summaries[i] && summaries[i].industry),
        pagesScraped: (rec.crawlSummary && rec.crawlSummary.pagesScraped) || null,
        updatedAt: rec.updatedAt || (summaries[i] && summaries[i].updatedAt),
        rawImageCount: rawCount,
        images: classified,
        analysisAbout: about,
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
    listEl.className = 'image-hosting-list image-hosting-scrape-list';
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
      var head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      var isZip = head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b; /* PK — ZIP local file header */
      if (!isZip) {
        var errText = '';
        try {
          errText = await blob.text();
        } catch (_e) {}
        setStatus(
          'Download was not a valid ZIP file (server returned JSON or HTML instead). If this persists after deploy, check the image-hosting API.',
          'err'
        );
        if (errText && errText.length < 400) console.warn('[image-hosting] download non-zip body:', errText.slice(0, 400));
        return;
      }
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
  var newFolderBtn = document.getElementById('imageHostingNewFolderBtn');
  if (newFolderBtn) newFolderBtn.addEventListener('click', function () { createEmptyLibraryFolder(); });
  var folderPanelToggle = document.getElementById('imageHostingFolderPanelToggle');
  if (folderPanelToggle) {
    folderPanelToggle.addEventListener('click', function () { setFolderPanelOpen(!folderPanelOpen); });
  }
  var folderScopeClear = document.getElementById('imageHostingFolderScopeClear');
  if (folderScopeClear) folderScopeClear.addEventListener('click', function () { setLibraryFolderScope(null); });

  // Drop zone: click-to-browse + native drag/drop for files and ZIPs.
  var dropZone = document.getElementById('imageHostingDropZone');
  var dropInput = document.getElementById('imageHostingDropInput');
  var dropModeEl = document.getElementById('imageHostingDropMode');
  if (dropModeEl) dropModeEl.addEventListener('change', syncDropInputAccept);
  if (dropZone && dropInput) {
    syncDropInputAccept();
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
        var types = (e.dataTransfer && e.dataTransfer.types) || [];
        if (Array.prototype.indexOf.call(types, DT_LIBRARY_PATH) !== -1) {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
          dropZone.classList.remove('is-dragover');
          return;
        }
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
      var types = (e.dataTransfer && e.dataTransfer.types) || [];
      if (Array.prototype.indexOf.call(types, DT_LIBRARY_PATH) !== -1) return;
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

  syncFolderPanelLayout();
  updateFolderScopeBar();

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
