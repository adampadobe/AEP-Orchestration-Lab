/**
 * Recent identifiers for profile lookup (per identity namespace).
 * Emails, ECIDs, CRM IDs, etc. are stored in localStorage for datalist autocomplete.
 */

const STORAGE_KEY_LEGACY = 'aep-profile-viewer-recent-emails';
const STORAGE_KEY_MAP = 'aep-profile-viewer-recent-identifiers-v1';
const MAX_PER_NS = 20;

/** Padding from the right edge of the input treated as the "open suggestions" zone (datalist control). */
const LIST_ZONE_PX = 32;

function getRecentEmailsLegacy() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((e) => typeof e === 'string' && e.trim().length > 0) : [];
  } catch {
    return [];
  }
}

function sanitizeMap(o) {
  const out = {};
  if (!o || typeof o !== 'object' || Array.isArray(o)) return { email: [] };
  for (const k of Object.keys(o)) {
    if (!Array.isArray(o[k])) continue;
    out[k] = o[k]
      .filter((x) => typeof x === 'string' && x.trim().length > 0)
      .slice(0, MAX_PER_NS);
  }
  if (!out.email) out.email = [];
  return out;
}

function loadMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MAP);
    if (raw) {
      const o = JSON.parse(raw);
      return sanitizeMap(o);
    }
  } catch {
    // fall through to migrate
  }
  const legacy = getRecentEmailsLegacy();
  const map = { email: legacy.slice(0, MAX_PER_NS) };
  saveMap(map);
  return map;
}

function saveMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY_MAP, JSON.stringify(map));
  } catch {
    // quota exceeded, ignore
  }
}

/** Recent values for a namespace (newest first). */
function getRecentForNamespace(namespace) {
  const ns = (namespace || 'email').trim().toLowerCase();
  const map = loadMap();
  const list = map[ns];
  return Array.isArray(list) ? list.slice() : [];
}

/** @deprecated use getRecentForNamespace('email') */
function getRecentEmails() {
  return getRecentForNamespace('email');
}

/**
 * Remember a resolved identifier for autocomplete, scoped by namespace.
 * @param {string} value
 * @param {string} [namespace='email'] — identityNs value: email, ecid, crmId, loyaltyId, phone
 */
function addRecentIdentifier(value, namespace) {
  const ns = (namespace || 'email').trim().toLowerCase();
  let v = (value || '').trim();
  if (!v) return;
  if (ns === 'email') {
    v = v.toLowerCase();
    if (!v.includes('@')) return;
  } else if (ns === 'ecid') {
    if (v.length < 4) return;
  }

  const map = loadMap();
  if (!map[ns]) map[ns] = [];
  const norm = ns === 'email' ? v.toLowerCase() : v;
  let list = map[ns].filter((x) => (ns === 'email' ? x.toLowerCase() : x) !== norm);
  list.unshift(ns === 'email' ? norm : v);
  list = list.slice(0, MAX_PER_NS);
  map[ns] = list;
  saveMap(map);
}

/** Add email to cache (moves to front if already present). */
function addEmail(email) {
  addRecentIdentifier(email, 'email');
}

/**
 * Attach a datalist to the identifier input. Options follow the current #identityNs when present.
 * Browsers filter datalist options by the current value; we briefly clear the field (restore on blur)
 * when opening suggestions via the list zone or Alt+ArrowDown so all recents show.
 */
function attachEmailDatalist(inputId, datalistId = 'recentEmails', namespaceSelectId = 'identityNs') {
  const input = document.getElementById(inputId);
  if (!input) return;
  let list = document.getElementById(datalistId);
  if (!list) {
    list = document.createElement('datalist');
    list.id = datalistId;
    document.body.appendChild(list);
  }
  input.setAttribute('list', datalistId);

  function getNs() {
    const sel = namespaceSelectId ? document.getElementById(namespaceSelectId) : null;
    return sel && sel.value ? String(sel.value).trim().toLowerCase() : 'email';
  }

  function refresh() {
    list.innerHTML = '';
    getRecentForNamespace(getNs()).forEach((val) => {
      const opt = document.createElement('option');
      opt.value = val;
      list.appendChild(opt);
    });
  }

  function hasOtherCachedThan(currentVal) {
    const ns = getNs();
    const lv = ns === 'email' ? currentVal.trim().toLowerCase() : currentVal.trim();
    const rec = getRecentForNamespace(ns);
    if (rec.length === 0) return false;
    return rec.some((e) => (ns === 'email' ? e.toLowerCase() : e) !== lv);
  }

  /** Whether the stash trick applies for this namespace + value (was @-only for email). */
  function canUseStashHelpers(val) {
    const v = val.trim();
    if (!v) return false;
    const ns = getNs();
    if (ns === 'email') return v.includes('@');
    return v.length >= 3;
  }

  function stashAndClearForFullList() {
    const v = input.value.trim();
    if (!canUseStashHelpers(v)) return;
    if (!hasOtherCachedThan(v)) return;
    input.dataset.emailDatalistStash = v;
    input.value = '';
    refresh();
  }

  function clientXInListZone(clientX) {
    const r = input.getBoundingClientRect();
    return clientX >= r.right - LIST_ZONE_PX;
  }

  refresh();

  input.addEventListener('focus', refresh);

  const nsSel = namespaceSelectId ? document.getElementById(namespaceSelectId) : null;
  if (nsSel) nsSel.addEventListener('change', refresh);

  input.addEventListener('mousedown', (e) => {
    if (e.target !== input) return;
    const v = input.value.trim();
    if (!canUseStashHelpers(v)) return;
    if (!clientXInListZone(e.clientX)) return;
    stashAndClearForFullList();
  });

  input.addEventListener(
    'touchstart',
    (e) => {
      if (e.target !== input || !e.touches.length) return;
      const v = input.value.trim();
      if (!canUseStashHelpers(v)) return;
      if (!clientXInListZone(e.touches[0].clientX)) return;
      stashAndClearForFullList();
    },
    { passive: true },
  );

  input.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'Down')) {
      const v = input.value.trim();
      if (!canUseStashHelpers(v)) return;
      stashAndClearForFullList();
      e.preventDefault();
    }
  });

  let blurRestoreTimer;
  input.addEventListener('blur', () => {
    clearTimeout(blurRestoreTimer);
    blurRestoreTimer = setTimeout(() => {
      const stash = input.dataset.emailDatalistStash;
      if (stash == null) return;
      if (input.value.trim() === '') {
        input.value = stash;
      }
      delete input.dataset.emailDatalistStash;
    }, 200);
  });
}
