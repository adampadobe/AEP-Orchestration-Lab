/**
 * Shared Adobe Alloy web push helpers for Profile Viewer lab demos.
 *
 * Hosts the Adobe service worker at `alloyServiceWorker.min.js` (vendored from
 * `https://cdn1.adoberesources.net/alloy/2.30.0/alloyServiceWorker.min.js` — keep in
 * sync with the Web SDK / Tags extension version that supports `sendPushSubscription`).
 *
 * Push surface config (VAPID public key, applicationId, trackingDatasetId) belongs in
 * Tags / Web SDK `pushNotifications` — not private VAPID keys in this repo.
 *
 * Call `ensureServiceWorkerRegistered` from the same top-level document that loads Alloy
 * (not from sandboxed iframes). Sandbox / datastream follow `DemoTagsInjection` + Tags.
 */
(function attachAepDemoWebPush(global) {
  var doc = global.document;
  var nav = global.navigator;

  var DEFAULT_WORKER_URL = '/profile-viewer/alloyServiceWorker.min.js';
  var DEFAULT_SCOPE = '/profile-viewer/';

  var LOG = '[AepDemoWebPush]';
  function log() {
    if (typeof global.console === 'undefined' || !global.console.log) return;
    try {
      var a = [LOG].concat(Array.prototype.slice.call(arguments));
      global.console.log.apply(global.console, a);
    } catch (_e) {
      /* noop */
    }
  }

  function getSandboxKey() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      var raw = String(global.AepGlobalSandbox.getSandboxName() || '')
        .trim()
        .toLowerCase();
      return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
    }
    return '__default__';
  }

  function readThrottleMap(storageKey) {
    try {
      var raw = global.localStorage.getItem(storageKey);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_e) {
      return {};
    }
  }

  function writeThrottleMap(storageKey, map) {
    try {
      global.localStorage.setItem(storageKey, JSON.stringify(map || {}));
    } catch (_e) {
      /* noop */
    }
  }

  function throttleStorageKey(storagePrefix) {
    return String(storagePrefix || 'demoTagsInjection') + 'WebPushLastSentDayBySandbox';
  }

  function todayUtcDateString() {
    return new Date().toISOString().slice(0, 10);
  }

  function waitForAlloy(timeoutMs) {
    return new Promise(function (resolve) {
      var start = Date.now();
      function poll() {
        if (typeof global.alloy === 'function') {
          resolve(global.alloy);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        global.setTimeout(poll, 120);
      }
      poll();
    });
  }

  var registerPromise = null;
  var lastRegisterOptsKey = '';

  function normaliseRegisterOpts(opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var url = String(o.workerScriptUrl || o.workerUrl || DEFAULT_WORKER_URL).trim() || DEFAULT_WORKER_URL;
    var scope = String(o.scope || DEFAULT_SCOPE).trim() || DEFAULT_SCOPE;
    return { workerScriptUrl: url, scope: scope };
  }

  /**
   * Idempotent `navigator.serviceWorker.register` for Adobe's Alloy worker.
   * @param {{ workerScriptUrl?: string, scope?: string }} [opts]
   * @returns {Promise<ServiceWorkerRegistration|null>}
   */
  function ensureServiceWorkerRegistered(opts) {
    if (!nav || !('serviceWorker' in nav)) {
      log('ensureServiceWorkerRegistered: no serviceWorker API');
      return Promise.resolve(null);
    }
    var norm = normaliseRegisterOpts(opts);
    var key = norm.workerScriptUrl + '\0' + norm.scope;
    if (registerPromise && lastRegisterOptsKey !== key) {
      registerPromise = null;
    }
    lastRegisterOptsKey = key;
    if (!registerPromise) {
      registerPromise = nav.serviceWorker
        .register(norm.workerScriptUrl, { scope: norm.scope })
        .then(function (reg) {
          log('registered', { scope: reg.scope, script: norm.workerScriptUrl });
          return reg;
        })
        .catch(function (err) {
          registerPromise = null;
          log('register failed', err && err.message ? err.message : String(err));
          throw err;
        });
    }
    return registerPromise.catch(function () {
      return null;
    });
  }

  /**
   * After Tags inject + ECID: optionally request notification permission, then
   * `alloy("sendPushSubscription")` when permission is granted (requires Web SDK
   * `pushNotifications` in configure — Web SDK 2.29+).
   *
   * @param {{
   *   storagePrefix?: string,
   *   workerScriptUrl?: string,
   *   scope?: string,
   *   requestPermission?: boolean,
   *   skipDailyThrottle?: boolean,
   *   alloyWaitMs?: number
   * }} [opts]
   * @returns {Promise<boolean>} true when the Alloy command resolved
   */
  function sendPushSubscriptionIfReady(opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    if (!nav || !('serviceWorker' in nav) || typeof global.Notification === 'undefined') {
      log('sendPushSubscriptionIfReady: unsupported environment');
      return Promise.resolve(false);
    }
    var storagePrefix = String(o.storagePrefix || 'demoTagsInjection');
    var throttleKey = throttleStorageKey(storagePrefix);
    var sandboxKey = getSandboxKey();
    if (o.skipDailyThrottle !== true) {
      var map = readThrottleMap(throttleKey);
      if (map[sandboxKey] === todayUtcDateString()) {
        log('sendPushSubscriptionIfReady: skipped (already sent today for sandbox)', sandboxKey);
        return Promise.resolve(false);
      }
    }

    return ensureServiceWorkerRegistered(o).then(function () {
      if (global.Notification.permission === 'denied') {
        log('sendPushSubscriptionIfReady: permission denied');
        return false;
      }
      if (global.Notification.permission === 'default' && o.requestPermission === true) {
        return Promise.resolve(global.Notification.requestPermission()).then(function (p) {
          return p === 'granted';
        });
      }
      return global.Notification.permission === 'granted';
    }).then(function (allowed) {
      if (!allowed) {
        log('sendPushSubscriptionIfReady: no notification permission');
        return false;
      }
      var waitMs = typeof o.alloyWaitMs === 'number' && o.alloyWaitMs > 0 ? o.alloyWaitMs : 8000;
      return waitForAlloy(waitMs).then(function (alloyFn) {
        if (!alloyFn) {
          log('sendPushSubscriptionIfReady: alloy not available');
          return false;
        }
        return Promise.resolve()
          .then(function () {
            return new Promise(function (r) {
              global.setTimeout(r, 400);
            });
          })
          .then(function () {
            return alloyFn('sendPushSubscription');
          })
          .then(function () {
            log('sendPushSubscription: success');
            if (o.skipDailyThrottle !== true) {
              var m = readThrottleMap(throttleKey);
              m[sandboxKey] = todayUtcDateString();
              writeThrottleMap(throttleKey, m);
            }
            return true;
          })
          .catch(function (err) {
            log('sendPushSubscription: error', err && err.message ? err.message : String(err));
            return false;
          });
      });
    });
  }

  /**
   * User gesture path: request permission (if needed) and send subscription (ignores daily throttle).
   * @param {{ storagePrefix?: string, workerScriptUrl?: string, scope?: string }} [opts]
   */
  function promptAndSubscribe(opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    return sendPushSubscriptionIfReady(
      Object.assign({}, o, { requestPermission: true, skipDailyThrottle: true })
    );
  }

  if (doc && doc.readyState === 'loading') {
    doc.addEventListener(
      'DOMContentLoaded',
      function () {
        log('module loaded (DOMContentLoaded)');
      },
      { once: true }
    );
  }

  global.AepDemoWebPush = {
    ensureServiceWorkerRegistered: ensureServiceWorkerRegistered,
    sendPushSubscriptionIfReady: sendPushSubscriptionIfReady,
    promptAndSubscribe: promptAndSubscribe,
  };
})(window);
