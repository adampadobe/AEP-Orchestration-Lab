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
  var authMonitorStarted = false;
  var tokenHealthTimer = null;
  var forcedLogoutInProgress = false;
  var FORCED_LOGOUT_EVENT = 'aep-access-forced-logout';
  var FORCE_ONBOARDING_FLAG = 'aepAccessForceOnboarding';
  var AUTH_POLL_MS = 60000;

  var AUTH_SESSION_ERROR_CODES = {
    'auth/invalid-user-token': true,
    'auth/user-token-expired': true,
    'auth/user-disabled': true,
    'auth/user-not-found': true,
    'auth/invalid-credential': true,
    'auth/id-token-expired': true,
    'auth/id-token-revoked': true,
  };

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
        .catch(function (error) {
          handleAuthFailure(error, { source: 'get-auth-headers' });
          resolve({});
        });
    });
  }

  function getErrorCode(error) {
    return String((error && error.code) || '').trim();
  }

  function extractApiErrorCode(payload) {
    var direct = String((payload && payload.code) || '').trim();
    if (direct) return direct;
    return String((payload && payload.errorCode) || '').trim();
  }

  function isAuthSessionErrorCode(code) {
    var normalized = String(code || '').trim();
    if (!normalized) return false;
    if (AUTH_SESSION_ERROR_CODES[normalized]) return true;
    if (normalized.indexOf('auth/') === 0 && normalized.indexOf('token') >= 0) return true;
    return false;
  }

  function isAuthApiFailure(status, payload) {
    if (!(status === 401 || status === 403)) return false;
    var code = extractApiErrorCode(payload);
    if (isAuthSessionErrorCode(code)) return true;
    var errorText = String((payload && payload.error) || '').toLowerCase();
    return errorText.indexOf('token') >= 0 || errorText.indexOf('user disabled') >= 0 || errorText.indexOf('user not found') >= 0;
  }

  function clearWorkspaceIndicators() {
    if (typeof AepAccessScope !== 'undefined' && AepAccessScope && typeof AepAccessScope.resetWorkspaceAccess === 'function') {
      AepAccessScope.resetWorkspaceAccess();
      return;
    }
    try { localStorage.removeItem('aepWorkspaceName'); } catch (_e1) {}
    try { localStorage.removeItem('aepWorkspaceSlug'); } catch (_e2) {}
    try { localStorage.setItem('aepAccessMode', 'sandbox'); } catch (_e3) {}
  }

  function markOnboardingRequired() {
    try { localStorage.setItem(FORCE_ONBOARDING_FLAG, '1'); } catch (_e) {}
  }

  function redirectToOnboardingIfNeeded() {
    try {
      var pathname = String((global.location && global.location.pathname) || '');
      var isHome = /\/home\.html$/i.test(pathname);
      if (!isHome) {
        global.location.assign('home.html?accessSetup=1&forcedLogout=1');
      }
    } catch (_e) {}
  }

  function forceLogout(detail) {
    if (forcedLogoutInProgress) return Promise.resolve();
    forcedLogoutInProgress = true;
    clearTimeout(pushTimer);
    lastKnownScopeId = null;
    var currentScope = getScope();
    var shouldRequireOnboarding = currentScope && currentScope.scopeType === 'workspace';
    if (shouldRequireOnboarding) {
      clearWorkspaceIndicators();
      markOnboardingRequired();
    }
    try {
      global.dispatchEvent(new CustomEvent(FORCED_LOGOUT_EVENT, {
        detail: Object.assign({
          reason: 'firebase-session-invalid',
          requireOnboarding: !!shouldRequireOnboarding,
        }, detail || {}),
      }));
    } catch (_eventError) {}
    if (!ensureFirebase() || typeof firebase.auth !== 'function') {
      if (shouldRequireOnboarding) redirectToOnboardingIfNeeded();
      forcedLogoutInProgress = false;
      return Promise.resolve();
    }
    return firebase.auth().signOut()
      .catch(function () {})
      .then(function () {
        if (shouldRequireOnboarding) {
          redirectToOnboardingIfNeeded();
          return null;
        }
        return firebase.auth().signInAnonymously().catch(function () {
          return null;
        });
      })
      .finally(function () {
        forcedLogoutInProgress = false;
      });
  }

  function handleAuthFailure(error, detail) {
    var code = getErrorCode(error);
    if (!isAuthSessionErrorCode(code)) return;
    forceLogout(Object.assign({
      code: code,
      source: 'firebase-auth',
      message: String((error && error.message) || ''),
    }, detail || {}));
  }

  function monitorActiveSession(auth) {
    if (authMonitorStarted || !auth) return;
    authMonitorStarted = true;
    auth.onIdTokenChanged(function (user) {
      if (!user || forcedLogoutInProgress) return;
      user.getIdToken(true).catch(function (error) {
        handleAuthFailure(error, { source: 'id-token-change' });
      });
    });
    tokenHealthTimer = global.setInterval(function () {
      if (forcedLogoutInProgress) return;
      var user = auth.currentUser;
      if (!user) return;
      user.getIdToken(true).catch(function (error) {
        handleAuthFailure(error, { source: 'auth-health-poll' });
      });
    }, AUTH_POLL_MS);
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
      }).then(function (res) {
        if (res.ok) return res;
        return res.json()
          .catch(function () { return {}; })
          .then(function (payload) {
            if (isAuthApiFailure(res.status, payload)) {
              return forceLogout({
                source: 'sandbox-state-push',
                code: extractApiErrorCode(payload),
                message: String((payload && payload.error) || ''),
                status: res.status,
              });
            }
            return null;
          });
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
          return res.json().catch(function () { return {}; }).then(function (payload) {
            return { status: res.status, ok: res.ok, payload: payload || {} };
          });
        })
        .then(function (resp) {
          if (!resp) return;
          if (!resp.ok) {
            if (isAuthApiFailure(resp.status, resp.payload)) {
              return forceLogout({
                source: 'sandbox-state-pull',
                code: extractApiErrorCode(resp.payload),
                message: String((resp.payload && resp.payload.error) || ''),
                status: resp.status,
              });
            }
            return;
          }
          var data = resp.payload;
          if (data && data.ok) applyKeys(data.keys || {});
        })
        .catch(function () {});
    });
  }

  function schedulePush() {
    if (forcedLogoutInProgress) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var scope = getScope();
      if (!scope || !scope.scopeId) return;
      pushReplaceForScope(scope);
    }, 2000);
  }

  function onGlobalSandboxChange() {
    if (forcedLogoutInProgress) return;
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
    monitorActiveSession(auth);
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return auth.signInAnonymously().catch(function (error) {
      handleAuthFailure(error, { source: 'sign-in-anonymous' });
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
