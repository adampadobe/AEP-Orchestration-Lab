/**
 * Self-service MCP API keys — Firestore mcpApiKeys/{keyId} + mcpSandboxAllowlist/{keyId}.
 * Plaintext key returned only at creation; stored as SHA-256 hash.
 */

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

const KEYS_COLLECTION = 'mcpApiKeys';
const ALLOWLIST_COLLECTION = 'mcpSandboxAllowlist';
const MAX_ACTIVE_KEYS_PER_USER = 3;
const KEY_BYTE_LEN = 32;
const KEY_PREFIX_DISPLAY_LEN = 8;

let db;

function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function keyIdFromApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || ''), 'utf8').digest('hex').slice(0, 12);
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(String(apiKey || ''), 'utf8').digest('hex');
}

function timingSafeEqual(a, b) {
  const sa = String(a || '');
  const sb = String(b || '');
  if (sa.length !== sb.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
}

function normalizeSandboxList(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    const name = String(item || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function generatePlaintextKey() {
  return crypto.randomBytes(KEY_BYTE_LEN).toString('hex');
}

/** Stable 12-char id for Firestore doc + allowlist (unchanged on rotate). */
function generateStableKeyId() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Sandboxes a lab user may scope MCP keys to (workspace slug candidates).
 * @param {object | null} profile from labUserSandboxStore.getWorkspaceProfile
 */
function workspaceSandboxCandidates(profile) {
  const candidates = new Set();
  if (profile && profile.workspaceSlug) {
    const slug = normalizeLdapSlug(profile.workspaceSlug);
    if (slug) candidates.add(slug);
  }
  if (profile && profile.adobeEmail) {
    const fromEmail = ldapSlugFromEmail(
      profile.adobeEmail,
      profile.firstName,
      profile.lastName,
    );
    if (fromEmail) candidates.add(fromEmail);
  }
  return Array.from(candidates);
}

/**
 * @param {string[]} requested
 * @param {string[]} userCandidates workspace slug(s)
 * @param {string[]} [activeSandboxNames] optional Adobe active sandbox names
 */
function validateRequestedSandboxes(requested, userCandidates, activeSandboxNames) {
  const sandboxes = normalizeSandboxList(requested);
  if (sandboxes.length === 0) {
    throw Object.assign(new Error('At least one sandbox is required.'), { status: 400 });
  }
  const candidateSet = new Set(userCandidates.map((s) => String(s).toLowerCase()));
  if (candidateSet.size === 0) {
    throw Object.assign(
      new Error('Complete lab workspace profile (workspace slug) before generating an MCP key.'),
      { status: 400 },
    );
  }

  const activeSet = Array.isArray(activeSandboxNames) && activeSandboxNames.length > 0
    ? new Set(activeSandboxNames.map((s) => String(s).toLowerCase()))
    : null;

  for (const sb of sandboxes) {
    if (!candidateSet.has(sb)) {
      throw Object.assign(
        new Error(`Sandbox "${sb}" is not in your lab workspace. Allowed: ${Array.from(candidateSet).join(', ')}.`),
        { status: 403 },
      );
    }
    if (activeSet && !activeSet.has(sb)) {
      throw Object.assign(
        new Error(`Sandbox "${sb}" is not an active Adobe sandbox.`),
        { status: 400 },
      );
    }
  }
  return sandboxes;
}

function firestoreTimestampToIso(value) {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null;
}

function serializeKeyDoc(data) {
  if (!data) return null;
  return {
    keyId: String(data.keyId || ''),
    keyPrefix: String(data.keyPrefix || ''),
    allowedSandboxes: Array.isArray(data.allowedSandboxes) ? [...data.allowedSandboxes] : [],
    principalLabel: String(data.principalLabel || ''),
    createdAt: firestoreTimestampToIso(data.createdAt),
    rotatedAt: firestoreTimestampToIso(data.rotatedAt),
    lastUsedAt: firestoreTimestampToIso(data.lastUsedAt),
    revoked: !!data.revoked,
  };
}

/** Newest active key metadata (plaintext secret is never stored). */
function pickCurrentKey(keys) {
  const active = (Array.isArray(keys) ? keys : [])
    .filter((k) => k && !k.revoked)
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
  return active[0] || null;
}

async function countActiveKeysForUser(uid) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) return 0;
  const snap = await getDb()
    .collection(KEYS_COLLECTION)
    .where('principalUid', '==', userId)
    .get();
  let count = 0;
  for (const doc of snap.docs) {
    if (!doc.data()?.revoked) count += 1;
  }
  return count;
}

async function listKeysForUser(uid) {
  const userId = String(uid || '').trim().slice(0, 128);
  if (!userId) return [];
  const snap = await getDb()
    .collection(KEYS_COLLECTION)
    .where('principalUid', '==', userId)
    .get();
  const keys = snap.docs.map((doc) => serializeKeyDoc({ keyId: doc.id, ...doc.data() }));
  keys.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  return keys.slice(0, 20);
}

/**
 * @param {object} input
 * @param {string} input.uid
 * @param {string} input.email
 * @param {string} input.displayName
 * @param {string[]} input.sandboxes
 * @param {object | null} [input.profile]
 * @param {string[]} [input.activeSandboxNames]
 */
async function createKey(input) {
  const uid = String(input.uid || '').trim().slice(0, 128);
  if (!uid) throw Object.assign(new Error('uid is required'), { status: 400 });

  const activeCount = await countActiveKeysForUser(uid);
  if (activeCount >= MAX_ACTIVE_KEYS_PER_USER) {
    throw Object.assign(
      new Error(`Maximum ${MAX_ACTIVE_KEYS_PER_USER} active MCP keys per user. Revoke an existing key first.`),
      { status: 429 },
    );
  }

  const userCandidates = workspaceSandboxCandidates(input.profile || null);
  const allowedSandboxes = validateRequestedSandboxes(
    input.sandboxes,
    userCandidates,
    input.activeSandboxNames,
  );

  const plaintext = generatePlaintextKey();
  const keyId = generateStableKeyId();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, KEY_PREFIX_DISPLAY_LEN);
  const principalEmail = String(input.email || '').trim().toLowerCase().slice(0, 160);
  const principalLabel = String(input.displayName || principalEmail || uid).trim().slice(0, 120);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const keyDoc = {
    keyId,
    keyHash,
    keyPrefix,
    principalUid: uid,
    principalEmail,
    principalLabel,
    allowedSandboxes,
    revoked: false,
    createdAt: now,
    lastUsedAt: null,
  };

  const allowlistDoc = {
    allowedSandboxes,
    principalLabel,
    principalUid: uid,
    principalEmail,
    updatedAt: now,
  };

  const batch = getDb().batch();
  batch.set(getDb().collection(KEYS_COLLECTION).doc(keyId), keyDoc);
  batch.set(getDb().collection(ALLOWLIST_COLLECTION).doc(keyId), allowlistDoc);
  await batch.commit();

  return {
    key: plaintext,
    keyId,
    keyPrefix,
    allowedSandboxes,
    principalLabel,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Rotate an active key — same keyId / allowlist doc; new plaintext invalidates old secret immediately.
 * @param {string} uid
 * @param {string} keyId
 */
async function rotateKey(uid, keyId) {
  const userId = String(uid || '').trim().slice(0, 128);
  const id = String(keyId || '').trim().slice(0, 12);
  if (!userId || !id) {
    throw Object.assign(new Error('keyId is required'), { status: 400 });
  }

  const ref = getDb().collection(KEYS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('MCP key not found'), { status: 404 });
  }
  const data = snap.data() || {};
  if (String(data.principalUid || '') !== userId) {
    throw Object.assign(new Error('Not authorized to rotate this key'), { status: 403 });
  }
  if (data.revoked) {
    throw Object.assign(new Error('Cannot rotate a revoked key'), { status: 400 });
  }

  const plaintext = generatePlaintextKey();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, KEY_PREFIX_DISPLAY_LEN);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const allowedSandboxes = Array.isArray(data.allowedSandboxes) ? data.allowedSandboxes : [];

  const batch = getDb().batch();
  batch.update(ref, {
    keyHash,
    keyPrefix,
    rotatedAt: now,
    lastUsedAt: null,
  });
  batch.set(
    getDb().collection(ALLOWLIST_COLLECTION).doc(id),
    {
      allowedSandboxes,
      principalLabel: data.principalLabel || null,
      principalUid: data.principalUid,
      principalEmail: data.principalEmail || null,
      updatedAt: now,
    },
    { merge: true },
  );
  await batch.commit();

  return {
    key: plaintext,
    keyId: id,
    keyPrefix,
    allowedSandboxes,
    rotatedAt: new Date().toISOString(),
  };
}

