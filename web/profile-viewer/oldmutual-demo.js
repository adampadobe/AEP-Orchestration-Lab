/**
 * Old Mutual demo page.
 * Login loads profile (consent API); on success sends application.login via /api/events/generator (with or without a store profile).
 * Sends selected interaction event via /api/events/generator on submit.
 * Business insurance page: schedules form.abandon in 10s after a package is selected (countdown resets on change).
 * Successful Login still resets the same countdown. Cleared by manual abandon/submit or navigating away.
 */

const OM_SESSION_PROFILE_EMAIL_KEY = 'aepOmSessionProfileEmail';
/** Last Business quote package label — thank-you page subtitle (set before navigating away from business insurance page). */
const OM_BUSINESS_QUOTE_PACKAGE_KEY = 'omBusinessQuotePackage';
/** Session-scoped ECID for anonymous browsing (not issued from a profile with email until identity merges). */
const OM_ANONYMOUS_ECID_KEY = 'aepOmAnonymousEcid';
/** How session ECID was obtained: `adobe-web-sdk` (Edge + SDK cookie) or `server-api` (demo fallback). */
const OM_ECID_SOURCE_KEY = 'aepOmEcidSource';

/** Generator `channel` + login event type when ?aepSimMobile=1 (mobile simulator iframe). */
function demoExperienceChannel() {
  try {
    if (window.AepSimMobile && typeof window.AepSimMobile.experienceChannel === 'function') {
      return window.AepSimMobile.experienceChannel();
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (/\baepSimMobile=1\b/.test(window.location.search || '')) return 'Mobile';
    if (document.documentElement && document.documentElement.classList.contains('aep-sim-mobile')) return 'Mobile';
  } catch (_) {
    /* ignore */
  }
  return 'Web';
}

function demoApplicationLoginEventType() {
  try {
    if (window.AepSimMobile && typeof window.AepSimMobile.applicationLoginEventType === 'function') {
      return window.AepSimMobile.applicationLoginEventType();
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (/\baepSimMobile=1\b/.test(window.location.search || '')) return 'mobile.logon';
    if (document.documentElement && document.documentElement.classList.contains('aep-sim-mobile')) return 'mobile.logon';
  } catch (_) {
    /* ignore */
  }
  return 'application.login';
}

/** Preserve mobile-simulator query string on programmatic navigations (iframe demo). */
function fnbNavigatePreserveSim(urlOrPath) {
  try {
    const u = new URL(urlOrPath, window.location.href);
    if (/\baepSimMobile=1\b/.test(window.location.search)) {
      u.searchParams.set('aepSimMobile', '1');
    }
    window.location.assign(u.pathname + u.search + u.hash);
  } catch {
    window.location.assign(urlOrPath);
  }
}

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'omNs');

// Brand Concierge launcher visibility toggle
const omBcLauncherToggle = document.getElementById('omBcLauncherToggle');
const omBcLauncher = document.getElementById('omBcLauncher');
(function initOmBcLauncher() {
  const LAUNCHER_KEY = 'omBcLauncherVisible';
  if (!omBcLauncherToggle) return;
  try {
    if (localStorage.getItem(LAUNCHER_KEY) === '1') {
      omBcLauncherToggle.checked = true;
      document.body.classList.add('aep-bc-launcher-on');
    }
  } catch { /* noop */ }
  omBcLauncherToggle.addEventListener('change', function () {
    const on = omBcLauncherToggle.checked;
    document.body.classList.toggle('aep-bc-launcher-on', on);
    try { localStorage.setItem(LAUNCHER_KEY, on ? '1' : '0'); } catch { /* noop */ }
  });
  if (omBcLauncher) {
    omBcLauncher.addEventListener('click', function () {
      document.body.classList.remove('aep-bc-panel-dismissed');
    });
  }
})();

// Brand Concierge on-inject toggle
const omBcOnInjectToggle = document.getElementById('omBcOnInjectToggle');
const omBcStyleSelect = document.getElementById('omBcStyleSelect');
(function initOmBcToggle() {
  if (!omBcOnInjectToggle) return;
  const prefs = typeof AepBcToggle !== 'undefined' ? AepBcToggle.loadPrefs('oldMutualPersonal') : { enabled: false, styleKey: 'miral' };
  omBcOnInjectToggle.checked = !!prefs.enabled;
  if (omBcStyleSelect && prefs.styleKey) omBcStyleSelect.value = prefs.styleKey;
  function saveBcPrefs() {
    if (typeof AepBcToggle === 'undefined') return;
    AepBcToggle.savePrefs('oldMutualPersonal', !!(omBcOnInjectToggle && omBcOnInjectToggle.checked), omBcStyleSelect ? omBcStyleSelect.value : 'miral');
  }
  omBcOnInjectToggle.addEventListener('change', saveBcPrefs);
  if (omBcStyleSelect) omBcStyleSelect.addEventListener('change', saveBcPrefs);
})();

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const raceEventForm = document.getElementById('raceEventForm');
const eventLocation = document.getElementById('eventLocation');
const eventType = document.getElementById('eventType');
const startDate = document.getElementById('startDate');
const endDate = document.getElementById('endDate');
const eventSubmitBtn = document.getElementById('eventSubmitBtn');
const abandonedBasketBtn = document.getElementById('abandonedBasketBtn');
const raceMessage = document.getElementById('raceMessage');
const raceMessageRevealZone = document.getElementById('raceMessageRevealZone');

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];

/** Fires `form.abandon` after profile lookup unless submit or manual abandon happens first. */
let abandonBasketTimerId = null;
let raceMessageCloseTimerId = null;

function clearAbandonBasketTimer() {
  if (abandonBasketTimerId != null) {
    window.clearTimeout(abandonBasketTimerId);
    abandonBasketTimerId = null;
  }
}

/**
 * Business page only: after 10s, send `form.abandon` if a package radio is selected.
 * Timer resets whenever the user picks a different package or logs in after lookup.
 */
function scheduleBusinessFormAbandonCountdown() {
  if (!document.body || !document.body.classList.contains('oldmutual-business-page')) return;
  clearAbandonBasketTimer();
  abandonBasketTimerId = window.setTimeout(() => {
    abandonBasketTimerId = null;
    const pkg = getSelectedBusinessPackage();
    if (!pkg) return;
    void sendRaceEvent('form.abandon', true);
  }, 10_000);
}

function scheduleAutoAbandonAfterLookup() {
  if (!document.body || !document.body.classList.contains('oldmutual-business-page')) return;
  scheduleBusinessFormAbandonCountdown();
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function getSelectedBusinessPackage() {
  try {
    const selected = document.querySelector('input[name="businessPackage"]:checked');
    return selected ? String(selected.value || '').trim() : '';
  } catch (_) {
    return '';
  }
}

/** After Experience Events POST, re-fetch drawer data (Query Service lags; same pattern as post-login refresh). */
function scheduleOmDrawerRefreshAfterEvent() {
  if (!window.AepProfileDrawer) return;
  const silent = { addEmailOnSuccess: false, onUserMessage: () => {} };
  let email = getEmail().trim();
  if (!email) {
    try {
      email = (sessionStorage.getItem(OM_SESSION_PROFILE_EMAIL_KEY) || '').trim();
    } catch (_) {
      email = '';
    }
  }
  if (email && typeof window.AepProfileDrawer.loadProfileDataForDrawer === 'function') {
    void window.AepProfileDrawer.loadProfileDataForDrawer(email, silent);
    window.setTimeout(() => {
      void window.AepProfileDrawer.loadProfileDataForDrawer(email, silent);
    }, 2500);
    return;
  }
  let ecid = getEcidForExperienceEvent();
  if (!ecid) {
    try {
      const s = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
      if (s && /^\d+$/.test(s) && s.length >= 10) ecid = s;
    } catch (_) {
      /* ignore */
    }
  }
  if (ecid && typeof window.AepProfileDrawer.loadVisitorProfileDataForDrawer === 'function') {
    void window.AepProfileDrawer.loadVisitorProfileDataForDrawer(ecid, silent);
    window.setTimeout(() => {
      void window.AepProfileDrawer.loadVisitorProfileDataForDrawer(ecid, silent);
    }, 2500);
  }
}

function setRaceMessagePeek(open) {
  if (!document || !document.body) return;
  if (!raceMessage || raceMessage.hidden) {
    document.body.classList.remove('om-race-message-peek');
    return;
  }
  document.body.classList.toggle('om-race-message-peek', !!open);
}

function clearRaceMessageCloseTimer() {
  if (raceMessageCloseTimerId != null) {
    window.clearTimeout(raceMessageCloseTimerId);
    raceMessageCloseTimerId = null;
  }
}

function scheduleRaceMessageClose() {
  clearRaceMessageCloseTimer();
  raceMessageCloseTimerId = window.setTimeout(() => {
    raceMessageCloseTimerId = null;
    setRaceMessagePeek(false);
  }, 180);
}

function setRaceMessage(text, type) {
  if (!raceMessage) return;
  raceMessage.textContent = text || '';
  raceMessage.className = 'race-message' + (type ? ' ' + type : '');
  raceMessage.hidden = !text;
  if (!text) setRaceMessagePeek(false);
}

if (raceMessageRevealZone && raceMessage) {
  raceMessageRevealZone.addEventListener('mouseenter', () => {
    clearRaceMessageCloseTimer();
    setRaceMessagePeek(true);
  });
  raceMessageRevealZone.addEventListener('mouseleave', () => {
    scheduleRaceMessageClose();
  });
  raceMessage.addEventListener('mouseenter', () => {
    clearRaceMessageCloseTimer();
    setRaceMessagePeek(true);
  });
  raceMessage.addEventListener('mouseleave', () => {
    scheduleRaceMessageClose();
  });
}

function buildOmTagsInjectionConfig() {
  const body = document.body;
  let storagePrefix = 'oldMutualPersonal';
  let identityEventType = 'oldmutual.identity.stitch';
  if (body && body.classList.contains('oldmutual-wealth-page')) {
    storagePrefix = 'oldMutualWealth';
    identityEventType = 'oldmutual.wealth.identity.stitch';
  } else if (
    body &&
    (body.classList.contains('oldmutual-business-page') || body.classList.contains('oldmutual-business-quote-thank-you-page'))
  ) {
    storagePrefix = 'oldMutualBusiness';
    identityEventType = 'oldmutual.business.identity.stitch';
  }
  return {
    storagePrefix,
    identityEventType,
    messageSetter: setRaceMessage,
    infoEcidId: 'infoEcid',
    tagsCompanyId: 'omTagsCompany',
    tagsPropertyInputId: 'omTagsProperty',
    tagsPropertyListId: 'omTagsPropertyList',
    tagsEnvironmentId: 'omTagsEnvironment',
    injectButtonId: 'omInjectSdkBtn',
    selectedScriptId: 'omSelectedScript',
    configFieldsId: 'omSdkConfigFields',
    configSummaryId: 'omSdkConfigSummary',
    configSummaryTextId: 'omSdkConfigSummaryText',
    changeConfigButtonId: 'omChangeSdkConfigBtn',
    getSelectedGeneratorTarget: () => {
      const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
    },
    getEmail,
    /** Parent shell only — see `docs/ANONYMOUS_EDGE_DEMO_PATTERN.md` (no Launch in embedded iframes). */
    iframeIds: [],
    brandConcierge: {
      enabled: function () { return !!(omBcOnInjectToggle && omBcOnInjectToggle.checked); },
      styleKey: function () { return (omBcStyleSelect && omBcStyleSelect.value) || 'miral'; },
    },
  };
}

const omTagsInjection =
  typeof window.DemoTagsInjection !== 'undefined' && document.getElementById('omSdkConfigFields')
    ? window.DemoTagsInjection.init(buildOmTagsInjectionConfig())
    : null;

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

function augmentOmGeneratorPostBody(body) {
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody) {
    return window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body);
  }
  const src = body && typeof body === 'object' ? body : {};
  const b = { ...src };
  if (!b.sandbox && typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
    const s = String(window.AepGlobalSandbox.getSandboxName() || '').trim();
    if (s) b.sandbox = s;
  }
  return b;
}

