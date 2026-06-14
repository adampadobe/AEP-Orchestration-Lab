/**
 * Firestore sync for unified env bar prefs (GET/POST /api/lab/env-bar-preferences).
 * Requires Firebase Auth via AepLabSandboxSync (anonymous or Adobe sign-in).
 */
(function attachLabEnvBarPrefsSync(global) {
  'use strict';

  var API = '/api/lab/env-bar-preferences';
  var pushTimer = null;
  var pullInFlight = null;
  var readyResolve;
  var readyReject;
  var booted = false;

  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve;
    readyReject = reject;
  });

  function prefsModule() {
    return global.AepLabEnvBarPrefs || null;
  }

  function tagsInjectInProgress() {
    if (global.AepLabTagsInjectGuard && typeof global.AepLabTagsInjectGuard.isInProgress === 'function') {
      if (global.AepLabTagsInjectGuard.isInProgress()) return true;
    }
    try {
      var prefix = '';
      if (global.envBarConfig) {
        prefix = String(global.envBarConfig.storagePrefix || global.envBarConfig.prefix || '').trim();
      }
      if (!prefix) return false;
      return global.sessionStorage.getItem(prefix + 'InjectInProgress') === '1';
    } catch (_e) {
      return false;
    }
  }

  function authHeaders() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getAuthHeaders === 'function') {
      return global.AepLabSandboxSync.getAuthHeaders();
    }
    return Promise.resolve({});
  }

  function whenAuthReady() {
    if (global.AepLabSandboxSync && global.AepLabSandboxSync.whenReady) {
      return global.AepLabSandboxSync.whenReady.catch(function () {
        return null;
      });
    }
    if (global.__aepLabSyncReady && typeof global.__aepLabSyncReady.then === 'function') {
      return global.__aepLabSyncReady.catch(function () {
        return null;
      });
    }
    return Promise.resolve(null);
  }

  function pull() {
    if (pullInFlight) return pullInFlight;
    pullInFlight = whenAuthReady()
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        if (!headers || !headers.Authorization) return null;
        return global.fetch(API, { method: 'GET', headers: headers, cache: 'no-store' });
      })
      .then(function (res) {
        if (!res) return null;
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (body) {
            if (!res.ok || !body || !body.ok) return null;
            return body.preferences || null;
          });
      })
      .then(function (prefs) {
        if (prefs && prefsModule()) prefsModule().importFromSync(prefs);
        return prefs;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        pullInFlight = null;
      });
    return pullInFlight;
  }

  function pushNow() {
    var mod = prefsModule();
    if (!mod) return Promise.resolve(null);
    if (tagsInjectInProgress()) {
      return Promise.resolve(null);
    }
    return whenAuthReady()
      .then(function () {
        return authHeaders();
      })
      .then(function (headers) {
        if (!headers || !headers.Authorization) return null;
        var payload = mod.exportForSync();
        return global.fetch(API, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify(payload),
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (body) {
                if (res.ok && body && body.ok && body.preferences && mod.importFromSync) {
                  /* Server may sanitize — re-apply */
                  mod.importFromSync(body.preferences);
                }
                return body;
              });
          });
      })
      .catch(function () {
        return null;
      });
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushNow();
    }, 2000);
  }

  function bindListeners() {
    global.addEventListener('aep-lab-env-bar-prefs-change', schedulePush);
    global.addEventListener('aep-global-sandbox-change', function (ev) {
      var mod = prefsModule();
      if (!mod) return;
      var detail = ev && ev.detail ? ev.detail : {};
      if (tagsInjectInProgress() && detail.source === 'sync') {
        return;
      }
      var name =
        detail.name != null
          ? String(detail.name || '').trim()
          : global.AepGlobalSandbox && global.AepGlobalSandbox.getSandboxName
            ? String(global.AepGlobalSandbox.getSandboxName() || '').trim()
            : '';
      if (name) {
        mod.setSelectedSandbox(name, { explicit: detail.source === 'user' });
      } else {
        schedulePush();
      }
    });
  }

  function boot() {
    if (booted) return readyPromise;
    booted = true;
    bindListeners();
    whenAuthReady()
      .then(function () {
        return pull();
      })
      .then(function () {
        if (readyResolve) readyResolve(null);
      })
      .catch(function (err) {
        if (readyReject) readyReject(err);
        else if (readyResolve) readyResolve(null);
      });
    return readyPromise;
  }

  boot();

  global.AepLabEnvBarPrefsSync = {
    whenReady: readyPromise,
    pull: pull,
    pushNow: pushNow,
    schedulePush: schedulePush,
  };
})(typeof window !== 'undefined' ? window : globalThis);