async function revokeKey(uid, keyId) {
  const userId = String(uid || '').trim().slice(0, 128);
  const id = String(keyId || '').trim().slice(0, 12);
  if (!userId || !id) {
    throw Object.assign(new Error('keyId is required'), { status: 400 });
  }

  const ref = getDb().collection(KEYS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    throw Object.assign(new Error('MCP key not found'), { status: 404 });
  }
  const data = snap.data() || {};
  if (String(data.principalUid || '') !== userId) {
    throw Object.assign(new Error('Not authorized to revoke this key'), { status: 403 });
  }
  if (data.revoked) {
    return { ok: true, keyId: id, alreadyRevoked: true };
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = getDb().batch();
  batch.update(ref, { revoked: true, revokedAt: now });
  batch.delete(getDb().collection(ALLOWLIST_COLLECTION).doc(id));
  await batch.commit();
  return { ok: true, keyId: id, revoked: true };
}

/**
 * Validate a user-generated API key (for MCP server auth).
 * @param {string} apiKey
 * @returns {Promise<{ ok: true, keyId: string } | { ok: false }>}
 */
async function validateUserApiKey(apiKey) {
  const provided = String(apiKey || '').trim();
  if (!provided) return { ok: false };

  const keyHash = hashApiKey(provided);
  const snap = await getDb()
    .collection(KEYS_COLLECTION)
    .where('keyHash', '==', keyHash)
    .limit(1)
    .get();
  if (snap.empty) return { ok: false };

  const doc = snap.docs[0];
  const data = doc.data() || {};
  if (data.revoked) return { ok: false };
  if (!timingSafeEqual(data.keyHash, keyHash)) return { ok: false };

  doc.ref.update({ lastUsedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});

  return { ok: true, keyId: doc.id };
}

module.exports = {
  KEYS_COLLECTION,
  ALLOWLIST_COLLECTION,
  MAX_ACTIVE_KEYS_PER_USER,
  keyIdFromApiKey,
  hashApiKey,
  timingSafeEqual,
  normalizeSandboxList,
  workspaceSandboxCandidates,
  validateRequestedSandboxes,
  listKeysForUser,
  pickCurrentKey,
  generateStableKeyId,
  createKey,
  rotateKey,
  revokeKey,
  validateUserApiKey,
};
