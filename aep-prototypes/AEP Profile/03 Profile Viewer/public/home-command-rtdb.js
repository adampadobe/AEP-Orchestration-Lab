/**
 * Firebase Realtime Database sync for Solutions Consultant Command Centre.
 * Path: userWorkspaces/{ldapSlug}/commandCentre/{sandboxKey}
 */
(function attachHomeCommandRtdb(global) {
  'use strict';

  var STORAGE_VERSION = 'v1';
  var SAVE_DEBOUNCE_MS = 600;
  var saveTimer = null;
  var valueListener = null;
  var suppressRemoteUntil = 0;
  var cachedWorkspaceSlug = '';
  var lastSeenUid = '';
  var syncStatus = 'idle';
  var remoteListeners = [];

  function normalizeSlug(raw) {
    if (global.AepLdapSlug && typeof global.AepLdapSlug.normalizeLdapSlug === 'function') {
      return global.AepLdapSlug.normalizeLdapSlug(raw);
    }
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return '';
    return s;
  }

  function normalizeSandboxKey(raw) {
    var s = String(raw || 'no-sandbox')
      .trim()
      .toLowerCase()
      .replace(/[.#$\[\]/]/g, '_')
      .replace(/[^a-z0-9._-]/g, '_');
    return s.slice(0, 64) || 'no-sandbox';
  }

  function ensureFirebaseApp() {
    if (typeof firebase === 'undefined' || !global.firebaseDatabaseConfig) return false;
    if (
      global.firebaseDatabaseConfigIsComplete &&
      typeof global.firebaseDatabaseConfigIsComplete === 'function' &&
      !global.firebaseDatabaseConfigIsComplete()
    ) {
      return false;
    }
    if (!firebase.apps.length) {
      try {
        firebase.initializeApp(global.firebaseDatabaseConfig);
      } catch (_e) {
        return false;
      }
    }
    return !!(firebase.database && firebase.auth);
  }

  function getDatabase() {
    return ensureFirebaseApp() ? firebase.database() : null;
  }

  function getAuthUser() {
    try {
      if (!firebase || !firebase.auth) return null;
      return firebase.auth().currentUser;
    } catch (_e) {
      return null;
    }
  }

  function resolveSandboxKey() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      var sb = global.AepLabSandboxSync.getSandbox();
      if (sb) return normalizeSandboxKey(sb);
    }
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      var name = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      if (name) return normalizeSandboxKey(name);
    }
    try {
      var ls = String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
      if (ls) return normalizeSandboxKey(ls);
    } catch (_e2) {}
    return 'no-sandbox';
  }

  function ldapFromEmail(user) {
    if (!user) return '';
    if (global.AepLdapSlug && typeof global.AepLdapSlug.ldapSlugFromEmail === 'function') {
      return normalizeSlug(global.AepLdapSlug.ldapSlugFromEmail(user.email));
    }
    var email = String(user.email || '').trim().toLowerCase();
    if (!email) return '';
    return normalizeSlug(email.split('@')[0]);
  }

  function fetchWorkspaceProfileSlug() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders().then(function (headers) {
        if (!headers || !headers.Authorization) return '';
        return fetch('/api/lab/workspace-profile', { headers: headers })
          .then(function (res) {
            return res.ok ? res.json() : null;
          })
          .then(function (data) {
            return normalizeSlug(data && data.profile && data.profile.workspaceSlug);
          })
          .catch(function () {
            return '';
          });
      });
    }
    return Promise.resolve('');
  }

  function resolveWorkspaceSlugFromRtdb(uid) {
    var db = getDatabase();
    if (!db || !uid) return Promise.resolve('');
    return db
      .ref('userWorkspaceOwners/' + uid)
      .once('value')
      .then(function (snap) {
        return normalizeSlug(snap.val());
      })
      .catch(function () {
        return '';
      });
  }

  /**
   * A shared/kiosk browser can carry a previous user's `aepWorkspaceSlug`
   * localStorage value (set by aep-access-scope.js, scoped to the origin —
   * not the uid) into a new user's session. Wipe both the in-memory cache
   * and that localStorage fallback the moment the authenticated uid changes,
   * so it can never leak one user's workspace/deal data into another's.
   */
  function clearStaleScopeIfUidChanged(uid) {
    if (lastSeenUid && uid && lastSeenUid !== uid) {
      cachedWorkspaceSlug = '';
      try {
        if (global.AepAccessScope && typeof global.AepAccessScope.resetWorkspaceAccess === 'function') {
          global.AepAccessScope.resetWorkspaceAccess();
        }
      } catch (_e) {}
    }
    if (uid) lastSeenUid = uid;
  }

  function resolveWorkspaceSlug() {
    var user = getAuthUser();
    if (!user) return Promise.resolve('');
    clearStaleScopeIfUidChanged(user.uid);
    if (cachedWorkspaceSlug) return Promise.resolve(cachedWorkspaceSlug);

    // Authoritative, uid-keyed sources first (RTDB owner record, then the
    // Firestore-backed workspace-profile API) — the localStorage-based
    // AepAccessScope.getWorkspaceSlug() is an origin-scoped fallback, not a
    // uid-scoped one, so it must never be tried ahead of a real per-user
    // lookup or it can resolve to whichever user last set it in this browser.
    return resolveWorkspaceSlugFromRtdb(user.uid)
      .then(function (slug) {
        if (slug) return slug;
        return fetchWorkspaceProfileSlug();
      })
      .then(function (slug) {
        if (slug) return slug;
        try {
          if (global.AepAccessScope && typeof global.AepAccessScope.getWorkspaceSlug === 'function') {
            slug = normalizeSlug(global.AepAccessScope.getWorkspaceSlug());
            if (slug) return slug;
          }
        } catch (_e) {}
        return '';
      })
      .then(function (slug) {
        if (!slug) slug = ldapFromEmail(user);
        if (!slug && user.uid) slug = normalizeSlug(user.uid);
        if (slug) cachedWorkspaceSlug = slug;
        return slug;
      });
  }

  function stateRef(db, workspaceSlug, sandboxKey) {
    return db.ref(
      'userWorkspaces/' + workspaceSlug + '/commandCentre/' + sandboxKey
    );
  }

  function parseRemoteState(val) {
    if (!val || typeof val !== 'object') return null;
    return {
      version: STORAGE_VERSION,
      customers: Array.isArray(val.customers) ? val.customers : [],
      tasks: Array.isArray(val.tasks) ? val.tasks : [],
      meetings: Array.isArray(val.meetings) ? val.meetings : [],
      activity: Array.isArray(val.activity) ? val.activity : [],
      pocs: Array.isArray(val.pocs) ? val.pocs : [],
      knowledgeBase: Array.isArray(val.knowledgeBase) ? val.knowledgeBase : [],
      capacity: Array.isArray(val.capacity) ? val.capacity : [],
      updatedAt: val.updatedAt || new Date().toISOString(),
    };
  }

  function notifyRemote(state) {
    remoteListeners.forEach(function (fn) {
      try {
        fn(state);
      } catch (_e) {}
    });
  }

  function setSyncStatus(next) {
    syncStatus = next;
    try {
      global.dispatchEvent(
        new CustomEvent('aep-command-centre-sync', { detail: { status: next } })
      );
    } catch (_e2) {}
  }

  function detachListener() {
    if (valueListener && valueListener.ref && valueListener.handler) {
      valueListener.ref.off('value', valueListener.handler);
    }
    valueListener = null;
  }

  function loadRemote() {
    var db = getDatabase();
    var user = getAuthUser();
    if (!db || !user) {
      setSyncStatus('offline');
      return Promise.resolve(null);
    }
    setSyncStatus('loading');
    return resolveWorkspaceSlug().then(function (workspaceSlug) {
      if (!workspaceSlug) {
        setSyncStatus('offline');
        return null;
      }
      var sandboxKey = resolveSandboxKey();
      var ref = stateRef(db, workspaceSlug, sandboxKey);
      return ref.once('value').then(function (snap) {
        setSyncStatus('ready');
        return {
          state: parseRemoteState(snap.val()),
          ref: ref,
          workspaceSlug: workspaceSlug,
          sandboxKey: sandboxKey,
        };
      });
    });
  }

  function attachListener(meta, onRemote) {
    if (!meta || !meta.ref || typeof onRemote !== 'function') return;
    detachListener();
    var handler = function (snap) {
      if (Date.now() < suppressRemoteUntil) return;
      var parsed = parseRemoteState(snap.val());
      if (parsed) onRemote(parsed);
    };
    meta.ref.on('value', handler);
    valueListener = { ref: meta.ref, handler: handler };
  }

  function connect(onRemote) {
    detachListener();
    cachedWorkspaceSlug = '';
    return loadRemote().then(function (meta) {
      if (!meta || !meta.ref) return null;
      attachListener(meta, onRemote);
      return meta.state;
    });
  }

  function saveState(state) {
    var db = getDatabase();
    var user = getAuthUser();
    if (!db || !user) return Promise.resolve(false);

    var payload = Object.assign({}, state, {
      version: STORAGE_VERSION,
      updatedAt: new Date().toISOString(),
    });

    return resolveWorkspaceSlug().then(function (workspaceSlug) {
      if (!workspaceSlug) return false;
      var sandboxKey = resolveSandboxKey();
      var ref = stateRef(db, workspaceSlug, sandboxKey);
      suppressRemoteUntil = Date.now() + SAVE_DEBOUNCE_MS + 400;
      setSyncStatus('saving');
      return ref.set(payload).then(
        function () {
          setSyncStatus('ready');
          return true;
        },
        function () {
          setSyncStatus('error');
          return false;
        }
      );
    });
  }

  function scheduleSave(state) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveState(state);
    }, SAVE_DEBOUNCE_MS);
  }

  function resetScope() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    detachListener();
    cachedWorkspaceSlug = '';
    lastSeenUid = '';
    setSyncStatus('idle');
  }

  function onRemoteSubscribe(fn) {
    if (typeof fn === 'function') remoteListeners.push(fn);
    return function () {
      remoteListeners = remoteListeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function getSyncStatus() {
    return syncStatus;
  }

  function isAuthenticated() {
    return !!getAuthUser();
  }

  global.HomeCommandRtdb = {
    connect: connect,
    loadRemote: loadRemote,
    saveState: saveState,
    scheduleSave: scheduleSave,
    resetScope: resetScope,
    onRemoteSubscribe: onRemoteSubscribe,
    getSyncStatus: getSyncStatus,
    isAuthenticated: isAuthenticated,
    resolveWorkspaceSlug: resolveWorkspaceSlug,
    resolveSandboxKey: resolveSandboxKey,
  };
})(window);
