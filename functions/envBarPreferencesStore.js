/**
 * Per-user env bar preferences (sandbox, Tags, BC, generator targets) in Firestore.
 * Access only via Cloud Functions + Firebase Auth ID token (anonymous OK).
 */

const admin = require('firebase-admin');

const COLLECTION = 'labUserEnvBarPreferences';

const MAX_SANDBOX_LEN = 120;
const MAX_SANDBOX_KEYS = 40;
const MAX_STRING_LEN = 8000;
const MAX_NESTED_KEYS = 24;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function sanitizeString(raw, maxLen) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().slice(0, maxLen || MAX_STRING_LEN);
}

function sanitizeSandboxKey(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return '';
  return v.replace(/[^a-z0-9_-]/g, '_').slice(0, MAX_SANDBOX_LEN);
}

function sanitizeNestedMap(incoming, maxKeys) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(incoming)) {
    if (n >= (maxKeys || MAX_NESTED_KEYS)) break;
    const sk = sanitizeSandboxKey(k);
    if (!sk) continue;
    const entry = incoming[k];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const clean = {};
    for (const fk of Object.keys(entry)) {
      const field = String(fk).trim().slice(0, 64);
      if (!field) continue;
      const val = entry[fk];
      if (val === null || val === undefined) continue;
      if (typeof val === 'string') clean[field] = val.slice(0, MAX_STRING_LEN);
      else if (typeof val === 'number' || typeof val === 'boolean') clean[field] = val;
    }
    if (Object.keys(clean).length) {
      out[sk] = clean;
      n += 1;
    }
  }
  return out;
}

function sanitizeTargetMap(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(incoming)) {
    if (n >= MAX_SANDBOX_KEYS) break;
    const sk = sanitizeSandboxKey(k);
    if (!sk) continue;
    out[sk] = sanitizeString(incoming[k], 256);
    n += 1;
  }
  return out;
}

function emptyPreferences() {
  return {
    selectedSandbox: '',
    tagsBySandbox: {},
    bcBySandbox: {},
    generatorTargetBySandbox: {},
  };
}

function sanitizePreferences(body) {
  const src = body && typeof body === 'object' ? body : {};
  return {
    selectedSandbox: sanitizeString(src.selectedSandbox, MAX_SANDBOX_LEN),
    tagsBySandbox: sanitizeNestedMap(src.tagsBySandbox, MAX_SANDBOX_KEYS),
    bcBySandbox: sanitizeNestedMap(src.bcBySandbox, MAX_SANDBOX_KEYS),
    generatorTargetBySandbox: sanitizeTargetMap(src.generatorTargetBySandbox),
  };
}

/**
 * @param {import('firebase-admin').auth.Auth} [_auth]
 */
async function verifyIdTokenFromRequest(req, _auth) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)/i.exec(h);
  if (!m) return null;
  try {
    if (!admin.apps.length) admin.initializeApp();
    const dec = await admin.auth().verifyIdToken(m[1]);
    return dec.uid || null;
  } catch {
    return null;
  }
}

async function getPreferences(uid) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) return emptyPreferences();
  const ref = getDb().collection(COLLECTION).doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return emptyPreferences();
  return sanitizePreferences(snap.data() || {});
}

async function mergePreferences(uid, patch) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');
  const clean = sanitizePreferences(patch);
  const ref = getDb().collection(COLLECTION).doc(userId);

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? sanitizePreferences(snap.data() || {}) : emptyPreferences();

    if (clean.selectedSandbox) prev.selectedSandbox = clean.selectedSandbox;

    for (const sk of Object.keys(clean.tagsBySandbox)) {
      prev.tagsBySandbox[sk] = Object.assign({}, prev.tagsBySandbox[sk] || {}, clean.tagsBySandbox[sk]);
    }
    for (const sk of Object.keys(clean.bcBySandbox)) {
      prev.bcBySandbox[sk] = Object.assign({}, prev.bcBySandbox[sk] || {}, clean.bcBySandbox[sk]);
    }
    for (const sk of Object.keys(clean.generatorTargetBySandbox)) {
      const v = clean.generatorTargetBySandbox[sk];
      if (v) prev.generatorTargetBySandbox[sk] = v;
      else delete prev.generatorTargetBySandbox[sk];
    }

    tx.set(
      ref,
      {
        uid: userId,
        selectedSandbox: prev.selectedSandbox,
        tagsBySandbox: prev.tagsBySandbox,
        bcBySandbox: prev.bcBySandbox,
        generatorTargetBySandbox: prev.generatorTargetBySandbox,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return getPreferences(userId);
}

module.exports = {
  COLLECTION,
  emptyPreferences,
  sanitizePreferences,
  getPreferences,
  mergePreferences,
  verifyIdTokenFromRequest,
};
