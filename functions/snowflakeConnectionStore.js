/**
 * Per-lab-user and sandbox-shared Snowflake connection store.
 *
 * - Firestore: snowflakeConnections/{labUser__sandbox} — per-user non-secret config.
 * - Firestore: snowflakeConnections/_sandbox__{sandbox} — team sandbox-shared config
 *   (allowlisted sandboxes such as apalmer / kirkham).
 *
 * - Secret Manager per user: snowflake-cred-<labUserSlug>-<sandboxSlug>
 * - Secret Manager per sandbox (shared): snowflake-cred-sandbox-<sandboxSlug>
 *
 * Resolution order (GET / resolveConnection):
 *   1. User-specific (principalUid, sandbox) when hasCredential
 *   2. Else sandbox-shared doc/secret when present (eligible sandboxes only)
 *
 * Save on eligible sandboxes dual-writes the same payload to the sandbox-shared
 * copy so any browser / MCP principal on that sandbox sees hasCredential true.
 */

'use strict';

const admin = require('firebase-admin');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

const COLLECTION = 'snowflakeConnections';
const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'aep-orchestration-lab';
const SECRET_PREFIX = 'snowflake-cred';
const SHARED_DOC_PREFIX = '_sandbox__';

const ALLOWED_AUTH_METHODS = new Set(['password', 'pat', 'keyPair']);

const MAX = {
  account: 256,
  user: 128,
  role: 128,
  warehouse: 128,
  database: 128,
  schema: 128,
  credential: 16384,
  passphrase: 256,
};

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

let secretClient;
function getSecretClient() {
  if (!secretClient) secretClient = new SecretManagerServiceClient();
  return secretClient;
}

function safeSlug(value, fallback) {
  const v = String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 60);
  return v || fallback;
}

function docId(labUser, sandbox) {
  const u = safeSlug(labUser, 'anon');
  const s = safeSlug(sandbox, 'default');
  return `${u}__${s}`.slice(0, 700);
}

function sharedDocId(sandbox) {
  return `${SHARED_DOC_PREFIX}${safeSlug(sandbox, 'default')}`.slice(0, 700);
}

function secretId(labUser, sandbox, suffix) {
  const tail = suffix ? `-${suffix}` : '';
  return `${SECRET_PREFIX}-${safeSlug(labUser, 'anon')}-${safeSlug(sandbox, 'default')}${tail}`;
}

function sharedSecretId(sandbox, suffix) {
  const tail = suffix ? `-${suffix}` : '';
  return `${SECRET_PREFIX}-sandbox-${safeSlug(sandbox, 'default')}${tail}`;
}

function secretResourceName(labUser, sandbox, suffix) {
  return `projects/${PROJECT_ID}/secrets/${secretId(labUser, sandbox, suffix)}`;
}

function sharedSecretResourceName(sandbox, suffix) {
  return `projects/${PROJECT_ID}/secrets/${sharedSecretId(sandbox, suffix)}`;
}

/**
 * Team sandboxes whose Snowflake credential may be shared across lab users.
 * Matches technical sandbox names containing apalmer or kirkham.
 *
 * @param {string} sandbox
 * @returns {boolean}
 */
function isSandboxSharedEligible(sandbox) {
  const s = String(sandbox || '').toLowerCase();
  return s.includes('apalmer') || s.includes('kirkham');
}

function trimField(val, max) {
  if (val == null) return '';
  return String(val).trim().slice(0, max);
}

function pickAuthMethod(value, fallback) {
  return ALLOWED_AUTH_METHODS.has(value) ? value : fallback;
}

function pickNonEmpty(preferred, fallback) {
  const p = String(preferred == null ? '' : preferred).trim();
  if (p) return p;
  return String(fallback == null ? '' : fallback).trim();
}

/**
 * Merge user Firestore row + shared row for GET when user has no credential.
 * Prefers user non-secret fields when set; credential flags come from shared.
 *
 * @param {object} userCfg
 * @param {object} sharedCfg
 * @returns {object}
 */
function mergeUserConfigWithSharedFallback(userCfg, sharedCfg) {
  const u = userCfg || {};
  const sh = sharedCfg || {};
  return {
    sandbox: u.sandbox || sh.sandbox || '',
    labUser: u.labUser || '',
    docExists: !!u.docExists || !!sh.docExists,
    account: pickNonEmpty(u.account, sh.account),
    user: pickNonEmpty(u.user, sh.user),
    role: pickNonEmpty(u.role, sh.role),
    warehouse: pickNonEmpty(u.warehouse, sh.warehouse),
    database: pickNonEmpty(u.database, sh.database),
    schema: pickNonEmpty(u.schema, sh.schema),
    authMethod: pickAuthMethod(u.authMethod, pickAuthMethod(sh.authMethod, 'password')),
    hasCredential: !!sh.hasCredential,
    hasPassphrase: !!sh.hasPassphrase,
    credentialSetAt: sh.credentialSetAt || u.credentialSetAt || null,
    updatedAt: sh.updatedAt || u.updatedAt || null,
    updatedBy: sh.updatedBy || u.updatedBy || null,
    credentialScope: 'sandbox_shared',
  };
}

