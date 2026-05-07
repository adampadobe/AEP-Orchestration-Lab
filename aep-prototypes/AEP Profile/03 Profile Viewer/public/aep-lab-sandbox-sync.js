/**
 * Per-scope lab data in Firestore (sandbox/workspace via Cloud Function + Firebase Auth).
 * Uses anonymous auth so each browser gets a stable uid without a login screen.
 * Syncs selected localStorage keys when the active scope changes or after edits (debounced).
 */
(function (global) {
  'use strict';

  var SYNC_KEYS = [
    'aep-profile-viewer-recent-identifiers-v1',
    'aepLaPayloadTemplatesV1',
    'aepLaExecutionFieldsV1',
    'aepIdentityNamespace',
    'aepDetailsChannelTab',
    'aep-profile-viewer-recent-search-terms',
    'genericProfileBaseEmail',
    'aepTheme',
    'aepMenuPalette',
    'aepBgPreset',
    'aepHomeDashboardLayoutBg',
    'aepHomeDashboardSidebarTheme',
    'aepExpVizImageUrls',
    'aepAgenticV2AgentUrls',
  ];

  var pushTimer = null;
  var lastKnownScopeId = null;
  var authStarted = false;

  function getScope() {
    if (typeof AepAccessScope !== 'undefined' && AepAccessScope.getScope) {
      return AepAccessScope.getScope();
    }
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return {
        scopeType: 'sandbox',
        scopeId: String(AepGlobalSandbox.getSandboxName() || '').trim(),
      };
    }
    try {
      return {
        scopeType: 'sandbox',
        scopeId: String(localStorage.getItem('aepGlobalSandboxName') || '').trim(),
      };
    } catch (e) {
      return { scopeType: 'sandbox', scopeId: '' };
    }
  }

  function ensureFirebase() {
    if (typeof firebase === 'undefined' || !global.firebaseDatabaseConfig) return false;
    if (!firebase.apps.length) {
      firebase.initializeApp(global.firebaseDatabaseConfig);
    }
    return true;
  }

  function collectKeys() {
    var o = {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var k = SYNC_KEYS[i];
      try {
        var v = localStorage.getItem(k);
        if (v != null && v !== '') o[k] = v;
      } catch (e) {}
    }
    return o;
  }

  /**
   * Apply Firestore snapshot for the *current* scope. Keys omitted from the server payload
   * are removed from localStorage so we never show another scope’s data (inputs fall back to placeholders).
   */
  function applyKeys(keys) {
    var kobj = keys && typeof keys === 'object' ? keys : {};
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var k = SYNC_KEYS[i];
      try {
        if (Object.prototype.hasOwnProperty.call(kobj, k)) {
          var v = kobj[k];
          if (v === null || v === '') localStorage.removeItem(k);
          else localStorage.setItem(k, String(v));
        } else {
          localStorage.removeItem(k);
        }
      } catch (e) {}
    }
    try {
      document.dispatchEvent(new CustomEvent('aep-lab-sandbox-keys-applied', { detail: { keys: kobj } }));
    } catch (e2) {}
  }

  function authHeadersPromise() {
    return new Promise(function (resolve) {
      if (!ensureFirebase()) {
        resolve({});
        return;
      }
      var auth = firebase.auth();
      var u = auth.currentUser;
      if (!u) {
        resolve({});
        return;
      }
      u.getIdToken()
        .then(function (t) {
          resolve(t ? { Authorization: 'Bearer ' + t } : {});
        })
        .catch(function () {
          resolve({});
        });
    });
  }

  function pushReplaceForScope(scope) {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization || !scope || !scope.scopeId) return null;
      var keys = collectKeys();
      var body = {
        sandbox: scope.scopeType === 'sandbox' ? scope.scopeId : '',
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        keys: keys,
        replace: true,
      };
      return fetch('/api/lab/sandbox-state', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify(body),
      });
    });
  }

  function pullForScope(scope) {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization || !scope || !scope.scopeId) return null;
      var qs = new URLSearchParams();
      if (scope.scopeType === 'workspace') {
        qs.set('scopeType', 'workspace');
        qs.set('scopeId', scope.scopeId);
      } else {
        qs.set('sandbox', scope.scopeId);
      }
      return fetch('/api/lab/sandbox-state?' + qs.toString(), {
        headers: headers,
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (data && data.ok) applyKeys(data.keys || {});
        })
        .catch(function () {});
    });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var scope = getScope();
      if (!scope || !scope.scopeId) return;
      pushReplaceForScope(scope);
    }, 2000);
  }

  function onGlobalSandboxChange() {
    var next = getScope();
    var prev = lastKnownScopeId;
    var nextId = next && next.scopeType ? (next.scopeType + ':' + next.scopeId) : '';
    if (prev && nextId && prev !== nextId) {
      var prevSplit = prev.split(':');
      var prevScope = { scopeType: prevSplit[0] || 'sandbox', scopeId: prevSplit.slice(1).join(':') };
      pushReplaceForScope(prevScope).then(function () {
        return pullForScope(next);
      }).then(function () {
        lastKnownScopeId = nextId;
        try {
          global.dispatchEvent(
            new CustomEvent('aep-lab-sandbox-synced', { detail: { sandbox: next.scopeId, scopeType: next.scopeType, previous: prev } })
          );
        } catch (e) {}
      });
    } else {
      lastKnownScopeId = nextId || lastKnownScopeId;
    }
  }

  function bootAuth() {
    if (authStarted) return;
    authStarted = true;
    if (!ensureFirebase()) return Promise.resolve(null);
    var auth = firebase.auth();
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return auth.signInAnonymously().catch(function () {
      return null;
    });
  }

  global.__aepLabSyncReady = bootAuth().then(function () {
    var scope = getScope();
    var scopeId = scope && scope.scopeType ? (scope.scopeType + ':' + scope.scopeId) : '';
    lastKnownScopeId = scopeId || null;
    if (scope && scope.scopeId) {
      return pullForScope(scope).then(function () {
        var latest = getScope();
        lastKnownScopeId = latest && latest.scopeType ? (latest.scopeType + ':' + latest.scopeId) : scopeId;
      });
    }
    return null;
  });

  global.AepLabSandboxSync = {
    notifyDirty: schedulePush,
    getAuthHeaders: authHeadersPromise,
    getSandbox: function () {
      var scope = getScope();
      return scope && scope.scopeType === 'sandbox' ? scope.scopeId : '';
    },
    getScope: getScope,
    whenReady: global.__aepLabSyncReady,
  };

  global.addEventListener('aep-global-sandbox-change', onGlobalSandboxChange);
  global.addEventListener('aep-access-scope-change', onGlobalSandboxChange);

  global.__aepLabSyncReady.catch(function () {});
})(typeof window !== 'undefined' ? window : this);
