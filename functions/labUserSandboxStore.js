/**
 * Per-user, per-scope lab preferences (sandbox/workspace localStorage mirror) in Firestore.
 * Access only via Cloud Functions + Firebase Auth ID token (anonymous OK).
 */

const admin = require('firebase-admin');

const COLLECTION = 'labUserSandboxData';
const WORKSPACE_PROFILE_COLLECTION = 'labWorkspaceAccessProfiles';

const MAX_KEY_LEN = 120;
const MAX_VAL_CHARS = 450000;
const MAX_TOTAL_KEYS = 40;
const LIVE_ACTIVITY_EXECUTION_KEY = 'aepLaExecutionFieldsV1';
const LIVE_ACTIVITY_HISTORY_LIMIT = 12;
const LIVE_ACTIVITY_SAFE_ID = /^[A-Za-z0-9._:-]+$/;

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
  const safe = s.replace(/[:/\s.#$\[\]]/g, '_').slice(0, 200);
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
  const claims = await verifyIdTokenClaimsFromRequest(req, _auth);
  return claims && claims.uid ? claims.uid : null;
}

/**
 * Verify Bearer ID token and return uid plus sign-in metadata (email, anonymous flag).
 *
 * @param {import('firebase-functions/v2/https').Request} req
 * @param {import('firebase-admin').auth.Auth} [_auth]
 * @returns {Promise<{ uid: string, email: string | null, name: string | null, isAnonymous: boolean, signInProvider: string | null } | null>}
 */
async function verifyIdTokenClaimsFromRequest(req, _auth) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(\S+)/i.exec(h);
  if (!m) return null;
  try {
    if (!admin.apps.length) admin.initializeApp();
    const dec = await admin.auth().verifyIdToken(m[1]);
    const uid = dec.uid || null;
    if (!uid) return null;
    const signInProvider = dec.firebase && dec.firebase.sign_in_provider
      ? String(dec.firebase.sign_in_provider)
      : null;
    const email = dec.email ? String(dec.email).trim().toLowerCase() : null;
    const name = dec.name ? String(dec.name).trim() : null;
    const isAnonymous = signInProvider === 'anonymous' || (!email && signInProvider !== 'password' && signInProvider !== 'custom');
    return { uid, email, name, isAnonymous, signInProvider };
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

function normalizeLiveActivityExecutionFields(value) {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const cleanId = (input, maxLength) => {
    const text = String(input || '').trim().slice(0, maxLength);
    return text && LIVE_ACTIVITY_SAFE_ID.test(text) ? text : '';
  };
  const cleanList = (input, maxLength) => {
    const seen = new Set();
    return (Array.isArray(input) ? input : [])
      .map((entry) => cleanId(entry, maxLength))
      .filter((entry) => {
        if (!entry || seen.has(entry)) return false;
        seen.add(entry);
        return true;
      })
      .slice(0, LIVE_ACTIVITY_HISTORY_LIMIT);
  };
  const event = String(source.event || '').trim().toLowerCase();
  return {
    campaignId: cleanId(source.campaignId, 160),
    userId: String(source.userId || '').trim().slice(0, 80),
    liveActivityId: cleanId(source.liveActivityId, 256),
    event: ['start', 'update', 'end'].includes(event) ? event : '',
    campaignIds: cleanList(source.campaignIds, 160),
    liveActivityIds: cleanList(source.liveActivityIds, 256),
  };
}

function addRecentLiveActivityValue(list, value) {
  if (!value) return list;
  return [value, ...list.filter((entry) => entry !== value)].slice(0, LIVE_ACTIVITY_HISTORY_LIMIT);
}

async function getLiveActivityExecutionFields(uid, sandbox) {
  const sandboxName = String(sandbox || '').trim().toLowerCase();
  if (!sandboxName) throw new Error('sandbox is required');
  const keys = await getLabKeys(uid, `sandbox:${sandboxName}`);
  return normalizeLiveActivityExecutionFields(keys[LIVE_ACTIVITY_EXECUTION_KEY]);
}

async function mergeLiveActivityExecutionFields(uid, sandbox, patch) {
  const sandboxName = String(sandbox || '').trim().toLowerCase();
  if (!sandboxName) throw new Error('sandbox is required');
  const input = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const requested = normalizeLiveActivityExecutionFields(input);
  const hasCampaignId = Object.prototype.hasOwnProperty.call(input, 'campaignId');
  const hasLiveActivityId = Object.prototype.hasOwnProperty.call(input, 'liveActivityId');
  if (hasCampaignId && String(input.campaignId || '').trim() && !requested.campaignId) {
    throw Object.assign(new Error('campaign ID contains unsupported characters or is too long'), { status: 400 });
  }
  if (hasLiveActivityId && String(input.liveActivityId || '').trim() && !requested.liveActivityId) {
    throw Object.assign(new Error('Live Activity ID contains unsupported characters or is too long'), { status: 400 });
  }

  const storageScope = `sandbox:${sandboxName}`;
  const ref = getDb().collection(COLLECTION).doc(docId(uid, storageScope));
  let merged = null;
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists && snap.data() ? snap.data() : {};
    const keys = data.keys && typeof data.keys === 'object' ? { ...data.keys } : {};
    const current = normalizeLiveActivityExecutionFields(keys[LIVE_ACTIVITY_EXECUTION_KEY]);
    merged = {
      ...current,
      ...(hasCampaignId ? { campaignId: requested.campaignId } : {}),
      ...(hasLiveActivityId ? { liveActivityId: requested.liveActivityId } : {}),
    };
    if (hasCampaignId && requested.campaignId) {
      merged.campaignIds = addRecentLiveActivityValue(current.campaignIds, requested.campaignId);
    }
    if (hasLiveActivityId && requested.liveActivityId) {
      merged.liveActivityIds = addRecentLiveActivityValue(current.liveActivityIds, requested.liveActivityId);
    }
    keys[LIVE_ACTIVITY_EXECUTION_KEY] = JSON.stringify(merged);
    tx.set(ref, {
      uid: String(uid).trim().slice(0, 128),
      sandbox: storageScope,
      keys,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  return merged;
}

function sanitizeWorkspaceProfile(profile) {
  const body = profile && typeof profile === 'object' ? profile : {};
  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const lastName = String(body.lastName || '').trim().slice(0, 80);
  const adobeEmail = String(body.adobeEmail || '').trim().toLowerCase().slice(0, 160);
  const workspaceName = String(body.workspaceName || '').trim().slice(0, 120);
  const workspaceSlug = String(body.workspaceSlug || '').trim().slice(0, 80);
  return { firstName, lastName, adobeEmail, workspaceName, workspaceSlug };
}

function isValidAdobeEmail(email) {
  const v = String(email || '').trim().toLowerCase();
  if (!v || v.length < 6 || v.length > 160) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

async function getWorkspaceProfile(uid) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) return null;
  const ref = getDb().collection(WORKSPACE_PROFILE_COLLECTION).doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  return {
    uid: userId,
    firstName: String(data.firstName || ''),
    lastName: String(data.lastName || ''),
    adobeEmail: String(data.adobeEmail || ''),
    workspaceName: String(data.workspaceName || ''),
    workspaceSlug: String(data.workspaceSlug || ''),
    updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function'
      ? data.updatedAt.toDate().toISOString()
      : null,
    createdAt: data.createdAt && typeof data.createdAt.toDate === 'function'
      ? data.createdAt.toDate().toISOString()
      : null,
  };
}

async function upsertWorkspaceProfile(uid, profile) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) throw new Error('uid is required');
  const clean = sanitizeWorkspaceProfile(profile);
  if (!clean.firstName) throw new Error('firstName is required');
  if (!clean.lastName) throw new Error('lastName is required');
  if (!isValidAdobeEmail(clean.adobeEmail)) throw new Error('adobeEmail is invalid');

  const ref = getDb().collection(WORKSPACE_PROFILE_COLLECTION).doc(userId);
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    tx.set(ref, {
      uid: userId,
      firstName: clean.firstName,
      lastName: clean.lastName,
      adobeEmail: clean.adobeEmail,
      workspaceName: clean.workspaceName,
      workspaceSlug: clean.workspaceSlug,
      createdAt: snap.exists && snap.data() && snap.data().createdAt ? snap.data().createdAt : now,
      updatedAt: now,
    }, { merge: true });
  });
  return getWorkspaceProfile(userId);
}

module.exports = {
  COLLECTION,
  WORKSPACE_PROFILE_COLLECTION,
  docId,
  getLabKeys,
  mergeLabKeys,
  LIVE_ACTIVITY_EXECUTION_KEY,
  normalizeLiveActivityExecutionFields,
  getLiveActivityExecutionFields,
  mergeLiveActivityExecutionFields,
  getWorkspaceProfile,
  upsertWorkspaceProfile,
  verifyIdTokenFromRequest,
  verifyIdTokenClaimsFromRequest,
};