async function secretExistsAt(resourceName) {
  try {
    await getSecretClient().getSecret({ name: resourceName });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

async function secretExists(labUser, sandbox, suffix) {
  return secretExistsAt(secretResourceName(labUser, sandbox, suffix));
}

async function sharedSecretExists(sandbox, suffix) {
  return secretExistsAt(sharedSecretResourceName(sandbox, suffix));
}

async function readSecretAt(resourceName) {
  const name = `${resourceName}/versions/latest`;
  try {
    const [version] = await getSecretClient().accessSecretVersion({ name });
    const data = version && version.payload && version.payload.data;
    return data ? Buffer.from(data).toString('utf8') : '';
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return '';
    throw e;
  }
}

async function readSecret(labUser, sandbox, suffix) {
  return readSecretAt(secretResourceName(labUser, sandbox, suffix));
}

async function readSharedSecret(sandbox, suffix) {
  return readSecretAt(sharedSecretResourceName(sandbox, suffix));
}

async function writeSecretAt(resourceName, id, value, labels) {
  const client = getSecretClient();
  const parent = `projects/${PROJECT_ID}`;
  try {
    await client.getSecret({ name: resourceName });
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) {
      await client.createSecret({
        parent,
        secretId: id,
        secret: {
          replication: { automatic: {} },
          labels: labels || {},
        },
      });
    } else {
      throw e;
    }
  }
  const [version] = await client.addSecretVersion({
    parent: resourceName,
    payload: { data: Buffer.from(value, 'utf8') },
  });
  return version && version.name;
}

async function writeSecret(labUser, sandbox, value, suffix) {
  return writeSecretAt(
    secretResourceName(labUser, sandbox, suffix),
    secretId(labUser, sandbox, suffix),
    value,
    {
      app: 'snowflake-cred',
      lab_user: safeSlug(labUser, 'anon'),
      sandbox: safeSlug(sandbox, 'default'),
      suffix: suffix ? safeSlug(suffix, 'main') : 'main',
    }
  );
}

async function writeSharedSecret(sandbox, value, suffix) {
  return writeSecretAt(
    sharedSecretResourceName(sandbox, suffix),
    sharedSecretId(sandbox, suffix),
    value,
    {
      app: 'snowflake-cred',
      scope: 'sandbox_shared',
      sandbox: safeSlug(sandbox, 'default'),
      suffix: suffix ? safeSlug(suffix, 'main') : 'main',
    }
  );
}

async function deleteSecretIfExistsAt(resourceName) {
  try {
    await getSecretClient().deleteSecret({ name: resourceName });
    return true;
  } catch (e) {
    if (e && (e.code === 5 || /NOT_FOUND/i.test(String(e.message)))) return false;
    throw e;
  }
}

async function deleteSecretIfExists(labUser, sandbox, suffix) {
  return deleteSecretIfExistsAt(secretResourceName(labUser, sandbox, suffix));
}

async function deleteSharedSecretIfExists(sandbox, suffix) {
  return deleteSecretIfExistsAt(sharedSecretResourceName(sandbox, suffix));
}

async function readDocRecord(ref, labUser, sandbox) {
  const snap = await ref.get();
  const data = (snap.exists ? snap.data() : null) || {};
  const authMethod = pickAuthMethod(data.authMethod, 'password');
  return {
    sandbox: sTrim(sandbox),
    labUser: sTrim(labUser),
    docExists: snap.exists,
    account: data.account || '',
    user: data.user || '',
    role: data.role || '',
    warehouse: data.warehouse || '',
    database: data.database || '',
    schema: data.schema || '',
    authMethod,
    credentialSetAt: data.credentialSetAt || null,
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
  };
}

function sTrim(v) {
  return String(v || '').trim();
}

async function attachCredentialFlags(record, labUser, sandbox, { shared }) {
  const authMethod = pickAuthMethod(record.authMethod, 'password');
  const [hasCredential, hasPassphrase] = await Promise.all([
    shared ? sharedSecretExists(sandbox, '') : secretExists(labUser, sandbox, ''),
    authMethod === 'keyPair'
      ? (shared ? sharedSecretExists(sandbox, 'pass') : secretExists(labUser, sandbox, 'pass'))
      : Promise.resolve(false),
  ]);
  return {
    ...record,
    authMethod,
    hasCredential,
    hasPassphrase,
    credentialScope: shared ? 'sandbox_shared' : 'user',
  };
}

async function getUserDocConfig(labUser, sandbox) {
  const u = sTrim(labUser);
  const s = sTrim(sandbox);
  if (!s) throw new Error('sandbox is required');
  const ref = getDb().collection(COLLECTION).doc(docId(u, s));
  const base = await readDocRecord(ref, u, s);
  return attachCredentialFlags(base, u, s, { shared: false });
}

async function getSharedDocConfig(sandbox) {
  const s = sTrim(sandbox);
  if (!s) throw new Error('sandbox is required');
  const ref = getDb().collection(COLLECTION).doc(sharedDocId(s));
  const base = await readDocRecord(ref, '_sandbox', s);
  return attachCredentialFlags(base, '_sandbox', s, { shared: true });
}

/**
 * Copy user credential + config to sandbox-shared store (lazy migration).
 *
 * @param {string} labUser
 * @param {string} sandbox
 * @param {object} userCfg
 */
async function migrateUserCredentialToShared(labUser, sandbox, userCfg) {
  if (!isSandboxSharedEligible(sandbox)) return;
  if (!userCfg || !userCfg.hasCredential) return;
  const sharedCfg = await getSharedDocConfig(sandbox);
  if (sharedCfg.hasCredential) return;

  const credential = await readSecret(labUser, sandbox, '');
  if (credential) await writeSharedSecret(sandbox, credential, '');
  if (userCfg.hasPassphrase) {
    const pass = await readSecret(labUser, sandbox, 'pass');
    if (pass) await writeSharedSecret(sandbox, pass, 'pass');
  }

  const ref = getDb().collection(COLLECTION).doc(sharedDocId(sandbox));
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(
    {
      sandbox,
      labUser: '_sandbox',
      account: userCfg.account || '',
      user: userCfg.user || '',
      role: userCfg.role || '',
      warehouse: userCfg.warehouse || '',
      database: userCfg.database || '',
      schema: userCfg.schema || '',
      authMethod: userCfg.authMethod || 'password',
      credentialSetAt: userCfg.credentialSetAt || new Date().toISOString(),
      updatedAt: now,
      updatedBy: labUser || 'migration',
      migratedFrom: docId(labUser, sandbox),
    },
    { merge: true }
  );
}

/**
 * Read the public (non-secret) config for a given lab user + sandbox.
 * Falls back to sandbox-shared credential on allowlisted sandboxes.
 *
 * @param {string} labUser
 * @param {string} sandbox
 */
async function getConfig(labUser, sandbox) {
  const userCfg = await getUserDocConfig(labUser, sandbox);

  if (userCfg.hasCredential) {
    await migrateUserCredentialToShared(labUser, sandbox, userCfg);
    return { ...userCfg, credentialScope: 'user' };
  }

  if (isSandboxSharedEligible(sandbox)) {
    const sharedCfg = await getSharedDocConfig(sandbox);
    if (sharedCfg.hasCredential) {
      return mergeUserConfigWithSharedFallback(userCfg, sharedCfg);
    }
  }

  return { ...userCfg, credentialScope: 'user' };
}

async function applyCredentialPayload(labUser, sandbox, payload, nextAuthMethod, { shared }) {
  const p = payload && typeof payload === 'object' ? payload : {};

  if (p.clearCredential) {
    if (shared) {
      await deleteSharedSecretIfExists(sandbox, '');
      await deleteSharedSecretIfExists(sandbox, 'pass');
    } else {
      await deleteSecretIfExists(labUser, sandbox, '');
      await deleteSecretIfExists(labUser, sandbox, 'pass');
    }
    return { credentialSetAt: null };
  }

  const patch = {};
  if (typeof p.credential === 'string' && p.credential.trim().length > 0) {
    const cred = p.credential.slice(0, MAX.credential);
    if (shared) await writeSharedSecret(sandbox, cred, '');
    else await writeSecret(labUser, sandbox, cred, '');
    patch.credentialSetAt = new Date().toISOString();
    if (nextAuthMethod === 'keyPair') {
      if (typeof p.keyPassphrase === 'string' && p.keyPassphrase.length > 0) {
        const pass = p.keyPassphrase.slice(0, MAX.passphrase);
        if (shared) await writeSharedSecret(sandbox, pass, 'pass');
        else await writeSecret(labUser, sandbox, pass, 'pass');
      } else if (p.clearKeyPassphrase) {
        if (shared) await deleteSharedSecretIfExists(sandbox, 'pass');
        else await deleteSecretIfExists(labUser, sandbox, 'pass');
      }
    } else if (shared) {
      await deleteSharedSecretIfExists(sandbox, 'pass');
    } else {
      await deleteSecretIfExists(labUser, sandbox, 'pass');
    }
  } else if (typeof p.keyPassphrase === 'string' && p.keyPassphrase.length > 0 && nextAuthMethod === 'keyPair') {
    const pass = p.keyPassphrase.slice(0, MAX.passphrase);
    if (shared) await writeSharedSecret(sandbox, pass, 'pass');
    else await writeSecret(labUser, sandbox, pass, 'pass');
  } else if (p.clearKeyPassphrase) {
    if (shared) await deleteSharedSecretIfExists(sandbox, 'pass');
    else await deleteSecretIfExists(labUser, sandbox, 'pass');
  }

  return patch;
}

async function updateConfigDoc(ref, labUser, sandbox, payload, identityLabel) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const now = admin.firestore.FieldValue.serverTimestamp();
  const set = {
    sandbox,
    labUser: identityLabel || labUser,
    updatedAt: now,
    updatedBy: labUser || 'anon',
  };

  if (p.account !== undefined) set.account = trimField(p.account, MAX.account);
  if (p.user !== undefined) set.user = trimField(p.user, MAX.user);
  if (p.role !== undefined) set.role = trimField(p.role, MAX.role);
  if (p.warehouse !== undefined) set.warehouse = trimField(p.warehouse, MAX.warehouse);
  if (p.database !== undefined) set.database = trimField(p.database, MAX.database);
  if (p.schema !== undefined) set.schema = trimField(p.schema, MAX.schema);

  let nextAuthMethod;
  if (p.authMethod !== undefined) {
    if (!ALLOWED_AUTH_METHODS.has(p.authMethod)) {
      throw new Error(`authMethod must be one of ${[...ALLOWED_AUTH_METHODS].join(', ')}`);
    }
    nextAuthMethod = p.authMethod;
    set.authMethod = nextAuthMethod;
  } else {
    const snap = await ref.get();
    nextAuthMethod = pickAuthMethod((snap.exists && snap.data() && snap.data().authMethod) || '', 'password');
  }

  const credPatch = await applyCredentialPayload(labUser, sandbox, p, nextAuthMethod, { shared: false });
  Object.assign(set, credPatch);
  await ref.set(set, { merge: true });
  return nextAuthMethod;
}

