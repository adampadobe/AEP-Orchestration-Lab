/**
 * Per–AEP-sandbox lab data in Firestore (via Cloud Function + Firebase Auth).
 * Uses anonymous auth so each browser gets a stable uid without a login screen.
 * Syncs selected localStorage keys when the sandbox changes or after edits (debounced).
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
  ];

  var pushTimer = null;
  var lastKnownSandbox = null;
  var authStarted = false;

  function getSandbox() {
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return String(AepGlobalSandbox.getSandboxName() || '').trim();
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (e) {
      return '';
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

  function applyKeys(keys) {
    if (!keys || typeof keys !== 'object') return;
    for (var i = 0; i < SYNC_KEYS.length; i++) {
      var k = SYNC_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
      try {
        var v = keys[k];
        if (v === null || v === '') localStorage.removeItem(k);
        else localStorage.setItem(k, String(v));
      } catch (e) {}
    }
    try {
      document.dispatchEvent(new CustomEvent('aep-lab-sandbox-keys-applied', { detail: { keys: keys } }));
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

  function pushReplaceForSandbox(sandbox) {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization || !sandbox) return null;
      var keys = collectKeys();
      return fetch('/api/lab/sandbox-state', {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: JSON.stringify({ sandbox: sandbox, keys: keys, replace: true }),
      });
    });
  }

  function pullForSandbox(sandbox) {
    return authHeadersPromise().then(function (headers) {
      if (!headers.Authorization || !sandbox) return null;
      return fetch('/api/lab/sandbox-state?sandbox=' + encodeURIComponent(sandbox), {
        headers: headers,
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          if (data && data.ok && data.keys) applyKeys(data.keys);
        })
        .catch(function () {});
    });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      var sb = getSandbox();
      if (!sb) return;
      pushReplaceForSandbox(sb);
    }, 2000);
  }

  function onGlobalSandboxChange() {
    var next = getSandbox();
    var prev = lastKnownSandbox;
    if (prev && next && prev !== next) {
      pushReplaceForSandbox(prev).then(function () {
        return pullForSandbox(next);
      }).then(function () {
        lastKnownSandbox = next;
      });
    } else {
      lastKnownSandbox = next || lastKnownSandbox;
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
    var sb = getSandbox();
    lastKnownSandbox = sb || null;
    if (sb) {
      return pullForSandbox(sb).then(function () {
        lastKnownSandbox = getSandbox() || sb;
      });
    }
    return null;
  });

  global.AepLabSandboxSync = {
    notifyDirty: schedulePush,
    getAuthHeaders: authHeadersPromise,
    getSandbox: getSandbox,
    whenReady: global.__aepLabSyncReady,
  };

  global.addEventListener('aep-global-sandbox-change', onGlobalSandboxChange);

  global.__aepLabSyncReady.catch(function () {});
})(typeof window !== 'undefined' ? window : this);
