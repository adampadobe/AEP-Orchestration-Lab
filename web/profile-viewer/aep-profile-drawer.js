/**
 * Shared bottom AEP profile drawer: consent data, identity graph, audiences, events, engagement metrics.
 * Expects element ids profileDrawer*, identityGraph*, profileHoverZone.
 * Include aep-profile-drawer.css and email-engagement-metrics.js before this script.
 * Optional: identity-picker.js + aep-global-sandbox.js for namespace + sandbox query params.
 * Events column: first run replaces the "LAST 5 EVENTS" heading with LAST EVENTS + a count badge; badge opens a persona journey modal (horizontal LTR timeline + step-through).
 */
(function (global) {
  'use strict';

  /** @type {Record<string, unknown>} */
  let _config = {};

  let profileHoverZone;
  let profileDrawer;
  let profileDrawerAvatar;
  let profileDrawerName;
  let profileDrawerGender;
  let profileDrawerAge;
  let profileDrawerEmail;
  let profileDrawerPhone;
  let profileDrawerCity;
  let profileDrawerLtv;
  let profileDrawerDesktopId;
  let profileDrawerPropensityScore;
  let profileDrawerChurnScore;
  let profileDrawerLoyalty;
  let profileDrawerAudiences;
  let profileDrawerMessageSentValue;
  let profileDrawerMessageSentUnit;
  let profileDrawerMessageSentRangeHint;
  let profileDrawerPushSendsRow;
  let profileDrawerPushSentValue;
  let profileDrawerPushSentUnit;
  let profileDrawerEvents;
  let profileDrawerConsentEmail;
  let profileDrawerConsentSms;
  let profileDrawerConsentPush;
  let infoEcid;
  let identityGraphSvg;
  let identityGraphZoomIn;
  let identityGraphZoomOut;

  /** Clickable count badge (top-right of events column) — opens persona journey modal */
  let profileDrawerEventsStoryBadge;
  /** @type {HTMLElement | null} */
  let eventsStoryModalBackdrop;
  /** @type {HTMLElement | null} */
  let eventsStoryModalPanel;
  /** @type {HTMLElement | null} */
  let eventsStoryModalTrack;
  /** @type {HTMLElement | null} */
  let eventsStoryModalClose;
  /** @type {HTMLElement | null} */
  let eventsStoryModalSummary;
  /** @type {HTMLElement | null} */
  let eventsStoryModalControlsWrap;
  /** @type {HTMLElement | null} */
  let eventsStoryModalStepMeta;
  let eventsStoryModalOpen = false;
  /** @type {HTMLElement | null} */
  let eventsStoryModalLastFocus;
  let eventsStoryModalKeydownBound = false;
  let journeyControlsBound = false;
  let profileDrawerThemeUiBound = false;

  /** @type {Array<{ instantMs: number | null, events: Record<string, unknown>[] }>} */
  let journeyModalGroups = [];
  /** Cumulative step: rows with index <= step are visible (0 = first instant only). */
  let journeyModalStep = 0;

  /** Max events in the journey modal (same fetch as drawer, deeper slice). */
  const DRAWER_EVENTS_STORY_MAX = 48;

  function getSandboxParam() {
    if (typeof global.AepGlobalSandbox !== 'undefined' && typeof global.AepGlobalSandbox.getSandboxParam === 'function') {
      return global.AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function getNamespaceForDrawer() {
    const id = _config.emailInputId || 'customerEmail';
    if (typeof global.AepIdentityPicker !== 'undefined' && typeof global.AepIdentityPicker.getNamespace === 'function') {
      return global.AepIdentityPicker.getNamespace(id);
    }
    return 'email';
  }

  function cacheDomRefs() {
    profileHoverZone = document.getElementById('profileHoverZone');
    profileDrawer = document.getElementById('profileDrawer');
    profileDrawerAvatar = document.getElementById('profileDrawerAvatar');
    profileDrawerName = document.getElementById('profileDrawerName');
    profileDrawerGender = document.getElementById('profileDrawerGender');
    profileDrawerAge = document.getElementById('profileDrawerAge');
    profileDrawerEmail = document.getElementById('profileDrawerEmail');
    profileDrawerPhone = document.getElementById('profileDrawerPhone');
    profileDrawerCity = document.getElementById('profileDrawerCity');
    profileDrawerLtv = document.getElementById('profileDrawerLtv');
    profileDrawerDesktopId = document.getElementById('profileDrawerDesktopId');
    profileDrawerPropensityScore = document.getElementById('profileDrawerPropensityScore');
    profileDrawerChurnScore = document.getElementById('profileDrawerChurnScore');
    profileDrawerLoyalty = document.getElementById('profileDrawerLoyalty');
    profileDrawerAudiences = document.getElementById('profileDrawerAudiences');
    profileDrawerMessageSentValue = document.getElementById('profileDrawerMessageSentValue');
    profileDrawerMessageSentUnit = document.getElementById('profileDrawerMessageSentUnit');
    profileDrawerMessageSentRangeHint = document.getElementById('profileDrawerMessageSentRangeHint');
    profileDrawerPushSendsRow = document.getElementById('profileDrawerPushSendsRow');
    profileDrawerPushSentValue = document.getElementById('profileDrawerPushSentValue');
    profileDrawerPushSentUnit = document.getElementById('profileDrawerPushSentUnit');
    profileDrawerEvents = document.getElementById('profileDrawerEvents');
    profileDrawerConsentEmail = document.getElementById('profileDrawerConsentEmail');
    profileDrawerConsentSms = document.getElementById('profileDrawerConsentSms');
    profileDrawerConsentPush = document.getElementById('profileDrawerConsentPush');
    infoEcid = document.getElementById('infoEcid');
    identityGraphSvg = document.getElementById('identityGraphSvg');
    identityGraphZoomIn = document.getElementById('identityGraphZoomIn');
    identityGraphZoomOut = document.getElementById('identityGraphZoomOut');
  }

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** @type {number} */
let identityGraphScale = 1;

/** Keys seen on last graph render — used to animate newly linked identities */
let lastIdentityGraphKeys = new Set();
/** Profile email for the last identity snapshot (reset keys when email changes) */
let lastIdentityGraphEmail = '';

/** Default headshots when gender is unknown or not provided by AEP */
const AVATAR_DEFAULT =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80';
/** Firebase-hosted dock assets (filenames match former public/images). */
const AEP_PROFILE_IMAGES_BASE = 'https://contenthosting.web.app/AEPProfile/';
/** Used when profile gender resolves to female */
const AVATAR_FEMALE = AEP_PROFILE_IMAGES_BASE + 'avatar-female.png';
/** Used when profile gender resolves to male */
const AVATAR_MALE = AEP_PROFILE_IMAGES_BASE + 'avatar-male.png';

function aepProfileImageCssUrl(filename) {
  return `url('${AEP_PROFILE_IMAGES_BASE}${filename}')`;
}

/** @type {Record<string, unknown> | null} */
let lastLookedUpProfile = null;

function setDrawerValue(el, value, fallback) {
  if (!el) return;
  const shown = value == null || value === '' ? fallback : String(value);
  el.textContent = shown;
}

/** Human-readable line for drawer debug — raw value from /api/profile/consent `gender`. */
function formatDrawerGenderDisplay(g) {
  if (g === undefined || g === null) return '—';
  if (g === '') return '(empty)';
  if (typeof g === 'string') return g.trim() || '(empty)';
  if (typeof g === 'number' && Number.isFinite(g)) return String(g);
  if (typeof g === 'object' && !Array.isArray(g)) {
    try {
      return JSON.stringify(g);
    } catch {
      return String(g);
    }
  }
  return String(g);
}

/** Unwrap API gender: string, enum object, or @id URI (avoids "[object Object]" and missed male). */
function coalesceGenderForAvatar(g) {
  if (g == null || g === '') return '';
  if (typeof g === 'string') return g.trim();
  if (typeof g === 'number' && Number.isFinite(g)) return String(g);
  if (typeof g === 'object' && !Array.isArray(g)) {
    const id = g['@id'];
    if (id != null && typeof id === 'string') return id;
    for (const k of ['code', 'value', 'name', 'gender', 'type', 'key']) {
      const inner = g[k];
      if (inner != null && typeof inner === 'string') return inner.trim();
    }
  }
  return '';
}

/**
 * Customer profile photo under CUSTOMER PROFILE — driven by person.gender from /api/profile/consent (`gender`).
 * Male → avatar-male.png; female → avatar-female.png; unknown → optional avatarUrl then default.
 */
function avatarSrcForProfile(source) {
  const raw = coalesceGenderForAvatar(source && source.gender);
  const g = raw.toLowerCase();
  if (g === 'female' || g === 'f' || g === 'woman' || g === 'w') return AVATAR_FEMALE;
  if (g === 'male' || g === 'm' || g === 'man') return AVATAR_MALE;
  if (g.includes('female') || g.includes('woman')) return AVATAR_FEMALE;
  if (g.includes('male') && !g.includes('female')) return AVATAR_MALE;
  if (source && source.avatarUrl) return String(source.avatarUrl);
  return AVATAR_DEFAULT;
}

/** consents.marketing.{email|sms|push}.val → GET /api/profile/consent `channels` (in|out|not_provided) */
function marketingChannelOptIn(source, key) {
  const channels = source && source.channels;
  if (channels && typeof channels === 'object' && channels[key] != null) {
    return String(channels[key]).toLowerCase() === 'in';
  }
  const m = source && source.marketingConsent;
  if (m === 'Y' || m === 'y') return true;
  if (m === 'N' || m === 'n') return false;
  return false;
}

function updateMarketingConsentCheckboxes(source) {
  const set = (el, on) => {
    if (el) el.checked = !!on;
  };
  if (!source) {
    set(profileDrawerConsentEmail, false);
    set(profileDrawerConsentSms, false);
    set(profileDrawerConsentPush, false);
    return;
  }
  set(profileDrawerConsentEmail, marketingChannelOptIn(source, 'email'));
  set(profileDrawerConsentSms, marketingChannelOptIn(source, 'sms'));
  set(profileDrawerConsentPush, marketingChannelOptIn(source, 'push'));
}

/** @param {Record<string, unknown>} [opts] */
function resolveEngagementMetricsHoursBack(opts) {
  const o = opts || {};
  const direct = Number(o.engagementMetricsHoursBack);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (typeof _config.getEngagementMetricsHoursBack === 'function') {
    try {
      const n = Number(_config.getEngagementMetricsHoursBack());
      if (Number.isFinite(n) && n > 0) return n;
    } catch {
      /* ignore */
    }
  }
  const cfg = Number(_config.engagementMetricsHoursBack);
  if (Number.isFinite(cfg) && cfg > 0) return cfg;
  return 24;
}

/** @param {number} hours */
function formatEngagementMetricsRangeHint(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h) || h <= 0) return '(last 24 hours)';
  if (h === 24) return '(last 24 hours)';
  if (h === 168) return '(last 7 days)';
  if (h === 720) return '(last 30 days)';
  if (h === 2160) return '(last 90 days)';
  if (h === 4320) return '(last 180 days)';
  if (h === 8760) return '(last 365 days)';
  if (h < 48) return `(last ${Math.round(h)} hours)`;
  const days = Math.round(h / 24);
  return `(last ${days} days)`;
}

function updateProfileDrawer(profile) {
  const source = profile || null;
  const first = source && source.firstName ? String(source.firstName).trim() : '';
  const last = source && source.lastName ? String(source.lastName).trim() : '';
  const fullName = `${first} ${last}`.trim() || 'No profile loaded';
  setDrawerValue(profileDrawerName, fullName, 'No profile loaded');
  if (profileDrawerGender) {
    profileDrawerGender.textContent = source ? formatDrawerGenderDisplay(source.gender) : '—';
  }
  setDrawerValue(profileDrawerAge, source ? source.age : null, '—');
  setDrawerValue(profileDrawerEmail, source ? source.email : null, '');
  setDrawerValue(profileDrawerPhone, source ? source.phone : null, 'Unknown');
  setDrawerValue(profileDrawerCity, source ? source.city : null, '—');
  setDrawerValue(profileDrawerLtv, source ? source.customerLifetimeValue : null, '');
  setDrawerValue(profileDrawerDesktopId, source ? source.ecid : null, '—');
  setDrawerValue(profileDrawerPropensityScore, source ? source.propensityScore : null, '—');
  setDrawerValue(profileDrawerChurnScore, source ? source.churnPrediction : null, '—');
  setDrawerValue(profileDrawerLoyalty, source ? source.loyaltyStatus : null, 'Unknown');
  if (profileDrawerMessageSentValue) {
    if (!source || source.emailSendsLast24h === undefined) {
      profileDrawerMessageSentValue.textContent = '—';
      if (profileDrawerMessageSentUnit) profileDrawerMessageSentUnit.textContent = '';
    } else {
      const n = Number(source.emailSendsLast24h);
      if (Number.isFinite(n)) {
        profileDrawerMessageSentValue.textContent = n.toLocaleString();
        if (profileDrawerMessageSentUnit) {
          profileDrawerMessageSentUnit.textContent = n === 1 ? 'email' : 'emails';
        }
      } else {
        profileDrawerMessageSentValue.textContent = '—';
        if (profileDrawerMessageSentUnit) profileDrawerMessageSentUnit.textContent = '';
      }
    }
  }
  if (profileDrawerPushSendsRow && profileDrawerPushSentValue) {
    if (!source || source.pushSendsLast24h === undefined) {
      profileDrawerPushSendsRow.hidden = true;
      profileDrawerPushSentValue.textContent = '';
      if (profileDrawerPushSentUnit) profileDrawerPushSentUnit.textContent = '';
    } else {
      const pn = Number(source.pushSendsLast24h);
      if (Number.isFinite(pn) && pn > 0) {
        profileDrawerPushSendsRow.hidden = false;
        profileDrawerPushSentValue.textContent = pn.toLocaleString();
        if (profileDrawerPushSentUnit) {
          profileDrawerPushSentUnit.textContent = pn === 1 ? 'push message' : 'push messages';
        }
      } else {
        profileDrawerPushSendsRow.hidden = true;
        profileDrawerPushSentValue.textContent = '';
        if (profileDrawerPushSentUnit) profileDrawerPushSentUnit.textContent = '';
      }
    }
  }
  if (profileDrawerMessageSentRangeHint) {
    const h =
      source && source.engagementMetricsHoursBack != null ? Number(source.engagementMetricsHoursBack) : null;
    profileDrawerMessageSentRangeHint.textContent =
      h != null && Number.isFinite(h) && h > 0 ? formatEngagementMetricsRangeHint(h) : '(last 24 hours)';
  }
  if (profileDrawerAvatar) {
    profileDrawerAvatar.src = avatarSrcForProfile(source);
  }
  updateMarketingConsentCheckboxes(source);
  renderAudienceList(source ? source.audiences : null);
  renderEventTimeline(source ? source.events : null);
  renderIdentityGraph(source);
}

const IDENTITY_GRAPH_PALETTE = [
  ['#8b5cf6', 'rgba(139, 92, 246, 0.22)'],
  ['#ca8a04', 'rgba(202, 138, 4, 0.22)'],
  ['#db2777', 'rgba(219, 39, 119, 0.2)'],
  ['#0d9488', 'rgba(13, 148, 136, 0.22)'],
  ['#ea580c', 'rgba(234, 88, 12, 0.2)'],
  ['#3b82f6', 'rgba(59, 130, 246, 0.22)'],
];

function identityGraphLabel(ns) {
  const s = String(ns || '');
  const u = s.toUpperCase();
  if (u.includes('ECID')) return 'ECID';
  if (u.includes('EMAIL')) return 'Email';
  if (u.includes('PHONE') || u.includes('SMS')) return 'Phone';
  if (u.includes('CRM')) return 'CRM';
  if (u.includes('LOYAL')) return 'Loyalty';
  if (u.includes('GAID') || u.includes('IDFA')) return 'Device';
  return s.length > 11 ? `${s.slice(0, 9)}…` : s || 'ID';
}

function identityListHasEcidDigits(list, digits) {
  if (!digits || String(digits).length < 10) return false;
  return list.some((x) => {
    if (!/ecid/i.test(String(x.namespace || ''))) return false;
    return String(x.value || '').replace(/\D/g, '') === digits;
  });
}

/**
 * @param {string} [appendSessionEcid] When set (e.g. browser anonymous ECID on email lookup), adds a second ECID node if not already present so the graph shows stitching targets.
 */
function mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail, appendSessionEcid) {
  const list = Array.isArray(data.identities) ? data.identities.slice() : [];
  function hasMatch(re) {
    return list.some((x) => re.test(String(x.namespace || '')));
  }
  function pushEcidIfNew(raw) {
    const ecidStr = raw && String(raw).length >= 10 ? String(raw).trim() : '';
    const dig = ecidStr.replace(/\D/g, '');
    if (!ecidStr || dig.length < 10) return;
    if (identityListHasEcidDigits(list, dig)) return;
    list.push({ namespace: 'ECID', value: ecidStr });
  }
  pushEcidIfNew(ecidVal);
  pushEcidIfNew(appendSessionEcid);
  const em = String(canonicalEmail || '').trim();
  if (em && !hasMatch(/email/i)) list.push({ namespace: 'Email', value: em });
  return list.slice(0, 40);
}

/**
 * Stable key for diffing graph nodes across API refreshes (namespace casing / ECID formatting).
 */
function identityStableKey(entry) {
  const nsRaw = String(entry.namespace || '').trim();
  const vRaw = String(entry.value || '').trim();
  const nsU = nsRaw.toUpperCase();
  let nsNorm = nsU;
  if (nsU.includes('ECID')) nsNorm = 'ECID';
  else if (nsU.includes('EMAIL')) nsNorm = 'EMAIL';
  else if (nsU.includes('PHONE') || nsU.includes('SMS')) nsNorm = 'PHONE';
  else if (nsU.includes('CRM')) nsNorm = 'CRM';
  else if (nsU.includes('LOYAL')) nsNorm = 'LOYALTY';
  let vNorm = vRaw;
  if (nsNorm === 'ECID') vNorm = vRaw.replace(/\D/g, '') || vRaw;
  else if (nsNorm === 'EMAIL') vNorm = vRaw.toLowerCase();
  return `${nsNorm}:${vNorm.slice(0, 160)}`;
}

/** Only identities that exist on the profile (non-empty value), deduped by stable key. */
function realIdentitiesForGraph(identities) {
  if (!Array.isArray(identities)) return [];
  const seen = new Set();
  const out = [];
  for (const x of identities) {
    if (!x || x.placeholder || !String(x.value || '').trim()) continue;
    const k = identityStableKey(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
    if (out.length >= 16) break;
  }
  return out;
}

/** Polar positions: dual ring when many nodes */
function layoutIdentityGraphPositions(n, cx, cy) {
  if (n === 0) return [];
  const singleRing = n <= 10;
  const R1 = 92;
  const R2 = 124;
  if (singleRing) {
    const R = n <= 4 ? 88 : n <= 7 ? 102 : 114;
    return Array.from({ length: n }, (_, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), i, ring: 0 };
    });
  }
  const nInner = Math.ceil(n / 2);
  const nOuter = n - nInner;
  const pos = [];
  for (let i = 0; i < nInner; i += 1) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / nInner;
    pos.push({ x: cx + R1 * Math.cos(a), y: cy + R1 * Math.sin(a), i: pos.length, ring: 0 });
  }
  for (let j = 0; j < nOuter; j += 1) {
    const a = -Math.PI / 2 + Math.PI / nOuter + (2 * Math.PI * j) / nOuter;
    pos.push({ x: cx + R2 * Math.cos(a), y: cy + R2 * Math.sin(a), i: pos.length, ring: 1 });
  }
  return pos;
}

