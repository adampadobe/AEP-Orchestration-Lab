/**
 * Donate demo page — donation.made via /api/events/generator with public.donationAmount and public.donationDate (YYYY-MM-DD local).
 */

const customerEmail = document.getElementById('customerEmail');
if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');

const queryProfileBtn = document.getElementById('queryProfileBtn');
const infoEcid = document.getElementById('infoEcid');
const generatorTargetSelect = document.getElementById('generatorTarget');
const donateAmountInput = document.getElementById('donateAmount');
const donateNowBtn = document.getElementById('donateNowBtn');
const donateMessage = document.getElementById('donateMessage');

const tabMonthly = document.getElementById('tabMonthly');
const tabSingle = document.getElementById('tabSingle');
const presetsMonthly = document.getElementById('donatePresetsMonthly');
const presetsSingle = document.getElementById('donatePresetsSingle');
const profileHoverZone = document.getElementById('profileHoverZone');
const profileDrawer = document.getElementById('profileDrawer');
const profileDrawerAvatar = document.getElementById('profileDrawerAvatar');
const profileDrawerName = document.getElementById('profileDrawerName');
const profileDrawerGender = document.getElementById('profileDrawerGender');
const profileDrawerEmail = document.getElementById('profileDrawerEmail');
const profileDrawerPhone = document.getElementById('profileDrawerPhone');
const profileDrawerAddress = document.getElementById('profileDrawerAddress');
const profileDrawerLtv = document.getElementById('profileDrawerLtv');
const profileDrawerDesktopId = document.getElementById('profileDrawerDesktopId');
const profileDrawerMobileId = document.getElementById('profileDrawerMobileId');
const profileDrawerIdentityEmail = document.getElementById('profileDrawerIdentityEmail');
const profileDrawerAppUuid = document.getElementById('profileDrawerAppUuid');
const profileDrawerCrm = document.getElementById('profileDrawerCrm');
const profileDrawerLoyalty = document.getElementById('profileDrawerLoyalty');
const profileDrawerAudiences = document.getElementById('profileDrawerAudiences');
const profileDrawerEvents = document.getElementById('profileDrawerEvents');
const identityGraphSvg = document.getElementById('identityGraphSvg');
const identityGraphZoomIn = document.getElementById('identityGraphZoomIn');
const identityGraphZoomOut = document.getElementById('identityGraphZoomOut');

const SVG_NS = 'http://www.w3.org/2000/svg';
const XHTML_NS = 'http://www.w3.org/1999/xhtml';

/** @type {number} */
let identityGraphScale = 1;

/** Keys seen on last graph render — used to animate newly linked identities */
let lastIdentityGraphKeys = new Set();

/** Default headshots when gender is unknown or not provided by AEP */
const AVATAR_DEFAULT =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80';
const AVATAR_FEMALE =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=320&q=80';
/** Local asset — used when profile gender resolves to male */
const AVATAR_MALE = 'images/avatar-male.png';

/** @type {Array<{ id: string, label: string, transport: string }>} */
let generatorTargets = [];
let lastLookedUpProfile = null;

function setDrawerLine(el, label, value) {
  if (!el) return;
  const shown = value == null || value === '' ? '—' : String(value);
  el.textContent = `${label}: ${shown}`;
}

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
 * Male → local avatar-male.png; female → stock; unknown → optional avatarUrl then default.
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
  setDrawerValue(profileDrawerEmail, source ? source.email : null, '—');
  setDrawerValue(profileDrawerPhone, source ? source.phone : null, 'Unknown');
  setDrawerValue(profileDrawerAddress, source ? source.address : null, 'Unknown');
  setDrawerValue(profileDrawerLtv, source ? source.customerLifetimeValue : null, '$500');
  setDrawerValue(profileDrawerDesktopId, source ? source.ecid : null, '—');
  setDrawerValue(profileDrawerMobileId, source ? source.mobileId : null, 'Unknown');
  setDrawerValue(profileDrawerIdentityEmail, source ? source.email : null, 'Unknown');
  setDrawerValue(profileDrawerAppUuid, source ? source.appUuid : null, 'Unknown');
  setDrawerValue(profileDrawerCrm, source ? source.crm : null, 'Unknown');
  setDrawerValue(profileDrawerLoyalty, source ? source.loyaltyStatus : null, 'Unknown');
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

