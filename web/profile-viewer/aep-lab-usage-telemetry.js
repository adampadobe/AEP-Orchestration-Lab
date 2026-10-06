(function (global) {
  'use strict';
  if (global.AepLabUsageTelemetry || global.top !== global.self) return;

  var config = null;
  var auth = null;
  var activeUid = null;
  var viewedUid = null;
  var generation = 0;
  var restoredPage = false;
  var pendingLogin = global.__aepUsageSignIn || null;
  var api = '/api/lab/usage/events';
  var heartbeatTimer = null;
  var heartbeatAt = null;
  var lastInteraction = -Infinity;
  global.AepLabUsageTelemetry = { ready: false };

  function report(code) {
    console.warn('[lab-usage] Usage reporting unavailable (' + code + '); lab use is unaffected.');
    global.dispatchEvent(new CustomEvent('aep-lab-usage-status', { detail: { ok: false, code: code } }));
  }
  function eligible(user) {
    return !!user && !user.isAnonymous && !!user.email;
  }
  function noticeStyles() {
    if (document.getElementById('aepLabUsageNoticeStyle')) return;
    var style = document.createElement('style');
    style.id = 'aepLabUsageNoticeStyle';
    style.textContent = '.aep-lab-usage-notice{padding:12px 16px;margin:0 0 16px;border:1px solid var(--dash-border);border-radius:var(--dash-radius-sm);background:var(--dash-surface-alt);color:var(--dash-text-secondary);font:inherit;font-size:13px;line-height:1.6;}';
    document.head.appendChild(style);
  }
  function signInNotice() {
    var form = document.getElementById('aepAccessOnbEmailForm');
    if (!form || document.getElementById('aepLabUsageSignInNotice')) return;
    var message = document.createElement('p');
    message.id = 'aepLabUsageSignInNotice';
    message.className = 'aep-lab-usage-notice';
    message.textContent = config.notice;
    message.setAttribute('role', 'note');
    form.before(message);
    noticeStyles();
  }
  function notice() {
    var main = document.querySelector('.dashboard-main');
    if (!main) return false;
    if (!document.getElementById('aepLabUsageNotice')) {
      var message = document.createElement('p');
      message.id = 'aepLabUsageNotice';
      message.className = 'aep-lab-usage-notice';
      message.textContent = config.notice;
      message.setAttribute('role', 'note');
      main.prepend(message);
      noticeStyles();
    }
    return true;
  }
  async function transmit(event, user, requestGeneration) {
    for (var attempt = 0; attempt < 2; attempt += 1) {
      if (requestGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 8000);
      var retry = false;
      try {
        var token = await user.getIdToken();
        if (requestGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
        var response = await fetch(api, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify(event), cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        });
        if (response.ok) return;
        retry = response.status >= 500;
        if (!retry || attempt === 1) {
          report('http-' + response.status);
          return;
        }
      } catch (error) {
        if (requestGeneration !== generation) return;
        if (attempt === 1 || String(error.code || '').indexOf('auth/') === 0) {
          report(error.name === 'AbortError' ? 'timeout' : 'request-failed');
          return;
        }
        retry = true;
      } finally {
        clearTimeout(timeout);
      }
      if (retry) await new Promise(function (resolve) { setTimeout(resolve, 1000); });
    }
  }
  function submit(type, user, login, activeMs) {
    if (!global.crypto || typeof global.crypto.randomUUID !== 'function') {
      report('event-id-unavailable');
      return;
    }
    var event = {
      version: 1, id: login ? login.id : crypto.randomUUID(), type: type,
      route: global.location.pathname, occurredAt: login ? login.occurredAt : new Date().toISOString(),
    };
    if (type === 'page_view') {
      var navigation = performance.getEntriesByType('navigation')[0]?.type;
      event.navigation = restoredPage ? 'back_forward'
        : ['navigate', 'reload', 'back_forward'].includes(navigation) ? navigation : 'auth_ready';
    }
    if (type === 'heartbeat') { event.version = 2; event.activeMs = activeMs; }
    void transmit(event, user, generation);
  }
  function resetHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    heartbeatAt = null;
    lastInteraction = -Infinity;
  }
  function heartbeat() {
    var current = performance.now();
    var previous = heartbeatAt;
    heartbeatAt = current;
    var user = auth && auth.currentUser;
    if (!config?.enabled || config.version !== 2 || !eligible(user)
        || document.visibilityState !== 'visible' || !document.hasFocus()
        || previous === null || current - previous > 30000 || current - previous < 1
        || current - lastInteraction > 60000 || !notice()) return;
    submit('heartbeat', user, null, Math.floor(current - previous));
  }
  function interacted(event) {
    if (!event.isTrusted || !config?.enabled || config.version !== 2
        || !eligible(auth?.currentUser) || document.visibilityState !== 'visible' || !document.hasFocus()) return;
    var current = performance.now();
    if (current - lastInteraction > 60000) heartbeatAt = current;
    lastInteraction = current;
    if (!heartbeatTimer) {
      heartbeatAt = lastInteraction;
      heartbeatTimer = setInterval(heartbeat, 15000);
    }
  }
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, interacted, { passive: true });
  });
  global.addEventListener('blur', resetHeartbeat);
  global.addEventListener('pagehide', resetHeartbeat);
  function collect() {
    var user = auth && auth.currentUser;
    if (!config?.enabled || !eligible(user) || document.visibilityState !== 'visible' || !notice()) return;
    if (viewedUid !== user.uid) {
      viewedUid = user.uid;
      submit('page_view', user);
    }
    if (pendingLogin) {
      var login = pendingLogin;
      pendingLogin = null;
      delete global.__aepUsageSignIn;
      if (login.uid === user.uid && Date.now() - Date.parse(login.occurredAt) <= 5 * 60000) {
        submit('sign_in', user, login);
      }
    }
  }
  global.addEventListener('aep-lab-sign-in-success', function () {
    pendingLogin = global.__aepUsageSignIn || null;
    collect();
  });
  global.addEventListener('aep-deferred-dashboard-mounted', collect);
  document.addEventListener('visibilitychange', function () {
    resetHeartbeat();
    collect();
  });
  global.addEventListener('pageshow', function (event) {
    if (event.persisted) { restoredPage = true; viewedUid = null; collect(); }
  });

  async function init() {
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 8000);
    try {
      var response = await fetch(api, { cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal });
      if (!response.ok) throw new Error('config-unavailable');
      config = await response.json();
      if (config.ok !== true || ![1, 2].includes(config.version) || !Array.isArray(config.routes)
          || typeof config.notice !== 'string') throw new Error('config-invalid');
      if (!config.enabled || !config.routes.includes(global.location.pathname)) {
        delete global.__aepUsageSignIn;
        return;
      }
      signInNotice();
      if (!global.firebase || typeof firebase.auth !== 'function') {
        report('auth-unavailable');
        return;
      }
      if (!firebase.apps.length) firebase.initializeApp(global.firebaseDatabaseConfig);
      auth = firebase.auth();
      auth.onAuthStateChanged(function (user) {
        var uid = eligible(user) ? user.uid : null;
        if (activeUid !== uid) {
          resetHeartbeat();
          generation += 1;
          activeUid = uid;
          viewedUid = null;
          if (!uid) {
            pendingLogin = null;
            delete global.__aepUsageSignIn;
            document.getElementById('aepLabUsageNotice')?.remove();
          }
        }
        collect();
      }, function () {
        resetHeartbeat();
        generation += 1;
        auth = null;
        activeUid = null;
        viewedUid = null;
        pendingLogin = null;
        delete global.__aepUsageSignIn;
        document.getElementById('aepLabUsageNotice')?.remove();
        report('auth-unavailable');
      });
      global.AepLabUsageTelemetry.ready = true;
    } catch (error) {
      report(error.name === 'AbortError' ? 'config-timeout' : 'config-unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else void init();
})(window);
