(function () {
  'use strict';

  const folderTree = document.getElementById('folderTree');

  function clearTreeError() {
    var el = document.getElementById('treeError');
    if (el) {
      el.hidden = true;
      el.textContent = '';
    }
  }

  function setTreeError(msg) {
    var el = document.getElementById('treeError');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
  }
  const imageGrid = document.getElementById('imageGrid');
  const imageFolderHint = document.getElementById('imageFolderHint');
  const uploadPanelHint = document.getElementById('uploadPanelHint');
  const publicHostingBaseUrl = 'https://contenthosting.web.app';
  const dropZone = document.getElementById('dropZone');
  const dropZoneTitle = document.getElementById('dropZoneTitle');
  const dropZoneSub = document.getElementById('dropZoneSub');
  const fileInput = document.getElementById('fileInput');
  const uploadMsg = document.getElementById('uploadMsg');
  const uploadList = document.getElementById('uploadList');
  const btnDeploy = document.getElementById('btnDeploy');
  const deployOut = document.getElementById('deployOut');
  const imagePreviewHint = document.getElementById('imagePreviewHint');
  const imagePreviewBlock = document.getElementById('imagePreviewBlock');
  const imagePreviewLarge = document.getElementById('imagePreviewLarge');
  const imagePreviewCaption = document.getElementById('imagePreviewCaption');
  const btnPreviewRename = document.getElementById('btnPreviewRename');
  const hostingContextMenu = document.getElementById('hostingContextMenu');
  const hostingContextRenameBtn = document.getElementById('hostingContextRename');

  const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i;

  let selectedThumbEl = null;
  let previewFileName = '';
  let contextMenuTargetName = '';

  function hideHostingContextMenu() {
    if (hostingContextMenu) hostingContextMenu.hidden = true;
  }

  function positionHostingMenu(clientX, clientY) {
    if (!hostingContextMenu) return;
    var w = 168;
    var h = 40;
    var x = Math.max(4, Math.min(clientX, window.innerWidth - w - 4));
    var y = Math.max(4, Math.min(clientY, window.innerHeight - h - 4));
    hostingContextMenu.style.left = x + 'px';
    hostingContextMenu.style.top = y + 'px';
  }

  function clearPreview() {
    previewFileName = '';
    contextMenuTargetName = '';
    if (selectedThumbEl) {
      selectedThumbEl.classList.remove('firebase-hosting-thumb--selected');
      selectedThumbEl = null;
    }
    if (imagePreviewBlock) imagePreviewBlock.hidden = true;
    if (imagePreviewHint) imagePreviewHint.hidden = false;
    if (imagePreviewLarge) {
      imagePreviewLarge.removeAttribute('src');
      imagePreviewLarge.alt = '';
    }
    if (imagePreviewCaption) imagePreviewCaption.textContent = '';
  }

  function showPreviewForFile(relPath, fileName, url) {
    previewFileName = fileName;
    if (imagePreviewBlock) imagePreviewBlock.hidden = false;
    if (imagePreviewHint) imagePreviewHint.hidden = true;
    if (imagePreviewLarge) {
      imagePreviewLarge.src = url;
      imagePreviewLarge.alt = fileName;
    }
    if (imagePreviewCaption) imagePreviewCaption.textContent = fileName;
  }

  async function copyPublicHostingPath(relPath) {
    var raw = String(relPath || '').replace(/\\/g, '/').trim();
    if (!raw) return;

    // Defensive normalization: if a full hosted URL was accidentally passed or concatenated,
    // keep only the final relative part under /webcampaign/.
    var matches = raw.match(/https?:\/\/[^\s]+/gi);
    if (matches && matches.length) {
      var lastUrl = matches[matches.length - 1];
      try {
        var parsed = new URL(lastUrl);
        raw = parsed.pathname || raw;
      } catch (_) {
        raw = lastUrl;
      }
    }

    var cleanRel = raw
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^\/+/, '');

    if (!cleanRel) return;
    var publicUrl = publicHostingBaseUrl + '/' + cleanRel;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(publicUrl);
      } else {
        var ta = document.createElement('textarea');
        ta.value = publicUrl;
        ta.setAttribute('readonly', '');
        ta.style.position = 'absolute';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      if (imageFolderHint) imageFolderHint.textContent = 'Copied URL: ' + publicUrl;
    } catch (_) {
      if (imageFolderHint) imageFolderHint.textContent = 'Could not copy URL automatically: ' + publicUrl;
    }
  }

  async function renameHostingFile(fromName) {
    if (!fromName || !selectedRel) return;
    var newName = window.prompt('New file name:', fromName);
    if (newName === null) return;
    newName = newName.trim();
    if (!newName || newName === fromName) return;
    try {
      const r = await fetch(apiUrl('/api/hosting/rename'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder: selectedRel, from: fromName, to: newName }),
      });
      const text = await r.text();
      var j = {};
      try {
        j = text ? JSON.parse(text) : {};
      } catch (parseErr) {
        j = {};
      }
      if (!r.ok) {
        throw new Error(
          j.error ||
            (text && text.length < 300 ? text.trim() : '') ||
            'HTTP ' + r.status + ' ' + (r.statusText || '')
        );
      }
      hideHostingContextMenu();
      if (previewFileName === fromName) {
        var newRel = joinRel(selectedRel, newName).replace(/\\/g, '/');
        previewFileName = newName;
        if (imagePreviewLarge) {
          imagePreviewLarge.src =
            apiUrl('/api/hosting/raw?rel=' + encodeURIComponent(newRel) + '&cb=' + Date.now());
          imagePreviewLarge.alt = newName;
        }
        if (imagePreviewCaption) imagePreviewCaption.textContent = newName;
      }
      await refreshImages();
    } catch (e) {
      window.alert(e.message || 'Rename failed');
    }
  }

  /** Profile Viewer APIs live on this origin. Relative /api/... only works when this page is served by that server. */
  function getApiBase() {
    try {
      if (window.location.protocol === 'file:') {
        return 'http://localhost:3333';
      }
      var h = window.location.hostname;
      if ((h === 'localhost' || h === '127.0.0.1') && window.location.port === '3333') {
        return window.location.origin;
      }
    } catch (e) {}
    return 'http://localhost:3333';
  }

  function apiUrl(path) {
    var p = path.charAt(0) === '/' ? path : '/' + path;
    return getApiBase() + p;
  }

  let statusPayload = null;
  let selectedRel = '';
  let selectedLabelEl = null;
  let deployPollId = null;

  function stopDeployPoll() {
    if (deployPollId) {
      clearInterval(deployPollId);
      deployPollId = null;
    }
  }

  function startDeployPoll() {
    if (deployPollId) return;
    deployPollId = setInterval(function () {
      loadStatus();
    }, 2000);
  }

  function formatLastDeploy(ld) {
    if (!ld) return '';
    var lines = [];
    if (ld.finishedAt) lines.push('Finished: ' + ld.finishedAt);
    if (ld.ok === true) {
      lines.push('Status: succeeded');
    } else {
      lines.push(
        'Status: failed' + (typeof ld.code === 'number' ? ' (exit ' + ld.code + ')' : '')
      );
    }
    if (ld.error) lines.push('Error: ' + ld.error);
    if (ld.hint) lines.push(ld.hint);
    if (ld.stdout) lines.push(String(ld.stdout));
    if (ld.stderr) lines.push(String(ld.stderr));
    return lines.join('\n');
  }

  function joinRel(parent, name) {
    if (!parent) return name;
    return parent.replace(/\/+$/, '') + '/' + name;
  }

  function isImageFile(name) {
    return IMAGE_EXT.test(name);
  }

  async function loadStatus() {
    try {
      const r = await fetch(apiUrl('/api/hosting/status'));
      if (!r.ok) {
        if (r.status === 404) {
          throw new Error('HOSTING_API_404');
        }
        throw new Error('HTTP ' + r.status);
      }
      const j = await r.json();
      statusPayload = j;
      const deployReady =
        j.deployReady === true &&
        j.hostingTreeOk &&
        j.hostingExists;

      if (j.hostingTreeOk) {
        clearTreeError();
        buildRootTree(j.hostingRootName || 'folder');
      } else {
        setTreeError(
          'Set LOCAL_HOSTING_FOLDER in .env to an absolute path on this PC, then restart npm start.'
        );
        folderTree.innerHTML = '';
      }

      if (j.deployInProgress === true) {
        deployOut.hidden = false;
        deployOut.textContent =
          'Firebase deploy is running on the server…\nStarted: ' + (j.deployStartedAt || '—') +
          '\n\nThis page checks every 2s until the deploy finishes. Refreshing the page still shows this while the server reports a deploy in progress.';
        btnDeploy.disabled = true;
        if (!deployPollId) startDeployPoll();
      } else {
        stopDeployPoll();
        btnDeploy.disabled = !deployReady;
        if (j.lastDeploy) {
          deployOut.hidden = false;
          deployOut.textContent = formatLastDeploy(j.lastDeploy);
        }
      }
    } catch (e) {
      var msg;
      if (e && e.message === 'HOSTING_API_404') {
        msg =
          'Hosting API missing — restart the server from "03 Profile Viewer" (npm start).';
      } else {
        msg =
          'Cannot reach ' +
          getApiBase() +
          '. Run npm start in "03 Profile Viewer", then open http://localhost:3333/firebase-hosting.html.';
      }
      setTreeError(msg);
      folderTree.innerHTML = '';
      btnDeploy.disabled = true;
    }
  }

  function setSelectedFolder(rel, labelBtn) {
    var next = rel || '';
    if (next !== selectedRel) {
      clearPreview();
    }
    selectedRel = next;
    if (selectedLabelEl) selectedLabelEl.classList.remove('firebase-hosting-tree__label--active');
    selectedLabelEl = labelBtn || null;
    if (selectedLabelEl) selectedLabelEl.classList.add('firebase-hosting-tree__label--active');
    updateUploadHint();
    refreshImages();
  }

  function updateUploadHint() {
    var rel = selectedRel;
    if (uploadPanelHint) {
      if (!rel) {
        uploadPanelHint.textContent =
          'Select a folder in the tree. Uploads are renamed to that folder’s standard names and replace matching files (e.g. logo.png, banner.png).';
      } else {
        var base = rel.split('/').pop() || rel;
        var lower = base.toLowerCase();
        var rules = '';
        if (lower === 'logos') {
          rules = 'Renames to logo.png (one file). Replaces existing logo.png.';
        } else if (lower === 'banners') {
          rules =
            'Renames in order to banner.png, banner1.png, banner2.png, … Replaces files with those names.';
        } else if (lower === 'products') {
          rules = 'Renames in order to product1.png, product2.png, … Replaces those files if present.';
        } else {
          var slug = base.replace(/[^a-zA-Z0-9_-]+/g, '').toLowerCase() || 'file';
          rules =
            'Renames in order to ' +
            slug +
            '1.png, ' +
            slug +
            '2.png, … Replaces matching names.';
        }
        uploadPanelHint.textContent = 'Target: ' + rel.replace(/\\/g, '/') + '. ' + rules;
      }
    }
    if (dropZoneTitle) {
      dropZoneTitle.textContent = rel
        ? 'Drop images into "' + (rel.split('/').pop() || rel) + '"'
        : 'Select a folder in the tree';
    }
    if (dropZoneSub) {
      dropZoneSub.textContent = rel
        ? 'or click to browse (multiple files allowed where supported)'
        : 'Then choose files or drag them here';
    }
  }

  async function refreshImages() {
    if (!statusPayload || !statusPayload.hostingTreeOk) return;
    const rel = selectedRel;
    var baseHint = rel
      ? 'Showing images in: ' + rel.replace(/\\/g, '/')
      : 'Showing images in the root of your local folder.';
    try {
      const r = await fetch(apiUrl('/api/hosting/files?folder=' + encodeURIComponent(rel)));
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || r.statusText);
      const images = (j.entries || []).filter(function (e) {
        return !e.isDirectory && isImageFile(e.name);
      });
      images.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
      imageGrid.innerHTML = '';
      if (!images.length) {
        imageFolderHint.textContent = baseHint + ' — no image files in this folder.';
        clearPreview();
        return;
      }
      var nameSet = {};
      images.forEach(function (e) {
        nameSet[e.name] = true;
      });
      if (previewFileName && !nameSet[previewFileName]) {
        clearPreview();
      }
      imageFolderHint.textContent = baseHint;
      var cacheBust = Date.now();
      images.forEach(function (entry) {
        const relPath = joinRel(rel, entry.name).replace(/\\/g, '/');
        const url =
          apiUrl('/api/hosting/raw?rel=' + encodeURIComponent(relPath) + '&cb=' + cacheBust);
        const fig = document.createElement('figure');
        fig.className = 'firebase-hosting-thumb';
        fig.dataset.fileName = entry.name;
        fig.tabIndex = 0;
        fig.setAttribute('role', 'button');
        fig.setAttribute('aria-label', 'Expand ' + entry.name + ' in preview');
        const img = document.createElement('img');
        img.src = url;
        img.alt = entry.name;
        img.loading = 'lazy';
        img.draggable = false;
        fig.appendChild(img);
        const cap = document.createElement('figcaption');
        cap.textContent = entry.name;
        fig.appendChild(cap);

        fig.addEventListener('click', function (e) {
          e.preventDefault();
          if (selectedThumbEl) selectedThumbEl.classList.remove('firebase-hosting-thumb--selected');
          selectedThumbEl = fig;
          fig.classList.add('firebase-hosting-thumb--selected');
          showPreviewForFile(relPath, entry.name, url);
          copyPublicHostingPath(relPath);
        });

        fig.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          contextMenuTargetName = entry.name;
          if (hostingContextMenu) {
            positionHostingMenu(e.clientX, e.clientY);
            hostingContextMenu.hidden = false;
          }
        });

        fig.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fig.click();
          }
        });

        if (previewFileName === entry.name) {
          fig.classList.add('firebase-hosting-thumb--selected');
          selectedThumbEl = fig;
        }

        imageGrid.appendChild(fig);
      });
    } catch (err) {
      imageFolderHint.textContent = err.message || 'Could not list folder.';
      imageGrid.innerHTML = '';
      clearPreview();
    }
  }

  async function fetchFolderEntries(rel) {
    const r = await fetch(apiUrl('/api/hosting/files?folder=' + encodeURIComponent(rel)));
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'List failed');
    return j.entries || [];
  }

  async function loadChildrenInto(rel, containerEl) {
    const entries = await fetchFolderEntries(rel);
    const dirs = entries
      .filter(function (e) {
        return e.isDirectory;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
    dirs.forEach(function (d) {
      const childRel = joinRel(rel, d.name);
      containerEl.appendChild(buildFolderNode(childRel, d.name, false));
    });
  }

  function buildFolderNode(rel, displayName, isRoot) {
    const wrap = document.createElement('div');
    wrap.className = 'firebase-hosting-tree__node';
    wrap.setAttribute('role', 'treeitem');
    wrap.setAttribute('aria-expanded', 'false');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'firebase-hosting-tree__toggle';
    toggle.textContent = '▶';
    toggle.setAttribute('aria-label', 'Expand folder');

    const label = document.createElement('button');
    label.type = 'button';
    label.className = 'firebase-hosting-tree__label';
    label.textContent = displayName;

    const children = document.createElement('div');
    children.className = 'firebase-hosting-tree__children';
    children.hidden = true;
    children.setAttribute('role', 'group');

    toggle.setAttribute('aria-expanded', 'false');

    wrap.appendChild(toggle);
    wrap.appendChild(label);

    const outer = document.createElement('div');
    outer.appendChild(wrap);
    outer.appendChild(children);

    label.addEventListener('click', function () {
      setSelectedFolder(rel, label);
    });

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      if (!expanded) {
        if (!children.dataset.loaded) {
          toggle.textContent = '…';
          toggle.disabled = true;
          loadChildrenInto(rel, children)
            .then(function () {
              children.dataset.loaded = '1';
              toggle.disabled = false;
              clearTreeError();
              if (children.children.length === 0) {
                toggle.classList.add('firebase-hosting-tree__toggle--empty');
                toggle.setAttribute('aria-expanded', 'false');
                children.hidden = true;
                toggle.textContent = '▶';
                return;
              }
              toggle.textContent = '▼';
              toggle.setAttribute('aria-expanded', 'true');
              children.hidden = false;
              wrap.setAttribute('aria-expanded', 'true');
            })
            .catch(function () {
              toggle.disabled = false;
              toggle.textContent = '▶';
              setTreeError('Could not read subfolders.');
            });
        } else {
          toggle.textContent = '▼';
          toggle.setAttribute('aria-expanded', 'true');
          children.hidden = false;
          wrap.setAttribute('aria-expanded', 'true');
        }
      } else {
        toggle.textContent = '▶';
        toggle.setAttribute('aria-expanded', 'false');
        children.hidden = true;
        wrap.setAttribute('aria-expanded', 'false');
      }
    });

    if (isRoot) {
      fetchFolderEntries(rel)
        .then(function (entries) {
          var hasSubdirs = entries.some(function (e) {
            return e.isDirectory;
          });
          if (!hasSubdirs) {
            toggle.classList.add('firebase-hosting-tree__toggle--empty');
          }
        })
        .catch(function () {});
    }

    return outer;
  }

  function buildRootTree(rootName) {
    clearPreview();
    folderTree.innerHTML = '';
    const rootOuter = buildFolderNode('', rootName, true);
    folderTree.appendChild(rootOuter);
    selectedRel = 'logos';
    selectedLabelEl = null;
    updateUploadHint();
    refreshImages();
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    if (!selectedRel) {
      uploadMsg.textContent = 'Select a folder in the tree first.';
      uploadMsg.className = 'msg error';
      return;
    }

    uploadMsg.textContent = 'Uploading…';
    uploadMsg.className = 'msg';
    uploadList.hidden = true;
    uploadList.innerHTML = '';

    const fd = new FormData();
    fd.append('folder', selectedRel);
    files.forEach(function (f) {
      fd.append('files', f);
    });

    try {
      const r = await fetch(apiUrl('/api/hosting/upload-to-folder'), { method: 'POST', body: fd });
      const text = await r.text();
      var j;
      try {
        j = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(
          'Server returned HTML instead of JSON (HTTP ' +
            r.status +
            '). Restart Profile Viewer (npm start) so /api/hosting/upload-to-folder is registered.'
        );
      }
      if (!r.ok) throw new Error(j.error || r.statusText);

      uploadMsg.textContent = 'Saved ' + j.count + ' file(s).';
      uploadMsg.className = 'msg ok';
      uploadList.hidden = false;
      (j.files || []).forEach(function (f) {
        const li = document.createElement('li');
        li.textContent = f.path;
        uploadList.appendChild(li);
      });
      refreshImages();
    } catch (e) {
      uploadMsg.textContent = e.message || 'Upload failed';
      uploadMsg.className = 'msg error';
    }
  }

  dropZone.addEventListener('click', function () {
    fileInput.click();
  });
  fileInput.addEventListener('change', function (e) {
    uploadFiles(e.target.files);
    e.target.value = '';
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', function () {
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    uploadFiles(e.dataTransfer.files);
  });

  if (btnPreviewRename) {
    btnPreviewRename.addEventListener('click', function () {
      if (previewFileName) renameHostingFile(previewFileName);
    });
  }
  if (hostingContextRenameBtn) {
    hostingContextRenameBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var name = contextMenuTargetName;
      hideHostingContextMenu();
      if (name) renameHostingFile(name);
    });
  }
  document.addEventListener('mousedown', function (e) {
    if (!hostingContextMenu || hostingContextMenu.hidden) return;
    if (!hostingContextMenu.contains(e.target)) hideHostingContextMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideHostingContextMenu();
  });

  btnDeploy.addEventListener('click', async function () {
    deployOut.hidden = false;
    deployOut.textContent = 'Running firebase deploy…';
    btnDeploy.disabled = true;
    try {
      const r = await fetch(apiUrl('/api/hosting/deploy'), { method: 'POST' });
      const j = await r.json().catch(function () {
        return {};
      });
      if (r.status === 409) {
        deployOut.textContent =
          (j.error || 'Deploy already in progress.') +
          '\n\nWaiting for the other deploy to finish (checking every 2s)…';
        startDeployPoll();
        loadStatus();
        return;
      }
      const parts = [];
      if (j.error) parts.push('Error: ' + j.error, j.hint || '');
      if (j.stdout) parts.push(j.stdout);
      if (j.stderr) parts.push(j.stderr);
      if (!parts.length) parts.push(JSON.stringify(j, null, 2));
      deployOut.textContent = parts.filter(Boolean).join('\n');
      if (!r.ok && !j.stdout && !j.stderr) {
        deployOut.textContent = 'HTTP ' + r.status + (j.error ? ': ' + j.error : '');
      }
    } catch (e) {
      deployOut.textContent = e.message || 'Deploy request failed';
    }
    btnDeploy.disabled = false;
    loadStatus();
  });

  loadStatus();
})();