/** Only identities that exist on the profile (non-empty value). */
function realIdentitiesForGraph(identities) {
  if (!Array.isArray(identities)) return [];
  return identities
    .filter((x) => x && !x.placeholder && String(x.value || '').trim())
    .slice(0, 16);
}

function identityStableKey(entry) {
  const ns = String(entry.namespace || '');
  const v = String(entry.value || '');
  return `${ns}:${v.slice(0, 160)}`;
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

  while (identityGraphSvg.firstChild) identityGraphSvg.removeChild(identityGraphSvg.firstChild);

  const rawIdentities = source && Array.isArray(source.identities) ? source.identities : [];
  const identities = realIdentitiesForGraph(rawIdentities);
  const first = source && source.firstName ? String(source.firstName).trim() : '';
  const last = source && source.lastName ? String(source.lastName).trim() : '';
  const displayName = source ? `${first} ${last}`.trim() || 'Profile' : 'Look up profile';
  const avatarSrc = profileDrawerAvatar ? profileDrawerAvatar.src : AVATAR_DEFAULT;

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
        const ijNew = !prevKeys.has(identityStableKey(identities[i])) || !prevKeys.has(identityStableKey(identities[j]));
        if (ijNew && prevKeys.size > 0) line.setAttribute('class', 'donate-ig-edge-new');
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
    if (isNew) line.setAttribute('class', 'donate-ig-edge-new');
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
    gScale.setAttribute('class', 'donate-ig-node-scale');
    if (isNew) gScale.classList.add('donate-ig-node-new');

    const rect = document.createElementNS(SVG_NS, 'rect');
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
  hubScale.setAttribute('class', 'donate-ig-hub-scale');

  const fo = document.createElementNS(SVG_NS, 'foreignObject');
  fo.setAttribute('x', '-40');
  fo.setAttribute('y', '-48');
  fo.setAttribute('width', '80');
  fo.setAttribute('height', '80');
  const wrap = document.createElementNS(XHTML_NS, 'div');
  wrap.setAttribute('xmlns', XHTML_NS);
  wrap.className = 'donate-ig-avatar-wrap';
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

  lastIdentityGraphKeys = currentKeys;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      identityGraphSvg.querySelectorAll('.donate-ig-node-new').forEach((el, i) => {
        el.style.transitionDelay = `${Math.min(i, 14) * 0.05}s`;
        el.classList.add('donate-ig-node-in');
      });
      identityGraphSvg.querySelectorAll('.donate-ig-edge-new').forEach((el, i) => {
        el.style.transitionDelay = `${0.04 + Math.min(i, 20) * 0.025}s`;
        el.classList.add('donate-ig-edge-in');
      });
      if (prevKeys.size === 0) {
        identityGraphSvg.querySelectorAll('.donate-ig-hub-scale').forEach((el) => el.classList.add('donate-ig-hub-in'));
      }
    });
  });
}

if (identityGraphZoomIn) {
  identityGraphZoomIn.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale + 0.12));
}
if (identityGraphZoomOut) {
  identityGraphZoomOut.addEventListener('click', () => setIdentityGraphZoom(identityGraphScale - 0.12));
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
    li.className = 'donate-profile-audience-exited';
    const label = row && row.name ? String(row.name) : 'Unnamed audience';
    li.textContent = `${label} (exited)`;
    profileDrawerAudiences.appendChild(li);
  });
}