/**
 * ECID for generator calls: **session visitor ECID first** (Web SDK or demo mint).
 * Matches Edge device identity for stitching with email on login.
 */
function getEcidForExperienceEvent() {
  try {
    const anon = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
    if (anon && /^\d+$/.test(anon) && anon.length >= 10) return anon;
  } catch (_) {
    /* ignore */
  }
  const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
  if (ecidText && ecidText !== '-' && ecidText !== '—' && /^\d+$/.test(ecidText) && ecidText.length >= 10) {
    return ecidText;
  }
  return null;
}

function hasAdobeKndctrIdentityCookie() {
  if (typeof document === 'undefined') return false;
  try {
    return document.cookie.split(';').some(function (c) {
      return /^\s*kndctr_[^=]+_AdobeOrg_identity=/.test(c);
    });
  } catch (_) {
    return false;
  }
}

/** Best-effort clear of Experience Platform Web SDK identity cookie(s). HttpOnly cookies cannot be cleared from script. */
function clearAdobeKndctrIdentityCookiesBestEffort() {
  if (typeof document === 'undefined') return;
  try {
    const names = new Set();
    document.cookie.split(';').forEach(function (part) {
      const name = part.split('=')[0].trim();
      if (/^kndctr_.*_AdobeOrg_identity$/.test(name)) names.add(name);
    });
    const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const host = typeof window !== 'undefined' && window.location ? window.location.hostname || '' : '';
    names.forEach(function (name) {
      document.cookie = name + '=; Max-Age=0; path=/; ' + expire;
      if (host) {
        document.cookie = name + '=; Max-Age=0; path=/; domain=' + host + '; ' + expire;
        const dot = host.indexOf('.') !== -1 ? host.replace(/^www\./, '') : '';
        if (dot && dot !== host) document.cookie = name + '=; Max-Age=0; path=/; domain=.' + dot + '; ' + expire;
      }
    });
  } catch (_) {
    /* ignore */
  }
}

/**
 * Logs whether visitor ECID matches Adobe’s Web SDK flow (Edge issues ECID; SDK stores `kndctr_*_AdobeOrg_identity`).
 * @param {string} ecid
 * @param {string} sourceLabel
 */
function logVisitorEcidConfirmation(ecid, sourceLabel) {
  if (!ecid || !window.console || !console.info) return;
  const kndctr = hasAdobeKndctrIdentityCookie();
  console.info(
    '[AEP Old Mutual demo] Visitor ECID:',
    ecid,
    '| source:',
    sourceLabel,
    '| Adobe kndctr_* identity cookie:',
    kndctr ? 'present (SDK-managed)' : 'not detected (normal if Launch/Web SDK is not on this page)',
  );
}

function waitForAlloyFn(onReady, maxMs) {
  const cap = maxMs != null ? maxMs : 5000;
  const started = Date.now();
  (function tick() {
    const alloyFn = typeof window.alloy === 'function' ? window.alloy : null;
    if (alloyFn) {
      onReady(alloyFn);
      return;
    }
    if (Date.now() - started > cap) {
      onReady(null);
      return;
    }
    window.setTimeout(tick, 100);
  })();
}

/** @param {unknown} result — return value from alloy('getIdentity') */
function extractEcidFromGetIdentityResult(result) {
  if (!result || typeof result !== 'object') return null;
  const id = /** @type {{ ECID?: unknown; ecid?: unknown }} */ (result).identity;
  if (!id || typeof id !== 'object') return null;
  const raw =
    /** @type {{ ECID?: unknown; ecid?: unknown }} */ (id).ECID != null
      ? /** @type {{ ECID?: unknown }} */ (id).ECID
      : /** @type {{ ecid?: unknown }} */ (id).ecid;
  if (raw == null) return null;
  const ecid = String(raw).trim();
  return /^\d+$/.test(ecid) && ecid.length >= 10 ? ecid : null;
}

/**
 * Adobe Experience Platform Web SDK: ECID is minted by Edge and persisted by the SDK (first sendEvent/getIdentity).
 * @returns {Promise<string|null>}
 */
function tryFetchWebSdkEcid() {
  return new Promise(function (resolve) {
    waitForAlloyFn(function (alloy) {
      if (!alloy) return resolve(null);
      Promise.resolve(alloy('getIdentity'))
        .then(function (result) {
          resolve(extractEcidFromGetIdentityResult(result));
        })
        .catch(function (err) {
          if (window.console && console.warn) {
            console.warn('[AEP Old Mutual demo] alloy(getIdentity) failed; falling back to demo API ECID.', err);
          }
          resolve(null);
        });
    });
  });
}

/** Single in-flight mint per tab — prevents duplicate Web SDK + /api/ecid/anonymous races on navigation. */
let omAnonymousEcidMintPromise = null;

/** Incremented when the demo resets visitor ECID so async mint work does not repersist after storage clear. */
let omAnonymousEcidMintGeneration = 0;

/**
 * First successful writer wins — avoids a late mint from a discarded tab overwriting ECID after navigation.
 * @param {string} ecid
 * @param {'adobe-web-sdk' | 'server-api'} sourceKey
 * @returns {string|null}
 */
function persistOmAnonymousEcidIfUnset(ecid, sourceKey) {
  const id = String(ecid || '').trim();
  if (!id || !/^\d+$/.test(id) || id.length < 10) return null;
  try {
    const cur = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
    if (cur && /^\d{10,}$/.test(cur.trim())) {
      const keep = cur.trim();
      if (keep !== id && window.console && console.info) {
        console.info(
          '[AEP Old Mutual demo] Visitor ECID already set in session; not overwriting (late mint or duplicate request).',
          { kept: keep, skipped: id },
        );
      }
      return keep;
    }
    sessionStorage.setItem(OM_ANONYMOUS_ECID_KEY, id);
    sessionStorage.setItem(OM_ECID_SOURCE_KEY, sourceKey);
    return id;
  } catch (_) {
    return id;
  }
}

async function mintOmAnonymousEcidOnce() {
  const genAtMint = omAnonymousEcidMintGeneration;

  function mintStale() {
    return genAtMint !== omAnonymousEcidMintGeneration;
  }

  function discardStalePersist() {
    if (!mintStale()) return;
    try {
      sessionStorage.removeItem(OM_ANONYMOUS_ECID_KEY);
      sessionStorage.removeItem(OM_ECID_SOURCE_KEY);
    } catch (_) {
      /* ignore */
    }
  }

  const webSdkEcid = await tryFetchWebSdkEcid();
  if (mintStale()) return null;
  if (webSdkEcid) {
    const stored = persistOmAnonymousEcidIfUnset(webSdkEcid, 'adobe-web-sdk');
    if (mintStale()) {
      discardStalePersist();
      return null;
    }
    if (stored) logVisitorEcidConfirmation(stored, 'adobe-web-sdk (Experience Platform Web SDK / Edge)');
    return stored;
  }

  try {
    const res = await fetch('/api/ecid/anonymous');
    const data = await res.json().catch(() => ({}));
    if (mintStale()) return null;
    const ecid = data.ecid != null ? String(data.ecid).trim() : '';
    if (ecid && /^\d+$/.test(ecid) && ecid.length >= 10) {
      const stored = persistOmAnonymousEcidIfUnset(ecid, 'server-api');
      if (mintStale()) {
        discardStalePersist();
        return null;
      }
      if (stored) logVisitorEcidConfirmation(stored, 'server-api (demo GET /api/ecid/anonymous — not Adobe SDK cookie)');
      return stored;
    }
  } catch (_) {
    /* ignore */
  }
  if (window.console && console.warn) {
    console.warn(
      '[AEP Old Mutual demo] No visitor ECID yet (Web SDK not loaded and /api/ecid/anonymous failed). Run __aepOmVerifyEcid() in DevTools.',
    );
  }
  return null;
}