function setIdentityGraphZoom(k) {
  identityGraphScale = Math.min(1.5, Math.max(0.55, k));
  const g = identityGraphSvg && identityGraphSvg.querySelector('[data-identity-scene]');
  if (g) g.setAttribute('transform', `translate(160,160) scale(${identityGraphScale}) translate(-160,-160)`);
}

function renderIdentityGraph(source) {
  if (!identityGraphSvg) return;

  if (!source) {
    while (identityGraphSvg.firstChild) identityGraphSvg.removeChild(identityGraphSvg.firstChild);
    lastIdentityGraphKeys = new Set();
    lastIdentityGraphEmail = '';
    return;
  }

  const emailNow = String(source.email || '').trim().toLowerCase();
  if (emailNow && emailNow !== lastIdentityGraphEmail) {
    lastIdentityGraphKeys = new Set();
    lastIdentityGraphEmail = emailNow;
  }

  while (identityGraphSvg.firstChild) identityGraphSvg.removeChild(identityGraphSvg.firstChild);

  const rawIdentities = Array.isArray(source.identities) ? source.identities : [];
  const identities = realIdentitiesForGraph(rawIdentities);
  const first = source && source.firstName ? String(source.firstName).trim() : '';
  const last = source && source.lastName ? String(source.lastName).trim() : '';
  const displayName = source ? `${first} ${last}`.trim() || 'Profile' : 'Look up profile';
  const avatarSrc = avatarSrcForProfile(source || null);

  const scene = document.createElementNS(SVG_NS, 'g');
  scene.setAttribute('data-identity-scene', '1');
  scene.setAttribute('transform', `translate(160,160) scale(${identityGraphScale}) translate(-160,-160)`);
  identityGraphSvg.appendChild(scene);

  const cx = 160;
  const cy = 160;
  const n = identities.length;
  const positions = layoutIdentityGraphPositions(n, cx, cy);

  const prevKeys = lastIdentityGraphKeys;
  const currentKeys = new Set(identities.map((e) => identityStableKey(e)));
  const anyNewIdentity = prevKeys.size > 0 && identities.some((e) => !prevKeys.has(identityStableKey(e)));

  const edges = document.createElementNS(SVG_NS, 'g');
  edges.setAttribute('class', 'ig-edges');

  if (n > 1 && n <= 14) {
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const line = document.createElementNS(SVG_NS, 'line');
        line.setAttribute('x1', String(positions[i].x));
        line.setAttribute('y1', String(positions[i].y));
        line.setAttribute('x2', String(positions[j].x));
        line.setAttribute('y2', String(positions[j].y));
        line.setAttribute('stroke', 'rgba(255,255,255,0.1)');
        line.setAttribute('stroke-width', '1');
        const ijNew =
          prevKeys.size > 0 &&
          (!prevKeys.has(identityStableKey(identities[i])) || !prevKeys.has(identityStableKey(identities[j])));
        if (ijNew) line.setAttribute('class', 'aep-ig-edge-new');
        edges.appendChild(line);
      }
    }
  }

  for (let idx = 0; idx < n; idx += 1) {
    const p = positions[idx];
    const [stroke, fill] = IDENTITY_GRAPH_PALETTE[idx % IDENTITY_GRAPH_PALETTE.length];
    const key = identityStableKey(identities[idx]);
    const isNew = prevKeys.size > 0 && !prevKeys.has(key);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(cx));
    line.setAttribute('y1', String(cy));
    line.setAttribute('x2', String(p.x));
    line.setAttribute('y2', String(p.y));
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-opacity', '0.5');
    line.setAttribute('stroke-width', '1.5');
    if (isNew) line.setAttribute('class', 'aep-ig-edge-new');
    edges.appendChild(line);
  }
  scene.appendChild(edges);

  const outerG = document.createElementNS(SVG_NS, 'g');
  for (let idx = 0; idx < n; idx += 1) {
    const p = positions[idx];
    const [stroke, fill] = IDENTITY_GRAPH_PALETTE[idx % IDENTITY_GRAPH_PALETTE.length];
    const entry = identities[idx];
    const label = identityGraphLabel(entry.namespace);
    const val = String(entry.value || '');
    const shortVal = val.length > 16 ? `${val.slice(0, 14)}…` : val;
    const key = identityStableKey(entry);
    const isNew = prevKeys.size > 0 && !prevKeys.has(key);

    const gOuter = document.createElementNS(SVG_NS, 'g');
    gOuter.setAttribute('transform', `translate(${p.x}, ${p.y})`);

    const gScale = document.createElementNS(SVG_NS, 'g');
    gScale.setAttribute('class', 'aep-ig-node-scale');
    if (isNew) gScale.classList.add('aep-ig-node-new');

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('class', isNew ? 'aep-ig-node-rect aep-ig-node-rect--new' : 'aep-ig-node-rect');
    rect.setAttribute('x', '-42');
    rect.setAttribute('y', '-19');
    rect.setAttribute('width', '84');
    rect.setAttribute('height', '38');
    rect.setAttribute('rx', '19');
    rect.setAttribute('fill', fill);
    rect.setAttribute('stroke', stroke);
    rect.setAttribute('stroke-width', '1.5');
    const t1 = document.createElementNS(SVG_NS, 'text');
    t1.setAttribute('text-anchor', 'middle');
    t1.setAttribute('y', '-1');
    t1.setAttribute('fill', '#f8fafc');
    t1.setAttribute('font-size', '10');
    t1.setAttribute('font-weight', '700');
    t1.textContent = label;
    const t2 = document.createElementNS(SVG_NS, 'text');
    t2.setAttribute('text-anchor', 'middle');
    t2.setAttribute('y', '12');
    t2.setAttribute('fill', 'rgba(248,250,252,0.78)');
    t2.setAttribute('font-size', '8');
    t2.textContent = shortVal;
    gScale.appendChild(rect);
    gScale.appendChild(t1);
    gScale.appendChild(t2);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${entry.namespace}: ${val}`;
    gScale.appendChild(title);
    gOuter.appendChild(gScale);
    outerG.appendChild(gOuter);
  }
  scene.appendChild(outerG);

  const hub = document.createElementNS(SVG_NS, 'g');
  hub.setAttribute('transform', `translate(${cx}, ${cy})`);

  const hubScale = document.createElementNS(SVG_NS, 'g');
  hubScale.setAttribute('class', 'aep-ig-hub-scale');

  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', '-40');
  fo.setAttribute('y', '-48');
  fo.setAttribute('width', '80');
  fo.setAttribute('height', '80');
  const wrap = document.createElementNS(XHTML_NS, 'div');
  wrap.setAttribute('xmlns', XHTML_NS);
  wrap.className = 'aep-ig-avatar-wrap';
  wrap.style.cssText =
    'width:80px;height:80px;border-radius:50%;overflow:hidden;margin:0 auto;box-sizing:border-box;box-shadow:0 4px 20px rgba(0,0,0,0.35), 0 0 0 3px rgba(147,197,253,0.85);';
  const img = document.createElementNS(XHTML_NS, 'img');
  img.setAttribute('src', avatarSrc);
  img.setAttribute('width', '80');
  img.setAttribute('height', '80');
  img.setAttribute('alt', '');
  img.style.cssText = 'display:block;width:80px;height:80px;object-fit:cover;';
  wrap.appendChild(img);
  fo.appendChild(wrap);
  hubScale.appendChild(fo);

  const nameEl = document.createElementNS(SVG_NS, 'text');
  nameEl.setAttribute('text-anchor', 'middle');
  nameEl.setAttribute('y', '52');
  nameEl.setAttribute('fill', '#e2e8f0');
  nameEl.setAttribute('font-size', '11');
  nameEl.setAttribute('font-weight', '600');
  const maxName = displayName.length > 22 ? `${displayName.slice(0, 20)}…` : displayName;
  nameEl.textContent = maxName;
  hubScale.appendChild(nameEl);

  hub.appendChild(hubScale);
  scene.appendChild(hub);

  if (n === 0) {
    const hint = document.createElementNS(SVG_NS, 'text');
    hint.setAttribute('x', String(cx));
    hint.setAttribute('y', String(cy + 72));
    hint.setAttribute('text-anchor', 'middle');
    hint.setAttribute('fill', 'rgba(255,255,255,0.45)');
    hint.setAttribute('font-size', '11');
    hint.textContent = 'Linked identifiers appear as you capture email, ECID, phone, …';
    scene.appendChild(hint);
  }

  if (n > 0) {
    lastIdentityGraphKeys = new Set(currentKeys);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      identityGraphSvg.querySelectorAll('.aep-ig-node-new').forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i, 14) * 0.05}s`;
        el.classList.add('aep-ig-node-in');
      });
      identityGraphSvg.querySelectorAll('.aep-ig-edge-new').forEach((el, i) => {
        el.style.transitionDelay = `${0.04 + Math.min(i, 20) * 0.025}s`;
        el.classList.add('aep-ig-edge-in');
      });
      const hubEls = identityGraphSvg.querySelectorAll('.aep-ig-hub-scale');
      if (prevKeys.size === 0 && n > 0) {
        hubEls.forEach((el) => el.classList.add('aep-ig-hub-in'));
      } else if (anyNewIdentity) {
        hubEls.forEach((el) => el.classList.add('aep-ig-hub-linked-new'));
      }
    });
  });
}

