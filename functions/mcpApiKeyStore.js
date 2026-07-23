/**
 * Self-service MCP API keys — Firestore mcpApiKeys/{keyId} + mcpSandboxAllowlist/{keyId}.
 * Multiple active keys per principalUid + sandbox. Plaintext returned only at create/rotate.
 */

const crypto = require('node:crypto');
const admin = require('firebase-admin');
const { ldapSlugFromEmail, normalizeLdapSlug } = require('./labRtdbSlug');

const KEYS_COLLECTION = 'mcpApiKeys';
const ALLOWLIST_COLLECTION = 'mcpSandboxAllowlist';
const KEY_BYTE_LEN = 32;
const KEY_PREFIX_DISPLAY_LEN = 8;
const MAX_ACTIVE_KEYS_PER_SANDBOX = 10;
const DEFAULT_KEY_LABEL = 'MCP key';

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

function normalizeSandboxName(raw) {
  const list = normalizeSandboxList([raw]);
  return list[0] || '';
}

function normalizeKeyLabel(raw) {
  return String(raw || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

/** Derive primary sandbox from key doc (new `sandbox` field or legacy allowedSandboxes). */
function deriveSandboxFromKeyData(data) {
  if (!data || typeof data !== 'object') return '';
  const direct = normalizeSandboxName(data.sandbox);
  if (direct) return direct;
  const allowed = normalizeSandboxList(data.allowedSandboxes);
  return allowed.length === 1 ? allowed[0] : (allowed[0] || '');
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
 * @param {{ email?: string, displayName?: string }} [authContext] Firebase Auth email when profile incomplete
 */
function workspaceSandboxCandidates(profile, authContext) {
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
  const authEmail = authContext && authContext.email ? String(authContext.email).trim().toLowerCase() : '';
  if (authEmail) {
    const fromAuthEmail = ldapSlugFromEmail(authEmail, '', '');
    if (fromAuthEmail) candidates.add(fromAuthEmail);
  }
  return Array.from(candidates);
}

/**
 * @param {string[]} requested
 * @param {string[]} userCandidates workspace slug(s)
 * @param {string[] | null | undefined} [activeSandboxNames] optional Adobe active sandbox names
 * @param {{ trustedLabUser?: boolean }} [options]
 */
function validateRequestedSandboxes(requested, userCandidates, activeSandboxNames, options) {
  const sandboxes = normalizeSandboxList(requested);
  if (sandboxes.length === 0) {
    throw Object.assign(new Error('At least one sandbox is required.'), { status: 400 });
  }

  const activeSet = Array.isArray(activeSandboxNames) && activeSandboxNames.length > 0
    ? new Set(activeSandboxNames.map((s) => String(s).toLowerCase()))
    : null;

  if (activeSet) {
    for (const sb of sandboxes) {
      if (!activeSet.has(sb)) {
        throw Object.assign(
          new Error(`Sandbox "${sb}" is not an active Adobe sandbox.`),
          { status: 400 },
        );
      }
    }
    return sandboxes;
  }

  if (options && options.trustedLabUser) {
    return sandboxes;
  }

  const candidateSet = new Set(userCandidates.map((s) => String(s).toLowerCase()));
  if (candidateSet.size === 0) {
    throw Object.assign(
      new Error(
        'Could not derive workspace scope from your profile. Generate a key anyway after selecting your sandbox — Coworker can run lab_mcp_first_run_setup on first connect.',
      ),
      { status: 400, code: 'workspace_profile_incomplete' },
    );
  }

  for (const sb of sandboxes) {
    if (!candidateSet.has(sb)) {
      throw Object.assign(
        new Error(`Sandbox "${sb}" is not in your lab workspace. Allowed: ${Array.from(candidateSet).join(', ')}. Coworker can align scope via lab_mcp_first_run_setup.`),
        { status: 403 },
      );
    }
  }
  return sandboxes;
}

/**
 * Validate a single sandbox for per-sandbox key creation.
 * @param {string} sandbox
 * @param {string[]} userCandidates
 * @param {string[]} [activeSandboxNames]
 */
function validateSingleSandbox(sandbox, userCandidates, activeSandboxNames, options) {
  const name = normalizeSandboxName(sandbox);
  if (!name) {
    throw Object.assign(new Error('sandbox is required.'), { status: 400 });
  }
  const validated = validateRequestedSandboxes([name], userCandidates, activeSandboxNames, options);
  return validated[0];
}

function firestoreTimestampToIso(value) {
  return value && typeof value.toDate === 'function' ? value.toDate().toISOString() : null;
}

function serializeKeyDoc(data) {
  if (!data) return null;
  const sandbox = deriveSandboxFromKeyData(data);
  const allowedSandboxes = sandbox
    ? [sandbox]
    : (Array.isArray(data.allowedSandboxes) ? [...data.allowedSandboxes] : []);
  return {
    keyId: String(data.keyId || ''),
    keyPrefix: String(data.keyPrefix || ''),
    sandbox,
    allowedSandboxes,
    keyLabel: normalizeKeyLabel(data.keyLabel) || DEFAULT_KEY_LABEL,
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

function countActiveKeysForSandbox(keys, sandbox) {
  const sb = normalizeSandboxName(sandbox);
  if (!sb) return 0;
  return (Array.isArray(keys) ? keys : []).filter((key) => (
    key &&
    !key.revoked &&
    (normalizeSandboxName(key.sandbox) || deriveSandboxFromKeyData(key)) === sb
  )).length;
}

/**
 * Newest active key for a specific sandbox.
 * @param {object[]} keys serialized keys
 * @param {string} sandbox
 */
function pickKeyForSandbox(keys, sandbox) {
  const sb = normalizeSandboxName(sandbox);
  if (!sb) return null;
  const active = (Array.isArray(keys) ? keys : [])
    .filter((key) => {
      if (!key || key.revoked) return false;
      const keySb = normalizeSandboxName(key.sandbox) || deriveSandboxFromKeyData(key);
      return keySb === sb;
    })
    .sort((a, b) => {
      const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
      const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
      return tb - ta;
    });
  return active[0] || null;
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
    const sa = String(a.sandbox || '');
    const sb = String(b.sandbox || '');
    if (sa !== sb) return sa < sb ? -1 : 1;
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
  return keys.slice(0, 50);
}

/**
 * @param {object} input
 * @param {string} input.uid
 * @param {string} input.email
 * @param {string} input.displayName
 * @param {string} input.sandbox
 * @param {string} [input.keyLabel]
 * @param {object | null} [input.profile]
 * @param {string[]} [input.activeSandboxNames]
 */
async function createKey(input) {
  const uid = String(input.uid || '').trim().slice(0, 128);
  if (!uid) throw Object.assign(new Error('uid is required'), { status: 400 });

  const userCandidates = workspaceSandboxCandidates(input.profile || null, {
    email: input.email,
    displayName: input.displayName,
  });
  const sandbox = validateSingleSandbox(
    input.sandbox,
    userCandidates,
    input.activeSandboxNames,
    { trustedLabUser: input.trustedLabUser === true },
  );

  const allowedSandboxes = [sandbox];
  const keyLabel = normalizeKeyLabel(input.keyLabel) || DEFAULT_KEY_LABEL;
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
    keyLabel,
    sandbox,
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

  const firestore = getDb();
  const keyRef = firestore.collection(KEYS_COLLECTION).doc(keyId);
  const allowlistRef = firestore.collection(ALLOWLIST_COLLECTION).doc(keyId);
  const userKeysQuery = firestore
    .collection(KEYS_COLLECTION)
    .where('principalUid', '==', uid);

  await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(userKeysQuery);
    const activeKeyCount = countActiveKeysForSandbox(
      snap.docs.map((doc) => doc.data() || {}),
      sandbox,
    );
    if (activeKeyCount >= MAX_ACTIVE_KEYS_PER_SANDBOX) {
      throw Object.assign(
        new Error(
          `Sandbox "${sandbox}" already has the maximum of ${MAX_ACTIVE_KEYS_PER_SANDBOX} active MCP keys. Revoke an unused key first.`,
        ),
        { status: 409 },
      );
    }
    transaction.set(keyRef, keyDoc);
    transaction.set(allowlistRef, allowlistDoc);
  });

  return {
    key: plaintext,
    keyId,
    keyPrefix,
    sandbox,
    allowedSandboxes,
    keyLabel,
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

  const sandbox = deriveSandboxFromKeyData(data);
  const allowedSandboxes = sandbox ? [sandbox] : normalizeSandboxList(data.allowedSandboxes);
  const plaintext = generatePlaintextKey();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, KEY_PREFIX_DISPLAY_LEN);
  const now = admin.firestore.FieldValue.serverTimestamp();

  const batch = getDb().batch();
  batch.update(ref, {
    keyHash,
    keyPrefix,
    rotatedAt: now,
    lastUsedAt: null,
    ...(sandbox ? { sandbox, allowedSandboxes } : {}),
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
    sandbox,
    allowedSandboxes,
    keyLabel: normalizeKeyLabel(data.keyLabel) || DEFAULT_KEY_LABEL,
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
  return { ok: true, keyId: id, revoked: true, sandbox: deriveSandboxFromKeyData(data) };
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

  return {
    ok: true,
    keyId: doc.id,
    principalUid: String(data.principalUid || '').trim().slice(0, 128),
    principalEmail: data.principalEmail ? String(data.principalEmail) : null,
    sandbox: deriveSandboxFromKeyData(data),
  };
}

module.exports = {
  KEYS_COLLECTION,
  ALLOWLIST_COLLECTION,
  keyIdFromApiKey,
  hashApiKey,
  timingSafeEqual,
  normalizeSandboxList,
  normalizeSandboxName,
  normalizeKeyLabel,
  deriveSandboxFromKeyData,
  workspaceSandboxCandidates,
  validateRequestedSandboxes,
  validateSingleSandbox,
  listKeysForUser,
  pickCurrentKey,
  pickKeyForSandbox,
  countActiveKeysForSandbox,
  generateStableKeyId,
  MAX_ACTIVE_KEYS_PER_SANDBOX,
  createKey,
  rotateKey,
  revokeKey,
  validateUserApiKey,
};