/**
 * Resolve visitor ECID: read sessionStorage first; otherwise run **one** shared mint (all concurrent callers wait).
 * Subpages participate in the same mint when storage is still empty (e.g. user opened Wealth before home finished writing).
 * Pass `{ allowMint: false }` to skip mint entirely (rare).
 * @param {{ allowMint?: boolean }} [opts]
 */
async function ensureAnonymousEcid(opts) {
  const options = opts && typeof opts === 'object' ? opts : {};
  const denyMint = options.allowMint === false;

  try {
    const existing = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
    if (existing && /^\d{10,}$/.test(existing)) {
      try {
        const src = sessionStorage.getItem(OM_ECID_SOURCE_KEY) || 'unknown';
        logVisitorEcidConfirmation(existing, src + ' (sessionStorage cache)');
      } catch (_) {
        /* ignore */
      }
      return existing;
    }
  } catch (_) {
    /* ignore */
  }

  if (denyMint) {
    return null;
  }

  if (!omAnonymousEcidMintPromise) {
    omAnonymousEcidMintPromise = mintOmAnonymousEcidOnce().finally(() => {
      omAnonymousEcidMintPromise = null;
    });
  }
  return omAnonymousEcidMintPromise;
}

/** Show anonymous ECID in the header hint when there is no profile ECID yet. */
function applyAnonymousEcidToBarIfNeeded() {
  if (!infoEcid) return;
  const t = String(infoEcid.textContent || '').trim();
  if (t && t !== '—' && t !== '-') return;
  try {
    const anon = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
    if (anon && /^\d+$/.test(anon) && anon.length >= 10) infoEcid.textContent = anon;
  } catch (_) {
    /* ignore */
  }
}

/**
 * Demo: clear session visitor ECID, best-effort clear Adobe `kndctr_*_AdobeOrg_identity`, remint (Web SDK or `/api/ecid/anonymous`).
 * Does not log out email session — refreshes drawer so the bar reflects the new visitor ECID when logged in.
 */
async function resetOmVisitorEcidDemo() {
  if (!document.body || !document.body.classList.contains('oldmutual-demo-page')) return;

  omAnonymousEcidMintGeneration += 1;
  omAnonymousEcidMintPromise = null;
  try {
    sessionStorage.removeItem(OM_ANONYMOUS_ECID_KEY);
    sessionStorage.removeItem(OM_ECID_SOURCE_KEY);
  } catch (_) {
    /* ignore */
  }
  clearAdobeKndctrIdentityCookiesBestEffort();
  if (infoEcid) infoEcid.textContent = '—';

  await ensureAnonymousEcid();
  applyAnonymousEcidToBarIfNeeded();

  let savedEmail = '';
  try {
    savedEmail = sessionStorage.getItem(OM_SESSION_PROFILE_EMAIL_KEY) || '';
  } catch (_) {
    /* ignore */
  }

  let ecid = getEcidForExperienceEvent();
  if (!ecid) {
    try {
      const s = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
      if (s && /^\d+$/.test(s) && s.length >= 10) ecid = s;
    } catch (_) {
      /* ignore */
    }
  }

  if (
    savedEmail.trim() &&
    window.AepProfileDrawer &&
    typeof window.AepProfileDrawer.loadProfileDataForDrawer === 'function'
  ) {
    await window.AepProfileDrawer.loadProfileDataForDrawer(savedEmail.trim(), {
      onUserMessage: (msg, type) => {
        if (type === 'error') setRaceMessage(msg, type);
      },
      addEmailOnSuccess: false,
    });
  } else if (
    ecid &&
    window.AepProfileDrawer &&
    typeof window.AepProfileDrawer.loadVisitorProfileDataForDrawer === 'function'
  ) {
    await window.AepProfileDrawer.loadVisitorProfileDataForDrawer(ecid, { onUserMessage: () => {} });
  }

  setRaceMessage(
    'Visitor ECID reset for this tab. If Launch/Web SDK still shows the old ECID, clear site data or use a fresh profile.',
    'success',
  );
}

/**
 * Send application.login via Event Generator (same transport as other demo events).
 * @param {string} email
 */
async function sendApplicationLoginExperienceEvent(email) {
  const target = getSelectedGeneratorTarget();
  const ecid = getEcidForExperienceEvent();
  const body = {
    targetId: target ? target.id : undefined,
    email: String(email || '').trim(),
    eventType: demoApplicationLoginEventType(),
    viewName: 'Old Mutual',
    viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
    channel: demoExperienceChannel(),
  };
  if (ecid) body.ecid = ecid;
  const res = await fetch('/api/events/generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(augmentOmGeneratorPostBody(body)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || data.message || 'Request failed.');
  }
  return data;
}

const OM_PREFERRED_GENERATOR_TARGET_ID = 'edge-a7f9-default';

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
    generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {
      preferredId: OM_PREFERRED_GENERATOR_TARGET_ID,
    });
    return;
  }
  try {
    const res = await fetch('/api/events/generator-targets');
    const data = await res.json().catch(() => ({}));
    generatorTargets = Array.isArray(data.targets) ? data.targets : [];
    generatorTargetSelect.innerHTML = '';
    if (generatorTargets.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No targets (check event-generator-targets.json)';
      generatorTargetSelect.appendChild(opt);
      return;
    }
    generatorTargets.forEach((t) => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.label || t.id;
      generatorTargetSelect.appendChild(opt);
    });
    if (generatorTargets.some((t) => t.id === OM_PREFERRED_GENERATOR_TARGET_ID)) {
      generatorTargetSelect.value = OM_PREFERRED_GENERATOR_TARGET_ID;
    }
  } catch {
    generatorTargetSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Failed to load targets';
    generatorTargetSelect.appendChild(opt);
  }
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    clearAbandonBasketTimer();
    const email = getEmail().trim();
    if (!email) {
      setRaceMessage('Enter a customer identifier first.', 'error');
      return;
    }
    if (!window.AepProfileDrawer) {
      setRaceMessage('Profile drawer script not loaded.', 'error');
      return;
    }
    queryProfileBtn.disabled = true;
    setRaceMessage('Signing in…', '');
    try {
      const result = await window.AepProfileDrawer.loadProfileDataForDrawer(email, {
        onUserMessage: setRaceMessage,
        addEmailOnSuccess: true,
      });
      if (!result.ok) return;

      try {
        sessionStorage.setItem(OM_SESSION_PROFILE_EMAIL_KEY, email.trim());
      } catch (_) {
        /* ignore quota / private mode */
      }

      /* application.login on every successful Login—same generator path as other FNB events (not only when a store profile exists). */
      try {
        await sendApplicationLoginExperienceEvent(email);
        const loginEt = demoApplicationLoginEventType();
        if (result.found) {
          setRaceMessage(
            'Profile found. ECID will be sent with the event if valid. Sent ' + loginEt + ' to AEP.',
            'success',
          );
        } else {
          setRaceMessage(
            'No profile in store; ' + loginEt + ' was still sent to AEP (no ECID).',
            'success',
          );
        }
        /* First profile load fetched events *before* login experience event was POSTed; refresh drawer (and retry once for slower ingestion). */
        if (window.AepProfileDrawer && typeof window.AepProfileDrawer.loadProfileDataForDrawer === 'function') {
          const silent = { addEmailOnSuccess: false, onUserMessage: () => {} };
          void window.AepProfileDrawer.loadProfileDataForDrawer(email, silent);
          window.setTimeout(() => {
            void window.AepProfileDrawer.loadProfileDataForDrawer(email, silent);
          }, 2500);
        }
        } catch (loginErr) {
        setRaceMessage(
          (result.found ? 'Profile found. ' : 'No profile in store. ') +
            demoApplicationLoginEventType() +
            ' failed: ' +
            (loginErr && loginErr.message ? loginErr.message : String(loginErr)),
          'error',
        );
      }

      if (omTagsInjection && typeof omTagsInjection.stitchAfterProfileLookup === 'function') {
        const profile =
          window.AepProfileDrawer && typeof window.AepProfileDrawer.getLastLookedUpProfile === 'function'
            ? window.AepProfileDrawer.getLastLookedUpProfile()
            : null;
        await omTagsInjection.stitchAfterProfileLookup(profile, email);
      }

      scheduleAutoAbandonAfterLookup();
    } catch (err) {
      setRaceMessage(err.message || 'Network error', 'error');
    } finally {
      queryProfileBtn.disabled = false;
    }
  });

