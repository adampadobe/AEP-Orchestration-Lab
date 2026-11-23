/**
 * Image hosting — list brand-scraper scrapes per sandbox and render their
 * classified images as a grid using the public URL saved alongside each
 * asset. Falls back to signedUrl when the object wasn't made public.
 */
(function () {
  'use strict';

  async function fetch(url, options) {
    var opts = Object.assign({}, options || {});
    if (typeof url === 'string' && url.indexOf('/api/') === 0) {
      var auth = await requireImageAuth();
      opts.headers = Object.assign({}, opts.headers || {}, auth);
    }
    var response = await window.fetch(url, opts);
    if (typeof url === 'string' && url.indexOf('/api/') === 0 && response.status === 401) {
      showSignIn();
      throw new Error('Sign in with an authorized lab account to access images.');
    }
    return response;
  }

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

  var explorer = {
    source: 'published', sandbox: '', path: '', backupId: '', items: [], selected: new Set(),
    sandboxes: [], backups: [], driveFolders: new Set(['']), totalBytes: 0,
    generation: 0, busy: false, restore: null, pollTimer: null, signedIn: false, uid: ''
  };
  var byId = function (id) { return document.getElementById(id); };
  function node(tag, text, cls) {
    var el = document.createElement(tag);
    if (text != null) el.textContent = String(text);
    if (cls) el.className = cls;
    return el;
  }
  function action(text, work, cls) {
    var button = node('button', text, cls);
    button.type = 'button';
    button.addEventListener('click', function () { runExplorer(work); });
    return button;
  }
  function showSignIn() {
    explorer.signedIn = false;
    explorer.generation++;
    clearTimeout(explorer.pollTimer);
    explorer.items = []; explorer.backups = []; lastLibraryItems = [];
    explorer.driveFolders = new Set(['']); explorer.sandboxes = []; lastRecords = [];
    explorer.path = ''; explorer.sandbox = ''; explorer.backupId = ''; explorer.restore = null;
    explorer.uid = ''; explorer.totalBytes = 0;
    explorer.selected.clear();
    byId('imageHostingSignIn').hidden = false;
    byId('ihItems').replaceChildren();
    byId('ihTree').replaceChildren();
    byId('ihDetails').replaceChildren();
    document.querySelectorAll('[data-ih-tab]').forEach(function (tab) {
      byId(tab.dataset.ihTab).hidden = true;
    });
    byId('ihPublishedTools').hidden = true;
    document.querySelectorAll('dialog[open]').forEach(function (dialog) { dialog.close(); });
  }
  async function requireImageAuth() {
    var headers = window.AepLabSandboxSync && await window.AepLabSandboxSync.getAuthHeaders();
    var user = window.firebase && window.firebase.apps && window.firebase.apps.length
      ? window.firebase.auth().currentUser : null;
    if (!headers || !headers.Authorization || (user && user.isAnonymous)) {
      showSignIn();
      throw new Error('Sign in to the lab to use Image hosting. Anonymous sessions cannot access private files.');
    }
    if (explorer.signedIn && user && explorer.uid !== (user.uid || '')) {
      showSignIn();
      throw new Error('Your lab account changed. Reload Image hosting to access the new account.');
    }
    return headers;
  }
  async function imageApi(url, method, body) {
    var response = await fetch(url, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: body == null ? undefined : JSON.stringify(body)
    });
    var result;
    try { result = await response.json(); }
    catch (_) { throw new Error('Unreadable server response (HTTP ' + response.status + ').'); }
    // Library routes predate the `ok` envelope, so only an explicit `ok: false` fails a 2xx response.
    if (!response.ok || !result || result.ok === false) {
      throw new Error(result.errors?.length ? uploadErrorSummary(result.errors) :
        typeof result.error === 'string' ? result.error : 'Request failed (HTTP ' + response.status + ').');
    }
    return result;
  }
  async function readPages(url) {
    var items = [], cursor = '', seen = new Set();
    do {
      var result = await imageApi(url + (cursor ? (url.includes('?') ? '&' : '?') + 'cursor=' + encodeURIComponent(cursor) : ''));
      if (!Array.isArray(result.items)) throw new Error('The server did not return a file list.');
      items.push.apply(items, result.items);
      cursor = result.nextCursor || '';
      if (cursor && seen.has(cursor)) throw new Error('The server repeated a pagination cursor. Reload the folder.');
      seen.add(cursor);
    } while (cursor);
    return items;
  }
  async function runExplorer(work) {
    if (explorer.busy) return;
    explorer.busy = true;
    byId('ihFiles').setAttribute('aria-busy', 'true');
    try {
      await requireImageAuth();
      await work();
    } catch (error) {
      setStatus(error.message || String(error), 'err');
      if (byId('ihItems').textContent === 'Loading…') {
        byId('ihItems').replaceChildren(node('p', 'Folder could not be loaded. Select it again to retry.', 'ih-empty'));
      }
    }
    finally {
      explorer.busy = false;
      byId('ihFiles').removeAttribute('aria-busy');
    }
  }
  function fileKey(item) { return item.sandbox ? item.sandbox + '/' + item.path : item.path; }
  function joinPath(parent, child) { return parent ? parent + '/' + child : child; }
  function validPath(value) {
    if (!value || value.startsWith('/') || /[\\?#\u0000-\u001f]/.test(value) ||
      value.split('/').some(function (part) { return !part || part === '.' || part === '..'; })) {
      throw new Error('Use a relative path with non-empty folder names and no "..".');
    }
    return value;
  }
  function uploadErrorSummary(errors) {
    return errors.map(function (error) {
      return error.name + ': ' + (error.status === 409 ? 'name conflict — rename the file or choose an explicit replacement. ' : '') +
        (error.error || 'Upload failed') + (error.status ? ' (HTTP ' + error.status + ')' : '');
    }).join('; ');
  }
  async function checkDriveOperationLimit(items) {
    var seen = new Set();
    async function count(item) {
      if (seen.has(item.path)) return;
      seen.add(item.path);
      if (seen.size > 200) {
        throw new Error('Folder operations are limited to 200 entries. Move or delete smaller groups of files instead. Nothing was changed.');
      }
      if (item.kind === 'folder') {
        var children = await readPages('/api/image-hosting/drive?path=' + encodeURIComponent(item.path));
        for (var child of children) await count(child);
      }
    }
    for (var item of items) await count(item);
  }
  function displayDate(value) {
    if (!value) return 'Not available';
    var date = new Date(value);
    return isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
  }
  function previewUrl(item) {
    var raw = explorer.source === 'published' ? item.cdnUrl : item.previewUrl;
    if (!raw) return '';
    try {
      var url = new URL(raw, location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }
  function preview(item) {
    if (item.kind === 'folder') {
      var placeholder = node('div', null, 'ih-file-placeholder ih-folder-icon');
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', 'Folder');
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.6');
      svg.setAttribute('stroke-linejoin', 'round');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z');
      svg.append(path);
      placeholder.append(svg);
      return placeholder;
    }
    var url = previewUrl(item);
    if (!url || (item.contentType && !item.contentType.startsWith('image/'))) {
      return node('div', 'File', 'ih-file-placeholder');
    }
    var image = node('img', null, 'ih-thumbnail');
    image.alt = item.name;
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
    image.src = url;
    image.addEventListener('error', function () { image.replaceWith(node('p', 'Preview unavailable', 'ih-file-placeholder')); }, { once: true });
    return image;
  }
  function renderTree() {
    var tree = byId('ihTree');
    tree.replaceChildren();
    function entry(label, source, path, sandbox, backupId, nested) {
      var button = action(label, function () { return navigateExplorer(source, path, sandbox, backupId); }, nested ? 'ih-tree-child' : 'ih-tree-root');
      if (explorer.source === source && explorer.path === (path || '') &&
        (!sandbox || explorer.sandbox === sandbox) && (!backupId || explorer.backupId === backupId)) button.setAttribute('aria-current', 'location');
      tree.append(button);
    }
    entry('Published library', 'published', '', explorer.sandbox || explorer.sandboxes[0]);
    explorer.sandboxes.forEach(function (sandbox) {
      entry(sandbox, 'published', '', sandbox, '', true);
      if (sandbox === explorer.sandbox) {
        sortedFolderPaths(collectFolderPaths(lastLibraryItems)).filter(Boolean).forEach(function (path) {
          entry(path, 'published', path, sandbox, '', true);
        });
      }
    });
    entry('My drive', 'drive', '');
    Array.from(explorer.driveFolders).filter(Boolean).sort().forEach(function (path) {
      entry(path, 'drive', path, '', '', true);
    });
    entry('Backups', 'backups', '');
    explorer.backups.forEach(function (backup) {
      entry(backupLabel(backup), 'backup', '', '', backup.id, true);
    });
  }
  function locationName() {
    return { published: 'Published library', drive: 'My drive', backups: 'Backups', backup: 'Backups' }[explorer.source];
  }
  function renderBreadcrumb() {
    var host = byId('ihBreadcrumb');
    host.replaceChildren(action(locationName(), function () {
      return navigateExplorer(explorer.source === 'backup' ? 'backups' : explorer.source, '', explorer.sandbox);
    }));
    if (explorer.source === 'published') host.append(node('span', ' / ' + (explorer.sandbox || 'No workspace')));
    if (explorer.source === 'backup') {
      var backup = explorer.backups.find(function (item) { return item.id === explorer.backupId; });
      host.append(node('span', ' / ' + (backup ? backupLabel(backup) : explorer.backupId)));
    }
    var parts = explorer.path.split('/').filter(Boolean);
    parts.forEach(function (part, index) {
      host.append(node('span', ' / '), action(part, function () {
        return navigateExplorer(explorer.source, parts.slice(0, index + 1).join('/'), explorer.sandbox, explorer.backupId);
      }));
    });
    var writable = ['published', 'drive'].includes(explorer.source);
    byId('ihUpload').disabled = !writable || (explorer.source === 'published' && !explorer.sandbox);
    byId('ihNewFolder').disabled = byId('ihUpload').disabled;
    byId('ihPublishedTools').hidden = explorer.source !== 'published' || byId('ihFiles').hidden;
    byId('ihLocationHint').textContent = {
      published: 'Your workspace sandbox assets. Moving or renaming a published file changes its CDN path.',
      drive: 'Private to your account; no published CDN URL. Upload up to 20 files, 8 MiB each. Folder operations are limited to 200 entries.',
      backups: 'Private snapshots kept until you delete them. Total storage: ' + (formatBytesShort(explorer.totalBytes) || '0 B') + '.',
      backup: 'Read-only snapshot. Restore your workspace files after reviewing a diff.'
    }[explorer.source];
  }
  function selectedItems() {
    return explorer.items.filter(function (item) { return explorer.selected.has(fileKey(item)); });
  }
  function renderSelection() {
    var count = explorer.selected.size;
    byId('ihSelection').hidden = !count;
    byId('ihSelectionCount').textContent = count + ' selected';
    var backup = explorer.source === 'backup';
    byId('ihCopy').hidden = explorer.source !== 'published';
    byId('ihRestore').hidden = !backup;
    ['ihMove', 'ihRename', 'ihDelete'].forEach(function (id) { byId(id).hidden = backup; });
    byId('ihRename').disabled = count !== 1;
    var publishedFolders = explorer.source === 'published' && selectedItems().some(function (item) { return item.kind === 'folder'; });
    ['ihMove', 'ihRename', 'ihDelete'].forEach(function (id) {
      byId(id).disabled = publishedFolders || (id === 'ihRename' && count !== 1);
      byId(id).title = publishedFolders ? 'Open published folders and select their files to modify them.' : '';
    });
    byId('ihCopy').disabled = selectedItems().some(function (item) { return item.kind === 'folder'; });
    byId('ihDownload').disabled = selectedItems().some(function (item) { return item.kind === 'folder' || !previewUrl(item); });
  }
  function showDetails(item) {
    var pane = byId('ihDetails');
    pane.replaceChildren(node('h3', item.name), preview(item));
    var dl = node('dl');
    [['Path', fileKey(item)], ['Size', item.size == null ? 'Not available' : formatBytesShort(item.size)],
      ['Type', item.kind === 'folder' ? 'Folder' : item.contentType || 'Not available'],
      ['Updated', displayDate(item.updatedAt)], ['Created', displayDate(item.createdAt)]].forEach(function (pair) {
      dl.append(node('dt', pair[0]), node('dd', pair[1]));
    });
    pane.append(dl);
    if (explorer.source === 'published' && item.kind !== 'folder') {
      pane.append(node('dt', 'CDN URL'), node('p', previewUrl(item), 'ih-cdn'));
      pane.append(action('Copy CDN URL', function () { return copyToClipboard(previewUrl(item)); }));
      var replace = node('label', 'Replace image', 'dashboard-btn-outline image-hosting-file-label');
      var input = node('input');
      input.type = 'file'; input.accept = 'image/*'; input.hidden = true;
      input.addEventListener('change', function () {
        if (input.files[0]) runExplorer(function () { return replaceLibraryItem(item.path, input.files[0]); });
      });
      replace.append(input); pane.append(replace);
    }
    if (explorer.source === 'backup') pane.append(action('Restore this file…', function () { return previewRestore([fileKey(item)]); }));
    else pane.append(action('Select for actions', function () {
      explorer.selected.add(fileKey(item)); renderExplorerItems();
    }));
  }
  function explorerViewMode() {
    return ['grid', 'waterfall', 'list'].includes(viewMode) ? viewMode : 'grid';
  }
  // Dropping an image on a published file replaces it in place: same relPath, same CDN URL.
  function wireExplorerReplace(row, item) {
    row.title = 'Drop an image here to replace ' + item.path + ' (keeps the same name and CDN URL)';
    function hasFiles(event) {
      return Array.prototype.includes.call((event.dataTransfer && event.dataTransfer.types) || [], 'Files');
    }
    ['dragenter', 'dragover'].forEach(function (type) {
      row.addEventListener(type, function (event) {
        if (!hasFiles(event)) return;
        event.preventDefault(); event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy';
        row.classList.add('is-drop-target');
      });
    });
    row.addEventListener('dragleave', function (event) {
      if (!row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
    });
    row.addEventListener('drop', function (event) {
      if (!hasFiles(event)) return;
      event.preventDefault(); event.stopPropagation();
      row.classList.remove('is-drop-target');
      var file = event.dataTransfer.files[0];
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name)) {
        setStatus('Drop an image file to replace ' + item.path + '.', 'err');
        return;
      }
      replaceLibraryItem(item.path, file, row);
    });
  }
  function visibleItems() {
    var q = byId('ihSearch').value.trim().toLowerCase();
    return explorer.items.filter(function (item) { return (item.name + ' ' + fileKey(item)).toLowerCase().includes(q); });
  }
  function renderExplorerItems() {
    renderBreadcrumb();
    var mode = explorerViewMode();
    ['Grid', 'Waterfall', 'List'].forEach(function (name) {
      byId('ih' + name + 'View').setAttribute('aria-pressed', String(mode === name.toLowerCase()));
    });
    var host = byId('ihItems');
    host.className = 'ih-items' + (mode === 'grid' ? '' : ' ih-items--' + mode);
    host.replaceChildren();
    if (explorer.source === 'backups') { renderBackupList(); return; }
    var items = visibleItems();
    items.forEach(function (item) {
      var row = node('article', null, 'ih-item');
      if (explorer.selected.has(fileKey(item))) row.classList.add('is-selected');
      var label = node('label', null, 'ih-file-select');
      var checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.checked = explorer.selected.has(fileKey(item));
      checkbox.setAttribute('aria-label', 'Select ' + fileKey(item));
      checkbox.addEventListener('change', function () {
        if (checkbox.checked) explorer.selected.add(fileKey(item)); else explorer.selected.delete(fileKey(item));
        row.classList.toggle('is-selected', checkbox.checked); showDetails(item); renderSelection();
      });
      label.append(checkbox);
      var open = action(item.name, function () {
        if (item.kind === 'folder') return navigateExplorer(explorer.source, item.path, explorer.sandbox, explorer.backupId);
        showDetails(item);
      }, 'ih-file-open');
      var thumb = preview(item);
      row.append(label, thumb, open, node('span', item.kind === 'folder' ? 'Folder' : formatBytesShort(item.size) || 'Size unavailable', 'ih-file-size'),
        node('span', displayDate(item.updatedAt), 'ih-file-date'));
      if (explorer.source === 'published' && item.kind !== 'folder') wireExplorerReplace(row, item);
      host.append(row);
    });
    if (!items.length) host.append(node('div', byId('ihSearch').value ? 'No files match your search. Clear the search to see this folder.' :
      explorer.source === 'backup' ? 'No files in this snapshot.' : 'This folder is empty. Upload files or create a folder to get started.', 'ih-empty'));
    renderSelection();
  }
  function renderPublishedExplorer() {
    if (explorer.source !== 'published' || !explorer.signedIn || byId('ihFiles').hidden) return;
    var path = explorer.path;
    if (libraryCountEl) libraryCountEl.textContent = String(assetLibraryItems().length);
    var folders = sortedFolderPaths(collectFolderPaths(lastLibraryItems));
    var folderItems = folders.filter(function (folder) {
      return folder && libraryDirAndFilename(folder).dir === path;
    }).map(function (folder) { return { name: libraryDirAndFilename(folder).file, path: folder, kind: 'folder' }; });
    explorer.items = folderItems.concat(assetLibraryItems().filter(function (item) {
      return libraryDirAndFilename(item.relPath).dir === path;
    }).map(function (item) {
      return Object.assign({}, item, { path: item.relPath, name: item.file || libraryDirAndFilename(item.relPath).file, kind: 'file' });
    }));
    renderTree(); renderExplorerItems();
  }
  async function loadBackups() {
    var generation = explorer.generation;
    var result = await imageApi('/api/image-hosting/backups');
    if (!Array.isArray(result.backups)) throw new Error('The server did not return backups.');
    if (generation !== explorer.generation || !explorer.signedIn) return;
    explorer.backups = result.backups; explorer.totalBytes = result.totalBytes;
  }
  async function navigateExplorer(source, path, sandbox, backupId) {
    var generation = ++explorer.generation;
    explorer.source = source; explorer.path = path || '';
    explorer.sandbox = sandbox || explorer.sandbox; explorer.backupId = backupId || '';
    explorer.items = []; explorer.selected.clear(); byId('ihSearch').value = '';
    byId('ihDetails').replaceChildren(node('h3', 'Details'), node('p', 'Select a file to preview it and see its details.'));
    renderBreadcrumb(); renderSelection();
    byId('ihItems').replaceChildren(node('p', 'Loading…', 'ih-empty'));
    if (source === 'published') {
      if (!explorer.sandbox) {
        byId('ihItems').replaceChildren(node('p', 'An owned lab workspace is required to access the published library. My drive and Backups remain available.'));
        renderTree();
        return;
      }
      var items = await fetchLibrary(explorer.sandbox);
      if (generation !== explorer.generation) return;
      lastLibraryItems = items.map(function (item) {
        return Object.assign({}, item, { isFolderMarker: item.isFolderMarker || item.file === LIB_FOLDER_MARKER });
      });
      renderPublishedExplorer();
    } else if (source === 'drive') {
      var drive = await readPages('/api/image-hosting/drive?path=' + encodeURIComponent(explorer.path));
      if (generation !== explorer.generation) return;
      explorer.items = drive;
      drive.filter(function (item) { return item.kind === 'folder'; }).forEach(function (item) { explorer.driveFolders.add(item.path); });
      renderExplorerItems(); renderTree();
    } else {
      await loadBackups();
      if (generation !== explorer.generation) return;
      if (source === 'backup') {
        var files = await readPages('/api/image-hosting/backups/' + encodeURIComponent(backupId) + '/files');
        if (generation !== explorer.generation) return;
        explorer.items = files.map(function (item) {
          return Object.assign({}, item, { name: item.sandbox + '/' + item.relPath, path: item.relPath, kind: 'file' });
        });
      }
      renderExplorerItems(); renderTree();
    }
  }
  function backupLabel(backup) { return backup.name || displayDate(backup.createdAt); }
  var BACKUP_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
  function completedBackup(backup) { return ['completed', 'complete', 'succeeded'].includes(backup.status); }
  function renderBackupList() {
    var host = byId('ihItems');
    host.className = 'ih-backup-list';
    var q = byId('ihSearch').value.toLowerCase();
    explorer.backups.filter(function (backup) { return ((backup.name || '') + ' ' + displayDate(backup.createdAt) + ' ' + backup.sandboxes.join(' ')).toLowerCase().includes(q); }).forEach(function (backup) {
      var row = node('article', null, 'ih-backup-row');
      row.append(action(backupLabel(backup), function () { return navigateExplorer('backup', '', '', backup.id); }, 'ih-backup-title'),
        node('p', (backup.name ? displayDate(backup.createdAt) + ' · ' : '') + backup.sandboxes.join(', ')), node('p', backup.fileCount + ' files · ' + (formatBytesShort(backup.bytes) || '0 B')),
        node('p', backup.status + (backup.error ? ': ' + backup.error : '')));
      var buttons = node('div', null, 'ih-dialog-actions');
      var restore = action('Restore…', function () { explorer.backupId = backup.id; return previewRestore(); });
      var download = action('Download ZIP', function () { return downloadBackup(backup.id, backup.name); });
      restore.disabled = download.disabled = !completedBackup(backup);
      buttons.append(restore, download, action('Delete', async function () {
        if (!confirm('Permanently delete backup "' + backupLabel(backup) + '"? This cannot be undone.')) return;
        await imageApi('/api/image-hosting/backups/' + encodeURIComponent(backup.id), 'DELETE');
        setStatus('Backup deleted.', 'ok'); await navigateExplorer('backups');
      }));
      if (!completedBackup(backup) && backup.status !== 'failed') buttons.append(action('Check progress', function () { return pollBackup(backup.id); }));
      row.append(buttons); host.append(row);
    });
    if (!host.children.length) host.append(node('p', q ? 'No backups match your search.' : 'No backups yet. Use Back up now to duplicate your published libraries.', 'ih-empty'));
  }
  async function downloadUrl(url, filename, authenticated) {
    var response = await (authenticated ? fetch(url) : window.fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }));
    if (!response.ok) throw new Error('Download failed (HTTP ' + response.status + ').');
    var blob = await response.blob(), objectUrl = URL.createObjectURL(blob);
    var anchor = node('a'); anchor.href = objectUrl; anchor.download = filename;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);
  }
  async function downloadBackup(id, name) {
    var result = await imageApi('/api/image-hosting/backups/' + encodeURIComponent(id) + '/download');
    var url = signedDownloadUrl(result.url);
    await downloadUrl(url, (name ? name.replace(/[^A-Za-z0-9._-]/g, '-') : 'image-backup-' + id) + '.zip', false);
    setStatus('Backup ZIP downloaded.', 'ok');
  }
  function signedDownloadUrl(value) {
    var url;
    try { url = new URL(value); } catch (_) { throw new Error('No valid download URL returned.'); }
    if (url.protocol !== 'https:') throw new Error('Download URL must use HTTPS.');
    return url.href;
  }
  async function chooseBackup() {
    var result = await imageApi('/api/image-hosting/sandboxes-used');
    var used = (result.sandboxes || []).map(function (sandbox) { return sandbox.name; });
    var host = byId('ihBackupSandboxes');
    host.replaceChildren();
    used.forEach(function (sandbox) {
      var label = node('label', null, 'ih-sandbox-choice'), checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.value = sandbox; checkbox.checked = used.includes(sandbox);
      label.append(checkbox, node('span', sandbox)); host.append(label);
    });
    if (!used.length) host.append(node('p', result.reason || 'An owned lab workspace is required to create a backup.'));
    byId('ihBackupStart').disabled = !used.length;
    byId('ihBackupName').value = (used[0] || 'images') + '-backup-' + new Date().toISOString().slice(0, 10);
    byId('ihBackupCheck').hidden = true;
    byId('ihBackupProgress').hidden = true; byId('ihBackupResult').textContent = '';
    byId('ihBackupDialog').showModal();
  }
  async function pollBackup(id) {
    clearTimeout(explorer.pollTimer);
    byId('ihBackupCheck').dataset.backupId = id;
    byId('ihBackupCheck').hidden = false;
    var result = await imageApi('/api/image-hosting/backups/' + encodeURIComponent(id));
    var backup = result.backup;
    if (!backup || typeof backup.status !== 'string') throw new Error('The server did not return a backup status. Use Check progress to retry.');
    var progress = byId('ihBackupProgress');
    progress.hidden = false;
    if (backup.progress && backup.progress.total > 0) {
      progress.max = backup.progress.total; progress.value = backup.progress.done;
    } else progress.removeAttribute('value');
    byId('ihBackupResult').textContent = backup.status + ' · ' + (backup.progress ? backup.progress.done + ' / ' + backup.progress.total + ' files' : 'Preparing inventory');
    if (completedBackup(backup) || backup.status === 'failed') {
      byId('ihBackupStart').disabled = false;
      byId('ihBackupCheck').hidden = true;
      setStatus(completedBackup(backup) ? 'Backup complete: ' + backup.fileCount + ' files, ' + formatBytesShort(backup.bytes) + '.' : 'Backup failed: ' + (backup.error || 'Unknown error'), completedBackup(backup) ? 'ok' : 'err');
      await navigateExplorer('backups');
    } else {
      function nextPoll() {
        if (!explorer.signedIn) return;
        if (explorer.busy) { explorer.pollTimer = setTimeout(nextPoll, 1000); return; }
        runExplorer(function () { return pollBackup(id); });
      }
      explorer.pollTimer = setTimeout(nextPoll, 2000);
    }
  }
  async function previewRestore(paths) {
    var id = explorer.backupId;
    var result = await imageApi('/api/image-hosting/backups/' + encodeURIComponent(id) + '/restore/preview', 'POST', paths ? { paths: paths } : {});
    if (!Array.isArray(result.items)) throw new Error('The server did not return a restore diff.');
    explorer.restore = { id: id, paths: paths, items: result.items };
    var host = byId('ihRestoreDiff'); host.replaceChildren();
    var counts = result.counts || {};
    byId('ihRestoreCounts').textContent = ['add', 'overwrite', 'unchanged'].map(function (key) { return (counts[key] || 0) + ' ' + key; }).join(' · ');
    result.items.forEach(function (item) {
      var label = node('label', null, 'ih-diff-row'), checkbox = node('input');
      checkbox.type = 'checkbox'; checkbox.value = item.sandbox + '/' + item.relPath; checkbox.checked = item.action !== 'unchanged'; checkbox.disabled = true;
      checkbox.addEventListener('change', updateRestoreApply);
      label.append(checkbox, node('span', item.action, 'ih-diff-action'), node('span', checkbox.value)); host.append(label);
    });
    byId('ihRestoreAll').checked = true; byId('ihRestoreConfirm').checked = false;
    updateRestoreApply(); byId('ihRestoreDialog').showModal();
  }
  function updateRestoreApply() {
    var all = byId('ihRestoreAll').checked;
    byId('ihRestoreDiff').querySelectorAll('input').forEach(function (input) {
      var item = explorer.restore.items.find(function (item) { return item.sandbox + '/' + item.relPath === input.value; });
      input.disabled = all || item.action === 'unchanged';
    });
    byId('ihRestoreApply').disabled = !byId('ihRestoreConfirm').checked ||
      !explorer.restore.items.some(function (item) { return item.action !== 'unchanged'; }) ||
      (!all && !byId('ihRestoreDiff').querySelector('input:checked:not(:disabled)'));
  }
  async function mutateSelection(operation) {
    var items = selectedItems();
    if (!items.length) return;
    if (explorer.source === 'drive') await checkDriveOperationLimit(items);
    if (explorer.source === 'published' && items.some(function (item) { return item.kind === 'folder'; })) {
      throw new Error('Open published folders and select their files to modify them.');
    }
    if (operation === 'delete' && !confirm('Delete ' + items.length + ' selected item(s)? Folder contents will also be deleted.')) return;
    var target = null;
    if (operation === 'move') {
      target = prompt('Destination folder path (blank for root):', explorer.path);
      if (target === null) return;
      if (target) validPath(target);
    }
    if (operation === 'rename') {
      target = prompt('New name:', items[0].name);
      if (target === null) return;
      validPath(target);
      if (target.includes('/')) throw new Error('A new name cannot contain a slash. Use Move to change folders.');
    }
    if (explorer.source === 'drive' && operation === 'delete') {
      await imageApi('/api/image-hosting/drive', 'DELETE', { paths: items.map(function (item) { return item.path; }) });
    } else {
      for (var item of items) {
        if (explorer.source === 'drive') {
          await imageApi('/api/image-hosting/drive/' + operation, 'POST', operation === 'rename' ?
            { path: item.path, newName: target } : { from: item.path, to: joinPath(target, item.name) });
        } else {
          if (item.kind === 'folder') throw new Error('Published folders are navigable; select their files to move, rename or delete them.');
          var url = '/api/image-hosting/library?sandbox=' + encodeURIComponent(explorer.sandbox);
          if (operation === 'delete') await imageApi(url + '&relPath=' + encodeURIComponent(item.path), 'DELETE');
          else await imageApi('/api/image-hosting/library/rename?sandbox=' + encodeURIComponent(explorer.sandbox), 'POST', {
            sandbox: explorer.sandbox, relPath: item.path, newRelPath: operation === 'rename' ?
              joinPath(libraryDirAndFilename(item.path).dir, target) : joinPath(target, item.name), onConflict: 'error'
          });
        }
      }
    }
    explorer.driveFolders = new Set(['']);
    setStatus('Selected items updated.', 'ok');
    await navigateExplorer(explorer.source, explorer.path, explorer.sandbox, explorer.backupId);
  }
  async function initExplorer() {
    await runExplorer(async function () {
      explorer.signedIn = true;
      explorer.uid = window.firebase?.apps?.length ? window.firebase.auth().currentUser?.uid || '' : '';
      byId('imageHostingSignIn').hidden = true;
      explorer.sandbox = '';
      explorer.sandboxes = [];
      byId('ihFiles').hidden = false;
      renderTree();
      var result = await imageApi('/api/image-hosting/sandboxes-used');
      explorer.sandboxes = (result.sandboxes || []).map(function (sandbox) { return sandbox.name; });
      explorer.sandbox = explorer.sandboxes[0] || '';
      byId('ihFiles').hidden = false;
      await loadBackups();
      await navigateExplorer('published', '', explorer.sandbox);
      setStatus('Image folders ready.', 'ok');
    });
  }
  document.querySelectorAll('[data-ih-tab]').forEach(function (tab, index, tabs) {
    tab.addEventListener('click', function () {
      if (!explorer.signedIn) return;
      tabs.forEach(function (other) {
        var active = other === tab;
        other.setAttribute('aria-selected', String(active)); other.tabIndex = active ? 0 : -1;
        byId(other.dataset.ihTab).hidden = !active;
      });
      byId('ihPublishedTools').hidden = tab.dataset.ihTab !== 'ihFiles' || explorer.source !== 'published';
      if (tab.dataset.ihTab === 'ihScrapes') runExplorer(refresh);
      if (tab.dataset.ihTab === 'ihFiles') runExplorer(function () {
        return navigateExplorer(explorer.source, explorer.path, explorer.sandbox, explorer.backupId);
      });
    });
    tab.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
      if (next >= 0) { event.preventDefault(); tabs[next].focus(); tabs[next].click(); }
    });
  });
  byId('ihSearch').addEventListener('input', renderExplorerItems);
  ['Grid', 'Waterfall', 'List'].forEach(function (mode) {
    byId('ih' + mode + 'View').addEventListener('click', function () {
      viewMode = mode.toLowerCase();
      try { localStorage.setItem(LS_VIEW, viewMode); } catch (_e) {}
      renderExplorerItems();
    });
  });
  byId('ihBackupNow').addEventListener('click', function () { runExplorer(chooseBackup); });
  byId('ihBackupClose').addEventListener('click', function () { byId('ihBackupDialog').close(); });
  byId('ihBackupCheck').addEventListener('click', function () {
    runExplorer(function () { return pollBackup(byId('ihBackupCheck').dataset.backupId); });
  });
  byId('ihBackupStart').addEventListener('click', function () { runExplorer(async function () {
    var sandboxes = Array.from(byId('ihBackupSandboxes').querySelectorAll('input:checked')).map(function (input) { return input.value; });
    if (!sandboxes.length) throw new Error('Select at least one sandbox to back up.');
    if (sandboxes.length > 100) throw new Error('A backup can include at most 100 sandboxes. Select fewer sandboxes and create another backup for the rest.');
    var name = byId('ihBackupName').value.trim();
    if (name && (name.length > 100 || !BACKUP_NAME.test(name))) {
      throw new Error('Backup name must be up to 100 letters, numbers, spaces, dots, dashes or underscores.');
    }
    var result = await imageApi('/api/image-hosting/backups', 'POST', name ? { sandboxes: sandboxes, name: name } : { sandboxes: sandboxes });
    if (!result.backupId) throw new Error('Backup submitted but no ID returned. Inspect Backups before creating another.');
    byId('ihBackupStart').disabled = true;
    setStatus('Backup started. You may close the dialog and inspect Backups.', 'ok');
    await pollBackup(result.backupId);
  }); });
  byId('ihRestoreAll').addEventListener('change', updateRestoreApply);
  byId('ihRestoreConfirm').addEventListener('change', updateRestoreApply);
  byId('ihRestoreClose').addEventListener('click', function () { byId('ihRestoreDialog').close(); });
  byId('ihRestoreApply').addEventListener('click', function () { runExplorer(async function () {
    byId('ihRestoreApply').disabled = true;
    var restore = explorer.restore;
    var paths = byId('ihRestoreAll').checked ? restore.paths :
      Array.from(byId('ihRestoreDiff').querySelectorAll('input:checked:not(:disabled)')).map(function (input) { return input.value; });
    try {
      var result = await imageApi('/api/image-hosting/backups/' + encodeURIComponent(restore.id) + '/restore', 'POST', paths ? { paths: paths } : {});
      if (!Number.isInteger(result.restored) || !Number.isInteger(result.skipped)) {
        throw new Error('Restore returned no valid receipt.');
      }
      setStatus('Restored ' + result.restored + ' files; skipped ' + result.skipped + '.', 'ok');
      byId('ihRestoreDialog').close();
      await navigateExplorer(explorer.source, explorer.path, explorer.sandbox, explorer.backupId);
    } catch (error) {
      byId('ihRestoreConfirm').checked = false;
      throw new Error(error.message + ' Inspect published files before submitting another restore.');
    }
  }); });
  byId('ihNewFolder').addEventListener('click', function () { runExplorer(async function () {
    var name = prompt('New folder name:', '');
    if (name === null) return;
    var path = validPath(joinPath(explorer.path, name));
    await imageApi(explorer.source === 'drive' ? '/api/image-hosting/drive/folder' :
      '/api/image-hosting/library/folder?sandbox=' + encodeURIComponent(explorer.sandbox), 'POST',
    explorer.source === 'drive' ? { path: path } : { sandbox: explorer.sandbox, folder: path });
    await navigateExplorer(explorer.source, explorer.path, explorer.sandbox);
    setStatus('Folder created.', 'ok');
  }); });
  byId('ihUpload').addEventListener('click', function () { byId('ihUploadInput').click(); });
  byId('ihUploadInput').addEventListener('change', function () {
    var files = Array.from(this.files); this.value = '';
    runExplorer(async function () {
      if (explorer.source === 'drive') {
        if (files.length > 20) throw new Error('Upload at most 20 files at a time. Nothing was uploaded.');
        var oversized = files.filter(function (file) { return file.size > 8 * 1024 * 1024; });
        if (oversized.length) throw new Error('Each drive file must be at most 8 MiB. Too large: ' + oversized.map(function (file) { return file.name; }).join(', ') + '. Nothing was uploaded.');
      }
      for (var file of files) {
        setStatus('Uploading ' + file.name + '…');
        var result = await imageApi(explorer.source === 'drive' ? '/api/image-hosting/drive/upload' :
          '/api/image-hosting/library/upload?sandbox=' + encodeURIComponent(explorer.sandbox), 'POST', {
          sandbox: explorer.sandbox, path: explorer.path,
          files: [{ name: file.name,
            base64: await fileToBase64(file), contentType: file.type }],
          keepFilename: true, convertToPng: false, onConflict: explorer.source === 'published' && explorer.path ? 'version' : 'error'
        });
        if (result.conflicts && result.conflicts.length) throw new Error('Upload conflict for ' + file.name + '. No replacement was made; rename the file or use Replace image.');
        if (result.errors && result.errors.length) {
          await navigateExplorer(explorer.source, explorer.path, explorer.sandbox);
          throw new Error('Could not save all files: ' + uploadErrorSummary(result.errors));
        }
        if (!Array.isArray(result.uploaded) || !result.uploaded.length) {
          throw new Error('Upload returned no saved file. Inspect the folder before retrying.');
        }
        if (explorer.source === 'published' && explorer.path) {
          var uploaded = result.uploaded && result.uploaded[0];
          if (!uploaded || !uploaded.relPath) throw new Error('Upload returned no path. Inspect the published root before retrying.');
          try {
            await imageApi('/api/image-hosting/library/rename?sandbox=' + encodeURIComponent(explorer.sandbox), 'POST', {
              sandbox: explorer.sandbox, relPath: uploaded.relPath,
              newRelPath: joinPath(explorer.path, file.name), onConflict: 'error'
            });
          } catch (error) {
            throw new Error('Uploaded as ' + uploaded.relPath + ' in the published root, but could not move it: ' + error.message + ' Inspect the root before retrying.');
          }
        }
      }
      await navigateExplorer(explorer.source, explorer.path, explorer.sandbox);
      setStatus('Files uploaded.', 'ok');
    });
  });
  byId('ihClear').addEventListener('click', function () { explorer.selected.clear(); renderExplorerItems(); });
  byId('ihSelectAll').addEventListener('click', function () {
    visibleItems().forEach(function (item) { explorer.selected.add(fileKey(item)); }); renderExplorerItems();
  });
  ['Move', 'Rename', 'Delete'].forEach(function (operation) {
    byId('ih' + operation).addEventListener('click', function () { runExplorer(function () { return mutateSelection(operation.toLowerCase()); }); });
  });
  byId('ihCopy').addEventListener('click', function () { runExplorer(async function () {
    await copyToClipboard(selectedItems().map(previewUrl).join('\n')); setStatus('CDN URLs copied.', 'ok');
  }); });
  byId('ihDownload').addEventListener('click', function () { runExplorer(async function () {
    for (var item of selectedItems()) await downloadUrl(previewUrl(item), item.name, false);
    setStatus('Selected files downloaded.', 'ok');
  }); });
  byId('ihRestore').addEventListener('click', function () {
    runExplorer(function () { return previewRestore(Array.from(explorer.selected)); });
  });
  window.addEventListener('aep-access-forced-logout', showSignIn);
  var statusHome = statusEl.parentNode;
  var statusAnchor = byId('imageHostingSignIn');
  var dialogStatusObserver = new MutationObserver(function () {
    var activeDialog = document.querySelector('dialog[open]');
    if (activeDialog) activeDialog.append(statusEl);
    else statusHome.insertBefore(statusEl, statusAnchor);
  });
  document.querySelectorAll('dialog').forEach(function (dialog) {
    dialogStatusObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });

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
    if (explorer && explorer.source === 'published' && explorer.sandbox && !byId('ihFiles').hidden) return explorer.sandbox;
    try {
      return (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandboxName()) || '';
    } catch (_e) { return ''; }
  }
  var sandboxAtPageLoad = getSandbox();
  var sandboxReloadPending = false;

  /** Keep aepGlobalSandboxName in sync with #sandboxSelect before reload (getSandboxName falls back to LS after reload). */
  function persistSandboxFromSelect() {
    var sel = document.getElementById('sandboxSelect');
    var v = sel && sel.value != null ? String(sel.value).trim() : '';
    try {
      if (v && window.AepGlobalSandbox && typeof window.AepGlobalSandbox.setSelected === 'function') {
        window.AepGlobalSandbox.setSelected(v);
      }
    } catch (_e) { /* ignore */ }
  }

  function refreshOrReloadForSandboxChange() {
    if (!explorer.signedIn) return;
    if (sandboxReloadPending) return;
    persistSandboxFromSelect();
    var current = window.AepGlobalSandbox?.getSandboxName() || '';
    if (current !== sandboxAtPageLoad) {
      sandboxReloadPending = true;
      setStatus('Sandbox changed. Reloading page…', 'warn');
      window.location.reload();
      return;
    }
    if (!byId('ihScrapes').hidden) runExplorer(refresh);
  }

  function setStatus(msg, cls) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.className = 'status' + (cls ? ' ' + cls : '');
  }

  async function fetchScrapes(sb) {
    var r = await fetch('/api/brand-scraper/scrapes' + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    var data = await r.json();
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    if (!Array.isArray(data.items)) throw new Error('The server did not return a scrape list.');
    return data.items;
  }

  async function fetchScrape(sb, scrapeId) {
    var response = await fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId) + (sb ? ('?sandbox=' + encodeURIComponent(sb)) : ''));
    var record = await response.json();
    if (!response.ok) throw new Error(record.error || 'Could not load scrape ' + scrapeId + ' (HTTP ' + response.status + ').');
    return record;
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
    var all = node('option', 'All categories'); all.value = '';
    categoryFilterEl.replaceChildren(all);
    cats.forEach(function (category) {
      var option = node('option', category); option.value = category;
      categoryFilterEl.append(option);
    });
    if (keep && cats.indexOf(keep) !== -1) categoryFilterEl.value = keep;
  }

  // ----- Library (curated per-sandbox assets) -----

  async function fetchLibrary(sb) {
    return readPages('/api/image-hosting/library?limit=100&sandbox=' + encodeURIComponent(sb));
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

  function preferredReplacementPath(items, img) {
    var category = String(img && img.classification && img.classification.category || '').toLowerCase();
    var patterns = category === 'logo'
      ? [/(^|\/)logo\.[a-z0-9]+$/i, /(^|\/)logo[-_.]/i]
      : (category === 'hero_banner'
        ? [/(^|\/)hero-banner\.[a-z0-9]+$/i, /(^|\/)hero[-_.]/i]
        : []);
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < items.length; i++) {
        if (patterns[p].test(items[i].relPath || '')) return items[i].relPath;
      }
    }
    return '';
  }

  function chooseReplacementTarget(sourceUrl, img, items) {
    var dlg = document.getElementById('imageHostingPublishTargetDialog');
    var sourcePreview = document.getElementById('imageHostingPublishTargetSourcePreview');
    var sourceLabel = document.getElementById('imageHostingPublishTargetSourceLabel');
    var targetSelect = document.getElementById('imageHostingPublishTargetSelect');
    var targetPreview = document.getElementById('imageHostingPublishTargetExistingPreview');
    var targetPath = document.getElementById('imageHostingPublishTargetPath');
    var confirmBtn = document.getElementById('imageHostingPublishTargetConfirm');
    var cancelBtn = document.getElementById('imageHostingPublishTargetCancel');
    if (!dlg || !targetSelect || !confirmBtn || !cancelBtn) return Promise.resolve(null);

    var assets = (items || []).filter(function (item) { return item && !item.isFolderMarker && item.relPath; })
      .sort(function (a, b) { return String(a.relPath).localeCompare(String(b.relPath)); });
    targetSelect.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = assets.length ? 'Choose an existing library file…' : 'No library files available';
    targetSelect.appendChild(placeholder);
    assets.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.relPath;
      option.textContent = item.relPath;
      targetSelect.appendChild(option);
    });

    if (sourcePreview) {
      sourcePreview.src = sourceUrl || '';
      sourcePreview.alt = 'Classified source image';
    }
    if (sourceLabel) {
      sourceLabel.textContent = (img && img.classification && img.classification.subject)
        || (img && img.alt)
        || 'Classified image';
    }

    function selectedItem() {
      var relPath = targetSelect.value;
      return assets.find(function (item) { return item.relPath === relPath; }) || null;
    }
    function updateTargetPreview() {
      var item = selectedItem();
      confirmBtn.disabled = !item;
      confirmBtn.textContent = item ? ('Replace ' + item.file) : 'Replace file';
      if (targetPath) {
        targetPath.textContent = item
          ? ('This overwrites ' + item.relPath + ' and keeps ' + absoluteCdnUrl(item.cdnUrl) + ' unchanged.')
          : 'Select the exact library file to overwrite.';
      }
      if (targetPreview) {
        targetPreview.src = item ? libraryCdnUrlForDisplay(item) : '';
        targetPreview.alt = item ? ('Current ' + item.relPath) : 'Current target image';
        targetPreview.hidden = !item;
      }
    }

    var preferred = preferredReplacementPath(assets, img);
    if (preferred) targetSelect.value = preferred;
    updateTargetPreview();

    return new Promise(function (resolve) {
      function close(result) {
        targetSelect.removeEventListener('change', updateTargetPreview);
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('cancel', onDialogCancel);
        if (dlg.open) { try { dlg.close(); } catch (_e) { dlg.removeAttribute('open'); } }
        resolve(result);
      }
      function onConfirm() { close(selectedItem()); }
      function onCancel() { close(null); }
      function onDialogCancel(e) { e.preventDefault(); close(null); }
      targetSelect.addEventListener('change', updateTargetPreview);
      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onDialogCancel);
      if (typeof dlg.showModal === 'function' && !dlg.open) {
        try { dlg.showModal(); } catch (_e) { dlg.setAttribute('open', ''); }
      } else if (!dlg.open) {
        dlg.setAttribute('open', '');
      }
    });
  }

  async function publishClassifiedAsReplacement(scrapeId, imageIndex, btn, img) {
    var sb = getSandbox();
    if (!sb || !scrapeId || imageIndex == null) return;
    var originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Loading files…'; }
    try {
      var items = await fetchLibrary(sb);
      var assets = (items || []).filter(function (item) { return !item.isFolderMarker; });
      if (!assets.length) {
        setStatus('The library is empty. Use Publish to library first, then choose a file to replace.', 'warn');
        return;
      }
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Replace file…'; }
      var target = await chooseReplacementTarget(imageUrl(img), img, assets);
      if (!target) return;

      if (btn) { btn.disabled = true; btn.textContent = 'Replacing…'; }
      var body = {
        sandbox: sb,
        scrapeId: scrapeId,
        imageIndex: imageIndex,
        replaceRelPath: target.relPath,
        confirmed: true,
      };
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
      var response = await fetch('/api/image-hosting/library/publish?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await response.json().catch(function () { return {}; });
      if (!response.ok) {
        setStatus('Replace failed: ' + (data.error || response.statusText || ('HTTP ' + response.status)), 'err');
        return;
      }
      setStatus('Replaced ' + target.relPath + '. Its stable CDN URL is unchanged.', 'ok');
      setManualMsg('Published the classified image over ' + target.relPath + ' — existing demos keep the same URL.', 'ok');
      await renderLibrary();
    } catch (e) {
      setStatus('Replace failed: ' + (e.message || e), 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || 'Replace file…'; }
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
      row.classList.add(fp && fp.includes('/') ? 'ih-folder-nested' : 'ih-folder-top');
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

  /**
   * Single-shot call to the rename endpoint with a chosen onConflict
   * mode. Returns { ok, status, data } so the caller can branch on
   * 409 (conflict) without throwing.
   */
  async function callRenameEndpoint(sb, relPath, newRelPath, onConflict) {
    var r = await fetch('/api/image-hosting/library/rename?sandbox=' + encodeURIComponent(sb), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox: sb, relPath: relPath, newRelPath: newRelPath, onConflict: onConflict }),
    });
    var data = {};
    try { data = await r.json(); } catch (_e) { /* non-JSON body */ }
    return { ok: r.ok, status: r.status, data: data };
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
      // First attempt: onConflict=error so we get a 409 with the
      // pre-computed suggestedVersionRelPath rather than silently
      // auto-suffixing (which would break downstream URL lookups —
      // exactly the bug the user reported).
      var first = await callRenameEndpoint(sb, relPath, newRelPath, 'error');

      if (first.status === 409 && first.data && first.data.code === 'TARGET_EXISTS') {
        var prompt = await promptForConflictResolution({
          conflictingRelPath: first.data.conflictingRelPath || newRelPath,
          suggestedVersionRelPath: first.data.suggestedVersionRelPath,
          contextLabel: '"' + parts.file + '"',
          allowApplyAll: false,
        });
        if (prompt.choice === 'cancel') {
          setManualMsg('Rename cancelled — "' + (first.data.conflictingRelPath || newRelPath) + '" already exists.', 'ok');
          return;
        }
        var second = await callRenameEndpoint(sb, relPath, newRelPath, prompt.choice);
        if (!second.ok) {
          setManualMsg('Rename failed: ' + ((second.data && second.data.error) || ('HTTP ' + second.status)), 'err');
          return;
        }
        var finalPath = (second.data && second.data.newRelPath) || newRelPath;
        delete selectedRelPaths[relPath];
        if (second.data && second.data.conflictResolved === 'replace') {
          setManualMsg('Replaced existing file — renamed to ' + finalPath + '.', 'ok');
        } else if (second.data && second.data.conflictResolved === 'version') {
          setManualMsg('Saved as new version — renamed to ' + finalPath + '.', 'ok');
        } else {
          setManualMsg('Renamed to ' + finalPath + '.', 'ok');
        }
        await renderLibrary();
        return;
      }

      if (!first.ok) {
        setManualMsg('Rename failed: ' + ((first.data && first.data.error) || ('HTTP ' + first.status)), 'err');
        return;
      }
      if (first.data && first.data.noop) {
        setManualMsg('Name unchanged.', 'ok');
        return;
      }
      delete selectedRelPaths[relPath];
      setManualMsg('Renamed to ' + ((first.data && first.data.newRelPath) || newRelPath) + '.', 'ok');
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
      || card.querySelector('.image-hosting-lib-card-img-wrap img')
      || card.querySelector('.ih-thumbnail');
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
    img.onerror = function () { img.classList.add('ih-preview-failed'); };
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
    openBtn.className = 'ih-legacy-open';
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
    replaceLabel.classList.add('ih-legacy-replace');
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
    setStatus(msg, cls);
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

  /**
   * One-shot POST to /upload for a single file with a chosen onConflict
   * mode. Returns the parsed body unchanged (caller inspects
   * `uploaded`, `errors`, `conflicts`). Throws only on transport-level
   * failures — application-level conflicts come back as 200 with a
   * non-empty `conflicts` array.
   */
  async function callUploadEndpoint(sb, file, opts, onConflict) {
    var base64 = await fileToBase64(file);
    var resp = await fetch('/api/image-hosting/library/upload?sandbox=' + encodeURIComponent(sb), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandbox: sb,
        files: [{ name: file.name, base64: base64, contentType: file.type || '' }],
        keepFilename: opts.keepFilename,
        convertToPng: opts.convertToPng,
        onConflict: onConflict,
      }),
    });
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok) {
      var err = new Error(data.error || ('HTTP ' + resp.status));
      err.httpStatus = resp.status;
      throw err;
    }
    return data;
  }

  /**
   * Upload a single file. If keep-filename is on and the target name is
   * already taken, prompts the user (Replace / Save as version /
   * Cancel) and retries once with their chosen mode. The optional
   * `batchCtx` lets a multi-file drop carry an "apply to all" choice
   * forward so the user only clicks once for an N-conflict batch.
   *
   * Returns: { uploaded: [...], errors: [...], cancelled: bool }
   */
  async function uploadOneFile(sb, file, batchCtx) {
    var opts = readUploadOptions();
    // Auto-classifier uploads have always auto-suffixed and we keep
    // that behaviour. For keep-filename we send 'error' so we get the
    // structured conflicts list back and can prompt.
    var initialMode = opts.keepFilename ? 'error' : 'version';
    if (batchCtx && batchCtx.appliedChoice) initialMode = batchCtx.appliedChoice;

    var data = await callUploadEndpoint(sb, file, opts, initialMode);
    var conflicts = (data && data.conflicts) || [];
    if (!conflicts.length) {
      return { uploaded: data.uploaded || [], errors: data.errors || [], cancelled: false };
    }

    // Single-file POST → 0 or 1 conflicts. Prompt and retry on the
    // user's choice. The "apply to all" toggle is only useful when
    // the parent batch has more than one file remaining.
    var conflict = conflicts[0];
    var prompt = await promptForConflictResolution({
      conflictingRelPath: conflict.conflictingRelPath,
      suggestedVersionRelPath: conflict.suggestedVersionRelPath,
      contextLabel: '"' + file.name + '"',
      allowApplyAll: !!(batchCtx && batchCtx.remaining > 1),
    });
    if (prompt.choice === 'cancel') {
      return { uploaded: [], errors: [], cancelled: true, conflictingRelPath: conflict.conflictingRelPath };
    }
    if (batchCtx && prompt.applyToAll) batchCtx.appliedChoice = prompt.choice;

    var retry = await callUploadEndpoint(sb, file, opts, prompt.choice);
    return {
      uploaded: retry.uploaded || [],
      errors: retry.errors || [],
      cancelled: false,
      conflictResolved: prompt.choice,
    };
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
    var totalCancelled = 0;
    var errors = [];
    // Shared state across the batch so "apply to all" survives between
    // files. Updated by uploadOneFile when the user ticks the checkbox.
    var batchCtx = { appliedChoice: null, remaining: list.length };
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      batchCtx.remaining = list.length - i;
      setManualMsg('Uploading ' + f.name + ' (' + (i + 1) + '/' + list.length + ')…');
      try {
        var result = await uploadOneFile(sb, f, batchCtx);
        if (result.cancelled) {
          totalCancelled += 1;
        } else {
          totalOk += (result.uploaded || []).length;
          (result.errors || []).forEach(function (e) { errors.push(e); });
        }
      } catch (e) {
        errors.push({ name: f.name, error: String(e.message || e) });
      }
    }
    if (drop) drop.classList.remove('is-busy');

    var summary = 'Added ' + totalOk + ' file(s).';
    if (totalCancelled) summary += ' Skipped ' + totalCancelled + ' (name in use, kept existing).';
    if (errors.length) {
      setManualMsg(
        summary + ' ' + errors.length + ' failed: ' +
        errors.map(function (e) { return e.name + ' (' + e.error + ')'; }).join(', '),
        totalOk ? 'warn' : 'err'
      );
    } else if (totalCancelled && !totalOk) {
      setManualMsg('Nothing added — cancelled ' + totalCancelled + ' name conflict(s).', 'ok');
    } else {
      setManualMsg(summary, 'ok');
    }
    if (totalOk) await renderLibrary();
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
    if (explorer) { renderPublishedExplorer(); return; }
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
      setStatus('Library load failed: ' + (e.message || e), 'err');
      if (explorer && explorer.source === 'published') {
        byId('ihItems').replaceChildren(node('p', 'Library could not be loaded. Select the sandbox again to retry.'));
      }
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
      if (explorer) renderPublishedExplorer();
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
      var url = '/api/brand-scraper/scrapes/classify?sandbox=' + encodeURIComponent(sb);
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
        p.className = 'ih-scrape-empty-note';
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
          thumb.classList.add('ih-preview-failed');
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

        var replaceBtn = document.createElement('button');
        replaceBtn.type = 'button';
        replaceBtn.className = 'image-hosting-card-replace';
        replaceBtn.textContent = 'Replace file…';
        replaceBtn.title = 'Choose an existing library file such as logo/logo.png and overwrite its bytes while keeping the same CDN URL.';
        replaceBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          publishClassifiedAsReplacement(rec.scrapeId, originalIndex, replaceBtn, img);
        });
        card.appendChild(replaceBtn);

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
    lastRecords = [];
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
      listEl.append(node('p', 'No brand scrapes in this sandbox. Start in Brand scraper, then return here to classify and publish images.', 'image-hosting-empty'));
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

  // === Backup-to-ZIP visual progress dialog ================================
  // Same shell as the restore dialog (reuses .image-hosting-restore-dialog
  // CSS) but with three stages: server build → browser download → saved.
  // Also fixes a silent-failure bug in the previous implementation:
  // calling URL.revokeObjectURL(blobUrl) immediately after a.click() breaks
  // the download in Chrome/Safari for blobs more than a few MB because the
  // browser hasn't actually started reading the blob bytes when the URL is
  // revoked. We now keep the anchor in the DOM and defer the revoke to 60s
  // after the click, and we surface the same blob via a manual "Re-download"
  // link inside the dialog as a fallback if the auto-trigger gets blocked.
  var BACKUP_STAGES = ['server', 'downloading', 'saved'];
  var backupDialogEl = null;
  var backupDialogStagesEl = null;
  var backupDialogStatusEl = null;
  var backupDialogActionsEl = null;
  var backupDialogFileEl = null;
  var backupDialogManualLinkEl = null;
  var backupDialogWired = false;

  function ensureBackupDialog() {
    if (backupDialogWired) return backupDialogEl;
    backupDialogEl = document.getElementById('imageHostingBackupDialog');
    if (!backupDialogEl) return null;
    backupDialogStagesEl = document.getElementById('imageHostingBackupStages');
    backupDialogStatusEl = document.getElementById('imageHostingBackupDialogStatus');
    backupDialogActionsEl = document.getElementById('imageHostingBackupDialogActions');
    backupDialogFileEl = document.getElementById('imageHostingBackupDialogFile');
    backupDialogManualLinkEl = document.getElementById('imageHostingBackupDialogManualLink');
    var closeBtn = document.getElementById('imageHostingBackupDialogClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        if (backupDialogEl && backupDialogEl.open) {
          try { backupDialogEl.close(); } catch (_e) { backupDialogEl.removeAttribute('open'); }
        }
      });
    }
    backupDialogWired = true;
    return backupDialogEl;
  }

  function openBackupDialog(fileName) {
    var dlg = ensureBackupDialog();
    if (!dlg) return;
    if (backupDialogFileEl) backupDialogFileEl.textContent = fileName ? ('Target: ' + fileName) : '';
    if (backupDialogStatusEl) backupDialogStatusEl.textContent = '';
    if (backupDialogActionsEl) backupDialogActionsEl.hidden = true;
    if (backupDialogManualLinkEl) {
      backupDialogManualLinkEl.hidden = true;
      backupDialogManualLinkEl.removeAttribute('href');
      backupDialogManualLinkEl.removeAttribute('download');
    }
    dlg.classList.remove('is-error', 'is-done');
    if (backupDialogStagesEl) {
      Array.prototype.forEach.call(backupDialogStagesEl.querySelectorAll('li'), function (li) {
        li.classList.remove('is-active', 'is-done', 'is-error');
      });
    }
    if (typeof dlg.showModal === 'function' && !dlg.open) {
      try { dlg.showModal(); } catch (_e) { dlg.setAttribute('open', ''); }
    } else if (!dlg.open) {
      dlg.setAttribute('open', '');
    }
  }

  function setBackupStage(stage, message) {
    ensureBackupDialog();
    if (!backupDialogStagesEl) return;
    var idx = BACKUP_STAGES.indexOf(stage);
    Array.prototype.forEach.call(backupDialogStagesEl.querySelectorAll('li'), function (li) {
      var st = li.getAttribute('data-stage');
      var i = BACKUP_STAGES.indexOf(st);
      li.classList.remove('is-active', 'is-done', 'is-error');
      if (i >= 0 && idx >= 0 && i < idx) li.classList.add('is-done');
      else if (i === idx) li.classList.add('is-active');
    });
    if (backupDialogStatusEl && message != null) backupDialogStatusEl.textContent = message;
    if (backupDialogEl) backupDialogEl.classList.remove('is-error', 'is-done');
    if (backupDialogActionsEl) backupDialogActionsEl.hidden = true;
  }

  function markBackupError(message) {
    ensureBackupDialog();
    if (!backupDialogStagesEl) return;
    Array.prototype.forEach.call(backupDialogStagesEl.querySelectorAll('li.is-active'), function (li) {
      li.classList.remove('is-active');
      li.classList.add('is-error');
    });
    if (backupDialogEl) backupDialogEl.classList.add('is-error');
    if (backupDialogStatusEl) backupDialogStatusEl.textContent = message || 'Backup failed.';
    if (backupDialogActionsEl) backupDialogActionsEl.hidden = false;
  }

  function markBackupDone(message, blobUrl, fileName) {
    ensureBackupDialog();
    if (!backupDialogStagesEl) return;
    Array.prototype.forEach.call(backupDialogStagesEl.querySelectorAll('li'), function (li) {
      li.classList.remove('is-active', 'is-error');
      li.classList.add('is-done');
    });
    if (backupDialogEl) backupDialogEl.classList.add('is-done');
    if (backupDialogStatusEl) backupDialogStatusEl.textContent = message || 'Done.';
    if (backupDialogManualLinkEl && blobUrl && fileName) {
      backupDialogManualLinkEl.href = blobUrl;
      backupDialogManualLinkEl.download = fileName;
      backupDialogManualLinkEl.textContent = 'Re-download ' + fileName;
      backupDialogManualLinkEl.hidden = false;
    }
    if (backupDialogActionsEl) backupDialogActionsEl.hidden = false;
  }

  function formatBytesShort(n) {
    if (n == null || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /** IndexedDB name for File System Access handles (Chromium save-folder memory). */
  var IDB_BACKUP_PREFS = 'aepImageHostingBackupPrefs';
  var IDB_BACKUP_STORE = 'handles';
  var IDB_LAST_BACKUP_FILE_KEY = 'lastBackupZipFileHandle';

  function openBackupPrefsIdb() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(IDB_BACKUP_PREFS, 1);
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains(IDB_BACKUP_STORE)) {
          db.createObjectStore(IDB_BACKUP_STORE);
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
    });
  }

  function idbPutHandle(key, handle) {
    return openBackupPrefsIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_BACKUP_STORE, 'readwrite');
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(IDB_BACKUP_STORE).put(handle, key);
      });
    });
  }

  function idbGetHandle(key) {
    return openBackupPrefsIdb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(IDB_BACKUP_STORE, 'readonly');
        var r = tx.objectStore(IDB_BACKUP_STORE).get(key);
        r.onsuccess = function () { resolve(r.result || null); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  /**
   * Restore a handle from IDB for use as showSaveFilePicker({ startIn }).
   * Readonly is enough to hint the parent folder for the next save dialog.
   */
  async function backupPrefsEnsureStartInHandle(handle) {
    if (!handle || typeof handle.queryPermission !== 'function') return handle || null;
    try {
      var ro = { mode: 'readonly' };
      var st = await handle.queryPermission(ro);
      if (st !== 'granted' && typeof handle.requestPermission === 'function') {
        st = await handle.requestPermission(ro);
      }
      return st === 'granted' ? handle : null;
    } catch (_e) {
      return null;
    }
  }

  /**
   * Chromium / Edge: native save dialog + remember last folder via IndexedDB
   * (last FileSystemFileHandle as startIn). Falls back to anchor download.
   * @returns {Promise<'picker'|'anchor'|'aborted'>}
   */
  async function trySaveBackupZipViaFilePicker(blob, fileName) {
    if (typeof window.showSaveFilePicker !== 'function') return 'anchor';
    var startIn = null;
    try {
      var prev = await idbGetHandle(IDB_LAST_BACKUP_FILE_KEY);
      if (prev) startIn = await backupPrefsEnsureStartInHandle(prev);
    } catch (_e) { startIn = null; }

    var pickOpts = {
      suggestedName: fileName,
      types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
    };
    if (startIn) pickOpts.startIn = startIn;

    var fileHandle;
    try {
      fileHandle = await window.showSaveFilePicker(pickOpts);
    } catch (e) {
      if (e && e.name === 'AbortError') return 'aborted';
      console.warn('[image-hosting] showSaveFilePicker:', e);
      return 'anchor';
    }

    try {
      var writable = await fileHandle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      console.warn('[image-hosting] backup write failed:', e);
      return 'anchor';
    }

    try {
      await idbPutHandle(IDB_LAST_BACKUP_FILE_KEY, fileHandle);
    } catch (_e) { /* best-effort */ }

    return 'picker';
  }

  /** Non-empty customer names: letters, numbers, hyphens only (matches prior prompt copy). */
  var BACKUP_CUSTOMER_NAME_RE = /^[a-zA-Z0-9-]+$/;

  var backupCustomerDlgEl = null;
  var backupCustomerDlgWired = false;
  var backupCustomerInputEl = null;
  var backupCustomerErrorEl = null;
  var backupCustomerContinueBtn = null;
  var backupCustomerCancelBtn = null;

  function ensureBackupCustomerDialog() {
    if (backupCustomerDlgWired) return backupCustomerDlgEl;
    backupCustomerDlgEl = document.getElementById('imageHostingBackupCustomerDialog');
    backupCustomerInputEl = document.getElementById('imageHostingBackupCustomerInput');
    backupCustomerErrorEl = document.getElementById('imageHostingBackupCustomerError');
    backupCustomerContinueBtn = document.getElementById('imageHostingBackupCustomerContinue');
    backupCustomerCancelBtn = document.getElementById('imageHostingBackupCustomerCancel');
    backupCustomerDlgWired = true;
    return backupCustomerDlgEl;
  }

  function setBackupCustomerFieldError(message) {
    if (!backupCustomerErrorEl) return;
    if (message) {
      backupCustomerErrorEl.textContent = message;
      backupCustomerErrorEl.hidden = false;
      if (backupCustomerInputEl) backupCustomerInputEl.setAttribute('aria-invalid', 'true');
    } else {
      backupCustomerErrorEl.textContent = '';
      backupCustomerErrorEl.hidden = true;
      if (backupCustomerInputEl) backupCustomerInputEl.setAttribute('aria-invalid', 'false');
    }
  }

  /**
   * @param {string} defaultCustomer
   * @returns {Promise<string|null>} trimmed value (empty allowed → caller uses sandbox); null if cancelled
   */
  function promptBackupCustomerName(defaultCustomer) {
    var dlg = ensureBackupCustomerDialog();
    if (!dlg || !backupCustomerInputEl) {
      try { setStatus('Cannot open backup name dialog — refresh the page.', 'err'); } catch (_e) {}
      return Promise.resolve(null);
    }

    return new Promise(function (resolve) {
      function cleanup() {
        if (backupCustomerContinueBtn) backupCustomerContinueBtn.removeEventListener('click', onContinue);
        if (backupCustomerCancelBtn) backupCustomerCancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('cancel', onDialogCancel);
        if (backupCustomerInputEl) backupCustomerInputEl.removeEventListener('keydown', onInputKeydown);
      }
      function closeDialog() {
        if (dlg.open) {
          try { dlg.close(); } catch (_e) { dlg.removeAttribute('open'); }
        }
      }
      function finish(value) {
        cleanup();
        closeDialog();
        resolve(value);
      }
      function onCancel() {
        finish(null);
      }
      function onDialogCancel(e) {
        e.preventDefault();
        finish(null);
      }
      function onContinue() {
        var raw = backupCustomerInputEl ? String(backupCustomerInputEl.value || '') : '';
        var v = raw.trim();
        if (v && !BACKUP_CUSTOMER_NAME_RE.test(v)) {
          setBackupCustomerFieldError('Use only letters, numbers, and hyphens.');
          if (backupCustomerInputEl) backupCustomerInputEl.focus();
          return;
        }
        setBackupCustomerFieldError('');
        finish(v);
      }
      function onInputKeydown(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onContinue();
        }
      }

      setBackupCustomerFieldError('');
      backupCustomerInputEl.value = defaultCustomer || '';
      if (backupCustomerContinueBtn) backupCustomerContinueBtn.addEventListener('click', onContinue);
      if (backupCustomerCancelBtn) backupCustomerCancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onDialogCancel);
      backupCustomerInputEl.addEventListener('keydown', onInputKeydown);

      if (typeof dlg.showModal === 'function' && !dlg.open) {
        try { dlg.showModal(); } catch (_e) { dlg.setAttribute('open', ''); }
      } else if (!dlg.open) {
        dlg.setAttribute('open', '');
      }
      setTimeout(function () {
        if (backupCustomerInputEl) {
          backupCustomerInputEl.focus();
          try { backupCustomerInputEl.select(); } catch (_e2) {}
        }
      }, 0);
    });
  }

  async function downloadLibrary() {
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'err'); return; }
    var defaultCustomer = '';
    try {
      defaultCustomer = localStorage.getItem('imageHostingBackupCustomer') || '';
    } catch (_e) { defaultCustomer = ''; }
    var customer = await promptBackupCustomerName(defaultCustomer);
    if (customer == null) return;
    customer = String(customer).trim();
    if (!customer) customer = sb;
    try { localStorage.setItem('imageHostingBackupCustomer', customer); } catch (_e) {}
    var safe = customer.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'library';
    var fileName = 'logo_' + safe + '.zip';
    var url = '/api/image-hosting/library/download?sandbox=' + encodeURIComponent(sb) + '&customer=' + encodeURIComponent(customer);

    openBackupDialog(fileName);
    setBackupStage('server', 'Server is building the ZIP from your library — this can take a few seconds for large libraries…');
    setStatus('Preparing ' + fileName + '…');

    var slowTimer = setTimeout(function () {
      if (backupDialogStatusEl && backupDialogEl && !backupDialogEl.classList.contains('is-done') && !backupDialogEl.classList.contains('is-error')) {
        backupDialogStatusEl.textContent = 'Still working — large libraries can take 10–30 seconds…';
      }
    }, 10000);

    var blobUrl = null;
    var anchorEl = null;
    try {
      var download = await imageApi(url);
      var resp = await window.fetch(signedDownloadUrl(download.url), { credentials: 'omit', cache: 'no-store' });
      if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }

      if (!resp.ok) {
        var bodyText = '';
        try { bodyText = await resp.text(); } catch (_e) {}
        var parsedErr = null;
        if (bodyText) {
          try { parsedErr = JSON.parse(bodyText); } catch (_e) {}
        }
        var detail = (parsedErr && parsedErr.error)
          || resp.statusText // empty over HTTP/2 (Cloud Functions / Hosting)
          || (bodyText && bodyText.length < 240 ? bodyText : '')
          || ('server returned HTTP ' + resp.status + ' with no body — likely the assembled ZIP exceeded Cloud Run\'s 32 MiB response cap; check Cloud Functions logs for "Response size was too large".');
        var msg = 'Download failed: ' + detail;
        markBackupError(msg);
        setStatus(msg, 'err');
        return;
      }

      // Large libraries blow Cloud Run's 32 MiB response cap. The server
      // detects that, uploads the ZIP to GCS, and returns a JSON
      // redirect document with a short-lived V4 signed URL. We follow
      // that URL via a synthetic anchor click — the GCS object has
      // attachment Content-Disposition so it lands in the browser's
      // Downloads folder with the right filename, and we never have to
      // pull the bytes through the function.
      var contentType = (resp.headers.get('content-type') || '').toLowerCase();
      if (contentType.indexOf('application/json') !== -1) {
        var redirectBody = await resp.json().catch(function () { return null; });
        if (redirectBody && redirectBody.mode === 'redirect' && redirectBody.downloadUrl) {
          setBackupStage('downloading', 'Library exceeded the inline response limit — handing off a signed URL from cloud storage…');
          var redirAnchor = document.createElement('a');
          redirAnchor.href = redirectBody.downloadUrl;
          if (redirectBody.fileName) redirAnchor.download = redirectBody.fileName;
          redirAnchor.rel = 'noopener';
          redirAnchor.target = '_self';
          redirAnchor.hidden = true;
          document.body.appendChild(redirAnchor);
          redirAnchor.click();
          var redirSize = formatBytesShort(redirectBody.size);
          var redirName = redirectBody.fileName || fileName;
          var redirMsg = 'Saved ' + redirName + (redirSize ? ' (' + redirSize + ')' : '') + ' via signed URL — too large to stream inline. Signed URL valid for ~15 min.';
          // Use the same dialog "done" affordance, but point Re-download
          // at the signed URL so the user can retry without rebuilding.
          markBackupDone(redirMsg, redirectBody.downloadUrl, redirName);
          setStatus('Downloaded ' + redirName + ' via signed URL.', 'ok');
          // Defer cleanup of the anchor so Safari/Chrome have time to
          // honour the click — symmetric with the inline path.
          var redirCapturedAnchor = redirAnchor;
          setTimeout(function () {
            if (redirCapturedAnchor && redirCapturedAnchor.parentNode) {
              redirCapturedAnchor.parentNode.removeChild(redirCapturedAnchor);
            }
          }, 60000);
          return;
        }
        var jsonMsg = 'Download failed: server returned JSON (' + (redirectBody && redirectBody.error || 'unrecognised payload') + ') instead of a ZIP.';
        markBackupError(jsonMsg);
        setStatus(jsonMsg, 'err');
        return;
      }

      setBackupStage('downloading', 'Server finished — receiving the ZIP bytes from the browser…');

      var blob = await resp.blob();

      // Sanity-check the bytes are actually a ZIP. The server fix landed in
      // a previous deploy, but if any cache in front of the function ever
      // misbehaves we'd rather surface a loud error here than silently save
      // a bogus .zip into the user's Downloads folder.
      var head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      var isZip = head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b;
      if (!isZip) {
        var errText = '';
        try { errText = await blob.text(); } catch (_e) {}
        var ct = resp.headers.get('content-type') || 'unknown';
        var nonZipMsg = 'Server returned a ' + ct + ' response, not a ZIP. Try again or report this if it persists.';
        markBackupError(nonZipMsg);
        setStatus(nonZipMsg, 'err');
        if (errText && errText.length < 400) console.warn('[image-hosting] download non-zip body:', errText.slice(0, 400));
        return;
      }

      blobUrl = URL.createObjectURL(blob);

      var pickerOutcome = await trySaveBackupZipViaFilePicker(blob, fileName);
      if (pickerOutcome === 'aborted') {
        markBackupDone('Save cancelled — no file was written. Use Re-download to save with the browser default.', blobUrl, fileName);
        setStatus('Backup save cancelled.', '');
        var capturedUrlAbort = blobUrl;
        setTimeout(function () {
          try { URL.revokeObjectURL(capturedUrlAbort); } catch (_e) {}
        }, 60000);
        return;
      }

      if (pickerOutcome === 'picker') {
        var sizeStrPick = formatBytesShort(blob.size);
        var doneMsgPick = 'Saved ' + fileName + ' (' + sizeStrPick + ') to the folder you chose (remembered for next time in this browser).';
        markBackupDone(doneMsgPick, blobUrl, fileName);
        setStatus('Saved ' + fileName + ' (' + sizeStrPick + ').', 'ok');
        var capturedUrlPick = blobUrl;
        setTimeout(function () {
          try { URL.revokeObjectURL(capturedUrlPick); } catch (_e) {}
        }, 60000);
        return;
      }

      // Trigger the browser download (Safari / Firefox / picker failure).
      // Two reliability fixes vs the previous implementation:
      //   1. Anchor stays in the DOM (some browsers cancel the download
      //      if the anchor element is removed before the click event has
      //      finished propagating).
      //   2. URL.revokeObjectURL is deferred to 60s after the click so the
      //      browser has plenty of time to actually read the blob bytes —
      //      revoking immediately is the most common cause of "I clicked
      //      Backup, gave it a name, and nothing happened".
      anchorEl = document.createElement('a');
      anchorEl.href = blobUrl;
      anchorEl.download = fileName;
      anchorEl.rel = 'noopener';
      anchorEl.hidden = true;
      document.body.appendChild(anchorEl);
      anchorEl.click();

      var sizeStr = formatBytesShort(blob.size);
      var doneMsg = 'Saved ' + fileName + ' (' + sizeStr + ') to your Downloads folder.';
      markBackupDone(doneMsg, blobUrl, fileName);
      setStatus('Downloaded ' + fileName + ' (' + sizeStr + ').', 'ok');

      // Defer cleanup so Safari/Chrome have time to commit the download.
      // 60s is comfortable; we tear down on the next backup or on dialog
      // close anyway.
      var capturedUrl = blobUrl;
      var capturedAnchor = anchorEl;
      setTimeout(function () {
        try { URL.revokeObjectURL(capturedUrl); } catch (_e) {}
        if (capturedAnchor && capturedAnchor.parentNode) {
          capturedAnchor.parentNode.removeChild(capturedAnchor);
        }
      }, 60000);
    } catch (e) {
      if (slowTimer) clearTimeout(slowTimer);
      // Best-effort cleanup if we made it as far as creating the blob URL.
      if (blobUrl) {
        var stale = blobUrl;
        setTimeout(function () { try { URL.revokeObjectURL(stale); } catch (_e2) {} }, 60000);
      }
      var net = 'Download failed: ' + (e.message || e);
      markBackupError(net);
      setStatus(net, 'err');
    }
  }

  // === Restore-from-ZIP visual progress dialog =============================
  // The restore flow is destructive (delete library, then re-upload from ZIP)
  // and can take several seconds. Without feedback the user sees a frozen
  // page. The dialog walks through four stages (read → upload → server
  // delete+write → reload) and at the end forces a hard page reload with a
  // ?restored=<ts> query param so the new /cdn/ URLs come back fresh from
  // any HTTP caches in front of the page.
  // ------------------------------------------------------------------
  // Filename-conflict modal (rename + keep-filename upload)
  // ------------------------------------------------------------------
  // Shown when the backend returns 409 TARGET_EXISTS or a batch upload
  // response carries a non-empty `conflicts` array. Asks the user to
  // pick: replace the existing file, save as a numbered version (the
  // backend already computed the next free <name>-N.<ext>), or cancel.
  // For batch uploads the dialog also offers an "apply to all" option
  // so the user doesn't have to click through every single conflict.
  // Returns a Promise<{ choice: 'replace'|'version'|'cancel', applyToAll: boolean }>.
  var conflictDlgEl = null;
  var conflictDlgWired = false;
  var conflictDlgDescEl = null;
  var conflictDlgPathEl = null;
  var conflictDlgApplyAllWrapEl = null;
  var conflictDlgApplyAllEl = null;
  var conflictDlgReplaceBtn = null;
  var conflictDlgVersionBtn = null;
  var conflictDlgCancelBtn = null;

  function ensureConflictDialog() {
    if (conflictDlgWired) return conflictDlgEl;
    conflictDlgEl = document.getElementById('imageHostingConflictDialog');
    if (!conflictDlgEl) return null;
    conflictDlgDescEl = document.getElementById('imageHostingConflictDialogDesc');
    conflictDlgPathEl = document.getElementById('imageHostingConflictDialogPath');
    conflictDlgApplyAllWrapEl = document.getElementById('imageHostingConflictDialogApplyAllWrap');
    conflictDlgApplyAllEl = document.getElementById('imageHostingConflictDialogApplyAll');
    conflictDlgReplaceBtn = document.getElementById('imageHostingConflictDialogReplace');
    conflictDlgVersionBtn = document.getElementById('imageHostingConflictDialogVersion');
    conflictDlgCancelBtn = document.getElementById('imageHostingConflictDialogCancel');
    conflictDlgWired = true;
    return conflictDlgEl;
  }

  function promptForConflictResolution(opts) {
    var dlg = ensureConflictDialog();
    if (!dlg) {
      // Dialog markup missing — fall back to confirm() so the page is
      // still usable. confirm() can only ask yes/no, so we map "OK" to
      // 'replace' and "Cancel" to 'cancel'. Better than silently
      // failing the rename / upload.
      try {
        var msg = (opts && opts.message)
          || ('A file already exists at "' + (opts && opts.conflictingRelPath) + '".\nClick OK to replace, Cancel to skip.');
        return Promise.resolve({ choice: window.confirm(msg) ? 'replace' : 'cancel', applyToAll: false });
      } catch (_e) {
        return Promise.resolve({ choice: 'cancel', applyToAll: false });
      }
    }

    var conflicting = (opts && opts.conflictingRelPath) || '';
    var suggested  = (opts && opts.suggestedVersionRelPath) || '';
    var allowApplyAll = !!(opts && opts.allowApplyAll);
    var contextLabel = (opts && opts.contextLabel) || 'this file';

    if (conflictDlgDescEl) {
      conflictDlgDescEl.innerHTML = ''; // clear
      var p1 = document.createTextNode('Renaming ' + contextLabel + ' would overwrite an existing file. Choose what to do:');
      conflictDlgDescEl.appendChild(p1);
      var ul = document.createElement('ul');
      ul.className = 'ih-restore-file-list';
      var li1 = document.createElement('li');
      var b1 = document.createElement('strong'); b1.textContent = 'Replace existing'; li1.appendChild(b1);
      li1.appendChild(document.createTextNode(' — overwrite the bytes at ' + conflicting + ' (URL stays exactly the same).'));
      var li2 = document.createElement('li');
      var b2 = document.createElement('strong'); b2.textContent = 'Save as new version'; li2.appendChild(b2);
      li2.appendChild(document.createTextNode(' — save as ' + (suggested || (conflicting + '-1')) + ' (existing file is kept untouched).'));
      var li3 = document.createElement('li');
      var b3 = document.createElement('strong'); b3.textContent = 'Cancel'; li3.appendChild(b3);
      li3.appendChild(document.createTextNode(' — leave everything as it is.'));
      ul.appendChild(li1); ul.appendChild(li2); ul.appendChild(li3);
      conflictDlgDescEl.appendChild(ul);
    }
    if (conflictDlgPathEl) conflictDlgPathEl.textContent = conflicting ? ('Conflict at: ' + conflicting) : '';
    if (conflictDlgVersionBtn && suggested) conflictDlgVersionBtn.textContent = 'Save as ' + suggested;
    else if (conflictDlgVersionBtn) conflictDlgVersionBtn.textContent = 'Save as new version';
    if (conflictDlgApplyAllWrapEl) conflictDlgApplyAllWrapEl.hidden = !allowApplyAll;
    if (conflictDlgApplyAllEl) conflictDlgApplyAllEl.checked = false;

    return new Promise(function (resolve) {
      function done(choice) {
        var applyToAll = !!(allowApplyAll && conflictDlgApplyAllEl && conflictDlgApplyAllEl.checked);
        // Detach handlers so the same dialog can be reused for the next
        // conflict in the batch without stacking listeners.
        if (conflictDlgReplaceBtn) conflictDlgReplaceBtn.removeEventListener('click', onReplace);
        if (conflictDlgVersionBtn) conflictDlgVersionBtn.removeEventListener('click', onVersion);
        if (conflictDlgCancelBtn)  conflictDlgCancelBtn.removeEventListener('click', onCancel);
        dlg.removeEventListener('cancel', onEscape);
        if (dlg.open) { try { dlg.close(); } catch (_e) { dlg.removeAttribute('open'); } }
        resolve({ choice: choice, applyToAll: applyToAll });
      }
      function onReplace() { done('replace'); }
      function onVersion() { done('version'); }
      function onCancel()  { done('cancel'); }
      function onEscape(e) { e.preventDefault(); done('cancel'); }

      if (conflictDlgReplaceBtn) conflictDlgReplaceBtn.addEventListener('click', onReplace);
      if (conflictDlgVersionBtn) conflictDlgVersionBtn.addEventListener('click', onVersion);
      if (conflictDlgCancelBtn)  conflictDlgCancelBtn.addEventListener('click', onCancel);
      dlg.addEventListener('cancel', onEscape);

      if (typeof dlg.showModal === 'function' && !dlg.open) {
        try { dlg.showModal(); } catch (_e) { dlg.setAttribute('open', ''); }
      } else if (!dlg.open) {
        dlg.setAttribute('open', '');
      }
    });
  }

  var RESTORE_STAGES = ['reading', 'uploading', 'processing', 'reloading'];
  var restoreDialogEl = null;
  var restoreDialogStagesEl = null;
  var restoreDialogStatusEl = null;
  var restoreDialogActionsEl = null;
  var restoreDialogFileEl = null;
  var restoreDialogCloseBtn = null;
  var restoreDialogWired = false;

  function ensureRestoreDialog() {
    if (restoreDialogWired) return restoreDialogEl;
    restoreDialogEl = document.getElementById('imageHostingRestoreDialog');
    if (!restoreDialogEl) return null;
    restoreDialogStagesEl = document.getElementById('imageHostingRestoreStages');
    restoreDialogStatusEl = document.getElementById('imageHostingRestoreDialogStatus');
    restoreDialogActionsEl = document.getElementById('imageHostingRestoreDialogActions');
    restoreDialogFileEl = document.getElementById('imageHostingRestoreDialogFile');
    restoreDialogCloseBtn = document.getElementById('imageHostingRestoreDialogClose');
    if (restoreDialogCloseBtn) {
      restoreDialogCloseBtn.addEventListener('click', function () {
        if (restoreDialogEl && restoreDialogEl.open) {
          try { restoreDialogEl.close(); } catch (_e) { restoreDialogEl.removeAttribute('open'); }
        }
      });
    }
    restoreDialogWired = true;
    return restoreDialogEl;
  }

  function openRestoreDialog(fileName) {
    var dlg = ensureRestoreDialog();
    if (!dlg) return;
    if (restoreDialogFileEl) restoreDialogFileEl.textContent = fileName ? ('Source: ' + fileName) : '';
    if (restoreDialogStatusEl) restoreDialogStatusEl.textContent = '';
    if (restoreDialogActionsEl) restoreDialogActionsEl.hidden = true;
    dlg.classList.remove('is-error', 'is-done');
    if (restoreDialogStagesEl) {
      Array.prototype.forEach.call(restoreDialogStagesEl.querySelectorAll('li'), function (li) {
        li.classList.remove('is-active', 'is-done', 'is-error');
      });
    }
    if (typeof dlg.showModal === 'function' && !dlg.open) {
      try { dlg.showModal(); } catch (_e) { dlg.setAttribute('open', ''); }
    } else if (!dlg.open) {
      dlg.setAttribute('open', '');
    }
  }

  function setRestoreStage(stage, message) {
    ensureRestoreDialog();
    if (!restoreDialogStagesEl) return;
    var idx = RESTORE_STAGES.indexOf(stage);
    Array.prototype.forEach.call(restoreDialogStagesEl.querySelectorAll('li'), function (li) {
      var st = li.getAttribute('data-stage');
      var i = RESTORE_STAGES.indexOf(st);
      li.classList.remove('is-active', 'is-done', 'is-error');
      if (i >= 0 && idx >= 0 && i < idx) li.classList.add('is-done');
      else if (i === idx) li.classList.add('is-active');
    });
    if (restoreDialogStatusEl && message != null) restoreDialogStatusEl.textContent = message;
    if (restoreDialogEl) restoreDialogEl.classList.remove('is-error', 'is-done');
    if (restoreDialogActionsEl) restoreDialogActionsEl.hidden = true;
  }

  function markRestoreError(message) {
    ensureRestoreDialog();
    if (!restoreDialogStagesEl) return;
    Array.prototype.forEach.call(restoreDialogStagesEl.querySelectorAll('li.is-active'), function (li) {
      li.classList.remove('is-active');
      li.classList.add('is-error');
    });
    if (restoreDialogEl) restoreDialogEl.classList.add('is-error');
    if (restoreDialogStatusEl) restoreDialogStatusEl.textContent = message || 'Restore failed.';
    if (restoreDialogActionsEl) restoreDialogActionsEl.hidden = false;
  }

  function markRestoreDone(message) {
    ensureRestoreDialog();
    if (!restoreDialogStagesEl) return;
    Array.prototype.forEach.call(restoreDialogStagesEl.querySelectorAll('li'), function (li) {
      li.classList.remove('is-active', 'is-error');
      li.classList.add('is-done');
    });
    if (restoreDialogEl) restoreDialogEl.classList.add('is-done');
    if (restoreDialogStatusEl) restoreDialogStatusEl.textContent = message || 'Done.';
  }

  function formatBytesShort(n) {
    if (n == null || isNaN(n)) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function reloadWithCacheBust() {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('restored', String(Date.now()));
      window.location.replace(url.toString());
    } catch (_e) {
      window.location.reload();
    }
  }

  async function restoreLibraryFromFile(file) {
    var sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'err'); return; }
    if (!file) return;
    if (!confirm(
      'Replace this sandbox\'s library with the contents of "' + file.name + '"?\n\n' +
      'All current library files will be deleted first, then replaced with the files from the ZIP. ' +
      'When the restore completes the page will reload so the new images appear without browser caching.'
    )) return;

    openRestoreDialog(file.name);
    setRestoreStage('reading', 'Reading ZIP file (' + formatBytesShort(file.size) + ')…');
    setStatus('Restoring from ' + file.name + '…');

    var processingTimer = null;
    var slowTimer = null;
    try {
      var base64 = await fileToBase64(file);
      setRestoreStage('uploading', 'Uploading ZIP to server…');

      var fetchPromise = fetch('/api/image-hosting/library/restore?sandbox=' + encodeURIComponent(sb), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, zipBase64: base64, replace: true }),
      });

      // The fetch covers both the upload AND the server-side delete+write
      // phase. We don't get real upload-progress from fetch(), so jump to
      // the "processing" stage after a short grace period so the user sees
      // movement instead of a spinner that looks stuck on "uploading".
      processingTimer = setTimeout(function () {
        setRestoreStage('processing', 'Server is deleting old library files and writing fresh ones from the ZIP…');
        slowTimer = setTimeout(function () {
          if (restoreDialogStatusEl) {
            restoreDialogStatusEl.textContent = 'Still working — large libraries can take 10–30 seconds…';
          }
        }, 10000);
      }, 1500);

      var resp;
      try { resp = await fetchPromise; }
      finally {
        if (processingTimer) { clearTimeout(processingTimer); processingTimer = null; }
        if (slowTimer) { clearTimeout(slowTimer); slowTimer = null; }
      }

      // Read body as text first so we can surface SOMETHING useful even
      // when the response is a Cloud Run / Hosting platform error page
      // (HTML, not JSON). Under HTTP/2 resp.statusText is always empty,
      // so the previous "(data.error || resp.statusText)" template was
      // silently rendering "Restore failed:" with no detail when the
      // platform itself rejected the request — making it impossible to
      // tell whether we hit a 413 body-size cap, a 502 cold-start, or a
      // 500 from inside the function. Always include status + body
      // snippet so there is no such thing as an empty error any more.
      var rawBody = '';
      var data = {};
      try { rawBody = await resp.text(); } catch (_e) { /* ignore */ }
      if (rawBody) { try { data = JSON.parse(rawBody); } catch (_e) { /* not JSON */ } }
      if (!resp.ok) {
        var detail = data.error
          || (rawBody ? String(rawBody).slice(0, 240) : '')
          || resp.statusText
          || '(no response body)';
        var contentType = (resp.headers && resp.headers.get && resp.headers.get('content-type')) || '';
        var errMsg = 'Restore failed (HTTP ' + resp.status + '): ' + detail;
        try {
          // Full diagnostic dump in DevTools console for the operator —
          // far more detail than is sane to render in the dialog.
          console.error('[restoreLibraryFromFile] failed', {
            httpStatus: resp.status,
            httpStatusText: resp.statusText,
            contentType: contentType,
            bodyLength: rawBody ? rawBody.length : 0,
            bodySnippet: rawBody ? rawBody.slice(0, 1024) : '',
            sandbox: sb,
            file: { name: file.name, size: file.size },
          });
        } catch (_e) { /* ignore */ }
        markRestoreError(errMsg);
        setStatus(errMsg, 'err');
        return;
      }

      var n = data.restored || 0;
      var okMsg = 'Restored ' + n + ' file(s) from ' + file.name + '.';
      setRestoreStage('reloading', okMsg + ' Reloading the page so the new images appear without browser caching…');
      setStatus(okMsg + ' Reloading…', 'ok');

      // Brief pause so the green "done" state on every stage is visible
      // before the page navigates away. ~900ms is short enough that the
      // user doesn't wait, long enough to register the success.
      setTimeout(function () {
        markRestoreDone('Restored ' + n + ' file(s). Reloading…');
        setTimeout(reloadWithCacheBust, 600);
      }, 300);
    } catch (e) {
      if (processingTimer) clearTimeout(processingTimer);
      if (slowTimer) clearTimeout(slowTimer);
      // Network-level error (DNS, TCP reset, request body too large
      // rejected at the edge before any HTTP response, etc.). e.name
      // distinguishes TypeError ("failed to fetch") vs AbortError vs
      // SyntaxError. Surface name + message together so the user can
      // copy-paste a useful snippet to us.
      var detail = (e && e.message) ? e.message : String(e);
      var name   = (e && e.name) ? e.name : 'Error';
      var netMsg = 'Restore failed: ' + name + ' — ' + detail;
      try {
        console.error('[restoreLibraryFromFile] network/JS error', e);
      } catch (_e) { /* ignore */ }
      markRestoreError(netMsg);
      setStatus(netMsg, 'err');
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
    if (!explorer.signedIn || explorer.source !== 'published' || byId('ihFiles').hidden) return;
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

  if (refreshBtn) refreshBtn.addEventListener('click', function () { runExplorer(refresh); });

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
  window.addEventListener('aep-lab-sandbox-synced', refreshOrReloadForSandboxChange);
  window.addEventListener('aep-lab-sandbox-keys-applied', refreshOrReloadForSandboxChange);

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
    if (window.AepGlobalSandbox) {
      if (typeof window.AepGlobalSandbox.onSandboxSelectChange === 'function') {
        window.AepGlobalSandbox.onSandboxSelectChange(sel);
      }
      if (typeof window.AepGlobalSandbox.attachStorageSync === 'function') {
        window.AepGlobalSandbox.attachStorageSync(sel);
      }
    }
    if (sel && !sel.dataset.aepImageHostingWired) {
      sel.dataset.aepImageHostingWired = '1';
      sel.addEventListener('change', refreshOrReloadForSandboxChange);
    }
    if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.whenReady) {
      AepLabSandboxSync.whenReady.then(async function () {
        await initExplorer();
        var auth = window.firebase?.apps?.length ? window.firebase.auth() : null;
        if (auth && typeof auth.onAuthStateChanged === 'function') {
          auth.onAuthStateChanged(function (user) {
            if (!user || user.isAnonymous) showSignIn();
            else if (!explorer.signedIn || explorer.uid !== (user.uid || '')) {
              showSignIn();
              initExplorer();
            }
          });
        }
      }).catch(function (error) { setStatus(error.message, 'err'); });
    } else {
      initExplorer();
    }
  })();
})();
