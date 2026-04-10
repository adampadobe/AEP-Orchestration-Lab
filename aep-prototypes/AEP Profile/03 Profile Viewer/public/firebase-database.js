(function () {
  'use strict';

  var database = null;
  var auth = null;
  var basePath = '';
  /** Claimed LDAP-style segment; REST URL uses userWorkspaces/&lt;slug&gt;.json only when set (never the raw Firebase uid). */
  var workspaceSlug = '';
  var databaseData = {};
  var currentEditRelPath = null;
  var expandedNodes = new Set();
  var lastEditedRelPath = null;
  /** Subpath under workspace for tree view (empty = full workspace). */
  var viewRootRel = '';
  /** 'tree' | 'json' — data panel view */
  var dataViewMode = 'tree';

  var statusEl = document.getElementById('fbDbStatusText');
  var msgEl = document.getElementById('fbDbMessage');
  var treeEl = document.getElementById('fbDbTree');
  var editForm = document.getElementById('fbDbEditForm');
  var editPathEl = document.getElementById('fbDbEditPath');
  var editKeyEl = document.getElementById('fbDbEditKey');
  var editValueEl = document.getElementById('fbDbEditValue');
  var editTypeEl = document.getElementById('fbDbEditType');

  var FB_DB_LAST_EMAIL_KEY = 'aepFbDbLastEmail';

  function cacheLoginEmail(email) {
    var s = String(email || '').trim();
    if (!s) return;
    try {
      localStorage.setItem(FB_DB_LAST_EMAIL_KEY, s);
    } catch (e) {
      /* quota / private mode */
    }
  }

  function applyCachedLoginEmail() {
    var input = document.getElementById('fbDbEmail');
    if (!input) return;
    try {
      var v = localStorage.getItem(FB_DB_LAST_EMAIL_KEY);
      if (v) input.value = v;
    } catch (e) {
      /* */
    }
  }

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

  /** Same subtree as tree / JSON: full workspace or path under Navigate. */
  function getViewRootData() {
    if (!basePath) return undefined;
    var root = viewRootRel ? getAtPath(databaseData, viewRootRel) : databaseData;
    return root === undefined ? null : root;
  }

  function escapeHtmlForJson(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Syntax-color pretty-printed JSON (from JSON.stringify) for display in a <pre>.
   * Copy still uses plain text via element.textContent.
   */
  function highlightJsonText(text) {
    var i = 0;
    var out = '';
    var len = text.length;
    while (i < len) {
      var c = text[i];
      if (c === '"') {
        var start = i;
        i++;
        while (i < len) {
          if (text[i] === '\\' && i + 1 < len) {
            var nx = text[i + 1];
            if (nx === 'u' && i + 6 <= len) {
              i += 6;
              continue;
            }
            i += 2;
            continue;
          }
          if (text[i] === '"') {
            i++;
            break;
          }
          i++;
        }
        var slice = text.slice(start, i);
        var j = i;
        while (j < len && /\s/.test(text[j])) j++;
        var isKey = j < len && text[j] === ':';
        var cls = isKey ? 'fb-db-json-hl-key' : 'fb-db-json-hl-string';
        out += '<span class="' + cls + '">' + escapeHtmlForJson(slice) + '</span>';
        continue;
      }
      if (c === 't' && text.slice(i, i + 4) === 'true') {
        out += '<span class="fb-db-json-hl-boolean">true</span>';
        i += 4;
        continue;
      }
      if (c === 'f' && text.slice(i, i + 5) === 'false') {
        out += '<span class="fb-db-json-hl-boolean">false</span>';
        i += 5;
        continue;
      }
      if (c === 'n' && text.slice(i, i + 4) === 'null') {
        out += '<span class="fb-db-json-hl-null">null</span>';
        i += 4;
        continue;
      }
      if (c === '-' || (c >= '0' && c <= '9')) {
        var n0 = i;
        if (c === '-') i++;
        while (i < len && /[0-9]/.test(text[i])) i++;
        if (i < len && text[i] === '.') {
          i++;
          while (i < len && /[0-9]/.test(text[i])) i++;
        }
        if (i < len && /[eE]/.test(text[i])) {
          i++;
          if (i < len && /[+\-]/.test(text[i])) i++;
          while (i < len && /[0-9]/.test(text[i])) i++;
        }
        out += '<span class="fb-db-json-hl-number">' + escapeHtmlForJson(text.slice(n0, i)) + '</span>';
        continue;
      }
      if ('{}[],:'.indexOf(c) >= 0) {
        out += '<span class="fb-db-json-hl-punct">' + escapeHtmlForJson(c) + '</span>';
        i++;
        continue;
      }
      out += escapeHtmlForJson(c);
      i++;
    }
    return out;
  }

  function renderJsonView() {
    var pre = document.getElementById('fbDbJsonPre');
    var empty = document.getElementById('fbDbJsonEmpty');
    if (!pre || !empty) return;
    if (!basePath) {
      pre.textContent = '';
      pre.hidden = true;
      empty.hidden = false;
      empty.textContent =
        auth && auth.currentUser
          ? 'Choose a workspace name on the left to load data.'
          : 'Sign in and refresh to load data.';
      return;
    }
    var root = getViewRootData();
    if (root === null || root === undefined) {
      pre.textContent = '';
      pre.hidden = true;
      empty.hidden = false;
      empty.textContent = 'No data at this path.';
      return;
    }
    empty.hidden = true;
    pre.hidden = false;
    try {
      var raw = JSON.stringify(root, null, 2);
      pre.innerHTML = highlightJsonText(raw);
    } catch (err) {
      pre.textContent = String(root);
    }
  }

  function setDataViewMode(mode) {
    dataViewMode = mode === 'json' ? 'json' : 'tree';
    var treeWrap = document.getElementById('fbDbTreeWrap');
    var jsonWrap = document.getElementById('fbDbJsonWrap');
    var tabTree = document.getElementById('fbDbViewTree');
    var tabJson = document.getElementById('fbDbViewJson');
    if (treeWrap) treeWrap.hidden = dataViewMode !== 'tree';
    if (jsonWrap) jsonWrap.hidden = dataViewMode !== 'json';
    if (tabTree) {
      tabTree.classList.toggle('fb-db-view-tab--active', dataViewMode === 'tree');
      tabTree.setAttribute('aria-selected', dataViewMode === 'tree' ? 'true' : 'false');
    }
    if (tabJson) {
      tabJson.classList.toggle('fb-db-view-tab--active', dataViewMode === 'json');
      tabJson.setAttribute('aria-selected', dataViewMode === 'json' ? 'true' : 'false');
    }
    if (dataViewMode === 'json') renderJsonView();
  }

  function copyJsonPanel() {
    var pre = document.getElementById('fbDbJsonPre');
    if (!pre || !pre.textContent) {
      showMsg('No JSON to copy. Load data or switch to JSON view.', 'err');
      return;
    }
    var text = pre.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showMsg('JSON copied to clipboard.', 'ok');
        },
        function () {
          fallbackCopyText(text, 'JSON copied to clipboard.');
        },
      );
    } else {
      fallbackCopyText(text, 'JSON copied to clipboard.');
    }
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
      case 'auth/configuration-not-found':
      case 'auth/operation-not-allowed':
        return (
          'Email/Password sign-in is not enabled for this Firebase project. Open Firebase Console → Authentication → Sign-in method, ' +
          'enable Email/Password (first row), save, wait a few seconds, then try Create account again. ' +
          'Direct link: https://console.firebase.google.com/project/aep-orchestration-lab/authentication/providers'
        );
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

  /** REST API URL for workspace root — only for claimed LDAP slug, e.g. …/userWorkspaces/apalmer.json */
  function workspaceRestApiUrlFromSlug(slug) {
    if (!slug) return '';
    var cfg = getCfg();
    var root = cfg && cfg.databaseURL ? String(cfg.databaseURL).trim() : '';
    if (!root) return '';
    if (root.endsWith('/')) root = root.slice(0, -1);
    return root + '/userWorkspaces/' + encodeURIComponent(slug) + '.json';
  }

  function syncRestApiPendingHint() {
    var hint = document.getElementById('fbDbRestApiPendingHint');
    if (!hint || !auth || !auth.currentUser) {
      if (hint) hint.hidden = true;
      return;
    }
    var uid = auth.currentUser.uid;
    var onLegacyUidPath = basePath === 'userWorkspaces/' + uid;
    hint.hidden = !(onLegacyUidPath && !workspaceSlug);
  }

  function updateRestApiLink(user) {
    var block = document.getElementById('fbDbApiBlock');
    var urlEl = document.getElementById('fbDbRestUrl');
    if (!block || !urlEl) return;
    if (user && user.uid && workspaceSlug) {
      var url = workspaceRestApiUrlFromSlug(workspaceSlug);
      urlEl.textContent = url;
      block.hidden = !url;
    } else {
      urlEl.textContent = '';
      block.hidden = true;
    }
    syncRestApiPendingHint();
  }

  var RESERVED_WORKSPACE_SLUGS = {
    workspaceclaims: true,
    userworkspaceowners: true,
    userworkspaces: true,
  };

  function sanitizeWorkspaceSlug(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return null;
    if (RESERVED_WORKSPACE_SLUGS[s]) return null;
    return s;
  }

  function setWorkspaceChrome(opts) {
    var layout = document.querySelector('.fb-db-layout');
    var deferred = document.getElementById('fbDbWorkspaceDeferred');
    var dataPanel = document.getElementById('fbDbDataPanel');
    var setup = document.getElementById('fbDbWorkspaceSetup');
    var lead = document.getElementById('fbDbWorkspaceSetupLead');
    var pending = !!opts.pendingRequired;
    if (layout) layout.classList.toggle('fb-db-layout--workspace-pending', pending);
    if (deferred) deferred.hidden = pending;
    if (dataPanel) dataPanel.classList.toggle('fb-db-data-panel--disabled', pending);
    if (setup && lead) {
      if (opts.setupMode === 'hidden') {
        setup.hidden = true;
      } else {
        setup.hidden = false;
        if (opts.setupMode === 'required') {
          lead.textContent =
            'Choose a workspace name (for example your LDAP id). It appears as the folder under userWorkspaces in the Firebase console.';
        } else {
          lead.textContent =
            opts.optionalLead ||
            'Optional: set an LDAP-style name for a readable folder. Saving copies your existing data to that path.';
        }
      }
    }
  }

  function legacyWorkspaceHasData(val) {
    if (val == null) return false;
    if (typeof val !== 'object' || Array.isArray(val)) return true;
    return Object.keys(val).length > 0;
  }

  function claimWorkspaceSlug(slug) {
    var user = auth.currentUser;
    if (!user || !database) return Promise.reject(new Error('Not signed in'));
    var refClaim = database.ref('workspaceClaims/' + slug);
    return refClaim
      .transaction(function (current) {
        if (current === null || current === undefined) return user.uid;
        if (current === user.uid) return user.uid;
        return undefined;
      })
      .then(function (result) {
        if (!result.committed || result.snapshot.val() !== user.uid) {
          throw new Error('taken');
        }
        return database.ref('userWorkspaceOwners/' + user.uid).set(slug);
      });
  }

  function resolveWorkspaceForUser(user) {
    if (!database || !user) return Promise.resolve();
    workspaceSlug = '';
    var uid = user.uid;
    viewRootRel = '';
    return database
      .ref('userWorkspaceOwners/' + uid)
      .once('value')
      .then(function (ownerSnap) {
        var ownRaw = ownerSnap.val();
        var owned = ownRaw != null && ownRaw !== '' ? String(ownRaw).trim() : '';
        if (owned) {
          workspaceSlug = owned;
          basePath = 'userWorkspaces/' + owned;
          setWorkspaceChrome({ pendingRequired: false, setupMode: 'hidden' });
          return;
        }
        return database.ref('userWorkspaces/' + uid).once('value').then(function (legacySnap) {
          var legacyVal = legacySnap.val();
          if (legacyWorkspaceHasData(legacyVal)) {
            basePath = 'userWorkspaces/' + uid;
            setWorkspaceChrome({
              pendingRequired: false,
              setupMode: 'optional',
              optionalLead:
                'Your data uses a legacy folder keyed by user id. Set your LDAP workspace name below — your data will be copied to userWorkspaces/<name> and your REST API URL will use that name (not your user id).',
            });
            return;
          }
          basePath = '';
          databaseData = {};
          setWorkspaceChrome({ pendingRequired: true, setupMode: 'required' });
          if (treeEl) {
            treeEl.innerHTML =
              '<div class="fb-db-tree-empty">Choose a workspace name on the left (for example your LDAP id), then data will load here.</div>';
          }
        });
      });
  }

  function saveWorkspaceSlug() {
    var input = document.getElementById('fbDbWorkspaceSlug');
    var slug = sanitizeWorkspaceSlug(input && input.value);
    if (!slug) {
      showMsg('Use 2–48 characters: letters, digits, dot, underscore, or hyphen.', 'err');
      return;
    }
    if (!auth || !auth.currentUser || !database) return;
    var uid = auth.currentUser.uid;
    showMsg('Saving workspace name…', 'info');
    claimWorkspaceSlug(slug)
      .then(function () {
        return database.ref('userWorkspaces/' + uid).once('value');
      })
      .then(function (legacySnap) {
        var v = legacySnap.val();
        var copy =
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          Object.keys(v).length > 0;
        if (copy) {
          return database.ref('userWorkspaces/' + slug).set(v);
        }
      })
      .then(function () {
        workspaceSlug = slug;
        basePath = 'userWorkspaces/' + slug;
        setWorkspaceChrome({ pendingRequired: false, setupMode: 'hidden' });
        if (input) input.value = '';
        updateRestApiLink(auth.currentUser);
        showMsg('Workspace ready at userWorkspaces/' + slug + '.', 'ok');
        return refreshDatabase();
      })
      .catch(function (e) {
        var msg = e && e.message === 'taken' ? 'That name is already taken. Try another.' : String(e.message || e);
        showMsg(msg, 'err');
      });
  }

  function copyRestApiUrl() {
    var urlEl = document.getElementById('fbDbRestUrl');
    if (!urlEl || !urlEl.textContent) {
      if (auth && auth.currentUser && !workspaceSlug) {
        showMsg('Set your LDAP workspace name first — the REST URL will use userWorkspaces/<name>.json (not your user id).', 'err');
      } else {
        showMsg('Sign in to get an API URL.', 'err');
      }
      return;
    }
    var text = urlEl.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () {
          showMsg('REST API URL copied to clipboard.', 'ok');
        },
        function () {
          fallbackCopyText(text, 'REST API URL copied to clipboard.');
        },
      );
    } else {
      fallbackCopyText(text, 'REST API URL copied to clipboard.');
    }
  }

  function fallbackCopyText(text, successMsg) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showMsg(successMsg || 'Copied to clipboard.', 'ok');
    } catch (e) {
      showMsg('Could not copy. Select the URL and copy manually.', 'err');
    }
    document.body.removeChild(ta);
  }

  function syncAccountPanelCollapse(user) {
    var panel = document.getElementById('fbDbAccountDisclosure');
    var toggle = document.getElementById('fbDbAccountToggle');
    if (!panel || !toggle) return;
    if (user) {
      panel.classList.add('fb-db-account-disclosure--collapsed');
      toggle.setAttribute('aria-expanded', 'false');
    } else {
      panel.classList.remove('fb-db-account-disclosure--collapsed');
      toggle.setAttribute('aria-expanded', 'true');
    }
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
          var who = user.email || 'Guest ' + user.uid.slice(0, 8) + '…';
          setStatus('Signed in · ' + who, 'ok');
          cancelEdit();
          syncAccountPanelCollapse(user);
          resolveWorkspaceForUser(user)
            .then(function () {
              updateRestApiLink(user);
              if (basePath) {
                return refreshDatabase();
              }
              renderJsonView();
            })
            .catch(function (e) {
              showMsg(String(e.message || e), 'err');
            });
        } else {
          basePath = '';
          workspaceSlug = '';
          databaseData = {};
          viewRootRel = '';
          updateRestApiLink(null);
          setWorkspaceChrome({ pendingRequired: false, setupMode: 'hidden' });
          var def = document.getElementById('fbDbWorkspaceDeferred');
          if (def) def.hidden = false;
          renderJsonView();
          if (treeEl) {
            treeEl.innerHTML =
              '<div class="fb-db-tree-empty">Sign in or create an account to load your workspace.</div>';
          }
          setStatus('Not signed in', 'warn');
          cancelEdit();
          syncAccountPanelCollapse(null);
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
        cacheLoginEmail(x.email);
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
        cacheLoginEmail(x.email);
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
        cacheLoginEmail(x.email);
        showMsg('Check your inbox for a reset link.', 'ok');
      })
      .catch(function (e) {
        showMsg(authErrorMessage(e), 'err');
      });
  }

  function refreshDatabase() {
    if (!database) {
      showMsg('Firebase not ready.', 'err');
      return Promise.resolve();
    }
    if (!basePath) {
      if (auth && auth.currentUser) {
        showMsg('Choose a workspace name (LDAP-style) on the left first.', 'err');
      } else {
        showMsg('Sign in first.', 'err');
      }
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
    if (!treeEl) {
      renderJsonView();
      return;
    }
    treeEl.innerHTML = '';
    var root = viewRootRel ? getAtPath(databaseData, viewRootRel) : databaseData;
    if (root === undefined || root === null) {
      treeEl.innerHTML = '<div class="fb-db-tree-empty">No data at this path.</div>';
      renderJsonView();
      return;
    }
    if (typeof root !== 'object' || Array.isArray(root)) {
      treeEl.innerHTML =
        '<div class="fb-db-tree-empty">Value here is not an object. Use Refresh to reload the full workspace.</div>';
      renderJsonView();
      return;
    }
    if (Object.keys(root).length === 0) {
      treeEl.innerHTML = '<div class="fb-db-tree-empty">No keys here. Add a node or go up a path.</div>';
      renderJsonView();
      return;
    }
    renderSubtree(root, viewRootRel, treeEl);
    renderJsonView();
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
    renderJsonView();
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
  applyCachedLoginEmail();

  var pwEl = document.getElementById('fbDbPassword');
  if (pwEl) {
    pwEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') signInWithEmail();
    });
  }

  document.getElementById('fbDbAccountToggle') &&
    document.getElementById('fbDbAccountToggle').addEventListener('click', function () {
      if (!auth || !auth.currentUser) return;
      var panel = document.getElementById('fbDbAccountDisclosure');
      var toggle = document.getElementById('fbDbAccountToggle');
      if (!panel || !toggle) return;
      var collapsed = panel.classList.toggle('fb-db-account-disclosure--collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  document.getElementById('fbDbWorkspaceSlugSave') &&
    document.getElementById('fbDbWorkspaceSlugSave').addEventListener('click', saveWorkspaceSlug);
  var slugIn = document.getElementById('fbDbWorkspaceSlug');
  if (slugIn) {
    slugIn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveWorkspaceSlug();
    });
  }
  document.getElementById('fbDbSignIn') && document.getElementById('fbDbSignIn').addEventListener('click', signInWithEmail);
  document.getElementById('fbDbRegister') && document.getElementById('fbDbRegister').addEventListener('click', registerWithEmail);
  document.getElementById('fbDbAnonymous') && document.getElementById('fbDbAnonymous').addEventListener('click', signInAnonymous);
  document.getElementById('fbDbResetPassword') &&
    document.getElementById('fbDbResetPassword').addEventListener('click', sendPasswordReset);
  document.getElementById('fbDbCopyRestUrl') &&
    document.getElementById('fbDbCopyRestUrl').addEventListener('click', copyRestApiUrl);
  document.getElementById('fbDbViewTree') &&
    document.getElementById('fbDbViewTree').addEventListener('click', function () {
      setDataViewMode('tree');
    });
  document.getElementById('fbDbViewJson') &&
    document.getElementById('fbDbViewJson').addEventListener('click', function () {
      setDataViewMode('json');
    });
  document.getElementById('fbDbCopyJson') &&
    document.getElementById('fbDbCopyJson').addEventListener('click', copyJsonPanel);
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
