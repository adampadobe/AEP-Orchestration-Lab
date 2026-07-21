/**
 * Arm demo — reset anonymous visitor ECID (cookies, session keys, fake audiences, drawer).
 * Preserves Tags SDK inject state (Launch script in DOM, env bar configured, inject session flags).
 */
(function (global) {
  'use strict';

  var STORAGE_PREFIX = 'armcom';
  var ECID_BY_SANDBOX_KEY = STORAGE_PREFIX + 'LastResolvedEcidBySandbox';
  var LAB_ENV_CONFIGURED_KEY = 'aepLabEnvConfigured:' + STORAGE_PREFIX;
  var LAUNCH_SCRIPT_ID = STORAGE_PREFIX + 'LaunchScript';

  /** Demo visitor state only — do not clear Tags inject / env-bar configured session keys. */
  var SESSION_KEYS = [
    'armcomFakeAudienceStage',
    'armcomJourneySlideIndex',
    'armcomPaidAdClickedAfterBrief',
    'armcomToastState',
    'armcomBannerState',
    'aep-demo-session-identifier-v1',
  ];

  function isArmcomLabPage() {
    if (!global.document || !document.body) return false;
    return (
      document.body.classList.contains('armcom-demo-page') ||
      document.body.classList.contains('armcom-mobile-demo-page')
    );
  }

  function resolveArmcomSandboxKey() {
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.sandboxKey === 'function') {
        var sb =
          global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function'
            ? String(global.AepGlobalSandbox.getSandboxName() || '').trim()
            : '';
        return global.AepLabEnvBarPrefs.sandboxKey(sb);
      }
    } catch (_e) {
      /* noop */
    }
    var raw =
      global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function'
        ? String(global.AepGlobalSandbox.getSandboxName() || '').trim().toLowerCase()
        : '';
    return raw ? raw.replace(/[^a-z0-9_-]/g, '_') : '__default__';
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
    var sk = resolveArmcomSandboxKey();
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
        var map = global.AepLabEnvBarPrefs.readMap(ECID_BY_SANDBOX_KEY);
        if (map && typeof map === 'object') {
          delete map[sk];
          global.AepLabEnvBarPrefs.writeMap(ECID_BY_SANDBOX_KEY, map);
          return;
        }
      }
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

  function readLaunchScriptSrcFromDom() {
    var el = document.getElementById(LAUNCH_SCRIPT_ID);
    if (!el) return '';
    return String(el.getAttribute('src') || el.src || '').trim();
  }

  /** Keep env bar + tab session inject flags when alloy Launch tag is still on the page. */
  function preserveArmcomTagsInjectState() {
    var scriptSrc = readLaunchScriptSrcFromDom();
    if (!scriptSrc) return;
    try {
      sessionStorage.setItem(LAB_ENV_CONFIGURED_KEY, '1');
    } catch (_e) {
      /* noop */
    }
    if (
      global.AepLabTagsInjectSession &&
      typeof global.AepLabTagsInjectSession.writeScript === 'function'
    ) {
      try {
        global.AepLabTagsInjectSession.writeScript(STORAGE_PREFIX, resolveArmcomSandboxKey(), scriptSrc);
      } catch (_e2) {
        /* noop */
      }
    }
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

  function readCachedArmcomEcid() {
    var sk = resolveArmcomSandboxKey();
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.getDoc === 'function') {
        var doc = global.AepLabEnvBarPrefs.getDoc();
        var entry = doc && doc.tagsBySandbox && doc.tagsBySandbox[sk];
        var fromUnified = entry && entry.ecid != null ? String(entry.ecid).replace(/\D/g, '') : '';
        if (fromUnified.length >= 10) return fromUnified;
      }
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
        var map = global.AepLabEnvBarPrefs.readMap(ECID_BY_SANDBOX_KEY);
        var hit = map[sk] != null ? String(map[sk]).replace(/\D/g, '') : '';
        if (hit.length >= 10) return hit;
      }
    } catch (_e) {
      /* noop */
    }
    return null;
  }

  function readEcidFromAdobeCookies() {
    if (typeof document === 'undefined') return null;
    try {
      var parts = document.cookie.split(';');
      for (var i = 0; i < parts.length; i++) {
        var seg = parts[i].trim();
        var eq = seg.indexOf('=');
        if (eq === -1) continue;
        var name = seg.slice(0, eq).trim();
        var rawVal = decodeURIComponent(seg.slice(eq + 1));
        if (/^AMCV_/i.test(name)) {
          var amcv = rawVal.match(/MCMID(?:%7C|\|)(\d{10,})/i);
          if (amcv && amcv[1] && amcv[1].length >= 10) return amcv[1];
        }
        if (/^kndctr_.*_AdobeOrg_identity$/i.test(name)) {
          var payload = rawVal;
          try {
            payload = atob(rawVal.replace(/-/g, '+').replace(/_/g, '/'));
          } catch (_b) {
            /* keep raw */
          }
          try {
            var parsed = JSON.parse(payload);
            var fromJson = extractEcidFromAlloyResult({ identity: parsed.identity || parsed });
            if (fromJson) return fromJson;
          } catch (_j) {
            var m = payload.match(/\d{20,}/);
            if (m && m[0].length >= 10) return m[0];
          }
        }
      }
    } catch (_e2) {
      /* noop */
    }
    return null;
  }

  async function fetchFreshEcidFromAlloyWithRetry() {
    var alloyFn = await waitForAlloy(12000);
    if (!alloyFn) return null;
    for (var attempt = 0; attempt < 7; attempt++) {
      if (attempt > 0) {
        await new Promise(function (resolve) {
          global.setTimeout(resolve, 500);
        });
      }
      var result;
      try {
        result = await alloyFn('getIdentity', { namespaces: ['ECID'] });
      } catch (_e1) {
        try {
          result = await alloyFn('getIdentity');
        } catch (_e2) {
          result = null;
        }
      }
      var ecid = extractEcidFromAlloyResult(result);
      if (ecid && ecid.length >= 10) return ecid;
    }
    return null;
  }

  async function fetchFallbackAnonymousEcid() {
    var cached = readCachedArmcomEcid();
    if (cached) return cached;
    var fromCookie = readEcidFromAdobeCookies();
    if (fromCookie) return fromCookie;
    return fetchFreshEcidFromAlloyWithRetry();
  }

  function persistFreshEcidForSandbox(ecid) {
    if (!ecid) return;
    var sk = resolveArmcomSandboxKey();
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.readMap === 'function') {
        var map = global.AepLabEnvBarPrefs.readMap(ECID_BY_SANDBOX_KEY);
        map[sk] = ecid;
        global.AepLabEnvBarPrefs.writeMap(ECID_BY_SANDBOX_KEY, map);
      }
    } catch (_e) {
      /* noop */
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
    preserveArmcomTagsInjectState();

    var ecid = await fetchFreshEcidFromAlloy();
    if (!ecid) ecid = await fetchFallbackAnonymousEcid();
    if (ecid) persistFreshEcidForSandbox(ecid);
    applyFreshEcidToUi(ecid);

    var tagsStillLoaded = !!readLaunchScriptSrcFromDom() || typeof global.alloy === 'function';
    var message = ecid
      ? 'New anonymous visitor — ECID ' +
        ecid +
        '. Tags SDK kept loaded. No profile events until you browse or look up a profile.'
      : tagsStillLoaded
        ? 'Visitor reset — tracking cookies cleared. Minting ECID via Web SDK; browse the journey if ECID stays empty.'
        : 'Visitor reset — tracking cookies cleared. Inject Tags and browse to mint a new ECID via Web SDK.';
    setArmcomLabMessage(message, ecid ? 'success' : '');

    try {
      global.dispatchEvent(
        new CustomEvent('armcom-ecid-reset-complete', {
          detail: { ecid: ecid, message: message, tagsInjectPreserved: tagsStillLoaded },
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
    preserveTagsInjectState: preserveArmcomTagsInjectState,
  };
})(typeof window !== 'undefined' ? window : globalThis);