async function updateSharedConfigDoc(sandbox, payload, updatedBy) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const ref = getDb().collection(COLLECTION).doc(sharedDocId(sandbox));
  const now = admin.firestore.FieldValue.serverTimestamp();
  const set = {
    sandbox,
    labUser: '_sandbox',
    updatedAt: now,
    updatedBy: updatedBy || 'anon',
  };

  if (p.account !== undefined) set.account = trimField(p.account, MAX.account);
  if (p.user !== undefined) set.user = trimField(p.user, MAX.user);
  if (p.role !== undefined) set.role = trimField(p.role, MAX.role);
  if (p.warehouse !== undefined) set.warehouse = trimField(p.warehouse, MAX.warehouse);
  if (p.database !== undefined) set.database = trimField(p.database, MAX.database);
  if (p.schema !== undefined) set.schema = trimField(p.schema, MAX.schema);

  let nextAuthMethod;
  if (p.authMethod !== undefined) {
    if (!ALLOWED_AUTH_METHODS.has(p.authMethod)) {
      throw new Error(`authMethod must be one of ${[...ALLOWED_AUTH_METHODS].join(', ')}`);
    }
    nextAuthMethod = p.authMethod;
    set.authMethod = nextAuthMethod;
  } else {
    const snap = await ref.get();
    nextAuthMethod = pickAuthMethod((snap.exists && snap.data() && snap.data().authMethod) || '', 'password');
  }

  const credPatch = await applyCredentialPayload(updatedBy, sandbox, p, nextAuthMethod, { shared: true });
  Object.assign(set, credPatch);
  await ref.set(set, { merge: true });
}

