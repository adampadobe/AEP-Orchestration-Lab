/**
 * Lab debug mode — profile status under lookup (visible in minimized profile peek)
 * and optional Alloy sendEvent payload / Edge error detail.
 */
(function attachAepLabDebug(global) {
  'use strict';

  var STORAGE_KEY = 'aepLabDebugMode';
  var BC_DEBUG_KEY = 'aepLabBcEventsDebug';
  /** Set true to restore Lab debug mode checkbox + sendEvent payload panel. */
  var LAB_DEBUG_UI_ENABLED = false;
  var TOGGLE_ID = 'aepLabDebugModeToggle';
  var STATUS_ID = 'aepLabProfileStatus';
  var DETAIL_ID = 'aepLabDebugDetail';
  var MAX_DETAIL_LINES = 40;
  var detailLines = [];
  var legacyMirrorObs = null;

  function byId(id) {
    return id ? document.getElementById(id) : null;
  }

  function readStoredEnabled() {
    try {
      return global.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_e) {
      return false;
    }
  }

  function writeStoredEnabled(on) {
    try {
      global.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      global.localStorage.setItem(BC_DEBUG_KEY, on ? '1' : '0');
    } catch (_e2) {
      /* private mode */
    }
  }

  function isEnabled() {
    if (!LAB_DEBUG_UI_ENABLED) return false;
    var toggle = byId(TOGGLE_ID);
    if (toggle) return !!toggle.checked;
    return readStoredEnabled();
  }

  function typeClass(type) {
    var t = String(type || '').trim().toLowerCase();
    if (!t) return '';
    return ' mod-demo-message--' + t.replace(/\s+/g, '-');
  }

  function setProfileStatus(text, type) {
    var el = byId(STATUS_ID);
    if (!el) return;
    var msg = String(text || '').trim();
    if (!msg || /^Loading\b/i.test(msg)) {
      if (!msg) {
        el.textContent = '';
        el.hidden = true;
        el.className = 'aep-lab-profile-status mod-demo-message';
      }
      return;
    }
    el.textContent = msg;
    el.className = 'aep-lab-profile-status mod-demo-message' + typeClass(type);
    el.hidden = false;
  }

  function renderDetail() {
    var el = byId(DETAIL_ID);
    if (!el) return;
    if (!isEnabled() || !detailLines.length) {
      el.textContent = '';
      el.hidden = true;
      return;
    }
    el.textContent = detailLines.join('\n\n');
    el.hidden = false;
  }

  function pushDetail(block) {
    if (!isEnabled()) return;
    detailLines.push(String(block || '').trim());
    if (detailLines.length > MAX_DETAIL_LINES) {
      detailLines = detailLines.slice(detailLines.length - MAX_DETAIL_LINES);
    }
    renderDetail();
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_e) {
      return String(value);
    }
  }

  function logSendEvent(source, payload, result, err) {
    if (!isEnabled()) return;
    var label = '[' + String(source || 'sendEvent') + '] ' + new Date().toISOString();
    var block = label + '\n' + safeJson(payload || {});
    if (result !== undefined && result !== null) {
      block += '\n--- response ---\n' + safeJson(result);
    }
    if (err) {
      block +=
        '\n--- error ---\n' +
        (err && err.message ? err.message : safeJson(err));
    }
    pushDetail(block);
  }

  function wrapMessageSetter(fn) {
    if (typeof fn !== 'function') {
      return function (text, type) {
        setProfileStatus(text, type);
      };
    }
    return function (text, type) {
      try {
        fn(text, type);
      } finally {
        setProfileStatus(text, type);
      }
    };
  }

  function syncToggleFromStorage() {
    var toggle = byId(TOGGLE_ID);
    if (!toggle) return;
    var on = readStoredEnabled();
    toggle.checked = on;
    renderDetail();
  }

  function bindToggle() {
    if (!LAB_DEBUG_UI_ENABLED) return;
    var toggle = byId(TOGGLE_ID);
    if (!toggle || toggle.getAttribute('data-aep-lab-debug-bound') === '1') return;
    toggle.setAttribute('data-aep-lab-debug-bound', '1');
    syncToggleFromStorage();
    toggle.addEventListener('change', function () {
      writeStoredEnabled(!!toggle.checked);
      if (!toggle.checked) {
        detailLines = [];
      }
      renderDetail();
      if (toggle.checked) {
        installAlloyHook();
      }
    });
    if (toggle.checked) installAlloyHook();
  }

  function typeFromMessageClass(className) {
    var m = String(className || '').match(/mod-demo-message--([a-z0-9-]+)/i);
    return m ? m[1].replace(/-/g, '') : '';
  }

  function mirrorLegacyMessageEl() {
    if (legacyMirrorObs) {
      try {
        legacyMirrorObs.disconnect();
      } catch (_e) {
        /* noop */
      }
      legacyMirrorObs = null;
    }
    var candidates = document.querySelectorAll(
      '.lab-env-overlay-footer .mod-demo-message, .mod-demo-message[role="status"], p.mod-demo-message[id$="Message"]',
    );
    if (!candidates.length) return;
    var el = candidates[0];
    function syncFromLegacy() {
      if (!el || el.id === STATUS_ID) return;
      if (el.hidden && !el.textContent) return;
      setProfileStatus(el.textContent, typeFromMessageClass(el.className));
    }
    syncFromLegacy();
    if (typeof MutationObserver === 'undefined') return;
    legacyMirrorObs = new MutationObserver(syncFromLegacy);
    legacyMirrorObs.observe(el, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden'],
    });
  }

  function wrapAlloyInstance(native, win) {
    if (!native || native.__aepLabDebugWrapped) return native;
    var w = win || global;
    var wrapped = function (command) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (command === 'sendEvent' && isEnabled()) {
        var payload = args[0];
        return Promise.resolve(native.apply(w, [command].concat(args)))
          .then(function (result) {
            logSendEvent('alloy', payload, result, null);
            return result;
          })
          .catch(function (err) {
            logSendEvent('alloy', payload, null, err);
            throw err;
          });
      }
      return native.apply(w, [command].concat(args));
    };
    Object.keys(native).forEach(function (key) {
      try {
        wrapped[key] = native[key];
      } catch (_e2) {
        /* read-only */
      }
    });
    wrapped.__aepLabDebugWrapped = true;
    return wrapped;
  }

  function wrapAlloyOnWindow(win) {
    if (!win || !isEnabled()) return;
    if (typeof win.alloy === 'function') {
      win.alloy = wrapAlloyInstance(win.alloy, win);
    }
    (win.__alloyNS || []).forEach(function (name) {
      if (typeof win[name] === 'function') {
        win[name] = wrapAlloyInstance(win[name], win);
      }
    });
  }

  function installAlloyHook() {
    if (!isEnabled()) return;
    wrapAlloyOnWindow(global);
    try {
      var frame = global.document.getElementById('skyDemoSiteFrame');
      if (frame && frame.contentWindow) wrapAlloyOnWindow(frame.contentWindow);
    } catch (_e) {
      /* noop */
    }
  }

  function init() {
    bindToggle();
    mirrorLegacyMessageEl();
    if (isEnabled()) installAlloyHook();
  }

  if (!global.__aepLabDebugTagsListener) {
    global.__aepLabDebugTagsListener = true;
    global.addEventListener('aep-demo-tags-injected', function () {
      installAlloyHook();
    });
    global.addEventListener('aep-lab-edge-datastream-changed', function () {
      installAlloyHook();
    });
    global.addEventListener('aep-demo-env-strip-mounted', function () {
      global.setTimeout(init, 0);
    });
  }

  global.AepLabDebug = {
    isEnabled: isEnabled,
    setProfileStatus: setProfileStatus,
    wrapMessageSetter: wrapMessageSetter,
    logSendEvent: logSendEvent,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