/** @returns {Promise<boolean>} true if the event was accepted by the generator API */
async function sendRaceEvent(eventTypeName, includeEventRegistration) {
    let emailForEvent = getEmail().trim();
    if (!emailForEvent) {
      try {
        emailForEvent = (sessionStorage.getItem(OM_SESSION_PROFILE_EMAIL_KEY) || '').trim();
      } catch (_) {
        emailForEvent = '';
      }
    }
    const location = eventLocation ? String(eventLocation.value || '').trim() : '';
    const type = eventType ? String(eventType.value || '').trim() : 'All types';
    const start = startDate ? String(startDate.value || '').trim() : '';
    const end = endDate ? String(endDate.value || '').trim() : '';

    const ecid = getEcidForExperienceEvent();
    const ecidOk = !!(ecid && /^\d+$/.test(ecid) && ecid.length >= 10);
    if (!emailForEvent && !ecidOk) {
      setRaceMessage(
        'Enter your customer email at the top before sending events, or ensure an ECID is available (anonymous mint completes shortly after load).',
        'error',
      );
      return false;
    }
    if (!location) {
      setRaceMessage('Choose a product area.', 'error');
      return false;
    }

    if (eventSubmitBtn) eventSubmitBtn.disabled = true;
    if (abandonedBasketBtn) abandonedBasketBtn.disabled = true;
    setRaceMessage('Sending event to AEP...', '');
    try {
      const target = getSelectedGeneratorTarget();
      const publicPayload = {
        location,
        interactionType: type,
        startDate: start || null,
        endDate: end || null,
      };
      if (includeEventRegistration) publicPayload.eventRegistration = location;
      const etLc = String(eventTypeName || '').trim().toLowerCase();
      const pkgSel = getSelectedBusinessPackage();
      if ((etLc === 'form.abandon' || etLc === 'quote.requested') && pkgSel) {
        publicPayload.businessPackage = pkgSel;
      }
      /** AEP standard page view + legacy `web.pageView` from the hidden form. */
      const isWebPageContext =
        etLc === 'web.webpagedetails.pageviews' || etLc === 'web.pageview';
      /** Product area (Step 1) → `web.webPageDetails.name` for web channel page events. */
      const onBizPage =
        document.body && document.body.classList.contains('oldmutual-business-page');
      const usePackageAsWebPageDetailsName =
        onBizPage &&
        pkgSel &&
        (etLc === 'form.abandon' || etLc === 'quote.requested');
      let viewNameForWeb = isWebPageContext && location ? location : 'Old Mutual';
      if (usePackageAsWebPageDetailsName) viewNameForWeb = pkgSel;
      const body = {
        targetId: target ? target.id : undefined,
        email: emailForEvent || '',
        eventType: eventTypeName,
        viewName: viewNameForWeb,
        pageName: viewNameForWeb,
        viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
        channel: demoExperienceChannel(),
        public: publicPayload,
      };
      if (usePackageAsWebPageDetailsName && pkgSel) body.webPageDetailsName = pkgSel;
      if (ecid) body.ecid = ecid;

      const res = await fetch('/api/events/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(augmentOmGeneratorPostBody(body)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || data.message || 'Request failed.';
        let extra = '';
        if (data.streamingResponse) extra = ' - ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
        else if (data.edgeBody) extra = ' - ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
        setRaceMessage(errMsg + extra, 'error');
        return false;
      }
      if (emailForEvent && typeof addEmail === 'function') addEmail(emailForEvent);
      let idPart = '';
      if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
      else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
      setRaceMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
      scheduleOmDrawerRefreshAfterEvent();
      return true;
    } catch (err) {
      setRaceMessage(err.message || 'Network error', 'error');
      return false;
    } finally {
      if (eventSubmitBtn) eventSubmitBtn.disabled = false;
      if (abandonedBasketBtn) abandonedBasketBtn.disabled = false;
    }
}

function selectedInteractionEventType() {
  const selected = eventType ? String(eventType.value || '').trim() : '';
  if (!selected) return 'web.pageView';
  return selected;
}

/** Absolute demo URL for `web.webPageDetails.URL` (destination page the user is moving to). */
function getOmDemoPageUrl(htmlFileName) {
  if (typeof window === 'undefined') return '';
  try {
    return new URL(htmlFileName, window.location.href).href.split('?')[0];
  } catch {
    return '';
  }
}

/**
 * Sends `web.webpagedetails.pageViews` with `web.webPageDetails.name` / `viewName` / `URL` aligned to the destination page.
 * @param {{ webPageDetailsName: string, htmlFileName: string, blockElements?: (Element|null|undefined)[], quiet?: boolean }} opts
 * @returns {Promise<boolean>}
 */
async function sendOmWebPageViewEvent(opts) {
  const webPageDetailsName = (opts && opts.webPageDetailsName) || 'Old Mutual';
  const htmlFileName = (opts && opts.htmlFileName) || 'oldmutual-demo.html';
  const blockElements = (opts && opts.blockElements) || [];
  const quiet = !!(opts && opts.quiet);

  const emailForEvent = getEmail().trim();
  const ecidForSend = getEcidForExperienceEvent();

  if (!emailForEvent && !ecidForSend) {
    if (!quiet) setRaceMessage('Enter your customer email at the top before sending events.', 'error');
    return false;
  }

  if (!quiet) {
    if (eventSubmitBtn) eventSubmitBtn.disabled = true;
    if (abandonedBasketBtn) abandonedBasketBtn.disabled = true;
    for (const el of blockElements) {
      if (el && el.style) el.style.pointerEvents = 'none';
    }
    setRaceMessage('Sending event to AEP...', '');
  } else {
    for (const el of blockElements) {
      if (el && el.style) el.style.pointerEvents = 'none';
    }
  }
  try {
    const target = getSelectedGeneratorTarget();
    const viewUrl = getOmDemoPageUrl(htmlFileName);
    const body = {
      targetId: target ? target.id : undefined,
      email: emailForEvent,
      eventType: 'web.webpagedetails.pageViews',
      viewName: webPageDetailsName,
      pageName: webPageDetailsName,
      webPageDetailsName,
      viewUrl,
      channel: demoExperienceChannel(),
    };
    if (ecidForSend) body.ecid = ecidForSend;

    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(augmentOmGeneratorPostBody(body)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || data.message || 'Request failed.';
      let extra = '';
      if (data.streamingResponse) extra = ' - ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
      else if (data.edgeBody) extra = ' - ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
      setRaceMessage(errMsg + extra, 'error');
      return false;
    }
    if (typeof addEmail === 'function') addEmail(emailForEvent);
    if (!quiet) {
      let idPart = '';
      if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
      else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
      setRaceMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
    }
    scheduleOmDrawerRefreshAfterEvent();
    return true;
  } catch (err) {
    setRaceMessage(err.message || 'Network error', 'error');
    return false;
  } finally {
    for (const el of blockElements) {
      if (el && el.style) el.style.pointerEvents = '';
    }
    if (!quiet) {
      if (eventSubmitBtn) eventSubmitBtn.disabled = false;
      if (abandonedBasketBtn) abandonedBasketBtn.disabled = false;
    }
  }
}

/**
 * `accountapplication.complete` with `web.webPageDetails` for the thank-you destination.
 * @returns {Promise<boolean>}
 */
/**
 * @param {'gold' | 'platinum'} product
 */
async function sendFnbAccountApplicationCompleteEvent(product) {
  const emailForEvent = getEmail().trim();

  if (!emailForEvent) {
    setRaceMessage('Enter your customer email at the top before sending events.', 'error');
    return false;
  }

  if (eventSubmitBtn) eventSubmitBtn.disabled = true;
  if (abandonedBasketBtn) abandonedBasketBtn.disabled = true;
  setRaceMessage('Sending application event to AEP...', '');
  try {
    const ecid = getEcidForExperienceEvent();
    const target = getSelectedGeneratorTarget();
    const isPlatinum = product === 'platinum';
    const webPageDetailsName = isPlatinum
      ? 'FNB Platinum Business Account application'
      : 'FNB Gold Business Account application';
    const thankYouFile = isPlatinum
      ? 'fnb-platinum-business-thank-you.html'
      : 'fnb-gold-business-thank-you.html';
    const viewUrl = getOmDemoPageUrl(thankYouFile);
    const body = {
      targetId: target ? target.id : undefined,
      email: emailForEvent,
      eventType: 'accountapplication.complete',
      viewName: webPageDetailsName,
      pageName: webPageDetailsName,
      webPageDetailsName,
      viewUrl,
      channel: demoExperienceChannel(),
    };
    if (ecid) body.ecid = ecid;

    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(augmentOmGeneratorPostBody(body)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.error || data.message || 'Request failed.';
      let extra = '';
      if (data.streamingResponse) extra = ' - ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
      else if (data.edgeBody) extra = ' - ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
      setRaceMessage(errMsg + extra, 'error');
      return false;
    }
    if (typeof addEmail === 'function') addEmail(emailForEvent);
    let idPart = '';
    if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
    else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
    setRaceMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
    scheduleOmDrawerRefreshAfterEvent();
    return true;
  } catch (err) {
    setRaceMessage(err.message || 'Network error', 'error');
    return false;
  } finally {
    if (eventSubmitBtn) eventSubmitBtn.disabled = false;
    if (abandonedBasketBtn) abandonedBasketBtn.disabled = false;
  }
}

/**
 * @param {Document} doc
 * @param {string} headingRe e.g. FNB Gold Business Account
 * @returns {HTMLButtonElement | null}
 */