/**
 * Apply a mutation to a lab user's Snowflake config in a sandbox.
 * On allowlisted sandboxes, also dual-writes to the sandbox-shared copy.
 *
 * @param {string} labUser
 * @param {string} sandbox
 * @param {object} payload
 */
async function updateConfig(labUser, sandbox, payload) {
  const u = sTrim(labUser);
  const s = sTrim(sandbox);
  if (!s) throw new Error('sandbox is required');
  const p = payload && typeof payload === 'object' ? payload : {};

  const ref = getDb().collection(COLLECTION).doc(docId(u, s));
  await updateConfigDoc(ref, u, s, p, u);

  if (isSandboxSharedEligible(s)) {
    await updateSharedConfigDoc(s, p, u);
  }

  return getConfig(u, s);
}

/**
 * One-time migration: copy anonymous-browser Snowflake config to authenticated Portal uid.
 * Skips when the authenticated user already has config/credential. Best-effort shared copy
 * on eligible sandboxes when shared store is still empty.
 *
 * @param {string} anonymousUid
 * @param {string} authenticatedUid
 * @param {string} sandbox
 * @returns {Promise<{ migrated: boolean, from?: string, to?: string, reason?: string }>}
 */
async function migrateAnonymousConfigToAuthenticated(anonymousUid, authenticatedUid, sandbox) {
  const anon = sTrim(anonymousUid);
  const auth = sTrim(authenticatedUid);
  const s = sTrim(sandbox);
  if (!anon || !auth || !s || anon === auth) {
    return { migrated: false, reason: 'invalid_uids' };
  }

  const authCfg = await getUserDocConfig(auth, s);
  if (authCfg.hasCredential) return { migrated: false, reason: 'auth_has_credential' };
  if (authCfg.docExists && authCfg.account) return { migrated: false, reason: 'auth_has_doc' };

  const anonCfg = await getUserDocConfig(anon, s);
  if (!anonCfg.docExists && !anonCfg.hasCredential) {
    return { migrated: false, reason: 'anon_empty' };
  }

  if (anonCfg.hasCredential) {
    const credential = await readSecret(anon, s, '');
    if (credential) await writeSecret(auth, s, credential, '');
    if (anonCfg.hasPassphrase) {
      const pass = await readSecret(anon, s, 'pass');
      if (pass) await writeSecret(auth, s, pass, 'pass');
    }
  }

  const anonRef = getDb().collection(COLLECTION).doc(docId(anon, s));
  const anonSnap = await anonRef.get();
  if (anonSnap.exists) {
    const data = anonSnap.data() || {};
    const authRef = getDb().collection(COLLECTION).doc(docId(auth, s));
    const now = admin.firestore.FieldValue.serverTimestamp();
    await authRef.set(
      {
        sandbox: s,
        labUser: auth,
        account: data.account || '',
        user: data.user || '',
        role: data.role || '',
        warehouse: data.warehouse || '',
        database: data.database || '',
        schema: data.schema || '',
        authMethod: pickAuthMethod(data.authMethod, 'password'),
        credentialSetAt: data.credentialSetAt || null,
        updatedAt: now,
        updatedBy: auth,
        migratedFromAnonymous: anon,
      },
      { merge: true }
    );
  }

  if (isSandboxSharedEligible(s)) {
    const afterAuth = await getUserDocConfig(auth, s);
    await migrateUserCredentialToShared(auth, s, afterAuth);
    const sharedCfg = await getSharedDocConfig(s);
    if (!sharedCfg.hasCredential && anonCfg.hasCredential) {
      await migrateUserCredentialToShared(anon, s, anonCfg);
    }
  }

  return { migrated: true, from: anon, to: auth };
}