async function fetchAudienceMembership(email) {
  if (!email) return null;
  try {
    const res = await fetch('/api/profile/audiences?email=' + encodeURIComponent(email));
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
  return d.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function eventThumbForName(eventName) {
  const key = String(eventName || '').toLowerCase().replace(/\s+/g, '');
  if (key.includes('message.feedback') || key === 'messagefeedback') {
    return { url: "url('images/message-feedback-icon.png')", variant: 'message-feedback' };
  }
  if (key.includes('message.tracking') || key === 'messagetracking') {
    return { url: "url('images/message-tracking-icon.png')", variant: 'message-tracking' };
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
    item.className = 'donate-profile-event-item';

    const thumb = document.createElement('div');
    thumb.className = 'donate-profile-event-thumb';
    const thumbSpec = eventThumbForName(ev && ev.eventName);
    thumb.style.backgroundImage = thumbSpec.url;
    if (thumbSpec.variant === 'message-feedback') {
      thumb.classList.add('donate-profile-event-thumb--message-feedback');
    }
    if (thumbSpec.variant === 'message-tracking') {
      thumb.classList.add('donate-profile-event-thumb--message-tracking');
    }

    const textWrap = document.createElement('div');
    const timeEl = document.createElement('span');
    timeEl.className = 'donate-profile-event-time';
    timeEl.textContent = formatEventTimelineDate(ev && ev.timestamp);

    const titleEl = document.createElement('strong');
    titleEl.className = 'donate-profile-event-title';
    titleEl.textContent = normalizeEventName(ev && ev.eventName);

    const subEl = document.createElement('span');
    subEl.className = 'donate-profile-event-sub';
    const evLabel = normalizeEventName(ev && ev.eventName).toUpperCase();
    subEl.textContent = `${evLabel} - WEB`;

    textWrap.appendChild(timeEl);
    textWrap.appendChild(titleEl);
    textWrap.appendChild(subEl);
    item.appendChild(thumb);
    item.appendChild(textWrap);
    profileDrawerEvents.appendChild(item);
  });
}

async function fetchRecentEvents(email) {
  if (!email) return [];
  try {
    const res = await fetch('/api/profile/events?email=' + encodeURIComponent(email));
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const events = Array.isArray(data.events) ? data.events : [];
    events.sort((a, b) => {
      const at = a && a.timestamp != null ? Number(a.timestamp) : 0;
      const bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
      return bt - at;
    });
    return events.slice(0, 5);
  } catch {
    return [];
  }
}

/**
 * Load consent + audiences + events and refresh the bottom drawer (and ECID hint).
 * @param {string} email
 * @param {{ updateDonateMessage?: boolean }} [options]
 * @returns {Promise<boolean>} true if consent request succeeded
 */
async function loadProfileDataForDrawer(email, options) {
  const opts = options || {};
  const emailTrim = String(email || '').trim();
  if (!emailTrim) return false;

  try {
    const res = await fetch('/api/profile/consent?email=' + encodeURIComponent(emailTrim));
    const data = await res.json();
    if (!res.ok) {
      if (opts.updateDonateMessage) setDonateMessage(data.error || 'Profile request failed.', 'error');
      return false;
    }
    if (typeof addEmail === 'function' && opts.updateDonateMessage) addEmail(emailTrim);

    const ecidVal =
      data.ecid == null ? '' : Array.isArray(data.ecid) ? (data.ecid[0] != null ? String(data.ecid[0]) : '') : String(data.ecid);
    if (infoEcid) infoEcid.textContent = ecidVal && ecidVal.length >= 10 ? ecidVal : '—';

    const canonicalEmail = data.email || emailTrim;
    const [audiences, events] = await Promise.all([
      fetchAudienceMembership(canonicalEmail),
      fetchRecentEvents(canonicalEmail),
    ]);

    const identities = mergeIdentitiesFromConsent(data, ecidVal, canonicalEmail);

    const prev = lastLookedUpProfile || {};
    lastLookedUpProfile = {
      ...prev,
      firstName: data.firstName || null,
      lastName: data.lastName || null,
      gender: data.gender != null && data.gender !== '' ? data.gender : null,
      email: canonicalEmail,
      ecid: ecidVal || null,
      marketingConsent: data.marketingConsent || null,
      preferredMarketingChannel: data.preferredMarketingChannel || null,
      dataCollection: data.dataCollection || null,
      lastModifiedAt: data.lastModifiedAt || null,
      identities,
      audiences,
      events,
    };

    updateProfileDrawer(lastLookedUpProfile);

    if (opts.updateDonateMessage) {
      setDonateMessage(
        data.found ? 'Profile found. ECID will be sent with the event if valid.' : 'No profile found; event can still be sent (no ECID).',
        'success',
      );
    }
    return true;
  } catch (err) {
    if (opts.updateDonateMessage) setDonateMessage(err.message || 'Network error', 'error');
    return false;
  }
}

function getEmail() {
  return (customerEmail && customerEmail.value) || '';
}

function setDonateMessage(text, type) {
  if (!donateMessage) return;
  donateMessage.textContent = text || '';
  donateMessage.className = 'donate-message' + (type ? ' ' + type : '');
  donateMessage.hidden = !text;
}

/** Today's date in local timezone as YYYY-MM-DD (no time). */
function donationDateLocalYYYYMMDD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Same parsing as Event generator `buildPublicPayloadFromForm` for donation amount. */
function parseDonationAmountForPayload() {
  const raw = donateAmountInput ? String(donateAmountInput.value || '').trim() : '';
  if (raw === '') return null;
  const n = Number(raw.replace(/,/g, ''));
  return Number.isFinite(n) && !Number.isNaN(n) ? n : raw;
}

function getSelectedGeneratorTarget() {
  const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
  return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
}

async function loadGeneratorTargets() {
  if (!generatorTargetSelect) return;
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
  } catch {
    generatorTargetSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Failed to load targets';
    generatorTargetSelect.appendChild(opt);
  }
}