function renderAudienceList(audiences) {
  if (!profileDrawerAudiences) return;
  profileDrawerAudiences.innerHTML = '';
  const current = audiences && Array.isArray(audiences.realized) ? audiences.realized : [];
  const exited = audiences && Array.isArray(audiences.exited) ? audiences.exited : [];

  if (current.length === 0 && exited.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No audience membership found';
    profileDrawerAudiences.appendChild(li);
    return;
  }

  current.slice(0, 4).forEach((row) => {
    const li = document.createElement('li');
    li.textContent = row && row.name ? String(row.name) : 'Unnamed audience';
    profileDrawerAudiences.appendChild(li);
  });

  exited.slice(0, 2).forEach((row) => {
    const li = document.createElement('li');
    li.className = 'aep-profile-drawer-audience-exited';
    const label = row && row.name ? String(row.name) : 'Unnamed audience';
    li.textContent = `${label} (exited)`;
    profileDrawerAudiences.appendChild(li);
  });
}

async function fetchAudienceMembership(email) {
  if (!email) return null;
  const ns = getNamespaceForDrawer();
  try {
    const res = await fetch(
      '/api/profile/audiences?identifier=' +
        encodeURIComponent(email) +
        '&namespace=' +
        encodeURIComponent(ns) +
        getSandboxParam(),
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function normalizeEventName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'Experience Event';
  if (!raw.includes('.') && !raw.includes('_')) return raw;
  return raw
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEventTimelineDate(value) {
  const ts = typeof value === 'number' ? value : Number(value);
  const d = Number.isFinite(ts) ? new Date(ts) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/** Inline SVG snippets for timeline thumbs (hospitality / hotel journey lab). */
const AEP_EVENT_THUMB_SVG = {
  hotelSearch:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="m21 21-4.35-4.35" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  hotelAvailability:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/></svg>',
  hotelRoom:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 7v11M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v11M3 15h18M7 7V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hotelCheckout:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="9" cy="21" r="1" fill="currentColor"/><circle cx="20" cy="21" r="1" fill="currentColor"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hotelPayment:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 10h20" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  hotelComplete:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M22 4 12 14.01l-3-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  hotelAbandon:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15 9-6 6M9 9l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  hotelGeneric:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 21h18M6 21V7l6-4 6 4v14M9 21v-4h6v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  /** Neutral default when no lab-specific artwork matches */
  experienceGeneric:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 19V5M4 19h16M4 19l4-6 4 3 4-8 4 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  insuranceForm:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><rect x="9" y="3" width="6" height="4" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 12h6M9 16h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  insurancePolicy:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  insuranceDashboard:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="3" width="7" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="14" y="12" width="7" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="16" width="7" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  insuranceBank:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 21h18M5 21V10.5M19 21V10.5M12 3 3 10h18L12 3zM9 14h2M13 14h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  insuranceShield:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  insuranceMerge:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="7" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="7" r="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="17" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9l1.5 1.5M15 9l-1.5 1.5M12 13v2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  insuranceOnboarding:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 22v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  commerceCart:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="9" cy="21" r="1" fill="currentColor"/><circle cx="20" cy="21" r="1" fill="currentColor"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function hotelEventThumbFromBlob(blob) {
  const b = blob.toLowerCase();
  if (b.includes('room') && (b.includes('select') || b.includes('choose') || b.includes('picker'))) {
    return { variant: 'hotel-room', svg: AEP_EVENT_THUMB_SVG.hotelRoom };
  }
  if (b.includes('availability') || b.includes('rateslider') || b.includes('rate-plan')) {
    return { variant: 'hotel-availability', svg: AEP_EVENT_THUMB_SVG.hotelAvailability };
  }
  if (b.includes('search')) {
    return { variant: 'hotel-search', svg: AEP_EVENT_THUMB_SVG.hotelSearch };
  }
  if (b.includes('abandon') || b.includes('dropoff')) {
    return { variant: 'hotel-abandon', svg: AEP_EVENT_THUMB_SVG.hotelAbandon };
  }
  if (b.includes('complete') || b.includes('confirmation') || b.includes('confirmed') || b.includes('booking.success')) {
    return { variant: 'hotel-complete', svg: AEP_EVENT_THUMB_SVG.hotelComplete };
  }
  if (b.includes('payment') || b.includes('pay.') || b.includes('.pay')) {
    return { variant: 'hotel-payment', svg: AEP_EVENT_THUMB_SVG.hotelPayment };
  }
  if (b.includes('checkout') || b.includes('booking.start') || b.includes('basket') || b.includes('cart')) {
    return { variant: 'hotel-checkout', svg: AEP_EVENT_THUMB_SVG.hotelCheckout };
  }
  return { variant: 'hotel-generic', svg: AEP_EVENT_THUMB_SVG.hotelGeneric };
}

/** Insurance / FS protection lab — brand-agnostic `insurance.*` event types + related blobs */
function insuranceEventThumbFromBlob(blob) {
  const b = blob.toLowerCase();
  if (b.includes('onboarding') || b.includes('skiptoquote')) {
    return { variant: 'insurance-onboarding', svg: AEP_EVENT_THUMB_SVG.insuranceOnboarding };
  }
  if (b.includes('policyinfo') || b.includes('step4complete') || b.includes('policyinfo.upload')) {
    return { variant: 'insurance-policy', svg: AEP_EVENT_THUMB_SVG.insurancePolicy };
  }
  if (b.includes('dashboard')) {
    return { variant: 'insurance-dashboard', svg: AEP_EVENT_THUMB_SVG.insuranceDashboard };
  }
  if (b.includes('banksubscribtion') || b.includes('banksubscription')) {
    return { variant: 'insurance-bank', svg: AEP_EVENT_THUMB_SVG.insuranceBank };
  }
  if (b.includes('protectionconsolidation') || b.includes('gadgetcover')) {
    return { variant: 'insurance-merge', svg: AEP_EVENT_THUMB_SVG.insuranceMerge };
  }
  if (b.includes('protectionaddon') || b.includes('homerebuild') || b.includes('homeflood')) {
    return { variant: 'insurance-shield', svg: AEP_EVENT_THUMB_SVG.insuranceShield };
  }
  if (b.includes('completedsignup') || b.includes('step5complete') || b.includes('step1complete') || b.includes('step2complete') || b.includes('step3complete')) {
    return { variant: 'insurance-milestone', svg: AEP_EVENT_THUMB_SVG.hotelComplete };
  }
  if (b.includes('quoteform') || b.includes('showhow')) {
    return { variant: 'insurance-quote', svg: AEP_EVENT_THUMB_SVG.insuranceForm };
  }
  return { variant: 'insurance-generic', svg: AEP_EVENT_THUMB_SVG.insuranceShield };
}

/**
 * @param {{ eventType?: string, eventName?: string } | null | undefined} ev
 * @returns {{ url?: string, variant?: string, svg?: string }}
 */
function eventThumbForEvent(ev) {
  const eventType = String((ev && ev.eventType) || '').trim();
  const eventName = String((ev && ev.eventName) || '').trim();
  const primary = eventType || eventName;
  const key = primary.toLowerCase().replace(/\s+/g, '');
  const blob = `${eventType} ${eventName}`.toLowerCase();

  if (blob.includes('hotel') || key.includes('hotel')) {
    return hotelEventThumbFromBlob(blob);
  }

  if (blob.includes('insurance') || key.startsWith('insurance')) {
    return insuranceEventThumbFromBlob(blob);
  }

  if (key.includes('message.feedback') || key === 'messagefeedback') {
    return { url: aepProfileImageCssUrl('message-feedback-icon.png'), variant: 'message-feedback' };
  }
  if (key.includes('message.tracking') || key === 'messagetracking') {
    return { url: aepProfileImageCssUrl('Smock_LocationBasedEvent_18_N.svg'), variant: 'message-tracking' };
  }
  if (
    key === 'application.launch' ||
    key === 'applicationlaunch' ||
    key.includes('application.launch')
  ) {
    return { url: aepProfileImageCssUrl('application-launch-icon.png'), variant: 'application-launch' };
  }
  if (key.includes('login')) {
    return { url: aepProfileImageCssUrl('event-login-icon.png'), variant: 'event-login' };
  }
  const typePrefix = primary.trim().toLowerCase();
  if (typePrefix.startsWith('web')) {
    return { url: aepProfileImageCssUrl('event-web-icon.png'), variant: 'event-web' };
  }
  if (typePrefix.startsWith('mobile')) {
    return { url: aepProfileImageCssUrl('event-mobile-icon.png'), variant: 'event-mobile' };
  }
  const keyLoose = primary.toLowerCase();
  if (keyLoose.includes('navigator.global')) {
    return { url: aepProfileImageCssUrl('event-web-icon.png'), variant: 'event-web' };
  }
  if (keyLoose.includes('webinar')) {
    return { url: aepProfileImageCssUrl('event-login-icon.png'), variant: 'event-login' };
  }
  if (keyLoose.includes('donation')) {
    return { url: "url('https://www.cancerresearchuk.org/_next/image?url=https%3A%2F%2Fdownloads.ctfassets.net%2Fu7vsjnoopqo5%2FrvcPK0YbxqEl9Gt41Azzq%2Fac926460962e2c75c0a0038ca8bfa45c%2F230613_CR_Trampoline187.jpg&w=256&q=65')" };
  }
  if (keyLoose.includes('register')) {
    return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/6uvR1AnyLivuw4FgIvCIcw/d633484906952732a873c2d355d7aaff/Cervical_Cancer_HPV_Vaccine_2_RGB_400px.png?w=200&q=75')" };
  }
  if (keyLoose.includes('abandon')) {
    return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/3vMd1m9QJUdgZ1jMpzgmoU/657e350658a59d5f37a8a8a6ab3e47e1/Icon_microscope_navy.png?w=200&q=75')" };
  }
  if (keyLoose.includes('commerce') || keyLoose.includes('productlist') || keyLoose.includes('cart')) {
    return { variant: 'commerce-cart', svg: AEP_EVENT_THUMB_SVG.commerceCart };
  }
  if (keyLoose.includes('transaction') && !keyLoose.includes('subscription')) {
    return { variant: 'commerce-cart', svg: AEP_EVENT_THUMB_SVG.commerceCart };
  }
  return { variant: 'experience-generic', svg: AEP_EVENT_THUMB_SVG.experienceGeneric };
}

/**
 * message.feedback / message.tracking: infer channel from AJO rows (email namespace, push namespace, FCM/APNS).
 * @returns {'email'|'push'|null}
 */
function aepProfileDrawerMessageChannelKind(ev) {
  const name = String((ev && ev.eventType) || (ev && ev.eventName) || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  const isMsg =
    name.includes('message.feedback') ||
    name === 'messagefeedback' ||
    name.includes('message.tracking') ||
    name === 'messagetracking';
  if (!isMsg) return null;

  const rows = ev.rows || [];
  for (const r of rows) {
    const p = (r.path || '').toLowerCase().replace(/_/g, '.');
    if (!p.includes('pushchannelcontext')) continue;
    if (p.endsWith('.platform') || p.endsWith('_platform')) {
      const v = String(r.value || '').trim().toLowerCase();
      if (v === 'fcm' || v === 'apns') return 'push';
    }
  }
  for (const r of rows) {
    const p = (r.path || '').toLowerCase().replace(/_/g, '.');
    if (!p.includes('channelcontext')) continue;
    if (!(p.endsWith('.namespace') || p.endsWith('_namespace'))) continue;
    const val = String(r.value || '').trim().toLowerCase();
    if (val === 'push') return 'push';
    if (val === 'email') return 'email';
  }
  return null;
}

/** Human-readable channel for journey modal (aligned with drawer sub-line logic). */
function formatDrawerEventChannelDisplay(ev) {
  const msgKind = aepProfileDrawerMessageChannelKind(ev);
  if (msgKind === 'email') return 'Email';
  if (msgKind === 'push') return 'Push';
  const typeRaw = String((ev && ev.eventType) || (ev && ev.eventName) || '').trim().toLowerCase();
  if (typeRaw.startsWith('mobile')) return 'Mobile app';
  if (typeRaw.startsWith('insurance')) return 'Insurance';
  if (typeRaw.startsWith('web')) return 'Web';
  return 'Web';
}

/** Lowercase blob of event head + flattened row paths/values for touchpoint inference. */
function journeyInferenceBlob(ev) {
  const e = ev && typeof ev === 'object' ? ev : {};
  const rows = Array.isArray(e.rows) ? e.rows : [];
  const fromRows = rows.map((r) => `${r.path || ''} ${r.value || ''}`).join(' ').toLowerCase();
  const head = `${e.eventType || ''} ${e.eventName || ''}`.toLowerCase();
  return `${head} ${fromRows}`;
}

/** Cross-channel touchpoint label for the persona journey modal (richer than drawer sub-line). */
function formatJourneyTouchpoint(ev) {
  const msgKind = aepProfileDrawerMessageChannelKind(ev);
  if (msgKind === 'email') return 'Marketing email';
  if (msgKind === 'push') return 'Push notification';
  const blob = journeyInferenceBlob(ev);
  if (
    /call[\s_-]?cent(er|re)|contact[\s_-]?cent(er|re)|callcent|screen[\s_-]?pop|hotdesk|agentdesktop|voice[\s_-]?call|ivr|telephony|genesys|twilio|niceincontact/.test(
      blob,
    )
  ) {
    return 'Contact centre';
  }
  if (/crm|salesforce|service[\s_-]?cloud|case\.|ticketing|zendesk|servicenow/.test(blob)) {
    return 'CRM / service';
  }
  if (/kiosk|pos|in[\s_-]?store|branch\.|retail[\s_-]?store/.test(blob)) {
    return 'In-store / kiosk';
  }
  const typeRaw = String((ev && ev.eventType) || (ev && ev.eventName) || '').trim().toLowerCase();
  if (typeRaw.startsWith('mobile')) return 'Mobile app';
  if (typeRaw.startsWith('application')) return 'Application';
  if (typeRaw.startsWith('insurance')) return 'Insurance journey';
  if (typeRaw.startsWith('web')) return 'Web experience';
  if (blob.includes('server') || blob.includes('batch') || blob.includes('datafeed')) return 'Server / batch';
  return 'Digital touchpoint';
}

/**
 * @param {HTMLDivElement} thumb
 * @param {Record<string, unknown>} ev
 * @param {string} [thumbRootClass] optional extra root class (e.g. story card sizing)
 */
function fillDrawerEventThumbElement(thumb, ev, thumbRootClass) {
  thumb.className = thumbRootClass || 'aep-profile-drawer-event-thumb';
  const thumbSpec = eventThumbForEvent(ev);
  if (thumbSpec.svg) {
    thumb.classList.add('aep-profile-drawer-event-thumb--svg-inline');
    if (thumbSpec.variant) {
      thumb.classList.add(`aep-profile-drawer-event-thumb--${thumbSpec.variant}`);
    }
    thumb.innerHTML = thumbSpec.svg;
    thumb.style.backgroundImage = 'none';
  } else {
    thumb.style.backgroundImage = thumbSpec.url || 'none';
  }
  if (thumbSpec.variant === 'message-feedback') {
    thumb.classList.add('aep-profile-drawer-event-thumb--message-feedback');
  }
  if (thumbSpec.variant === 'message-tracking') {
    thumb.classList.add('aep-profile-drawer-event-thumb--message-tracking');
  }
  if (thumbSpec.variant === 'event-web') {
    thumb.classList.add('aep-profile-drawer-event-thumb--event-web');
  }
  if (thumbSpec.variant === 'event-mobile') {
    thumb.classList.add('aep-profile-drawer-event-thumb--event-mobile');
  }
  if (thumbSpec.variant === 'application-launch') {
    thumb.classList.add('aep-profile-drawer-event-thumb--application-launch');
  }
  if (thumbSpec.variant === 'event-login') {
    thumb.classList.add('aep-profile-drawer-event-thumb--event-login');
  }
}

function getProfileDrawerEventsHeadingRow() {
  if (!profileDrawerEvents) return null;
  const prev = profileDrawerEvents.previousElementSibling;
  return prev && prev.classList && prev.classList.contains('aep-profile-drawer-events-heading-row') ? prev : null;
}

  const PROFILE_DRAWER_THEME_SLOT = 'data-aep-profile-drawer-theme-slot';

  function syncProfileDrawerThemeToggleVisuals() {
    const mode =
      global.AepTheme && typeof global.AepTheme.getMode === 'function'
        ? global.AepTheme.getMode()
        : document.documentElement.getAttribute('data-aep-theme') === 'dark'
          ? 'dark'
          : 'light';
    const dark = mode === 'dark';
    document.querySelectorAll('.aep-profile-drawer-theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      const ico = btn.querySelector('.aep-profile-drawer-theme-toggle-ico');
      if (ico) {
        ico.textContent = dark ? '\u2600' : '\u25D1';
      }
    });
  }

  /** Mirrors `aep-theme.js` when `AepTheme` is not on the page (demo-only scripts). */
  function toggleProfileDrawerThemeWithoutGlobal() {
    const LS = 'aepTheme';
    let mode = 'light';
    try {
      mode = global.localStorage.getItem(LS) === 'dark' ? 'dark' : 'light';
    } catch {
      /* ignore */
    }
    const next = mode === 'dark' ? 'light' : 'dark';
    try {
      global.localStorage.setItem(LS, next);
      global.localStorage.setItem('aep-decisioning-theme', next);
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    if (next === 'dark') root.setAttribute('data-aep-theme', 'dark');
    else root.removeAttribute('data-aep-theme');
    try {
      global.dispatchEvent(new CustomEvent('aep-theme-change', { detail: { mode: next } }));
    } catch {
      /* ignore */
    }
    syncProfileDrawerThemeToggleVisuals();
  }

  function onProfileDrawerThemeToggleClick(e) {
    e.preventDefault();
    if (global.AepTheme && typeof global.AepTheme.toggle === 'function') {
      global.AepTheme.toggle();
      return;
    }
    toggleProfileDrawerThemeWithoutGlobal();
  }

  function bindProfileDrawerThemeUiOnce() {
    if (profileDrawerThemeUiBound) return;
    profileDrawerThemeUiBound = true;
    global.addEventListener('aep-theme-change', function () {
      syncProfileDrawerThemeToggleVisuals();
    });
    global.addEventListener('storage', function (ev) {
      if (ev.key === 'aepTheme') syncProfileDrawerThemeToggleVisuals();
    });
  }

  /** Idempotent: tiny theme control on the drawer chrome (see `aep-profile-drawer-theme-slot` CSS). */
  function ensureProfileDrawerThemeToggle() {
    cacheDomRefs();
    const drawer = profileDrawer;
    if (!drawer || drawer.querySelector(`[${PROFILE_DRAWER_THEME_SLOT}="1"]`)) return;

    bindProfileDrawerThemeUiOnce();

    const wrap = document.createElement('div');
    wrap.className = 'aep-profile-drawer-theme-slot';
    wrap.setAttribute(PROFILE_DRAWER_THEME_SLOT, '1');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aep-profile-drawer-theme-toggle';
    const ico = document.createElement('span');
    ico.className = 'aep-profile-drawer-theme-toggle-ico';
    ico.setAttribute('aria-hidden', 'true');
    btn.appendChild(ico);
    btn.addEventListener('click', onProfileDrawerThemeToggleClick);

    wrap.appendChild(btn);
    drawer.appendChild(wrap);
    syncProfileDrawerThemeToggleVisuals();
  }

function ensureProfileDrawerEventsHeadingRow() {
  if (!profileDrawerEvents) return;
  const existing = getProfileDrawerEventsHeadingRow();
  if (existing) {
    if (!profileDrawerEventsStoryBadge) {
      const btn = existing.querySelector('.aep-profile-drawer-events-story-badge');
      if (btn) profileDrawerEventsStoryBadge = btn;
    }
    return;
  }
  const prev = profileDrawerEvents.previousElementSibling;
  if (!prev || prev.tagName !== 'H2' || !prev.classList.contains('aep-profile-drawer-panel-heading')) return;

  const row = document.createElement('div');
  row.className = 'aep-profile-drawer-events-heading-row';
  const title = document.createElement('h2');
  title.className = 'aep-profile-drawer-panel-heading aep-profile-drawer-events-heading-title';
  if (prev.id) title.id = prev.id;
  title.textContent = 'LAST EVENTS';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'aep-profile-drawer-events-story-badge';
  btn.id = 'profileDrawerEventsStoryOpen';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-controls', 'aepProfileDrawerEventsStoryDialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.title = 'Open persona journey — horizontal timeline (left to right)';
  btn.textContent = '0';

  row.appendChild(title);
  row.appendChild(btn);
  prev.replaceWith(row);
  profileDrawerEventsStoryBadge = btn;

  btn.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (btn.disabled) return;
    openProfileDrawerEventsStoryModal();
  });
}

function updateProfileDrawerEventsStoryBadgeCount(displayedCount) {
  ensureProfileDrawerEventsHeadingRow();
  if (!profileDrawerEventsStoryBadge) return;
  const n = typeof displayedCount === 'number' && Number.isFinite(displayedCount) ? Math.max(0, displayedCount) : 0;
  profileDrawerEventsStoryBadge.textContent = String(n);
  const hasStory =
    lastLookedUpProfile &&
    ((Array.isArray(lastLookedUpProfile.eventsStory) && lastLookedUpProfile.eventsStory.length > 0) ||
      (Array.isArray(lastLookedUpProfile.events) && lastLookedUpProfile.events.length > 0));
  profileDrawerEventsStoryBadge.disabled = !hasStory && n === 0;
  profileDrawerEventsStoryBadge.setAttribute('aria-disabled', !hasStory && n === 0 ? 'true' : 'false');
}

function migratePersonaJourneyModalChromeIfNeeded() {
  if (!eventsStoryModalPanel || !eventsStoryModalTrack) return;
  if (eventsStoryModalPanel.querySelector('.aep-profile-drawer-journey-controls')) return;
  const trackEl = eventsStoryModalTrack;
  const summary = document.createElement('div');
  summary.className = 'aep-profile-drawer-journey-summary';
  summary.id = 'aepProfileDrawerJourneySummary';
  summary.setAttribute('aria-live', 'polite');

  const nav = document.createElement('nav');
  nav.className = 'aep-profile-drawer-journey-controls';
  nav.setAttribute('aria-label', 'Journey playback');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'aep-profile-drawer-journey-btn';
  prevBtn.setAttribute('data-journey-action', 'prev');
  prevBtn.textContent = 'Previous moment';

  const meta = document.createElement('span');
  meta.className = 'aep-profile-drawer-journey-meta';
  meta.id = 'aepProfileDrawerJourneyStepMeta';
  meta.setAttribute('role', 'status');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'aep-profile-drawer-journey-btn';
  nextBtn.setAttribute('data-journey-action', 'next');
  nextBtn.textContent = 'Next moment';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'aep-profile-drawer-journey-btn aep-profile-drawer-journey-btn--ghost';
  allBtn.setAttribute('data-journey-action', 'showall');
  allBtn.textContent = 'Show full journey';

  nav.appendChild(prevBtn);
  nav.appendChild(meta);
  nav.appendChild(nextBtn);
  nav.appendChild(allBtn);

  eventsStoryModalPanel.insertBefore(summary, trackEl);
  eventsStoryModalPanel.insertBefore(nav, trackEl);
  eventsStoryModalSummary = summary;
  eventsStoryModalControlsWrap = nav;
  eventsStoryModalStepMeta = meta;
}

function bindJourneyControlsOnce() {
  if (journeyControlsBound || !eventsStoryModalControlsWrap) return;
  journeyControlsBound = true;
  eventsStoryModalControlsWrap.addEventListener('click', function (e) {
    const btn = e.target && e.target.closest && e.target.closest('[data-journey-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-journey-action');
    const maxIdx = Math.max(0, journeyModalGroups.length - 1);
    if (action === 'prev') journeyModalStep = Math.max(0, journeyModalStep - 1);
    else if (action === 'next') journeyModalStep = Math.min(maxIdx, journeyModalStep + 1);
    else if (action === 'showall') journeyModalStep = maxIdx;
    applyJourneyStepVisibility();
  });
}

function ensureProfileDrawerEventsStoryModal() {
  ensureProfileDrawerThemeToggle();
  if (eventsStoryModalBackdrop && eventsStoryModalPanel) {
    migratePersonaJourneyModalChromeIfNeeded();
    bindJourneyControlsOnce();
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.id = 'aepProfileDrawerEventsStoryBackdrop';
  backdrop.className = 'aep-profile-drawer-events-story-backdrop';
  backdrop.hidden = true;
  backdrop.setAttribute('aria-hidden', 'true');

  const panel = document.createElement('div');
  panel.id = 'aepProfileDrawerEventsStoryDialog';
  panel.className = 'aep-profile-drawer-events-story-dialog';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'aepProfileDrawerEventsStoryTitle');
  panel.tabIndex = -1;

  const head = document.createElement('div');
  head.className = 'aep-profile-drawer-events-story-head';
  const ttl = document.createElement('h2');
  ttl.id = 'aepProfileDrawerEventsStoryTitle';
  ttl.className = 'aep-profile-drawer-events-story-title';
  ttl.textContent = 'Persona journey';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'aep-profile-drawer-events-story-close';
  closeBtn.setAttribute('aria-label', 'Close journey');
  closeBtn.textContent = '\u00d7';
  head.appendChild(ttl);
  head.appendChild(closeBtn);

  const summary = document.createElement('div');
  summary.className = 'aep-profile-drawer-journey-summary';
  summary.id = 'aepProfileDrawerJourneySummary';
  summary.setAttribute('aria-live', 'polite');

  const nav = document.createElement('nav');
  nav.className = 'aep-profile-drawer-journey-controls';
  nav.setAttribute('aria-label', 'Journey playback');

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'aep-profile-drawer-journey-btn';
  prevBtn.setAttribute('data-journey-action', 'prev');
  prevBtn.textContent = 'Previous moment';

  const meta = document.createElement('span');
  meta.className = 'aep-profile-drawer-journey-meta';
  meta.id = 'aepProfileDrawerJourneyStepMeta';
  meta.setAttribute('role', 'status');

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'aep-profile-drawer-journey-btn';
  nextBtn.setAttribute('data-journey-action', 'next');
  nextBtn.textContent = 'Next moment';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'aep-profile-drawer-journey-btn aep-profile-drawer-journey-btn--ghost';
  allBtn.setAttribute('data-journey-action', 'showall');
  allBtn.textContent = 'Show full journey';

  nav.appendChild(prevBtn);
  nav.appendChild(meta);
  nav.appendChild(nextBtn);
  nav.appendChild(allBtn);

  const track = document.createElement('div');
  track.className = 'aep-profile-drawer-events-story-track';
  track.setAttribute('role', 'region');
  track.setAttribute('aria-label', 'Experience timeline left to right');
  track.tabIndex = 0;

  panel.appendChild(head);
  panel.appendChild(summary);
  panel.appendChild(nav);
  panel.appendChild(track);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  eventsStoryModalBackdrop = backdrop;
  eventsStoryModalPanel = panel;
  eventsStoryModalTrack = track;
  eventsStoryModalClose = closeBtn;
  eventsStoryModalSummary = summary;
  eventsStoryModalControlsWrap = nav;
  eventsStoryModalStepMeta = meta;

  function onBackdropDown(e) {
    if (e.target === backdrop) closeProfileDrawerEventsStoryModal();
  }
  backdrop.addEventListener('mousedown', onBackdropDown);
  closeBtn.addEventListener('click', function () {
    closeProfileDrawerEventsStoryModal();
  });

  bindJourneyControlsOnce();
}

function sortEventsChronologicalAsc(events) {
  const arr = Array.isArray(events) ? events.slice() : [];
  arr.sort((a, b) => {
    const at = eventTimestampMsForDrawer(a);
    const bt = eventTimestampMsForDrawer(b);
    const aNull = at == null || !Number.isFinite(at);
    const bNull = bt == null || !Number.isFinite(bt);
    if (aNull && bNull) return 0;
    if (aNull) return 1;
    if (bNull) return -1;
    return at - bt;
  });
  return arr;
}

/** One row per clock instant; same millisecond → one instant with multiple parallel events. */
function groupJourneyInstantsByTimestampMs(sortedAsc) {
  const groups = [];
  for (const ev of sortedAsc) {
    const ms = eventTimestampMsForDrawer(ev);
    const prev = groups[groups.length - 1];
    if (ms != null && Number.isFinite(ms) && prev && prev.instantMs === ms) {
      prev.events.push(ev);
    } else {
      groups.push({ instantMs: ms != null && Number.isFinite(ms) ? ms : null, events: [ev] });
    }
  }
  return groups;
}

function appendPersonaSummaryDom(el) {
  if (!el) return;
  el.textContent = '';
  const p = lastLookedUpProfile;
  if (!p) {
    el.textContent = 'Load a profile to anchor this journey to the attributes shown in the drawer.';
    return;
  }
  const first = p.firstName != null ? String(p.firstName).trim() : '';
  const last = p.lastName != null ? String(p.lastName).trim() : '';
  const name = `${first} ${last}`.trim() || 'Person';
  const strong = document.createElement('strong');
  strong.className = 'aep-profile-drawer-journey-persona-name';
  strong.textContent = name;
  el.appendChild(strong);
  const email = p.email != null ? String(p.email).trim() : '';
  if (email) {
    const sep = document.createElement('span');
    sep.className = 'aep-profile-drawer-journey-persona-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = ' · ';
    el.appendChild(sep);
    const em = document.createElement('span');
    em.className = 'aep-profile-drawer-journey-persona-email';
    em.textContent = email;
    el.appendChild(em);
  }
  const ecidRaw = p.ecid != null ? String(p.ecid).replace(/\D/g, '') : '';
  if (ecidRaw.length >= 10) {
    const sep2 = document.createElement('span');
    sep2.className = 'aep-profile-drawer-journey-persona-sep';
    sep2.setAttribute('aria-hidden', 'true');
    sep2.textContent = ' · ';
    el.appendChild(sep2);
    const ec = document.createElement('span');
    ec.className = 'aep-profile-drawer-journey-persona-ecid';
    ec.textContent = `ECID ${ecidRaw.slice(0, 4)}…${ecidRaw.slice(-4)}`;
    el.appendChild(ec);
  }
}

function uniqueJourneyTouchpoints(events) {
  const arr = Array.isArray(events) ? events : [];
  const set = new Set();
  arr.forEach((ev) => set.add(formatJourneyTouchpoint(ev)));
  return Array.from(set);
}

function applyJourneyStepVisibility() {
  if (!eventsStoryModalTrack) return;
  const strip = eventsStoryModalTrack.querySelector('.aep-profile-drawer-journey-strip');
  const rows = strip ? strip.querySelectorAll('.aep-profile-drawer-journey-instant') : [];
  rows.forEach((row) => {
    const i = parseInt(row.getAttribute('data-journey-instant') || '-1', 10);
    const show = Number.isFinite(i) && i <= journeyModalStep;
    row.classList.toggle('aep-profile-drawer-journey-instant--off', !show);
    row.setAttribute('aria-hidden', show ? 'false' : 'true');
  });
  if (strip) {
    strip.querySelectorAll('.aep-profile-drawer-journey-connector').forEach((el) => {
      const beforeIdx = parseInt(el.getAttribute('data-journey-connector-before') || '-1', 10);
      const show = Number.isFinite(beforeIdx) && beforeIdx >= 1 && beforeIdx <= journeyModalStep;
      el.classList.toggle('aep-profile-drawer-journey-connector--off', !show);
      el.setAttribute('aria-hidden', show ? 'false' : 'true');
    });
  }
  const hint = eventsStoryModalTrack.querySelector('.aep-profile-drawer-journey-touchpoints-hint');
  if (hint) {
    const showHint =
      journeyModalGroups.length > 0 && journeyModalStep >= Math.max(0, journeyModalGroups.length - 1);
    hint.classList.toggle('aep-profile-drawer-journey-touchpoints-hint--off', !showHint);
  }
  const maxIdx = Math.max(0, journeyModalGroups.length - 1);
  const root = eventsStoryModalControlsWrap;
  if (root) {
    const prev = root.querySelector('[data-journey-action="prev"]');
    const next = root.querySelector('[data-journey-action="next"]');
    const all = root.querySelector('[data-journey-action="showall"]');
    if (prev) prev.disabled = journeyModalStep <= 0;
    if (next) next.disabled = journeyModalStep >= maxIdx;
    if (all) {
      all.hidden = journeyModalGroups.length <= 1;
      all.disabled = journeyModalStep >= maxIdx;
    }
  }
  if (eventsStoryModalStepMeta) {
    const total = journeyModalGroups.length || 0;
    eventsStoryModalStepMeta.textContent =
      total === 0
        ? ''
        : `Moment ${journeyModalStep + 1} of ${total} · timeline grows left to right (cumulative)`;
  }
  const active = strip && strip.querySelector(`[data-journey-instant="${journeyModalStep}"]`);
  if (active && typeof active.scrollIntoView === 'function') {
    try {
      active.scrollIntoView({ block: 'nearest', inline: 'end', behavior: 'smooth' });
    } catch {
      active.scrollIntoView(true);
    }
  }
}

function renderProfileDrawerEventsStoryModalContent() {
  ensureProfileDrawerEventsStoryModal();
  if (!eventsStoryModalTrack || !eventsStoryModalSummary) return;
  eventsStoryModalTrack.innerHTML = '';
  appendPersonaSummaryDom(eventsStoryModalSummary);

  const src =
    lastLookedUpProfile && Array.isArray(lastLookedUpProfile.eventsStory) && lastLookedUpProfile.eventsStory.length
      ? lastLookedUpProfile.eventsStory
      : lastLookedUpProfile && Array.isArray(lastLookedUpProfile.events)
        ? lastLookedUpProfile.events
        : [];
  const ordered = sortEventsChronologicalAsc(src);

  if (!ordered.length) {
    const empty = document.createElement('p');
    empty.className = 'aep-profile-drawer-events-story-empty';
    empty.textContent = 'No experience events loaded yet. Look up a profile to see the journey.';
    eventsStoryModalTrack.appendChild(empty);
    if (eventsStoryModalControlsWrap) eventsStoryModalControlsWrap.hidden = true;
    journeyModalGroups = [];
    journeyModalStep = 0;
    if (eventsStoryModalStepMeta) eventsStoryModalStepMeta.textContent = '';
    return;
  }
  if (eventsStoryModalControlsWrap) eventsStoryModalControlsWrap.hidden = false;

  journeyModalGroups = groupJourneyInstantsByTimestampMs(ordered);
  journeyModalStep = 0;

  const strip = document.createElement('div');
  strip.className = 'aep-profile-drawer-journey-strip';
  strip.setAttribute('role', 'list');

  journeyModalGroups.forEach((g, idx) => {
    if (idx > 0) {
      const conn = document.createElement('span');
      conn.className = 'aep-profile-drawer-journey-connector';
      conn.setAttribute('data-journey-connector-before', String(idx));
      conn.setAttribute('aria-hidden', 'true');
      conn.textContent = '\u2192';
      strip.appendChild(conn);
    }

    const col = document.createElement('section');
    col.className = 'aep-profile-drawer-journey-instant';
    col.setAttribute('data-journey-instant', String(idx));
    col.setAttribute('role', 'listitem');

    const timeBlock = document.createElement('header');
    timeBlock.className = 'aep-profile-drawer-journey-time';
    const timeP = document.createElement('p');
    timeP.className = 'aep-profile-drawer-journey-time-label';
    timeP.textContent = g.instantMs == null ? '—' : formatEventTimelineDate(g.instantMs);
    const cnt = document.createElement('p');
    cnt.className = 'aep-profile-drawer-journey-time-meta';
    cnt.textContent = g.events.length > 1 ? `${g.events.length} parallel` : 'Single event';
    timeBlock.appendChild(timeP);
    timeBlock.appendChild(cnt);

    const cardsWrap = document.createElement('div');
    cardsWrap.className = 'aep-profile-drawer-journey-cards';
    g.events.forEach((ev) => {
      const card = document.createElement('article');
      card.className = 'aep-profile-drawer-journey-card';
      const thumb = document.createElement('div');
      fillDrawerEventThumbElement(
        thumb,
        ev,
        'aep-profile-drawer-event-thumb aep-profile-drawer-journey-card-thumb',
      );
      const body = document.createElement('div');
      body.className = 'aep-profile-drawer-journey-card-body';
      const tp = document.createElement('span');
      tp.className = 'aep-profile-drawer-journey-touchpoint';
      tp.textContent = formatJourneyTouchpoint(ev);
      const h3 = document.createElement('h3');
      h3.className = 'aep-profile-drawer-journey-card-title';
      h3.textContent = normalizeEventName(ev && ev.eventName);
      body.appendChild(tp);
      body.appendChild(h3);
      card.appendChild(thumb);
      card.appendChild(body);
      cardsWrap.appendChild(card);
    });

    const spine = document.createElement('div');
    spine.className = 'aep-profile-drawer-journey-spine-node';
    const dot = document.createElement('span');
    dot.className = 'aep-profile-drawer-journey-dot';
    spine.appendChild(dot);

    col.appendChild(timeBlock);
    col.appendChild(cardsWrap);
    col.appendChild(spine);
    strip.appendChild(col);
  });

  eventsStoryModalTrack.appendChild(strip);

  const touches = uniqueJourneyTouchpoints(ordered);
  const hint = document.createElement('p');
  hint.className = 'aep-profile-drawer-journey-touchpoints-hint';
  hint.textContent = touches.length ? `Touchpoints in this journey: ${touches.join(', ')}.` : '';
  eventsStoryModalTrack.appendChild(hint);

  applyJourneyStepVisibility();
}

function openProfileDrawerEventsStoryModal() {
  ensureProfileDrawerEventsStoryModal();
  if (!eventsStoryModalBackdrop || !eventsStoryModalPanel || !profileDrawerEventsStoryBadge) return;

  eventsStoryModalLastFocus = /** @type {HTMLElement} */ (document.activeElement);
  renderProfileDrawerEventsStoryModalContent();

  eventsStoryModalBackdrop.hidden = false;
  eventsStoryModalBackdrop.setAttribute('aria-hidden', 'false');
  eventsStoryModalOpen = true;
  profileDrawerEventsStoryBadge.setAttribute('aria-expanded', 'true');
  document.body.classList.add('aep-profile-drawer-events-story-open');

  window.setTimeout(function () {
    if (eventsStoryModalPanel) eventsStoryModalPanel.focus();
  }, 0);
}

function closeProfileDrawerEventsStoryModal() {
  if (!eventsStoryModalBackdrop || !profileDrawerEventsStoryBadge) return;
  eventsStoryModalBackdrop.hidden = true;
  eventsStoryModalBackdrop.setAttribute('aria-hidden', 'true');
  eventsStoryModalOpen = false;
  profileDrawerEventsStoryBadge.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('aep-profile-drawer-events-story-open');
  const ret = eventsStoryModalLastFocus;
  eventsStoryModalLastFocus = null;
  if (ret && typeof ret.focus === 'function') {
    try {
      ret.focus();
    } catch {
      /* noop */
    }
  }
}

function onProfileDrawerEventsStoryKeydown(e) {
  if (!eventsStoryModalOpen) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (e.key === 'Escape') {
    e.preventDefault();
    closeProfileDrawerEventsStoryModal();
    return;
  }
  const maxIdx = Math.max(0, journeyModalGroups.length - 1);
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    if (journeyModalStep >= maxIdx) return;
    e.preventDefault();
    journeyModalStep = Math.min(maxIdx, journeyModalStep + 1);
    applyJourneyStepVisibility();
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    if (journeyModalStep <= 0) return;
    e.preventDefault();
    journeyModalStep = Math.max(0, journeyModalStep - 1);
    applyJourneyStepVisibility();
  } else if (e.key === 'End') {
    e.preventDefault();
    journeyModalStep = maxIdx;
    applyJourneyStepVisibility();
  } else if (e.key === 'Home') {
    e.preventDefault();
    journeyModalStep = 0;
    applyJourneyStepVisibility();
  }
}

function renderEventTimeline(events) {
  if (!profileDrawerEvents) return;
  ensureProfileDrawerEventsHeadingRow();
  profileDrawerEvents.innerHTML = '';
  const list = Array.isArray(events) ? events.slice(0, 5) : [];
  updateProfileDrawerEventsStoryBadgeCount(list.length);
  if (!list.length) {
    const p = document.createElement('p');
    p.textContent = 'No events found for this profile';
    profileDrawerEvents.appendChild(p);
    return;
  }

  list.forEach((ev) => {
    const item = document.createElement('article');
    item.className = 'aep-profile-drawer-event-item';

    const thumb = document.createElement('div');
    fillDrawerEventThumbElement(thumb, ev);

    const textWrap = document.createElement('div');
    const timeEl = document.createElement('span');
    timeEl.className = 'aep-profile-drawer-event-time';
    timeEl.textContent = formatEventTimelineDate(ev && ev.timestamp);

    const titleEl = document.createElement('strong');
    titleEl.className = 'aep-profile-drawer-event-title';
    titleEl.textContent = normalizeEventName(ev && ev.eventName);

    const subEl = document.createElement('span');
    subEl.className = 'aep-profile-drawer-event-sub';
    const evLabel = normalizeEventName(ev && ev.eventName).toUpperCase();
    const typeRaw = String((ev && ev.eventType) || (ev && ev.eventName) || '').trim().toLowerCase();
    const msgKind = aepProfileDrawerMessageChannelKind(ev);
    const channelTag =
      msgKind === 'email'
        ? 'email'
        : msgKind === 'push'
          ? 'push'
          : typeRaw.startsWith('mobile')
            ? 'MOBILE'
            : typeRaw.startsWith('insurance')
              ? 'INSURANCE'
            : typeRaw.startsWith('web')
              ? 'WEB'
              : 'WEB';
    subEl.textContent = `${evLabel} - ${channelTag}`;

    textWrap.appendChild(timeEl);
    textWrap.appendChild(titleEl);
    textWrap.appendChild(subEl);
    item.appendChild(thumb);
    item.appendChild(textWrap);
    profileDrawerEvents.appendChild(item);
  });
}

/** Hide application.login in the drawer timeline when it fired within this window (e.g. same session sign-in). */
const DRAWER_HIDE_APPLICATION_LOGIN_MS = 5 * 60 * 1000;

function eventTimestampMsForDrawer(ev) {
  if (!ev || ev.timestamp == null) return null;
  const t = typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10);
  return Number.isFinite(t) ? t : null;
}

function isDrawerApplicationLoginEvent(ev) {
  const raw = String((ev && ev.eventType) || (ev && ev.eventName) || '')
    .toLowerCase()
    .replace(/\s+/g, '');
  return raw === 'application.login' || raw.includes('application.login');
}

/** Remove application.login events from the last 5 minutes before picking the top 5 for the panel. */
function filterRecentApplicationLoginForDrawer(events) {
  if (!Array.isArray(events) || !events.length) return events;
  const now = Date.now();
  return events.filter((ev) => {
    if (!isDrawerApplicationLoginEvent(ev)) return true;
    const ts = eventTimestampMsForDrawer(ev);
    if (ts == null) return true;
    const ageMs = now - ts;
    if (ageMs < 0) return true;
    return ageMs > DRAWER_HIDE_APPLICATION_LOGIN_MS;
  });
}

/** Full event list for metrics + timeline (same API as Profile Viewer Events tab). */
async function fetchProfileEventsList(email, namespaceOverride) {
  if (!email) return [];
  const ns =
    namespaceOverride != null && String(namespaceOverride).trim()
      ? String(namespaceOverride).trim().toLowerCase()
      : getNamespaceForDrawer();
  try {
    const res = await fetch(
      '/api/profile/events?identifier=' +
        encodeURIComponent(email) +
        '&namespace=' +
        encodeURIComponent(ns) +
        getSandboxParam(),
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const events = Array.isArray(data.events) ? data.events : [];
    events.sort((a, b) => {
      const at = a && a.timestamp != null ? Number(a.timestamp) : 0;
      const bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
      return bt - at;
    });
    return events;
  } catch {
    return [];
  }
}

function augmentGeneratorRequestBody(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (typeof global.AepDemoGeneratorTargets !== 'undefined' && global.AepDemoGeneratorTargets.augmentGeneratorPostBody) {
    return global.AepDemoGeneratorTargets.augmentGeneratorPostBody(b);
  }
  if (!b.sandbox && typeof global.AepGlobalSandbox !== 'undefined' && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
    const s = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    if (s) b.sandbox = s;
  }
  return b;
}

function sendApplicationLoginExperienceEvent(email, getSelectedGeneratorTarget) {
  const ecidEl = document.getElementById('infoEcid');
  const ecidText = ecidEl ? String(ecidEl.textContent || '').trim() : '';
  const ecid =
    ecidText && ecidText !== '—' && ecidText !== '-' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
  const target = typeof getSelectedGeneratorTarget === 'function' ? getSelectedGeneratorTarget() : null;
  const body = {
    targetId: target ? target.id : undefined,
    email: String(email || '').trim(),
    eventType: 'application.login',
    viewName: _config.viewName || 'Demo',
    viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
    channel: 'Web',
  };
  if (ecid) body.ecid = ecid;
  const postBody = augmentGeneratorRequestBody(body);
  return fetch('/api/events/generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(postBody),
  }).then((res) => {
    return res
      .json()
      .catch(() => ({}))
      .then((data) => {
        if (!res.ok) throw new Error(data.error || data.message || 'Request failed.');
        return data;
      });
  });
}

/**
 * Load consent + audiences + events and refresh the bottom drawer (and ECID hint).
 * @param {string} email
 * @param {{
 *   onUserMessage?: (text: string, type?: string) => void,
 *   addEmailOnSuccess?: boolean,
 *   updateMessage?: boolean,
 * }} [options]
 * @returns {Promise<boolean>} Resolves true after a successful consent response (demo pages).
 */
async function loadProfileDataForDrawer(email, options) {
  const opts = options || {};
  const emailTrim = String(email || '').trim();
  if (!emailTrim) return false;

  const messageFn =
    typeof opts.onUserMessage === 'function'
      ? opts.onUserMessage
      : opts.updateMessage && typeof _config.messageSetter === 'function'
        ? _config.messageSetter
        : null;

  const ns = getNamespaceForDrawer();
  try {
    const res = await fetch(
      '/api/profile/consent?identifier=' +
        encodeURIComponent(emailTrim) +
        '&namespace=' +
        encodeURIComponent(ns) +
        getSandboxParam(),
    );
    const data = await res.json();
    if (!res.ok) {
      if (messageFn) {
        let errMsg = String(data.message || data.error || 'Profile request failed.');
        const raw = String(errMsg || '');
        if (ns === 'ecid' && /entity not found|profile not found|not found/i.test(raw)) {
          errMsg =
            'No Unified Profile for this ECID yet (normal for a brand-new browser ID). Send at least one experience event to this sandbox, wait for ingestion, then try again — or look up by email.';
        }
        messageFn(errMsg, 'error');
      }
      return false;
    }
    if (data.found && (opts.addEmailOnSuccess || opts.updateMessage)) {
      if (typeof addRecentIdentifier === 'function') addRecentIdentifier(emailTrim, ns);
      else if (typeof addEmail === 'function') addEmail(emailTrim);
      if (typeof addEmail === 'function' && data.email) {
        const resolvedEmail = String(data.email).trim();
        if (resolvedEmail) addEmail(resolvedEmail);
      }
    }

    const ecidVal =
      data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
    const incomingEcid = ecidVal && ecidVal.length >= 10 ? ecidVal : '';
    const digitsOnly = (s) => String(s || '').replace(/\D/g, '');
    const prevHintForSession = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    const sessionEcidValid =
      prevHintForSession &&
      prevHintForSession !== '—' &&
      prevHintForSession !== '-' &&
      /^\d+$/.test(prevHintForSession) &&
      prevHintForSession.length >= 10;
    const sessionEcid = sessionEcidValid ? prevHintForSession : '';
    const lookupIsEcidNs = ns === 'ecid' && digitsOnly(emailTrim).length >= 10;
    const lookupByEmail = !lookupIsEcidNs;

    if (infoEcid) {
      const prevHint = prevHintForSession;
      const sameBrowserEcid =
        lookupIsEcidNs && digitsOnly(emailTrim) === digitsOnly(prevHint) && prevHint !== '—' && prevHint !== '-';
      if (incomingEcid) {
        if (lookupByEmail && sessionEcidValid && digitsOnly(incomingEcid) !== digitsOnly(prevHint)) {
          infoEcid.textContent = prevHint;
        } else {
          infoEcid.textContent = incomingEcid;
        }
      } else if (sameBrowserEcid && !data.found) {
        infoEcid.textContent = prevHint;
      } else if (!incomingEcid && !data.found && sessionEcidValid) {
        infoEcid.textContent = prevHint;
      } else if (lookupByEmail && data.found && sessionEcidValid) {
        infoEcid.textContent = prevHint;
      } else if (!incomingEcid) {
        infoEcid.textContent = '—';
      }
    }

    const [audiences, eventsAll] = await Promise.all([
      fetchAudienceMembership(emailTrim),
      fetchProfileEventsList(emailTrim),
    ]);
    const eventsForTimeline = filterRecentApplicationLoginForDrawer(eventsAll);
    const events = eventsForTimeline.slice(0, 5);
    const eventsStory = eventsForTimeline.slice(0, DRAWER_EVENTS_STORY_MAX);
    const engagementH = resolveEngagementMetricsHoursBack(opts);
    let emailSendsLast24h;
    let pushSendsLast24h;
    if (typeof window.EmailEngagementMetrics !== 'undefined') {
      if (window.EmailEngagementMetrics.getEmailSendsLastHours) {
        emailSendsLast24h = window.EmailEngagementMetrics.getEmailSendsLastHours(eventsAll, engagementH);
      } else {
        emailSendsLast24h = undefined;
      }
      if (window.EmailEngagementMetrics.getPushSendsLastHours) {
        pushSendsLast24h = window.EmailEngagementMetrics.getPushSendsLastHours(eventsAll, engagementH);
      } else {
        pushSendsLast24h = undefined;
      }
    } else {
      emailSendsLast24h = undefined;
      pushSendsLast24h = undefined;
    }

    const profileEmailForGraph =
      data.email != null && String(data.email).trim() ? String(data.email).trim() : '';
    const prev = lastLookedUpProfile || {};
    const ecidMerged =
      incomingEcid ||
      (ecidVal && String(ecidVal).length >= 10 ? String(ecidVal) : '') ||
      (lookupByEmail && sessionEcid ? sessionEcid : '') ||
      (prev.ecid != null && String(prev.ecid).length >= 10 ? String(prev.ecid) : '') ||
      null;
    const ecidForGraph = ecidMerged || '';
    const appendSessionEcid =
      lookupByEmail && sessionEcid && (!incomingEcid || digitsOnly(sessionEcid) !== digitsOnly(incomingEcid))
        ? sessionEcid
        : '';
    const identities = mergeIdentitiesFromConsent(data, ecidForGraph, profileEmailForGraph, appendSessionEcid);

    lastLookedUpProfile = {
      ...prev,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      gender: data.gender != null && data.gender !== '' ? data.gender : null,
      age: data.age != null && data.age !== '' ? data.age : null,
      city: data.city != null && data.city !== '' ? data.city : null,
      propensityScore: data.propensityScore != null && data.propensityScore !== '' ? data.propensityScore : null,
      churnPrediction: data.churnPrediction != null && data.churnPrediction !== '' ? data.churnPrediction : null,
      loyaltyStatus: data.loyaltyStatus != null && data.loyaltyStatus !== '' ? data.loyaltyStatus : null,
      email: data.email != null && data.email !== '' ? data.email : null,
      customerLifetimeValue:
        data.customerLifetimeValue != null && data.customerLifetimeValue !== ''
          ? data.customerLifetimeValue
          : null,
      ecid: ecidMerged,
      marketingConsent: data.marketingConsent || null,
      channels: data.channels && typeof data.channels === 'object' ? { ...data.channels } : null,
      preferredMarketingChannel: data.preferredMarketingChannel || null,
      dataCollection: data.dataCollection || null,
      lastModifiedAt: data.lastModifiedAt || null,
      identities,
      audiences,
      events,
      eventsStory,
      emailSendsLast24h,
      pushSendsLast24h,
      engagementMetricsHoursBack: engagementH,
    };

    updateProfileDrawer(lastLookedUpProfile);

    if (data.found && typeof _config.getSelectedGeneratorTarget === 'function') {
      sendApplicationLoginExperienceEvent(emailTrim, _config.getSelectedGeneratorTarget).catch(() => {});
    }

    if (messageFn) {
      messageFn(
        data.found
          ? 'Profile found. ECID will be sent with the event if valid.'
          : ns === 'ecid'
            ? 'No profile entity for this ECID yet. After events ingest (~1–2 min), try again or use email namespace.'
            : 'No profile found; event can still be sent (no ECID).',
        data.found ? 'success' : '',
      );
    }
    return true;
  } catch (err) {
    if (messageFn) messageFn(err.message || 'Network error', 'error');
    return false;
  }
}

function patchLastProfileOrUpdate(partial) {
  const p = partial && typeof partial === 'object' ? partial : {};
  if (lastLookedUpProfile) {
    Object.assign(lastLookedUpProfile, p);
    updateProfileDrawer(lastLookedUpProfile);
  } else {
    lastLookedUpProfile = { ...p };
    updateProfileDrawer(lastLookedUpProfile);
  }
}

/**
 * Refresh LAST 5 EVENTS using a specific identity (e.g. ECID) without running full consent lookup.
 * @param {string} identifier
 * @param {string} [namespaceOverride] - e.g. 'ecid'
 */
async function refreshDrawerEventsForIdentity(identifier, namespaceOverride) {
  const id = String(identifier || '').trim();
  if (!id) return;
  cacheDomRefs();
  const eventsAll = await fetchProfileEventsList(id, namespaceOverride);
  const eventsForTimeline = filterRecentApplicationLoginForDrawer(eventsAll);
  const events = eventsForTimeline.slice(0, 5);
  const eventsStory = eventsForTimeline.slice(0, DRAWER_EVENTS_STORY_MAX);
  patchLastProfileOrUpdate({ events, eventsStory });
}

/** Parse ECID from Web SDK `getIdentity` result (shape varies by SDK version). */
function extractEcidFromAlloyGetIdentityResult(result) {
  if (!result || typeof result !== 'object') return '';
  const id = result.identity;
  if (!id || typeof id !== 'object') return '';
  const raw = id.ECID != null ? id.ECID : id.ecid;
  if (typeof raw === 'string') {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 10 ? digits : '';
  }
  if (raw && typeof raw === 'object') {
    const inner = raw.id != null ? String(raw.id) : '';
    const digits = inner.replace(/\D/g, '');
    return digits.length >= 10 ? digits : '';
  }
  return '';
}

function whenAlloyGlobalReady(timeoutMs) {
  const max = timeoutMs || 25000;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tick() {
      if (typeof global.alloy === 'function') {
        resolve(global.alloy);
        return;
      }
      if (Date.now() - start > max) {
        reject(new Error('Alloy not available'));
        return;
      }
      global.setTimeout(tick, 50);
    }
    tick();
  });
}

