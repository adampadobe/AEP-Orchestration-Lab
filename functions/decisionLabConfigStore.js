/**
 * Persist Decisioning lab (Edge) setup per AEP sandbox — Launch URL, datastream, placement fragments.
 * Same access pattern as eventConfigStore.js (shared doc + per-user doc).
 */

const admin = require('firebase-admin');

const COLLECTION = 'decisionLabConfig';
const USER_COLLECTION = 'decisionLabConfigUser';

const DEFAULT_PLACEMENTS = [
  { key: 'topRibbon', fragment: 'TopRibbon', label: 'Top ribbon' },
  { key: 'hero', fragment: 'hero-banner', label: 'Hero banner' },
  { key: 'contentCard', fragment: 'ContentCardContainer', label: 'Content card' },
];

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(sandbox) {
  const s = String(sandbox || 'default').trim() || 'default';
  return s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 700);
}

function userDocId(uid, sandbox) {
  const u = String(uid || '').trim().slice(0, 128);
  const d = docId(sandbox);
  return `${u}__${d}`.slice(0, 800);
}

function trim(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

/** True when all three Edge lab connection fields are non-empty. */
function hasCoreEdgeConfig(rec) {
  if (!rec || typeof rec !== 'object') return false;
  return !!(trim(rec.datastreamId, 256) && trim(rec.launchScriptUrl, 512) && trim(rec.targetPageUrl, 512));
}

/**
 * Merge a string field from a PATCH: undefined keeps previous.
 * Empty string does NOT wipe a previously saved value (avoids accidental blank saves clearing Firebase).
 */
function mergeCoreString(patchVal, prevVal, max) {
  if (patchVal === undefined) return trim(prevVal, max);
  const next = trim(patchVal, max);
  const prevT = trim(prevVal, max);
  if (next === '' && prevT !== '') return prevT;
  return next;
}

const PLACEMENT_TYPES = new Set(['exd', 'contentCard']);

function inferDefaultPlacementType(fragment) {
  // Match the naming convention the sample Race-for-Life + content-card
  // demos already use so existing sandboxes keep their semantics without
  // having to re-save every placement.
  return /content\s*card|message\s*feed|cardcontainer/i.test(String(fragment || ''))
    ? 'contentCard'
    : 'exd';
}

function sanitizePlacements(raw) {
  if (!raw) return DEFAULT_PLACEMENTS.slice();
  if (!Array.isArray(raw)) return DEFAULT_PLACEMENTS.slice();
  const out = [];
  for (const p of raw.slice(0, 8)) {
    if (!p || typeof p !== 'object') continue;
    const key = trim(p.key, 64).replace(/[^a-zA-Z0-9_-]/g, '') || `slot${out.length}`;
    const fragment = trim(p.fragment, 128);
    const label = trim(p.label, 128);
    if (!fragment) continue;
    const type = PLACEMENT_TYPES.has(p.type) ? p.type : inferDefaultPlacementType(fragment);
    out.push({ key, fragment, label: label || fragment, type });
  }
  return out.length ? out : DEFAULT_PLACEMENTS.slice();
}

const JUSTIFY_VALUES = new Set(['flex-start', 'center', 'flex-end']);
const LAYOUT_MODES = new Set(['overlay', 'half', 'below']);
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const DEFAULT_SURFACE_STYLE = {
  layoutMode: 'overlay',
  blockY: 'flex-end',
  titleH: 'center', titleV: 'flex-start',
  descH: 'center', descV: 'center',
  ctaH: 'center', ctaV: 'flex-end',
  titleColor: '#e6e9ef',
  descColor: '#c5c9d3',
  ctaBg: '#f0f2f6',
  ctaText: '#1a1d23',
  noImageBg: '',
};

function sanitizeSurfaceStyleEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const pickJustify = (v, fallback) => (JUSTIFY_VALUES.has(v) ? v : fallback);
  const pickHex = (v, fallback) => (typeof v === 'string' && HEX_RE.test(v.trim()) ? v.trim() : fallback);
  const rawNoImg = raw.noImageBg;
  const noImageBg =
    rawNoImg == null || String(rawNoImg).trim() === ''
      ? ''
      : typeof rawNoImg === 'string' && HEX_RE.test(rawNoImg.trim())
        ? rawNoImg.trim()
        : '';
  const out = {
    layoutMode: LAYOUT_MODES.has(raw.layoutMode) ? raw.layoutMode : DEFAULT_SURFACE_STYLE.layoutMode,
    blockY: pickJustify(raw.blockY, DEFAULT_SURFACE_STYLE.blockY),
    titleH: pickJustify(raw.titleH, DEFAULT_SURFACE_STYLE.titleH),
    titleV: pickJustify(raw.titleV, DEFAULT_SURFACE_STYLE.titleV),
    descH: pickJustify(raw.descH, DEFAULT_SURFACE_STYLE.descH),
    descV: pickJustify(raw.descV, DEFAULT_SURFACE_STYLE.descV),
    ctaH: pickJustify(raw.ctaH, DEFAULT_SURFACE_STYLE.ctaH),
    ctaV: pickJustify(raw.ctaV, DEFAULT_SURFACE_STYLE.ctaV),
    titleColor: pickHex(raw.titleColor, DEFAULT_SURFACE_STYLE.titleColor),
    descColor: pickHex(raw.descColor, DEFAULT_SURFACE_STYLE.descColor),
    ctaBg: pickHex(raw.ctaBg, DEFAULT_SURFACE_STYLE.ctaBg),
    ctaText: pickHex(raw.ctaText, DEFAULT_SURFACE_STYLE.ctaText),
    noImageBg,
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };
  return out;
}