function findBusinessAccountApplyButtonByHeading(doc, headingRe) {
  if (!doc || !doc.querySelectorAll) return null;
  const re = new RegExp(headingRe, 'i');
  const productH4 = Array.from(doc.querySelectorAll('h4.atom.text--heading')).find((el) =>
    re.test(el.textContent || ''),
  );
  if (!productH4) return null;
  const col = productH4.closest('.atom.frame-col');
  if (col) {
    const inCol = col.querySelector('button[data-trackclick="Button  - Apply now"]');
    if (inCol) return inCol;
  }
  const h4s = Array.from(doc.querySelectorAll('h4.atom.text--heading'));
  const idx = h4s.indexOf(productH4);
  const nextH4 = h4s[idx + 1];
  const buttons = Array.from(doc.querySelectorAll('button[data-trackclick="Button  - Apply now"]'));
  return (
    buttons.find((btn) => {
      const after = productH4.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING;
      const beforeNext =
        !nextH4 || (nextH4.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
      return after && beforeNext;
    }) || null
  );
}

function findGoldBusinessApplyButton(doc) {
  return findBusinessAccountApplyButtonByHeading(doc, 'FNB Gold Business Account');
}

function findPlatinumBusinessApplyButton(doc) {
  return findBusinessAccountApplyButtonByHeading(doc, 'FNB Platinum Business Account');
}

function wireFnbBusinessAccountApplyButtons(iframe) {
  if (!iframe) return;
  const doc = iframe.contentDocument;
  if (!doc) return;

  function wireOne(product, findBtn, thankYouFile) {
    const btn = findBtn(doc);
    if (!btn || btn.dataset.fnbDemoProductApply) return;
    btn.dataset.fnbDemoProductApply = product;
    btn.removeAttribute('onclick');
    btn.type = 'button';
    btn.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.disabled = true;
        try {
          const ok = await sendFnbAccountApplicationCompleteEvent(product);
          if (ok) fnbNavigatePreserveSim(thankYouFile);
        } finally {
          btn.disabled = false;
        }
      },
      true,
    );
  }

  wireOne('gold', findGoldBusinessApplyButton, 'fnb-gold-business-thank-you.html');
  wireOne('platinum', findPlatinumBusinessApplyButton, 'fnb-platinum-business-thank-you.html');
}

const fnbBusinessBankingCard = document.querySelector('.fnb-pill-card-business');
fnbBusinessBankingCard &&
  fnbBusinessBankingCard.addEventListener('click', async (e) => {
    e.preventDefault();
    clearAbandonBasketTimer();
    try {
      await sendOmWebPageViewEvent({
        webPageDetailsName: 'Business Banking',
        htmlFileName: 'fnb-business-banking.html',
        blockElements: [fnbBusinessBankingCard],
      });
    } finally {
      fnbNavigatePreserveSim('fnb-business-banking.html');
    }
  });

const fnbSwitchBusinessCta = document.getElementById('fnbSwitchBusinessCta');
fnbSwitchBusinessCta &&
  fnbSwitchBusinessCta.addEventListener('click', async (e) => {
    e.preventDefault();
    clearAbandonBasketTimer();
    try {
      await sendOmWebPageViewEvent({
        webPageDetailsName: 'Business Accounts',
        htmlFileName: 'fnb-business-accounts.html',
        blockElements: [fnbSwitchBusinessCta],
      });
    } finally {
      fnbNavigatePreserveSim('fnb-business-accounts.html');
    }
  });

/** Old Mutual demo: Wealth nav sends destination page view before client-side navigation (same pattern as FNB Business). */
(function wireOmWealthDemoLinks() {
  const links = document.querySelectorAll('a[data-om-wealth-demo="1"]');
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        clearAbandonBasketTimer();
        try {
          await sendOmWebPageViewEvent({
            webPageDetailsName: 'Wealth Management Solutions',
            htmlFileName: 'oldmutual-wealth.html',
            blockElements: [link],
          });
        } finally {
          fnbNavigatePreserveSim('oldmutual-wealth.html');
        }
      },
      true,
    );
  });
})();

/** Old Mutual demo: Business nav sends destination page view before client-side navigation. */
(function wireOmBusinessDemoLinks() {
  const links = document.querySelectorAll('a[data-om-business-demo="1"]');
  if (!links.length) return;
  links.forEach((link) => {
    link.addEventListener(
      'click',
      async (e) => {
        e.preventDefault();
        clearAbandonBasketTimer();
        try {
          await sendOmWebPageViewEvent({
            webPageDetailsName: 'Insurance for Business',
            htmlFileName: 'oldmutual-insurance-for-business.html',
            blockElements: [link],
          });
        } finally {
          fnbNavigatePreserveSim('oldmutual-insurance-for-business.html');
        }
      },
      true,
    );
  });
})();

/** Business insurance demo: after a package is chosen, send `form.abandon` in 10s (timer resets on each change). */
(function wireOmBusinessPackageAbandonTimer() {
  if (!document.body || !document.body.classList.contains('oldmutual-business-page')) return;

  function kickIfPackageSelected() {
    if (getSelectedBusinessPackage()) scheduleBusinessFormAbandonCountdown();
  }

  document.addEventListener(
    'change',
    (e) => {
      const t = e.target;
      if (t && t.name === 'businessPackage') kickIfPackageSelected();
    },
    true,
  );

  function scheduleInitialKick() {
    window.setTimeout(kickIfPackageSelected, 900);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleInitialKick);
  } else {
    scheduleInitialKick();
  }
})();

/** Business insurance: Get a quote sends `quote.requested` with package in web details, then navigates to thank-you. */
(function wireOmBusinessGetQuote() {
  if (!document.body || !document.body.classList.contains('oldmutual-business-page')) return;

  async function onGetQuoteClick(e) {
    e.preventDefault();
    const pkg = getSelectedBusinessPackage();
    if (!pkg) {
      setRaceMessage(
        'Select a Business Cover package (Silver, Gold or Platinum) before requesting a quote.',
        'error',
      );
      return;
    }
    clearAbandonBasketTimer();
    const ok = await sendRaceEvent('quote.requested', true);
    if (!ok) return;
    try {
      sessionStorage.setItem(OM_BUSINESS_QUOTE_PACKAGE_KEY, pkg);
    } catch (_) {
      /* ignore */
    }
    fnbNavigatePreserveSim('oldmutual-business-quote-thank-you.html');
  }

  document.querySelectorAll('.om-business-get-quote').forEach((el) => {
    el.addEventListener('click', onGetQuoteClick);
  });
})();

raceEventForm &&
  raceEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAbandonBasketTimer();
    await sendRaceEvent(selectedInteractionEventType(), true);
  });

abandonedBasketBtn &&
  abandonedBasketBtn.addEventListener('click', async () => {
    clearAbandonBasketTimer();
    await sendRaceEvent('form.abandon', true);
  });

void loadGeneratorTargets();
if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
  window.AepDemoGeneratorTargets.onSandboxChange(function () {
    void loadGeneratorTargets();
  });
}

(function initOmDemoEnvStrip() {
  if (typeof AepDemoEnvStrip === 'undefined' || typeof AepDemoEnvStrip.initStandardEnvBar !== 'function') return;
  if (!document.getElementById('aepDemoEnvSection')) return;
  AepDemoEnvStrip.initStandardEnvBar({
    summaryId: 'omSdkConfigSummary',
    fieldsId: 'omSdkConfigFields',
    selectedScriptCodeId: 'omSelectedScript',
  });
})();

if (typeof DemoProfileDrawer !== 'undefined' && typeof DemoProfileDrawer.init === 'function') {
  DemoProfileDrawer.init({
    emailInputId: 'customerEmail',
    messageSetter: setRaceMessage,
    getSelectedGeneratorTarget: getSelectedGeneratorTarget,
    fetchBrowserEcidOnInit: true,
  });
}

const omLogoutBtn = document.getElementById('omLogoutBtn');

function logoutOmDemoPage() {
  try {
    sessionStorage.removeItem(OM_SESSION_PROFILE_EMAIL_KEY);
  } catch (_) {
    /* ignore */
  }
  if (customerEmail) customerEmail.value = '';
  if (infoEcid) {
    try {
      const anon = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
      infoEcid.textContent = anon && /^\d{10,}$/.test(anon) ? anon : '—';
    } catch (_) {
      infoEcid.textContent = '—';
    }
  }
  if (window.AepProfileDrawer && typeof window.AepProfileDrawer.clearProfileSession === 'function') {
    window.AepProfileDrawer.clearProfileSession();
  }
  void (async () => {
    await ensureAnonymousEcid();
    applyAnonymousEcidToBarIfNeeded();
    let ecid = getEcidForExperienceEvent();
    if (!ecid) {
      try {
        const s = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
        if (s && /^\d+$/.test(s) && s.length >= 10) ecid = s;
      } catch (_) {
        /* ignore */
      }
    }
    if (
      ecid &&
      window.AepProfileDrawer &&
      typeof window.AepProfileDrawer.loadVisitorProfileDataForDrawer === 'function'
    ) {
      await window.AepProfileDrawer.loadVisitorProfileDataForDrawer(ecid, { onUserMessage: () => {} });
    }
  })();
  setRaceMessage('Logged out.', '');
}

omLogoutBtn &&
  omLogoutBtn.addEventListener('click', function () {
    logoutOmDemoPage();
  });

const omResetVisitorEcidBtn = document.getElementById('omResetVisitorEcidBtn');
omResetVisitorEcidBtn &&
  omResetVisitorEcidBtn.addEventListener('click', async function () {
    omResetVisitorEcidBtn.disabled = true;
    try {
      await resetOmVisitorEcidDemo();
    } finally {
      omResetVisitorEcidBtn.disabled = false;
    }
  });

/** Rehydrate email + drawer after navigating between Old Mutual demo pages (same tab). */
(function restoreOmSessionProfileAcrossPages() {
  if (!document.body || !document.body.classList.contains('oldmutual-demo-page')) return;
  let saved;
  try {
    saved = sessionStorage.getItem(OM_SESSION_PROFILE_EMAIL_KEY);
  } catch (_) {
    return;
  }
  if (!saved || !customerEmail || !window.AepProfileDrawer) return;
  customerEmail.value = saved;
  void (async () => {
    await ensureAnonymousEcid();
    applyAnonymousEcidToBarIfNeeded();
    await window.AepProfileDrawer.loadProfileDataForDrawer(saved, {
      onUserMessage: (msg, type) => {
        if (type === 'error') setRaceMessage(msg, type);
      },
      addEmailOnSuccess: false,
    });
  })();
})();

