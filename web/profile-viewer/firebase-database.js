(function () {
  'use strict';

  var database = null;
  var auth = null;
  var basePath = '';
  var databaseData = {};
  var currentEditRelPath = null;
  var expandedNodes = new Set();
  var lastEditedRelPath = null;
  /** Subpath under workspace for tree view (empty = full workspace). */
  var viewRootRel = '';

  var statusEl = document.getElementById('fbDbStatusText');
  var msgEl = document.getElementById('fbDbMessage');
  var treeEl = document.getElementById('fbDbTree');
  var editForm = document.getElementById('fbDbEditForm');
  var editPathEl = document.getElementById('fbDbEditPath');
  var editKeyEl = document.getElementById('fbDbEditKey');
  var editValueEl = document.getElementById('fbDbEditValue');
  var editTypeEl = document.getElementById('fbDbEditType');

  function showMsg(text, kind) {
    if (!msgEl) return;
    msgEl.hidden = false;
    msgEl.textContent = text;
    msgEl.className = 'fb-db-msg fb-db-msg--' + (kind || 'info');
    if (kind === 'ok' || kind === 'err') {
      setTimeout(function () {
        msgEl.hidden = true;
      }, 6000);
    }
  }

  function setStatus(text, variant) {
    if (!statusEl) return;
    statusEl.textContent = text;
    var wrap = statusEl.closest('.fb-db-status');
    if (wrap) {
      wrap.className = 'fb-db-status' + (variant === 'ok' ? ' fb-db-status--ok' : variant === 'warn' ? ' fb-db-status--warn' : '');
    }
  }

  function getCfg() {
    return window.firebaseDatabaseConfig;
  }

  function normalizeRel(p) {
    if (p == null || p === '') return '';
    return String(p).replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function joinRel(prefix, key) {
    var a = normalizeRel(prefix);
    return a ? a + '/' + key : key;
  }

  function getAtPath(obj, relPath) {
    var parts = normalizeRel(relPath).split('/').filter(Boolean);
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null || typeof cur !== 'object') return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function authErrorMessage(err) {
    if (!err || !err.code) return err && err.message ? String(err.message) : 'Request failed';
    switch (err.code) {
      case 'auth/email-already-in-use':
        return 'That email is already registered — try Sign in.';
      case 'auth/invalid-email':
        return 'Enter a valid email address.';
      case 'auth/weak-password':
        return 'Password should be at least 6 characters.';
      case 'auth/user-disabled':
        return 'This account has been disabled.';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential':
        return 'Wrong email or password.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Wait a bit and try again.';
      default:
        return err.message || String(err.code);
    }
  }

  function getEmailPassword() {
    var em = document.getElementById('fbDbEmail');
    var pw = document.getElementById('fbDbPassword');
    var email = em && em.value ? String(em.value).trim() : '';
    var password = pw && pw.value ? String(pw.value) : '';
    return { email: email, password: password };
  }

  function initFirebaseApp() {
    var cfg = getCfg();
    if (!cfg || !cfg.apiKey) {
      showMsg('Missing firebase-database-config.js (apiKey).', 'err');
      return;
    }
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(cfg);
      }
      auth = firebase.auth();
      database = firebase.database();
      auth.onAuthStateChanged(function (user) {
        if (user) {
          basePath = 'userWorkspaces/' + user.uid;
          var who = user.email || 'Guest ' + user.uid.slice(0, 8) + '…';
          setStatus('Signed in · ' + who, 'ok');
          cancelEdit();
          refreshDatabase();
        } else {
          basePath = '';
          databaseData = {};
          viewRootRel = '';
          if (treeEl) {
            treeEl.innerHTML =
              '<div class="fb-db-tree-empty">Sign in or create an account to load your workspace.</div>';
          }
          setStatus('Not signed in', 'warn');
          cancelEdit();
        }
      });
    } catch (e) {
      setStatus('Error', 'warn');
      showMsg(String(e.message || e), 'err');
    }
  }

  function signInWithEmail() {
    var x = getEmailPassword();
    if (!x.email || !x.password) {
      showMsg('Enter email and password.', 'err');
      return;
    }
    if (!auth) {
      showMsg('Firebase not initialized.', 'err');
      return;
    }
    showMsg('Signing in…', 'info');
    auth
      .signInWithEmailAndPassword(x.email, x.password)
      .then(function () {
        showMsg('Signed in.', 'ok');
      })
      .catch(function (e) {
        showMsg(authErrorMessage(e), 'err');
      });
  }

  function registerWithEmail() {
    var x = getEmailPassword();
    if (!x.email || !x.password) {
      showMsg('Enter email and password (min. 6 characters).', 'err');
      return;
    }
    if (!auth) {
      showMsg('Firebase not initialized.', 'err');
      return;
    }
    showMsg('Creating account…', 'info');
    auth
      .createUserWithEmailAndPassword(x.email, x.password)
      .then(function () {
        showMsg('Account created. Your workspace is ready.', 'ok');
      })
      .catch(function (e) {
        showMsg(authErrorMessage(e), 'err');
      });
  }

  function signInAnonymous() {
    if (!auth) {
      showMsg('Firebase not initialized.', 'err');
      return;
    }
    showMsg('Signing in as guest…', 'info');
    auth
      .signInAnonymously()
      .then(function () {
        showMsg('Guest session — data may not persist across browsers.', 'info');
      })
      .catch(function (e) {
        showMsg(
          authErrorMessage(e) +
            ' Enable Anonymous under Authentication → Sign-in method if you need this.',
          'err',
        );
      });
  }

  function sendPasswordReset() {
    var x = getEmailPassword();
    if (!x.email) {
      showMsg('Enter your email, then click Send password reset email.', 'err');
      return;
    }
    if (!auth) return;
    showMsg('Sending…', 'info');
    auth
      .sendPasswordResetEmail(x.email)
      .then(function () {
        showMsg('Check your inbox for a reset link.', 'ok');
      })
      .catch(function (e) {
        showMsg(authErrorMessage(e), 'err');
      });
  }

  function refreshDatabase() {
    if (!database || !basePath) {
      showMsg('Sign in first.', 'err');
      return Promise.resolve();
    }
    showMsg('Loading data…', 'info');
    return database
      .ref(basePath)
      .once('value')
      .then(function (snap) {
        databaseData = snap.val() || {};
        viewRootRel = '';
        renderTree();
        showMsg('Data loaded.', 'ok');
      })
      .catch(function (e) {
        showMsg(String(e.message || e), 'err');
      });
  }

  function renderTree() {
    if (!treeEl) return;
    treeEl.innerHTML = '';
    var root = viewRootRel ? getAtPath(databaseData, viewRootRel) : databaseData;
    if (root === undefined || root === null) {
      treeEl.innerHTML = '<div class="fb-db-tree-empty">No data at this path.</div>';
      return;
    }
    if (typeof root !== 'object' || Array.isArray(root)) {
      treeEl.innerHTML =
        '<div class="fb-db-tree-empty">Value here is not an object. Use Refresh to reload the full workspace.</div>';
      return;
    }
    if (Object.keys(root).length === 0) {
      treeEl.innerHTML = '<div class="fb-db-tree-empty">No keys here. Add a node or go up a path.</div>';
      return;
    }
    renderSubtree(root, viewRootRel, treeEl);
  }

  function renderSubtree(data, relPrefix, container) {
    var keys = Object.keys(data || {});
    keys.forEach(function (key) {
      var value = data[key];
      var rel = joinRel(relPrefix, key);
      var row = document.createElement('div');
      row.className = 'fb-db-tree-row';

      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        var isOpen = expandedNodes.has(rel);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fb-db-tree-key fb-db-tree-folder';
        btn.setAttribute('data-action', 'toggle');
        btn.setAttribute('data-rel', rel);
        btn.textContent = (isOpen ? '▼ ' : '▶ ') + key + ' (' + Object.keys(value).length + ' keys)';
        row.appendChild(btn);
        var childWrap = document.createElement('div');
        childWrap.className = 'fb-db-tree-children';
        childWrap.style.display = isOpen ? 'block' : 'none';
        childWrap.setAttribute('data-children-for', rel);
        renderSubtree(value, rel, childWrap);
        row.appendChild(childWrap);
      } else {
        var leafBtn = document.createElement('button');
        leafBtn.type = 'button';
        leafBtn.className = 'fb-db-tree-key';
        leafBtn.setAttribute('data-action', 'edit');
        leafBtn.setAttribute('data-rel', rel);
        var span = document.createElement('span');
        span.className = 'fb-db-tree-leaf-val';
        var display =
          value === null
            ? 'null'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value);
        if (display.length > 80) display = display.slice(0, 80) + '…';
        leafBtn.appendChild(document.createTextNode(key + ': '));
        span.textContent = display;
        leafBtn.appendChild(span);
        if (lastEditedRelPath === rel) leafBtn.style.outline = '2px solid #2563eb';
        row.appendChild(leafBtn);
      }
      container.appendChild(row);
    });
  }

  function onTreeClick(e) {
    var t = e.target.closest('[data-action]');
    if (!t || !treeEl.contains(t)) return;
    var action = t.getAttribute('data-action');
    var rel = t.getAttribute('data-rel') || '';
    if (action === 'toggle') {
      if (expandedNodes.has(rel)) expandedNodes.delete(rel);
      else expandedNodes.add(rel);
      renderTree();
      return;
    }
    if (action === 'edit') {
      openEdit(rel);
    }
  }

  function openEdit(rel) {
    currentEditRelPath = rel;
    var value = getAtPath(databaseData, rel);
    var key = rel.split('/').filter(Boolean).pop() || '';
    if (editForm) editForm.classList.add('fb-db-edit--active');
    if (editPathEl) editPathEl.textContent = '/' + rel + '  (under your workspace)';
    if (editKeyEl) editKeyEl.value = key;
    if (editValueEl) {
      editValueEl.value =
        value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
    }
    if (editTypeEl) {
      var ty =
        value === null ? 'null' : Array.isArray(value) ? 'object' : typeof value === 'object' ? 'object' : typeof value;
      editTypeEl.value = ty === 'undefined' ? 'string' : ty;
    }
    if (editForm) editForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function cancelEdit() {
    currentEditRelPath = null;
    if (editForm) editForm.classList.remove('fb-db-edit--active');
  }

  function parseValue(raw, type) {
    switch (type) {
      case 'number':
        var n = parseFloat(raw);
        if (isNaN(n)) throw new Error('Invalid number');
        return n;
      case 'boolean':
        return String(raw).toLowerCase() === 'true';
      case 'object':
        return JSON.parse(raw);
      case 'null':
        return null;
      default:
        return raw;
    }
  }

  function saveEdit() {
    if (!database || !basePath || !currentEditRelPath) {
      showMsg('Nothing to save.', 'err');
      return;
    }
    var raw = editValueEl ? editValueEl.value : '';
    var type = editTypeEl ? editTypeEl.value : 'string';
    var value;
    try {
      value = parseValue(raw, type);
    } catch (e) {
      showMsg(String(e.message || e), 'err');
      return;
    }
    var fullPath = basePath + '/' + currentEditRelPath;
    database
      .ref(fullPath)
      .set(value)
      .then(function () {
        lastEditedRelPath = currentEditRelPath;
        showMsg('Saved.', 'ok');
        cancelEdit();
        return refreshDatabase();
      })
      .catch(function (e) {
        showMsg(String(e.message || e), 'err');
      });
  }

  function deleteNode() {
    if (!database || !basePath || !currentEditRelPath) {
      showMsg('Select a node to delete.', 'err');
      return;
    }
    if (!confirm('Delete this node? This cannot be undone.')) return;
    var fullPath = basePath + '/' + currentEditRelPath;
    database
      .ref(fullPath)
      .remove()
      .then(function () {
        showMsg('Deleted.', 'ok');
        cancelEdit();
        return refreshDatabase();
      })
      .catch(function (e) {
        showMsg(String(e.message || e), 'err');
      });
  }

  function navigateToPath() {
    var inp = document.getElementById('fbDbNavigatePath');
    if (!inp || !basePath) return;
    var sub = normalizeRel(inp.value);
    var v = sub ? getAtPath(databaseData, sub) : databaseData;
    if (v === undefined || v === null) {
      showMsg('No data at that path. Refresh after saving, or create the path first.', 'err');
      return;
    }
    if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
      viewRootRel = sub;
      renderTree();
      showMsg(sub ? 'Showing subtree · use empty path + Go to return to root.' : 'Showing full workspace.', 'ok');
      return;
    }
    viewRootRel = sub;
    if (treeEl) {
      treeEl.innerHTML =
        '<div class="fb-db-tree-empty">Scalar at path: <code>' +
        escapeHtml(String(v)) +
        '</code> — clear path and Go for full tree.</div>';
    }
    showMsg('Scalar value (not expandable).', 'info');
  }

  function createNewNode() {
    var pIn = document.getElementById('fbDbNewPath');
    var vIn = document.getElementById('fbDbNewValue');
    if (!pIn || !vIn || !database || !basePath) return;
    var sub = normalizeRel(pIn.value);
    var raw = vIn.value.trim();
    if (!sub) {
      showMsg('Enter a path (e.g. settings/theme).', 'err');
      return;
    }
    var value = raw;
    try {
      if (raw.charAt(0) === '{' || raw.charAt(0) === '[') value = JSON.parse(raw);
    } catch (e) {
      /* keep string */
    }
    var fullPath = basePath + '/' + sub;
    database
      .ref(fullPath)
      .set(value)
      .then(function () {
        showMsg('Node created.', 'ok');
        pIn.value = '';
        vIn.value = '';
        return refreshDatabase();
      })
      .catch(function (e) {
        showMsg(String(e.message || e), 'err');
      });
  }

  function exportDatabase() {
    if (!databaseData || !Object.keys(databaseData).length) {
      showMsg('Nothing to export.', 'err');
      return;
    }
    var blob = new Blob([JSON.stringify(databaseData, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'firebase-workspace-export.json';
    a.click();
    URL.revokeObjectURL(a.href);
    showMsg('Download started.', 'ok');
  }

  function signOutUser() {
    if (auth) {
      auth.signOut().then(function () {
        showMsg('Signed out.', 'info');
      });
    }
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  initFirebaseApp();

  var pwEl = document.getElementById('fbDbPassword');
  if (pwEl) {
    pwEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') signInWithEmail();
    });
  }

  document.getElementById('fbDbSignIn') && document.getElementById('fbDbSignIn').addEventListener('click', signInWithEmail);
  document.getElementById('fbDbRegister') && document.getElementById('fbDbRegister').addEventListener('click', registerWithEmail);
  document.getElementById('fbDbAnonymous') && document.getElementById('fbDbAnonymous').addEventListener('click', signInAnonymous);
  document.getElementById('fbDbResetPassword') &&
    document.getElementById('fbDbResetPassword').addEventListener('click', sendPasswordReset);
  document.getElementById('fbDbRefresh') && document.getElementById('fbDbRefresh').addEventListener('click', function () {
    refreshDatabase();
  });
  document.getElementById('fbDbSignOut') && document.getElementById('fbDbSignOut').addEventListener('click', signOutUser);
  document.getElementById('fbDbExport') && document.getElementById('fbDbExport').addEventListener('click', exportDatabase);
  document.getElementById('fbDbGoPath') && document.getElementById('fbDbGoPath').addEventListener('click', navigateToPath);
  document.getElementById('fbDbCreate') && document.getElementById('fbDbCreate').addEventListener('click', createNewNode);
  document.getElementById('fbDbSave') && document.getElementById('fbDbSave').addEventListener('click', saveEdit);
  document.getElementById('fbDbDelete') && document.getElementById('fbDbDelete').addEventListener('click', deleteNode);
  document.getElementById('fbDbCancel') && document.getElementById('fbDbCancel').addEventListener('click', cancelEdit);
  treeEl && treeEl.addEventListener('click', onTreeClick);
})();
