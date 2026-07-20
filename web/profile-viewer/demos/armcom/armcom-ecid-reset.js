/**
 * Arm demo — reset anonymous visitor ECID (cookies, session keys, fake audiences, drawer).
 */
(function (global) {
  'use strict';

  var STORAGE_PREFIX = 'armcom';
  var ECID_BY_SANDBOX_KEY = STORAGE_PREFIX + 'LastResolvedEcidBySandbox';

  var SESSION_KEYS = [
    'armcomFakeAudienceStage',
    'armcomJourneySlideIndex',
    'aep-demo-session-identifier-v1',
    STORAGE_PREFIX + 'PendingLaunchInject',
    STORAGE_PREFIX + 'InjectInProgress',
    STORAGE_PREFIX + 'InjectSandboxSnapshot',
  ];

  function isArmcomLabPage() {
    if (!global.document || !document.body) return false;
    return (
      document.body.classList.contains('armcom-demo-page') ||
      document.body.classList.contains('armcom-mobile-demo-page')
    );
  }

  function expireCookie(name) {
    var expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = name + '=; Max-Age=0; path=/; ' + expire;
    var host = global.location && global.location.hostname ? global.location.hostname : '';
    if (!host) return;
    document.cookie = name + '=; Max-Age=0; path=/; domain=' + host + '; ' + expire;
    var dot = host.indexOf('.') !== -1 ? host.replace(/^www\./, '') : '';
    if (dot && dot !== host) {
      document.cookie = name + '=; Max-Age=0; path=/; domain=.' + dot + '; ' + expire;
    }
  }

  /** Best-effort clear of Adobe tracking cookies (HttpOnly values cannot be cleared from script). */
  function clearTrackingCookiesBestEffort() {
    if (typeof document === 'undefined') return;
    try {
      var names = new Set();
      document.cookie.split(';').forEach(function (part) {
        var name = part.split('=')[0].trim();
        if (!name) return;
        if (/^kndctr_.*_AdobeOrg_(identity|consent|cluster)$/.test(name)) names.add(name);
        if (/^AMCV/i.test(name) || /^AMCVS/i.test(name)) names.add(name);
      });
      names.forEach(expireCookie);
    } catch (_e) {
      /* noop */
    }
  }

  function clearArmcomLocalEcidCache() {
    try {
      localStorage.removeItem(ECID_BY_SANDBOX_KEY);
    } catch (_e) {
      /* noop */
    }
  }

  function clearArmcomSessionKeys() {
    SESSION_KEYS.forEach(function (key) {
      try {
        sessionStorage.removeItem(key);
      } catch (_e) {
        /* noop */
      }
    });
  }

  function clearCustomerEmailField() {
    var el = document.getElementById('customerEmail');
    if (el) el.value = '';
  }

  function resolveArmcomIframe() {
    return (
      document.getElementById('armcomSiteFrame') ||
      document.getElementById('armcomMobileFrame') ||
      null
    );
  }

  function reloadArmcomIframe() {
    var frame = resolveArmcomIframe();
    if (!frame) return;
    try {
      if (frame.contentWindow && frame.contentWindow.location) {
        frame.contentWindow.location.reload();
        return;
      }
    } catch (_e) {
      /* cross-origin or not loaded */
    }
    try {
      var src = frame.getAttribute('src') || frame.src || '';
      if (src) frame.src = src;
    } catch (_e2) {
      /* noop */
    }
  }

  function setArmcomLabMessage(text, type) {
    var el = document.getElementById('armcomMessage');
    if (!el) return;
    el.textContent = text || '';
    el.className =
      'armcom-demo-message' + (type ? ' armcom-demo-message--' + String(type).replace(/\s+/g, '-') : '');
    el.hidden = !text;
  }

  function waitForAlloy(maxMs) {
    var cap = maxMs != null ? maxMs : 8000;
    var started = Date.now();
    return new Promise(function (resolve) {
      (function tick() {
        if (typeof global.alloy === 'function') {
          resolve(global.alloy);
          return;
        }
        if (Date.now() - started > cap) {
          resolve(null);
          return;
        }
        global.setTimeout(tick, 80);
      })();
    });
  }

  function extractEcidFromAlloyResult(result) {
    if (!result || typeof result !== 'object') return '';
    var id = result.identity;
    if (!id || typeof id !== 'object') return '';
    var raw = id.ECID != null ? id.ECID : id.ecid;
    if (typeof raw === 'string') {
      var digits = raw.replace(/\D/g, '');
      return digits.length >= 10 ? digits : '';
    }
    if (raw && typeof raw === 'object') {
      var inner = raw.id != null ? String(raw.id) : '';
      var dig = inner.replace(/\D/g, '');
      return dig.length >= 10 ? dig : '';
    }
    return '';
  }

  /**
   * Mint a fresh ECID via Web SDK getIdentity (no sendEvent — avoids new tracking hits on reset).
   * @returns {Promise<string|null>}
   */
  async function fetchFreshEcidFromAlloy() {
    var alloyFn = await waitForAlloy(8000);
    if (!alloyFn) return null;
    var result;
    try {
      result = await alloyFn('getIdentity', { namespaces: ['ECID'] });
    } catch (_e1) {
      try {
        result = await alloyFn('getIdentity');
      } catch (_e2) {
        return null;
      }
    }
    var ecid = extractEcidFromAlloyResult(result);
    return ecid && ecid.length >= 10 ? ecid : null;
  }

  async function fetchFallbackAnonymousEcid() {
    try {
      var res = await fetch('/api/ecid/anonymous');
      var data = await res.json().catch(function () {
        return {};
      });
      var ecid = data.ecid != null ? String(data.ecid).trim() : '';
      return ecid && /^\d+$/.test(ecid) && ecid.length >= 10 ? ecid : null;
    } catch (_e) {
      return null;
    }
  }

  function applyFreshEcidToUi(ecid) {
    var infoEcid = document.getElementById('infoEcid');
    if (infoEcid) infoEcid.textContent = ecid || '—';

    if (global.DemoProfileDrawer) {
      if (typeof global.DemoProfileDrawer.refreshBrowserEcidFromAlloy === 'function') {
        void global.DemoProfileDrawer.refreshBrowserEcidFromAlloy({
          ecid: ecid || null,
          skipEvents: true,
        });
        return;
      }
      if (ecid && typeof global.DemoProfileDrawer.patchLastProfileOrUpdate === 'function') {
        global.DemoProfileDrawer.patchLastProfileOrUpdate({
          ecid: ecid,
          identities: [{ namespace: 'ECID', value: ecid }],
          events: [],
          eventsStory: [],
          audiences: { realized: [], exited: [] },
        });
      } else if (typeof global.DemoProfileDrawer.updateProfileDrawer === 'function') {
        global.DemoProfileDrawer.updateProfileDrawer(null);
      }
    }
  }

  /**
   * Reset anonymous visitor: clear tracking state and mint a fresh ECID for this tab.
   * @returns {Promise<{ ok: boolean, ecid: string|null, message: string }>}
   */
  async function resetArmcomVisitorEcid() {
    if (!isArmcomLabPage()) {
      return { ok: false, ecid: null, message: 'ECID reset is only available on Arm demo pages.' };
    }

    clearTrackingCookiesBestEffort();
    clearArmcomLocalEcidCache();
    clearArmcomSessionKeys();
    clearCustomerEmailField();

    if (global.ArmcomFakeAudiences && typeof global.ArmcomFakeAudiences.reset === 'function') {
      global.ArmcomFakeAudiences.reset();
    }

    if (global.DemoProfileDrawer && typeof global.DemoProfileDrawer.clearDrawerVisitorState === 'function') {
      global.DemoProfileDrawer.clearDrawerVisitorState();
    } else if (global.DemoProfileDrawer && typeof global.DemoProfileDrawer.updateProfileDrawer === 'function') {
      global.DemoProfileDrawer.updateProfileDrawer(null);
      var hint = document.getElementById('infoEcid');
      if (hint) hint.textContent = '—';
    }

    reloadArmcomIframe();

    var ecid = await fetchFreshEcidFromAlloy();
    if (!ecid) ecid = await fetchFallbackAnonymousEcid();
    applyFreshEcidToUi(ecid);

    var message = ecid
      ? 'New anonymous visitor — ECID ' + ecid + '. No profile events loaded until you browse or look up a profile.'
      : 'Visitor reset — tracking cookies cleared. Inject Tags and browse to mint a new ECID via Web SDK.';
    setArmcomLabMessage(message, ecid ? 'success' : '');

    try {
      global.dispatchEvent(
        new CustomEvent('armcom-ecid-reset-complete', {
          detail: { ecid: ecid, message: message },
        }),
      );
    } catch (_e) {
      /* noop */
    }

    return { ok: true, ecid: ecid, message: message };
  }

  global.ArmcomEcidReset = {
    reset: resetArmcomVisitorEcid,
    isArmcomLabPage: isArmcomLabPage,
    clearTrackingCookiesBestEffort: clearTrackingCookiesBestEffort,
  };
})(typeof window !== 'undefined' ? window : globalThis);