/**
 * All Old Mutual demo pages: ensure anonymous ECID early; optional bar display before profile load completes.
 * `web.webpagedetails.pageViews` on load (ECID-only when not logged in — captures browsing for unknown profile).
 */
(function initAnonymousEcidAndBarForOmDemo() {
  if (!document.body || !document.body.classList.contains('oldmutual-demo-page')) return;
  void (async () => {
    await ensureAnonymousEcid();
    applyAnonymousEcidToBarIfNeeded();
    if (getEmail().trim()) return;
    let savedEmail = '';
    try {
      savedEmail = sessionStorage.getItem(OM_SESSION_PROFILE_EMAIL_KEY) || '';
    } catch (_) {
      /* ignore */
    }
    if (savedEmail.trim()) return;
    let ecid = getEcidForExperienceEvent();
    if (!ecid) {
      try {
        const s = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
        if (s && /^\d+$/.test(s) && s.length >= 10) ecid = s;
      } catch (_) {
        /* ignore */
      }
    }
    if (
      ecid &&
      window.AepProfileDrawer &&
      typeof window.AepProfileDrawer.loadVisitorProfileDataForDrawer === 'function'
    ) {
      await window.AepProfileDrawer.loadVisitorProfileDataForDrawer(ecid, { onUserMessage: () => {} });
    }
  })();
})();

(function initOmDemoPageViewOnLoad() {
  const body = document.body;
  if (!body || !body.classList.contains('oldmutual-demo-page')) return;

  function pageViewSpec() {
    if (body.classList.contains('oldmutual-wealth-page')) {
      return {
        webPageDetailsName: 'Wealth Management Solutions',
        htmlFileName: 'oldmutual-wealth.html',
      };
    }
    if (body.classList.contains('oldmutual-business-quote-thank-you-page')) {
      return {
        webPageDetailsName: 'Business insurance quote confirmation',
        htmlFileName: 'oldmutual-business-quote-thank-you.html',
      };
    }
    if (body.classList.contains('oldmutual-business-page')) {
      return {
        webPageDetailsName: 'Insurance for Business',
        htmlFileName: 'oldmutual-insurance-for-business.html',
      };
    }
    return { webPageDetailsName: 'Old Mutual Home', htmlFileName: 'oldmutual-demo.html' };
  }

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      void (async () => {
        await ensureAnonymousEcid();
        applyAnonymousEcidToBarIfNeeded();
        const spec = pageViewSpec();
        void sendOmWebPageViewEvent({
          webPageDetailsName: spec.webPageDetailsName,
          htmlFileName: spec.htmlFileName,
          blockElements: [],
          quiet: true,
        });
      })();
    }, 600);
  });
})();

(function initRacePageFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('race-page')) return;
  const sidebar = document.querySelector('.dashboard-sidebar');
  if (!sidebar) return;

  const mq = window.matchMedia('(max-width: 768px)');
  let hideTimer = null;

  function clearHideTimer() {
    if (hideTimer) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function setFlyoutOpen(open) {
    body.classList.toggle('race-page--nav-open', open);
  }

  function scheduleClose() {
    clearHideTimer();
    hideTimer = window.setTimeout(function () {
      setFlyoutOpen(false);
      hideTimer = null;
    }, 450);
  }

  function onPointerMove(e) {
    if (mq.matches) return;
    if (e.clientX <= 24) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    const r = sidebar.getBoundingClientRect();
    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('race-page--nav-open')) {
      scheduleClose();
    }
  }

  sidebar.addEventListener('mouseenter', function () {
    if (!mq.matches) {
      clearHideTimer();
      setFlyoutOpen(true);
    }
  });
  sidebar.addEventListener('mouseleave', function () {
    if (!mq.matches) scheduleClose();
  });

  document.addEventListener('mousemove', onPointerMove, { passive: true });
  mq.addEventListener('change', function () {
    clearHideTimer();
    if (mq.matches) body.classList.remove('race-page--nav-open');
  });
  setFlyoutOpen(false);
})();

/**
 * Business banking: saved FNB HTML in iframe below the demo hero. Same-origin: expand iframe
 * to document height so the parent page scrolls; strip cookie overlay when it is injected.
 */
(function initFnbBusinessSavedEmbed() {
  if (!document.body || !document.body.classList.contains('fnb-business-banking-page')) return;
  const iframe = document.getElementById('fnbBusinessSavedEmbed');
  if (!iframe) return;

  const SANITIZE_STYLE =
    '#cookieBanner{display:none!important;visibility:hidden!important;pointer-events:none!important;height:0!important;overflow:hidden!important;}' +
    '#cookieBanner *{display:none!important;}' +
    /* Single scrollbar on parent: no inner document scroll */
    'html#zaSkin{overflow-x:hidden!important;overflow-y:visible!important;height:auto!important;min-height:0!important;}' +
    'html#zaSkin body{overflow-x:hidden!important;overflow-y:visible!important;min-height:0!important;height:auto!important;}' +
    /* FNB skin uses html,body{height:100%} + .wrapperHeight100{height:100%}; that chains to the iframe height and leaves huge blank bands below real content (main column is .cookieTrail). */
    'html#zaSkin body .wrapper.cookieTrail.wrapperHeight100{' +
    'height:auto!important;min-height:0!important;max-height:none!important;}' +
    /* First "slide" in saved page = duplicate FNB header row + full-width hero/CTA (we show our own above iframe) */
    '#section1Wrapper{display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}' +
    /* Saved page footer duplicates parent fnb-business-banking.html .fnb-site-footer — hide embed footer only */
    '#section8Wrapper,section.webFooter.atom.section{display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}' +
    /* Site chrome inside embed: tab row + utility header strip */
    '.section.headerTabs,.section.height2.headerTabs,' +
    '.section.header.atom.backTurq,.section.height2.header.atom.backTurq{' +
    'display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}' +
    /* skin.css: base .atom.section { height:100vh } for wide viewports; #section4Wrapper uses section-default+section-autoM (height:auto only ≤599px). .content-height-30 { min-height:75rem }. Section-half { height:50vh } + inner min-heights — vast blank bands after the peach “Explore…” row. */
    'html#zaSkin body .atom.section.section-default{' +
    'height:auto!important;min-height:0!important;}' +
    'html#zaSkin body .atom.section.section-half{' +
    'height:auto!important;min-height:0!important;}' +
    'html#zaSkin body .atom.section .section-content.content-height-30{' +
    'min-height:0!important;}' +
    'html#zaSkin body .atom.section.section-half .section-content,' +
    'html#zaSkin body .atom.section.section-half-scroll .section-content{' +
    'min-height:0!important;}' +
    /* “Explore the best account…”: #f2f6f7; text column ~50%; artwork confined to right 50% (was ~⅔ text / ⅓ visual via bg cover). */
    '#section4Wrapper{' +
    'background-color:#f2f6f7!important;' +
    'min-height:clamp(380px,52vmin,680px)!important;position:relative!important;}' +
    '#background-image-4.container--background{' +
    'background-color:#f2f6f7!important;' +
    'left:50%!important;right:0!important;width:50%!important;top:0!important;bottom:0!important;' +
    'height:100%!important;min-height:100%!important;' +
    'background-image:url(https://www.fnb.co.za/00Assets/za/zaImages/business-banking/overview/PC_Small/PC_SMALL_FINAL.jpg)!important;' +
    'background-size:contain!important;background-position:center center!important;background-repeat:no-repeat!important;' +
    'background-attachment:scroll!important;}' +
    '#section4Wrapper .atom.frame-row.frame-row-1[data-dotstoggle="true"]{' +
    'display:flex!important;flex-wrap:nowrap!important;width:100%!important;align-items:flex-start!important;}' +
    '#section4Wrapper .atom.frame-row.frame-row-1[data-dotstoggle="true"]>.atom.frame-col.frame-col-5{' +
    'flex:0 0 50%!important;max-width:50%!important;width:50%!important;margin-left:0!important;' +
    'float:none!important;box-sizing:border-box!important;padding-right:clamp(12px,2vw,28px)!important;}' +
    '@media only screen and (max-width:599px){' +
    '#section4Wrapper .atom.frame-row.frame-row-1[data-dotstoggle="true"]>.atom.frame-col.frame-col-5{' +
    'flex:1 1 100%!important;max-width:100%!important;width:100%!important;padding-right:0!important;}' +
    '#background-image-4.container--background{' +
    'position:relative!important;left:0!important;width:100%!important;height:min(56vw,280px)!important;min-height:200px!important;margin-top:0.75rem!important;}' +
    '}' +
    /* 3×3 service tiles: equal row heights + solid #f2f6f7 */
    '#section5Wrapper .CardsCholder,html#zaSkin body .CardsCholder{' +
    'background-image:none!important;background-color:#f2f6f7!important;}' +
    '#section5Wrapper .atom.frame-col.frame-col-12{' +
    'display:flex!important;flex-wrap:wrap!important;align-items:stretch!important;width:100%!important;}' +
    '#section5Wrapper .atom.frame-col.frame-col-12>.atom.frame-col[class*="frame-col-4"]{' +
    'float:none!important;display:flex!important;flex-direction:column!important;' +
    'flex:1 1 30%!important;max-width:33.333%!important;box-sizing:border-box!important;}' +
    '#section5Wrapper .CardsCholder{' +
    'flex:1 1 auto!important;display:flex!important;flex-direction:column!important;' +
    'min-height:100%!important;height:auto!important;}' +
    '@media only screen and (max-width:599px){' +
    '#section5Wrapper .atom.frame-col.frame-col-12>.atom.frame-col[class*="frame-col-4"]{' +
    'flex:1 1 100%!important;max-width:100%!important;}}';

  /** @type {ResizeObserver | null} */
  let embedResizeObserver = null;

  function sanitizeIframeDoc(doc) {
    if (!doc || !doc.head) return;
    let tag = doc.getElementById('fnb-demo-business-embed-sanitize');
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = 'fnb-demo-business-embed-sanitize';
      tag.textContent = SANITIZE_STYLE;
      doc.head.appendChild(tag);
    } else {
      tag.textContent = SANITIZE_STYLE;
    }
    const banner = doc.getElementById('cookieBanner');
    if (banner) banner.remove();
  }

  function resizeIframeHeight() {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const root = doc.documentElement;
      const h = Math.max(
        doc.body.scrollHeight || 0,
        doc.body.offsetHeight || 0,
        root.scrollHeight || 0,
        root.offsetHeight || 0,
        720,
      );
      const px = Math.ceil(h) + 'px';
      iframe.style.height = px;
      iframe.style.minHeight = px;
      iframe.style.overflow = 'hidden';
    } catch (_) {
      /* cross-origin */
    }
  }

  function attachEmbedLayoutHooks(doc) {
    if (!doc || !doc.defaultView) return;
    try {
      if (embedResizeObserver) {
        embedResizeObserver.disconnect();
        embedResizeObserver = null;
      }
      if (typeof ResizeObserver !== 'undefined') {
        embedResizeObserver = new ResizeObserver(() => resizeIframeHeight());
        embedResizeObserver.observe(doc.body);
        embedResizeObserver.observe(doc.documentElement);
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (doc.fonts && doc.fonts.ready) {
        void doc.fonts.ready.then(() => resizeIframeHeight());
      }
    } catch (_) {
      /* ignore */
    }
    try {
      doc.defaultView.addEventListener('resize', resizeIframeHeight);
    } catch (_) {
      /* ignore */
    }
  }

  let cookieObserver = null;

  function onIframeLoad() {
    const doc = iframe.contentDocument;
    sanitizeIframeDoc(doc);
    resizeIframeHeight();
    attachEmbedLayoutHooks(doc);
    [200, 500, 1200, 2500, 4500, 8000, 12000, 20000].forEach((ms) =>
      window.setTimeout(resizeIframeHeight, ms),
    );

    if (doc && doc.body && !cookieObserver) {
      cookieObserver = new MutationObserver(() => {
        sanitizeIframeDoc(iframe.contentDocument);
        resizeIframeHeight();
      });
      cookieObserver.observe(doc.body, { childList: true, subtree: true, attributes: true });
      window.setTimeout(() => {
        if (cookieObserver) {
          cookieObserver.disconnect();
          cookieObserver = null;
        }
      }, 60000);
    }

    try {
      const w = iframe.contentWindow;
      if (w) {
        w.addEventListener('load', resizeIframeHeight);
      }
    } catch (_) {}
  }

  iframe.addEventListener('load', onIframeLoad);
  window.addEventListener('resize', () => window.requestAnimationFrame(resizeIframeHeight));
})();