function getFrequency() {
  return tabSingle && tabSingle.getAttribute('aria-selected') === 'true' ? 'single' : 'monthly';
}

function syncPresetPanels() {
  const single = getFrequency() === 'single';
  if (presetsMonthly) presetsMonthly.hidden = single;
  if (presetsSingle) presetsSingle.hidden = !single;
  document.querySelectorAll('.donate-preset.is-selected').forEach((b) => b.classList.remove('is-selected'));
}

function selectTab(isSingle) {
  if (tabMonthly) {
    tabMonthly.setAttribute('aria-selected', isSingle ? 'false' : 'true');
  }
  if (tabSingle) {
    tabSingle.setAttribute('aria-selected', isSingle ? 'true' : 'false');
  }
  syncPresetPanels();
}

tabMonthly &&
  tabMonthly.addEventListener('click', () => {
    selectTab(false);
  });
tabSingle &&
  tabSingle.addEventListener('click', () => {
    selectTab(true);
  });

document.querySelectorAll('.donate-preset').forEach((btn) => {
  btn.addEventListener('click', () => {
    const panel = btn.closest('.donate-presets');
    if (panel) {
      panel.querySelectorAll('.donate-preset').forEach((b) => b.classList.remove('is-selected'));
    }
    btn.classList.add('is-selected');
    const amt = btn.getAttribute('data-amount');
    if (donateAmountInput && amt != null) donateAmountInput.value = amt;
  });
});

if (donateAmountInput) {
  donateAmountInput.addEventListener('input', () => {
    document.querySelectorAll('.donate-preset.is-selected').forEach((b) => b.classList.remove('is-selected'));
  });
}

queryProfileBtn &&
  queryProfileBtn.addEventListener('click', async () => {
    const email = getEmail().trim();
    if (!email) {
      setDonateMessage('Enter a customer email first.', 'error');
      return;
    }
    setDonateMessage('Looking up profile…', '');
    await loadProfileDataForDrawer(email, { updateDonateMessage: true });
  });