/**
 * When Launch + Web SDK assign a browser ECID before any profile lookup, mirror it in the strip
 * and drawer (IDENTITY + graph) so demos work immediately.
 */
async function applyBrowserEcidFromAlloyIfNeeded() {
  cacheDomRefs();
  const cur = infoEcid ? String(infoEcid.textContent || '').trim() : '';
  if (cur && cur !== '—' && cur !== '-' && /^\d+$/.test(cur) && cur.length >= 10) return;

  let alloyFn;
  try {
    alloyFn = await whenAlloyGlobalReady(25000);
  } catch {
    return;
  }

  let result;
  try {
    result = await alloyFn('getIdentity', { namespaces: ['ECID'] });
  } catch {
    try {
      result = await alloyFn('getIdentity');
    } catch {
      return;
    }
  }

  const ecid = extractEcidFromAlloyGetIdentityResult(result);
  if (!ecid || ecid.length < 10) return;

  if (infoEcid) infoEcid.textContent = ecid;
  patchLastProfileOrUpdate({
    ecid,
    identities: [{ namespace: 'ECID', value: ecid }],
  });
  void refreshDrawerEventsForIdentity(ecid, 'ecid');

  if (typeof _config.afterBrowserEcidApplied === 'function') {
    try {
      const out = _config.afterBrowserEcidApplied(ecid);
      if (out && typeof out.then === 'function') void out.then(() => {}).catch(() => {});
    } catch {
      /* noop */
    }
  }
}