/**
 * Resolve the connection material for a given lab user + sandbox so the
 * caller can open a Snowflake connection. Returns null if no credential
 * has been stored yet (user or sandbox-shared).
 *
 * @param {string} labUser
 * @param {string} sandbox
 */
async function resolveConnection(labUser, sandbox) {
  const cfg = await getConfig(labUser, sandbox);
  if (!cfg.hasCredential) return null;

  const useShared = cfg.credentialScope === 'sandbox_shared';
  const credential = useShared
    ? await readSharedSecret(sandbox, '')
    : await readSecret(labUser, sandbox, '');
  if (!credential) return null;

  let passphrase = '';
  if (cfg.authMethod === 'keyPair' && cfg.hasPassphrase) {
    passphrase = useShared
      ? await readSharedSecret(sandbox, 'pass')
      : await readSecret(labUser, sandbox, 'pass');
  }

  return {
    config: cfg,
    credential,
    passphrase,
  };
}

module.exports = {
  COLLECTION,
  SHARED_DOC_PREFIX,
  ALLOWED_AUTH_METHODS,
  docId,
  sharedDocId,
  sharedSecretId,
  isSandboxSharedEligible,
  mergeUserConfigWithSharedFallback,
  migrateAnonymousConfigToAuthenticated,
  getConfig,
  updateConfig,
  resolveConnection,
};