function sanitizeSurfaceStyles(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const MAX_ENTRIES = 16;
  const out = {};
  let count = 0;
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    if (count >= MAX_ENTRIES) break;
    const key = String(rawKey || '').trim().replace(/[^a-zA-Z0-9_\-#/.:]/g, '').slice(0, 128);
    if (!key) continue;
    const entry = sanitizeSurfaceStyleEntry(rawVal);
    if (!entry) continue;
    out[key] = entry;
    count++;
  }
  return out;
}

/**
 * surfaceOverrides is an object keyed by surface fragment (e.g. 'TopRibbon',
 * 'hero-banner') with `{ html, updatedAt }`. Limits: 16 surfaces, 50KiB
 * HTML each. Keys are sanitised the same way as placement fragments.
 */
function sanitizeSurfaceOverrides(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const MAX_ENTRIES = 16;
  const MAX_HTML = 50 * 1024;
  const out = {};
  let count = 0;
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    if (count >= MAX_ENTRIES) break;
    const key = String(rawKey || '').trim().replace(/[^a-zA-Z0-9_\-#/.:]/g, '').slice(0, 128);
    if (!key) continue;
    if (!rawVal || typeof rawVal !== 'object') continue;
    const html = typeof rawVal.html === 'string' ? rawVal.html.slice(0, MAX_HTML) : '';
    if (!html.trim()) continue;
    out[key] = {
      html,
      updatedAt: rawVal.updatedAt || new Date().toISOString(),
    };
    count++;
  }
  return out;
}

function sanitizeMode(m) {
  const s = String(m || '').trim().toLowerCase();
  if (s === 'decisionscopes' || s === 'decision_scopes') return 'decisionScopes';
  if (s === 'surfaces') return 'surfaces';
  return 'surfaces';
}

async function getDecisionLabConfig(sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return null;
  const snap = await getDb().collection(COLLECTION).doc(docId(name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveDecisionLabConfig(sandbox, patch) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');

  const ref = getDb().collection(COLLECTION).doc(docId(name));

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data() ? snap.data() : {};

    const merged = {
      sandbox: name,
      launchScriptUrl: mergeCoreString(
        patch.launchScriptUrl,
        prev.launchScriptUrl,
        512,
      ),
      datastreamId: mergeCoreString(
        patch.datastreamId,
        prev.datastreamId,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      edgePersonalizationMode: sanitizeMode(
        patch.edgePersonalizationMode !== undefined
          ? patch.edgePersonalizationMode
          : prev.edgePersonalizationMode,
      ),
      tagsPropertyRef: trim(
        patch.tagsPropertyRef !== undefined ? patch.tagsPropertyRef : prev.tagsPropertyRef,
        256,
      ),
      targetPageUrl: mergeCoreString(
        patch.targetPageUrl,
        prev.targetPageUrl,
        512,
      ),
      placements: sanitizePlacements(
        patch.placements !== undefined ? patch.placements : prev.placements,
      ),
      surfaceOverrides: sanitizeSurfaceOverrides(
        patch.surfaceOverrides !== undefined ? patch.surfaceOverrides : prev.surfaceOverrides,
      ),
      surfaceStyles: sanitizeSurfaceStyles(
        patch.surfaceStyles !== undefined ? patch.surfaceStyles : prev.surfaceStyles,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  return after.exists ? { id: after.id, ...after.data() } : null;
}

async function getUserDecisionLabConfig(uid, sandbox) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name || !u) return null;
  const snap = await getDb().collection(USER_COLLECTION).doc(userDocId(u, name)).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data && typeof data === 'object' ? { id: snap.id, ...data } : null;
}

async function saveUserDecisionLabConfig(uid, sandbox, patch) {
  const name = String(sandbox || '').trim();
  const u = String(uid || '').trim();
  if (!name) throw new Error('sandbox is required');
  if (!u) throw new Error('uid is required');

  const ref = getDb().collection(USER_COLLECTION).doc(userDocId(u, name));

  // First-save seed: if there's no prior user-scoped record, inherit
  // the shared sandbox record so a partial patch doesn't create a
  // user-scoped doc with blanks that then override the shared one.
  const sharedFallback = await getDecisionLabConfig(name);

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists && snap.data()
      ? snap.data()
      : (sharedFallback || {});

    const merged = {
      uid: u,
      sandbox: name,
      launchScriptUrl: mergeCoreString(
        patch.launchScriptUrl,
        prev.launchScriptUrl,
        512,
      ),
      datastreamId: mergeCoreString(
        patch.datastreamId,
        prev.datastreamId,
        256,
      ),
      schemaTitle: trim(
        patch.schemaTitle !== undefined ? patch.schemaTitle : prev.schemaTitle,
        256,
      ),
      datasetName: trim(
        patch.datasetName !== undefined ? patch.datasetName : prev.datasetName,
        256,
      ),
      edgePersonalizationMode: sanitizeMode(
        patch.edgePersonalizationMode !== undefined
          ? patch.edgePersonalizationMode
          : prev.edgePersonalizationMode,
      ),
      tagsPropertyRef: trim(
        patch.tagsPropertyRef !== undefined ? patch.tagsPropertyRef : prev.tagsPropertyRef,
        256,
      ),
      targetPageUrl: mergeCoreString(
        patch.targetPageUrl,
        prev.targetPageUrl,
        512,
      ),
      placements: sanitizePlacements(
        patch.placements !== undefined ? patch.placements : prev.placements,
      ),
      surfaceOverrides: sanitizeSurfaceOverrides(
        patch.surfaceOverrides !== undefined ? patch.surfaceOverrides : prev.surfaceOverrides,
      ),
      surfaceStyles: sanitizeSurfaceStyles(
        patch.surfaceStyles !== undefined ? patch.surfaceStyles : prev.surfaceStyles,
      ),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    tx.set(ref, merged, { merge: true });
  });

  const after = await ref.get();
  const savedUser = after.exists ? { id: after.id, ...after.data() } : null;

  // Mirror the user's saved config to the shared sandbox doc so a new
  // anonymous-auth uid (different browser / cleared storage / incognito)
  // has a working baseline to fall back to. Best-effort — if the
  // shared write fails we still return the user record.
  if (savedUser) {
    try {
      await saveDecisionLabConfig(name, {
        launchScriptUrl: savedUser.launchScriptUrl,
        datastreamId: savedUser.datastreamId,
        schemaTitle: savedUser.schemaTitle,
        datasetName: savedUser.datasetName,
        edgePersonalizationMode: savedUser.edgePersonalizationMode,
        tagsPropertyRef: savedUser.tagsPropertyRef,
        targetPageUrl: savedUser.targetPageUrl,
        placements: savedUser.placements,
        surfaceOverrides: savedUser.surfaceOverrides,
        surfaceStyles: savedUser.surfaceStyles,
      });
    } catch (e) {
      console.warn('[decisionLabConfigStore] shared mirror failed', String((e && e.message) || e));
    }
  }
  return savedUser;
}

/**
 * If a per-user doc exists but lost core Edge fields (e.g. accidental blank save),
 * still surface the shared sandbox baseline for datastream / Launch / target so the lab recovers.
 */
function mergeUserWithSharedForRead(userRec, sharedRec) {
  if (!userRec) return sharedRec;
  if (hasCoreEdgeConfig(userRec)) return userRec;
  if (!sharedRec || !hasCoreEdgeConfig(sharedRec)) return userRec;
  return {
    ...sharedRec,
    ...userRec,
    datastreamId: trim(userRec.datastreamId, 256) || trim(sharedRec.datastreamId, 256),
    launchScriptUrl: trim(userRec.launchScriptUrl, 512) || trim(sharedRec.launchScriptUrl, 512),
    targetPageUrl: trim(userRec.targetPageUrl, 512) || trim(sharedRec.targetPageUrl, 512),
  };
}

async function getEffectiveDecisionLabConfig(sandbox, uid) {
  const u = String(uid || '').trim();
  const sharedRec = await getDecisionLabConfig(sandbox);
  if (u) {
    const userRec = await getUserDecisionLabConfig(u, sandbox);
    return mergeUserWithSharedForRead(userRec, sharedRec);
  }
  return sharedRec;
}

async function saveEffectiveDecisionLabConfig(sandbox, uid, patch) {
  const u = String(uid || '').trim();
  if (u) return saveUserDecisionLabConfig(u, sandbox, patch);
  return saveDecisionLabConfig(sandbox, patch);
}

module.exports = {
  COLLECTION,
  USER_COLLECTION,
  DEFAULT_PLACEMENTS,
  getDecisionLabConfig,
  saveDecisionLabConfig,
  getUserDecisionLabConfig,
  saveUserDecisionLabConfig,
  getEffectiveDecisionLabConfig,
  saveEffectiveDecisionLabConfig,
  sanitizePlacements,
  docId,
};