function initAepProfileDrawerHover() {
  const body = document.body;
  const hover = profileHoverZone;
  const drawer = profileDrawer;
  if (!hover || !drawer) return;

  const openClass = _config.profileOpenClass || 'aep-profile-drawer-open';

  function drawerGetEmail() {
    if (typeof _config.emailGetter === 'function') return _config.emailGetter() || '';
    const id = _config.emailInputId || 'customerEmail';
    const el = document.getElementById(id);
    return (el && el.value) || '';
  }

  let closeTimer = null;
  let drawerOpenState = false;

  function clearCloseTimer() {
    if (closeTimer) {
      window.clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  function setDrawerOpen(open) {
    const next = !!open;
    body.classList.toggle(openClass, next);
    if (next && !drawerOpenState) {
      const email = String(drawerGetEmail() || '').trim();
      if (email) loadProfileDataForDrawer(email, { updateMessage: false });
    }
    drawerOpenState = next;
  }

  function scheduleClose() {
    clearCloseTimer();
    closeTimer = window.setTimeout(function () {
      setDrawerOpen(false);
      closeTimer = null;
    }, 260);
  }

  hover.addEventListener('mouseenter', function () {
    clearCloseTimer();
    setDrawerOpen(true);
  });
  hover.addEventListener('mouseleave', scheduleClose);
  drawer.addEventListener('mouseenter', function () {
    clearCloseTimer();
    setDrawerOpen(true);
  });
  drawer.addEventListener('mouseleave', scheduleClose);

  updateProfileDrawer(null);
  setDrawerOpen(false);
}

function init(config) {
  _config = config || {};
  cacheDomRefs();
  ensureProfileDrawerThemeToggle();

  if (!eventsStoryModalKeydownBound) {
    eventsStoryModalKeydownBound = true;
    document.addEventListener('keydown', onProfileDrawerEventsStoryKeydown);
  }

  if (identityGraphZoomIn) {
    identityGraphZoomIn.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale + 0.12));
  }
  if (identityGraphZoomOut) {
    identityGraphZoomOut.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale - 0.12));
  }

  initAepProfileDrawerHover();

  if (_config.fetchBrowserEcidOnInit) {
    const run = () => {
      void applyBrowserEcidFromAlloyIfNeeded();
    };
    if (typeof window !== 'undefined') {
      if (document.readyState === 'complete') {
        window.setTimeout(run, 400);
      } else {
        window.addEventListener('load', () => window.setTimeout(run, 400), { once: true });
      }
    }
  }
}

const api = {
  init,
  loadProfileDataForDrawer,
  updateProfileDrawer,
  getLastLookedUpProfile: () => lastLookedUpProfile,
  getLastProfile: () => lastLookedUpProfile,
  patchLastProfileOrUpdate,
  refreshDrawerEventsForIdentity,
  initHover: initAepProfileDrawerHover,
};

global.AepProfileDrawer = api;
global.DemoProfileDrawer = api;
})(typeof window !== 'undefined' ? window : globalThis);