donateNowBtn &&
  donateNowBtn.addEventListener('click', async () => {
    const emailForEvent = getEmail().trim();
    if (!emailForEvent) {
      setDonateMessage('Enter your customer email at the top before donating.', 'error');
      return;
    }
    const donationAmount = parseDonationAmountForPayload();
    if (donationAmount == null || donationAmount === '') {
      setDonateMessage('Enter a donation amount (choose a preset or type an amount).', 'error');
      return;
    }

    donateNowBtn.disabled = true;
    setDonateMessage('Sending event to AEP…', '');

    try {
      const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
      const ecid =
        ecidText && ecidText !== '—' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
      const target = getSelectedGeneratorTarget();
      const publicPayload = {
        donationAmount,
        donationDate: donationDateLocalYYYYMMDD(),
      };

      const body = {
        targetId: target ? target.id : undefined,
        email: emailForEvent,
        eventType: 'donation.made',
        viewName: 'Donate',
        viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
        channel: 'Web',
        public: publicPayload,
      };
      if (ecid) body.ecid = ecid;

      const res = await fetch('/api/events/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.error || data.message || 'Request failed.';
        let extra = '';
        if (data.streamingResponse) {
          extra = ' — ' + JSON.stringify(data.streamingResponse).replace(/\s+/g, ' ').slice(0, 160);
        } else if (data.edgeBody) {
          extra = ' — ' + String(data.edgeBody).replace(/\s+/g, ' ').slice(0, 160);
        }
        setDonateMessage(errMsg + extra, 'error');
        return;
      }
      if (typeof addEmail === 'function') addEmail(emailForEvent);
      const lastDonationAmount = typeof donationAmount === 'number' ? `£${donationAmount}` : donationAmount;
      const lastDonationDate = donationDateLocalYYYYMMDD();
      if (lastLookedUpProfile) {
        lastLookedUpProfile.lastDonationAmount = lastDonationAmount;
        lastLookedUpProfile.lastDonationDate = lastDonationDate;
        updateProfileDrawer(lastLookedUpProfile);
      } else {
        updateProfileDrawer({
          email: emailForEvent,
          lastDonationAmount,
          lastDonationDate,
        });
      }
      let idPart = '';
      if (data.transport === 'edge' && data.requestId) idPart = ' Request ID: ' + data.requestId;
      else if (data.eventId) idPart = ' Event ID: ' + data.eventId;
      setDonateMessage((data.message || 'Event sent to AEP.') + idPart, 'success');
    } catch (err) {
      setDonateMessage(err.message || 'Network error', 'error');
    } finally {
      donateNowBtn.disabled = false;
    }
  });

loadGeneratorTargets();
syncPresetPanels();

(function initDonatePageFlyoutSidebar() {
  const body = document.body;
  if (!body.classList.contains('donate-demo-page')) return;
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
    body.classList.toggle('donate-demo-page--nav-open', open);
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
    const over =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (over) {
      clearHideTimer();
      setFlyoutOpen(true);
      return;
    }
    if (body.classList.contains('donate-demo-page--nav-open')) {
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
    if (mq.matches) body.classList.remove('donate-demo-page--nav-open');
  });

  setFlyoutOpen(false);
})();

(function initDonateProfileHoverDrawer() {
  const body = document.body;
  if (!body.classList.contains('donate-demo-page')) return;
  if (!profileHoverZone || !profileDrawer) return;

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
    body.classList.toggle('donate-demo-page--profile-open', next);
    if (next && !drawerOpenState) {
      const email = getEmail().trim();
      if (email) loadProfileDataForDrawer(email, { updateDonateMessage: false });
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

  profileHoverZone.addEventListener('mouseenter', function () {
    clearCloseTimer();
    setDrawerOpen(true);
  });
  profileHoverZone.addEventListener('mouseleave', scheduleClose);
  profileDrawer.addEventListener('mouseenter', function () {
    clearCloseTimer();
    setDrawerOpen(true);
  });
  profileDrawer.addEventListener('mouseleave', scheduleClose);

  updateProfileDrawer(null);
  setDrawerOpen(false);
})();
