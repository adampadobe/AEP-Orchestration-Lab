/**
 * Shared bottom AEP profile drawer: consent data, identity graph, audiences, events, engagement metrics.
 * Expects element ids profileDrawer*, identityGraph*, profileHoverZone.
 * Include aep-profile-drawer.css and email-engagement-metrics.js before this script.
 * Optional: identity-picker.js + aep-global-sandbox.js for namespace + sandbox query params.
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
  let profileDrawerPushSendsRow;
  let profileDrawerPushSentValue;
  let profileDrawerPushSentUnit;
  let profileDrawerEvents;
  let infoEcid;
  let identityGraphSvg;
  let identityGraphZoomIn;
  let identityGraphZoomOut;

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
    profileDrawerPushSendsRow = document.getElementById('profileDrawerPushSendsRow');
    profileDrawerPushSentValue = document.getElementById('profileDrawerPushSentValue');
    profileDrawerPushSentUnit = document.getElementById('profileDrawerPushSentUnit');
    profileDrawerEvents = document.getElementById('profileDrawerEvents');
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
  setDrawerValue(profileDrawerEmail, source ? source.email : null, '—');
  setDrawerValue(profileDrawerPhone, source ? source.phone : null, 'Unknown');
  setDrawerValue(profileDrawerCity, source ? source.city : null, '—');
  setDrawerValue(profileDrawerLtv, source ? source.customerLifetimeValue : null, '$500');
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
  if (profileDrawerAvatar) {
    profileDrawerAvatar.src = avatarSrcForProfile(source);
  }
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

function mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail) {
  const list = Array.isArray(data.identities) ? data.identities.slice() : [];
  function hasMatch(re) {
    return list.some((x) => re.test(String(x.namespace || '')));
  }
  const ecidStr = ecidVal && String(ecidVal).length >= 10 ? String(ecidVal) : '';
  if (ecidStr && !hasMatch(/ecid/i)) list.push({ namespace: 'ECID', value: ecidStr });
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

function eventThumbForName(eventName) {
  const key = String(eventName || '').toLowerCase().replace(/\s+/g, '');
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
  const typePrefix = String(eventName || '').trim().toLowerCase();
  if (typePrefix.startsWith('web')) {
    return { url: aepProfileImageCssUrl('event-web-icon.png'), variant: 'event-web' };
  }
  if (typePrefix.startsWith('mobile')) {
    return { url: aepProfileImageCssUrl('event-mobile-icon.png'), variant: 'event-mobile' };
  }
  const keyLoose = String(eventName || '').toLowerCase();
  if (keyLoose.includes('donation')) {
    return { url: "url('https://www.cancerresearchuk.org/_next/image?url=https%3A%2F%2Fdownloads.ctfassets.net%2Fu7vsjnoopqo5%2FrvcPK0YbxqEl9Gt41Azzq%2Fac926460962e2c75c0a0038ca8bfa45c%2F230613_CR_Trampoline187.jpg&w=256&q=65')" };
  }
  if (keyLoose.includes('register')) {
    return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/6uvR1AnyLivuw4FgIvCIcw/d633484906952732a873c2d355d7aaff/Cervical_Cancer_HPV_Vaccine_2_RGB_400px.png?w=200&q=75')" };
  }
  if (keyLoose.includes('abandon')) {
    return { url: "url('https://images.ctfassets.net/u7vsjnoopqo5/3vMd1m9QJUdgZ1jMpzgmoU/657e350658a59d5f37a8a8a6ab3e47e1/Icon_microscope_navy.png?w=200&q=75')" };
  }
  return { url: "url('https://www.cancerresearchuk.org/_next/image?url=https%3A%2F%2Fdownloads.ctfassets.net%2Fu7vsjnoopqo5%2FrvcPK0YbxqEl9Gt41Azzq%2Fac926460962e2c75c0a0038ca8bfa45c%2F230613_CR_Trampoline187.jpg&w=200&q=65')" };
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

function renderEventTimeline(events) {
  if (!profileDrawerEvents) return;
  profileDrawerEvents.innerHTML = '';
  const list = Array.isArray(events) ? events.slice(0, 5) : [];
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
    thumb.className = 'aep-profile-drawer-event-thumb';
    const thumbSpec = eventThumbForName((ev && ev.eventType) || (ev && ev.eventName) || '');
    thumb.style.backgroundImage = thumbSpec.url;
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
async function fetchProfileEventsList(email) {
  if (!email) return [];
  const ns = getNamespaceForDrawer();
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
  return fetch('/api/events/generator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
      if (messageFn) messageFn(data.error || 'Profile request failed.', 'error');
      return false;
    }
    if (typeof addEmail === 'function' && (opts.addEmailOnSuccess || opts.updateMessage)) addEmail(emailTrim);

    const ecidVal =
      data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
    if (infoEcid) infoEcid.textContent = ecidVal && ecidVal.length >= 10 ? ecidVal : '—';

    const canonicalEmail = data.email || emailTrim;
    const [audiences, eventsAll] = await Promise.all([
      fetchAudienceMembership(canonicalEmail),
      fetchProfileEventsList(canonicalEmail),
    ]);
    const eventsForTimeline = filterRecentApplicationLoginForDrawer(eventsAll);
    const events = eventsForTimeline.slice(0, 5);
    let emailSendsLast24h;
    let pushSendsLast24h;
    if (typeof window.EmailEngagementMetrics !== 'undefined') {
      if (window.EmailEngagementMetrics.getEmailSendsLastHours) {
        emailSendsLast24h = window.EmailEngagementMetrics.getEmailSendsLastHours(eventsAll, 24);
      } else {
        emailSendsLast24h = undefined;
      }
      if (window.EmailEngagementMetrics.getPushSendsLastHours) {
        pushSendsLast24h = window.EmailEngagementMetrics.getPushSendsLastHours(eventsAll, 24);
      } else {
        pushSendsLast24h = undefined;
      }
    } else {
      emailSendsLast24h = undefined;
      pushSendsLast24h = undefined;
    }

    const identities = mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail);

    const prev = lastLookedUpProfile || {};
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
      email: canonicalEmail,
      ecid: ecidVal || null,
      marketingConsent: data.marketingConsent || null,
      preferredMarketingChannel: data.preferredMarketingChannel || null,
      dataCollection: data.dataCollection || null,
      lastModifiedAt: data.lastModifiedAt || null,
      identities,
      audiences,
      events,
      emailSendsLast24h,
      pushSendsLast24h,
    };

    updateProfileDrawer(lastLookedUpProfile);

    if (data.found && _config.getSelectedGeneratorTarget) {
      sendApplicationLoginExperienceEvent(emailTrim, _config.getSelectedGeneratorTarget).catch(() => {});
    }

    if (messageFn) {
      messageFn(
        data.found
          ? 'Profile found. ECID will be sent with the event if valid.'
          : 'No profile found; event can still be sent (no ECID).',
        'success',
      );
    }
    return true;
  } catch (err) {
    if (messageFn) messageFn(err.message || 'Network error', 'error');
    return false;
  }
}

function patchLastProfileOrUpdate(partial) {
  if (lastLookedUpProfile) {
    Object.assign(lastLookedUpProfile, partial);
    updateProfileDrawer(lastLookedUpProfile);
  } else {
    updateProfileDrawer(partial);
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

  if (identityGraphZoomIn) {
    identityGraphZoomIn.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale + 0.12));
  }
  if (identityGraphZoomOut) {
    identityGraphZoomOut.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale - 0.12));
  }

  initAepProfileDrawerHover();
}

const api = {
  init,
  loadProfileDataForDrawer,
  updateProfileDrawer,
  getLastLookedUpProfile: () => lastLookedUpProfile,
  getLastProfile: () => lastLookedUpProfile,
  patchLastProfileOrUpdate,
  initHover: initAepProfileDrawerHover,
};

global.AepProfileDrawer = api;
global.DemoProfileDrawer = api;
})(typeof window !== 'undefined' ? window : globalThis);