/**
 * Business accounts: saved FNB HTML in iframe. Strip duplicate site chrome and footer; keep page body (section1–3).
 */
(function initFnbBusinessAccountsSavedEmbed() {
  if (!document.body || !document.body.classList.contains('fnb-business-accounts-page')) return;
  const iframe = document.getElementById('fnbBusinessAccountsEmbed');
  if (!iframe) return;

  const SANITIZE_STYLE =
    '#cookieBanner,#cookieBanner.minified,#cookieBanner .cookieBanner,.cookieBanner,' +
    '#onetrust-banner-sdk,#onetrust-consent-sdk,.onetrust-pc-dark-filter{' +
    'display:none!important;visibility:hidden!important;pointer-events:none!important;' +
    'height:0!important;width:0!important;max-height:0!important;overflow:hidden!important;' +
    'opacity:0!important;position:fixed!important;left:-9999px!important;top:0!important;z-index:-1!important;}' +
    '#cookieBanner *{display:none!important;}' +
    'html#zaSkin{overflow-x:hidden!important;overflow-y:visible!important;height:auto!important;min-height:0!important;background-color:#ffffff!important;}' +
    'html#zaSkin body{overflow-x:hidden!important;overflow-y:visible!important;min-height:0!important;height:auto!important;background-color:#ffffff!important;}' +
    'html#zaSkin body .wrapper.cookieTrail.wrapperHeight100{' +
    'height:auto!important;min-height:0!important;max-height:none!important;}' +
    /* Saved page footer duplicates parent .fnb-site-footer */
    '#section4Wrapper,section.webFooter.atom.section{display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}' +
    /* Site chrome inside embed: tab row + utility header strip */
    '.section.headerTabs,.section.height2.headerTabs,' +
    '.section.header.atom.backTurq,.section.height2.header.atom.backTurq{' +
    'display:none!important;height:0!important;max-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;}' +
    'html#zaSkin body .atom.section.section-default{' +
    'height:auto!important;min-height:0!important;}' +
    'html#zaSkin body .atom.section.section-half{' +
    'height:auto!important;min-height:0!important;}' +
    'html#zaSkin body .atom.section .section-content.content-height-30{' +
    'min-height:0!important;}' +
    'html#zaSkin body .atom.section.section-half .section-content,' +
    'html#zaSkin body .atom.section.section-half-scroll .section-content{' +
    'min-height:0!important;}' +
    /* FNB skin fixes .scrollmenu-main-container to position:fixed + top:60–85px for the live site header.
       In our iframe that leaves a #f5f5f5 band above the pills; use normal flow flush to the top. */
    '.atom.scrollmenu-main-container{' +
    'position:static!important;top:auto!important;left:auto!important;right:auto!important;' +
    'height:auto!important;min-height:0!important;margin-bottom:0!important;' +
    'background-color:#ffffff!important;}' +
    /* Saved page reserves space-top-4 (10rem) for the live site header; pull heading + cards up under the pill nav. */
    '#section1Wrapper .atom.section.section-auto .section-content{' +
    'min-height:0!important;padding-top:0!important;padding-bottom:0!important;}' +
    '#section1Wrapper .section-row.vertical-align{' +
    'vertical-align:top!important;}' +
    '#section1Wrapper .atom.frame-row.frame-row-5,' +
    '#section1Wrapper .frame-row.space-top-4,' +
    '#section1Wrapper .space-top-4,' +
    '#section1Wrapper .space-top-M1{' +
    'margin-top:0.65rem!important;}' +
    '#section1Wrapper h1.heading-2{' +
    'margin-top:0!important;margin-bottom:0.5rem!important;}' +
    '#section1Wrapper p.text--paragraph{' +
    'margin-top:0!important;margin-bottom:0.35rem!important;}' +
    '#section2Wrapper{' +
    'margin-top:0!important;padding-top:0!important;}' +
    '#section2Wrapper .atom.dashboard-slide.dashboard-slide-row{' +
    'margin-top:0!important;padding-top:0!important;}';

  /** @type {ResizeObserver | null} */
  let embedResizeObserver = null;

  function stripInjectedCookieUi(doc) {
    if (!doc || !doc.body) return;
    try {
      const ids = ['cookieBanner', 'onetrust-banner-sdk', 'onetrust-consent-sdk'];
      ids.forEach((id) => {
        const el = doc.getElementById(id);
        if (el) el.remove();
      });
      doc.querySelectorAll('[id*="cookie"],[id*="Cookie"]').forEach((el) => {
        if (el && /cookie/i.test(el.id)) el.remove();
      });
      doc.querySelectorAll('.onetrust-pc-dark-filter,.ot-sdk-show-settings').forEach((el) => el.remove());
    } catch (_) {
      /* ignore */
    }
  }

  function sanitizeIframeDoc(doc) {
    if (!doc || !doc.head) return;
    let tag = doc.getElementById('fnb-demo-business-accounts-embed-sanitize');
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = 'fnb-demo-business-accounts-embed-sanitize';
      tag.textContent = SANITIZE_STYLE;
      doc.head.appendChild(tag);
    } else {
      tag.textContent = SANITIZE_STYLE;
    }
    stripInjectedCookieUi(doc);
  }

  function resizeIframeHeight() {
    try {
      const doc = iframe.contentDocument;
      if (!doc || !doc.body) return;
      const root = doc.documentElement;
      const h = Math.max(
        doc.body.scrollHeight || 0,
        doc.body.offsetHeight || 0,
        root.scrollHeight || 0,
        root.offsetHeight || 0,
        720,
      );
      const px = Math.ceil(h) + 'px';
      iframe.style.height = px;
      iframe.style.minHeight = px;
      iframe.style.overflow = 'hidden';
    } catch (_) {
      /* cross-origin */
    }
  }

  function attachEmbedLayoutHooks(doc) {
    if (!doc || !doc.defaultView) return;
    try {
      if (embedResizeObserver) {
        embedResizeObserver.disconnect();
        embedResizeObserver = null;
      }
      if (typeof ResizeObserver !== 'undefined') {
        embedResizeObserver = new ResizeObserver(() => resizeIframeHeight());
        embedResizeObserver.observe(doc.body);
        embedResizeObserver.observe(doc.documentElement);
      }
    } catch (_) {
      /* ignore */
    }
    try {
      if (doc.fonts && doc.fonts.ready) {
        void doc.fonts.ready.then(() => resizeIframeHeight());
      }
    } catch (_) {
      /* ignore */
    }
    try {
      doc.defaultView.addEventListener('resize', resizeIframeHeight);
    } catch (_) {
      /* ignore */
    }
  }

  let cookieObserver = null;

  function onIframeLoad() {
    const doc = iframe.contentDocument;
    sanitizeIframeDoc(doc);
    resizeIframeHeight();
    attachEmbedLayoutHooks(doc);
    function scheduleWireBusinessApply() {
      wireFnbBusinessAccountApplyButtons(iframe);
    }
    scheduleWireBusinessApply();
    [400, 1200, 2500, 4500].forEach((ms) => window.setTimeout(scheduleWireBusinessApply, ms));
    for (let i = 0; i < 40; i++) {
      window.setTimeout(() => sanitizeIframeDoc(iframe.contentDocument), i * 350);
    }
    [200, 500, 1200, 2500, 4500, 8000, 12000, 20000].forEach((ms) =>
      window.setTimeout(resizeIframeHeight, ms),
    );

    if (doc && doc.body && !cookieObserver) {
      cookieObserver = new MutationObserver(() => {
        sanitizeIframeDoc(iframe.contentDocument);
        resizeIframeHeight();
        scheduleWireBusinessApply();
      });
      cookieObserver.observe(doc.body, { childList: true, subtree: true, attributes: true });
      window.setTimeout(() => {
        if (cookieObserver) {
          cookieObserver.disconnect();
          cookieObserver = null;
        }
      }, 300000);
    }

    try {
      const w = iframe.contentWindow;
      if (w) {
        w.addEventListener('load', resizeIframeHeight);
      }
    } catch (_) {}
  }

  iframe.addEventListener('load', onIframeLoad);
  window.addEventListener('resize', () => window.requestAnimationFrame(resizeIframeHeight));
})();

