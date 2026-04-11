/**
 * Per-user, per-AEP-sandbox lab preferences (localStorage mirror) in Firestore.
 * Access only via Cloud Functions + Firebase Auth ID token (anonymous OK).
 */

const admin = require('firebase-admin');

const COLLECTION = 'labUserSandboxData';

const MAX_KEY_LEN = 120;
const MAX_VAL_CHARS = 450000;
const MAX_TOTAL_KEYS = 40;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function docId(uid, sandbox) {
  const u = String(uid || '').trim().slice(0, 128);
  const s = String(sandbox || 'default').trim() || 'default';
  const safe = s.replace(/[/\s.#$\[\]]/g, '_').slice(0, 200);
  const id = `${u}__${safe}`;
  return id.slice(0, 800);
}

function sanitizeKeys(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return {};
  const out = {};
  let n = 0;
  for (const k of Object.keys(incoming)) {
    if (n >= MAX_TOTAL_KEYS) break;
    const key = String(k).trim().slice(0, MAX_KEY_LEN);
    if (!key) continue;
    const v = incoming[k];
    if (v === null || v === undefined) {
      out[key] = null;
      n += 1;
      continue;
    }
    if (typeof v !== 'string') continue;
    out[key] = v.slice(0, MAX_VAL_CHARS);
    n += 1;
  }
  return out;
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

async function getLabKeys(uid, sandbox) {
  const name = String(sandbox || '').trim();
  if (!name) return {};
  const ref = getDb().collection(COLLECTION).doc(docId(uid, name));
  const snap = await ref.get();
  if (!snap.exists) return {};
  const data = snap.data();
  const keys = data && data.keys && typeof data.keys === 'object' ? data.keys : {};
  const out = {};
  for (const k of Object.keys(keys)) {
    const kk = String(k).trim().slice(0, MAX_KEY_LEN);
    if (!kk) continue;
    const v = keys[k];
    if (typeof v === 'string') out[kk] = v.slice(0, MAX_VAL_CHARS);
  }
  return out;
}

async function mergeLabKeys(uid, sandbox, patch, options) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const replace = options && options.replace;
  const clean = sanitizeKeys(patch);
  const ref = getDb().collection(COLLECTION).doc(docId(uid, name));

  await getDb().runTransaction(async (tx) => {
    let keys = {};
    if (replace) {
      for (const k of Object.keys(clean)) {
        if (clean[k] === null) continue;
        if (typeof clean[k] === 'string') keys[k] = clean[k].slice(0, MAX_VAL_CHARS);
      }
    } else {
      const snap = await tx.get(ref);
      const prev = snap.exists && snap.data() && snap.data().keys && typeof snap.data().keys === 'object'
        ? { ...snap.data().keys }
        : {};
      for (const k of Object.keys(clean)) {
        if (clean[k] === null) delete prev[k];
        else prev[k] = clean[k];
      }
      let n = 0;
      for (const k of Object.keys(prev)) {
        if (n >= MAX_TOTAL_KEYS) break;
        if (typeof prev[k] === 'string') {
          keys[k] = prev[k].slice(0, MAX_VAL_CHARS);
          n += 1;
        }
      }
    }
    tx.set(
      ref,
      {
        uid: String(uid).trim().slice(0, 128),
        sandbox: name,
        keys,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  return getLabKeys(uid, name);
}

module.exports = {
  COLLECTION,
  docId,
  getLabKeys,
  mergeLabKeys,
  verifyIdTokenFromRequest,
};