(function initOmBusinessQuoteThankYouPage() {
  if (!document.body || !document.body.classList.contains('oldmutual-business-quote-thank-you-page')) return;

  const subtitle = document.getElementById('omQuoteThankYouPackage');
  const pkgInLead = document.getElementById('omThankYouPackageInLead');
  let pkg = '';
  try {
    pkg = (sessionStorage.getItem(OM_BUSINESS_QUOTE_PACKAGE_KEY) || '').trim();
  } catch (_) {
    pkg = '';
  }
  const pkgDefault = 'Old Mutual Insurance for Business';
  const pkgLabel = pkg || pkgDefault;
  if (subtitle) subtitle.textContent = pkgLabel;
  if (pkgInLead) pkgInLead.textContent = pkgLabel;

  const email = getEmail().trim();
  const canFetchProfile =
    !!email &&
    window.AepProfileDrawer &&
    typeof window.AepProfileDrawer.loadProfileDataForDrawer === 'function';

  function revealThankYouLead() {
    const lead = document.getElementById('omThankYouLead');
    if (!lead) return;
    lead.classList.remove('om-thank-you-lead--awaiting-name');
    lead.classList.add('om-thank-you-lead--name-ready');
    lead.removeAttribute('aria-hidden');
  }

  function applyThankYouFirstName(opts) {
    const finalize = !!(opts && opts.finalize);
    const el = document.getElementById('omThankYouFirstName');
    const p =
      window.AepProfileDrawer && window.AepProfileDrawer.getLastLookedUpProfile
        ? window.AepProfileDrawer.getLastLookedUpProfile()
        : null;
    const first = p && p.firstName ? String(p.firstName).trim() : '';
    if (first) {
      if (el) el.textContent = first;
      revealThankYouLead();
      return;
    }
    if (finalize) {
      if (el) el.textContent = 'there';
      revealThankYouLead();
      return;
    }
    if (!canFetchProfile) {
      if (el) el.textContent = 'there';
      revealThankYouLead();
    }
  }

  applyThankYouFirstName();
  if (canFetchProfile) {
    void window.AepProfileDrawer
      .loadProfileDataForDrawer(email, {
        addEmailOnSuccess: false,
        onUserMessage: () => {},
      })
      .then(() => applyThankYouFirstName({ finalize: true }));
  }
})();

(function initFnbGoldThankYouPage() {
  if (
    !document.body ||
    (!document.body.classList.contains('fnb-gold-thank-you-page') &&
      !document.body.classList.contains('fnb-platinum-thank-you-page'))
  )
    return;

  const email = getEmail().trim();
  const canFetchProfile =
    !!email &&
    window.AepProfileDrawer &&
    typeof window.AepProfileDrawer.loadProfileDataForDrawer === 'function';

  function revealThankYouLead() {
    const lead = document.getElementById('fnbThankYouLead');
    if (!lead) return;
    lead.classList.remove('fnb-thank-you-lead--awaiting-name');
    lead.classList.add('fnb-thank-you-lead--name-ready');
    lead.removeAttribute('aria-hidden');
  }

  /**
   * @param {{ finalize?: boolean }} opts - finalize: profile load finished (or skipped); use fallback "there" if still no firstName
   */
  function applyThankYouFirstName(opts) {
    const finalize = !!(opts && opts.finalize);
    const el = document.getElementById('fnbThankYouFirstName');
    const p = window.AepProfileDrawer && window.AepProfileDrawer.getLastLookedUpProfile
      ? window.AepProfileDrawer.getLastLookedUpProfile()
      : null;
    const first = p && p.firstName ? String(p.firstName).trim() : '';
    if (first) {
      if (el) el.textContent = first;
      revealThankYouLead();
      return;
    }
    if (finalize) {
      if (el) el.textContent = 'there';
      revealThankYouLead();
      return;
    }
    if (!canFetchProfile) {
      if (el) el.textContent = 'there';
      revealThankYouLead();
    }
  }

  applyThankYouFirstName();
  if (canFetchProfile) {
    void window.AepProfileDrawer
      .loadProfileDataForDrawer(email, {
        addEmailOnSuccess: false,
        onUserMessage: () => {},
      })
      .then(() => applyThankYouFirstName({ finalize: true }));
  }
})();

/**
 * Old Mutual home: tabbed “solutions” carousel (scroll-snap + dot indicators).
 */
(function initOmHomePromoSections() {
  const root = document.getElementById('omSolutionsShowcase');
  if (!root) return;

  const tabs = Array.from(root.querySelectorAll('[data-om-solution-tab]'));
  const panels = Array.from(root.querySelectorAll('[data-om-solution-panel]'));
  const prevBtn = root.querySelector('.om-carousel-nav--prev');
  const nextBtn = root.querySelector('.om-carousel-nav--next');
  const dotsWrap = root.querySelector('.om-carousel-dots');

  /** @type {{ track: Element, fn: () => void } | null} */
  let scrollBinding = null;

  function getActiveTrack() {
    const panel = panels.find((p) => !p.hidden);
    return panel ? panel.querySelector('.om-carousel-track') : null;
  }

  function nearestCardIndex(track) {
    const cards = track.querySelectorAll('.om-solution-card');
    if (!cards.length) return 0;
    const anchor = track.scrollLeft + track.clientWidth * 0.15;
    let best = 0;
    let bestDist = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - anchor);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function updateDots() {
    if (!dotsWrap) return;
    const track = getActiveTrack();
    if (!track) return;
    const idx = nearestCardIndex(track);
    dotsWrap.querySelectorAll('.om-carousel-dot').forEach((d, j) => {
      d.classList.toggle('om-carousel-dot--active', j === idx);
    });
  }

  function bindScroll() {
    if (scrollBinding) {
      scrollBinding.track.removeEventListener('scroll', scrollBinding.fn);
      scrollBinding = null;
    }
    const track = getActiveTrack();
    if (!track) return;
    const fn = () => updateDots();
    track.addEventListener('scroll', fn, { passive: true });
    scrollBinding = { track, fn };
  }

  function buildDots() {
    if (!dotsWrap) return;
    const track = getActiveTrack();
    dotsWrap.innerHTML = '';
    if (!track) return;
    const cards = track.querySelectorAll('.om-solution-card');
    cards.forEach((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'om-carousel-dot' + (i === 0 ? ' om-carousel-dot--active' : '');
      b.setAttribute('aria-label', 'Go to product ' + (i + 1));
      b.addEventListener('click', () => {
        const c = cards[i];
        if (c) c.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
      });
      dotsWrap.appendChild(b);
    });
    bindScroll();
    updateDots();
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t, j) => {
        t.classList.toggle('om-solutions-tab--active', j === i);
        t.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      panels.forEach((p, j) => {
        p.hidden = j !== i;
      });
      const tr = getActiveTrack();
      if (tr) tr.scrollLeft = 0;
      buildDots();
    });
  });

  function scrollStep(dir) {
    const tr = getActiveTrack();
    if (!tr) return;
    const step = Math.min(280, tr.clientWidth * 0.82);
    tr.scrollBy({ left: dir * step, behavior: 'smooth' });
  }

  if (prevBtn) prevBtn.addEventListener('click', () => scrollStep(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => scrollStep(1));

  buildDots();
})();

/**
 * DevTools helper: confirm visitor ECID source, header bar, Session Storage, whether `alloy` loaded, and kndctr cookie.
 * Run in the console: __aepOmVerifyEcid()
 */
if (typeof window !== 'undefined') {
  window.__aepOmResetVisitorEcid = resetOmVisitorEcidDemo;

  window.__aepOmVerifyEcid = function () {
    let ecidSession = null;
    let source = null;
    try {
      ecidSession = sessionStorage.getItem(OM_ANONYMOUS_ECID_KEY);
      source = sessionStorage.getItem(OM_ECID_SOURCE_KEY);
    } catch (_) {
      /* ignore */
    }
    const bar = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    const alloyLoaded = typeof window.alloy === 'function';
    const out = {
      ecidSessionStorage: ecidSession,
      ecidSource: source,
      ecidHeaderBar: bar,
      alloyLoaded,
      adobeKndctrIdentityCookiePresent: hasAdobeKndctrIdentityCookie(),
    };
    if (window.console && console.info) console.info('[AEP Old Mutual demo] __aepOmVerifyEcid()', out);
    return out;
  };
}
